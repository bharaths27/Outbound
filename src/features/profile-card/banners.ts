// Profile banner presets (Discord-style profile decoration). Ids are stored in profiles.banner.

export const BANNERS = [
  { id: "maroon", label: "Outbound maroon", css: "radial-gradient(circle at 18% 120%, rgb(242 193 78 / .35) 0 22%, transparent 23%), radial-gradient(circle at 90% -20%, rgb(255 255 255 / .12) 0 30%, transparent 31%), linear-gradient(135deg, #6B1F33, #3B1019)" },
  { id: "blossom", label: "Cherry blossom", css: "radial-gradient(circle at 12% 30%, #fff 0 3px, transparent 4px), radial-gradient(circle at 70% 60%, #fff 0 2px, transparent 3px), radial-gradient(circle at 40% 80%, #ffe3ea 0 3px, transparent 4px), linear-gradient(135deg, #F7B8C9, #E98AA6 60%, #B85D7A)" },
  { id: "charles", label: "Charles River", css: "repeating-linear-gradient(170deg, rgb(255 255 255 / .12) 0 2px, transparent 2px 14px), linear-gradient(180deg, #8FC1E3, #2D5A8A 70%, #1F3E63)" },
  { id: "night-line", label: "Night on the T", css: "radial-gradient(circle at 20% 30%, #fff 0 1px, transparent 2px), radial-gradient(circle at 75% 20%, #fff 0 1.5px, transparent 2.5px), radial-gradient(circle at 55% 55%, #F2C14E 0 1.5px, transparent 2.5px), linear-gradient(160deg, #1F2A5C, #0E1430)" },
  { id: "fenway", label: "Fenway green", css: "repeating-linear-gradient(90deg, rgb(255 255 255 / .07) 0 18px, transparent 18px 36px), linear-gradient(135deg, #2F6B4F, #1B4733)" },
  { id: "gold", label: "Golden hour", css: "radial-gradient(circle at 80% 110%, #FFF4D6 0 18%, transparent 40%), linear-gradient(135deg, #F2C14E, #E5A92F 50%, #C7701A)" },
  { id: "red-line", label: "Red Line", css: "repeating-linear-gradient(135deg, rgb(255 255 255 / .1) 0 10px, transparent 10px 20px), linear-gradient(135deg, #DA291C, #8A1A12)" },
  { id: "orange-line", label: "Orange Line", css: "repeating-linear-gradient(135deg, rgb(255 255 255 / .12) 0 10px, transparent 10px 20px), linear-gradient(135deg, #ED8B00, #B45F00)" },
] as const;

export type BannerId = (typeof BANNERS)[number]["id"];

export function bannerCss(id: string | null | undefined): string {
  return (BANNERS.find((b) => b.id === id) ?? BANNERS[0]).css;
}

export const GRAD_YEARS = Array.from({ length: 9 }, (_, i) => 2025 + i);
