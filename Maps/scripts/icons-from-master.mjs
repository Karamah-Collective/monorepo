// icons-from-master.mjs — Phase 4 icon generation.
// Single source of truth: Maps/docs/guide-images/icon.png (the master brand
// icon: 1024×1024, 8-bit, colorType 2 RGB, non-interlaced). This script decodes
// it with Node's built-in zlib (PNG chunk parse + inflate + per-row applied
// de-filter for filter types 0–4) and writes every native raster the Capacitor
// Android + iOS shells expect, plus the web manifest favicon, into the folders
// that `cap sync` copies verbatim into the bundles.
//
// Zero hard runtime deps: node:fs / node:path / node:zlib only. Downscales are
// area-averaged (no nearest-neighbour smear). Alpha is always opaque 255.
//
// Usage: node scripts/icons-from-master.mjs   (run from Maps/)

import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";

// Anchor every path to the Maps/ directory (one level above this script).
// fileURLToPath handles Windows drive-letter paths correctly; the URL
// .pathname form would double the drive on Windows.
import { fileURLToPath } from "node:url";
const MAPS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ————— CRC32 —————
const crcTable = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  // writeUInt32BE (Buffer method) — not a DataView over buf.buffer.slice(0),
  // which left the bytes 00000000 on this Node and produced invalid chunks.
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const lenB = Buffer.alloc(4);
  lenB.writeUInt32BE(data.length);
  const crcB = Buffer.alloc(4);
  crcB.writeUInt32BE(crc32(td));
  return Buffer.concat([lenB, td, crcB]);
}

