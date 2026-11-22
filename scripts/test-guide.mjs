#!/usr/bin/env node
// Try the Outbound Guide pipeline from the terminal and watch each agent work.
//   node scripts/test-guide.mjs "cheap ramen near Kenmore"          (text: Grok -> Report tool)
//   node scripts/test-guide.mjs path/to/photo.jpg ["optional note"]  (photo: Grok -> agents -> Report tool)
// Needs `npm run dev` running. Add a URL as the last argument to test another server.
import { readFileSync, existsSync } from "node:fs";

const args = process.argv.slice(2);
const base = /^https?:\/\//.test(args.at(-1) ?? "") ? args.pop().replace(/\/$/, "") : "http://localhost:3000";
const [first = "cheap food near Kenmore, about an hour", note = ""] = args;
const isPhoto = existsSync(first) && /\.(jpe?g|png)$/i.test(first);
const body = isPhoto
  ? { image: `data:image/${/\.png$/i.test(first) ? "png" : "jpeg"};base64,${readFileSync(first).toString("base64")}`, message: note, stream: true }
  : { message: first, stream: true };

const t0 = Date.now();
const sec = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`.padStart(6);
console.log(`\n${isPhoto ? `Photo: ${first}` : `Text: "${first}"`}  ->  ${base}/api/guide\n`);
const res = await fetch(`${base}/api/guide`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
if (!res.ok) {
  console.log(`HTTP ${res.status}`, await res.text());
  process.exit(1);
}
let buf = "";
const dec = new TextDecoder();
for await (const chunk of res.body) {
  buf += dec.decode(chunk, { stream: true });
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    const ev = JSON.parse(line);
    if (ev.type === "stage") console.log(`${sec()}  ${ev.stage.padEnd(7)} ${ev.status}${ev.detail ? `  (${ev.detail})` : ""}`);
    else if (ev.type === "result") {
      console.log(`${sec()}  done, source: ${ev.source}\n`);
      console.log(JSON.stringify(ev.report, null, 2));
    } else console.log(ev);
  }
}
