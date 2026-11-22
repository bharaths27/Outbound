// What the Pipeline page shows: how Outbound works end to end, the tracks we entered, every
// agent and tool, and what we built it with. Plain data so the page stays a renderer.

export interface Node {
  id: string;
  title: string;
  tech: string; // the service / library doing the work
  what: string; // what happens here, one or two sentences
  kind: "input" | "agent" | "tool" | "data" | "server" | "ui" | "chain";
}
export interface Flow {
  id: string;
  title: string;
  blurb: string;
  tracks: string[];
  nodes: Node[];
  branchNote?: string;
}

export const FLOWS: Flow[] = [
  {
    id: "trains",
    title: "Live trains",
    blurb: "Every Red, Orange and Green Line train on a 3D map, with delays measured against normal.",
    tracks: ["Transit Gamification", "Tiger Data", "Vultr"],
    nodes: [
      { id: "mbta", kind: "input", title: "MBTA V3 API", tech: "Vehicle positions + predictions", what: "The official live feed: where every train is and when it is predicted at each stop." },
      { id: "tracker", kind: "server", title: "Tracker", tech: "Python on Vultr (New York), 24/7", what: "Polls positions every 15 s and arrival predictions every 30 s, then writes them to the database." },
      { id: "tiger", kind: "data", title: "Tiger Data", tech: "Postgres + TimescaleDB hypertables", what: "train_positions and arrival_predictions as time series. Lateness = predicted minus scheduled arrival, compared to the usual for that hour." },
      { id: "api", kind: "server", title: "Next.js API", tech: "/api/trains, /api/lateness on Vercel", what: "Serves live positions (or a saved replay) and per-line delay badges like “Orange Line +8 min”." },
      { id: "map", kind: "ui", title: "3D map", tech: "MapLibre GL + custom 3D train layer", what: "Trains glide along the real track, lines glow by delay, and the line list shows every train and tonight’s last train." },
    ],
  },
  {
    id: "guide",
    title: "Photo to trip (agents)",
    blurb: "Snap or drop a photo of food or a place. A chain of agents figures out what it is, where to get it, and how to ride there.",
    tracks: ["Cursor + Grok", "Gemini API", "Mastra"],
    branchNote: "Food goes to the Food Researcher; a place goes straight to the Trip Planner; anything else asks for another photo.",
    nodes: [
      { id: "photo", kind: "input", title: "Your photo or question", tech: "Ask Guide chat", what: "Drag in a photo of dumplings, a skyline, a sign. Or just type what you want." },
      { id: "vision", kind: "agent", title: "Photo checker", tech: "Grok vision (xAI Responses API)", what: "Describes the photo: what food or landmark it is, cues like signs and cuisine." },
      { id: "decider", kind: "agent", title: "Photo Decider", tech: "Mastra agent on Gemini", what: "Decides the branch: food, a place, or neither. Keyword rules back it up if the model is down." },
      { id: "food", kind: "agent", title: "Food Researcher", tech: "Mastra agent + findFoodPlaces tool", what: "Finds real spots near the T that serve it (Google Places when available, our quests otherwise)." },
      { id: "trip", kind: "agent", title: "Trip Planner", tech: "Mastra agent + searchQuests, nextTrains, lineDelays, locatePlace", what: "Picks the best stop, checks the next trains and delays, and matches quests worth XP nearby." },
      { id: "report", kind: "agent", title: "Report writer", tech: "structureReport tool, Gemini structured output", what: "Turns it all into one answer card: the spot, the ride, the quest, the XP." },
      { id: "route", kind: "ui", title: "Route on the map", tech: "/api/route on our own MBTA track graph", what: "“Show route on map” draws up to 4 ways there with time, fare and transfers, then previews the ride." },
    ],
  },
  {
    id: "play",
    title: "Check in to rewards",
    blurb: "Go somewhere new, prove you are there, and earn XP, stamps, a spot on your school’s board, and tokens.",
    tracks: ["Eats & Streets", "Transit Gamification", "Solana"],
    nodes: [
      { id: "tap", kind: "input", title: "Check in", tech: "Any quest, restaurant or place on the map", what: "Every spot shows its XP: kind of place + how far you rode + how cheap it is." },
      { id: "rpc", kind: "server", title: "Location check", tech: "Supabase Postgres RPC check_in()", what: "The database checks you are within 75 m (or scanned the QR). The app can’t fake it: row-level security blocks direct writes." },
      { id: "xp", kind: "data", title: "XP, stamps, streaks", tech: "005_gamification.sql", what: "XP and levels, Boston Passport stamps Bronze to Gold, badges, streaks, and double XP on the Quest of the Week." },
      { id: "board", kind: "ui", title: "School leaderboard", tech: "Weekly view, cross-school bonus", what: "Your check-ins count for your school’s weekly rank. Visiting another campus earns a gold border." },
      { id: "sol", kind: "chain", title: "OUT tokens", tech: "Solana Token-2022 on devnet + Phantom", what: "Claim 1 OUT per XP, then redeem sample coupons at 100 / 250 / 500 OUT." },
    ],
  },
  {
    id: "host",
    title: "Host an event",
    blurb: "Students and clubs put events on the map: what it is, if there is free food, and what you can win.",
    tracks: ["BU Spark!"],
    nodes: [
      { id: "form", kind: "input", title: "Create an event", tech: "Host tab", what: "Type (party, study jam…), description, food (free, cheap, paid), prizes, time and the closest T stop." },
      { id: "db", kind: "data", title: "hosted_events", tech: "Supabase, row-level security", what: "Anyone signed in can publish as themselves; only the host can delete it." },
      { id: "pins", kind: "ui", title: "On everyone’s map", tech: "Event pins + Explore count", what: "A purple pin (pink while it is happening) with a Free food tag, counted on the Explore card." },
      { id: "go", kind: "ui", title: "Directions there", tech: "Place card", what: "Tap it: when, who, food, prizes and every way to ride there from where you are." },
    ],
  },
];

