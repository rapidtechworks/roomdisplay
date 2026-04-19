/**
 * Simple in-memory rate limiter for admin login attempts.
 * Per the spec: 10 failed attempts per IP per 15 minutes → 1-hour lockout.
 * Resets automatically — no DB required.
 */

interface IpRecord {
  failures: number;
  firstFailureAt: number;  // ms timestamp
  lockedUntil: number;     // ms timestamp (0 = not locked)
}

const WINDOW_MS   = 15 * 60 * 1000;  // 15 minutes
const MAX_FAILURES = 10;
const LOCKOUT_MS  = 60 * 60 * 1000;  // 1 hour

const records = new Map<string, IpRecord>();

// Periodic cleanup so the map doesn't grow forever
setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of records) {
    const expired = rec.lockedUntil > 0
      ? now > rec.lockedUntil
      : now > rec.firstFailureAt + WINDOW_MS;
    if (expired) records.delete(ip);
  }
}, 5 * 60 * 1000); // run every 5 minutes

/**
 * Returns true if this IP is currently locked out.
 */
export function isLockedOut(ip: string): boolean {
  const rec = records.get(ip);
  if (!rec) return false;
  if (rec.lockedUntil > 0 && Date.now() < rec.lockedUntil) return true;
  // Lockout expired — clean up
  if (rec.lockedUntil > 0) {
    records.delete(ip);
    return false;
  }
  return false;
}

/**
 * Record a failed login attempt for this IP.
 * Returns { locked: true, retryAfter } if the attempt triggered a lockout,
 * otherwise returns { locked: false, remaining } attempts left.
 */
export function recordFailure(ip: string):
  | { locked: true; retryAfterMs: number }
  | { locked: false; remaining: number } {

  const now = Date.now();
  let rec = records.get(ip);

  if (!rec || now > rec.firstFailureAt + WINDOW_MS) {
    // First failure in this window
    rec = { failures: 1, firstFailureAt: now, lockedUntil: 0 };
  } else {
    rec.failures += 1;
  }

  if (rec.failures >= MAX_FAILURES) {
    rec.lockedUntil = now + LOCKOUT_MS;
    records.set(ip, rec);
    return { locked: true, retryAfterMs: LOCKOUT_MS };
  }

  records.set(ip, rec);
  return { locked: false, remaining: MAX_FAILURES - rec.failures };
}

/**
 * Clear the failure record for this IP (call on successful login).
 */
export function clearFailures(ip: string): void {
  records.delete(ip);
}

/**
 * How many seconds until the lockout expires (0 if not locked).
 */
export function lockoutSecondsRemaining(ip: string): number {
  const rec = records.get(ip);
  if (!rec || rec.lockedUntil === 0) return 0;
  return Math.ceil((rec.lockedUntil - Date.now()) / 1000);
}
