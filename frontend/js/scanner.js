/**
 * frontend/js/scanner.js
 * ──────────────────────────────────────────────────────────────
 * Handles everything camera-related:
 *  - Webcam start / stop
 *  - MediaPipe Pose initialisation & frame loop
 *  - In-frame assessment (out / partial / in)
 *  - Frame banner & guide-box colour feedback
 *  - Auto-countdown once user is in range
 *  - Collecting pose readings over 5 seconds
 *  - Calling finalizeResults() when scan completes
 *
 * Depends on: model/bodyMetrics.js (lookupWeight)
 * Calls:      ui.js → finalizeResults(readings)
 */

'use strict';

// ── DOM refs ──────────────────────────────────────────────────
const video    = document.getElementById('webcam');
const canvas   = document.getElementById('overlay');
const ctx      = canvas.getContext('2d');
const banner   = document.getElementById('frame-banner');
const guideBox = document.getElementById('guide-box');

// ── State ─────────────────────────────────────────────────────
let stream          = null;
let poseDetector    = null;
let camUtil         = null;
let scanning        = false;
let countdown       = 5;
let readings        = [];
let cTimer          = null;
let inFrameFrames   = 0;
let autoStarted     = false;

const SCAN_SECS          = 5;
const IN_FRAME_THRESHOLD = 8; // ~1 second of good frames before auto-start

// ── Status bar helper ─────────────────────────────────────────
function setStatus(msg, state) {
  document.getElementById('stxt').textContent = msg;
  const d = document.getElementById('sdot');
  d.className = 'status-dot' + (state ? ' ' + state : '');
}

// ── Canvas resize ─────────────────────────────────────────────
function resizeCvs() {
  canvas.width  = video.videoWidth  || video.clientWidth;
  canvas.height = video.videoHeight || video.clientHeight;
}

// ── In-frame assessment ───────────────────────────────────────
// Returns 'in' | 'partial' | 'out'
function assessFrame(lm) {
  if (!lm) return 'out';
  const nose = lm[0], lFoot = lm[31], rFoot = lm[32];
  const hasHead    = nose && nose.visibility > 0.6;
  const hasFeet    = lFoot && rFoot && lFoot.visibility > 0.5 && rFoot.visibility > 0.5;

  // Header and Ground clearance
  const headClear  = nose && nose.y > 0.03 && nose.y < 0.25;
  const feetClear  = lFoot && lFoot.y > 0.8 && lFoot.y < 1.0; // Ensures toes aren't cut off

  const bodySpan   = lFoot ? Math.abs((nose ? nose.y : 0) - lFoot.y) : 0;
  const goodSpan   = bodySpan > 0.55;

  if (hasHead && hasFeet && headClear && feetClear && goodSpan) return 'in';
  if (hasHead && hasFeet) return 'partial';
  return 'out';
}

// ── Update banner & guide box ─────────────────────────────────
function updateFrameBanner(state, lm) {
  guideBox.className = 'guide-box';
  banner.id          = 'frame-banner'; // preserve id

  if (state === 'in') {
    banner.className = 'frame-banner in';
    guideBox.classList.add('ok');
    banner.innerHTML = '✔ &nbsp;Perfect! Hold still — scanning starts automatically';
  } else if (state === 'partial') {
    let hint = 'Partial body detected';
    if (lm) {
      const nose = lm[0], lAnk = lm[27];
      if (nose && nose.y > 0.25)               hint = '⬆ Step back or lower the camera — head cut off';
      else if (!lAnk || lAnk.visibility < 0.5) hint = '⬇ Move back so feet are visible';
      else if (lAnk && lAnk.y < 0.7)           hint = '⬇ Move back — feet too high in frame';
      else                                      hint = '↔ Centre yourself in the guide box';
    }
    banner.className = 'frame-banner partial';
    banner.innerHTML = '⚠ &nbsp;' + hint;
    guideBox.classList.add('warn');
  } else {
    const hint = lm ? '⬇ Move back — body not fully visible' : '🚶 Step into the guide box';
    banner.className = 'frame-banner out';
    banner.innerHTML = '⬤ &nbsp;' + hint;
    guideBox.classList.add('bad');
  }
}

// ── Pose estimation ───────────────────────────────────────────
function estimatePose(lm) {
  const nose = lm[0], lAnk = lm[27], rAnk = lm[28], lFoot = lm[31], rFoot = lm[32];
  const lSho = lm[11], rSho = lm[12], lHip = lm[23], rHip = lm[24];
  if (!nose || !lFoot || !rFoot || !lSho || !rSho) return null;

  // 1. Calculate ground contact (using Foot Index landmarks for better ground alignment)
  const groundY = (lFoot.y + rFoot.y) / 2;

  // 2. Estimate the "Vertex" (top of head).
  // Anatomically, nose-to-crown is ~1.2-1.3x the distance from nose to shoulder-line.
  const shoY   = (lSho.y + rSho.y) / 2;
  const headToSho = Math.abs(shoY - nose.y);
  const crownY = nose.y - (headToSho * 1.25);

  // 3. Physical span in normalized coordinates
  const span = Math.abs(groundY - crownY);
  if (span < 0.15) return null;

  // 4. Geometry calculation (FOV projection)
  const dist   = parseInt(document.getElementById('dist').value);
  const fov    = 60 * Math.PI / 180;
  const frameH = 2 * dist * Math.tan(fov / 2);
  const heightCm = span * frameH;

  const hipW = Math.abs((lHip.x || 0) - (rHip.x || 0));
  const shoW = Math.abs((lSho.x || 0) - (rSho.x || 0));

  const gender = document.getElementById('gender').value;
  const looked = window.lookupWeight(heightCm, gender);
  if (!looked) return null;

  return { height: heightCm, weight: looked.weight, bmi: looked.bmi, shoW, hipW };
}

