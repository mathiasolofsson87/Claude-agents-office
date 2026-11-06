// Draws every character, man and woman, as a contact sheet so the art can be checked without a terminal.
// Run: node tools/demo.ts <outdir>
import { writeFileSync } from 'node:fs'
import { encodePng } from '../hooks/lib/png.ts'
import { createRenderer } from '../hooks/lib/render.ts'

const roles = ['explore', 'plan', 'code', 'review', 'think', 'test', 'quick', 'docs']
const r = createRenderer(2)
const S = 272
const sheet = new Uint8ClampedArray(S * 4 * S * 4 * 4)
roles.forEach((role, i) => {
  for (let k = 0; k < 2; k++) {
    const f = r.portrait({ role, look: r.lookFor(role, i * 2 + k + 1), seed: i * 2 + k + 1 })
    const cell = i * 2 + k, ox = (cell % 4) * S, oy = Math.floor(cell / 4) * S
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) for (let c = 0; c < 4; c++) sheet[((oy + y) * S * 4 + ox + x) * 4 + c] = f.rgba[(y * S + x) * 4 + c]
  }
})
writeFileSync(`${process.argv[2] ?? '.'}/characters.png`, encodePng(S * 4, S * 4, sheet))
