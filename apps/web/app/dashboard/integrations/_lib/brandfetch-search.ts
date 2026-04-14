/**
 * Brand Search API — browser calls with public client id (see Brandfetch docs).
 * https://api.brandfetch.io/v2/search/{name}?c={clientId}
 */

export type BrandSearchHit = {
  icon: string | null;
  name: string | null;
  domain: string;
  claimed?: boolean;
  brandId?: string;
};

/** Display name for workflow `app` when Brand Search returns only a domain. */
export function displayNameFromBrandHit(hit: BrandSearchHit): string {
  const n = (hit.name || "").trim();
  if (n) return n;
  const host = (hit.domain || "").split(".")[0] || hit.domain;
  if (!host) return "";
  return host.charAt(0).toUpperCase() + host.slice(1).toLowerCase();
}

export async function searchBrandsByName(
  query: string,
  signal?: AbortSignal,
): Promise<BrandSearchHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const clientId = (process.env.NEXT_PUBLIC_BRANDFETCH_CLIENT_ID || "").trim();
  if (!clientId) return [];

  const path = encodeURIComponent(q);
  const url = `https://api.brandfetch.io/v2/search/${path}?c=${encodeURIComponent(clientId)}`;
  let res: Response;
  try {
    res = await fetch(url, { signal });
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    return [];
  }
  if (!res.ok) return [];
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) return [];
  const out: BrandSearchHit[] = [];
  for (const row of data) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const domain = typeof o.domain === "string" ? o.domain.trim() : "";
    if (!domain) continue;
    const hit: BrandSearchHit = {
      icon: typeof o.icon === "string" ? o.icon : null,
      name: typeof o.name === "string" ? o.name : null,
      domain,
    };
    if (typeof o.claimed === "boolean") hit.claimed = o.claimed;
    if (typeof o.brandId === "string") hit.brandId = o.brandId;
    out.push(hit);
  }
  return out;
}
