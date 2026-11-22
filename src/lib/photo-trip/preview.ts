import { classifyPhoto, geminiKey } from "./agents";
import { signSubject } from "./handoff";
import { verifyLandmark } from "./places";
import type { PhotoPreview } from "./types";

const CLEARER_PHOTO = "Try a clearer photo of a dish or a recognizable Boston-area landmark.";

export async function previewPhoto(image: string, note: string): Promise<PhotoPreview> {
  const subject = await classifyPhoto(image, note);
  if (!subject.name || subject.kind === "unsupported") return { reply: CLEARER_PHOTO };
  if (subject.kind === "food") {
    return {
      reply: "Share your location to find nearby matches and check MBTA trips, or see matches near downtown Boston.",
      dish: subject.name,
      token: signSubject({ kind: "food", dish: subject.name }, geminiKey()),
    };
  }
  const destination = await verifyLandmark(subject.name, subject.municipality);
  if (!destination) return { reply: `I couldn’t verify that location. ${CLEARER_PHOTO}` };
  return {
    reply: "Share your location to find the fastest available MBTA trip.",
    destination,
    token: signSubject({ kind: "location", destination }, geminiKey()),
  };
}
