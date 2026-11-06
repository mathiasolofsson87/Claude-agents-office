// node tools/fingerprint-portraits.ts: a hash of every role's portrait, man and woman, to check a change left every pixel alone.
import { createHash } from 'node:crypto'
import { createRenderer } from '../hooks/lib/render.ts'

const roles = ['explore', 'plan', 'code', 'review', 'think', 'test', 'quick', 'docs']
const h = createHash('sha256')
for (const scale of [1, 2] as const) {
  const r = createRenderer(scale)
  roles.forEach((role, i) => {
    for (const seed of [i + 1, i + 40, i + 90]) {
      const f = r.portrait({ role, look: r.lookFor(role, seed), seed })
      h.update(Buffer.from(f.rgba.buffer, f.rgba.byteOffset, f.rgba.byteLength))
    }
  })
}
console.log(h.digest('hex'))
