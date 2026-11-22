// What the Outbound Guide knows about the app itself, so it can answer "how do I earn XP?",
// "what is OUT?", "how do I host an event?" as well as recommend quests. Used two ways:
// in the model's system prompt (appHelpPrompt) and, when every model is down, as a keyword
// FAQ (answerAppQuestion) so the Guide still answers.

export interface AppFaq {
  id: string;
  keys: RegExp; // matched against the lowercased question
  answer: string;
}

export const APP_FAQ: AppFaq[] = [
  {
    id: "what",
    keys: /\b(what is|what's|whats) (outbound|this app)|how does (outbound|this app|it) work|what can i do here/,
    answer:
      "Outbound turns riding the T into a game. Pick a quest or any place on the map, ride there, check in to earn XP and passport stamps, and help your school climb the weekly leaderboard.",
  },
  {
    id: "xp",
    keys: /\b(xp|points?|earn|level)\b/,
    answer:
      "You earn XP by checking in at quests and places on the map. Every spot shows its XP: the kind of place, how far you rode, and how cheap it is all add up (10 to 75 XP for places; quests list their own). The Quest of the Week pays double. Every 250 XP is a new level.",
  },
  {
    id: "checkin",
    keys: /check.?in|claim (it|points|xp)|can'?t check|too far|qr/,
    answer:
      "Tap a quest or place on the map, then Check in. You need to be within 75 m of it (your phone's location is checked by our database), or scan the QR code at event tables. You can check in to a place once a day, up to 8 places a day.",
  },
  {
    id: "passport",
    keys: /passport|stamp|bronze|silver|gold|neighbou?rhood/,
    answer:
      "Your Boston Passport has a stamp for each neighborhood. 1 to 2 quests there is Bronze, 3 to 4 is Silver, 5 or more is Gold. Stamps from another school's campus get a gold border.",
  },
  {
    id: "leaderboard",
    keys: /leaderboard|rank|school|win the week|compete/,
    answer:
      "Every check-in counts toward your school's weekly leaderboard. The Players tab ranks students. The board resets every Monday.",
  },
  {
    id: "out",
    keys: /\bout\b|token|solana|phantom|wallet|crypto|reward|coupon|redeem/,
    answer:
      "Rewards: 1 XP = 1 OUT, a token on Solana (devnet, a test network, so no real money). On the Rewards page, connect Phantom and claim your OUT. Then spend 100, 250 or 500 OUT for a 10%, 20% or 30% coupon (sample coupons for the demo).",
  },
  {
    id: "host",
    keys: /host|create (an )?event|publish|my event|club event|party/,
    answer:
      "Open the Host tab and tap Create an event. Pick the type (party, study jam...), add a description, say if there's free or cheap food and any prizes, set the time and the closest T stop, then Publish. It shows on everyone's map right away.",
  },
  {
    id: "directions",
    keys: /direction|route|get there|how (do|can) i get|which train|ride there|navigate/,
    answer:
      "Tap anything on the map (or search in Explore Boston) and the card shows every way there from where you are: minutes, fare, transfers and the steps. Pick one to preview the ride or Start trip to follow along. Right-click the map for directions to or from any spot.",
  },
  {
    id: "trains",
    keys: /live train|trains? (running|now)|delay|late|last train|mbta/,
    answer:
      "The map shows every Red, Orange, Green and Blue Line train live from the MBTA. The MBTA live trains card under Explore Boston lists each line, how late it is compared to normal, and tonight's last trains.",
  },
  {
    id: "filters",
    keys: /filter|craving|(set|use|change) (the |my )?(budget|time)/,
    answer:
      "Use Craving, Budget and Time in the Explore Boston card, and More for the line, minimum XP, open now, free food only, or hiding places you've been. The map only shows what matches.",
  },
  {
    id: "photo",
    keys: /photo|picture|image|upload|camera/,
    answer:
      "Drop a photo of food or a place into this chat. I'll figure out what it is, find spots near the T that serve it (or where the place is), and plan the ride with quests nearby.",
  },
  {
    id: "squad",
    keys: /squad|friend|group/,
    answer: "Make a squad from your profile to check in together. Friends on the map are sample data in this demo.",
  },
];

/** The "About the app" block for the Guide's system prompt. */
export function appHelpPrompt(): string {
  return [
    "About the Outbound app (answer questions about how it works from these facts; don't invent features):",
    ...APP_FAQ.map((f) => `- ${f.answer}`),
  ].join("\n");
}

/** When the models are down: the FAQ answer for an app question, or null if it's not one. */
export function answerAppQuestion(message: string): string | null {
  const m = message.toLowerCase();
  // "where can I get cheap dumplings?" is a quest request, not a question about the app
  const looksLikeAsk = /\b(how|what|what's|why|explain|help|can i|do i)\b/.test(m);
  const wantsPlaces = /\b(recommend|suggest|find|near|nearby|best|where|hungry|eat|food spot|tonight)\b/.test(m);
  if (!looksLikeAsk || wantsPlaces) return null;
  const hits = APP_FAQ.filter((f) => f.keys.test(m));
  if (!hits.length) return null;
  return hits
    .slice(0, 2)
    .map((f) => f.answer)
    .join(" ");
}