// ── MediaPipe results callback ────────────────────────────────
function onResults(results) {
  resizeCvs();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const lm         = results.poseLandmarks || null;
  const frameState = assessFrame(lm);
  updateFrameBanner(frameState, lm);

  if (lm) {
    const skeletonColor = frameState === 'in'      ? 'rgba(0,191,255,0.7)'
                        : frameState === 'partial' ? 'rgba(255,213,79,0.6)'
                                                   : 'rgba(244,67,54,0.5)';
    drawConnectors(ctx, lm, POSE_CONNECTIONS, { color: skeletonColor, lineWidth: 2 });
    drawLandmarks(ctx, lm,  { color: skeletonColor, fillColor: 'rgba(0,0,0,0.6)', radius: 3 });

    if (frameState === 'in') {
      const est = estimatePose(lm);
      if (est) {
        document.getElementById('live-h').textContent = Math.round(est.height);
        document.getElementById('live-w').textContent = Math.round(est.weight);
      }
    } else {
      document.getElementById('live-h').textContent = '--';
      document.getElementById('live-w').textContent = '--';
    }
  } else {
    document.getElementById('live-h').textContent = '--';
    document.getElementById('live-w').textContent = '--';
  }

  // Auto-start logic — accumulate good frames, fire countdown once threshold hit
  if (!scanning && !autoStarted && stream) {
    if (frameState === 'in') {
      inFrameFrames++;
      if (inFrameFrames >= IN_FRAME_THRESHOLD) {
        autoStarted = true;
        beginCountdown();
      }
    } else {
      if (inFrameFrames > 0) inFrameFrames = Math.max(0, inFrameFrames - 2);
    }
  }

  if (scanning) {
    if (lm) {
      const est = estimatePose(lm);
      if (est) readings.push(est);
      setStatus('Scanning… ' + countdown + 's remaining', 'g');
    } else {
      setStatus('Stay in frame! ' + countdown + 's remaining', 'y');
    }
  }
}

// ── Countdown ─────────────────────────────────────────────────
function beginCountdown() {
  if (scanning) return;
  console.log("🤖 [Vision ML] beginCountdown(): Initiating constant pose-tracking for 5 seconds...");
  scanning  = true;
  countdown = SCAN_SECS;
  readings  = [];

  const ring    = document.getElementById('countdown-ring');
  const ringFg  = document.getElementById('ring-fg');
  const ringNum = document.getElementById('ring-num');
  ring.style.display = 'block';
  ringNum.textContent = countdown;

  const circ = 2 * Math.PI * 40;
  ringFg.style.strokeDasharray  = circ;
  ringFg.style.strokeDashoffset = 0;
  setStatus('Scanning… 5s remaining', 'g');

  let elapsed = 0;
  cTimer = setInterval(() => {
    elapsed++;
    countdown = SCAN_SECS - elapsed;
    ringNum.textContent        = Math.max(0, countdown);
    ringFg.style.strokeDashoffset = (elapsed / SCAN_SECS) * circ;

    if (elapsed >= SCAN_SECS) {
      clearInterval(cTimer); cTimer = null;
      scanning = false;
      ring.style.display = 'none';
      window.finalizeResults(readings); // defined in ui.js
    }
  }, 1000);
}

// ── MediaPipe init ────────────────────────────────────────────
function initPose() {
  try {
    console.log("🤖 [Vision ML] initPose(): Loading and initializing MediaPipe Pose model...");
    poseDetector = new Pose({
      locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}`
    });
    poseDetector.setOptions({
      modelComplexity:        1,
      smoothLandmarks:        true,
      enableSegmentation:     false,
      minDetectionConfidence: 0.5,
      minTrackingConfidence:  0.5,
    });
    poseDetector.onResults(onResults);

    camUtil = new Camera(video, {
      onFrame: async () => { if (poseDetector) await poseDetector.send({ image: video }); },
      width: 640, height: 480,
    });
    camUtil.start();
    setStatus('Stand in the guide box — scanning starts automatically', 'y');
  } catch (e) {
    setStatus('Pose model error: ' + e.message, 'r');
  }
}

// ── Public: start camera ──────────────────────────────────────
async function startScan() {
  try {
    setStatus('Requesting camera…', 'y');
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: 640, height: 480 }
    });
    video.srcObject = stream;
    await new Promise(r => (video.onloadedmetadata = r));
    resizeCvs();
    document.getElementById('btn-start').disabled = true;
    document.getElementById('btn-stop').disabled  = false;
    document.getElementById('live-panel').style.display = 'block';
    setStatus('Loading pose model…', 'y');
    inFrameFrames = 0;
    autoStarted   = false;
    initPose();
  } catch (e) {
    setStatus('Camera error: ' + e.message, 'r');
  }
}

// ── Public: stop camera ───────────────────────────────────────
function stopScan() {
  if (stream)   { stream.getTracks().forEach(t => t.stop()); stream = null; }
  if (camUtil)  { try { camUtil.stop(); } catch (e) {} camUtil = null; }
  if (cTimer)   { clearInterval(cTimer); cTimer = null; }
  scanning      = false;
  inFrameFrames = 0;
  autoStarted   = false;
  document.getElementById('countdown-ring').style.display = 'none';
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  document.getElementById('btn-start').disabled = false;
  document.getElementById('btn-stop').disabled  = true;
  banner.className   = 'frame-banner out';
  banner.innerHTML   = '⬤ &nbsp;Step into the guide box';
  guideBox.className = 'guide-box bad';
  setStatus('Stopped', '');
}

// ── Wire up buttons ───────────────────────────────────────────
document.getElementById('btn-start').onclick = startScan;
document.getElementById('btn-stop').onclick  = stopScan;
