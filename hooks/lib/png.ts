// A small, fast PNG encoder for flat pixel art: "Up" row filter, then a deflate stream that only looks
// four bytes back (one pixel), which turns every flat area into a handful of run codes.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf: Uint8Array, start: number, end: number): number {
  let c = 0xffffffff
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

class BitWriter {
  buf: Uint8Array
  len = 0
  private acc = 0
  private bits = 0
  constructor(cap: number) { this.buf = new Uint8Array(cap) }
  private grow() {
    const b = new Uint8Array(this.buf.length * 2)
    b.set(this.buf)
    this.buf = b
  }
  /** `n` bits, least significant first. */
  put(value: number, n: number) {
    this.acc |= value << this.bits
    this.bits += n
    while (this.bits >= 8) {
      if (this.len >= this.buf.length) this.grow()
      this.buf[this.len++] = this.acc & 255
      this.acc >>>= 8
      this.bits -= 8
    }
  }
  /** A Huffman code of `n` bits: those go in most significant first. */
  code(value: number, n: number) {
    let r = 0
    for (let i = 0; i < n; i++) r |= ((value >> i) & 1) << (n - 1 - i)
    this.put(r, n)
  }
  finish() {
    if (this.bits > 0) {
      if (this.len >= this.buf.length) this.grow()
      this.buf[this.len++] = this.acc & 255
      this.acc = 0
      this.bits = 0
    }
  }
}

// Length codes 257..285: base length and extra bits.
const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258]
const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0]

function literal(w: BitWriter, b: number) {
  if (b < 144) w.code(0x30 + b, 8)
  else w.code(0x190 + (b - 144), 9)
}

function lengthSymbol(w: BitWriter, len: number) {
  let i = LEN_BASE.length - 1
  while (LEN_BASE[i] > len) i--
  const sym = 257 + i
  if (sym < 280) w.code(sym - 256, 7)
  else w.code(0xc0 + (sym - 280), 8)
  if (LEN_EXTRA[i]) w.put(len - LEN_BASE[i], LEN_EXTRA[i])
}

function deflate(data: Uint8Array): Uint8Array {
  const w = new BitWriter(Math.max(1024, data.length >> 3))
  w.put(1, 1) // last block
  w.put(1, 2) // fixed Huffman codes
  const n = data.length
  let i = 0
  while (i < n) {
    if (i >= 4 && data[i] === data[i - 4]) {
      let len = 1
      while (len < 258 && i + len < n && data[i + len] === data[i + len - 4]) len++
      if (len >= 3) {
        lengthSymbol(w, len)
        w.code(3, 5) // distance code 3 = 4 bytes back
        i += len
        continue
      }
    }
    literal(w, data[i++])
  }
  w.code(0, 7) // end of block
  w.finish()
  return w.buf.subarray(0, w.len)
}

function adler32(data: Uint8Array): number {
  let a = 1, b = 0
  for (let i = 0; i < data.length; ) {
    const end = Math.min(i + 5552, data.length)
    for (; i < end; i++) { a += data[i]; b += a }
    a %= 65521
    b %= 65521
  }
  return ((b << 16) | a) >>> 0
}

/** Encodes `width * height` RGBA pixels as a PNG file. */
export function encodePng(width: number, height: number, rgba: Uint8ClampedArray): Uint8Array {
  const stride = width * 4
  const raw = new Uint8Array((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    const o = y * (stride + 1), s = y * stride
    raw[o] = 2 // Up
    if (y === 0) for (let x = 0; x < stride; x++) raw[o + 1 + x] = rgba[s + x]
    else for (let x = 0; x < stride; x++) raw[o + 1 + x] = (rgba[s + x] - rgba[s - stride + x]) & 255
  }
  const body = deflate(raw)
  const z = new Uint8Array(2 + body.length + 4)
  z[0] = 0x78; z[1] = 0x01
  z.set(body, 2)
  const ad = adler32(raw)
  z[z.length - 4] = ad >>> 24; z[z.length - 3] = (ad >>> 16) & 255; z[z.length - 2] = (ad >>> 8) & 255; z[z.length - 1] = ad & 255

  const out = new Uint8Array(8 + 25 + 12 + z.length + 12)
  const dv = new DataView(out.buffer)
  out.set([137, 80, 78, 71, 13, 10, 26, 10], 0)
  let p = 8
  const chunk = (type: string, data: Uint8Array) => {
    dv.setUint32(p, data.length)
    for (let k = 0; k < 4; k++) out[p + 4 + k] = type.charCodeAt(k)
    out.set(data, p + 8)
    dv.setUint32(p + 8 + data.length, crc32(out, p + 4, p + 8 + data.length))
    p += 12 + data.length
  }
  const ihdr = new Uint8Array(13)
  const hv = new DataView(ihdr.buffer)
  hv.setUint32(0, width); hv.setUint32(4, height); ihdr[8] = 8; ihdr[9] = 6
  chunk('IHDR', ihdr)
  chunk('IDAT', z)
  chunk('IEND', new Uint8Array(0))
  return out.subarray(0, p)
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
export function toBase64(bytes: Uint8Array): string {
  const native = (bytes as Uint8Array & { toBase64?: () => string }).toBase64
  if (native) return native.call(bytes)
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    out += B64[n >> 18] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < bytes.length ? B64[n & 63] : '=')
  }
  return out
}
