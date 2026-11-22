// Where the Ask Guide button lives. Change GUIDE_PLACEMENT to move it everywhere at once.
//
// "explore-only": the floating button shows on Explore (the map), and every other page gets
//   an Ask Guide button in its header instead, so nothing floats over page content.
// "everywhere": the floating button shows on every page, and headers have no button.
//
// Both open the same chat (<ShellGuide/> in the layout) through openGuide().

export type GuidePlacement = "explore-only" | "everywhere";

export const GUIDE_PLACEMENT: GuidePlacement = "explore-only";

/** Whether the floating Ask Guide button shows on this page. */
export function guideFloatsOn(pathname: string, placement: GuidePlacement = GUIDE_PLACEMENT): boolean {
  return placement === "everywhere" || pathname === "/";
}

/** Whether this page's header shows an Ask Guide button (the floating one is hidden). */
export function guideInHeaderOn(pathname: string, placement: GuidePlacement = GUIDE_PLACEMENT): boolean {
  return !guideFloatsOn(pathname, placement);
}
