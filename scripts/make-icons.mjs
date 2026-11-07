import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = path.join(root, 'build');
const assetsDir = path.join(root, 'assets');
const sourceIcon = path.join(buildDir, 'icon.png');

// 1. Pack PNG buffers into a multi-size Windows ICO file
function packIco(images) {
  // images: array of { size, buffer }
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = ICO
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + 16 * images.length;
  const entries = Buffer.alloc(16 * images.length);

  for (let i = 0; i < images.length; i++) {
    const { size, buffer } = images[i];
    entries.writeUInt8(size === 256 ? 0 : size, i * 16 + 0); // width
    entries.writeUInt8(size === 256 ? 0 : size, i * 16 + 1); // height
    entries.writeUInt8(0, i * 16 + 2); // color count
    entries.writeUInt8(0, i * 16 + 3); // reserved
    entries.writeUInt16LE(1, i * 16 + 4); // color planes
    entries.writeUInt16LE(32, i * 16 + 6); // bits per pixel
    entries.writeUInt32LE(buffer.length, i * 16 + 8); // image size
    entries.writeUInt32LE(offset, i * 16 + 12); // image offset
    offset += buffer.length;
  }

  return Buffer.concat([header, entries, ...images.map((img) => img.buffer)]);
}

// 2. Generate macOS Template Icons (minimal blocky fish)
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

function encodeTemplatePNG(size, alphaAt) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const i = y * (size * 4 + 1) + 1 + x * 4;
      raw[i] = raw[i + 1] = raw[i + 2] = 0;
      raw[i + 3] = Math.round(255 * Math.min(1, Math.max(0, alphaAt((x + 0.5) / size, (y + 0.5) / size))));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const edge = (d, px) => Math.min(1, Math.max(0, 0.5 - d / px));
const roundBox = (x, y, cx, cy, hw, hh, r) => {
  const dx = Math.abs(x - cx) - hw + r;
  const dy = Math.abs(y - cy) - hh + r;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
};

function fish(x, y, px) {
  const body = edge(roundBox(x, y, 0.44, 0.54, 0.24, 0.18, 0.06), px);
  const tailStem = edge(roundBox(x, y, 0.65, 0.54, 0.08, 0.09, 0.03), px);
  const tailTop = edge(roundBox(x, y, 0.77, 0.42, 0.07, 0.10, 0.03), px);
  const tailBottom = edge(roundBox(x, y, 0.77, 0.66, 0.07, 0.10, 0.03), px);
  const dorsal = edge(roundBox(x, y, 0.42, 0.30, 0.10, 0.08, 0.04), px);
  const eye = edge(roundBox(x, y, 0.28, 0.50, 0.035, 0.035, 0.0), px);
  return Math.max(body, tailStem, tailTop, tailBottom, dorsal) - Math.max(eye, 0);
}

async function run() {
  fs.mkdirSync(buildDir, { recursive: true });
  fs.mkdirSync(assetsDir, { recursive: true });

  if (!fs.existsSync(sourceIcon)) {
    throw new Error('Source icon not found at: ' + sourceIcon);
  }

  console.log('Generating icons from:', sourceIcon);

  // 1. Build multi-size Windows icon.ico (16, 24, 32, 48, 64, 128, 256)
  const icoSizes = [16, 24, 32, 48, 64, 128, 256];
  const icoImages = await Promise.all(
    icoSizes.map(async (size) => ({
      size,
      buffer: await sharp(sourceIcon).resize(size, size).png().toBuffer(),
    }))
  );
  const icoBuffer = packIco(icoImages);
  fs.writeFileSync(path.join(buildDir, 'icon.ico'), icoBuffer);
  console.log('✓ Created build/icon.ico (sizes: ' + icoSizes.join(', ') + ')');

  // 2. Build 256x256 icon
  await sharp(sourceIcon).resize(256, 256).png().toFile(path.join(buildDir, 'icon-256.png'));
  console.log('✓ Created build/icon-256.png (256x256)');

  // 3. Build coloured Windows tray icons (16 and 32 px)
  await sharp(sourceIcon).resize(16, 16).png().toFile(path.join(assetsDir, 'trayWin.png'));
  await sharp(sourceIcon).resize(32, 32).png().toFile(path.join(assetsDir, 'trayWin@2x.png'));
  console.log('✓ Created assets/trayWin.png (16px) and assets/trayWin@2x.png (32px)');

  // 4. macOS template tray icons
  for (const [name, size] of [['trayTemplate.png', 22], ['trayTemplate@2x.png', 44]]) {
    fs.writeFileSync(path.join(assetsDir, name), encodeTemplatePNG(size, (x, y) => fish(x, y, 1 / size)));
  }
  console.log('✓ Created macOS template tray icons in assets/');
}

run().catch((err) => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
