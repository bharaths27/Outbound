#!/usr/bin/env bash
# Saves Tiger Data's public root certificate (CN=ca.timescale.com) into src/lib/tiger-ca.ts
# so the web app can VERIFY the database's TLS certificate instead of rejecting it.
# Usage (from the repo root):  bash scripts/save-tiger-ca.sh
set -euo pipefail
cd "$(dirname "$0")/.."
URL=$(grep -E '^TIGER_DATA_URL=' .env.local | head -1 | cut -d= -f2-)
HOSTPORT=$(echo "$URL" | sed -E 's|.*@([^/?]+).*|\1|')
[ -n "$HOSTPORT" ] || { echo "TIGER_DATA_URL not found in .env.local"; exit 1; }
echo "Fetching certificate chain from $HOSTPORT ..."
CHAIN=$(openssl s_client -starttls postgres -connect "$HOSTPORT" -showcerts </dev/null 2>/dev/null)
# keep the LAST certificate in the chain (the self-signed Timescale root CA)
CA=$(echo "$CHAIN" | awk '/-----BEGIN CERTIFICATE-----/{buf=""; on=1} on{buf=buf $0 "\n"} /-----END CERTIFICATE-----/{on=0; last=buf} END{printf "%s", last}')
echo "$CA" | openssl x509 -noout -subject | grep -q "ca.timescale.com" \
  || { echo "Unexpected root certificate; not saving."; echo "$CA" | openssl x509 -noout -subject; exit 1; }
{
  echo "// Tiger Data (Timescale) public root CA. Public certificate, safe to commit."
  echo "// Regenerate with: bash scripts/save-tiger-ca.sh"
  printf 'export const TIGER_CA = `%s`;\n' "$CA"
} > src/lib/tiger-ca.ts
echo "Saved src/lib/tiger-ca.ts:"
echo "$CA" | openssl x509 -noout -subject -issuer -enddate
