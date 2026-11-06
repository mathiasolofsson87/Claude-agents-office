/** Tiles drawn in the grid. More agents are counted but not drawn. */
export const MAX_TILES = 16
/** Ticks (seconds) a finished agent stays, shown as done, before its tile goes. */
export const LEAVE_TICKS = 3

/** Which character a subagent becomes, from its type and its one-line description. */
export function roleFor(type = '', description = ''): string {
  const t = type.toLowerCase()
  const d = description.toLowerCase()
  if (/explore/.test(t)) return 'explore'
  if (/plan/.test(t)) return 'plan'
  if (/think/.test(t)) return 'think'
  if (/quick|haiku|statusline/.test(t)) return 'quick'
  if (/review|simplify|security/.test(t)) return 'review'
  if (/test|qa/.test(t)) return 'test'
  if (/doc|guide|writer/.test(t)) return 'docs'
  if (/\b(review|audit|check)\b/.test(d)) return 'review'
  if (/\b(test|tests|verify)\b/.test(d)) return 'test'
  if (/\b(doc|docs|readme|document)\b/.test(d)) return 'docs'
  if (/\b(plan|design|architect)\b/.test(d)) return 'plan'
  if (/\b(find|search|explore|research|investigate|locate|map)\b/.test(d)) return 'explore'
  return 'code'
}

// The bubble font has A-Z, 0-9 and . - : / only, so everything else becomes a space.
const clean = (s: string) => s.replace(/[^a-z0-9.\-:/ ]/gi, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
const base = (p: string) => p.split('/').pop() || p
const clip = (s: string, n = 24) => (s.length > n ? s.slice(0, n).trimEnd() : s)

function bashTask(command: string): string {
  const c = command.trim()
  if (/(npm|pnpm|yarn|bun)\s+(run\s+)?test|pytest|vitest|jest|cargo test|go test|rspec/.test(c)) return 'running tests'
  if (/(npm|pnpm|yarn|bun)\s+(run\s+)?build|\btsc\b|cargo build|\bmake\b|gradle|webpack|vite build/.test(c)) return 'building the project'
  if (/lint|eslint|prettier|ruff/.test(c)) return 'linting'
  if (/(npm|pnpm|yarn|bun) (i|install|add)\b|pip install/.test(c)) return 'installing packages'
  if (/^git\s/.test(c)) return clip(clean('using git ' + (c.split(/\s+/)[1] ?? '')))
  if (/\b(rg|grep|ag|find|fd)\b/.test(c)) return 'searching the code'
  return clip(clean('running ' + (c.split(/\s+/)[0] ?? 'a command')))
}

/** A short, CLI-style line for what a subagent's tool call is doing. */
export function describeTool(call: { tool: string; [key: string]: unknown }): string {
  const t = call.tool
  switch (t) {
    case 'Read':
      return clip(clean('reading ' + base(String(call.file_path ?? 'files'))))
    case 'Edit':
    case 'Write':
    case 'NotebookEdit':
      return clip(clean('editing ' + base(String(call.file_path ?? call.notebook_path ?? 'files'))))
    case 'Bash':
      return bashTask(String(call.command ?? ''))
    case 'WebSearch':
      return clip(clean('researching ' + String(call.query ?? '')))
    case 'WebFetch':
      return 'reading the web'
    case 'Agent':
      return 'delegating'
    case 'LSP':
      return 'checking symbols'
  }
  if (/grep|glob|search|find/i.test(t)) return 'searching the code'
  if (t.startsWith('mcp__')) return clip(clean('using ' + t.split('__').slice(-1)[0]))
  return clip(clean(t))
}

/** A small number from an agent's id: the same agent always gets the same face and the same room. */
export function agentSeed(s: string): number {
  let h = 7
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return (h % 9973) + 1
}

export type Member = { id: string; role: string; look: unknown; seed: number; task: string; born: number; leave?: number }

/** Who is in the office and what they are saying, in the order they arrived. Pure state: no engine calls. */
export class Office {
  tick = 0
  members: Member[] = []
  constructor(private lookFor: (role: string, seed: number) => unknown) {}

  has(id: string): boolean {
    return this.members.some(m => m.id === id)
  }

  add(id: string, role: string, task: string): void {
    if (this.has(id)) return
    const seed = agentSeed(id)
    this.members.push({ id, role, look: this.lookFor(role, seed), seed, task, born: this.tick })
  }

  setTask(id: string, task: string): void {
    const m = this.members.find(x => x.id === id)
    if (m && m.leave === undefined) m.task = task
  }

  finish(id: string): void {
    const m = this.members.find(x => x.id === id)
    if (m && m.leave === undefined) m.leave = this.tick
  }

  clear(): void {
    for (const m of this.members) if (m.leave === undefined) m.leave = this.tick
  }

  /** Advances `ticks` ticks (seconds); returns who left, so their pictures can be dropped. */
  step(ticks = 1): Member[] {
    this.tick += ticks
    const gone = this.members.filter(m => m.leave !== undefined && this.tick - m.leave >= LEAVE_TICKS)
    if (gone.length > 0) this.members = this.members.filter(m => !gone.includes(m))
    return gone
  }

  live(): Member[] {
    return this.members.filter(m => m.leave === undefined)
  }
}
