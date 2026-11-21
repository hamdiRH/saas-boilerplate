// Generates the PWA icon set from docs/brand/nexora-icon-source.png.
// Uses Playwright's Chromium (already a devDependency) so no image library is needed.
// Run: pnpm pwa:icons   (needs `pnpm exec playwright install chromium` once)
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright';

const SOURCE = 'docs/brand/nexora-icon-source.png';
const OUT_DIR = 'public/icons';
const BRAND_BACKGROUND = '#0F172A';

/**
 * scale = share of the canvas the mark's visible area (transparent margins trimmed) may use.
 * Maskable icons keep the mark inside the central safe zone (platforms crop up to ~20%).
 */
const TARGETS = [
  { background: null, file: 'icon-192.png', scale: 0.88, size: 192 },
  { background: null, file: 'icon-512.png', scale: 0.88, size: 512 },
  { background: BRAND_BACKGROUND, file: 'icon-maskable-512.png', scale: 0.58, size: 512 },
  { background: BRAND_BACKGROUND, file: 'apple-touch-icon.png', scale: 0.68, size: 180 },
];

const render = (page, dataUrl, { background, scale, size }) =>
  page.evaluate(
    async ({ background: bg, dataUrl: src, scale: ratio, size: edge }) => {
      const image = new Image();
      image.src = src;
      await image.decode();

      const canvas = document.createElement('canvas');
      canvas.width = edge;
      canvas.height = edge;
      const context = canvas.getContext('2d');
      if (bg) {
        context.fillStyle = bg;
        context.fillRect(0, 0, edge, edge);
      }
      // Trim the source's transparent margins so `scale` refers to the visible mark.
      const probe = document.createElement('canvas');
      probe.width = image.width;
      probe.height = image.height;
      const probeContext = probe.getContext('2d');
      probeContext.drawImage(image, 0, 0);
      const { data } = probeContext.getImageData(0, 0, image.width, image.height);
      let [left, top, right, bottom] = [image.width, image.height, 0, 0];
      for (let y = 0; y < image.height; y += 1) {
        for (let x = 0; x < image.width; x += 1) {
          if (data[(y * image.width + x) * 4 + 3] > 8) {
            left = Math.min(left, x);
            right = Math.max(right, x);
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
          }
        }
      }
      const cropWidth = right - left + 1;
      const cropHeight = bottom - top + 1;

      context.imageSmoothingQuality = 'high';
      const box = edge * ratio;
      const fit = Math.min(box / cropWidth, box / cropHeight);
      const width = cropWidth * fit;
      const height = cropHeight * fit;
      context.drawImage(
        image,
        left,
        top,
        cropWidth,
        cropHeight,
        (edge - width) / 2,
        (edge - height) / 2,
        width,
        height,
      );
      return canvas.toDataURL('image/png');
    },
    { background, dataUrl, scale, size },
  );

const main = async () => {
  const source = await readFile(SOURCE);
  const dataUrl = `data:image/png;base64,${source.toString('base64')}`;
  await mkdir(OUT_DIR, { recursive: true });

  // CHROMIUM_PATH is optional: point it at an existing Chromium/Chrome instead of Playwright's download.
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><html><body></body></html>');
    const rendered = await Promise.all(
      TARGETS.map(async (target) => ({ data: await render(page, dataUrl, target), target })),
    );
    await Promise.all(
      rendered.map(({ data, target }) =>
        writeFile(
          path.join(OUT_DIR, target.file),
          Buffer.from(data.replace(/^data:image\/png;base64,/u, ''), 'base64'),
        ),
      ),
    );
    for (const { target } of rendered) {
      console.log(`✅ ${OUT_DIR}/${target.file} (${target.size}×${target.size})`);
    }
  } finally {
    await browser.close();
  }
};

try {
  await main();
} catch (error) {
  console.error(
    '❌ Icon generation failed:',
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
}
