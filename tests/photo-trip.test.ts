import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { POST as guide } from "../src/app/api/guide/route";
import { POST as photoTrip } from "../src/app/api/guide/photo-trip/route";
import { mbtaOption } from "../src/lib/photo-trip/directions";
import { readSubject, signSubject } from "../src/lib/photo-trip/handoff";
import type { GoogleRouteStep } from "../src/lib/google-routes";
import type { PhotoPreview, PhotoTripResult } from "../src/lib/photo-trip/types";

const image = "data:image/jpeg;base64,/9j/2Q==";
const origin = { lat: 42.35, lng: -71.07 };
const walk: GoogleRouteStep = {
  travelMode: "WALK", staticDuration: "155s", navigationInstruction: { instructions: "Walk to Park Street" },
};
const train: GoogleRouteStep = {
  travelMode: "TRANSIT",
  transitDetails: {
    transitLine: { name: "Green Line", nameShort: "Green Line D", agencies: [{ name: "MBTA" }] },
    stopDetails: { departureStop: { name: "Park Street" }, arrivalStop: { name: "Kenmore" } },
    headsign: "Riverside",
  },
};
const otherTrain: GoogleRouteStep = {
  ...train, transitDetails: { ...train.transitDetails, transitLine: { name: "Other Train", agencies: [{ name: "Amtrak" }] } },
};
const route = (duration: string, steps: GoogleRouteStep[]) => ({ duration, legs: [{ steps }] });

function googlePlace(id: string, name: string, websiteUri?: string) {
  return { id, displayName: { text: name }, formattedAddress: "123 Main St, Boston, MA, USA", location: { latitude: 42.35, longitude: -71.09 }, websiteUri };
}

function post(path: string, body: unknown) {
  return new Request(`http://localhost/api/guide${path}`, { method: "POST", body: JSON.stringify(body) });
}

interface Call { url: string; body: Record<string, unknown> }

function stubServices(t: TestContext, respond: (call: Call) => unknown) {
  const env = process.env;
  process.env = { ...env, GEMINI_API_KEY: "test-gemini", GOOGLE_MAPS_KEY: "test-maps", GEMINI_MODEL: "" };
  t.after(() => { process.env = env; });
  const calls: Call[] = [];
  const fetch = globalThis.fetch;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).startsWith("data:")) return fetch(input, init);
    const call = { url: String(input), body: JSON.parse(String(init?.body ?? "{}")) };
    calls.push(call);
    const response = respond(call);
    if (call.url.includes("streamGenerateContent")) {
      return new Response(`data: ${JSON.stringify(response)}\n\n`, { headers: { "content-type": "text/event-stream" } });
    }
    return Response.json(response);
  });
  return calls;
}

function gemini(part: Record<string, unknown>, metadata: Record<string, unknown> = {}) {
  return {
    candidates: [{ content: { parts: [part], role: "model" }, finishReason: "STOP", ...metadata }],
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10, totalTokenCount: 20 },
  };
}

test("unsupported photos skip place search and routing", async (t) => {
  const calls = stubServices(t, () => gemini({ text: JSON.stringify({ kind: "unsupported", name: "", municipality: "" }) }));
  const response = await guide(post("", { image, message: "Fenway Park" }));
  assert.equal(response.status, 200);
  assert.match((await response.json()).reply, /clearer photo/);
  assert.ok(calls.every(({ url }) => url.includes("generativelanguage.googleapis.com")));
  assert.match(calls[0].url, /generativelanguage\.googleapis\.com.*gemini-3\.8-flash/);
  assert.match(JSON.stringify(calls[0].body), /image\/jpeg/);
});

