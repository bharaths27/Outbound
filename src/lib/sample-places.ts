// What the map's place card says about a spot we have no real data for yet: a short description,
// a typical spend, and SAMPLE reviews. The reviews are synthetic (made up from templates, the same
// for a place every time) and the card labels them "Sample reviews" until real reviews exist.

export type SpotKind =
  | "restaurant" | "fast_food" | "cafe" | "bakery" | "ice_cream" | "bar" | "museum" | "park" | "library"
  | "attraction" | "cinema" | "theatre" | "campus" | "event" | "place";

const ALIASES: Record<string, SpotKind> = {
  beer: "bar", pub: "bar", art_gallery: "museum", zoo: "attraction", aquarium: "attraction", castle: "attraction",
  monument: "attraction", viewpoint: "park", garden: "park", place_of_worship: "attraction", music: "theatre", stadium: "attraction",
};
export const spotKind = (cls: string | undefined | null): SpotKind =>
  (ALIASES[cls ?? ""] ?? (["restaurant", "fast_food", "cafe", "bakery", "ice_cream", "bar", "museum", "park", "library", "attraction", "cinema", "theatre", "campus", "event"].includes(cls ?? "") ? cls : "place")) as SpotKind;

export const isFood = (k: SpotKind) => ["restaurant", "fast_food", "cafe", "bakery", "ice_cream", "bar"].includes(k);

export const KIND_LABEL: Record<SpotKind, string> = {
  restaurant: "Restaurant", fast_food: "Quick bite", cafe: "Cafe", bakery: "Bakery", ice_cream: "Ice cream", bar: "Bar",
  museum: "Museum", park: "Park", library: "Library", attraction: "Landmark", cinema: "Movie theater", theatre: "Theater / music",
  campus: "University campus", event: "Event", place: "Place",
};

/** Typical spend for one student. */
export const SPEND: Record<SpotKind, string> = {
  restaurant: "$15–25 a person", fast_food: "$8–12 a person", cafe: "$5–8 a person", bakery: "$4–8 a person", ice_cream: "$5–7 a person",
  bar: "$20–35 a person (21+)", museum: "Free–$25 (student discounts)", park: "Free", library: "Free", attraction: "Free–$20",
  cinema: "$12–16 a ticket", theatre: "$25+ a ticket", campus: "Free to walk around", event: "See the event", place: "Varies",
};

const ABOUT: Record<SpotKind, string> = {
  restaurant: "A sit-down spot for a real meal with friends.",
  fast_food: "Quick, cheap food. Good between classes or after a late ride.",
  cafe: "Coffee, tea and a seat to study or catch up.",
  bakery: "Fresh pastries and bread. Best earlier in the day.",
  ice_cream: "Something sweet to walk around with.",
  bar: "Drinks and a crowd at night. Bring ID.",
  museum: "Exhibits worth an afternoon. Many have student nights.",
  park: "Green space to walk, sit, or take photos.",
  library: "Quiet space to read or work. Usually free to visit.",
  attraction: "A Boston landmark worth seeing in person.",
  cinema: "Movies on a big screen.",
  theatre: "Live shows and music.",
  campus: "Walk the campus, find the student center, meet people from another school.",
  event: "Something happening for students.",
  place: "A spot on the map you picked.",
};

/** One-line description: what kind of place, near which T stop. */
export function describeSpot(kind: SpotKind, near?: string | null): string {
  return near ? `${ABOUT[kind]} Near ${near}.` : ABOUT[kind];
}

export interface SampleReview {
  author: string;
  school: string;
  stars: number;
  text: string;
  when: string;
}

const NAMES = ["Maya", "Jordan", "Priya", "Leo", "Sam", "Ava", "Diego", "Hana", "Noah", "Zara", "Eli", "Mei", "Omar", "Chloe", "Ravi", "Tess"];
const SCHOOLS = ["BU", "Northeastern", "MIT", "Harvard", "Emerson", "Berklee", "Suffolk", "Tufts", "Wentworth", "Simmons"];
const WHEN = ["2 days ago", "last week", "3 weeks ago", "yesterday", "this week", "a month ago"];
const LINES: Partial<Record<SpotKind, string[]>> = {
  restaurant: ["Portions were big and the price was fair for the area.", "Came with my roommates, we split three plates and left full.", "Service was a little slow on a Friday, food made up for it.", "Ask for the student special, they have one most weekdays."],
  fast_food: ["Fast and cheap, exactly what I needed after a late lab.", "Line looks long but it moves quick.", "Great value. Not fancy, does the job.", "Open late, which saved me after the last train."],
  cafe: ["Good outlets and the wifi actually works. Studied here for hours.", "Oat latte was great, a little pricey.", "Cozy and quiet in the morning, packed by noon.", "Friendly baristas, nice place to meet a study group."],
  bakery: ["Get there early, the best stuff sells out.", "Croissants are flaky and huge.", "Worth the walk from the T.", "Small space, take it to go and sit by the river."],
  ice_cream: ["Rotating flavors, all good.", "Generous scoops for the price.", "Long line on warm nights but worth it.", "Great stop after dinner nearby."],
  bar: ["Good crowd on weekends, gets loud.", "Decent drink specials on weeknights.", "Fun with a group, bring ID.", "Trivia night was a blast."],
  museum: ["Student ID got me a discount. Spent the whole afternoon.", "Free night was packed but fun.", "Great exhibits, plan at least two hours.", "Nice break from studying, very calm."],
  park: ["Great for a walk or a picnic when it's nice out.", "Best photos at golden hour.", "Quiet in the morning, lively on weekends.", "Easy to get to from the T."],
  library: ["Quiet floors are actually quiet.", "Beautiful building, good for focusing.", "Free and warm in the winter.", "Lots of tables, rarely full on weekdays."],
  attraction: ["Worth seeing once, take photos.", "Busier with tourists on weekends.", "Short visit, easy stop between other plans.", "Better than I expected."],
  cinema: ["Student tickets on weeknights are a deal.", "Comfy seats and good sound.", "Smaller theater, fun indie picks.", "Popcorn is pricey, the movie was great."],
  theatre: ["Rush tickets for students are the move.", "Amazing show, sat in the balcony and still loved it.", "Book early, it sells out.", "Great night out with friends."],
  campus: ["Nice place to walk around, student center has cheap food.", "Met people from another school here, fun change of scene.", "Big campus, use the map.", "Good study spots open to visitors."],
};
const GENERIC = ["Nice spot, would come back.", "Easy to reach on the T.", "Good for a quick visit with friends.", "Better than I expected."];

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Three made-up reviews and a rating for a place. Deterministic, so the same place always shows the same ones. */
export function sampleReviews(name: string, kind: SpotKind): { rating: number; count: number; reviews: SampleReview[] } {
  const h = hash(`${name}|${kind}`);
  const pool = LINES[kind] ?? GENERIC;
  const reviews = [0, 1, 2].map((i) => {
    const k = hash(`${h}:${i}`);
    return {
      author: NAMES[k % NAMES.length],
      school: SCHOOLS[(k >>> 4) % SCHOOLS.length],
      stars: 3 + ((k >>> 8) % 3), // 3 to 5
      text: pool[(h + i) % pool.length],
      when: WHEN[(k >>> 12) % WHEN.length],
    };
  });
  const rating = Math.round((3.6 + (h % 13) / 10) * 10) / 10; // 3.6 to 4.8
  return { rating: Math.min(4.8, rating), count: 12 + (h % 180), reviews };
}
