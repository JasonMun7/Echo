/**
 * Token optimization for screenshot-heavy workloads.
 * Resize/downscale to max dimension, JPEG compression.
 * Returns { buffer, mimeType } so caller sends correct MIME (avoids Gemini "Unable to process input image").
 */

import sharp from "sharp";

export interface CompressedImage {
  buffer: Buffer;
  mimeType: "image/jpeg" | "image/png";
}

export interface CompressOptions {
  maxDim?: number;   // Default 1280; use 768 for verify/state-transition screenshots
  quality?: number;  // JPEG quality 1-100, default 85
}

export async function compressScreenshot(
  data: Buffer,
  opts: CompressOptions = {}
): Promise<CompressedImage> {
  const maxDim = opts.maxDim ?? 1280;
  const quality = opts.quality ?? 85;

  if (!data || data.length === 0) {
    throw new Error("Empty screenshot buffer");
  }
  try {
    const img = sharp(data);
    const meta = await img.metadata();
    const w = meta.width ?? 1920;
    const h = meta.height ?? 1080;
    if (w < 10 || h < 10) {
      throw new Error("Screenshot dimensions too small");
    }
    let out: Buffer;
    if (w <= maxDim && h <= maxDim) {
      out = await img.jpeg({ quality }).toBuffer();
    } else {
      const scale = Math.min(maxDim / w, maxDim / h);
      const newW = Math.max(10, Math.round(w * scale));
      const newH = Math.max(10, Math.round(h * scale));
      out = await img.resize(newW, newH).jpeg({ quality }).toBuffer();
    }
    if (!out || out.length === 0) throw new Error("Compression produced empty output");
    return { buffer: out, mimeType: "image/jpeg" };
  } catch {
    // sharp failed (e.g. corrupt PNG) - send original as PNG with correct MIME
    if (data.length < 100) throw new Error("Screenshot too small to send");
    if (data.length > 4 * 1024 * 1024) throw new Error("Fallback PNG is too large (>4MB) to send to Gemini");
    return { buffer: data, mimeType: "image/png" };
  }
}

export function buildContext(
  history: Array<{ screenshot?: Buffer; observation?: Buffer; thought?: string; action?: string; t?: string; a?: string }>,
  nImages = 2,
  summarizeOlder = true
): { screenshots: Buffer[]; summary: string } {
  if (!history.length) return { screenshots: [], summary: "" };
  const recent = history.length >= nImages ? history.slice(-nImages) : history;
  const screenshots: Buffer[] = [];
  for (const entry of recent) {
    const buf = entry.screenshot ?? entry.observation;
    if (Buffer.isBuffer(buf)) screenshots.push(buf);
  }
  let summary = "";
  if (summarizeOlder && history.length > nImages) {
    const older = history.slice(0, -nImages);
    const parts = older.map((e, i) => {
      const thought = e.thought ?? e.t ?? "";
      const action = e.action ?? e.a ?? "";
      if (thought || action) {
        // Truncate action to 80 chars to limit token cost
        return `Step ${i + 1}: Thought: ${String(thought).slice(0, 200)}... Action: ${String(action).slice(0, 80)}`;
      }
      return "";
    });
    summary = parts.filter(Boolean).join("\n");
  }
  return { screenshots, summary };
}
