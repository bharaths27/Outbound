// Sorts check_in() exception messages (backend/supabase/schema.sql) into error codes.
// The mock service raises the same messages, so both data sources share this parser.
// If the backend changes a message, update the patterns here.

import type { CheckInError } from "./types";

export function parseCheckInError(message: string): CheckInError {
  const tooFar = message.match(/too far: (\d+(?:\.\d+)?) m away \(need within (\d+) m\)/);
  if (tooFar) {
    return { code: "too_far", message, distanceM: Number(tooFar[1]), radiusM: Number(tooFar[2]) };
  }
  if (message.includes("already checked in")) return { code: "already_today", message };
  if (message.includes("location required")) return { code: "location_required", message };
  if (message.includes("QR code does not match")) return { code: "qr_mismatch", message };
  if (message.includes("not in that squad")) return { code: "not_in_squad", message };
  if (message.includes("quest not found")) return { code: "quest_not_found", message };
  if (message.includes("not signed in")) return { code: "not_signed_in", message };
  return { code: "unknown", message };
}
