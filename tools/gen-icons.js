/* public/icon.svg-এর মতো দেখতে PNG আইকন বানায় (কোনো লাইব্রেরি ছাড়া)
   চালান:  node tools/gen-icons.js                                       */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'public');

// ---- PNG এনকোডার ----
const CRC_T = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_T[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- আঁকা (৫১২ ইউনিটের কোঅর্ডিনেটে, ৪x সুপারস্যাম্পলিং) ----
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function roundedRect(x, y, X0, Y0, X1, Y1, r) {
  if (x < X0 || x > X1 || y < Y0 || y > Y1) return false;
  const cx = Math.min(Math.max(x, X0 + r), X1 - r);
  const cy = Math.min(Math.max(y, Y0 + r), Y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function cupAt(x, y) {
  // পেয়ালা: উপরে চারকোনা, নিচে গোল
  if (x >= 116 && x <= 396 && y >= 216 && y <= 300) return true;
  if (y > 300 && ((x - 256) / 140) ** 2 + ((y - 300) / 104) ** 2 <= 1) return true;
  // হাতল
  if (x > 392) {
    const d = Math.hypot(x - 404, y - 284);
    if (d <= 48 && d >= 26) return true;
  }
  // প্লেট
  if (roundedRect(x, y, 96, 416, 416, 442, 13)) return true;
  // ধোঁয়া
  for (const x0 of [196, 256, 316]) {
    if (y >= 108 && y <= 176) {
      const wob = x0 + 17 * Math.sin(((y - 108) / 68) * Math.PI * 1.2);
      if (Math.abs(x - wob) <= 10) return true;
    }
  }
  return false;
}

function render(size) {
  const buf = Buffer.alloc(size * size * 4);
  const s = 512 / size;
  const SS = 4; // সুপারস্যাম্পল
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let bgHits = 0, fgHits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) * s;
          const y = (py + (sy + 0.5) / SS) * s;
          if (!roundedRect(x, y, 0, 0, 512, 512, 112)) continue;
          bgHits++;
          if (cupAt(x, y)) fgHits++;
        }
      }
      const n = SS * SS;
      const a = clamp01(bgHits / n);
      const f = clamp01(fgHits / n);
      // কমলা গ্রেডিয়েন্ট
      const t = clamp01((px / size + py / size) / 2);
      const br = Math.round(251 + (234 - 251) * t);
      const bg = Math.round(146 + (88 - 146) * t);
      const bb = Math.round(60 + (12 - 60) * t);
      const k = f / (a || 1);
      const i = (py * size + px) * 4;
      buf[i]     = Math.round(br * (1 - k) + 255 * k);
      buf[i + 1] = Math.round(bg * (1 - k) + 255 * k);
      buf[i + 2] = Math.round(bb * (1 - k) + 255 * k);
      buf[i + 3] = Math.round(a * 255);
    }
  }
  return encodePNG(size, size, buf);
}

for (const size of [180, 192, 512]) {
  fs.writeFileSync(path.join(OUT, `icon-${size}.png`), render(size));
  console.log(`✅ public/icon-${size}.png`);
}
