import type { EngineInterface, Register } from 'claude-code'

import { describeTool, MAX_TILES, Office, roleFor } from './lib/office'
import { encodePng, toBase64 } from './lib/png'
import { createRenderer } from './lib/render'

const PANE = 'office'
const STEP_MS = 1000
const DEMO_ROLES = ['explore', 'plan', 'code', 'review', 'think', 'test', 'quick', 'docs']
/** Below this many cells across, a tile is too small to be worth drawing. */
const MIN_TILE = 12

type Mode = 'auto' | 'image' | 'text'
type Caps = { program?: string; version?: string; term?: string; tmux: boolean; images: boolean }

const cfg = { autoOpen: true, cellAspect: 2, detail: 'auto', display: 'auto' }
const renderers: Record<number, ReturnType<typeof createRenderer>> = {}
const getRenderer = (scale: 1 | 2) => (renderers[scale] ??= createRenderer(scale))
const base = getRenderer(1)
const office = new Office(base.lookFor)
const roles = base.roles as Record<string, { name: string; color: string; tasks: string[] }>
const unlisted = new Set<string>()
/** Each agent's portrait is drawn once and kept until the agent leaves. */
const portraits = new Map<string, string>()
const stat = { portraits: 0, kib: 0, redraws: 0 }
let loop: { cancel: () => void } | undefined
let isOpen = false
let autoOpened = false
let mode: Mode = 'auto'
let caps: Caps | undefined
let lastRender: { keys: string[]; props: unknown; viewport: unknown; columns: number; drawn: string } | undefined
let demoEnd = 0
let dirty = false
let paneColumns = 48

function versionAtLeast(version: string | undefined, major: number, minor: number): boolean {
  const m = /^(\d+)\.(\d+)/.exec(version ?? '')
  return !!m && (Number(m[1]) > major || (Number(m[1]) === major && Number(m[2]) >= minor))
}

/** Which terminal this is, as far as pictures go: kitty, Ghostty and iTerm2 3.5 or later draw them, tmux passes none through. */
async function detectCaps($: EngineInterface): Promise<Caps> {
  if (caps) return caps
  try {
    const program = await $.env.get('TERM_PROGRAM')
    const version = await $.env.get('TERM_PROGRAM_VERSION')
    const term = await $.env.get('TERM')
    const tmux = (await $.env.get('TMUX')) !== undefined
    const kitty = (await $.env.get('KITTY_WINDOW_ID')) !== undefined
    const p = (program ?? '').toLowerCase()
    const t = (term ?? '').toLowerCase()
    const images = !tmux && (kitty || t.includes('kitty') || t.includes('ghostty') || p === 'ghostty' || (p === 'iterm.app' && versionAtLeast(version, 3, 5)))
    caps = { program, version, term, tmux, images }
  } catch {
    caps = { tmux: false, images: false }
  }
  return caps
}

/** The picture of one agent at their desk, as a base64 PNG; drawn the first time it is asked for. */
function portraitOf(id: string, role: string, look: unknown, seed: number): string {
  const scale = cfg.detail === 'normal' ? 1 : 2
  const key = `${id}|${scale}`
  const hit = portraits.get(key)
  if (hit) return hit
  const f = getRenderer(scale).portrait({ role, look, seed })
  const b64 = toBase64(encodePng(f.width, f.height, f.rgba))
  stat.portraits++
  stat.kib += Math.round(b64.length / 1024)
  portraits.set(key, b64)
  return b64
}

/** What fits in `width` cells, with an ellipsis where it was cut. */
function fit(text: string, width: number): string {
  return text.length <= width ? text : text.slice(0, Math.max(1, width - 1)) + '…'
}

function redraw($: EngineInterface) {
  stat.redraws++
  $.ui.invalidate('ui.render')
}

/** Keeps the demo agents busy: new task text every six seconds, and they finish one after another. */
function runDemo() {
  office.members.forEach((m, i) => {
    if (!m.id.startsWith('demo-') || m.leave !== undefined) return
    const list = roles[m.role].tasks
    if (office.tick % 6 === i % 6) office.setTask(m.id, list[(Math.floor(office.tick / 6) + i) % list.length])
    if (office.tick > demoEnd + i * 2) office.finish(m.id)
  })
}

