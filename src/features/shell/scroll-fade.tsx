"use client";

// A soft fade in the page color under the top of the scroll area, so content scrolling up
// fades out under the top bar instead of cutting off hard. The gradient eases out (.ob-fade-down
// in globals.css) so there is no visible edge.
// It shows only once the page has scrolled past its phone title band, so it never tints the
// maroon band. Sticky with a negative margin, so it takes no space in the layout.

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function ScrollFade() {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const scroller = ref.current?.parentElement;
    if (!scroller) return;
    const update = () => {
      // The phone title band (PageHeader) is the first <header> in the page; hidden on desktop.
      const band = scroller.querySelector("header");
      const bandBottom =
        band && band.offsetHeight > 0 ? band.offsetTop + band.offsetHeight : 0;
      setShown(scroller.scrollTop > bandBottom + 4);
    };
    update();
    scroller.addEventListener("scroll", update, { passive: true });
    return () => scroller.removeEventListener("scroll", update);
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className={cn(
        "ob-fade-down pointer-events-none sticky top-0 z-30 -mb-16 h-16 transition-opacity duration-200",
        shown ? "opacity-100" : "opacity-0",
      )}
    />
  );
}