// ————— PNG encode (truecolour RGBA, 8-bit) —————
function pngEncode(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  let p = 0;
  for (let y = 0; y < h; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < w * 4; x++) raw[p++] = rgba[y * w * 4 + x];
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, 6)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ————— PNG decode (non-interlaced, 8-bit) —————
// Parses a PNG file into a top-down RGBA buffer: walks chunks, reads the
// IHDR geometry, concatenates IDAT and inflates, then de-filters scanlines
// per PNG spec filter types 0–4 (the only types 8-bit non-interlaced data
// uses). Source is colorType 2 (RGB, no alpha) so every scanline is
// 1 + w*3 bytes and output alpha is opaque 255. Inputs with a PLTE chunk
// are rejected (this branch never emits indexed source).
const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];
function pngDecode(file) {
  if (!file.subarray(0, 8).equals(Buffer.from(PNG_SIG))) throw new Error("Not a PNG signature");
  let off = 8;
  let w = 0, h = 0, bitDepth = 0, colorType = 0, idat = [];
  while (off + 8 <= file.length) {
    const len = file.readUInt32BE(off);
    const type = Buffer.from(file.subarray(off + 4, off + 8)).toString("ascii");
    const data = file.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      if (len < 13) throw new Error("Bad IHDR");
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
      const interlace = data[12];
      if (interlace !== 0) throw new Error("Interlaced PNG unsupported");
      if (bitDepth !== 8) throw new Error(`Unsupported bit depth ${bitDepth}`);
      if (colorType !== 2) throw new Error(`Unsupported colorType ${colorType} (expected 2)`);
    } else if (type === "PLTE") {
      throw new Error("Palette PNG unsupported");
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    off += 8 + len + 4; // CRC after chunk data; walk past it
  }
  if (!w || !h) throw new Error("No complete IHDR");
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const channels = 3; // colorType 2: RGB
  const stride = w * channels;
  if (raw.length !== (stride + 1) * h) {
    throw new Error(`Inflate size mismatch: got ${raw.length}, expected ${(stride + 1) * h}`);
  }
  const out = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const rowStart = y * (stride + 1);
    const filter = raw[rowStart];
    const row = raw.subarray(rowStart + 1, rowStart + 1 + stride);
    const recon = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? recon[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let val;
      switch (filter) {
        case 0: val = row[x]; break;                          // None
        case 1: val = row[x] + a; break;                      // Sub
        case 2: val = row[x] + b; break;                      // Up
        case 3: val = row[x] + ((a + b) >> 1); break;         // Average
        case 4: {                                             // Paeth
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          val = row[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error(`Unknown PNG filter type ${filter} at row ${y}`);
      }
      recon[x] = val & 0xff;
    }
    for (let px = 0; px < w; px++) {
      const di = (y * w + px) * 4;
      out[di] = recon[px * 3];
      out[di + 1] = recon[px * 3 + 1];
      out[di + 2] = recon[px * 3 + 2];
      out[di + 3] = 255;
    }
    prev = recon;
  }
  return { width: w, height: h, rgba: out };
}

// ————— area-average downscale (higher quality than nearest for ≤5.3x) —————
function downscale(src, srcW, srcH, dstW, dstH) {
  const out = Buffer.alloc(dstW * dstH * 4);
  for (let y = 0; y < dstH; y++) {
    const syTop = (y * srcH) / dstH;
    const syBot = ((y + 1) * srcH) / dstH;
    const y0 = Math.floor(syTop), y1 = Math.max(y0, Math.min(srcH - 1, Math.ceil(syBot) - 1));
    const yFrac0 = Math.min(1, y0 + 1 - syTop);
    const yFrac1 = Math.min(1, syBot - y1);
    for (let x = 0; x < dstW; x++) {
      const sxLeft = (x * srcW) / dstW;
      const sxRight = ((x + 1) * srcW) / dstW;
      const x0 = Math.floor(sxLeft), x1 = Math.max(x0, Math.min(srcW - 1, Math.ceil(sxRight) - 1));
      const xFrac0 = Math.min(1, x0 + 1 - sxLeft);
      const xFrac1 = Math.min(1, sxRight - x1);
      let r = 0, g = 0, b = 0, a = 0, wsum = 0;
      for (let sy = y0; sy <= y1; sy++) {
        const wy = sy === y0 ? yFrac0 : sy === y1 ? yFrac1 : 1;
        for (let sx = x0; sx <= x1; sx++) {
          const wx = sx === x0 ? xFrac0 : sx === x1 ? xFrac1 : 1;
          const w = wx * wy;
          const si = (sy * srcW + sx) * 4;
          r += src[si] * w; g += src[si + 1] * w; b += src[si + 2] * w; a += src[si + 3] * w;
          wsum += w;
        }
      }
      const di = (y * dstW + x) * 4;
      out[di] = Math.round(r / wsum); out[di + 1] = Math.round(g / wsum);
      out[di + 2] = Math.round(b / wsum); out[di + 3] = Math.round(a / wsum);
    }
  }
  return out;
}

// ————— main —————
const png = await fs.readFile(path.join(MAPS, "docs", "guide-images", "icon.png"));
const { rgba, width } = pngDecode(png);
console.log(`Decoded ${width}x${width} master from docs/guide-images/icon.png`);

// ——— assemble targets ———
// Generic: make(w, h, classifier) → {name, rgba}
function make(w, h) {
  const srcSide = width;
  if (w === srcSide && h === srcSide) return { w, h, rgba };
  return { w, h, rgba: downscale(rgba, srcSide, srcSide, w, h) };
}

const targets = [];
function add(dir, names, w, h) {
  const { w: ww, h: hh, rgba: rr } = make(w, h);
  for (const n of names) targets.push({ dir, name: n, w: ww, h: hh, rgba: rr });
}

// Android launcher (fullbleed square). Capacitor 8 template ships these names;
// mdpi=48 → density buckets. Nominal px per bucket: mdpi48 hdpi72 xhdpi96
// xxhdpi144 xxxhdpi192. Cap creates xxxhdpi 192 but Android scales whatever
// is present; we fill every bucket at its exact nominal px.
const androidRes = [
  path.join(MAPS, "android", "app", "src", "main", "res", "mipmap-mdpi"),
  path.join(MAPS, "android", "app", "src", "main", "res", "mipmap-hdpi"),
  path.join(MAPS, "android", "app", "src", "main", "res", "mipmap-xhdpi"),
  path.join(MAPS, "android", "app", "src", "main", "res", "mipmap-xxhdpi"),
  path.join(MAPS, "android", "app", "src", "main", "res", "mipmap-xxxhdpi"),
];
const bucketPx = [48, 72, 96, 144, 192];
for (let i = 0; i < androidRes.length; i++) {
  add(androidRes[i], ["ic_launcher.png"], bucketPx[i], bucketPx[i]);
  add(androidRes[i], ["ic_launcher_round.png"], bucketPx[i], bucketPx[i]);
}

// iOS universal 1024. iOS renders this single asset at every size.
add(path.join(MAPS, "ios", "App", "App", "Assets.xcassets", "AppIcon.appiconset"),
    ["AppIcon-512@2x.png"], 1024, 1024);

// Web manifest favicon (the site already serves /data/icons/favicon.png).
add(path.join(MAPS, "dist", "data", "icons"), ["favicon.png"], 512, 512);

// ————— adaptive-icon foreground (Android 8+ API 26+) —————
// Foreground layer: the same fullbleed icon, but the 108dp canvas only shows
// the glyph inside the 66dp safe zone; everything outside is cropped by the
// OS mask, so we pre-crop here. Pixel size per bucket matches the legacy
// ic_launcher buckets so AAPT scales it by density.
function cropToSafe(img, size) {
  // Android adaptive-icon geometry: the launcher places the foreground artwork
  // on a 108dp canvas, and the OS mask keeps only the centered 66dp safe zone —
  // a circle of diameter 66dp. The input img is a fullbleed size×size downscale
  // of the master. To show the FULL icon (not a zoomed crop of it), the whole
  // image is scaled down to fit inside the safe circle: art occupies the central
  // 61% of the launcher, transparent outside the circle (nothing clips).
  const content = Math.max(1, Math.round(size * 66 / 108)); // circle diameter px
  const R = content / 2;
  const scaled = downscale(img, size, size, content, content);
  const out = Buffer.alloc(size * size * 4);
  const offset = (size - content) / 2; // center the content square
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const di = (y * size + x) * 4;
      const dx = x - size / 2 + 0.5, dy = y - size / 2 + 0.5;
      if (dx * dx + dy * dy > R * R) continue; // outside circle → transparent
      const sx = Math.round(x - offset), sy = Math.round(y - offset);
      if (sx < 0 || sy < 0 || sx >= content || sy >= content) continue;
      const si = (sy * content + sx) * 4;
      out[di] = scaled[si]; out[di + 1] = scaled[si + 1];
      out[di + 2] = scaled[si + 2]; out[di + 3] = 255;
    }
  }
  return out;
}
for (let i = 0; i < androidRes.length; i++) {
  const size = bucketPx[i];
  const inverse = cropToSafe(downscale(rgba, width, width, size, size), size);
  targets.push({ dir: androidRes[i], name: "ic_launcher_foreground.png", w: size, h: size, rgba: inverse });
}

