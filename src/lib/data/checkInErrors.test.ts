import { describe, expect, it } from "vitest";
import { parseCheckInError } from "./checkInErrors";

// Messages copied from check_in() in backend/supabase/schema.sql.
describe("parseCheckInError", () => {
  it("reads distance and radius from too-far errors", () => {
    expect(parseCheckInError("too far: 320 m away (need within 75 m)")).toEqual({
      code: "too_far",
      message: "too far: 320 m away (need within 75 m)",
      distanceM: 320,
      radiusM: 75,
    });
  });

  it.each([
    ["already checked in to this quest today", "already_today"],
    ["location required", "location_required"],
    ["QR code does not match this quest", "qr_mismatch"],
    ["you are not in that squad", "not_in_squad"],
    ["quest not found", "quest_not_found"],
    ["not signed in", "not_signed_in"],
    ["something unexpected", "unknown"],
  ])("sorts %j", (message, code) => {
    expect(parseCheckInError(message).code).toBe(code);
  });
});
