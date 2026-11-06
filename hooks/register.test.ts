import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'agent-office',
  component: 'Pane',
  requestId: 'office',
  surface: 'terminal',
  props: { title: 'Agent Office', isFocused: false, bodyColumns: 64, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

const engine = (on: (...args: any[]) => unknown, toolCall: () => unknown = () => ({ result: {} })) => {
  on('command.register', () => ({ value: { command: 'office' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('clock.every', () => ({ value: {} }))
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('agent.spawn', () => ({ model: 'm', agentId: 'agent-1' }))
  on('tool.call', toolCall)
  on('classic.PermissionRequest', () => ({}))
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

test('the main agent is listed, and reads thinking once a call has ended', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'office', args: '' })
  await $.tool.call({ tool: 'Read', file_path: '/src/auth/login.ts' })

  const ui = await $.ui.mount({ ...PANE })
  expect((await ui.find({ type: 'Text', text: /main/ }))?.text).toMatch(/main thinking/)
  await ui.unmount()
})

test('a permission dialog shows the main agent waiting for you, and answering it clears that', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'office', args: '' })
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'npm test' } })

  let ui = await $.ui.mount({ ...PANE })
  expect((await ui.find({ type: 'Text', text: /main/ }))?.text).toMatch(/main waiting for your OK/)
  await ui.unmount()

  await $.tool.call({ tool: 'Bash', command: 'npm test' }) // the call ran, so the dialog was answered
  ui = await $.ui.mount({ ...PANE })
  expect((await ui.find({ type: 'Text', text: /main/ }))?.text).toMatch(/main thinking/)
  expect(await ui.find({ type: 'Text', text: /waiting for your OK/ })).toBeUndefined()
  await ui.unmount()
})

test('the pictures fit the terminal\'s real cell shape, measured from its size in pixels', async ($, on) => {
  engine(on)
  // 50 rows and 200 columns in a 1000 x 1600 pixel terminal: cells of 8 x 20 pixels, 2.5 times taller than wide
  on('process.run', () => ({ value: { exitCode: 0, stdout: '50 200 1600 1000\n', stderr: '' } }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'office', args: 'image' })
  await $.command.run({ command: 'office', args: 'demo 2' })

  const ui = await $.ui.mount({ ...PANE })
  const image = await ui.find({ type: 'Image' })
  expect(image?.props?.rows).toBe(12) // 31 cells across at 2.5 is 12 rows, where the 2.2 guess would give 14
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
  expect(image?.props?.rows).toBe(14) // a square picture, in cells that are 2.2 times taller than wide
  expect((await ui.find({ type: 'Text', text: /explorer/ }))?.text).toMatch(/explorer/)
  expect((await ui.find({ type: 'Text', text: /reading 14 files/ }))?.text).toMatch(/reading 14 files/)
  await ui.unmount()
})
