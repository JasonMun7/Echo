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

  const path = `${domain}/w/${LOGO_PX}/h/${LOGO_PX}/type/icon`;
  const params = new URLSearchParams({ c: clientId });
  return `https://cdn.brandfetch.io/${path}?${params.toString()}`;
}
