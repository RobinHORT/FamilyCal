import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const svgPath = path.resolve('public/icon.svg');
const svgBuffer = fs.readFileSync(svgPath);

async function generate() {
  console.log('Generating PNG icons from public/icon.svg...');

  // 1. Standard 512x512 PNG
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.resolve('public/pwa-512x512.png'));
  console.log('Created pwa-512x512.png');

  // 2. Standard 192x192 PNG
  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile(path.resolve('public/pwa-192x192.png'));
  console.log('Created pwa-192x192.png');

  // 3. Apple Touch Icon 180x180 PNG (for Safari / iOS / iPadOS Add to Home Screen)
  await sharp(svgBuffer)
    .resize(180, 180)
    .png()
    .toFile(path.resolve('public/apple-touch-icon.png'));
  console.log('Created apple-touch-icon.png');

  // 4. Favicon 32x32 and 16x16 PNG
  await sharp(svgBuffer)
    .resize(32, 32)
    .png()
    .toFile(path.resolve('public/favicon-32x32.png'));
  await sharp(svgBuffer)
    .resize(16, 16)
    .png()
    .toFile(path.resolve('public/favicon-16x16.png'));
  console.log('Created favicon-32x32.png and favicon-16x16.png');

  // 5. Maskable Icon 512x512 & 192x192
  // Safe zone for maskable icon is the inner 80% (approx 410px centered on 512px canvas with #121620 background)
  const innerArt512 = await sharp(svgBuffer)
    .resize(410, 410)
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: '#121620',
    },
  })
    .composite([{ input: innerArt512, gravity: 'center' }])
    .png()
    .toFile(path.resolve('public/pwa-maskable-512x512.png'));
  console.log('Created pwa-maskable-512x512.png');

  const innerArt192 = await sharp(svgBuffer)
    .resize(154, 154)
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: 192,
      height: 192,
      channels: 4,
      background: '#121620',
    },
  })
    .composite([{ input: innerArt192, gravity: 'center' }])
    .png()
    .toFile(path.resolve('public/pwa-maskable-192x192.png'));
  console.log('Created pwa-maskable-192x192.png');

  console.log('All icons generated successfully!');
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});