function markDirty() {
  dirty = true
}

function stopLoop() {
  loop?.cancel?.()
  loop = undefined
  isOpen = false
}

/** One step a second while the pane is open: finished agents leave, demo agents move on, and the pane is redrawn if anything changed. */
function startLoop($: EngineInterface) {
  if (loop) return
  loop = $.clock.every(STEP_MS, () => {
    if (!isOpen) return
    const gone = office.step(1)
    for (const m of gone) for (const k of [...portraits.keys()]) if (k.startsWith(m.id + '|')) portraits.delete(k)
    if (demoEnd) runDemo()
    if (gone.length > 0) dirty = true
    if (dirty) { dirty = false; redraw($) }
  })
}

async function open($: EngineInterface) {
  const r = await $.ui.open({ id: PANE, title: 'Agent Office' })
  isOpen = r.isPlaced
  if (isOpen) startLoop($)
  return r
}

export const register: Register = (on, options) => {
  cfg.autoOpen = options.autoOpen !== false
  cfg.cellAspect = typeof options.cellAspect === 'number' && options.cellAspect >= 1 && options.cellAspect <= 4 ? options.cellAspect : 2
  cfg.detail = String(options.detail ?? 'auto')
  cfg.display = String(options.display ?? 'auto')
  mode = cfg.display === 'text' || cfg.display === 'image' ? cfg.display : 'auto'

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'office',
      description: 'Agent Office: open the pane. demo, clear, auto, image, text, info and stats are the options.',
    })
    return next(e)
  })

  on('command.run', { command: 'office' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'clear') {
      office.clear()
      demoEnd = 0
      markDirty()
      return { text: 'Agent Office: everyone went home.' }
    }
    if (arg === 'image' || arg === 'text' || arg === 'auto') {
      mode = arg
      markDirty()
      const opened = await open($)
      if (!opened.isPlaced) return { text: `Agent Office could not open its pane: ${opened.reason ?? 'no room for it'}.` }
      redraw($)
      return { text: `Agent Office: ${arg === 'image' ? 'showing the pictures, whether or not this terminal can draw them' : arg === 'text' ? 'showing the text list only' : 'choosing pictures or text by what this terminal can draw'}.` }
    }
    if (arg === 'info') {
      const c = await detectCaps($)
      const r = lastRender
      return {
        text: [
          'Agent Office info',
          `terminal: TERM_PROGRAM=${c.program ?? '-'} ${c.version ?? ''}, TERM=${c.term ?? '-'}, tmux=${c.tmux}, can draw pictures=${c.images}`,
          `setting: display=${cfg.display}, now ${mode}`,
          r ? `last draw: ${r.drawn}; pane columns used ${r.columns}; viewport ${JSON.stringify(r.viewport)}; props ${JSON.stringify(r.props)}; event keys ${r.keys.join(',')}` : 'the pane has not been drawn yet: run /office first',
        ].join('\n'),
      }
    }
    if (arg === 'stats') {
      return { text: `Agent Office: mode ${mode}, ${office.live().length} agents; ${stat.portraits} portraits drawn (${stat.kib} KiB), ${stat.redraws} redraws.` }
    }
    if (arg.startsWith('demo')) {
      const n = Math.max(1, Math.min(MAX_TILES, parseInt(arg.slice(4), 10) || 6))
      office.members = office.members.filter(m => !m.id.startsWith('demo-'))
      for (let i = 0; i < n; i++) office.add('demo-' + i, DEMO_ROLES[i % DEMO_ROLES.length], roles[DEMO_ROLES[i % DEMO_ROLES.length]].tasks[0])
      demoEnd = office.tick + 90
      markDirty()
    }
    const r = await open($)
    if (!r.isPlaced) return { text: `Agent Office could not open its pane: ${r.reason ?? 'no room for it'}.` }
    redraw($)
    return { text: arg.startsWith('demo') ? 'Agent Office: demo agents at work.' : 'Agent Office is open.' }
  })

  // A subagent starts: it gets a tile. The pane opens by itself the first time.
  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    try {
      if (!r.deny && r.agentId) {
        office.add(r.agentId, roleFor(e.subagentType, e.description), 'starting up')
        if (cfg.autoOpen && !isOpen && !autoOpened) { autoOpened = true; await open($) }
        markDirty()
      }
    } catch {
      // The office is decoration: it must never get in the way of the subagent.
    }
    return r
  })

  // What a subagent's tool calls say about what it is doing right now.
  on('tool.call', async ($, e, next) => {
    const id = e.agentId
    try {
      if (id) {
        if (!office.has(id) && !unlisted.has(id)) {
          const info = (await $.agent.list()).find(a => a.id === id)
          if (info) office.add(id, roleFor(info.type, info.description), 'working')
          else unlisted.add(id)
        }
        if (office.has(id)) {
          office.setTask(id, describeTool(e as unknown as { tool: string }))
          markDirty()
        }
      }
    } catch {
      // Never let the office break a tool call.
    }
    return next(e)
  })

  // A subagent's run ends: its tile says done and goes a few seconds later.
  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    try {
      if (e.agentId && office.has(e.agentId)) {
        office.finish(e.agentId)
        markDirty()
      }
    } catch {
      // Same as above.
    }
    return r
  })

  // The pane was closed: stop all work. "/office" opens it again.
  on('ui.close', { id: PANE }, async ($, e, next) => {
    const r = await next(e)
    stopLoop()
    return r
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e) as unknown as Record<string, any>
    const { Box, Text, Image } = els
    const ev = e as unknown as { props?: { bodyColumns?: number }; bodyColumns?: number; viewport?: { columns?: number; rows?: number; isFullscreen?: boolean } }
    const width = ev.props?.bodyColumns ?? ev.bodyColumns ?? (ev.viewport?.columns ? Math.floor(ev.viewport.columns / 2) : 48)
    paneColumns = Math.max(24, Math.min(80, width))
    const c = await detectCaps($)
    const tile = Math.floor((paneColumns - 1) / 2)
    const rows = Math.max(3, Math.round(tile / cfg.cellAspect))
    const canShow = !!Image && tile >= MIN_TILE && (mode === 'image' || (mode === 'auto' && c.images && ev.viewport?.isFullscreen === true))
    const shown = office.members.slice(0, MAX_TILES)
    const more = office.members.length - shown.length
    lastRender = { keys: Object.keys(e), props: ev.props, viewport: ev.viewport, columns: paneColumns, drawn: canShow ? `${shown.length} portraits, ${tile} cells wide` : 'text list' }
    const live = office.live().length

    if (!canShow) {
      return (
        <Box flexDirection="column">
          {office.members.length === 0 && <Text dimColor>No subagents running. Try /office demo.</Text>}
          {office.members.length > 0 && <Text dimColor>Agent Office: {live} working</Text>}
          {office.members.map(m => (
            <Text dimColor={m.leave !== undefined}>
              <Text color={roles[m.role].color}>■ </Text>
              <Text bold>{roles[m.role].name.toLowerCase()}</Text> {m.leave !== undefined ? 'done' : m.task}
            </Text>
          ))}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap={1}>
        {office.members.length === 0 && <Text dimColor>No subagents running. Try /office demo.</Text>}
        <Box flexDirection="row" flexWrap="wrap" columnGap={1} rowGap={1} width={paneColumns}>
          {shown.map(m => {
            const done = m.leave !== undefined
            const color = roles[m.role].color
            return (
              <Box flexDirection="column" width={tile}>
                <Image key={m.id} source={{ png: portraitOf(m.id, m.role, m.look, m.seed) }} columns={tile} rows={rows} alt={roles[m.role].name.toLowerCase()} />
                <Text color={color} bold dimColor={done}>{roles[m.role].name.toLowerCase()}</Text>
                <Text dimColor={done}>{fit(done ? 'done' : m.task, tile)}</Text>
              </Box>
            )
          })}
        </Box>
        {more > 0 && <Text dimColor>+{more} more working</Text>}
      </Box>
    )
  })
}
