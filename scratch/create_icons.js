import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// 1. Create SVG Icon
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="100" fill="#1e1e24"/>
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#d9725b" />
      <stop offset="100%" stop-color="#e76f51" />
    </linearGradient>
  </defs>
  <!-- Dumbbell Icon -->
  <g fill="none" stroke="url(#grad)" stroke-width="32" stroke-linecap="round" stroke-linejoin="round">
    <!-- Left Weight -->
    <rect x="80" y="176" width="48" height="160" rx="16" fill="#d9725b" />
    <rect x="128" y="208" width="32" height="96" rx="12" fill="#e76f51" />
    <!-- Right Weight -->
    <rect x="384" y="176" width="48" height="160" rx="16" fill="#d9725b" />
    <rect x="352" y="208" width="32" height="96" rx="12" fill="#e76f51" />
    <!-- Barbell Shaft -->
    <line x1="160" y1="256" x2="352" y2="256" stroke="url(#grad)" stroke-width="36" />
    <!-- Center Grip Ring -->
    <circle cx="256" cy="256" r="24" fill="#faf6f0" />
  </g>
</svg>`;

fs.writeFileSync(path.join(publicDir, 'favicon.svg'), svgContent, 'utf8');
fs.writeFileSync(path.join(publicDir, 'icon.svg'), svgContent, 'utf8');

// Function to generate a simple uncompressed PNG file in pure JS
import zlib from 'zlib';

function makePng(width, height, renderPixel) {
  // PNG signature
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // Bit depth: 8
  ihdrData[9] = 6; // Color type: RGBA
  ihdrData[10] = 0; // Compression
  ihdrData[11] = 0; // Filter
  ihdrData[12] = 0; // Interlace
  const ihdr = makeChunk('IHDR', ihdrData);

  // IDAT chunk (raw RGBA pixels with filter byte 0 per scanline)
  const scanlineSize = 1 + width * 4;
  const rawBuf = Buffer.alloc(height * scanlineSize);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * scanlineSize;
    rawBuf[rowOffset] = 0; // Filter type 0: None
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = renderPixel(x, y, width, height);
      const pxOffset = rowOffset + 1 + x * 4;
      rawBuf[pxOffset] = r;
      rawBuf[pxOffset + 1] = g;
      rawBuf[pxOffset + 2] = b;
      rawBuf[pxOffset + 3] = a;
    }
  }

  const deflated = zlib.deflateSync(rawBuf);
  const idat = makeChunk('IDAT', deflated);

  // IEND chunk
  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdr, idat, iend]);
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const bufToCrc = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(bufToCrc), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

// Simple CRC32 implementation
function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Render pixel logic for ForgeGym Logo (Dark theme rounded square with orange dumbbell)
function gymPixel(x, y, w, h) {
  const nx = x / w;
  const ny = y / h;

  // Background rounded rectangle
  const cx = Math.abs(nx - 0.5);
  const cy = Math.abs(ny - 0.5);
  if (cx > 0.46 || cy > 0.46 || (cx > 0.36 && cy > 0.36 && Math.hypot(cx - 0.36, cy - 0.36) > 0.1)) {
    return [0, 0, 0, 0]; // Transparent padding
  }

  // Dark background #1e1e24
  let bgR = 0x1e, bgG = 0x1e, bgB = 0x24;

  // Dumbbell Bar (y centered)
  if (Math.abs(ny - 0.5) < 0.04 && nx >= 0.25 && nx <= 0.75) {
    return [0xd9, 0x72, 0x5b, 255];
  }

  // Left Weight Plate 1
  if (Math.abs(ny - 0.5) < 0.16 && nx >= 0.16 && nx <= 0.26) {
    return [0xd9, 0x72, 0x5b, 255];
  }
  // Left Weight Plate 2
  if (Math.abs(ny - 0.5) < 0.10 && nx >= 0.26 && nx <= 0.32) {
    return [0xe7, 0x6f, 0x51, 255];
  }

  // Right Weight Plate 1
  if (Math.abs(ny - 0.5) < 0.16 && nx >= 0.74 && nx <= 0.84) {
    return [0xd9, 0x72, 0x5b, 255];
  }
  // Right Weight Plate 2
  if (Math.abs(ny - 0.5) < 0.10 && nx >= 0.68 && nx <= 0.74) {
    return [0xe7, 0x6f, 0x51, 255];
  }

  // Center Grip Circle
  if (Math.hypot(nx - 0.5, ny - 0.5) < 0.06) {
    return [0xfa, 0xf6, 0xf0, 255];
  }

  return [bgR, bgG, bgB, 255];
}

console.log('Generating PNG icons...');
const png192 = makePng(192, 192, gymPixel);
fs.writeFileSync(path.join(publicDir, 'icon-192.png'), png192);

const png512 = makePng(512, 512, gymPixel);
fs.writeFileSync(path.join(publicDir, 'icon-512.png'), png512);
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), png512);

console.log('Icons successfully created in public directory!');
