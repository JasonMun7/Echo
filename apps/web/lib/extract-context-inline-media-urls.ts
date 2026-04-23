/**
 * URLs embedded in step context as markdown images or HTML img tags (e.g. from synthesis).
 * Used only for composer preview thumbnails — not a full HTML/markdown parser.
 */

export function inlineUrlKey(url: string): string {
  let h = 0;
  for (let i = 0; i < url.length; i++) {
    h = (Math.imul(31, h) + url.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

/** Deduped https? URLs from `![alt](url)` and `<img src="url">` (case-insensitive). */
export function extractInlineHttpsImageUrls(text: string): string[] {
  if (!text.trim()) return [];
  const seen = new Set<string>();
  const ordered: string[] = [];
  const add = (raw: string | undefined) => {
    const u = (raw ?? "").trim();
    if (!u || !/^https?:\/\//i.test(u) || seen.has(u)) return;
    seen.add(u);
    ordered.push(u);
  };

  for (const m of text.matchAll(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/gi)) {
    add(m[1]);
  }
  for (const m of text.matchAll(/<img\b[^>]*\bsrc\s*=\s*["'](https?:\/\/[^"'\s>]+)["']/gi)) {
    add(m[1]);
  }
  return ordered;
}
