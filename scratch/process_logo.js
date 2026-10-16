import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcImgPath = 'C:/Users/riyaj/.gemini/antigravity-ide/brain/b468e6bc-b412-4c68-b0fa-04f661aa159d/.user_uploaded/media_1791900473515.png';
const publicDir = path.join(__dirname, '..', 'public');

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

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

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const bufToCrc = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(bufToCrc), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function decodePng(buf) {
  let pos = 8;
  let width, height;
  let idatBuffers = [];

  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.slice(pos + 4, pos + 8).toString('ascii');
    const data = buf.slice(pos + 8, pos + 8 + len);
    pos += 12 + len;

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
    } else if (type === 'IDAT') {
      idatBuffers.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  const inflated = zlib.inflateSync(Buffer.concat(idatBuffers));
  const stride = 1 + width * 4;
  const raw = Buffer.alloc(width * height * 4);

  function paeth(a, b, c) {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
  }

  for (let y = 0; y < height; y++) {
    const filter = inflated[y * stride];
    const inRow = y * stride + 1;
    const outRow = y * width * 4;
    const prevOutRow = (y - 1) * width * 4;

    for (let x = 0; x < width * 4; x++) {
      const val = inflated[inRow + x];
      const a = x >= 4 ? raw[outRow + x - 4] : 0;
      const b = y > 0 ? raw[prevOutRow + x] : 0;
      const c = (y > 0 && x >= 4) ? raw[prevOutRow + x - 4] : 0;

      let res = val;
      if (filter === 1) res = (val + a) & 0xff;
      else if (filter === 2) res = (val + b) & 0xff;
      else if (filter === 3) res = (val + Math.floor((a + b) / 2)) & 0xff;
      else if (filter === 4) res = (val + paeth(a, b, c)) & 0xff;

      raw[outRow + x] = res;
    }
  }

  return { width, height, raw };
}

function resizeBilinear(srcRaw, srcW, srcH, dstW, dstH) {
  const dst = Buffer.alloc(dstW * dstH * 4);
  const xRatio = (srcW - 1) / (dstW - 1 || 1);
  const yRatio = (srcH - 1) / (dstH - 1 || 1);

  for (let y = 0; y < dstH; y++) {
    const srcY = y * yRatio;
    const y0 = Math.floor(srcY);
    const y1 = Math.min(y0 + 1, srcH - 1);
    const dy = srcY - y0;

    for (let x = 0; x < dstW; x++) {
      const srcX = x * xRatio;
      const x0 = Math.floor(srcX);
      const x1 = Math.min(x0 + 1, srcW - 1);
      const dx = srcX - x0;

      const idx00 = (y0 * srcW + x0) * 4;
      const idx10 = (y0 * srcW + x1) * 4;
      const idx01 = (y1 * srcW + x0) * 4;
      const idx11 = (y1 * srcW + x1) * 4;

      const dstIdx = (y * dstW + x) * 4;

      for (let c = 0; c < 4; c++) {
        const top = srcRaw[idx00 + c] * (1 - dx) + srcRaw[idx10 + c] * dx;
        const bot = srcRaw[idx01 + c] * (1 - dx) + srcRaw[idx11 + c] * dx;
        dst[dstIdx + c] = Math.round(top * (1 - dy) + bot * dy);
      }
    }
  }
  return dst;
}

function encodePng(width, height, rawRgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 6;
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const ihdr = makeChunk('IHDR', ihdrData);

  const scanlineSize = 1 + width * 4;
  const scanlines = Buffer.alloc(height * scanlineSize);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * scanlineSize;
    scanlines[rowOffset] = 0;
    rawRgba.copy(scanlines, rowOffset + 1, y * width * 4, (y + 1) * width * 4);
  }

  const idat = makeChunk('IDAT', zlib.deflateSync(scanlines));
  const iend = makeChunk('IEND', Buffer.alloc(0));
  return Buffer.concat([sig, ihdr, idat, iend]);
}

// 1. Read source image
const rawFile = fs.readFileSync(srcImgPath);
// Save full quality copy as logo.png
fs.writeFileSync(path.join(publicDir, 'logo.png'), rawFile);
console.log('Saved public/logo.png');

// 2. Decode and resize
const decoded = decodePng(rawFile);
console.log(`Decoded source: ${decoded.width}x${decoded.height}`);

const raw192 = resizeBilinear(decoded.raw, decoded.width, decoded.height, 192, 192);
const png192 = encodePng(192, 192, raw192);
fs.writeFileSync(path.join(publicDir, 'icon-192.png'), png192);
console.log('Generated public/icon-192.png');

const raw512 = resizeBilinear(decoded.raw, decoded.width, decoded.height, 512, 512);
const png512 = encodePng(512, 512, raw512);
fs.writeFileSync(path.join(publicDir, 'icon-512.png'), png512);
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), png512);
console.log('Generated public/icon-512.png and public/apple-touch-icon.png');

// 3. Create SVG wrapper for favicon.svg and icon.svg
const b64 = rawFile.toString('base64');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 272 272" width="272" height="272">
  <image width="272" height="272" xlink:href="data:image/png;base64,${b64}" />
</svg>`;
fs.writeFileSync(path.join(publicDir, 'favicon.svg'), svg, 'utf8');
fs.writeFileSync(path.join(publicDir, 'icon.svg'), svg, 'utf8');
console.log('Generated public/favicon.svg and public/icon.svg');

console.log('All icons successfully created with new bear logo!');
