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
  { name: "MIT", short: "MIT", color: "#A31F34", lng: -71.0942, lat: 42.3601 },
  { name: "Harvard University", short: "Harvard", color: "#A51C30", lng: -71.1167, lat: 42.3744 },
  { name: "Boston University", short: "BU", color: "#CC0000", lng: -71.1054, lat: 42.3505 },
  { name: "Northeastern University", short: "Northeastern", color: "#C8102E", lng: -71.0892, lat: 42.3398 },
  { name: "Tufts University", short: "Tufts", color: "#3E8EDE", lng: -71.1198, lat: 42.4075 },
  { name: "Boston College", short: "BC", color: "#8A100B", lng: -71.1685, lat: 42.3355 },
  { name: "Emerson College", short: "Emerson", color: "#6C2C91", lng: -71.0657, lat: 42.3521 },
  { name: "Suffolk University", short: "Suffolk", color: "#1F3A70", lng: -71.0616, lat: 42.3588 },
  { name: "Berklee College of Music", short: "Berklee", color: "#2D2D2D", lng: -71.087, lat: 42.3466 },
  { name: "Wentworth Institute of Technology", short: "Wentworth", color: "#B8860B", lng: -71.0951, lat: 42.3363 },
  { name: "MassArt", short: "MassArt", color: "#E4002B", lng: -71.099, lat: 42.3373 },
  { name: "Simmons University", short: "Simmons", color: "#00205B", lng: -71.1002, lat: 42.3389 },
  { name: "UMass Boston", short: "UMass Boston", color: "#005A8B", lng: -71.0381, lat: 42.3134 },
  { name: "Brandeis University", short: "Brandeis", color: "#003478", lng: -71.259, lat: 42.3657 },
  { name: "Harvard Medical School", short: "Harvard Med", color: "#A51C30", lng: -71.1048, lat: 42.3355 },
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
}

// SAMPLE DATA: replace with the friends/visits endpoint once Person 3 ships it (same shape).
export const SAMPLE_FRIEND_VISITS: FriendVisit[] = [
  { id: "f1", name: "Maya Chen", school: "BU", color: "#CC0000", place: "Pavement Coffeehouse", lng: -71.1006, lat: 42.3494, when: "20 min ago", stationId: "place-bucen" },
  { id: "f2", name: "Jordan Lee", school: "MIT", color: "#A31F34", place: "Kendall Square Roof Garden", lng: -71.0868, lat: 42.3628, when: "1 h ago", stationId: "place-kencl" },
  { id: "f3", name: "Priya Patel", school: "Northeastern", color: "#C8102E", place: "Museum of Fine Arts", lng: -71.0942, lat: 42.3394, when: "2 h ago", stationId: "place-mfa" },
  { id: "f4", name: "Sam Rivera", school: "Harvard", color: "#A51C30", place: "Harvard Square", lng: -71.1189, lat: 42.3732, when: "3 h ago", stationId: "place-harsq" },
  { id: "f5", name: "Alex Kim", school: "Tufts", color: "#3E8EDE", place: "Davis Square", lng: -71.1222, lat: 42.3967, when: "yesterday", stationId: "place-davis" },
  { id: "f6", name: "Nia Brooks", school: "Emerson", color: "#6C2C91", place: "Boston Common", lng: -71.0655, lat: 42.355, when: "yesterday", stationId: "place-pktrm" },
  { id: "f7", name: "Leo Garcia", school: "BC", color: "#8A100B", place: "Chinatown Gate", lng: -71.0607, lat: 42.3512, when: "2 days ago", stationId: "place-chncl" },
  { id: "f8", name: "Ava Thompson", school: "Suffolk", color: "#1F3A70", place: "Faneuil Hall", lng: -71.0562, lat: 42.36, when: "3 days ago", stationId: "place-gover" },
];

export const initials = (name: string) =>
  name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
