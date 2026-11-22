// Opens the Ask Guide chat from anywhere (the station hub, empty states). The chat lives
// once in the layout (<ShellGuide/>) and listens for this event.

export const OPEN_GUIDE_EVENT = "outbound:open-guide";

export interface OpenGuideDetail {
  /** Typed into the box, not sent, so the player can edit it first. */
  prompt?: string;
}

export function openGuide(detail: OpenGuideDetail = {}): void {
  window.dispatchEvent(new CustomEvent<OpenGuideDetail>(OPEN_GUIDE_EVENT, { detail }));
}
