// Generates the monee app icons as PNG files with no dependencies.
// Run: node scripts/make-icons.mjs
import { deflateSync } from "node:zlib"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
  "icons",
)
mkdirSync(root, { recursive: true })

const CORAL = [244, 125, 101]
const CREAM = [248, 246, 241]
const WHITE = [255, 255, 255]

/** Renders an icon. `shape` is 'rounded' (transparent corners) or 'square' (full bleed). */
function render(size, shape) {
  const pixels = Buffer.alloc(size * size * 4)
  const radius = shape === "rounded" ? size * 0.22 : 0
  const cx = size / 2
  const cy = size / 2
  const rx = size * 0.15
  const ry = size * 0.22
  const stroke = size * 0.07

  // Signed distance-ish test for the brand ring (an ellipse outline), used with 4x supersampling.
  const inRing = (x, y) => {
    const dx = (x - cx) / rx
    const dy = (y - cy) / ry
    const d = Math.sqrt(dx * dx + dy * dy)
    const band = stroke / Math.min(rx, ry)
    return d <= 1 && d >= 1 - band
  }
  // Inside a rounded square: outside the corner squares, or within the corner radius.
  const insideShape = (x, y) => {
    if (!radius) return true
    const qx = Math.max(radius - x, 0, x - (size - radius))
    const qy = Math.max(radius - y, 0, y - (size - radius))
    return qx * qx + qy * qy <= radius * radius
  }

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let hits = 0
      let covered = 0
      for (let sy = 0; sy < 4; sy++) {
        for (let sx = 0; sx < 4; sx++) {
          const x = px + (sx + 0.5) / 4
          const y = py + (sy + 0.5) / 4
          if (!insideShape(x, y)) continue
          covered++
          if (inRing(x, y)) hits++
        }
      }
      const alpha = Math.round((covered / 16) * 255)
      if (alpha === 0) continue
      const ringCoverage = hits / covered
      const mix = (a, b, t) => Math.round(a + (b - a) * t)
      // A faint cream glow towards the centre so the ring reads as a coin on the coral field.
      const centreDist = Math.hypot(
        (px - cx) / (size / 2),
        (py - cy) / (size / 2),
      )
      const glow = Math.max(0, 1 - centreDist) * 0.08
      const i = (py * size + px) * 4
      pixels[i] = mix(mix(CORAL[0], CREAM[0], glow), WHITE[0], ringCoverage)
      pixels[i + 1] = mix(mix(CORAL[1], CREAM[1], glow), WHITE[1], ringCoverage)
      pixels[i + 2] = mix(mix(CORAL[2], CREAM[2], glow), WHITE[2], ringCoverage)
      pixels[i + 3] = alpha
    }
  }
  return pixels
}

function crc32(buf) {
  let crc = ~0
  for (const byte of buf) {
    crc ^= byte
    for (let k = 0; k < 8; k++)
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
  }
  return ~crc >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, "ascii"), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(size, rgba) {
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(
      raw,
      y * (stride + 1) + 1,
    )
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

const targets = [
  ["icon-192.png", 192, "rounded"],
  ["icon-512.png", 512, "rounded"],
  ["maskable-512.png", 512, "square"],
  ["apple-touch-icon-180.png", 180, "square"],
]

for (const [name, size, shape] of targets) {
  writeFileSync(join(root, name), encodePng(size, render(size, shape)))
  console.log(`wrote public/icons/${name}`)
}
