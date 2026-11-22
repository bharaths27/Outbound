import { z } from "zod";
import { comparableName } from "./places";

const retrievedPages = z.object({
  urlMetadata: z.array(z.object({ retrievedUrl: z.string(), urlRetrievalStatus: z.string() })),
});

function httpsUrl(value?: string) {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" && !url.username && !url.password ? url : undefined;
  } catch {
    return;
  }
}

export function menuMatches(dish: string, websites: (string | undefined)[], text: string, metadata: unknown) {
  const retrieved = retrievedPages.safeParse(metadata);
  const matches = new Map<number, { url: string; item: string }>();
  if (!retrieved.success) return matches;
  const successful = new Set(retrieved.data.urlMetadata
    .filter((page) => page.urlRetrievalStatus === "URL_RETRIEVAL_STATUS_SUCCESS")
    .map((page) => httpsUrl(page.retrievedUrl)?.href));
  const dishName = comparableName(dish);
  if (!dishName) return matches;
  for (const line of text.split("\n")) {
    const [number, rawUrl, item, extra] = line.trim().split("\t");
    const index = Number(number) - 1;
    const menu = httpsUrl(rawUrl);
    const website = httpsUrl(websites[index]);
    if (!/^\d+$/.test(number) || extra || !menu || !website || !successful.has(menu.href)
      || menu.hostname.replace(/^www\./, "") !== website.hostname.replace(/^www\./, "")
      || !item || item.length > 120 || !` ${comparableName(item)} `.includes(` ${dishName} `)) continue;
    matches.set(index, { url: menu.href, item });
  }
  return matches;
}
