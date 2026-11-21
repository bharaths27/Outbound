/* eslint-disable @next/next/no-img-element -- ImageResponse renders this image server-side. */
import { ImageResponse } from "next/og";
import QRCode from "qrcode";
import { getPublicQuest } from "@/lib/public-quest";

export async function GET(request: Request, { params }: { params: Promise<{ questId: string }> }) {
  const { questId } = await params;
  const quest = await getPublicQuest(questId);
  if (!quest) return new Response("Quest not found", { status: 404 });

  const shareUrl = new URL(`/q/${encodeURIComponent(quest.id)}`, request.url);
  const qr = await QRCode.toDataURL(shareUrl.href, { width: 220, margin: 4 });

  return new ImageResponse(
    (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        width: "100%", height: "100%", padding: 72, background: "#102719", color: "#f6f7eb",
      }}>
        <div style={{ display: "flex", flexDirection: "column", width: 740, gap: 20 }}>
          <div style={{ display: "flex", fontSize: 28, color: "#c1ed96" }}>Outbound · Boston Passport</div>
          <div style={{ display: "flex", fontSize: 56, fontWeight: 700 }}>{quest.title}</div>
          <div style={{ display: "flex", fontSize: 32 }}>{quest.station?.name ?? "Boston"}</div>
          <div style={{ display: "flex", fontSize: 28 }}>{quest.xp} base XP</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", flexDirection: "column", gap: 14 }}>
          <img alt="Quest QR code" src={qr} width={220} height={220} />
          <div style={{ display: "flex", fontSize: 22 }}>Scan to try this quest</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
