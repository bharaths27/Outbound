// Static map content: campuses to highlight, and sample friend visits (until Person 3's friends endpoint is ready).

export interface Campus {
  name: string;
  short: string;
  color: string;
  lng: number;
  lat: number;
}

// Campus shapes themselves come from OpenStreetMap (landuse=university/college) in the basemap tiles;
// these are the label pins, in each school's primary color.
export const CAMPUSES: Campus[] = [
  { name: "MIT", short: "MIT", color: "#A31F34", lng: -71.0946, lat: 42.3590 },
  { name: "Harvard University", short: "Harvard", color: "#A51C30", lng: -71.1162, lat: 42.3744 },
  { name: "Boston University", short: "BU", color: "#CC0000", lng: -71.1091, lat: 42.3502 },
  { name: "Northeastern University", short: "Northeastern", color: "#C8102E", lng: -71.0886, lat: 42.3388 },
  { name: "Tufts University", short: "Tufts", color: "#3E8EDE", lng: -71.1185, lat: 42.4068 },
  { name: "Boston College", short: "BC", color: "#8A100B", lng: -71.1668, lat: 42.3379 },
  { name: "Emerson College", short: "Emerson", color: "#6C2C91", lng: -71.0644, lat: 42.3532 },
  { name: "Suffolk University", short: "Suffolk", color: "#1F3A70", lng: -71.0618, lat: 42.3592 },
  { name: "Berklee College of Music", short: "Berklee", color: "#2D2D2D", lng: -71.0873, lat: 42.3466 },
  { name: "Wentworth Institute of Technology", short: "Wentworth", color: "#B8860B", lng: -71.0957, lat: 42.3365 },
  { name: "MassArt", short: "MassArt", color: "#E4002B", lng: -71.0996, lat: 42.3367 },
  { name: "Simmons University", short: "Simmons", color: "#00205B", lng: -71.1004, lat: 42.3390 },
  { name: "UMass Boston", short: "UMass Boston", color: "#005A8B", lng: -71.0385, lat: 42.3140 },
  { name: "Brandeis University", short: "Brandeis", color: "#003478", lng: -71.2585, lat: 42.3660 },
  { name: "Harvard Medical School", short: "Harvard Med", color: "#A51C30", lng: -71.1035, lat: 42.3368 },
];

export interface FriendVisit {
  id: string;
  name: string;
  school: string;
  color: string; // ring color (school)
  place: string;
  lng: number;
  lat: number;
  when: string;
  stationId: string;
  /** their rating of the place, 1-5 */
  rating: number;
  note: string;
  year?: string;
  /** places they have checked in to (for the profile) */
  visits?: number;
  /** a few other recent spots */
  recent?: { place: string; rating: number }[];
}

// SAMPLE DATA: replace with the friends/visits endpoint once Person 3 ships it (same shape).
export const SAMPLE_FRIEND_VISITS: FriendVisit[] = [
  { id: "f1", name: "Maya Chen", school: "BU", color: "#CC0000", place: "Pavement Coffeehouse", lng: -71.1006, lat: 42.3494, when: "20 min ago", stationId: "place-bucen", rating: 4.5, note: "best oat latte near campus, gets packed after 10", year: "Junior", visits: 27, recent: [{ place: "Time Out Market", rating: 4 }, { place: "Fenway Park", rating: 5 }] },
  { id: "f2", name: "Jordan Lee", school: "MIT", color: "#A31F34", place: "Kendall Square Roof Garden", lng: -71.0868, lat: 42.3628, when: "1 h ago", stationId: "place-kencl", rating: 4, note: "quiet spot to study with a view of the Charles", year: "Senior", visits: 41, recent: [{ place: "MIT Museum", rating: 5 }, { place: "Tatte Kendall", rating: 4 }] },
  { id: "f3", name: "Priya Patel", school: "Northeastern", color: "#C8102E", place: "Museum of Fine Arts", lng: -71.0942, lat: 42.3394, when: "2 h ago", stationId: "place-mfa", rating: 5, note: "free on Wednesday nights after 4. go see the Monet room", year: "Sophomore", visits: 18, recent: [{ place: "Isabella Stewart Gardner", rating: 5 }] },
  { id: "f4", name: "Sam Rivera", school: "Harvard", color: "#A51C30", place: "Harvard Square", lng: -71.1189, lat: 42.3732, when: "3 h ago", stationId: "place-harsq", rating: 4, note: "street musicians every weekend, grab Pinkberry after", year: "Junior", visits: 33, recent: [{ place: "Harvard Book Store", rating: 5 }, { place: "Felipe's", rating: 4 }] },
  { id: "f5", name: "Alex Kim", school: "Tufts", color: "#3E8EDE", place: "Davis Square", lng: -71.1222, lat: 42.3967, when: "yesterday", stationId: "place-davis", rating: 4, note: "good thrift + Diesel Cafe, take the Red Line", year: "Freshman", visits: 12, recent: [{ place: "Diesel Cafe", rating: 5 }] },
  { id: "f6", name: "Nia Brooks", school: "Emerson", color: "#6C2C91", place: "Boston Common", lng: -71.0655, lat: 42.355, when: "yesterday", stationId: "place-pktrm", rating: 4.5, note: "frog pond skating opens in Nov", year: "Senior", visits: 52, recent: [{ place: "Public Garden", rating: 5 }, { place: "Tatte Charles St", rating: 4 }] },
  { id: "f7", name: "Leo Garcia", school: "BC", color: "#8A100B", place: "Chinatown Gate", lng: -71.0607, lat: 42.3512, when: "2 days ago", stationId: "place-chncl", rating: 5, note: "dumplings at Gourmet Dumpling House are a must", year: "Junior", visits: 24, recent: [{ place: "Gourmet Dumpling House", rating: 5 }] },
  { id: "f8", name: "Ava Thompson", school: "Suffolk", color: "#1F3A70", place: "Faneuil Hall", lng: -71.0562, lat: 42.36, when: "3 days ago", stationId: "place-gover", rating: 3.5, note: "touristy, but the Quincy Market chowder is solid", year: "Sophomore", visits: 15, recent: [{ place: "North End", rating: 5 }] },
];

