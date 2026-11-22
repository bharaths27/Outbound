import { z } from "zod";
import { findFoodReport, geminiKey, planTrip } from "@/lib/photo-trip/agents";
import { readSubject } from "@/lib/photo-trip/handoff";
import type { PhotoTripResult } from "@/lib/photo-trip/types";

export const maxDuration = 60;

const requestSchema = z.object({
  token: z.string().max(3550),
  origin: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).optional(),
});

export async function POST(req: Request) {
  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid trip request." }, { status: 400 });
  const { origin, token } = parsed.data;
  try {
    const subject = readSubject(token, geminiKey());
    if (!subject) return Response.json({ error: "This photo request has expired. Send the photo again to plan a trip." }, { status: 400 });
    if (subject.kind === "location") {
      if (!origin) return Response.json({ error: "Share your current location to find a trip." }, { status: 400 });
      const trip = await planTrip(origin, subject.destination);
      return Response.json({ trip, reply: trip ? undefined : "I couldn’t verify an MBTA trip to this destination right now." } satisfies PhotoTripResult);
    }

    const report = await findFoodReport(subject.dish, origin);
    if (report.restaurants.length === 0) {
      return Response.json({ report, reply: "I couldn’t find nearby restaurants that may serve this dish." } satisfies PhotoTripResult);
    }
    const trip = origin ? await planTrip(origin, report) : undefined;
    const reply = origin && !trip ? "I couldn’t verify an MBTA trip to these restaurants right now." : undefined;
    return Response.json({ trip, report, reply } satisfies PhotoTripResult);
  } catch {
    return Response.json({ error: "I couldn’t check places or MBTA trips right now. Try again in a moment." }, { status: 502 });
  }
}