export interface Track {
  name: string;
  kind: "BostonHacks" | "MLH";
  how: string;
}
export const TRACKS: Track[] = [
  { name: "Bos(tons) of Eats and Streets", kind: "BostonHacks", how: "Find food and things to do by craving, budget and time, with the T ride and cost to get there." },
  { name: "Transit Gamification", kind: "BostonHacks", how: "XP for every ride and check-in, passport stamps, expeditions, school leaderboard." },
  { name: "BU Spark! Hack Our Space", kind: "BostonHacks", how: "Host tab: put a real event on the map so students from different schools meet in person." },
  { name: "Cursor + Grok (SpaceXSI)", kind: "MLH", how: "Grok powers the Ask Guide chat and photo vision; Verna built the badges in Cursor." },
  { name: "Gemini API", kind: "MLH", how: "Search that turns “cheap dumplings 40 min” into filters, and the Mastra agents’ model." },
  { name: "Mastra", kind: "MLH", how: "The Guide is a Mastra workflow: Photo Decider, Food Researcher, Trip Planner, Report writer." },
  { name: "Tiger Data", kind: "MLH", how: "Train positions and arrival predictions as time series; lateness vs normal per line." },
  { name: "Vultr", kind: "MLH", how: "The train tracker runs 24/7 on a Vultr instance in New York." },
  { name: "Solana", kind: "MLH", how: "OUT, a Token-2022 token on devnet: claim XP as OUT, redeem sample coupons with Phantom." },
  { name: "GoDaddy Registry", kind: "MLH", how: "outboundwith.us, a .us domain." },
];

export const AGENTS: { name: string; model: string; job: string; tools?: string[] }[] = [
  { name: "Outbound Guide", model: "Grok (xAI)", job: "The chat: answers questions about Boston, quests and the T." },
  { name: "Photo checker", model: "Grok vision, Gemini vision backup", job: "Says what food or place is in a photo." },
  { name: "Photo Decider", model: "Gemini via Mastra", job: "Routes a photo to food, place or neither." },
  { name: "Food Researcher", model: "Gemini via Mastra", job: "Finds spots near the T that serve it.", tools: ["findFoodPlaces"] },
  { name: "Trip Planner", model: "Gemini via Mastra", job: "Best stop, next trains, delays, quests nearby.", tools: ["searchQuests", "nextTrains", "lineDelays", "locatePlace"] },
  { name: "Report writer", model: "Gemini structured output", job: "One clean answer card for the UI.", tools: ["structureReport"] },
  { name: "Search", model: "Gemini 2.5 Flash", job: "Free text to Craving / Budget / Time filters, keyword fallback." },
];

export const RELIABILITY = [
  "Model chain: Gemini 2.5 Flash, then Flash-Lite, then Grok. After a Gemini quota or server error, Grok goes first for 10 minutes, so the demo never shows an error.",
  "Routing works with no Google key: our own graph of MBTA track and stops.",
  "No live MBTA feed? The map replays saved trains from Tiger Data and says so.",
  "Check-ins are verified in the database (75 m), not in the app.",
];

export const STACK: { group: string; items: string[] }[] = [
  { group: "App", items: ["Next.js 15", "React 19", "TypeScript", "Tailwind CSS v4", "MapLibre GL (3D)"] },
  { group: "Data", items: ["Supabase (Auth with school email, Postgres, row-level security, RPCs)", "Tiger Data (TimescaleDB)", "MBTA V3 API"] },
  { group: "AI", items: ["Mastra workflows and agents", "Gemini 2.5 Flash / Flash-Lite", "Grok (xAI) text and vision"] },
  { group: "Infra", items: ["Vercel", "Vultr (tracker)", "Solana devnet + Phantom", "outboundwith.us"] },
  { group: "How we built it", items: ["Cursor (badges, UI)", "Claude Code (backend, agents, tests)", "GitHub pull requests", "Vitest + Playwright"] },
];

export const TEAM: { name: string; role: string }[] = [
  { name: "Verna", role: "Map and UI design: 3D map, trains, game layer" },
  { name: "Angie", role: "App screens: sign-in, quests, passport, leaderboard, rewards" },
  { name: "Bharath", role: "Backend: Supabase, Tiger Data tracker, agents, Solana, Vultr" },
  { name: "Suki", role: "Content, game logic, survey, Mastra photo trip, pitch" },
];

export const HONESTY = [
  "Reviews on place cards are samples, labeled “Sample reviews”.",
  "Leaderboard players marked (sim) are simulated from our survey.",
  "Coupons are samples; OUT is on Solana devnet, not real money.",
];
