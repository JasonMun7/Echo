/**
 * Normalize app title strings that models sometimes emit as pseudo-keyword args
 * (e.g. `appName='Discord'`) after confusing placeholders in prompts.
 */
export function coerceOpenAppDisplayName(raw: string): string {
  const s = raw.trim();
  if (!s) return s;
  const m = /^(?:appName|app)\s*=\s*/i.exec(s);
  if (!m) return s;
  let rest = s.slice(m[0].length).trim();
  if (!rest) return "";
  const q = rest[0];
  if (q === '"' || q === "'") {
    let i = 1;
    let out = "";
    while (i < rest.length) {
      const c = rest[i]!;
      if (c === "\\" && i + 1 < rest.length) {
        out += rest[i + 1]!;
        i += 2;
      } else if (c === q) {
        return out;
      } else {
        out += c;
        i += 1;
      }
    }
    return out;
  }
  const cut = rest.search(/[\s,]/);
  return cut === -1 ? rest : rest.slice(0, cut);
}
