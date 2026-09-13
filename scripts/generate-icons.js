import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const svgPath = path.resolve('public/icon.svg');
const svgBuffer = fs.readFileSync(svgPath);

// Solid background vector for Apple Touch Icon & Maskable PWA icons (inner 80% safe zone)
const maskableSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none">
  <!-- Solid background matching card background (#F9FAFB) -->
  <rect width="512" height="512" fill="#F9FAFB"/>
  <!-- 4 Colored Dots Grid scaled within the central safe zone -->
  <g transform="translate(256, 256) scale(0.76) translate(-256, -256)">
    <circle cx="160" cy="160" r="80" fill="#EC4899" />
    <circle cx="352" cy="160" r="80" fill="#3B82F6" />
    <circle cx="160" cy="352" r="80" fill="#EAB308" />
    <circle cx="352" cy="352" r="80" fill="#22C55E" />
  </g>
</svg>
`.trim();
const maskableSvgBuffer = Buffer.from(maskableSvg);

async function generate() {
  console.log('Generating PNG branding icons from FamilyCal logo source (public/icon.svg)...');

  // 1. Standard 512x512 PNG
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.resolve('public/pwa-512x512.png'));
  console.log('Created public/pwa-512x512.png');

  // 2. Standard 192x192 PNG
  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile(path.resolve('public/pwa-192x192.png'));
  console.log('Created public/pwa-192x192.png');

  // 3. Apple Touch Icon 180x180 PNG (opaque solid background for iOS / iPadOS home screen)
  await sharp(maskableSvgBuffer)
    .resize(180, 180)
    .png()
    .toFile(path.resolve('public/apple-touch-icon.png'));
  console.log('Created public/apple-touch-icon.png');

  // 4. Favicon 32x32 and 16x16 PNG
  await sharp(svgBuffer)
    .resize(32, 32)
    .png()
    .toFile(path.resolve('public/favicon-32x32.png'));
  await sharp(svgBuffer)
    .resize(16, 16)
    .png()
    .toFile(path.resolve('public/favicon-16x16.png'));
  console.log('Created public/favicon-32x32.png and public/favicon-16x16.png');

  // 5. Maskable Icon 512x512 & 192x192 (guaranteed inside 80% safe zone with #F9FAFB background)
  await sharp(maskableSvgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.resolve('public/pwa-maskable-512x512.png'));
  console.log('Created public/pwa-maskable-512x512.png');

  await sharp(maskableSvgBuffer)
    .resize(192, 192)
    .png()
    .toFile(path.resolve('public/pwa-maskable-192x192.png'));
  console.log('Created public/pwa-maskable-192x192.png');

  console.log('All FamilyCal branding icons generated successfully!');
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});
