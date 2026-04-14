/**
 * Brandfetch Logo API — browser hotlink URLs only (see Brandfetch docs).
 * Use the same path shape as their examples: `{domain}/w/{w}/h/{h}/type/icon`
 * (not `domain/{domain}/...` with extra segments — that can mis-parse on the CDN).
 */

const INTEGRATION_ID_TO_DOMAIN: Record<string, string> = {
  slack: "slack.com",
  github: "github.com",
  google: "google.com",
  gmail: "gmail.com",
};

/** Pixel size for the logo asset (2× CSS ~36px for retina). */
const LOGO_PX = 72;

/**
 * Returns a Brandfetch CDN URL for the integration catalog id, or null if
 * unmapped or `NEXT_PUBLIC_BRANDFETCH_CLIENT_ID` is missing.
 */
export function brandfetchLogoUrlForIntegrationId(id: string): string | null {
  const clientId = (process.env.NEXT_PUBLIC_BRANDFETCH_CLIENT_ID || "").trim();
  if (!clientId) return null;

  const domain = INTEGRATION_ID_TO_DOMAIN[(id || "").trim().toLowerCase()];
  if (!domain) return null;

  return brandfetchLogoUrlForDomain(domain);
}

/**
 * Normalize user input or Brand Search `domain` (e.g. `https://www.notion.so/foo` → `notion.so`).
 */
export function normalizeBrandDomain(raw: string): string | null {
  const t = (raw || "").trim().toLowerCase();
  if (!t) return null;
  try {
    const u = t.includes("://") ? new URL(t) : new URL(`https://${t}`);
    let host = u.hostname.replace(/^www\./, "");
    if (!host || !host.includes(".")) return null;
    return host;
  } catch {
    const stripped = t
      .replace(/^www\./, "")
      .split("/")[0]
      ?.split("?")[0];
    if (!stripped || !stripped.includes(".")) return null;
    return stripped;
  }
}

/**
 * Logo API hotlink for a website domain (same CDN pattern as Brandfetch docs).
 * Returns null if client id is missing or domain is empty.
 */
export function brandfetchLogoUrlForDomain(domain: string): string | null {
  const clientId = (process.env.NEXT_PUBLIC_BRANDFETCH_CLIENT_ID || "").trim();
  if (!clientId) return null;

  const normalized = normalizeBrandDomain(domain);
  if (!normalized) return null;

  const path = `${normalized}/w/${LOGO_PX}/h/${LOGO_PX}/type/icon`;
  const params = new URLSearchParams({ c: clientId });
  return `https://cdn.brandfetch.io/${path}?${params.toString()}`;
}

/**
 * Maps a Composio tool slug (e.g. `GMAIL_SEND_EMAIL`) to a catalog integration id for Brandfetch.
 */
export function integrationIdFromComposioSlug(slug: string): string | null {
  const u = (slug || "").trim().toUpperCase();
  if (!u) return null;
  if (u.startsWith("GMAIL")) return "gmail";
  if (u.startsWith("SLACK")) return "slack";
  if (u.startsWith("GITHUB")) return "github";
  if (u.startsWith("GOOGLE")) return "google";
  return null;
}