test("a verified landmark goes straight to MBTA alternatives after location consent", async (t) => {
  const calls = stubServices(t, ({ url, body }) => {
    if (url.includes("places:searchText")) {
      assert.match(String(body.textQuery), /Fenway Park/);
      return { places: [googlePlace("wrong", "Fenway Park Tours"), googlePlace("fenway", "Fenway Park")] };
    }
    if (url.includes("computeRoutes")) {
      assert.equal(body.travelMode, "TRANSIT");
      assert.equal(body.computeAlternativeRoutes, true);
      return { routes: [
        route("450s", [otherTrain]),
        route("900s", [train, train]),
        route("901s", [train]),
        route("900s", [walk, train]),
      ] };
    }
    if (JSON.stringify(body).includes("compareMbtaTrips")) return gemini({ functionCall: { name: "compareMbtaTrips", args: {} } });
    return gemini({ text: JSON.stringify({ kind: "location", name: "Fenway Park", municipality: "Boston" }) });
  });
  const response = await guide(post("", { image }));
  assert.equal(response.status, 200);
  const preview: PhotoPreview = await response.json();
  assert.equal(preview.destination?.id, "fenway");
  assert.equal(calls.filter(({ url }) => url.includes("places:searchText")).length, 1);
  assert.ok(calls.every(({ url }) => !url.includes("computeRoutes")));
  assert.equal((await photoTrip(post("/photo-trip", { token: preview.token }))).status, 400);
  assert.equal(calls.filter(({ url }) => url.includes("places:searchText")).length, 1);
  assert.ok(calls.every(({ url }) => !url.includes("computeRoutes")));

  const routed = await photoTrip(post("/photo-trip", { token: preview.token, origin }));
  assert.equal(routed.status, 200);
  const result: PhotoTripResult = await routed.json();
  assert.equal(result.trip?.minutes, 15);
  assert.equal(result.trip.transfers, 0);
  assert.deepEqual(result.trip.steps, [
    { mode: "walk", text: "Walk to Park Street", minutes: 3 },
    { mode: "transit", line: "Green Line D", from: "Park Street", to: "Kenmore", headsign: "Riverside" },
  ]);
  assert.match(result.trip.mapUrl, /destination_place_id=fenway/);
  const routeIndex = calls.findIndex(({ url }) => url.includes("computeRoutes"));
  assert.match(JSON.stringify(calls[routeIndex - 1].body), /compareMbtaTrips/);
  assert.equal(calls.filter(({ url }) => url.includes("computeRoutes")).length, 1);
});

test("food report preserves official menu evidence and likely matches, then routes across candidates", async (t) => {
  const menuUrl = "https://example.com/boston/menu";
  const calls = stubServices(t, ({ url, body }) => {
    const prompt = JSON.stringify(body);
    if (url.includes("places:searchText")) {
      assert.equal(body.textQuery, "lobster roll");
      assert.equal(body.includedType, "restaurant");
      return { places: [googlePlace("one", "Restaurant One", "https://example.com/boston"), googlePlace("two", "Restaurant Two", "https://restaurant-two.example")] };
    }
    if (url.includes("computeRoutes")) return { routes: [route("660s", [train])] };
    if (prompt.includes("compareMbtaTrips")) return gemini({ functionCall: { name: "compareMbtaTrips", args: {} } });
    if (prompt.includes("searchRestaurants")) return gemini({ functionCall: { name: "searchRestaurants", args: {} } });
    if (prompt.includes("Check the official menus")) {
      assert.match(prompt, /"urlContext"/);
      return gemini({ text: `1\t${menuUrl}\tMaine Lobster Roll\n2\t${menuUrl}\tLobster Roll` }, {
        urlContextMetadata: { urlMetadata: [{ retrievedUrl: menuUrl, urlRetrievalStatus: "URL_RETRIEVAL_STATUS_SUCCESS" }] },
      });
    }
    return gemini({ text: JSON.stringify({ kind: "food", name: "lobster roll", municipality: "" }) });
  });
  const photo = await guide(post("", { image }));
  assert.equal(photo.status, 200);
  const preview: PhotoPreview = await photo.json();
  assert.equal(preview.dish, "lobster roll");
  assert.ok(calls.every(({ url }) => url.includes("generativelanguage.googleapis.com")));
  const response = await photoTrip(post("/photo-trip", { token: preview.token, origin }));
  const result: PhotoTripResult = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.report?.restaurants.length, 2);
  assert.deepEqual(result.report.restaurants[0].menu, { item: "Maine Lobster Roll", url: menuUrl });
  assert.equal(result.report.restaurants[1].menu, undefined);
  assert.equal(result.trip?.minutes, 11);
  assert.equal(calls.filter(({ url }) => url.includes("computeRoutes")).length, 2);
  assert.ok(calls.some(({ body }) => {
    const json = JSON.stringify(body);
    return json.includes("compareMbtaTrips") && json.includes("Restaurant Two") && json.includes("Maine Lobster Roll");
  }));
});

