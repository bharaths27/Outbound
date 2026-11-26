"use client";

import { useRef, useState } from "react";
import type { Coordinates } from "@/lib/google-routes";
import type { GuidePlace, PhotoPreview, PhotoTripResult, RestaurantMatch } from "@/lib/photo-trip/types";

const BUTTON = "min-h-9 rounded-lg border border-emerald-700 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-400 dark:text-emerald-300 dark:hover:bg-neutral-800";
const LINK = "font-semibold text-emerald-800 underline underline-offset-2 dark:text-emerald-300";

function MapLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className={LINK}>{children}</a>;
}

function MenuStatus({ place }: { place: RestaurantMatch }) {
  return place.menu
    ? <p className="text-xs">Confirmed on menu · <MapLink href={place.menu.url}>{place.menu.item}</MapLink></p>
    : <p className="text-xs text-neutral-600 dark:text-neutral-400">Likely match · menu item unverified</p>;
}

function currentLocation(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error("Location access is unavailable in this browser.")); return; }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ lat: coords.latitude, lng: coords.longitude }),
      (error) => reject(new Error(error.code === 1
        ? "Location access was denied. Allow it in your browser settings to check MBTA trips."
        : "I couldn’t get your current location. Try again with location services on.")),
      { timeout: 12_000, maximumAge: 0 },
    );
  });
}

export default function PhotoTripCard({ preview }: { preview: PhotoPreview }) {
  const [result, setResult] = useState<PhotoTripResult>();
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);

  async function checkTrip(useLocation: boolean) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setStatus(useLocation ? "Getting your location…" : "Looking for Boston restaurants…");
    let origin: Coordinates | undefined;
    try {
      if (useLocation) {
        try {
          origin = await currentLocation();
        } catch (error) {
          setStatus((error as Error).message);
          return;
        }
        setStatus("Checking available MBTA trips…");
      }
      const response = await fetch("/api/guide/photo-trip", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: preview.token, origin }),
      });
      const data: PhotoTripResult & { error?: string } = await response.json();
      if (!response.ok) {
        setStatus(data.error ?? "I couldn’t check this trip. Try again.");
        return;
      }
      setResult(data);
      setStatus(data.reply ?? (data.trip ? "MBTA trip found." : "Restaurant search complete."));
    } catch {
      setStatus("I couldn’t reach the Guide. Check your connection and try again.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  const trip = result?.trip;
  const destination: GuidePlace | undefined = trip?.destination ?? preview.destination;
  const restaurants = result?.report?.restaurants ?? [];
  const selected = restaurants.find((place) => place.id === destination?.id);
  const alternatives = restaurants.filter((place) => place.id !== destination?.id);

  return (
    <section aria-label="Photo trip" className="mt-2 min-w-0 space-y-3 break-words rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
      {preview.dish && <h3 className="font-semibold">{preview.dish}</h3>}
      {destination && (
        <div>
          <h3 className="font-semibold">{destination.name}</h3>
          <p className="text-xs text-neutral-600 dark:text-neutral-400">{destination.address}</p>
          {selected && <MenuStatus place={selected} />}
          <MapLink href={trip?.mapUrl ?? destination.mapUrl}>{trip ? "Open transit directions in Google Maps" : "View on Google Maps"}</MapLink>
        </div>
      )}
      {trip && (
        <div className="space-y-2">
          <p className="font-semibold">{trip.minutes} min · {trip.transfers} {trip.transfers === 1 ? "transfer" : "transfers"}</p>
          <ol className="list-decimal space-y-2 pl-5 text-xs">
            {trip.steps.map((step, index) => (
              <li key={index}>
                {step.mode === "walk" ? (
                  <>{step.text}{step.minutes > 0 ? ` · ${step.minutes} min` : ""}</>
                ) : (
                  <>
                    <p className="font-semibold">{step.line}{step.headsign ? ` toward ${step.headsign}` : ""}</p>
                    <p>Board at {step.from}</p>
                    <p>Exit at {step.to}</p>
                  </>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
      {alternatives.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold">{selected ? "Other nearby matches" : "Nearby restaurant matches"}</h4>
          <ul className="space-y-2">
            {alternatives.map((place) => (
              <li key={place.id} className="border-t border-neutral-200 pt-2 dark:border-neutral-800">
                <MapLink href={place.mapUrl}>{place.name}</MapLink>
                <p className="text-xs text-neutral-600 dark:text-neutral-400">{place.address}</p>
                <MenuStatus place={place} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {!trip && (
        <div className="flex flex-wrap gap-2">
          <button className={BUTTON} type="button" disabled={busy} onClick={() => checkTrip(true)}>Use my location</button>
          {preview.dish && !result && (
            <button className={BUTTON} type="button" disabled={busy} onClick={() => checkTrip(false)}>Show Boston matches</button>
          )}
        </div>
      )}
      <p role="status" className={status ? "text-xs text-neutral-600 dark:text-neutral-400" : "sr-only"}>{status}</p>
    </section>
  );
}
