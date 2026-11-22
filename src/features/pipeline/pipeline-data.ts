// What the Pipeline page shows: Outbound as one flow chart of six stages. Each stage opens to show
// its steps, what to say about it in the demo, the tech, and the tracks it covers.

export type StageId = "trains" | "app" | "guide" | "play" | "rewards" | "host";

export interface Stage {
  id: StageId;
  title: string;
  short: string; // one line under the title in the chart
  color: string; // accent
  emoji: string;
  say: string; // the demo line: what this part does, in plain words
  steps: { title: string; tech: string }[];
  tracks: string[];
  notes?: string[]; // safety nets, honesty notes
}

export const STAGES: Stage[] = [
  {
    id: "trains",
    title: "Live trains",
    short: "MBTA → Vultr → Tiger Data",
    color: "#00843d",
    emoji: "🚇",
    say: "A tracker on Vultr reads every train from the MBTA every 15 seconds and stores it in Tiger Data, so we know where trains are and how late each line runs compared to normal.",
    steps: [
      { title: "MBTA V3 API", tech: "Train positions and predicted arrivals" },
      { title: "Tracker", tech: "Python, runs 24/7 on Vultr (New York)" },
      { title: "Tiger Data", tech: "Postgres + TimescaleDB time series: lateness vs normal" },
      { title: "/api/trains, /api/lateness", tech: "Next.js on Vercel" },
    ],
    tracks: ["Tiger Data", "Vultr", "Transit Gamification"],
    notes: ["No live feed? The map replays saved trains and says so."],
  },
  {
    id: "app",
    title: "The map",
    short: "Next.js + MapLibre 3D, Supabase",
    color: "#6b1f33",
    emoji: "🗺️",
    say: "Students sign in with their school email and see Boston in 3D with live trains, quests and every restaurant and place worth XP. Tap anything for a card with reviews, cost and every way to ride there.",
    steps: [
      { title: "Sign in", tech: "Supabase Auth, school email only" },
      { title: "3D map", tech: "MapLibre GL, live trains, campuses, XP on every place" },
      { title: "Explore Boston", tech: "Craving, budget, time, line, open now, free food" },
      { title: "Directions", tech: "Our own MBTA route graph: time, fare, transfers, ride preview" },
    ],
    tracks: ["Bos(tons) of Eats and Streets", "GoDaddy Registry (outboundwith.us)"],
    notes: ["Routing works without any Google key."],
  },
  {
    id: "guide",
    title: "AI Guide",
    short: "Grok + Mastra agents on Gemini",
    color: "#7c3aed",
    emoji: "✨",
    say: "Ask anything or drop a photo. Grok sees the photo, then Mastra agents on Gemini decide if it's food or a place, find where to get it near the T, plan the ride, and write one answer card.",
    steps: [
      { title: "Photo checker", tech: "Grok vision (xAI)" },
      { title: "Photo Decider", tech: "Mastra agent: food, place or neither" },
      { title: "Food Researcher", tech: "Mastra agent + findFoodPlaces" },
      { title: "Trip Planner", tech: "Mastra agent + searchQuests, nextTrains, lineDelays, locatePlace" },
      { title: "Report writer", tech: "Gemini structured output → answer card + route" },
    ],
    tracks: ["Cursor + Grok", "Gemini API", "Mastra"],
    notes: ["If Gemini runs out, Grok takes over in under a second for 10 minutes.", "The Guide also answers questions about the app itself."],
  },
  {
    id: "play",
    title: "Check in & play",
    short: "Verified in the database",
    color: "#d97706",
    emoji: "📍",
    say: "When you get there, tap Check in. The database checks you're within 75 meters, then gives XP, a passport stamp, streaks and badges, and points for your school's weekly leaderboard.",
    steps: [
      { title: "Check in", tech: "Your location, or the QR code at an event" },
      { title: "check_in()", tech: "Supabase Postgres function, 75 m rule, row-level security" },
      { title: "XP, passport, badges", tech: "Bronze → Silver → Gold per neighborhood, Quest of the Week 2×" },
      { title: "School leaderboard", tech: "Weekly, cross-school gold border" },
    ],
    tracks: ["Transit Gamification", "Bos(tons) of Eats and Streets"],
    notes: ["The app can't fake XP: only the database can add it."],
  },
  {
    id: "rewards",
    title: "Rewards",
    short: "OUT token on Solana",
    color: "#0e7490",
    emoji: "🎟️",
    say: "Every XP is worth 1 OUT, our token on Solana. Claim it to your Phantom wallet, then spend it for discount coupons at spots. It's on devnet, Solana's test network, so it's free to try.",
    steps: [
      { title: "Earn XP", tech: "Check-ins (above)" },
      { title: "Claim OUT", tech: "Our server mints 1 OUT per XP to your Phantom wallet (Token-2022)" },
      { title: "Spend OUT", tech: "Phantom sends 100 / 250 / 500 OUT to the Outbound treasury" },
      { title: "Coupon", tech: "We verify the transfer on Solana, then show a code and QR" },
    ],
    tracks: ["Solana"],
    notes: ["Devnet test token and sample coupons, no real money."],
  },
  {
    id: "host",
    title: "Host an event",
    short: "Students put events on the map",
    color: "#db2777",
    emoji: "🎉",
    say: "Any student or club can publish an event: what it is, whether there's free food, and prizes. It shows up on everyone's map right away, so people from different schools actually meet.",
    steps: [
      { title: "Create an event", tech: "Host tab: type, description, food, prizes, time, T stop" },
      { title: "hosted_events", tech: "Supabase, publish as yourself, delete your own" },
      { title: "On every map", tech: "Event pin, Free food tag, count on Explore" },
    ],
    tracks: ["BU Spark! Hack Our Space"],
  },
];

/** Chart layout: the main row, and Host feeding into the map from below. */
export const MAIN_ROW: StageId[] = ["trains", "app", "guide", "play", "rewards"];

export const TRACKS: { name: string; kind: "BostonHacks" | "MLH" }[] = [
  { name: "Bos(tons) of Eats and Streets", kind: "BostonHacks" },
  { name: "Transit Gamification", kind: "BostonHacks" },
  { name: "BU Spark! Hack Our Space", kind: "BostonHacks" },
  { name: "Cursor + Grok", kind: "MLH" },
  { name: "Gemini API", kind: "MLH" },
  { name: "Mastra", kind: "MLH" },
  { name: "Tiger Data", kind: "MLH" },
  { name: "Vultr", kind: "MLH" },
  { name: "Solana", kind: "MLH" },
  { name: "GoDaddy Registry", kind: "MLH" },
];

export const BUILT_WITH = "Built by Verna (map, design), Angie (app screens), Bharath (backend, agents, Solana) and Suki (content, game logic, pitch), with Cursor and Claude Code.";
export const HONESTY = "Sample reviews, simulated leaderboard players (marked sim), sample coupons and a devnet token are labeled as such in the app.";
