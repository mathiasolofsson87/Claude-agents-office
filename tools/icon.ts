// node tools/icon.ts: draws .claude-plugin/icon.png, four of the characters in a square.
import { writeFileSync } from 'node:fs'
import { encodePng } from '../hooks/lib/png.ts'
import { createRenderer } from '../hooks/lib/render.ts'

const roles = ['explore', 'plan', 'code', 'think']
const r = createRenderer(2)
const S = 272
const icon = new Uint8ClampedArray(S * 2 * S * 2 * 4)
roles.forEach((role, i) => {
  const f = r.portrait({ role, look: r.lookFor(role, [3, 6, 9, 14][i]), seed: [3, 6, 9, 14][i] })
  const ox = (i % 2) * S, oy = Math.floor(i / 2) * S
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) for (let c = 0; c < 4; c++) icon[((oy + y) * S * 2 + ox + x) * 4 + c] = f.rgba[(y * S + x) * 4 + c]
})
writeFileSync(new URL('../.claude-plugin/icon.png', import.meta.url), encodePng(S * 2, S * 2, icon))
console.log(`icon ${S * 2}x${S * 2}`)
