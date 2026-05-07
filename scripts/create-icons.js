// Generates solid-colour PNG icons for the Chrome extension using only
// Node.js built-ins (zlib + crypto for CRC32). No external deps needed.
const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

// Accent blue matching the app's --color-accent
const R = 91, G = 156, B = 246;

function crc32(buf) {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  let crc = 0xffffffff;
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const lenBuf      = Buffer.alloc(4);
  const typeBuf     = Buffer.from(type, 'ascii');
  const crcBuf      = Buffer.alloc(4);
  const typeAndData = Buffer.concat([typeBuf, data]);
  lenBuf.writeUInt32BE(data.length, 0);
  crcBuf.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([lenBuf, typeAndData, crcBuf]);
}

function makePNG(size, r, g, b) {
  // Build raw scanlines: each row = filter-byte(0) + RGB pixels
  const row    = Buffer.alloc(1 + size * 3);
  row[0]       = 0; // filter type None
  for (let x = 0; x < size; x++) {
    row[1 + x * 3]     = r;
    row[1 + x * 3 + 1] = g;
    row[1 + x * 3 + 2] = b;
  }
  const raw = Buffer.concat(Array(size).fill(row));

  const compressed = zlib.deflateSync(raw, { level: 9 });

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);  // width
  ihdrData.writeUInt32BE(size, 4);  // height
  ihdrData.writeUInt8(8, 8);        // bit depth
  ihdrData.writeUInt8(2, 9);        // colour type: RGB
  ihdrData.writeUInt8(0, 10);       // compression
  ihdrData.writeUInt8(0, 11);       // filter
  ihdrData.writeUInt8(0, 12);       // interlace

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    chunk('IHDR', ihdrData),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = path.join(__dirname, '../extension/icons');
fs.mkdirSync(outDir, { recursive: true });

for (const size of [16, 48, 128]) {
  const png  = makePNG(size, R, G, B);
  const dest = path.join(outDir, `icon${size}.png`);
  fs.writeFileSync(dest, png);
  console.log(`Created ${dest} (${png.length} bytes)`);
}
