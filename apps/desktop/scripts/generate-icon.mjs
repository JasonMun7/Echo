#!/usr/bin/env node
/**
 * Generates a square app icon from the Echo logo.
 * Centers the logo on a 1024x1024 canvas at ~75% scale so the logo
 * keeps its aspect ratio and is not scaled or squashed.
 *
 * Output: build/icon.png (used by electron-builder for macOS/Windows/Linux).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const logoPath = path.join(root, "src/renderer/assets/echo_logo.png");
const outDir = path.join(root, "build");
const outPath = path.join(outDir, "icon.png");

const SIZE = 1024;
const LOGO_MAX_FRACTION = 0.75; // logo fits in 75% of canvas (padding on all sides)

async function main() {
  const image = sharp(logoPath);
  const meta = await image.metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h) {
    throw new Error("Could not read logo dimensions");
  }

  const maxLogoSize = Math.floor(SIZE * LOGO_MAX_FRACTION);
  const scale = Math.min(maxLogoSize / w, maxLogoSize / h, 1);
  const scaledW = Math.round(w * scale);
  const scaledH = Math.round(h * scale);
  const x = Math.round((SIZE - scaledW) / 2);
  const y = Math.round((SIZE - scaledH) / 2);

  const resizedLogo = await image.resize(scaledW, scaledH).toBuffer();

  fs.mkdirSync(outDir, { recursive: true });

  await sharp({
    create: {
      width: SIZE,
      height: SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: resizedLogo, left: x, top: y }])
    .png()
    .toFile(outPath);

  console.log("Generated", outPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
