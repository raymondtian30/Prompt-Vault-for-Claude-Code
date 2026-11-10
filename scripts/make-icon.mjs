// Draws mod/.claude-plugin/icon.png (512x512): a vault door with a keyhole.
// Usage: node scripts/make-icon.mjs   (no dependencies)
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const N = 512
const SS = 3
const BG = [31, 41, 55]
const RING = [229, 231, 235]
const DOOR = [55, 65, 81]
const ACCENT = [217, 119, 87]

const dist = (x, y, cx, cy) => Math.hypot(x - cx, y - cy)
function colorAt(x, y) {
  const c = N / 2
  const corner = 96
  const dx = Math.max(Math.abs(x - c) - (c - corner), 0)
  const dy = Math.max(Math.abs(y - c) - (c - corner), 0)
  if (Math.hypot(dx, dy) > corner) return null
  const d = dist(x, y, c, c)
  if (d > 190 && d <= 214) return RING
  if (d <= 190) {
    const kx = x - c
    const ky = y - c
    if (dist(x, y, c, c - 14) <= 34) return ACCENT
    if (ky >= -14 && ky <= 74 && Math.abs(kx) <= 14 + (ky + 14) * 0.12) return ACCENT
    for (let a = 0; a < 6; a++) {
      const ang = (a * Math.PI) / 3
      if (dist(x, y, c + Math.cos(ang) * 150, c + Math.sin(ang) * 150) <= 9) return RING
    }
    return DOOR
  }
  return BG
}

const raw = Buffer.alloc((N * 4 + 1) * N)
for (let y = 0; y < N; y++) {
  raw[y * (N * 4 + 1)] = 0
  for (let x = 0; x < N; x++) {
    let r = 0, g = 0, b = 0, a = 0
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const col = colorAt(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS)
        if (col) { r += col[0]; g += col[1]; b += col[2]; a++ }
      }
    }
    const o = y * (N * 4 + 1) + 1 + x * 4
    const n = SS * SS
    raw[o] = a ? Math.round(r / a) : 0
    raw[o + 1] = a ? Math.round(g / a) : 0
    raw[o + 2] = a ? Math.round(b / a) : 0
    raw[o + 3] = Math.round((a / n) * 255)
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = buf => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(N, 0)
ihdr.writeUInt32BE(N, 4)
ihdr[8] = 8
ihdr[9] = 6
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
writeFileSync(new URL('../mod/.claude-plugin/icon.png', import.meta.url), png)
console.log('wrote mod/.claude-plugin/icon.png', png.length, 'bytes')
