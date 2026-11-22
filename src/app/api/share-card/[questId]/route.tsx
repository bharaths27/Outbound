/* eslint-disable @next/next/no-img-element -- ImageResponse renders this image server-side. */
import { ImageResponse } from "next/og";
import QRCode from "qrcode";
import { getPublicQuest } from "@/lib/public-quest";
import { publicSiteUrl } from "@/lib/site-url";

// Cards change only when a quest's title, station or XP does: let browsers keep one for an
// hour and the CDN for a day, serving the old one while it refreshes.
const CACHE_CONTROL = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";

export async function GET(request: Request, { params }: { params: Promise<{ questId: string }> }) {
  const { questId } = await params;
  const quest = await getPublicQuest(questId);
  if (!quest) return new Response("Quest not found", { status: 404 });

  // The QR code points at the public site, not whichever preview or host served the card.
  const shareUrl = new URL(`/q/${encodeURIComponent(quest.id)}`, publicSiteUrl(request.url));
  const qr = await QRCode.toDataURL(shareUrl.href, { width: 220, margin: 4 });

  return new ImageResponse(
    (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        width: "100%", height: "100%", padding: 72, background: "#6b1f33", color: "#ffffff",
      }}>
        <div style={{ display: "flex", flexDirection: "column", width: 740, gap: 20 }}>
          <div style={{ display: "flex", fontSize: 28, fontWeight: 700, color: "#f2c14e", letterSpacing: 2 }}>OUTBOUND · BOSTON PASSPORT</div>
          <div style={{ display: "flex", fontSize: 56, fontWeight: 700 }}>{quest.title}</div>
          <div style={{ display: "flex", fontSize: 32, color: "#f3e3e7" }}>
            {quest.station ? `${quest.station.name} · ${quest.station.neighborhood}` : "Boston"}
          </div>
          <div style={{ display: "flex", alignSelf: "flex-start", padding: "8px 20px", borderRadius: 999, background: "#f2c14e", color: "#4a1424", fontSize: 28, fontWeight: 700 }}>
            +{quest.xp} XP
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", padding: 14, borderRadius: 24, background: "#fbf6ec" }}>
            <img alt="Quest QR code" src={qr} width={220} height={220} />
          </div>
          <div style={{ display: "flex", fontSize: 22, color: "#f3e3e7" }}>Scan to try this quest</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: { "Cache-Control": CACHE_CONTROL } },
  );
}
