import { expect, test } from 'claude-code/testing'

import { encodePng } from './png'

test('a PNG has the signature, the right size and an end chunk', () => {
  const w = 40, h = 30
  const rgba = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) { rgba[i * 4] = i % 7 === 0 ? 200 : 20; rgba[i * 4 + 3] = 255 }
  const png = encodePng(w, h, rgba)
  expect(Array.from(png.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
  const dv = new DataView(png.buffer, png.byteOffset)
  expect(dv.getUint32(16)).toBe(w)
  expect(dv.getUint32(20)).toBe(h)
  expect(String.fromCharCode(...png.subarray(png.length - 8, png.length - 4))).toBe('IEND')
})
