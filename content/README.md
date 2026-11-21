# Content

Stations and quests for Outbound, edited as CSV. Columns match `public.stations` and
`public.quests` in `backend/supabase/schema.sql`.

- `stations.csv`: neighborhood and stop story for each station with quests.
- `quests.csv`: the quests.

After editing either file:

```sh
npm run content   # regenerates src/lib/data/mock/content.ts for the mock data service
npm test          # content.test.ts checks every row against the rules below
```

## Rules

**Lists** (`lines`, `vibe_tags`) are separated by `|`: `Green-B|Green-C`, `pizza|late-night`.

**Stations**
- `id` is the MBTA parent stop id (`place-kencl`), the same ids as `seed_stations.sql`.
- `lines` uses route names: `Red`, `Orange`, `Blue`, `Green-B` … `Green-E`.
- Quests in stations with the same `neighborhood` count toward the same passport tier, so
  spell neighborhoods identically (`Fenway–Kenmore` uses an en dash).

**Quests**
- `id`: lowercase words joined by hyphens, unique.
- `type`: `food`, `event`, or `scenic`.
- `price_tier`: `0` free, `1` under $10, `2` $10–20, `3` $20+.
- `walk_min` (from the station, one way) and `duration_min` (time at the spot) drive the
  time filter: a quest fits when `2 × walk_min + duration_min` is within the time a
  player has.
- `vibe_tags`: lowercase and hyphenated (`late-night`, `street-art`). No budget or time
  words (`cheap`, `free`, `quick`): the budget and time filters cover those.
- `photo_url`: an `https://` image, or empty.
- `hours` drives "Open now" and the open/closed label. Use one of:

  | Value | Meaning |
  |---|---|
  | `always` | Open 24/7, for outdoor spots. Put "best in daylight" in the description instead. |
  | `11:00-22:00` | Every day, 24-hour clock. |
  | `Mon-Thu 09:00-20:00; Fri,Sat 09:00-17:00` | Per day. Days not listed are closed. |
  | empty | Unknown. The quest shows no hours and is never hidden by "Open now". |

  Days are `Mon Tue Wed Thu Fri Sat Sun` or `Daily`, as ranges (`Sun-Tue` wraps the week)
  or comma lists. A closing time at or before the opening time runs past midnight
  (`Fri,Sat 18:00-02:00`). Seasonal hours and caveats ("vendors vary") go in the
  description.