test("unavailable MBTA routes return a clear message and never fall back to walking", async (t) => {
  const calls = stubServices(t, ({ url }) => url.includes("computeRoutes")
    ? { routes: [route("300s", [walk])] }
    : gemini({ functionCall: { name: "compareMbtaTrips", args: {} } }));
  const place = { id: "fenway", name: "Fenway Park", lat: 42.3467, lng: -71.0972, address: "4 Jersey St, Boston, MA", mapUrl: "https://maps.google.com" };
  const token = signSubject({ kind: "location", destination: place }, "test-gemini");
  const response = await photoTrip(post("/photo-trip", { token, origin }));
  assert.equal(response.status, 200);
  const result: PhotoTripResult = await response.json();
  assert.match(result.reply ?? "", /couldn’t verify an MBTA trip/);
  assert.equal(result.trip, undefined);
  assert.deepEqual(calls.filter(({ url }) => url.includes("computeRoutes")).map(({ body }) => body.travelMode), ["TRANSIT"]);
});

test("directions reject walking-only, incomplete, and mixed-provider itineraries", () => {
  assert.equal(mbtaOption(route("300s", [walk])), null);
  assert.equal(mbtaOption(route("300s", [train, otherTrain])), null);
  assert.equal(mbtaOption(route("300s", [{ ...train, transitDetails: {} }])), null);
  assert.equal(mbtaOption(route("0s", [train])), null);
  assert.equal(mbtaOption(route("301.5s", [train, walk, train]))?.transfers, 1);
});

test("expired or altered handoffs are rejected", () => {
  const subject = { kind: "food", dish: "lobster roll" } as const;
  const token = signSubject(subject, "key", 1000);
  assert.deepEqual(readSubject(token, "key", 2000), subject);
  assert.equal(readSubject(token, "key", 1_801_000), undefined);
  assert.equal(readSubject(`X${token.slice(1)}`, "key", 2000), undefined);
});

test("downtown restaurant search works without location or any routing request", async (t) => {
  const calls = stubServices(t, ({ url, body }) => {
    if (url.includes("places:searchText")) {
      assert.deepEqual(body.locationBias, { circle: { center: { latitude: 42.3601, longitude: -71.0589 }, radius: 8000 } });
      return { places: [googlePlace("restaurant", "Boston Restaurant")] };
    }
    return gemini({ functionCall: { name: "searchRestaurants", args: {} } });
  });
  const token = signSubject({ kind: "food", dish: "pizza" }, "test-gemini");
  const response = await photoTrip(post("/photo-trip", { token }));
  assert.equal(response.status, 200);
  const result: PhotoTripResult = await response.json();
  assert.equal(result.report?.restaurants[0].name, "Boston Restaurant");
  assert.equal(result.trip, undefined);
  assert.ok(calls.every(({ url }) => !url.includes("computeRoutes")));
});

test("typed Guide messages still return Grok quest results", async (t) => {
  const calls = stubServices(t, ({ url }) => {
    if (url.includes("/rest/v1/quests")) return [{
      id: "quest-1", title: "Dumplings in Chinatown", type: "food", description: null, price_tier: 1,
      vibe_tags: [], hours: null, xp: 20, duration_min: 15, walk_min: 5, station_id: "chinatown", stations: null,
    }];
    return { output_text: JSON.stringify({ reply: "Try the dumplings!", quest_ids: ["quest-1"] }) };
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://outbound-test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-supabase";
  process.env.XAI_API_KEY = "test-xai";
  const response = await guide(post("", { message: "cheap dumplings", image: null }));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.source, "grok");
  assert.equal(result.quests[0].id, "quest-1");
  assert.equal(calls.length, 2);
  assert.match(calls[1].url, /api\.x\.ai\/v1\/responses/);
});
