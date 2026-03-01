/**
 * EchoPrism 3-Tier Pure VLM Perception Pipeline (Electron/TypeScript).
 *
 * Tier 1 — Scene Understanding: dense caption of the full UI screenshot.
 * Tier 2 — Structured Element Grounding: precise coordinates for a described element.
 * Tier 3 — State Verification: handled in echo-prism-agent.ts via verifyStateTransition().
 *
 * All operations are pure VLM — zero DOM access. Only screenshots are used.
 */

import { GoogleGenAI, createPartFromBase64, createPartFromText } from "@google/genai";

export interface ElementLocation {
  center_x: number;
  center_y: number;
  box_2d: [number, number, number, number]; // [y_min, x_min, y_max, x_max] — 0-1000
  label: string;
  confidence: "high" | "medium" | "low";
}

/**
 * Tier 1: Dense caption of the full UI screenshot.
 *
 * Called at the start of each new step (attempt===0) to give the agent
 * a structured understanding of the current screen before it decides what to do.
 *
 * Returns a text description. Returns "" on any failure (fail-safe).
 */
export async function perceiveScene(
  ai: GoogleGenAI,
  screenshot: Buffer,
  model: string
): Promise<string> {
  if (!screenshot || screenshot.length === 0) return "";

  const prompt =
    "Provide a dense caption of this GUI screenshot. Include:\n" +
    "(a) overall layout and structure,\n" +
    "(b) main regions (header, sidebar, content area, footer),\n" +
    "(c) key interactive elements and their spatial relationships,\n" +
    "(d) any embedded images, icons, or badges and their apparent roles.\n" +
    "Be comprehensive but do not hallucinate elements that are not clearly visible.";

  try {
    const response = await Promise.race([
      ai.models.generateContent({
        model,
        contents: [
          createPartFromText(prompt),
          createPartFromBase64(screenshot.toString("base64"), "image/jpeg"),
        ],
        config: {
          temperature: 0.2,
          maxOutputTokens: 512,
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("perceiveScene timeout")), 20000)
      ),
    ]);
    return (response as Awaited<ReturnType<typeof ai.models.generateContent>>).text?.trim() ?? "";
  } catch (e) {
    console.warn("[perception] perceiveScene failed:", e);
    return "";
  }
}

/**
 * Tier 2: Structured element grounding.
 *
 * Given a natural language description of a UI element, returns its precise
 * center coordinates and bounding box in 0-1000 normalized space.
 *
 * Confidence gate: callers should only use returned coordinates when
 * confidence is 'high' or 'medium'.
 *
 * Returns null on any failure (fail-safe — caller uses original coords).
 */
export async function groundElement(
  ai: GoogleGenAI,
  screenshot: Buffer,
  description: string,
  model: string
): Promise<ElementLocation | null> {
  if (!screenshot || screenshot.length === 0 || !description) return null;

  const prompt =
    `Locate the following UI element in the screenshot:\n'${description}'\n\n` +
    "Return the CENTER point and bounding box in normalized coordinates 0-1000 " +
    "where (0,0) is the top-left corner and (1000,1000) is the bottom-right corner.\n" +
    "Set confidence to:\n" +
    "  'high'   — element is clearly visible and unambiguous\n" +
    "  'medium' — element is likely correct but partially obscured or ambiguous\n" +
    "  'low'    — element may not be visible; coordinates are estimated\n" +
    "box_2d format: [y_min, x_min, y_max, x_max] — all values 0-1000.\n\n" +
    "Respond with ONLY valid JSON matching this schema:\n" +
    '{"center_x": number, "center_y": number, "box_2d": [number,number,number,number], ' +
    '"label": string, "confidence": "high"|"medium"|"low"}';

  try {
    const response = await Promise.race([
      ai.models.generateContent({
        model,
        contents: [
          createPartFromText(prompt),
          createPartFromBase64(screenshot.toString("base64"), "image/jpeg"),
        ],
        config: {
          responseMimeType: "application/json",
          temperature: 0.1,
          maxOutputTokens: 256,
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("groundElement timeout")), 20000)
      ),
    ]);

    const text = (response as Awaited<ReturnType<typeof ai.models.generateContent>>).text;
    if (!text) return null;

    const raw = JSON.parse(text.trim());
    const confidence = (raw.confidence ?? "low") as "high" | "medium" | "low";
    return {
      center_x: Math.round(Number(raw.center_x ?? 500)),
      center_y: Math.round(Number(raw.center_y ?? 500)),
      box_2d: (raw.box_2d ?? [400, 400, 600, 600]) as [number, number, number, number],
      label: String(raw.label ?? ""),
      confidence,
    };
  } catch (e) {
    console.warn("[perception] groundElement failed for:", description.slice(0, 60), e);
    return null;
  }
}
