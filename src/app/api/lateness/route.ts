// GET /api/lateness
// "How late is each line right now vs normal", from Tiger Data.
// Response:
// { updatedAt, lines: [{ line, nowDelayMin, normalDelayMin, vsNormalMin, method, samples, color, badge }] }
//   nowDelayMin    - avg (predicted - scheduled) over the last 15 min
//   normalDelayMin - avg for this line at this hour of day, from history (null until we have some)
//   vsNormalMin    - nowDelayMin - normalDelayMin (or nowDelayMin if no history yet)
//   method         - "schedule" or "drift" (fallback when MBTA gives no schedule for that line)
//   color          - suggested map color: green (on time), yellow (+2 min), orange (+4), red (+7)
//   badge          - ready-made text, e.g. "Green Line +6 min"
//
// Needs: npm i pg   (and npm i -D @types/pg)
// Env:   TIGER_DATA_URL (server-only; do NOT prefix with NEXT_PUBLIC_)
import { Pool } from "pg";
import { TIGER_CA } from "@/lib/tiger-ca";

export const dynamic = "force-dynamic";

// Tiger Data signs its servers with its own root CA (CN=ca.timescale.com), which Node
// doesn't trust by default. We pass that CA so the certificate is fully VERIFIED.
// "sslmode" is removed from the URL because node-postgres would otherwise replace our
// ssl settings with its own.
function tigerUrl() {
  const raw = process.env.TIGER_DATA_URL ?? "";
  try {
    const u = new URL(raw);
    u.searchParams.delete("sslmode");
    return u.toString();
  } catch {
    return raw;
  }
}

const g = globalThis as unknown as { tigerPool?: Pool };
const pool =
  g.tigerPool ??
  new Pool({
    connectionString: tigerUrl(),
    max: 3,
    ssl: TIGER_CA ? { ca: TIGER_CA, rejectUnauthorized: true } : { rejectUnauthorized: true },
  });
g.tigerPool = pool;

const LINES = ["Red", "Orange", "Green"] as const;

const NOW_SQL = `
  with latest as (
    select distinct on (trip_id, stop_id) line, delay_s
    from arrival_predictions
    where time > now() - interval '15 minutes'
    order by trip_id, stop_id, time desc)
  select line, avg(delay_s) / 60.0 as now_min, count(delay_s)::int as samples
  from latest where delay_s is not null group by line`;

const DRIFT_SQL = `
  with firsts as (
    select distinct on (trip_id, stop_id) trip_id, stop_id, predicted_arrival as first_pred
    from arrival_predictions where time > now() - interval '45 minutes'
    order by trip_id, stop_id, time asc),
  latest as (
    select distinct on (trip_id, stop_id) trip_id, stop_id, line, predicted_arrival as last_pred
    from arrival_predictions where time > now() - interval '15 minutes'
    order by trip_id, stop_id, time desc)
  select l.line, avg(extract(epoch from l.last_pred - f.first_pred)) / 60.0 as drift_min,
         count(*)::int as samples
  from latest l join firsts f using (trip_id, stop_id)
  group by l.line`;

// "normal" = same hour of day (Boston time), excluding the last hour
const NORMAL_SQL = `
  select line, sum(avg_delay_s * samples) / nullif(sum(samples), 0) / 60.0 as normal_min
  from line_delay_hourly
  where extract(hour from bucket at time zone 'America/New_York')
        = extract(hour from now() at time zone 'America/New_York')
    and bucket < now() - interval '1 hour'
  group by line`;

function colorFor(vs: number | null) {
  if (vs === null) return "gray";
  if (vs >= 7) return "red";
  if (vs >= 4) return "orange";
  if (vs >= 2) return "yellow";
  return "green";
}

export async function GET() {
  try {
    const [now, drift, normal] = await Promise.all([
      pool.query(NOW_SQL),
      pool.query(DRIFT_SQL),
      pool.query(NORMAL_SQL),
    ]);
    const byLine = (rows: any[]) => Object.fromEntries(rows.map((r) => [r.line, r]));
    const n = byLine(now.rows), d = byLine(drift.rows), h = byLine(normal.rows);

    const lines = LINES.map((line) => {
      const useSchedule = n[line] && n[line].samples >= 3;
      const nowMin = useSchedule ? Number(n[line].now_min) : d[line] ? Number(d[line].drift_min) : null;
      const normalMin = useSchedule && h[line]?.normal_min != null ? Number(h[line].normal_min) : null;
      const vs = nowMin === null ? null : normalMin === null ? nowMin : nowMin - normalMin;
      const round = (x: number | null) => (x === null ? null : Math.round(x * 10) / 10);
      const shown = vs === null ? null : Math.max(0, Math.round(vs));
      return {
        line,
        nowDelayMin: round(nowMin),
        normalDelayMin: round(normalMin),
        vsNormalMin: round(vs),
        method: useSchedule ? "schedule" : d[line] ? "drift" : "none",
        samples: useSchedule ? n[line].samples : d[line]?.samples ?? 0,
        color: colorFor(vs),
        badge: shown === null ? `${line} Line: no data` : shown === 0 ? `${line} Line on time` : `${line} Line +${shown} min`,
      };
    });

    return Response.json(
      { updatedAt: new Date().toISOString(), lines },
      { headers: { "Cache-Control": "s-maxage=20, stale-while-revalidate=40" } },
    );
  } catch (e: any) {
    return Response.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
