import { describe, expect, it } from "vitest";
import type { School } from "@/lib/data/types";
import { isEmail, safeNext, schoolForEmail } from "./auth";

const schools: School[] = [
  { id: 1, name: "Boston University", email_domain: "bu.edu", color: null },
  { id: 2, name: "Northeastern", email_domain: "northeastern.edu", color: null },
  { id: 3, name: "Example Med", email_domain: "med.bu.edu", color: null },
];

describe("auth helpers", () => {
  it("checks email shape", () => {
    expect(isEmail(" maya@bu.edu ")).toBe(true);
    expect(isEmail("maya@bu")).toBe(false);
    expect(isEmail("maya bu.edu")).toBe(false);
  });

  it("matches schools by domain or subdomain, most specific first", () => {
    expect(schoolForEmail("x@husky.northeastern.edu", schools)?.name).toBe("Northeastern");
    expect(schoolForEmail("X@BU.EDU", schools)?.name).toBe("Boston University");
    expect(schoolForEmail("x@med.bu.edu", schools)?.name).toBe("Example Med");
    expect(schoolForEmail("x@notbu.edu", schools)).toBeNull();
    expect(schoolForEmail("x@gmail.com", schools)).toBeNull();
    expect(schoolForEmail("nobody", schools)).toBeNull();
  });

  it("keeps ?next= on this site", () => {
    expect(safeNext("/squad/join/AB12CD")).toBe("/squad/join/AB12CD");
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("/\\evil.example")).toBe("/");
    expect(safeNext(null, "/passport")).toBe("/passport");
  });
});
