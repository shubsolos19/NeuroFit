/**
 * frontend/js/scanner.js  (FIXED)
 * ──────────────────────────────────────────────────────────────
 * Fixes applied:
 *  1. onResults wrapped in try/catch → frame loop NEVER dies on errors
 *  2. lHip / rHip null-checked in estimatePose → no more TypeErrors
 *  3. canvas dimensions validated before draw → no 0x0 canvas bug
 *  4. video 'loadeddata' event used instead of just onloadedmetadata → race fix
 *  5. dist parseInt guarded against NaN → fallback to 175
 *  6. POSE_CONNECTIONS guarded → safe even if MediaPipe loads late
 *  7. estimatePose called only ONCE per frame during scanning (not twice)
 *  8. initPose() only called after MediaPipe globals confirmed present
 */

'use strict';

// ── DOM refs ──────────────────────────────────────────────────
const video = document.getElementById('webcam');
const canvas = document.getElementById('overlay');
const ctx = canvas.getContext('2d');
const banner = document.getElementById('frame-banner');
const guideBox = document.getElementById('guide-box');

// ── State ─────────────────────────────────────────────────────
let stream = null;
let poseDetector = null;
let camUtil = null;
let scanning = false;
let countdown = 5;
let readings = [];
let cTimer = null;
let inFrameFrames = 0;
let autoStarted = false;

const SCAN_SECS = 5;
const IN_FRAME_THRESHOLD = 15; // ~0.5 second of good frames at 30fps


// ── Status bar helper ─────────────────────────────────────────
function setStatus(msg, state) {
  document.getElementById('stxt').textContent = msg;
  const d = document.getElementById('sdot');
  d.className = 'status-dot' + (state ? ' ' + state : '');
}

// ── Canvas resize ─────────────────────────────────────────────
// FIX 3/4: Guard against 0-dimension canvas (race condition on load)
function resizeCvs() {
  const w = video.videoWidth || video.clientWidth || 640;
  const h = video.videoHeight || video.clientHeight || 480;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}
window.addEventListener('resize', resizeCvs);


// ── In-frame assessment ───────────────────────────────────────
// Returns 'in' | 'partial' | 'out'
function assessFrame(lm) {
  if (!lm) return 'out';
  const nose = lm[0], lFoot = lm[31], rFoot = lm[32];
  const hasHead = nose && nose.visibility > 0.6;
  const hasFeet = lFoot && rFoot && lFoot.visibility > 0.5 && rFoot.visibility > 0.5;

  const headClear = nose && nose.y > 0.03 && nose.y < 0.25;
  const feetClear = lFoot && lFoot.y > 0.80 && lFoot.y < 1.0;

  const bodySpan = lFoot ? Math.abs((nose ? nose.y : 0) - lFoot.y) : 0;
  const goodSpan = bodySpan > 0.55;

  if (hasHead && hasFeet && headClear && feetClear && goodSpan) return 'in';
  if (hasHead && hasFeet) return 'partial';
  return 'out';
}

