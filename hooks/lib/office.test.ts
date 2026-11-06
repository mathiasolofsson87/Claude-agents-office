import { expect, test } from 'claude-code/testing'

import { describeTool, LEAVE_TICKS, MAIN, Office, roleFor } from './office'

test('subagent types and descriptions become roles', () => {
  expect(roleFor('Explore', '')).toBe('explore')
  expect(roleFor('Plan', '')).toBe('plan')
  expect(roleFor('deep-thinker', '')).toBe('think')
  expect(roleFor('quick-helper', '')).toBe('quick')
  expect(roleFor('general-purpose', 'review the auth diff')).toBe('review')
  expect(roleFor('general-purpose', 'run the tests')).toBe('test')
  expect(roleFor('general-purpose', 'rewrite the login flow')).toBe('code')
})

test('tool calls become short CLI-style lines', () => {
  expect(describeTool({ tool: 'Read', file_path: '/src/auth/login.ts' })).toBe('reading login.ts')
  expect(describeTool({ tool: 'Edit', file_path: '/src/auth/session.ts' })).toBe('editing session.ts')
  expect(describeTool({ tool: 'Bash', command: 'npm run test -- auth' })).toBe('running tests')
  expect(describeTool({ tool: 'Bash', command: 'tsc --noEmit' })).toBe('building the project')
  expect(describeTool({ tool: 'WebSearch', query: 'OAuth PKCE flow' })).toMatch(/^researching oauth pkce/)
  expect(describeTool({ tool: 'Grep', pattern: 'x' })).toBe('searching the code')
  expect(describeTool({ tool: 'Read', file_path: '/a/' + 'x'.repeat(60) + '.ts' }).length).toBeLessThanOrEqual(24)
})

test('agents arrive in order, show as done, then leave their tile', () => {
  const o = new Office(() => ({}))
  o.add('a', 'code', 'x'); o.add('b', 'plan', 'y'); o.add('a', 'code', 'again')
  expect(o.members.map(m => m.id)).toEqual(['a', 'b'])
  o.setTask('b', 'new task')
  expect(o.members[1].task).toBe('new task')
  o.finish('a')
  expect(o.live().map(m => m.id)).toEqual(['b'])
  for (let i = 0; i < LEAVE_TICKS - 1; i++) expect(o.step()).toEqual([])
  expect(o.has('a')).toBe(true)
  expect(o.step().map(m => m.id)).toEqual(['a'])
  expect(o.members.map(m => m.id)).toEqual(['b'])
})

test('the same agent id always gets the same look', () => {
  const seen: number[] = []
  const o = new Office((_role, seed) => { seen.push(seed); return {} })
  o.add('agent-1', 'code', ''); const first = seen[0]
  const o2 = new Office((_role, seed) => { seen.push(seed); return {} })
  o2.add('agent-1', 'plan', '')
  expect(seen[1]).toBe(first)
})

test('the main agent always has the first tile, is never counted as a subagent and never leaves', () => {
  const o = new Office(() => ({}))
  o.add('a', 'code', 'x')
  o.setMain('idle', 'waiting for you')
  expect(o.members.map(m => m.id)).toEqual([MAIN, 'a'])
  expect(o.live().map(m => m.id)).toEqual(['a'])
  o.setMain('work', 'reading login.ts')
  expect(o.members[0]).toMatchObject({ state: 'work', task: 'reading login.ts' })
  o.clear()
  for (let i = 0; i < LEAVE_TICKS + 1; i++) o.step()
  expect(o.members.map(m => m.id)).toEqual([MAIN])
})
