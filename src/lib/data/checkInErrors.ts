// Sorts a failed check_in() by its stable code in error.hint (migration 002). Messages may
// change; codes won't. The TOO_FAR message also carries the distance, which is read here.
// The mock service raises errors in the same shape, so both data sources share this.

import type { CheckInError, CheckInErrorHint } from "./types";

const HINTS: ReadonlySet<string> = new Set<CheckInErrorHint>([
  "NOT_SIGNED_IN",
  "QUEST_NOT_FOUND",
  "QR_MISMATCH",
  "LOCATION_REQUIRED",
  "TOO_FAR",
  "NOT_IN_SQUAD",
  "ALREADY_CHECKED_IN_TODAY",
]);

/** Shape of a supabase-js PostgrestError, or any thrown error. */
export interface RpcErrorLike {
  message: string;
  hint?: string | null;
}

export function parseCheckInError(err: RpcErrorLike): CheckInError {
  const code = err.hint && HINTS.has(err.hint) ? (err.hint as CheckInErrorHint) : "UNKNOWN";
  const error: CheckInError = { code, message: err.message };
  if (code === "TOO_FAR") {
    const m = err.message.match(/(\d+(?:\.\d+)?) m away \(need within (\d+) m\)/);
    if (m) {
      error.distanceM = Number(m[1]);
      error.radiusM = Number(m[2]);
    }
  }
  return error;
}
