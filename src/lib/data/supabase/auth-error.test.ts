import { describe, expect, it } from "vitest";
import { authError } from "./index";

describe("authError", () => {
  it("maps Supabase Auth messages to login copy codes", () => {
    expect(authError("Database error saving new user")).toBe("unsupported_school");
    expect(authError("anything", "SCHOOL_NOT_SUPPORTED")).toBe("unsupported_school");
    expect(authError("Invalid login credentials")).toBe("invalid_credentials");
    expect(authError("User already registered")).toBe("already_registered");
    expect(authError("Password should be at least 6 characters.")).toBe("weak_password");
    expect(authError("fetch failed")).toBe("failed");
    expect(authError(undefined)).toBe("failed");
  });
});
