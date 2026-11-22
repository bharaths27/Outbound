# Outbound

**Ride the T. Explore Boston. Earn rewards.** Outbound turns riding the MBTA into a game that gets Boston college students out of their campus bubble. Open a live 3D map of Boston, pick a quest or any place worth XP, ride there, check in, and help your school climb the weekly leaderboard. XP turns into OUT, a token on Solana, that you spend on coupons.

**Live:** [outboundwith.us](https://outboundwith.us) · Built in 24 hours at BostonHacks 2026.

## What it does

- **Find it.** Filter Boston by craving, budget, time, T line, open now and free food. Every restaurant and place shows its XP, cost and every way to ride there.
- **Ask the AI Guide.** Type what you want or drop a photo of food or a place. Grok looks at the photo, Mastra agents on Gemini decide what it is, find spots near the T and plan the ride, and one answer card comes back with a route on the map. It also answers questions about the app.
- **Get there.** Our own MBTA route planner gives minutes, fare and transfers, with every Red, Orange, Green and Blue Line train live on the map and how late each line runs compared to normal.
- **Play.** Check in within 75 m of a spot (verified by the database) for XP, Boston Passport stamps per neighborhood (Bronze, Silver, Gold), badges, streaks, a 2x Quest of the Week and a weekly school-vs-school leaderboard.
- **Get rewarded.** 1 XP = 1 OUT on Solana. Claim OUT to your Phantom wallet, then spend 100, 250 or 500 OUT for a 10%, 20% or 30% coupon. Our server verifies every payment on chain.
- **Meet people.** Any student or club can host an event on the map (free food, prizes, nearest T stop). Checking in with a student from another school earns double XP and a gold-border stamp.

## Tracks

| Track | How Outbound uses it |
| --- | --- |
| Bos(tons) of Eats and Streets | Food and activities by craving, budget, time and T line, with cost and routes for every place |
| Transit Gamification | XP for riding to places, verified check-ins, passport, badges, streaks, school leaderboard, live line delays |
| BU Spark! Hack Our Space | Host tab puts student events on everyone's map; cross-school check-ins pay double |
| Cursor + Grok | Grok (xAI) reads photos in the AI Guide and takes over when Gemini is down; parts built in Cursor |
| Gemini API | Gemini 2.5 Flash runs the agents and writes the structured answer card |
| Mastra | Photo Decider, Food Researcher and Trip Planner agents with tools: searchQuests, nextTrains, lineDelays, locatePlace, findFoodPlaces |
| Tiger Data | Every train position and arrival prediction in TimescaleDB hypertables; continuous aggregates give lateness vs normal per line |
| Vultr | The MBTA tracker runs 24/7 on a Vultr server in New York, polling every 15 seconds |
| Solana | OUT token (Token-2022, devnet): mint on claim, on-chain verified spend for coupons |
| GoDaddy Registry | outboundwith.us, a .us domain |

## How it works

![System architecture](docs/system%20architecture.png)

- **Frontend:** Next.js 15, React 19, Tailwind CSS, MapLibre GL (3D buildings, live trains, campuses), light and dark mode.
- **Server:** Next.js API routes on Vercel. All API keys stay on the server.
- **Accounts and game rules:** Supabase (Postgres, school-email sign-in, row-level security). XP is only ever added by the `check_in` database function, which checks distance, so the app can't fake it.
- **Live trains:** MBTA V3 API → Python tracker on Vultr → Tiger Data → `/api/trains`, `/api/lateness`. If the live feed is down, the map replays saved trains and says so.
- **AI Guide:** Grok 4.7 vision → Mastra agents on Gemini → structured answer card, streamed stage by stage. Falls back Gemini → Gemini Lite → Grok, then a keyword FAQ.
- **Rewards:** Solana devnet, Token-2022, Phantom. `/api/rewards/claim` mints unclaimed OUT; `/api/rewards/redeem` checks the transfer to our treasury on chain before issuing a coupon.

## Honesty notes

Sample reviews, simulated leaderboard players (names end in "(sim)", modeled on our survey), friends on the map, sample coupons and a devnet test token are all labeled as such in the app.

## Run it locally

Use Node.js 22.13 or later.

```bash
npm install
cp .env.example .env.local   # fill in the keys
npm run dev                  # http://localhost:3000
npm test                     # Vitest
```

Set `NEXT_PUBLIC_DATA_SOURCE=supabase` to use the real database (the default is sample data). Backend setup: [`backend/SETUP.md`](backend/SETUP.md) and [`docs/BACKEND.md`](docs/BACKEND.md).

## Where things live

| Path | What |
| --- | --- |
| `src/app/page.tsx`, `src/components/map/` | Live 3D map, trains, places, directions |
| `src/features/`, `src/app/rewards/` | App screens: explore, passport, leaderboard (compete), host, pipeline, rewards |
| `src/lib/agent/` | AI Guide pipeline: Grok, Mastra agents, report writer |
| `src/app/api/` | Server routes: trains, lateness, route, guide, rewards, demo login |
| `backend/supabase/` | Tables, `check_in()` and game rules, passport, leaderboard, rewards ledger, hosted events |
| `backend/tigerdata/`, `backend/tracker/` | Tiger Data schema and the MBTA tracker that runs on Vultr |

## Team

Verna (3D map, design), Angie (app screens), Bharath (backend, agents, Tiger Data, Vultr, Solana) and Suki (content, game logic, survey, pitch), built with Cursor and Claude Code.
