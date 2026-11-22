// The public address of the app, for links that leave it (share-card QR codes). Preview
// deployments and local dev would otherwise put their own host into a QR code that people
// keep. Order: NEXT_PUBLIC_SITE_URL if set, then Vercel's production domain, then the
// request's own origin (local dev).

export function publicSiteUrl(requestUrl: string): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return withScheme(configured);
  const vercelProduction = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelProduction) return withScheme(vercelProduction);
  return new URL(requestUrl).origin;
}

function withScheme(host: string): string {
  const url = /^https?:\/\//i.test(host) ? host : `https://${host}`;
  return url.replace(/\/+$/, "");
}
