// Run in project root: node gen_icon.js
const fs = require('fs');
const zlib = require('zlib');

// CRC32 implementation (compatible with all Node versions)
const CRC_TABLE = (function() {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function ndebelePixel(x, y, size) {
  const cx = size / 2, cy = size / 2;
  const d = Math.abs(x - cx) + Math.abs(y - cy); // Manhattan = diamond
  const r = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
  if (r > cx - 1) return [0, 0, 0, 0]; // transparent outside circle
  // Concentric diamond rings (Ndebele lozenge pattern)
  const scale = size / 256;
  if (d > 118*scale) return [201,168,76,255];  // gold outer
  if (d > 110*scale) return [14,12,16,255];     // black
  if (d > 92*scale)  return [204,26,26,255];    // red
  if (d > 84*scale)  return [14,12,16,255];     // black
  if (d > 66*scale)  return [240,184,0,255];    // yellow
  if (d > 58*scale)  return [14,12,16,255];     // black
  if (d > 40*scale)  return [24,184,74,255];    // green
  if (d > 32*scale)  return [14,12,16,255];     // black
  if (d > 14*scale)  return [26,78,200,255];    // blue
  if (d > 6*scale)   return [14,12,16,255];     // black
  return [240,184,0,255];                        // gold center
}

function buildPNG(size) {
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = [0]; // PNG filter byte
    for (let x = 0; x < size; x++) {
      row.push(...ndebelePixel(x, y, size));
    }
    rows.push(Buffer.from(row));
  }
  const raw = zlib.deflateSync(Buffer.concat(rows), { level: 9 });
  function chunk(type, data) {
    const typeB = Buffer.from(type, 'ascii');
    const lenB = Buffer.allocUnsafe(4); lenB.writeUInt32BE(data.length, 0);
    const crcB = Buffer.allocUnsafe(4); crcB.writeUInt32BE(crc32(Buffer.concat([typeB, data])), 0);
    return Buffer.concat([lenB, typeB, data, crcB]);
  }
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8]=8; ihdr[9]=6; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0;
  const sig = Buffer.from([137,80,78,71,13,10,26,10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', raw), chunk('IEND', Buffer.alloc(0))]);
}

function pngToIco(pngBuf) {
  const ico = Buffer.allocUnsafe(6 + 16 + pngBuf.length);
  ico.writeUInt16LE(0, 0); ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4);
  ico[6]=0; ico[7]=0; ico[8]=0; ico[9]=0;
  ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12);
  ico.writeUInt32LE(pngBuf.length, 14); ico.writeUInt32LE(22, 18);
  pngBuf.copy(ico, 22);
  return ico;
}

fs.mkdirSync('assets', { recursive: true });
const png256 = buildPNG(256);
fs.writeFileSync('assets/icon.png', png256);
fs.writeFileSync('assets/icon.ico', pngToIco(png256));
// Also generate 16px tray icon
const png16 = buildPNG(16);
fs.writeFileSync('assets/tray.png', png16);
console.log('Icons generated: icon.png, icon.ico, tray.png');
