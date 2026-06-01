/**
 * useCameraMotion
 *
 * Accesses the device's front-facing camera and compares successive frames to
 * detect motion.  Fires `onMotion` when the fraction of pixels whose luma
 * changes by more than `threshold` exceeds `diffFraction`.
 *
 * Designed for screensaver wake-up only.  Enable it only while the screensaver
 * is visible — the camera stream stops automatically when `enabled` goes false.
 *
 * Silently degrades if:
 *   - the browser has no camera API
 *   - the user denies permission
 *   - no camera is present
 */
import { useEffect, useRef } from 'react';
import { inspectCameraSupport } from '../lib/cameraCapabilities.ts';

/** Why the camera stream isn't running, for diagnostics/logging. */
export type CameraMotionStatus =
  | 'active'            // stream running, diffing frames
  | 'insecure-context' // not HTTPS — getUserMedia unavailable
  | 'no-api'           // browser exposes no getUserMedia
  | 'denied'           // permission denied by user/MDM
  | 'no-camera'        // no camera device present
  | 'error';           // anything else

interface Options {
  /** Master switch — start/stop the camera stream. */
  enabled: boolean;
  /** Called when motion is detected. Debounced to at most once per 2 s. */
  onMotion: () => void;
  /** Optional — reports why the camera did/didn't start. */
  onStatus?: (status: CameraMotionStatus) => void;
  /** How often to sample a frame (ms). Default 500. */
  intervalMs?: number;
  /** Per-pixel luma difference required to count as "changed" (0-255). Default 20. */
  threshold?: number;
  /** Fraction of total pixels that must change before firing onMotion. Default 0.015 (1.5%). */
  diffFraction?: number;
}

// Capture resolution — low enough for fast diffing, high enough to catch a person.
const W = 160;
const H = 120;

export function useCameraMotion({
  enabled,
  onMotion,
  onStatus,
  intervalMs   = 500,
  threshold    = 20,
  diffFraction = 0.015,
}: Options): void {
  // Stable refs so interval callbacks always have the latest callbacks without
  // restarting the camera when the parent re-renders.
  const onMotionRef  = useRef(onMotion);
  onMotionRef.current = onMotion;
  const onStatusRef  = useRef(onStatus);
  onStatusRef.current = onStatus;

  const cooldownRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    // Surface the common hard blockers explicitly instead of bailing silently.
    const { secureContext, hasGetUserMedia } = inspectCameraSupport();
    if (!secureContext)   { onStatusRef.current?.('insecure-context'); return; }
    if (!hasGetUserMedia) { onStatusRef.current?.('no-api'); return; }

    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;

    const video  = document.createElement('video');
    const canvas = document.createElement('canvas');
    canvas.width  = W;
    canvas.height = H;
    video.muted      = true;
    video.playsInline = true;

    let prevData: Uint8ClampedArray | null = null;

    async function start(): Promise<void> {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: W, height: H },
          audio: false,
        });

        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        video.srcObject = stream;
        await video.play();

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) { onStatusRef.current?.('error'); return; }

        onStatusRef.current?.('active');

        timer = setInterval(() => {
          // Video might not have a frame yet immediately after play()
          if (video.readyState < 2) return;

          ctx.drawImage(video, 0, 0, W, H);
          const curr = ctx.getImageData(0, 0, W, H).data;

          if (prevData) {
            let diffPixels = 0;
            const total = W * H;

            for (let i = 0; i < curr.length; i += 4) {
              // Weighted luma (BT.601) avoids false positives from colour noise
              // Non-null assertions are safe: i is always a valid RGBA offset within bounds
              const prevLuma = (prevData[i]! * 299 + prevData[i + 1]! * 587 + prevData[i + 2]! * 114) / 1000;
              const currLuma = (curr[i]!     * 299 + curr[i + 1]!     * 587 + curr[i + 2]!     * 114) / 1000;
              if (Math.abs(currLuma - prevLuma) > threshold) diffPixels++;
            }

            if (!cooldownRef.current && diffPixels / total > diffFraction) {
              cooldownRef.current = true;
              onMotionRef.current();
              // Prevent hammering during the same movement event
              setTimeout(() => { cooldownRef.current = false; }, 2_000);
            }
          }

          prevData = new Uint8ClampedArray(curr);
        }, intervalMs);

      } catch (err) {
        // Classify the failure so diagnostics can tell denied from missing.
        // Falls back to touch-only wake regardless.
        const name = err instanceof DOMException ? err.name : '';
        if      (name === 'NotAllowedError' || name === 'SecurityError') onStatusRef.current?.('denied');
        else if (name === 'NotFoundError'   || name === 'OverconstrainedError') onStatusRef.current?.('no-camera');
        else                                                             onStatusRef.current?.('error');
      }
    }

    void start();

    return () => {
      stopped = true;
      if (timer)  clearInterval(timer);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
      prevData = null;
    };
  }, [enabled, intervalMs, threshold, diffFraction]);
}
