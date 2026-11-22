"use client";

// Credit line for a quest photo from Wikimedia Commons: author, license, and a link to the
// file page, which CC BY and CC BY-SA require. Author and license load from the Commons API;
// until they do (or if the request fails) the line still links to the file page.

import { useEffect, useState } from "react";
import { type CommonsCredit, commonsFileName, commonsFilePage, fetchCommonsCredit } from "@/lib/commons-photo";
import { cn } from "@/lib/utils";

export function PhotoCredit({ url, className }: { url: string | null; className?: string }) {
  const file = commonsFileName(url);
  const [credit, setCredit] = useState<CommonsCredit | null>(null);

  useEffect(() => {
    if (!file) return;
    let live = true;
    fetchCommonsCredit(file).then((c) => live && setCredit(c));
    return () => {
      live = false;
    };
  }, [file]);

  if (!file) return null;
  const parts = [credit?.author, credit?.license].filter(Boolean);
  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      Photo{parts.length > 0 && <>: {parts.join(" · ")}</>}, via{" "}
      <a href={commonsFilePage(file)} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
        Wikimedia Commons
      </a>
    </p>
  );
}
