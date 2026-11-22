import { afterEach, describe, expect, it, vi } from "vitest";
import { publicSiteUrl } from "./site-url";

afterEach(() => vi.unstubAllEnvs());

describe("publicSiteUrl", () => {
  it("prefers NEXT_PUBLIC_SITE_URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://outbound.example/");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "outbound.vercel.app");
    expect(publicSiteUrl("https://preview-123.vercel.app/api/x")).toBe("https://outbound.example");
  });

  it("falls back to Vercel's production domain, adding https", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "outbound.vercel.app");
    expect(publicSiteUrl("https://preview-123.vercel.app/api/x")).toBe("https://outbound.vercel.app");
  });

  it("uses the request's origin when nothing is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    expect(publicSiteUrl("http://localhost:3000/api/share-card/abc")).toBe("http://localhost:3000");
  });
});
