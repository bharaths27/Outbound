// Quest photos come from Wikimedia Commons. Most Commons licenses (CC BY, CC BY-SA) require
// credit: author, license, and a link to the file page. Rather than copying that into the
// CSV by hand, the app reads it from the Commons API for the file the photo URL names.

/** The Commons file name ("Marsh_Chapel.jpg") a photo URL points to, or null if it isn't Commons. */
export function commonsFileName(url: string | null | undefined): string | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  let name: string | undefined;
  if (u.hostname === "upload.wikimedia.org") {
    // /wikipedia/commons/a/ab/Name.jpg  or  /wikipedia/commons/thumb/a/ab/Name.jpg/960px-Name.jpg
    const parts = u.pathname.split("/").filter(Boolean);
    const i = parts.indexOf("commons");
    if (i < 0) return null;
    const rest = parts.slice(i + 1);
    name = rest[0] === "thumb" ? rest[3] : rest[2];
  } else if (u.hostname === "commons.wikimedia.org") {
    name = u.pathname.match(/^\/wiki\/(?:Special:FilePath\/|File:)(.+)$/)?.[1];
  }
  if (!name) return null;
  try {
    return decodeURIComponent(name).replace(/ /g, "_");
  } catch {
    return null;
  }
}

export const commonsFilePage = (file: string) =>
  `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file).replace(/%2C/g, ",").replace(/%28/g, "(").replace(/%29/g, ")")}`;

export interface CommonsCredit {
  author: string | null;
  license: string | null;
}

const stripHtml = (html: string) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Reads the Commons API response for one file into author and license, or null. */
export function parseCommonsCredit(json: unknown): CommonsCredit | null {
  const pages = (json as { query?: { pages?: Record<string, { imageinfo?: { extmetadata?: Record<string, { value?: string }> }[] }> } })
    ?.query?.pages;
  const meta = pages && Object.values(pages)[0]?.imageinfo?.[0]?.extmetadata;
  if (!meta) return null;
  const author = meta.Artist?.value ? stripHtml(meta.Artist.value) || null : null;
  const license = meta.LicenseShortName?.value ? stripHtml(meta.LicenseShortName.value) || null : null;
  return { author, license };
}

const cache = new Map<string, Promise<CommonsCredit | null>>();

/** Author and license for a Commons file, from the public API (CORS via origin=*). */
export function fetchCommonsCredit(file: string): Promise<CommonsCredit | null> {
  let p = cache.get(file);
  if (!p) {
    const q = new URLSearchParams({
      action: "query",
      titles: `File:${file}`,
      prop: "imageinfo",
      iiprop: "extmetadata",
      iiextmetadatafilter: "Artist|LicenseShortName",
      format: "json",
      origin: "*",
    });
    p = fetch(`https://commons.wikimedia.org/w/api.php?${q}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(parseCommonsCredit)
      .catch(() => null);
    cache.set(file, p);
  }
  return p;
}
