"use client";

// "Share quest": the server's share card (GET /api/share-card/<questId>, a PNG with a QR
// code) and the /q/<questId> link. Offers the phone's share sheet with the image where the
// browser can share files, else Download and Copy link. After a check-in the stamp card
// (share-stamp-button.tsx) is the richer option; this one works before you have the stamp.

import { Check, Download, Link2, Loader2, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

type Card = { status: "loading" } | { status: "ready"; blob: Blob; url: string } | { status: "error" };

export function ShareQuestButton({
  questId,
  questTitle,
  className,
  variant = "outline",
  size = "default",
}: {
  questId: string;
  questTitle: string;
  className?: string;
  variant?: "outline" | "ghost" | "default";
  size?: "default" | "sm";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
        <Share2 aria-hidden />
        Share quest
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-page sm:max-w-[520px]">
          {open && <Sheet questId={questId} questTitle={questTitle} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Sheet({ questId, questTitle }: { questId: string; questTitle: string }) {
  const [card, setCard] = useState<Card>({ status: "loading" });
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/q/${encodeURIComponent(questId)}`;
  const fileName = `outbound-${questId}.png`;

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    fetch(`/api/share-card/${encodeURIComponent(questId)}`)
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(String(res.status)))))
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
  }, [questId]);

  const file = card.status === "ready" ? new File([card.blob], fileName, { type: "image/png" }) : null;
  const canShareFile = file !== null && !!navigator.canShare && navigator.canShare({ files: [file] });

  async function share() {
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: questTitle, text: `Try this quest on Outbound: ${link}` });
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
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn’t copy. The link is " + link);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <DialogTitle className="pr-10 font-display text-2xl leading-8 font-semibold">Share this quest</DialogTitle>
        <DialogDescription className="mt-1 text-sm text-muted-2">
          The QR code opens {questTitle}, so friends can go get it too.
        </DialogDescription>
      </div>
      <div className="flex aspect-[1200/630] w-full items-center justify-center overflow-hidden rounded-xl bg-maroon shadow-card">
        {card.status === "ready" ? (
          // eslint-disable-next-line @next/next/no-img-element -- local blob preview
          <img src={card.url} alt={`Share card: ${questTitle}`} className="size-full object-cover" />
        ) : card.status === "error" ? (
          <p className="px-6 text-center text-sm text-on-maroon-muted">The card didn’t load. You can still copy the link.</p>
        ) : (
          <Loader2 className="size-6 animate-spin text-on-maroon-muted motion-reduce:animate-none" aria-label="Making your card" />
        )}
      </div>
      <div className="flex flex-col gap-2">
        {canShareFile && (
          <Button variant="gold" size="xl" onClick={share}>
            <Share2 aria-hidden />
            Share
          </Button>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button variant={canShareFile ? "outline" : "default"} size="lg" onClick={download} disabled={card.status !== "ready"}>
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
