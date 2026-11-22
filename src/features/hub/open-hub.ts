// Opening and closing the station hub. The hub's state is the `?station=<id>` search
// param, so the map stays mounted, the back button closes the hub, and a link like
// /?station=place-kencl opens it. Next.js syncs window.history.pushState with
// useSearchParams, which <StationHubHost/> reads, but only for calls whose state isn't
// Next's own: pass null, never window.history.state, or the hub won't see the change.
// Call these from client code only.

let openedByPush = false;

/** Opens the hub for an MBTA parent stop id (e.g. "place-kencl") over the current page. */
export function openStationHub(stationId: string): void {
  const url = new URL(window.location.href);
  if (url.searchParams.get("station") === stationId) return;
  const replacing = url.searchParams.has("station"); // switching stations: don't stack history
  url.searchParams.set("station", stationId);
  if (replacing) {
    window.history.replaceState(null, "", url);
  } else {
    window.history.pushState(null, "", url);
    openedByPush = true;
  }
}

/** Closes the hub. Goes back if openStationHub added the history entry, else rewrites the URL. */
export function closeStationHub(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("station")) return;
  if (openedByPush) {
    openedByPush = false;
    window.history.back();
    return;
  }
  url.searchParams.delete("station");
  window.history.replaceState(null, "", url);
}

/** Called by the host when the param is gone (e.g. the user pressed back), so a later
 *  close doesn't step back past a page the hub didn't add. */
export function forgetHubHistory(): void {
  openedByPush = false;
}
