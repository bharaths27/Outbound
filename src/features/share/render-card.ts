// Draws the share card (a 1080 × 1350 PNG, Instagram's 4:5) on a canvas: the wordmark,
// the stamp on a paper disc, the quest, and a QR code that opens the quest (/q/<id>).
// Canvas instead of an HTML-to-image library: no new dependency, and text uses the page's
// loaded Fraunces and DM Sans directly. The stamp comes in as the live <svg> from the page.

import QRCode from "qrcode";

export interface ShareCardInput {
  questTitle: string;
  neighborhood: string;
  stationName: string | null;
  questUrl: string;
  /** Latest check-in time (ISO). */
  at: string;
  xp: number | null;
  playerName: string | null;
  schoolName: string | null;
  /** The rendered <Stamp/> svg, serialized into the card. */
  stampSvg: SVGSVGElement;
}

export const CARD_W = 1080;
export const CARD_H = 1350;

const MAROON = "#6B1F33";
const GOLD = "#F2C14E";
const PAPER = "#FBF6EC";
const INK = "#2B1A1F";
const MUTED = "#6E5A5E";
const ON_MAROON_MUTED = "#F6E6EA";

function fontVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v ? `${v}, ${fallback}` : fallback;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image failed: ${src.slice(0, 40)}`));
    img.src = src;
  });
}

function svgToDataUrl(svg: SVGSVGElement, size: number, sansFamily: string): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(size));
  clone.setAttribute("height", String(size));
  clone.removeAttribute("style"); // the card applies its own tilt
  // CSS variables don't resolve inside an <img>; name the font directly.
  clone.querySelectorAll("text").forEach((t) => t.setAttribute("font-family", sansFamily));
  const xml = new XMLSerializer().serializeToString(clone);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
}

/** Wraps text to at most `maxLines` lines of `maxWidth`, adding an ellipsis if it overflows. */
export function wrapLines(measure: (s: string) => number, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (let i = 0; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i];
    if (measure(next) <= maxWidth || !line) {
      line = next;
      continue;
    }
    lines.push(line);
    line = words[i];
    if (lines.length === maxLines) {
      line = "";
      // Overflow: put an ellipsis on the last line.
      let last = lines[maxLines - 1];
      while (last && measure(`${last}…`) > maxWidth) last = last.split(" ").slice(0, -1).join(" ");
      lines[maxLines - 1] = `${last}…`;
      return lines;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function renderShareCard(input: ShareCardInput): Promise<Blob> {
  await document.fonts?.ready;
  const display = fontVar("--font-fraunces", "Georgia, serif");
  const sans = fontVar("--font-dm-sans", "system-ui, sans-serif");

  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");

  const [wordmark, stamp, qr] = await Promise.all([
    loadImage("/outbound-wordmark.svg").catch(() => null),
    // Web fonts aren't available inside an SVG image, so the arc text uses a system sans.
    loadImage(svgToDataUrl(input.stampSvg, 460, "Helvetica, Arial, sans-serif")),
    QRCode.toDataURL(input.questUrl, { margin: 1, width: 360, color: { dark: INK, light: "#FFFFFF" } }).then(loadImage),
  ]);

  // Background
  ctx.fillStyle = MAROON;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Wordmark and XP pill
  if (wordmark) {
    const h = 56;
    const w = (wordmark.naturalWidth / wordmark.naturalHeight) * h || 260;
    ctx.drawImage(wordmark, 80, 80, w, h);
  }
  if (input.xp) {
    const label = `+${input.xp} XP`;
    ctx.font = `700 34px ${sans}`;
    const w = ctx.measureText(label).width + 56;
    roundRect(ctx, CARD_W - 80 - w, 76, w, 64, 32);
    ctx.fillStyle = GOLD;
    ctx.fill();
    ctx.fillStyle = "#4A1424";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, CARD_W - 80 - w / 2, 109);
  }

  // Stamp on a paper disc, tilted like an earned stamp
  const cx = CARD_W / 2;
  const cy = 450;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.28)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 14;
  ctx.beginPath();
  ctx.arc(cx, cy, 250, 0, Math.PI * 2);
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((-8 * Math.PI) / 180);
  ctx.drawImage(stamp, -230, -230, 460, 460);
  ctx.restore();

  // Text block
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = GOLD;
  ctx.font = `700 30px ${sans}`;
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "4px";
  ctx.fillText(`STAMPED IN ${input.neighborhood.toUpperCase()}`, cx, 790);
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "0px";

  ctx.fillStyle = "#FFFFFF";
  ctx.font = `600 68px ${display}`;
  const lines = wrapLines((s) => ctx.measureText(s).width, input.questTitle, 920, 2);
  lines.forEach((l, i) => ctx.fillText(l, cx, 880 + i * 78));

  const date = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "America/New_York" }).format(
    new Date(input.at),
  );
  ctx.fillStyle = ON_MAROON_MUTED;
  ctx.font = `500 32px ${sans}`;
  ctx.fillText([input.stationName, date].filter(Boolean).join(" · "), cx, 880 + lines.length * 78 + 14);

  // Bottom panel: QR to the quest, who earned it
  const px = 60;
  const py = 1090;
  const pw = CARD_W - 120;
  const ph = 200;
  roundRect(ctx, px, py, pw, ph, 32);
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.drawImage(qr, px + 24, py + 20, 160, 160);
  ctx.textAlign = "left";
  ctx.fillStyle = MAROON;
  ctx.font = `600 44px ${display}`;
  ctx.fillText("Scan to take this quest", px + 216, py + 82);
  ctx.fillStyle = MUTED;
  ctx.font = `500 30px ${sans}`;
  const who = [input.playerName, input.schoolName].filter(Boolean).join(" · ");
  const tag = who ? `${who} · Explore Boston via T` : "Explore Boston via T";
  ctx.fillText(wrapLines((t) => ctx.measureText(t).width, tag, pw - 216 - 32, 1)[0] ?? "", px + 216, py + 132);

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"),
  );
}