// ── Update banner & guide box ─────────────────────────────────
function updateFrameBanner(state, lm) {
  guideBox.className = 'guide-box';

  if (state === 'in') {
    banner.className = 'frame-banner in';
    guideBox.classList.add('ok');
    banner.innerHTML = '✔ &nbsp;Perfect! Hold still — scanning starts automatically';
  } else if (state === 'partial') {
    let hint = 'Partial body detected';
    if (lm) {
      const nose = lm[0], lAnk = lm[27];
      if (nose && nose.y > 0.25) hint = '⬆ Step back or lower the camera — head cut off';
      else if (!lAnk || lAnk.visibility < 0.5) hint = '⬇ Move back so feet are visible';
      else if (lAnk && lAnk.y < 0.7) hint = '⬇ Move back — feet too high in frame';
      else hint = '↔ Centre yourself in the guide box';
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
  const nose = lm[0], lFoot = lm[31], rFoot = lm[32];
  const lSho = lm[11], rSho = lm[12];
  const lHip = lm[23], rHip = lm[24];

  // FIX 2: null-check ALL landmarks before accessing .x / .y
  if (!nose || !lFoot || !rFoot || !lSho || !rSho || !lHip || !rHip) return null;

  // 1. Ground contact
  const groundY = (lFoot.y + rFoot.y) / 2;

  // 2. Crown estimate (nose-to-shoulder × 1.25 above nose)
  const shoY = (lSho.y + rSho.y) / 2;
  const headToSho = Math.abs(shoY - nose.y);
  const crownY = nose.y - (headToSho * 1.25);

  // 3. Normalised span
  const span = Math.abs(groundY - crownY);
  if (span < 0.15) return null;

  // 4. FIX 5: Guard dist against NaN — fallback to 175 cm
  const rawDist = parseInt(document.getElementById('dist').value);
  const dist = isNaN(rawDist) ? 175 : rawDist;

  const fov = 60 * Math.PI / 180;
  const frameH = 2 * dist * Math.tan(fov / 2);
  const heightCm = span * frameH;

  const hipW = Math.abs(lHip.x - rHip.x);
  const shoW = Math.abs(lSho.x - rSho.x);

  const gender = document.getElementById('gender').value;
  const looked = window.lookupWeight(heightCm, gender);
  if (!looked) return null;

  return { height: heightCm, weight: looked.weight, bmi: looked.bmi, shoW, hipW };
}

// ── MediaPipe results callback ────────────────────────────────
// FIX 1: Entire callback wrapped in try/catch so ANY error is caught
//         and the MediaPipe frame loop continues uninterrupted.
function onResults(results) {
  try {
    // FIX 3: Ensure canvas has valid dimensions before drawing
    if (canvas.width === 0 || canvas.height === 0) resizeCvs();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const lm = results.poseLandmarks || null;
    const frameState = assessFrame(lm);
    updateFrameBanner(frameState, lm);

    if (lm) {
      const skeletonColor = frameState === 'in' ? 'rgba(0,191,255,0.7)'
        : frameState === 'partial' ? 'rgba(255,213,79,0.6)'
          : 'rgba(244,67,54,0.5)';

      // FIX 6: Guard POSE_CONNECTIONS — use from Pose namespace if global missing
      const connections = (typeof POSE_CONNECTIONS !== 'undefined')
        ? POSE_CONNECTIONS
        : (window.POSE_CONNECTIONS || null);

      if (connections) {
        drawConnectors(ctx, lm, connections, { color: skeletonColor, lineWidth: 2 });
      }
      drawLandmarks(ctx, lm, { color: skeletonColor, fillColor: 'rgba(0,0,0,0.6)', radius: 3 });

      if (frameState === 'in') {
        const est = estimatePose(lm);
        if (est) {
          document.getElementById('live-h').textContent = Math.round(est.height);
          document.getElementById('live-w').textContent = Math.round(est.weight);

          // FIX 7: Accumulate readings HERE (only once) if scanning is active
          if (scanning) readings.push(est);
        }
      } else {
        document.getElementById('live-h').textContent = '--';
        document.getElementById('live-w').textContent = '--';
      }
    } else {
      document.getElementById('live-h').textContent = '--';
      document.getElementById('live-w').textContent = '--';
    }

    // Status update during scan
    if (scanning) {
      if (lm) {
        setStatus('Scanning… ' + countdown + 's remaining', 'g');
      } else {
        setStatus('Stay in frame! ' + countdown + 's remaining', 'y');
      }
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
        if (inFrameFrames > 0) inFrameFrames--;
      }
    }

  } catch (err) {
    // FIX 1: Log error but DO NOT rethrow — keeps the MediaPipe loop alive
    console.warn('[NeuroFit] onResults error (frame skipped):', err);
  }
}

// ── Countdown ─────────────────────────────────────────────────
function beginCountdown() {
  if (scanning) return;
  scanning = true;
  countdown = SCAN_SECS;
  readings = [];

  const ring = document.getElementById('countdown-ring');
  const ringFg = document.getElementById('ring-fg');
  const ringNum = document.getElementById('ring-num');
  ring.style.display = 'block';
  ringNum.textContent = countdown;

  const circ = 2 * Math.PI * 40;
  ringFg.style.strokeDasharray = circ;
  ringFg.style.strokeDashoffset = 0;
  setStatus('Scanning… 5s remaining', 'g');

  let elapsed = 0;
  cTimer = setInterval(() => {
    elapsed++;
    countdown = SCAN_SECS - elapsed;
    ringNum.textContent = Math.max(0, countdown);
    ringFg.style.strokeDashoffset = (elapsed / SCAN_SECS) * circ;

    if (elapsed >= SCAN_SECS) {
      clearInterval(cTimer); cTimer = null;
      scanning = false;
      ring.style.display = 'none';

      // Allow auto-start again for next measurement
      autoStarted = false;
      inFrameFrames = 0;

      window.finalizeResults(readings); // defined in ui.js
    }
  }, 1000);
}


// ── MediaPipe init ────────────────────────────────────────────
function initPose() {
  // FIX 8: Confirm MediaPipe globals exist before using them
  if (typeof Pose === 'undefined' || typeof Camera === 'undefined') {
    setStatus('MediaPipe failed to load — check network connection', 'r');
    console.error('[NeuroFit] MediaPipe globals missing. Check CDN scripts in index.html.');
    return;
  }

  try {
    poseDetector = new Pose({
      locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${f}`
    });
    poseDetector.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    poseDetector.onResults(onResults);

    camUtil = new Camera(video, {
      onFrame: async () => {
        // FIX 4: Keep canvas in sync with actual video dimensions every frame
        resizeCvs();
        if (poseDetector) await poseDetector.send({ image: video });
      },
      width: 640, height: 480,
    });
    camUtil.start();
    setStatus('Stand in the guide box — scanning starts automatically', 'y');
  } catch (e) {
    setStatus('Pose model error: ' + e.message, 'r');
    console.error('[NeuroFit] initPose error:', e);
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

    // FIX 4: Wait for 'loadeddata' (first frame decoded) not just metadata
    //         so videoWidth/Height are guaranteed non-zero when resizeCvs runs
    await new Promise(r => {
      video.onloadeddata = r;
      video.onloadedmetadata = () => { if (video.readyState >= 2) r(); };
    });
    resizeCvs();

    document.getElementById('btn-start').disabled = true;
    document.getElementById('btn-stop').disabled = false;
    document.getElementById('live-panel').style.display = 'block';
    setStatus('Loading pose model…', 'y');
    inFrameFrames = 0;
    autoStarted = false;
    initPose();
  } catch (e) {
    setStatus('Camera error: ' + e.message, 'r');
    console.error('[NeuroFit] startScan error:', e);
  }
}

// ── Public: stop camera ───────────────────────────────────────
function stopScan() {
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  if (camUtil) { try { camUtil.stop(); } catch (e) { } camUtil = null; }
  if (poseDetector) { try { poseDetector.close(); } catch (e) { } poseDetector = null; }
  if (cTimer) { clearInterval(cTimer); cTimer = null; }
  scanning = false;
  inFrameFrames = 0;
  autoStarted = false;
  document.getElementById('countdown-ring').style.display = 'none';
  if (canvas.width > 0 && canvas.height > 0) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  document.getElementById('btn-start').disabled = false;
  document.getElementById('btn-stop').disabled = true;
  document.getElementById('live-h').textContent = '--';
  document.getElementById('live-w').textContent = '--';
  banner.className = 'frame-banner out';
  banner.innerHTML = '⬤ &nbsp;Step into the guide box';
  guideBox.className = 'guide-box bad';
  setStatus('Stopped', '');
}

// ── Wire up buttons ───────────────────────────────────────────
document.getElementById('btn-start').onclick = startScan;
document.getElementById('btn-stop').onclick = stopScan;