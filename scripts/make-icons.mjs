// Generates the PWA / iOS home-screen icons (a white house on a blue square) without any dependency.
// Usage: node scripts/make-icons.mjs
import fs from 'node:fs';
import zlib from 'node:zlib';

const BG = [0, 122, 255];
const FG = [255, 255, 255];

/** Coverage of the house shape at a point in unit coordinates (0..1). */
function inside(x, y) {
  const roof = y >= 0.2 && y <= 0.5 && Math.abs(x - 0.5) <= (y - 0.2) * (0.33 / 0.3) + 0.0;
  const body = x >= 0.27 && x <= 0.73 && y >= 0.47 && y <= 0.8;
  const chimney = x >= 0.62 && x <= 0.69 && y >= 0.24 && y <= 0.4;
  const door = x >= 0.44 && x <= 0.56 && y >= 0.6 && y <= 0.8;
  return (roof || body || chimney) && !door;
}

function png(size) {
  const ss = 4;
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let py = 0; py < size; py++) {
    raw[py * (size * 3 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      let hits = 0;
      for (let sy = 0; sy < ss; sy++)
        for (let sx = 0; sx < ss; sx++) if (inside((px + (sx + 0.5) / ss) / size, (py + (sy + 0.5) / ss) / size)) hits++;
      const a = hits / (ss * ss);
      const o = py * (size * 3 + 1) + 1 + px * 3;
      for (let c = 0; c < 3; c++) raw[o + c] = Math.round(BG[c] * (1 - a) + FG[c] * a);
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = new URL('../web/public/', import.meta.url);
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  fs.writeFileSync(new URL(name, out), png(size));
}
console.log('Icônes générées dans web/public/');