// ————— adaptive-icon background color —————
// Android 8+ renders the launcher icon as: background (solid color layer) +
// foreground (glyph layer above). The master icon is a full-bleed square logo,
// so the natural background is the master's dominant edge color. Sample the
// 8 edge pixel-rows/columns of the source and pick the most frequent (mode) RGB.
function hexColor(r, g, b) {
  return "#" + [r, g, b].map(c => c.toString(16).padStart(2, "0")).join("").toUpperCase();
}
const edge = new Map();
for (let x = 0; x < width; x++) {
  for (const e of [0, width - 1]) {
    const si = (e * width + x) * 4;
    const key = `${rgba[si]},${rgba[si + 1]},${rgba[si + 2]}`;
    edge.set(key, (edge.get(key) || 0) + 1);
  }
}
for (let y = 0; y < width; y++) {
  for (const e of [0, width - 1]) {
    const si = (y * width + e) * 4;
    const key = `${rgba[si]},${rgba[si + 1]},${rgba[si + 2]}`;
    edge.set(key, (edge.get(key) || 0) + 1);
  }
}
let bgKey = [...edge.entries()].sort((a, b) => b[1] - a[1])[0][0];
const [br, bg, bb] = bgKey.split(",").map(Number);
const bgColor = hexColor(br, bg, bb);
console.log(`Adaptive background color: ${bgColor} (dominant edge)`);
const bgFile = path.join(MAPS, "android", "app", "src", "main", "res", "values", "ic_launcher_background.xml");
await fs.writeFile(bgFile, `<?xml version="1.0" encoding="utf-8"?>\n<resources><color name="ic_launcher_background">${bgColor}</color></resources>\n`);
console.log(`✓ ${bgFile}`);

// ——— write ———
for (const t of targets) {
  await fs.mkdir(t.dir, { recursive: true });
  await fs.writeFile(path.join(t.dir, t.name), pngEncode(t.w, t.h, t.rgba));
  console.log(`✓ ${path.join(t.dir, t.name)}  (${t.w}x${t.h})`);
}
console.log(`\nWrote ${targets.length} icons. Run \`npx cap sync\` to copy them into the bundles.`);