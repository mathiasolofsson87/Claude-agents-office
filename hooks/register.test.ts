import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'agent-office',
  component: 'Pane',
  requestId: 'office',
  surface: 'terminal',
  props: { title: 'Agent Office', isFocused: false, bodyColumns: 64, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

const engine = (on: (...args: any[]) => unknown) => {
  on('command.register', () => ({ value: { command: 'office' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('clock.every', () => ({ value: {} }))
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('agent.spawn', () => ({ model: 'm', agentId: 'agent-1' }))
  on('tool.call', () => ({ result: {} }))
}

test('a subagent that starts is listed with its role and task, where pictures cannot be drawn', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.agent.spawn({ subagentType: 'Explore', prompt: 'find the auth entry points', description: 'find auth' })

  const ui = await $.ui.mount({ ...PANE })
  expect((await ui.find({ type: 'Text', text: /starting/ }))?.text).toMatch(/explorer starting up/)
  expect(await ui.find({ type: 'Image' })).toBeUndefined()
  await ui.unmount()
})

test('with pictures on, each agent is a tile: a portrait with its role and task underneath', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'office', args: 'image' })
  await $.command.run({ command: 'office', args: 'demo 3' })

  const ui = await $.ui.mount({ ...PANE })
  const image = await ui.find({ type: 'Image' })
  expect(image).toBeDefined()
  expect(image?.props?.columns).toBe(31) // two tiles and a gap across 64 cells
  expect((await ui.find({ type: 'Text', text: /explorer/ }))?.text).toMatch(/explorer/)
  expect((await ui.find({ type: 'Text', text: /reading 14 files/ }))?.text).toMatch(/reading 14 files/)
  await ui.unmount()
})
