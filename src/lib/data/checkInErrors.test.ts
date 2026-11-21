import { describe, expect, it } from "vitest";
import { parseCheckInError } from "./checkInErrors";

// Hints and messages from check_in() in backend/supabase/002_frontend_requests.sql.
describe("parseCheckInError", () => {
  it("reads distance and radius from TOO_FAR", () => {
    expect(parseCheckInError({ message: "too far: 120 m away (need within 75 m)", hint: "TOO_FAR" })).toEqual({
      code: "TOO_FAR",
      message: "too far: 120 m away (need within 75 m)",
      distanceM: 120,
      radiusM: 75,
    });
  });

  it.each([
    "NOT_SIGNED_IN",
    "QUEST_NOT_FOUND",
    "QR_MISMATCH",
    "LOCATION_REQUIRED",
    "NOT_IN_SQUAD",
    "ALREADY_CHECKED_IN_TODAY",
  ])("uses the hint %s as the code, whatever the message says", (hint) => {
    expect(parseCheckInError({ message: "reworded message", hint }).code).toBe(hint);
  });

  it("falls back to UNKNOWN for a missing or unrecognized hint", () => {
    expect(parseCheckInError({ message: "network down" }).code).toBe("UNKNOWN");
    expect(parseCheckInError({ message: "x", hint: "SOMETHING_NEW" }).code).toBe("UNKNOWN");
    expect(parseCheckInError({ message: "too far: 120 m away (need within 75 m)", hint: null }).code).toBe("UNKNOWN");
  });
});