export const initials = (name: string) =>
  name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

/** Passport quests: go somewhere, earn a stamp. SAMPLE DATA until the quests endpoint exists (same shape). */
export interface Quest {
  id: string;
  title: string;
  place: string;
  lng: number;
  lat: number;
  points: number;
  hint: string;
  /** lucide icon name */
  icon: "Landmark" | "Waves" | "Soup" | "BookOpen" | "Sunset" | "Trophy" | "Trees" | "Pizza" | "Coffee";
  /** food, scenery or event: food and events need a check-in, scenery also takes a photo */
  kind?: "food" | "scenery" | "event";
  /** a real quest from the database (check-in goes through check_in(), XP from the quest) */
  real?: boolean;
  /** for Explore's filters: food / event / scenic, price tier 0-3, minutes spent there */
  qtype?: string;
  price?: number;
  duration?: number;
  /** opening hours from the quest content ("Mon-Fri 08:00-18:00"), for "Open now" */
  hours?: string | null;
}
export const SAMPLE_QUESTS: Quest[] = [
  { id: "q1", title: "Freedom Trail starter", place: "Massachusetts State House", lng: -71.0637, lat: 42.3581, points: 50, hint: "Find the gold dome, then walk the red-brick line", icon: "Landmark" },
  { id: "q2", title: "Cross the Zakim", place: "Paul Revere Park", lng: -71.0632, lat: 42.3712, points: 40, hint: "Best bridge view is from the Charlestown side", icon: "Waves" },
  { id: "q3", title: "Dumpling crawl", place: "Chinatown Gate", lng: -71.0605, lat: 42.3511, points: 30, hint: "Two spots, one gate. Orange Line to Chinatown", icon: "Soup" },
  { id: "q4", title: "Square hopper", place: "Harvard Square", lng: -71.1189, lat: 42.3733, points: 30, hint: "Red Line to Harvard, grab a book and a coffee", icon: "BookOpen" },
  { id: "q5", title: "Esplanade sunset", place: "Hatch Shell", lng: -71.0743, lat: 42.3576, points: 25, hint: "Golden hour on the Charles", icon: "Sunset" },
  { id: "q6", title: "Fenway faithful", place: "Fenway Park", lng: -71.0972, lat: 42.3467, points: 40, hint: "Kenmore on the Green Line, then follow the crowd", icon: "Trophy" },
  // farther out: worth more from most campuses, and where the weekly Expedition picks from
  { id: "q7", title: "Beach day on the Blue Line", place: "Revere Beach", lng: -70.9925, lat: 42.4078, points: 30, hint: "America's first public beach, steps from Revere Beach station", icon: "Waves", kind: "scenery" },
  { id: "q8", title: "Arboretum wander", place: "Arnold Arboretum", lng: -71.1225, lat: 42.3005, points: 30, hint: "Orange Line to Forest Hills, then up Peters Hill for the skyline", icon: "Trees", kind: "scenery" },
  { id: "q9", title: "Quincy shore walk", place: "Wollaston Beach", lng: -71.0225, lat: 42.2745, points: 30, hint: "Red Line to Wollaston, ten minutes to the water", icon: "Sunset", kind: "scenery" },
  { id: "q10", title: "Old-school slice", place: "Santarpio's Pizza", lng: -71.0336, lat: 42.3735, points: 25, hint: "Blue Line to Airport, cash-only East Boston classic", icon: "Pizza", kind: "food" },
  { id: "q11", title: "Davis coffee run", place: "Diesel Cafe", lng: -71.1224, lat: 42.3966, points: 20, hint: "Red Line to Davis, then thrift the square", icon: "Coffee", kind: "food" },
  { id: "q12", title: "Echo Bridge", place: "Hemlock Gorge", lng: -71.2296, lat: 42.3127, points: 30, hint: "Green D to Newton Highlands, shout under the arch", icon: "Trees", kind: "scenery" },
  { id: "q13", title: "Pond loop", place: "Jamaica Pond", lng: -71.1205, lat: 42.3165, points: 25, hint: "Green E to Heath Street, 1.5 miles around", icon: "Waves", kind: "scenery" },
  { id: "q14", title: "Reservoir run", place: "Chestnut Hill Reservoir", lng: -71.1565, lat: 42.3365, points: 20, hint: "Green B or C to Cleveland Circle", icon: "Trees", kind: "scenery" },
  { id: "q15", title: "Harbor views", place: "Piers Park", lng: -71.0335, lat: 42.3645, points: 25, hint: "Blue Line to Maverick, the best skyline photo in town", icon: "Landmark", kind: "scenery" },
];
