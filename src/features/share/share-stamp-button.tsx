"use client";

// "Share your stamp": builds the share card (render-card.ts) and offers the phone's share
// sheet with the image when the browser supports sharing files, else Download and Copy
// link. The card's QR code and the shared link both open /q/<questId>.

import { Check, Download, Link2, Loader2, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { Tier } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import { Stamp } from "@/features/passport/stamp";
import { renderShareCard } from "./render-card";

export interface ShareStampProps {
  questId: string;
  questTitle: string;
  neighborhood: string;
  stationName: string | null;
  tier: Tier;
  crossSchool: boolean;
  at: string;
  xp?: number | null;
  playerName?: string | null;
  schoolName?: string | null;
}

type Card = { status: "idle" } | { status: "working" } | { status: "ready"; blob: Blob; url: string } | { status: "error" };

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "stamp";
}

export function ShareStampButton({
  className,
  variant = "outline",
  size = "default",
  label = "Share your stamp",
  ...props
}: ShareStampProps & {
  className?: string;
  variant?: "outline" | "gold" | "default" | "ghost";
  size?: "default" | "xl" | "sm";
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
        <Share2 aria-hidden />
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto bg-page sm:max-w-[440px]">
          {open && <ShareSheet {...props} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ShareSheet(props: ShareStampProps) {
  const stampRef = useRef<HTMLDivElement>(null);
  const [card, setCard] = useState<Card>({ status: "idle" });
  const [copied, setCopied] = useState(false);
  const questUrl = typeof window === "undefined" ? `/q/${props.questId}` : `${window.location.origin}/q/${props.questId}`;
  const fileName = `outbound-${slug(props.neighborhood)}-${slug(props.questTitle)}.png`;

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    const svg = stampRef.current?.querySelector("svg");
    if (!svg) return;
    setCard({ status: "working" });
    renderShareCard({
      questTitle: props.questTitle,
      neighborhood: props.neighborhood,
      stationName: props.stationName,
      questUrl,
      at: props.at,
      xp: props.xp ?? null,
      playerName: props.playerName ?? null,
      schoolName: props.schoolName ?? null,
      stampSvg: svg,
    })
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setCard({ status: "ready", blob, url });
      })
      .catch(() => !cancelled && setCard({ status: "error" }));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
    // Built once per open; the props don't change while the sheet is up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const file = card.status === "ready" ? new File([card.blob], fileName, { type: "image/png" }) : null;
  const canShareFile =
    file !== null && typeof navigator !== "undefined" && !!navigator.canShare && navigator.canShare({ files: [file] });

  async function share() {
    if (!file) return;
    try {
      await navigator.share({
        files: [file],
        title: props.questTitle,
        text: `I got the ${props.neighborhood} stamp on Outbound. Try it: ${questUrl}`,
      });
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") toast.error("Sharing didn’t work. Download the card instead.");
    }
  }

  function download() {
    if (card.status !== "ready") return;
    const a = document.createElement("a");
    a.href = card.url;
    a.download = fileName;
    a.click();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(questUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn’t copy. The link is " + questUrl);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <DialogTitle className="pr-10 font-display text-2xl leading-8 font-semibold">Share your stamp</DialogTitle>
        <DialogDescription className="mt-1 text-sm text-muted-2">
          The QR code opens this quest, so friends can go get it too.
        </DialogDescription>
      </div>

      {/* The live stamp the card copies; off-screen, not hidden, so it keeps its layout. */}
      <div ref={stampRef} aria-hidden className="pointer-events-none fixed -left-[9999px] top-0">
        <Stamp
          questId={props.questId}
          title={props.questTitle}
          neighborhood={props.neighborhood}
          tier={props.tier}
          crossSchool={props.crossSchool}
          size={460}
          rotate={0}
        />
      </div>

      <div className="relative mx-auto aspect-[4/5] w-full max-w-[320px] overflow-hidden rounded-xl bg-maroon shadow-card">
        {card.status === "ready" ? (
          // eslint-disable-next-line @next/next/no-img-element -- local blob preview
          <img
            src={card.url}
            alt={`Share card: ${props.questTitle}, ${props.neighborhood} stamp`}
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-on-maroon-muted">
            {card.status === "error" ? (
              <p className="px-6 text-center text-sm">The card didn’t render. You can still copy the link.</p>
            ) : (
              <Loader2 className="size-6 animate-spin motion-reduce:animate-none" aria-label="Making your card" />
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {canShareFile && (
          <Button variant="gold" size="xl" onClick={share}>
            <Share2 aria-hidden />
            Share
          </Button>
        )}
        <div className={cn("grid gap-2", "grid-cols-2")}>
          <Button
            variant={canShareFile ? "outline" : "default"}
            size="lg"
            onClick={download}
            disabled={card.status !== "ready"}
          >
            <Download aria-hidden />
            Download
          </Button>
          <Button variant="outline" size="lg" onClick={copy}>
            {copied ? <Check aria-hidden /> : <Link2 aria-hidden />}
            {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
      </div>
    </div>
  );
}
