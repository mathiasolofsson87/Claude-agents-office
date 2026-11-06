import { expect, test } from 'claude-code/testing'

import { createRenderer } from './render'

const sum = (a: Uint8ClampedArray) => { let h = 0; for (let i = 0; i < a.length; i += 7) h = (h * 31 + a[i]) >>> 0; return h }

test('a leaving agent has two different waving frames, both unlike the usual pose', () => {
  const r = createRenderer(1)
  const look = r.lookFor('code', 5)
  const still = r.portrait({ role: 'code', look, seed: 5 })
  const a = r.portrait({ role: 'code', look, seed: 5, wave: 1 })
  const b = r.portrait({ role: 'code', look, seed: 5, wave: 2 })
  expect(new Set([sum(still.rgba), sum(a.rgba), sum(b.rgba)]).size).toBe(3)
  expect(still.width).toBe(136)
})

test('the main agent has a different picture for working, asleep and needing an answer', () => {
  const r = createRenderer(1)
  const look = r.lookFor('main', 7)
  const frames = ['work', 'idle', 'ask'].map(state => sum(r.portrait({ role: 'main', look, seed: 3, state }).rgba))
  expect(new Set(frames).size).toBe(3)
})
