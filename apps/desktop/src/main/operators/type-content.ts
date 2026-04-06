/**
 * UI-TARS / EchoPrism convention for type(content='...'):
 * strip a trailing \\n or newline from the typed body, then press Enter only when
 * the raw string ended with \\n (submit). Matches desktop-operator NutJS behavior.
 */
export function parseUiTarsTypeContent(raw: unknown): { body: string; submit: boolean } {
  const rawContent = String(raw ?? "");
  const body = rawContent.replace(/\\n$/, "").replace(/\n$/, "");
  const submit = rawContent.endsWith("\n") || rawContent.endsWith("\\n");
  return { body, submit };
}
