/**
 * cameraCapabilities — shared probes for whether camera-based screensaver wake
 * can possibly work on this device/browser, and why not when it can't.
 *
 * The camera wake feature (see useCameraMotion.ts) fails *silently* by design,
 * so these helpers exist to make the failure visible — both to the in-app
 * diagnostics page and, optionally, to the motion hook for richer logging.
 *
 * The single most common blocker is a non-secure context: getUserMedia is only
 * exposed over HTTPS (or http://localhost). A plain-HTTP LAN address such as
 * http://192.168.1.50 is NOT a secure context, so navigator.mediaDevices is
 * undefined and the camera can never start.
 */

export type CameraReadiness =
  | 'ready'              // secure context + API present + permission granted
  | 'prompt'            // secure context + API present, permission not yet decided
  | 'insecure-context'  // page not served over HTTPS/localhost — hard blocker
  | 'no-api'            // browser exposes no getUserMedia (e.g. iOS standalone quirks)
  | 'denied'            // user/MDM denied camera permission
  | 'no-camera'         // API present but no camera device found
  | 'unknown';          // permission state could not be determined

export interface CameraCapabilities {
  /** window.isSecureContext — the gate getUserMedia sits behind. */
  secureContext: boolean;
  /** Whether navigator.mediaDevices.getUserMedia exists at all. */
  hasGetUserMedia: boolean;
  /** Permissions API result for 'camera', when available. */
  permission: PermissionState | 'unsupported';
  /** Rolled-up readiness verdict for display. */
  readiness: CameraReadiness;
}

/**
 * Synchronous, side-effect-free snapshot. Does NOT prompt for permission.
 * Safe to call on render.
 */
export function inspectCameraSupport(): Pick<CameraCapabilities, 'secureContext' | 'hasGetUserMedia'> {
  const secureContext   = typeof window !== 'undefined' && window.isSecureContext === true;
  const hasGetUserMedia = typeof navigator !== 'undefined'
    && !!navigator.mediaDevices
    && typeof navigator.mediaDevices.getUserMedia === 'function';
  return { secureContext, hasGetUserMedia };
}

/**
 * Full capability probe. Reads the Permissions API when available but does NOT
 * call getUserMedia, so it won't trigger a permission prompt on its own.
 */
export async function probeCameraCapabilities(): Promise<CameraCapabilities> {
  const { secureContext, hasGetUserMedia } = inspectCameraSupport();

  if (!secureContext) {
    return { secureContext, hasGetUserMedia, permission: 'unsupported', readiness: 'insecure-context' };
  }
  if (!hasGetUserMedia) {
    return { secureContext, hasGetUserMedia, permission: 'unsupported', readiness: 'no-api' };
  }

  let permission: PermissionState | 'unsupported' = 'unsupported';
  try {
    if (navigator.permissions?.query) {
      // 'camera' isn't in every lib's PermissionName union but is widely supported.
      const status = await navigator.permissions.query({ name: 'camera' as PermissionName });
      permission = status.state;
    }
  } catch {
    permission = 'unsupported';
  }

  let readiness: CameraReadiness;
  if      (permission === 'granted') readiness = 'ready';
  else if (permission === 'denied')  readiness = 'denied';
  else if (permission === 'prompt')  readiness = 'prompt';
  else                               readiness = 'unknown';

  return { secureContext, hasGetUserMedia, permission, readiness };
}

/** Human-readable explanation for each readiness state. */
export function readinessExplanation(r: CameraReadiness): string {
  switch (r) {
    case 'ready':
      return 'Camera is available and permission is granted. Motion wake can run.';
    case 'prompt':
      return 'Camera is available. Permission has not been granted yet — run the live test below to grant it.';
    case 'insecure-context':
      return 'This page is not served over HTTPS, so the browser blocks all camera access. Motion wake cannot work until the display is served over HTTPS (or localhost).';
    case 'no-api':
      return 'This browser exposes no camera API in its current mode. On iPads, camera access is often unavailable for home-screen web apps — try testing in Safari, or use an Android tablet.';
    case 'denied':
      return 'Camera permission has been denied. Re-enable it in the browser/site settings for this page, then reload.';
    case 'no-camera':
      return 'No camera device was found on this tablet.';
    case 'unknown':
      return 'Camera permission state could not be determined. Run the live test below to check.';
  }
}
