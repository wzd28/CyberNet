// Builds the static grain tile used on dark panels at 1024px and up (--cn-grain, 00-tokens.css):
//   node scripts/make-grain.mjs            writes public/ui/img/grain-160.png
//   node scripts/make-grain.mjs --check    exits 1 if the file on disk differs
// A 160x160 2-bit palette PNG with a tRNS chunk: white specks at four alpha levels (0, 2.4%, 3.5%,
// 5.1%), mean alpha about 1.8%, from a fixed seed, so the output is byte-identical on every run.
// (Finish, 18 Oct: was 0 / 4.7 / 7.1 / 9%, which read as JPEG-like speckle at 1x.)
// Node and zlib only (no image libraries); never an SVG feTurbulence data URI.
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "public", "ui", "img", "grain-160.png");
const SIZE = 160, SEED = 0x5eed1c0d;
const ALPHA = [0, 6, 9, 13];                 // 0, 2.4%, 3.5%, 5.1% of 255
const CUT = [0.41, 0.76, 0.93];              // cumulative share of levels 0, 1, 2 (the rest is 3)

// mulberry32: small, fast, deterministic
let s = SEED >>> 0;
const rand = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

const rowBytes = SIZE / 4; // 2 bits per pixel
const raw = Buffer.alloc((rowBytes + 1) * SIZE);
let sum = 0, max = 0;
for (let y = 0; y < SIZE; y++) {
  raw[y * (rowBytes + 1)] = 0; // filter: none
  for (let x = 0; x < SIZE; x++) {
    const u = rand(), v = u < CUT[0] ? 0 : u < CUT[1] ? 1 : u < CUT[2] ? 2 : 3;
    sum += ALPHA[v]; max = Math.max(max, ALPHA[v]);
    const i = y * (rowBytes + 1) + 1 + (x >> 2);
    raw[i] |= v << (6 - 2 * (x & 3));
  }
}

const crcTable = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = buf => { let c = -1; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 2; ihdr[9] = 3; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 2-bit, palette
const plte = Buffer.alloc(ALPHA.length * 3, 255);                     // all white
const trns = Buffer.from(ALPHA);
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr), chunk("PLTE", plte), chunk("tRNS", trns),
  chunk("IDAT", zlib.deflateSync(raw, { level: 9, memLevel: 9, strategy: zlib.constants.Z_DEFAULT_STRATEGY })),
  chunk("IEND", Buffer.alloc(0)),
]);

const mean = sum / (SIZE * SIZE) / 255;
const info = `grain-160.png: ${png.length} bytes, mean alpha ${(mean * 100).toFixed(2)}%, max ${(max / 255 * 100).toFixed(1)}%`;
if (process.argv.includes("--check")) {
  const same = existsSync(out) && Buffer.compare(readFileSync(out), png) === 0;
  console.log(info + (same ? " (up to date)" : " (STALE)"));
  process.exit(same ? 0 : 1);
}
if (png.length > 6144) { console.error(info + ": over the 6 KB budget"); process.exit(1); }
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, png);
console.log(info + " written");
