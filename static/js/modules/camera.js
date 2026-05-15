/* ── Camera Module ──────────────────────────────────────────────────────────
   Handles user webcam init/teardown.
   Interviewer feed is a styled dummy (no real stream needed).
────────────────────────────────────────────────────────────────────────────── */

let _stream = null;

/**
 * Start the user's webcam and show it in #user-video.
 * Silently shows "Camera off" state if permission is denied.
 */
export async function startUserCamera() {
  const video      = document.getElementById("user-video");
  const noVideo    = document.getElementById("cam-no-video");
  const liveBadge  = document.getElementById("user-cam-status");

  if (!video) return;

  try {
    _stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    video.srcObject = _stream;
    video.style.display = "block";
    if (noVideo)   noVideo.style.display   = "none";
    if (liveBadge) liveBadge.style.display = "flex";
  } catch (_err) {
    // Permission denied or no camera — keep "Camera off" placeholder
    video.style.display = "none";
    if (noVideo)   noVideo.style.display   = "flex";
    if (liveBadge) liveBadge.style.display = "none";
  }
}

/**
 * Stop the user's webcam stream.
 */
export function stopUserCamera() {
  const video     = document.getElementById("user-video");
  const noVideo   = document.getElementById("cam-no-video");
  const liveBadge = document.getElementById("user-cam-status");

  if (_stream) {
    _stream.getTracks().forEach(t => t.stop());
    _stream = null;
  }
  if (video) {
    video.srcObject = null;
    video.style.display = "none";
  }
  if (noVideo)   noVideo.style.display   = "flex";
  if (liveBadge) liveBadge.style.display = "none";
}
