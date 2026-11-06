// @ts-nocheck
// Software renderer for the Agent Office portraits. Ported from an HTML mockup: the drawing
// code is unchanged and writes into an RGBA buffer instead of a canvas.

/** What a portrait needs: the character, and the look `lookFor` made for them. */
export interface Agent {
  /** one of: explore plan code review think test quick docs */
  role: string
  look: unknown
  /** varies the room around them (windows, pictures); the same seed always gives the same room */
  seed?: number
}
export interface Frame { width: number; height: number; rgba: Uint8ClampedArray }

type RGBA = [number, number, number, number]
const colorCache = new Map<string, RGBA>()
function parseColor(c: string): RGBA {
  const hit = colorCache.get(c)
  if (hit) return hit
  let out: RGBA
  if (c[0] === '#') {
    const n = parseInt(c.slice(1), 16)
    out = [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255]
  } else {
    const m = c.match(/rgba?\(([^)]+)\)/)
    if (!m) throw new Error('unsupported color ' + c)
    const p = m[1].split(',').map(v => parseFloat(v))
    out = [p[0], p[1], p[2], p.length > 3 ? Math.round(p[3] * 255) : 255]
  }
  colorCache.set(c, out)
  return out
}

/** A canvas-2D-shaped surface backed by an RGBA byte array: just the calls the renderer makes. */
class PixCtx {
  fillStyle = '#000000'
  private pix: Pix
  constructor(pix: Pix) { this.pix = pix }
  fillRect(x: number, y: number, w: number, h: number): void {
    const p = this.pix
    const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(p.w, x + w), y1 = Math.min(p.h, y + h)
    if (x1 <= x0 || y1 <= y0) return
    const [r, g, b, a] = parseColor(this.fillStyle), d = p.data
    if (a === 255) {
      for (let yy = y0; yy < y1; yy++) {
        let i = (yy * p.w + x0) * 4
        for (let xx = x0; xx < x1; xx++) { d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; i += 4 }
      }
      return
    }
    if (a === 0) return
    const sa = a / 255
    for (let yy = y0; yy < y1; yy++) {
      let i = (yy * p.w + x0) * 4
      for (let xx = x0; xx < x1; xx++) {
        const da = d[i + 3] / 255, oa = sa + da * (1 - sa)
        d[i] = (r * sa + d[i] * da * (1 - sa)) / oa
        d[i + 1] = (g * sa + d[i + 1] * da * (1 - sa)) / oa
        d[i + 2] = (b * sa + d[i + 2] * da * (1 - sa)) / oa
        d[i + 3] = oa * 255
        i += 4
      }
    }
  }
  clearRect(x: number, y: number, w: number, h: number): void {
    const p = this.pix
    for (let yy = Math.max(0, y); yy < Math.min(p.h, y + h); yy++)
      p.data.fill(0, (yy * p.w + Math.max(0, x)) * 4, (yy * p.w + Math.min(p.w, x + w)) * 4)
  }
  drawImage(src: Pix, dx: number, dy: number): void {
    const p = this.pix, s = src.data, d = p.data
    for (let sy = 0; sy < src.h; sy++) {
      const ty = sy + dy
      if (ty < 0 || ty >= p.h) continue
      for (let sx = 0; sx < src.w; sx++) {
        const tx = sx + dx
        if (tx < 0 || tx >= p.w) continue
        const si = (sy * src.w + sx) * 4, a = s[si + 3]
        if (a === 0) continue
        const di = (ty * p.w + tx) * 4
        if (a === 255) { d[di] = s[si]; d[di + 1] = s[si + 1]; d[di + 2] = s[si + 2]; d[di + 3] = 255; continue }
        const sa = a / 255, da = d[di + 3] / 255, oa = sa + da * (1 - sa)
        d[di] = (s[si] * sa + d[di] * da * (1 - sa)) / oa
        d[di + 1] = (s[si + 1] * sa + d[di + 1] * da * (1 - sa)) / oa
        d[di + 2] = (s[si + 2] * sa + d[di + 2] * da * (1 - sa)) / oa
        d[di + 3] = oa * 255
      }
    }
  }
}
class Pix {
  w: number
  h: number
  data: Uint8ClampedArray
  private ctx: PixCtx
  constructor(w: number, h: number) {
    this.w = w
    this.h = h
    this.data = new Uint8ClampedArray(w * h * 4)
    this.ctx = new PixCtx(this)
  }
  getContext(_kind?: string): PixCtx { return this.ctx }
}

/**
 * `scale` is device pixels per drawing unit: 1 gives a 136 pixel square portrait,
 * 2 gives twice the detail. Each renderer keeps its own caches and layout state.
 */
export function createRenderer(scale: 1 | 2 = 1) {
  /* ---------- geometry: 2:1 isometric, 64x32 tiles ---------- */
  var A = 32, B = 16, Z = scale;
  var g, ORX = 0, ORY = 0;
  function X(gx, gy) { return ORX + (gx - gy) * A; }
  function Y(gx, gy, z) { return ORY + (gx + gy) * B - z; }
  function pt(gx, gy, z) { return [Math.round(X(gx, gy) * Z) / Z, Math.round(Y(gx, gy, z) * Z) / Z]; }

  /* ---------- crisp raster primitives. Coordinates are in base units; the canvas holds Z pixels per unit, so half-unit detail is possible ---------- */
  var OL = '#1d1832';
  var cc = {};
  function sh(c, f) {
    var k = c + f; if (cc[k]) return cc[k];
    var n = parseInt(c.slice(1), 16);
    function m(v) { return Math.max(0, Math.min(255, Math.round(v * f))); }
    return (cc[k] = 'rgb(' + m(n >> 16 & 255) + ',' + m(n >> 8 & 255) + ',' + m(n & 255) + ')');
  }
  function R(x, y, w, h, c) {
    var x0 = Math.round(x * Z), y0 = Math.round(y * Z), x1 = Math.round((x + w) * Z), y1 = Math.round((y + h) * Z);
    if (x1 <= x0 || y1 <= y0) return;
    g.fillStyle = c; g.fillRect(x0, y0, x1 - x0, y1 - y0);
  }
  function E(cx, cy, rx, ry, c) {
    g.fillStyle = c;
    var X0 = cx * Z, Y0 = cy * Z, RX = rx * Z, RY = ry * Z, n = Math.floor(RY);
    for (var y = -n; y <= n; y++) {
      var h = RX * Math.sqrt(Math.max(0, 1 - (y * y) / (RY * RY + 0.25)));
      var x0 = Math.round(X0 - h), x1 = Math.round(X0 + h);
      if (x1 > x0) g.fillRect(x0, Math.round(Y0 + y), x1 - x0, 1);
    }
  }
  function poly(p, c) {
    g.fillStyle = c;
    var n = p.length, i, q = [], miny = 1e9, maxy = -1e9;
    for (i = 0; i < n; i++) { q.push([p[i][0] * Z, p[i][1] * Z]); if (q[i][1] < miny) miny = q[i][1]; if (q[i][1] > maxy) maxy = q[i][1]; }
    for (var y = Math.ceil(miny); y < maxy; y++) {
      var yy = y + 0.5, lo = 1e9, hi = -1e9;
      for (i = 0; i < n; i++) {
        var a = q[i], b = q[(i + 1) % n];
        if ((a[1] <= yy && b[1] > yy) || (b[1] <= yy && a[1] > yy)) {
          var x = a[0] + (yy - a[1]) * (b[0] - a[0]) / (b[1] - a[1]);
          if (x < lo) lo = x; if (x > hi) hi = x;
        }
      }
      if (hi >= lo) { var x0 = Math.round(lo), x1 = Math.round(hi); if (x1 > x0) g.fillRect(x0, y, x1 - x0, 1); }
    }
  }
  function L(x0, y0, x1, y1, c, w) {
    var s = Math.max(1, Math.round((w === undefined ? 1 : w) * Z));
    x0 = Math.round(x0 * Z); y0 = Math.round(y0 * Z); x1 = Math.round(x1 * Z); y1 = Math.round(y1 * Z);
    var dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1, e = dx + dy;
    g.fillStyle = c;
    for (;;) {
      g.fillRect(x0, y0, s, s);
      if (x0 === x1 && y0 === y1) break;
      var e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
  }
  function thick(x0, y0, x1, y1, w, c) {
    var s = Math.max(1, Math.round(w * Z)), n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1) * Z;
    g.fillStyle = c;
    for (var i = 0; i <= n; i++) g.fillRect(Math.round((x0 + (x1 - x0) * i / n) * Z - s / 2), Math.round((y0 + (y1 - y0) * i / n) * Z - s / 2), s, s);
  }
  function rnd(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

  /* 3x5 pixel font */
  var G = {
    A:'25755',B:'65656',C:'34443',D:'65556',E:'74647',F:'74644',G:'34553',H:'55755',I:'72227',J:'11152',
    K:'55655',L:'44447',M:'57755',N:'65555',O:'25552',P:'65644',Q:'25573',R:'65655',S:'34216',T:'72222',
    U:'55557',V:'55552',W:'55775',X:'55255',Y:'55222',Z:'71247',
    0:'75557',1:'26227',2:'61247',3:'61216',4:'55711',5:'74616',6:'34757',7:'71222',8:'75757',9:'75716',
    '.':'00002','-':'00700',':':'02020','/':'11244',' ':'00000'
  };
  function T(s, x, y, c, k) {
    k = k || 1; s = String(s).toUpperCase();
    for (var i = 0; i < s.length; i++) {
      var gl = G[s[i]] || G[' '];
      for (var r = 0; r < 5; r++) {
        var row = +gl[r];
        for (var b = 0; b < 3; b++) if (row & (4 >> b)) R(x + b * k, y + r * k, k, k, c);
      }
      x += 4 * k;
    }
  }
  function TW(s, k) { return (String(s).length * 4 - 1) * (k || 1); }

  /* ---------- iso solids and wall planes ---------- */
  function box(gx, gy, z, dx, dy, dz, c) {
    var top = [pt(gx, gy, z + dz), pt(gx + dx, gy, z + dz), pt(gx + dx, gy + dy, z + dz), pt(gx, gy + dy, z + dz)];
    poly([pt(gx, gy + dy, z + dz), pt(gx + dx, gy + dy, z + dz), pt(gx + dx, gy + dy, z), pt(gx, gy + dy, z)], sh(c, 0.8));
    poly([pt(gx + dx, gy, z + dz), pt(gx + dx, gy + dy, z + dz), pt(gx + dx, gy + dy, z), pt(gx + dx, gy, z)], sh(c, 0.6));
    poly(top, c);
    L(top[3][0], top[3][1], top[2][0], top[2][1], sh(c, 1.18));
    L(top[2][0], top[2][1], top[1][0], top[1][1], sh(c, 1.1));
    var a = pt(gx + dx, gy + dy, z + dz), b = pt(gx + dx, gy + dy, z);
    L(a[0], a[1], b[0], b[1], sh(c, 0.5));
  }
  function flat(gx, gy, dx, dy, z, c) { poly([pt(gx, gy, z), pt(gx + dx, gy, z), pt(gx + dx, gy + dy, z), pt(gx, gy + dy, z)], c); }
  function wallR(g0, g1, z0, z1, c) { poly([pt(g0, 0, z0), pt(g1, 0, z0), pt(g1, 0, z1), pt(g0, 0, z1)], c); }
  function wallL(g0, g1, z0, z1, c) { poly([pt(0, g0, z0), pt(0, g1, z0), pt(0, g1, z1), pt(0, g0, z1)], c); }

  /* ---------- people ---------- */
  var SK = [
    { s: '#f2c8a0', d: '#d9a77c', l: '#ffe3c8' }, { s: '#c88a5a', d: '#a56b40', l: '#e0a577' },
    { s: '#8d5a3b', d: '#6e4229', l: '#a97250' }, { s: '#ffdcb8', d: '#e8bd94', l: '#fff0dc' },
    { s: '#e0ac80', d: '#bf8a5e', l: '#f2c8a0' }, { s: '#a8694a', d: '#85503a', l: '#c28462' },
    { s: '#f2c8a0', d: '#d9a77c', l: '#ffe3c8' }, { s: '#c88a5a', d: '#a56b40', l: '#e0a577' }
  ];
  var ROLES = {
    explore: { name: 'EXPLORER', color: '#4fc3f7', shirt: '#b08a52', hair: '#4a2f1a',
      tasks: ['GREP SRC/AUTH', 'READ 14 FILES', 'MAP IMPORTS', 'FOUND 3 MATCHES'],
      who: 'Explore subagent', does: 'Fedora, trench coat and a magnifier. Greps, globs and reads through the repo to find where things live.' },
    plan: { name: 'PLANNER', color: '#ffd54f', shirt: '#3f6fb5', hair: '#222233',
      tasks: ['DRAFT STEP LIST', 'SKETCH MODULES', 'ORDER THE WORK', 'CHECK RISKS'],
      who: 'Plan subagent', does: 'Hard hat, safety vest and blueprints. Reads the code, then draws up the steps before anyone builds.' },
    code: { name: 'CODER', color: '#ff6fa5', shirt: '#6a4fb3', hair: '#2b1b3d',
      tasks: ['EDIT LOGIN.TS', 'WRITE SESSION.TS', 'FIX TYPE ERROR', 'REFACTOR HOOK'],
      who: 'general-purpose subagent', does: 'Hoodie, headphones and coffee. The floating screen scrolls code. The agent that edits and writes files.' },
    review: { name: 'REVIEWER', color: '#ef5350', shirt: '#e8e8f0', hair: '#6b3d1f',
      tasks: ['READ THE DIFF', 'FLAG 2 BUGS', 'CHECK EDGE CASES', 'MARK UP PR'],
      who: 'code-review, simplify', does: 'Glasses, tie and a red pen. Green and red marks appear on the floating page as the diff is checked.' },
    think: { name: 'THINKER', color: '#ba9bff', shirt: '#f4f4fa', hair: '#e6e6ee',
      tasks: ['WEIGH OPTIONS', 'TRACE THE BUG', 'RETHINK DESIGN', 'DEEP THOUGHT'],
      who: 'deep-thinker (Opus)', does: 'Lab coat and wild hair, chin on hand. Few tool calls, long reasoning, so the idea bubble flickers over a quiet desk.' },
    test: { name: 'TESTER', color: '#66e0a3', shirt: '#2e9d6b', hair: '#1a1a24',
      tasks: ['RUN NPM TEST', 'WAIT FOR CI', '12 PASS 1 FAIL', 'RERUN FLAKY'],
      who: 'Bash running tests', does: 'Scrubs, goggles and a bubbling beaker. A grid of dots fills in green, with the odd red one.' },
    quick: { name: 'RUNNER', color: '#ff9a3c', shirt: '#ff8a2a', hair: '#7a4a22',
      tasks: ['RENAME FILES', 'FORMAT CODE', 'QUICK LOOKUP', 'SUMMARIZE LOG'],
      who: 'quick-helper (Haiku)', does: 'Backwards cap, sticky notes and a paper plane. Types twice as fast and finishes first.' },
    docs: { name: 'WRITER', color: '#8ee06a', shirt: '#5aa04a', hair: '#8a4a2a',
      tasks: ['UPDATE README', 'WRITE CLAUDE.MD', 'DOCUMENT API', 'POLISH COPY'],
      who: 'Docs and markdown work', does: 'Beret, scarf and an open book. Paragraphs appear on the floating page with a blinking cursor.' }
  };
  ROLES.explore.tasks = ['reading 14 files', 'searching src/auth', 'researching oauth', 'mapping imports', 'found 3 matches'];
  ROLES.plan.tasks = ['drafting 5 steps', 'sketching modules', 'building schema', 'ordering the work', 'checking risks'];
  ROLES.code.tasks = ['editing login.ts', 'writing session.ts', 'building auth flow', 'fixing type error', 'refactoring hook'];
  ROLES.review.tasks = ['reading the diff', 'flagging 2 bugs', 'checking edge cases', 'marking up PR'];
  ROLES.think.tasks = ['weighing options', 'tracing the bug', 'rethinking design', 'thinking hard'];
  ROLES.test.tasks = ['running npm test', 'waiting for CI', '12 pass, 1 fail', 'rerunning flaky'];
  ROLES.quick.tasks = ['renaming files', 'formatting code', 'building index', 'summarizing log'];
  ROLES.docs.tasks = ['updating README', 'writing CLAUDE.md', 'documenting API', 'polishing copy'];
  var ORDER = ['explore', 'plan', 'code', 'review', 'think', 'test', 'quick', 'docs'];

  /* ---------- people: chunky flat pixel avatars, one pixel = 1.5 units, no outlines ---------- */
  var P = 1.5;
  function pg(ox, oy) { return function (c, r, w, h, col) { R(ox + c * P, oy + r * P, w * P, h * P, col); }; }
  var EYES = ['#4a7ad8', '#4a3a2a', '#3a8a4a', '#6a4a8a', '#2a2a2a', '#5ab0e0'];
  var SKINS = ['#f8d2b0', '#efba8f', '#d89a6c', '#b87a4e', '#8a5634', '#5e3a22'];
  var NAT = ['#1a1a22', '#2b1b0e', '#4a2f1a', '#6a4326', '#8a5a32', '#c8a060', '#e8d090', '#a8382c', '#cfcfd6'];
  var FANT = ['#7a4ab0', '#d63c8a', '#3b82d6', '#2fb36b'];
  function pick(a, rg) { return a[Math.floor(rg() * a.length)]; }
  function seeded(seed) { var n = seed * 97 + 13; return function () { n += 1; return rnd(n); }; }
  var HATROLE = { explore: 1, plan: 1, quick: 1, docs: 1, code: 1, test: 1 };
  function makeLook(role, g, rg) {
    var f = g === 'f', Lk = { g: g, skin: pick(SKINS, rg), eyes: pick(EYES, rg) };
    Lk.hc = rg() < 0.12 ? pick(FANT, rg) : pick(NAT, rg);
    Lk.hat2 = (role === 'review' && rg() < 0.3) ? (rg() < 0.5 ? 'flat' : 'beanie') : null;
    var safe = HATROLE[role] || Lk.hat2;
    var ms = safe ? ['short', 'crew', 'swept', 'bald'] : ['short', 'crew', 'swept', 'bald', 'mohawk', 'afro', 'spiky'];
    var fs = safe ? ['long', 'bob', 'pixie', 'ponytail'] : ['long', 'bob', 'pixie', 'ponytail', 'bun', 'curly'];
    Lk.hs = pick(f ? fs : ms, rg);
    Lk.fh = f ? 'none' : pick(['none', 'none', 'none', 'stubble', 'mustache', 'goatee', 'beard', 'beard'], rg);
    Lk.gl = pick(['none', 'none', 'none', 'round', 'square', 'shades'], rg);
    Lk.mouth = f ? pick(['lips', 'lips', 'smile'], rg) : pick(['grin', 'grin', 'smile', 'flat'], rg);
    Lk.cap = pick(['#e03a3a', '#3b82f6', '#ff8a2a', '#22a06b'], rg);
    Lk.ear = rg() < (f ? 0.7 : 0.15);
    if (role === 'review') Lk.gl = rg() < 0.5 ? 'round' : 'square';
    if (role === 'test' || role === 'code') { if (Lk.gl === 'shades') Lk.gl = 'none'; }
    if (role === 'think' && rg() < 0.75) Lk.hc = '#e6e6ee';
    return Lk;
  }

  function hatOf(role, Lk) {
    return { explore: 'fedora', plan: 'hard', quick: 'cap', docs: 'beret', code: 'phones', test: 'goggles' }[role] || Lk.hat2 || null;
  }

  function drawHead(ax, ay, t, role, Lk, closed) {
    var hx = ax - 9, hy = ay - 46, p = pg(hx, hy), sk = Lk.skin, sd = sh(sk, 0.84), sl = sh(sk, 1.07), hc = Lk.hc, hd = sh(hc, 0.7), hl = sh(hc, 1.3);
    var f = Lk.g === 'f', blink = closed || (t % 44) < 2, i;
    p(4, 12, 4, 2, sd);
    {
    p(2, 1, 8, 1, sk); p(1, 2, 10, 9, sk); p(2, 11, 8, 1, sk);
    p(10, 3, 1, 8, sd); p(9, 9, 1, 2, sd); p(3, 11, 6, 1, sd); p(3, 2, 3, 1, sl); p(2, 7, 1, 1, sl);
    p(0, 5, 1, 3, sd); p(0, 6, 1, 1, sh(sk, 0.68));
    var bc = sh(hc, 0.55); if (hc === '#e6e6ee' || hc === '#cfcfd6' || hc === '#e8d090') bc = '#6a6a76';
    p(2, 4, 2, 1, bc); p(6, 4, 2, 1, bc);
    if (blink) { p(2, 5, 2, 1, sk); p(6, 5, 2, 1, sk); p(2, 6, 2, 1, sd); p(6, 6, 2, 1, sd); }
    else {
      p(2, 5, 1, 2, '#ffffff'); p(3, 5, 1, 2, Lk.eyes); p(3, 5, 1, 1, sh(Lk.eyes, 0.55));
      p(6, 5, 1, 2, '#ffffff'); p(7, 5, 1, 2, Lk.eyes); p(7, 5, 1, 1, sh(Lk.eyes, 0.55));
    }
    if (f) { p(1, 5, 1, 1, '#2a2a2a'); p(8, 5, 1, 1, '#2a2a2a'); }
    p(4, 7, 1, 2, sd);
    if (f || sk === SKINS[0]) { p(2, 8, 1, 1, 'rgba(240,110,110,.4)'); p(7, 8, 1, 1, 'rgba(240,110,110,.3)'); }
    if (Lk.fh === 'beard') { p(1, 7, 1, 3, hc); p(10, 7, 1, 3, hd); p(1, 9, 10, 2, hc); p(2, 11, 8, 1, hc); p(8, 9, 2, 3, hd); p(3, 8, 5, 1, hc); }
    if (Lk.fh === 'goatee') { p(4, 10, 3, 2, hc); p(3, 8, 5, 1, hc); }
    if (Lk.fh === 'mustache') { p(3, 8, 5, 1, hc); }
    if (Lk.fh === 'stubble') { p(2, 8, 8, 3, 'rgba(20,14,20,.28)'); }
    switch (Lk.mouth) {
      case 'grin': p(3, 9, 4, 1, '#ffffff'); if (Lk.fh === 'none' || Lk.fh === 'stubble') p(3, 10, 3, 1, '#d08078'); break;
      case 'smile': p(3, 9, 3, 1, '#b8504a'); break;
      case 'lips': p(3, 9, 3, 1, '#e8407a'); p(3, 10, 3, 1, '#c8306a'); break;
      default: p(3, 9, 3, 1, sh(sk, 0.62));
    }
    if (Lk.gl === 'round' || Lk.gl === 'square') {
      var F = '#222233', xs = [1, 5];
      for (i = 0; i < 2; i++) {
        var x0 = xs[i];
        p(x0, 4, 4, 1, F); p(x0, 7, 4, 1, F); p(x0, 4, 1, 4, F); p(x0 + 3, 4, 1, 4, F);
        if (Lk.gl === 'round') { p(x0, 4, 1, 1, sk); p(x0 + 3, 4, 1, 1, sk); p(x0, 7, 1, 1, sk); p(x0 + 3, 7, 1, 1, sk); }
      }
      p(0, 5, 1, 1, F);
    }
    if (Lk.gl === 'shades') { p(1, 4, 8, 3, '#111116'); p(0, 4, 1, 1, '#111116'); p(2, 5, 1, 1, '#4a4a58'); p(6, 5, 1, 1, '#4a4a58'); }
    switch (Lk.hs) {
      case 'short': p(2, 0, 8, 1, hc); p(1, 1, 10, 2, hc); p(1, 3, 1, 3, hc); p(10, 3, 1, 2, hd); p(2, 3, 4, 1, hc); p(3, 0, 3, 1, hl); p(7, 1, 3, 2, hd); break;
      case 'crew': p(2, 1, 8, 1, hc); p(1, 2, 10, 1, hc); p(1, 3, 1, 2, hc); p(10, 3, 1, 1, hd); p(4, 1, 3, 1, hl); break;
      case 'swept': p(3, -1, 6, 1, hc); p(2, 0, 8, 1, hc); p(1, 1, 10, 3, hc); p(1, 4, 1, 2, hc); p(8, 0, 3, 4, hd); p(4, -1, 3, 1, hl); p(3, 1, 4, 1, hl); break;
      case 'bald': p(1, 4, 1, 2, sh(hc, 0.9)); p(10, 4, 1, 1, hd); p(4, 1, 2, 1, sl); break;
      case 'mohawk': p(5, -3, 2, 1, hc); p(4, -2, 4, 1, hc); p(4, -1, 4, 1, hl); p(5, 0, 2, 3, hc); p(4, 0, 1, 2, hd); break;
      case 'afro': p(1, -2, 10, 2, hc); p(0, 0, 12, 4, hc); p(0, 4, 2, 2, hc); p(10, 4, 2, 2, hd); p(3, -1, 3, 1, hl); p(2, 1, 1, 1, hd); p(7, 2, 1, 1, hl); break;
      case 'spiky': p(1, -1, 1, 1, hc); p(3, -1, 1, 1, hc); p(5, -1, 1, 1, hl); p(7, -1, 1, 1, hc); p(9, -1, 1, 1, hd); p(1, 0, 10, 3, hc); p(1, 3, 1, 2, hc); p(10, 3, 1, 1, hd); p(4, 0, 3, 1, hl); break;
      case 'long': p(2, 0, 8, 1, hc); p(1, 1, 10, 3, hc); p(1, 4, 2, 1, hc); p(0, 3, 2, 10, hc); p(10, 3, 2, 9, hd); p(3, 0, 3, 1, hl); p(2, 2, 2, 1, hl); p(0, 12, 2, 1, hd); break;
      case 'bob': p(2, 0, 8, 1, hc); p(1, 1, 10, 3, hc); p(2, 3, 5, 1, hc); p(0, 3, 2, 6, hc); p(10, 3, 2, 6, hd); p(3, 0, 3, 1, hl); p(0, 8, 2, 1, hd); break;
      case 'bun': p(2, 0, 8, 1, hc); p(1, 1, 10, 2, hc); p(1, 3, 1, 3, hc); p(10, 3, 1, 2, hd); p(4, -3, 4, 1, hl); p(3, -2, 6, 2, hc); p(4, -1, 4, 1, hd); p(3, 0, 6, 1, hd); break;
      case 'ponytail': p(2, 0, 8, 1, hc); p(1, 1, 10, 2, hc); p(1, 3, 1, 3, hc); p(10, 3, 1, 2, hd); p(3, 0, 3, 1, hl); p(-2, 3, 2, 9, hc); p(-1, 2, 1, 1, hc); p(-1, 3, 1, 1, '#ff6fa5'); p(-2, 11, 1, 1, hd); break;
      case 'pixie': p(2, 0, 8, 1, hc); p(1, 1, 10, 2, hc); p(1, 3, 3, 2, hc); p(10, 3, 1, 3, hd); p(3, 0, 3, 1, hl); break;
      case 'curly': p(2, -1, 8, 1, hc); p(0, 0, 12, 4, hc); p(0, 4, 2, 4, hc); p(10, 4, 2, 4, hd); p(3, 0, 2, 1, hl); p(7, 2, 2, 1, hl); p(1, 6, 1, 1, hd); break;
    }
    }
    var hat = hatOf(role, Lk), Y = '#ffd23f';
    switch (hat) {
      case 'fedora': p(2, -3, 8, 3, '#8a5e30'); p(3, -3, 3, 1, '#a87a46'); p(8, -3, 2, 3, '#6e4a24'); p(2, -1, 8, 1, '#3b2a18'); p(-1, 0, 14, 1, '#6a4524'); p(9, 0, 4, 1, '#523618'); p(9, -2, 1, 2, '#e8e0c8'); break;
      case 'hard': p(3, -3, 6, 1, Y); p(2, -2, 8, 1, Y); p(1, -1, 10, 2, Y); p(0, 1, 12, 1, '#e8b820'); p(3, -2, 3, 1, '#fff0a0'); p(5, -3, 2, 3, '#fff0a0'); p(8, -1, 3, 2, '#e8b820'); p(4, -1, 1, 2, '#e8b820'); break;
      case 'cap': p(2, -2, 8, 1, Lk.cap); p(1, -1, 10, 2, Lk.cap); p(8, -1, 3, 2, sh(Lk.cap, 0.8)); p(-3, 1, 9, 1, sh(Lk.cap, 0.7)); p(5, -1, 2, 1, '#ffffff'); p(3, -2, 3, 1, sh(Lk.cap, 1.25)); break;
      case 'beret': p(2, -2, 8, 1, '#c0392b'); p(1, -1, 11, 2, '#c0392b'); p(5, -3, 2, 1, '#c0392b'); p(8, -1, 4, 2, '#9e2d21'); p(3, -1, 3, 1, '#e06050'); break;
      case 'phones': p(1, -1, 10, 1, '#ff5c93'); p(0, 0, 1, 3, '#ff5c93'); p(11, 0, 1, 3, '#d63c78'); p(-1, 3, 2, 5, '#ff5c93'); p(-1, 4, 1, 3, '#ff9ec0'); p(11, 3, 2, 5, '#d63c78'); p(2, -1, 3, 1, '#ff9ec0'); break;
      case 'goggles': p(0, 2, 12, 1, '#2d3150'); p(2, 1, 3, 2, '#7fe3ff'); p(7, 1, 3, 2, '#5cc8e8'); p(2, 1, 1, 1, '#e8fbff'); p(7, 1, 1, 1, '#e8fbff'); break;
      case 'flat': p(1, -1, 10, 2, '#8a8a96'); p(2, -2, 7, 1, '#8a8a96'); p(-2, 1, 8, 1, '#5a5a66'); p(8, -1, 3, 2, '#6a6a76'); p(3, -1, 3, 1, '#a8a8b4'); break;
      case 'beanie': p(1, -2, 10, 3, '#5a6ab0'); p(2, -3, 8, 1, '#5a6ab0'); p(5, -4, 2, 1, '#ffffff'); p(1, 1, 10, 1, '#46549a'); p(3, -2, 3, 1, '#7a8ad0'); p(8, -2, 3, 3, '#46549a'); break;
    }
    if (Lk.ear && Lk.hs !== 'long' && Lk.hs !== 'bob' && hat !== 'phones') p(0, 8, 1, 1, '#ffd24a');
  }

  function weave(x, y, w, h, c, step) {
    for (var j = 0; j * step < h; j++) for (var i = 0; i * step < w; i++) R(x + i * step + (j & 1) * step / 2, y + j * step, 0.8, 0.8, c);
  }

  function torso(role, ax, ay, Lk, rows) {
    var r = ROLES[role], c = r.shirt, f = Lk.g === 'f', cols = f ? 12 : 14, tx = ax - cols * P / 2, ty = ay - 26, p = pg(tx, ty), mid = cols / 2 - 1, i;
    rows = rows || 23;
    var sk = Lk.skin, sd = sh(sk, 0.84);
    var sr = rows >= 23 ? 18 : rows, fl = sh(c, 0.7), hi = sh(c, 1.2);
    p(2, 0, cols - 4, 1, c); p(1, 1, cols - 2, 1, c); p(0, 2, cols, sr - 2, c);
    p(0, 2, 1, sr - 2, hi); p(2, 0, 3, 1, hi); p(0, 1, 2, 1, sh(c, 1.1)); p(cols - 2, 2, 2, sr - 2, sh(c, 0.78)); p(cols - 4, 1, 2, 1, sh(c, 0.85));
    p(cols - 1, 3, 1, sr - 3, sh(c, 0.6)); p(cols - 3, 4, 1, 6, sh(c, 0.72));
    p(2, 4, 2, 1, hi); p(4, 6, 1, 1, sh(c, 1.12)); p(3, 9, 1, 2, sh(c, 1.1));
    p(2, 12, 1, 1, fl); p(3, 13, 2, 1, fl); p(5, 14, 1, 1, fl); p(cols - 6, 10, 1, 1, fl); p(cols - 7, 11, 2, 1, fl); p(cols - 9, 12, 1, 1, fl);
    p(1, 16, 2, 1, fl); p(cols - 4, 16, 3, 1, fl);
    switch (role) {
      case 'explore':
        weave(tx + 2, ty + 4, cols * P - 4, rows * P - 6, sh(c, 0.82), 2);
        p(mid - 5, 0, 3, 2, '#8f6c3a'); p(mid + 3, 0, 3, 2, '#7a5a2f');
        p(mid - 3, 2, 2, 9, '#8f6c3a'); p(mid + 2, 2, 2, 9, '#7a5a2f'); p(mid - 1, 0, 3, 11, '#e8d9a8'); p(mid, 11, 1, 10, '#5a3f1f');
        p(0, 15, cols, 1, '#5a3f1f'); p(mid - 1, 15, 3, 1, '#e0c060');
        for (i = 0; i < 3; i++) p(mid - 2, 6 + i * 3, 1, 1, '#e0c060');
        for (i = 0; i < 14; i++) p(1 + (i * 0.7 | 0), 1 + i, 2, 1, '#6b4423');
        if (f) { p(mid - 2, 0, 5, 2, '#d63c3c'); p(mid + 2, 2, 2, 5, '#b02e2e'); }
        break;
      case 'plan':
        p(1, 0, cols - 2, 20, '#ff9f1c'); p(mid, 0, 2, 20, c); p(cols - 3, 2, 2, 18, '#e08400');
        p(1, 8, mid - 1, 1, '#f2f2f2'); p(mid + 2, 8, cols - mid - 4, 1, '#d8d8d8'); p(1, 14, mid - 1, 1, '#f2f2f2'); p(mid + 2, 14, cols - mid - 4, 1, '#d8d8d8');
        p(1, 3, 3, 3, '#e08400'); p(1, 3, 3, 1, '#ffb44a'); p(cols - 4, 17, 3, 2, '#ffd23f'); p(cols - 2, 17, 1, 1, '#333');
        p(mid - 1, 0, 3, 1, '#e8e8f0');
        break;
      case 'code':
        weave(tx + 2, ty + 4, cols * P - 4, rows * P - 6, sh(c, 0.88), 1.5);
        p(mid - 4, 0, 9, 1, sh(c, 0.6)); p(mid - 3, 1, 7, 1, sh(c, 0.5));
        p(mid - 2, 2, 1, 5, '#e8e8f0'); p(mid + 1, 2, 1, 5, '#c8c8d8'); p(mid - 2, 6, 1, 1, '#ff6fa5'); p(mid + 1, 6, 1, 1, '#ff6fa5');
        p(2, 14, cols - 4, 6, sh(c, 0.82)); p(2, 14, cols - 4, 1, sh(c, 0.6)); p(mid - 1, 9, 3, 2, '#ff6fa5'); p(mid, 9, 1, 1, '#fff');
        break;
      case 'review':
        if (f) { p(mid - 4, 0, 3, 2, '#ff7aa8'); p(mid + 2, 0, 3, 2, '#e0608e'); p(mid - 1, 0, 3, 2, '#b02e60'); p(mid - 3, 2, 1, 1, '#ff7aa8'); p(mid + 3, 2, 1, 1, '#e0608e'); }
        else {
          p(mid - 3, 0, 3, 1, '#ffffff'); p(mid + 1, 0, 3, 1, '#d8dae6'); p(mid - 1, 0, 3, 3, '#b02e2e');
          p(mid - 1, 2, 3, 12, '#d63c3c'); p(mid, 2, 1, 12, '#e86060'); p(mid - 1, 14, 3, 1, '#b02e2e'); p(mid - 1, 9, 3, 1, '#d0d0e0');
        }
        p(cols - 5, 6, 4, 4, '#cfd3e6'); p(cols - 5, 5, 1, 1, '#2a6fd6'); p(cols - 3, 5, 1, 1, '#d63c3c'); p(cols - 2, 5, 1, 1, '#2fb36b');
        break;
      case 'think':
        p(mid - 1, 0, 3, 3, f ? '#e8a0c0' : '#4aa88a'); p(mid, 3, 1, 2, f ? '#e8a0c0' : '#4aa88a');
        p(mid - 4, 0, 3, 11, '#dcdce8'); p(mid + 2, 0, 3, 11, '#c4c4d6');
        p(cols - 6, 11, 4, 4, '#e3e3ee'); p(cols - 6, 10, 1, 1, '#2a6fd6'); p(cols - 4, 10, 1, 1, '#d63c3c');
        for (i = 0; i < 3; i++) p(mid, 6 + i * 3, 1, 1, '#9a98a8');
        break;
      case 'test':
        p(mid - 1, 0, 3, 2, sd); p(mid, 2, 1, 1, sd);
        p(1, 14, 4, 3, sh(c, 0.8)); p(1, 14, 4, 1, sh(c, 1.2)); p(cols - 5, 6, 3, 4, '#ffffff'); p(cols - 5, 8, 3, 1, '#66e0a3'); p(cols - 5, 6, 1, 1, sd);
        p(mid - 3, 0, 1, 8, '#4a4a60'); p(mid + 3, 0, 1, 8, '#4a4a60'); p(mid - 3, 8, 3, 1, '#4a4a60'); p(mid + 1, 8, 3, 1, '#4a4a60'); p(mid - 1, 9, 3, 2, '#c8ccd8'); p(mid - 1, 9, 1, 1, '#ffffff');
        break;
      case 'quick':
        p(mid - 3, 0, 7, 1, sh(c, 0.7)); p(mid - 2, 1, 5, 1, sh(c, 0.82));
        p(mid - 1, 8, 3, 3, '#fff3c8'); p(mid - 2, 9, 5, 1, '#fff3c8'); p(mid, 7, 1, 1, '#fff3c8'); p(mid, 11, 1, 1, '#fff3c8');
        p(1, 15, cols - 2, 1, sh(c, 0.78));
        break;
      case 'docs':
        weave(tx + 2, ty + 4, cols * P - 4, rows * P - 6, sh(c, 0.84), 1.5);
        p(mid - 2, 0, 5, 18, '#f4ead0'); for (i = 0; i < 3; i++) p(mid, 4 + i * 5, 1, 1, '#5a3a1a');
        p(1, 0, cols - 2, 2, '#f2c14e'); p(1, 0, cols - 2, 1, '#ffe08a'); p(mid + 2, 2, 2, 6, '#e0a82e'); p(mid + 2, 5, 2, 1, '#c08a1e');
        break;
    }
    var off = (role === 'review' || role === 'explore' || role === 'think' || role === 'docs' || role === 'test') ? -4 : 0, m2 = mid + off, lc = r.color;
    if (off) { p(m2 - 1, 2, 1, 3, lc); p(m2, 5, 1, 3, lc); p(m2 + 2, 2, 1, 3, lc); p(m2 + 1, 5, 1, 3, lc); }
    else { p(m2 - 2, 0, 1, 4, lc); p(m2 - 1, 4, 1, 4, lc); p(m2 + 2, 0, 1, 4, lc); p(m2 + 1, 4, 1, 4, lc); }
    p(m2 - 1, 8, 3, 4, '#f4f4fa'); p(m2 - 1, 9, 1, 1, sk); p(m2, 9, 2, 1, '#9a98a8'); p(m2, 10, 2, 1, '#cfd3d8'); p(m2 - 1, 11, 3, 1, lc);
    if (f && role !== 'review' && role !== 'docs' && role !== 'test') { p(mid - 1, 0, 1, 1, '#f4f0e8'); p(mid + 1, 0, 1, 1, '#f4f0e8'); }
    p(0, 16, 3, 1, sh(c, 0.68)); p(cols - 4, 17, 3, 1, sh(c, 0.62)); p(2, 10, 2, 1, sh(c, 0.7));
    if (rows >= 23) {
      p(0, 18, cols, 1, '#3a2a1a'); p(mid - 1, 18, 3, 1, '#e0c060'); p(mid, 18, 1, 1, '#fff2b0');
      p(0, 19, cols, rows - 19, '#2d3358'); p(0, 19, 1, rows - 19, '#4a5290'); p(cols - 2, 19, 2, rows - 19, '#232848'); p(mid, 19, 1, 3, '#1c2040');
    }
    return { tx: tx, ty: ty, cols: cols };
  }

  function arms(role, ax, ay, t, Lk) {
    var c = ROLES[role].shirt, f = Lk.g === 'f', cols = f ? 12 : 14, tx = ax - cols * P / 2, ty = ay - 26, p = pg(tx, ty), k = (t >> (role === 'quick' ? 1 : 2)) & 1, i, r;
    var skin = role === 'test' ? '#b9c6ff' : Lk.skin, skd = sh(skin, 0.84), skl = sh(skin, 1.08);
    for (i = 0; i < 2; i++) {
      var left = i === 0, sl = left ? c : sh(c, 0.84), hl = sh(c, 1.22), x0 = left ? -1 : cols - 1, inner = sh(c, left ? 0.8 : 0.68);
      if (role === 'think' && left) {
        p(-1, 2, 2, 9, sl); p(-3, -4, 2, 15, sl); p(-3, 10, 3, 1, sl); p(-3, -4, 1, 14, hl); p(-2, -4, 1, 14, inner); p(-1, 10, 2, 1, sh(c, 0.6));
        p(-3, -6, 2, 2, skin); p(-4, -6, 1, 1, skd); p(-3, -7, 2, 1, skd); p(-3, -6, 1, 1, skl);
        continue;
      }
      for (r = 2; r < 11; r++) { p(x0, r, 2, 1, sl); p(left ? x0 + 1 : x0, r, 1, 1, inner); }
      if (left) p(x0, 2, 1, 9, hl); else p(x0 + 1, 3, 1, 8, sh(c, 0.62));
      p(x0, 2, 2, 1, sh(c, 1.18));
      for (r = 11; r < 20; r++) { var cs = Math.floor((r - 11) * 3 / 9), xx = left ? x0 + cs : x0 - cs; p(xx, r, 2, 1, sl); p(left ? xx + 1 : xx, r, 1, 1, inner); }
      p(x0, 10, 2, 1, sh(c, 0.58)); p(left ? x0 + 1 : x0, 9, 1, 1, sh(c, 0.58));
      var hxc = left ? 2 + (k ? 1 : 0) : cols - 5 - (k ? 1 : 0);
      p(hxc, 19, 2, 1, sh(c, left ? 1.3 : 1.0)); p(hxc, 18, 2, 1, sh(c, 0.7));
      p(hxc, 20, 2, 2, skin); p(left ? hxc + 1 : hxc, 20, 1, 2, skd); p(left ? hxc - 1 : hxc + 2, 20, 1, 1, skin); p(hxc, 22, 2, 1, skd); p(left ? hxc : hxc + 1, 20, 1, 1, skl);
      if (left && Lk.ear) p(hxc, 17, 2, 1, '#2a2a3a');
    }
  }

  function chairBack(ax, ay) {
    R(ax - 17, ay - 7, 5, 3, OL); R(ax - 16.5, ay - 6.5, 4, 2, '#2c3050'); R(ax - 15.5, ay - 4.5, 2, 10, '#2c3050');
    R(ax + 12, ay - 7, 5, 3, OL); R(ax + 12.5, ay - 6.5, 4, 2, '#252a48'); R(ax + 13.5, ay - 4.5, 2, 10, '#252a48');
    poly([[ax - 14, ay - 31], [ax + 14, ay - 31], [ax + 13, ay + 6], [ax - 13, ay + 6]], OL);
    poly([[ax - 13, ay - 30], [ax + 13, ay - 30], [ax + 12, ay + 5], [ax - 12, ay + 5]], '#3d4470');
    poly([[ax + 5, ay - 30], [ax + 13, ay - 30], [ax + 12, ay + 5], [ax + 6, ay + 5]], '#2f3558');
    R(ax - 12, ay - 29, 1.5, 32, '#5560a0');
    L(ax - 9, ay - 27, ax - 9, ay + 2, '#6a74b8', 0.5); L(ax + 9, ay - 27, ax + 9, ay + 2, '#262c4c', 0.5);
    R(ax - 6, ay - 34, 12, 3.5, OL); R(ax - 5.5, ay - 33.5, 11, 2.5, '#4a5290');
  }

  /* ---------- desks, props, screens ---------- */
  function deskDraw(sgx, sgy) {
    box(sgx + 0.1, sgy + 0.9, 0, 0.08, 0.55, 12, '#a8703c');
    box(sgx + 0.2, sgy + 0.92, 0, 1.42, 0.05, 12, '#8a5a30');
    box(sgx + 1.1, sgy + 0.9, 0, 0.62, 0.58, 12, '#c0884e');
    var a = pt(sgx + 1.15, sgy + 1.48, 8), b = pt(sgx + 1.67, sgy + 1.48, 8);
    L(a[0], a[1], b[0], b[1], '#8a5a30');
    var h1 = pt(sgx + 1.35, sgy + 1.48, 6), h2 = pt(sgx + 1.47, sgy + 1.48, 6);
    L(h1[0], h1[1], h2[0], h2[1], '#e8c878');
    box(sgx + 0.05, sgy + 0.85, 12, 1.7, 0.65, 4, '#dcab6a');
  }
  function keyboard(sgx, sgy) {
    box(sgx + 0.45, sgy + 1.0, 16, 0.55, 0.22, 1, '#cfd5ea');
    for (var i = 0; i < 3; i++) { var a = pt(sgx + 0.5, sgy + 1.05 + i * 0.05, 17), b = pt(sgx + 1.5, sgy + 1.05 + i * 0.05, 17); }
  }
  function monitor(sgx, sgy, on, col) {
    var gx = sgx + 1.1, gy = sgy + 0.98;
    box(gx + 0.24, gy + 0.02, 16, 0.14, 0.1, 4, '#2a2d40');
    box(gx, gy, 20, 0.62, 0.07, 17, '#343a5c');
    if (on) {
      poly([pt(gx + 0.22, gy + 0.07, 33), pt(gx + 0.40, gy + 0.07, 33), pt(gx + 0.40, gy + 0.07, 27), pt(gx + 0.22, gy + 0.07, 27)], col);
      poly([pt(gx + 0.26, gy + 0.07, 31), pt(gx + 0.36, gy + 0.07, 31), pt(gx + 0.36, gy + 0.07, 29), pt(gx + 0.26, gy + 0.07, 29)], sh(col, 1.3));
    }
  }
  /* the desk, keyboard and monitor never change, so each is drawn once and stamped per station */
  var CACHE = {}, DOX = 60, DOY = 48;
  function stamp(name, fn, sgx, sgy) {
    if (!CACHE[name]) {
      var c = mk(120 * Z, 104 * Z), sg = g, sx = ORX, sy = ORY;
      g = c.getContext('2d'); ORX = DOX; ORY = DOY; fn(0, 0); g = sg; ORX = sx; ORY = sy; CACHE[name] = c;
    }
    g.drawImage(CACHE[name], Math.round((X(sgx, sgy) - DOX) * Z), Math.round((Y(sgx, sgy, 0) - DOY) * Z));
  }
  function monitorLogo(sgx, sgy, col) {
    var gx = sgx + 1.1, gy = sgy + 0.98;
    poly([pt(gx + 0.22, gy + 0.07, 33), pt(gx + 0.40, gy + 0.07, 33), pt(gx + 0.40, gy + 0.07, 27), pt(gx + 0.22, gy + 0.07, 27)], col);
    poly([pt(gx + 0.26, gy + 0.07, 31), pt(gx + 0.36, gy + 0.07, 31), pt(gx + 0.36, gy + 0.07, 29), pt(gx + 0.26, gy + 0.07, 29)], sh(col, 1.3));
  }
  function mug(gx, gy, c) { box(gx, gy, 16, 0.16, 0.16, 6, c); var p = pt(gx + 0.16, gy + 0.08, 12); R(p[0] + 1, p[1], 2, 3, '#f5f5f5'); }

  function props(role, sgx, sgy, t) {
    var f = t >> 2, p, i;
    switch (role) {
      case 'explore':
        flat(sgx + 0.15, sgy + 1.0, 0.55, 0.4, 16, '#e8d9a8'); flat(sgx + 0.2, sgy + 1.05, 0.45, 0.3, 16.2, '#d8c690');
        p = pt(sgx + 0.45, sgy + 1.2, 17); R(p[0] - 1, p[1] - 1, 3, 1, '#d63c3c'); R(p[0], p[1] - 2, 1, 3, '#d63c3c');
        box(sgx + 1.65, sgy + 0.95, 16, 0.3, 0.25, 4, '#e0b86a'); box(sgx + 1.67, sgy + 0.97, 20, 0.26, 0.2, 3, '#c99a4a');
        p = pt(sgx + 0.62, sgy + 1.1, 24); var bob = [0, 1, 1, 0][f % 4];
        E(p[0], p[1] - 6 + bob, 6, 6, OL); E(p[0], p[1] - 6 + bob, 4, 4, '#7fd6ff'); E(p[0] - 1, p[1] - 8 + bob, 1, 1, '#fff');
        thick(p[0] + 4, p[1] - 2 + bob, p[0] + 9, p[1] + 3 + bob, 3, '#8b5a2b');
        break;
      case 'plan':
        flat(sgx + 0.1, sgy + 1.0, 0.7, 0.45, 16, '#2f56b0');
        for (i = 0; i < 4; i++) { var a = pt(sgx + 0.15 + i * 0.16, sgy + 1.02, 16.2), b = pt(sgx + 0.15 + i * 0.16, sgy + 1.43, 16.2); L(a[0], a[1], b[0], b[1], '#6f95e8'); }
        box(sgx + 1.62, sgy + 0.95, 16, 0.12, 0.5, 6, '#e8f0ff'); box(sgx + 1.62, sgy + 0.95, 16, 0.12, 0.05, 6, '#9fb8e8');
        p = pt(sgx + 0.5, sgy + 1.25, 17); R(p[0] - 5, p[1], 12, 1, '#ffd54f');
        break;
      case 'code':
        mug(sgx + 0.15, sgy + 1.05, '#f5f5f5');
        p = pt(sgx + 0.23, sgy + 1.13, 24); R(p[0] + (f & 1), p[1] - 3 - (f % 3), 1, 2, 'rgba(255,255,255,.6)'); R(p[0] + 2 - (f & 1), p[1] - 7 - (f % 3), 1, 2, 'rgba(255,255,255,.4)');
        box(sgx + 1.62, sgy + 0.98, 16, 0.14, 0.14, 8, '#ff5c93'); box(sgx + 1.62, sgy + 0.98, 24, 0.14, 0.14, 1, '#cfd5ea');
        flat(sgx + 0.55, sgy + 1.3, 0.2, 0.16, 16.2, '#ffe27a');
        break;
      case 'review':
        for (i = 0; i < 4; i++) box(sgx + 0.12 + (i & 1) * 0.02, sgy + 1.0, 16 + i * 1.5, 0.45, 0.35, 1.5, i % 2 ? '#f1eee4' : '#ffffff');
        p = pt(sgx + 0.55, sgy + 1.3, 23); R(p[0] - 4, p[1], 3, 1, '#d63c3c'); R(p[0] - 2, p[1] + 1, 3, 1, '#d63c3c');
        thick(pt(sgx + 0.6, sgy + 1.35, 17)[0], pt(sgx + 0.6, sgy + 1.35, 17)[1], pt(sgx + 0.85, sgy + 1.2, 17)[0], pt(sgx + 0.85, sgy + 1.2, 17)[1], 2, '#d63c3c');
        box(sgx + 1.65, sgy + 0.98, 16, 0.2, 0.2, 5, '#2a6fd6');
        break;
      case 'think':
        box(sgx + 0.12, sgy + 1.0, 16, 0.5, 0.35, 3, '#7c6cff'); box(sgx + 0.15, sgy + 1.02, 19, 0.45, 0.32, 3, '#ffb454'); box(sgx + 0.18, sgy + 1.04, 22, 0.4, 0.28, 3, '#4fc3a0');
        box(sgx + 1.62, sgy + 0.98, 16, 0.2, 0.2, 2, '#4a4a60'); p = pt(sgx + 1.72, sgy + 1.08, 18);
        E(p[0], p[1] - 5, 5, 5, (f & 3) < 3 ? 'rgba(255,226,122,.9)' : 'rgba(154,152,168,.6)'); E(p[0], p[1] - 5, 3, 3, (f & 3) < 3 ? '#fff6c0' : '#c8c8d8');
        break;
      case 'test':
        box(sgx + 0.12, sgy + 1.0, 16, 0.5, 0.3, 2, '#4a4a60');
        for (i = 0; i < 3; i++) { p = pt(sgx + 0.18 + i * 0.14, sgy + 1.12, 18); R(p[0] - 1, p[1] - 6, 3, 7, OL); R(p[0], p[1] - 5, 1, 6, i === 1 ? '#ff7a7a' : '#8ff0b8'); }
        p = pt(sgx + 1.65, sgy + 1.1, 16);
        R(p[0] - 4, p[1] - 10, 9, 11, OL); R(p[0] - 3, p[1] - 9, 7, 9, 'rgba(204,238,255,.55)'); R(p[0] - 3, p[1] - 5, 7, 5, '#5cff9a'); R(p[0] - 2, p[1] - 5, 2, 1, '#c8ffe0');
        R(p[0] - 1 + (f & 1), p[1] - 7 - (f % 3), 1, 1, '#c8ffe0'); R(p[0] + 2 - (f & 1), p[1] - 9 - (f % 2), 1, 1, '#c8ffe0');
        break;
      case 'quick':
        flat(sgx + 0.15, sgy + 1.05, 0.18, 0.18, 16.2, '#ffe27a'); flat(sgx + 0.38, sgy + 1.15, 0.18, 0.18, 16.2, '#ff9acb'); flat(sgx + 0.2, sgy + 1.3, 0.18, 0.18, 16.2, '#9be8ff');
        mug(sgx + 1.62, sgy + 1.0, '#ff8a2a');
        var px = ((t * 2) % 120) - 20 + pt(sgx, sgy, 0)[0] - 4, py = pt(sgx, sgy, 0)[1] + 4 - ((t >> 2) % 3);
        poly([[px, py], [px + 10, py + 3], [px + 2, py + 5]], '#ffffff'); poly([[px + 2, py + 5], [px + 10, py + 3], [px + 5, py + 7]], '#c8c8e0'); L(px, py, px + 10, py + 3, '#8888b0');
        break;
      case 'docs':
        flat(sgx + 0.08, sgy + 1.0, 0.38, 0.5, 16, '#ffffff'); flat(sgx + 0.46, sgy + 1.0, 0.38, 0.5, 16, '#f1ead0');
        a = pt(sgx + 0.46, sgy + 1.0, 16); b = pt(sgx + 0.46, sgy + 1.5, 16); L(a[0], a[1], b[0], b[1], '#9a8b60');
        for (i = 0; i < 3; i++) { a = pt(sgx + 0.12, sgy + 1.1 + i * 0.1, 16.2); b = pt(sgx + 0.4, sgy + 1.1 + i * 0.1, 16.2); L(a[0], a[1], b[0], b[1], '#9a98a8'); }
        box(sgx + 1.62, sgy + 0.98, 16, 0.18, 0.18, 7, '#8a5a3a'); p = pt(sgx + 1.71, sgy + 1.07, 23);
        thick(p[0], p[1], p[0] + 3, p[1] - 11, 2, '#ffffff'); thick(p[0] + 3, p[1] - 11, p[0] + 5, p[1] - 14, 2, '#e8e0c8');
        break;
    }
  }

  function nameTag(sgx, sgy, text, color) {
    var p = pt(sgx + 0.5, sgy + 1.5, 0), w = TW(text, 1) + 6;
    R(p[0] - (w >> 1), p[1] + 3, w, 9, OL); R(p[0] - (w >> 1) + 1, p[1] + 4, w - 2, 7, '#2b2750'); T(text, p[0] - (w >> 1) + 3, p[1] + 5, color, 1);
  }

  function station(sgx, sgy, t, slot, w) {
    var wx = sgx + 0.62, wy = sgy + 0.42, ax = Math.round(X(wx, wy) * 2) / 2, ay = Math.round(Y(wx, wy, 14) * 2) / 2;
    var role = w && w.role, age = w ? t - w.born : 99, hide = w && age < 6 && age % 2 === 0, bob = ((t >> 3) & 1) ? 0.5 : 0;
    chairBack(ax, w ? ay : ay + 28);
    if (w && !hide) { torso(role, ax, ay, w.look); drawHead(ax, ay + bob, t, role, w.look); }
    stamp('desk', function (a, b) { deskDraw(a, b); keyboard(a, b); }, sgx, sgy);
    if (w && !hide) arms(role, ax, ay, t, w.look);
    stamp('mon', function (a, b) { monitor(a, b, false, '#000'); }, sgx, sgy);
    if (w) { monitorLogo(sgx, sgy, ROLES[role].color); props(role, sgx, sgy, t); }
    if (w && age < 6) {
      for (var k = 0; k < 5; k++) { var a2 = k * 1.26 + age; R(ax + Math.cos(a2) * (age + 2) * 3, ay - 20 + Math.sin(a2) * (age + 2) * 3, 3, 3, '#ffffff'); }
    }
  }

  function mk(w, h) { return new Pix(w, h); }
  var SKY = ['#1e2a78', '#323a95', '#5a45a8', '#8d52a8', '#c15c9b', '#e8785f', '#f6a05c', '#ffd08a'];
  /** The colours of the picture on the wall, by role: a background and two accents. */
  var POSTER = {
    explore: ['#e8d9a8', '#d63c3c', '#c99a4a'], plan: ['#2f56b0', '#ffffff', '#6f95e8'], code: ['#1b1a2e', '#ff6fa5', '#5fd7ff'],
    review: ['#f1eee4', '#e24b4b', '#2fb36b'], think: ['#0f0f26', '#ffe27a', '#7c6cff'], test: ['#0c1d14', '#5cff9a', '#ff5c5c'],
    quick: ['#2a1a10', '#ffe27a', '#ff9acb'], docs: ['#f6f1dc', '#6b6554', '#c0392b']
  };
  function mix(c1, c2, t) {
    var a = parseInt(c1.slice(1), 16), b = parseInt(c2.slice(1), 16), out = 0;
    for (var sft = 16; sft >= 0; sft -= 8) out |= Math.round(((a >> sft) & 255) * (1 - t) + ((b >> sft) & 255) * t) << sft;
    return '#' + ('000000' + out.toString(16)).slice(-6);
  }
  /** A window with a sunset and a skyline, on either wall (`wf` is wallR or wallL). */
  function windowOn(wf, a, b, z0, z1, seed) {
    var dz = (z1 - z0) / SKY.length, k;
    wf(a - 0.06, b + 0.06, z0 - 3, z1 + 3, '#2b2550');
    for (k = 0; k < SKY.length; k++) wf(a, b, z0 + k * dz, z0 + (k + 1) * dz + 0.6, SKY[k]);
    for (k = 0; k < 6; k++) {
      var bh = 4 + Math.floor(rnd(seed * 31 + k) * 10), ba = a + k * (b - a) / 6;
      wf(ba, ba + (b - a) / 6 - 0.03, z0, z0 + bh, '#1c1840');
      if (rnd(k + seed * 5) > 0.4) wf(ba + 0.05, ba + 0.1, z0 + bh - 4, z0 + bh - 2.5, '#ffd666');
    }
    wf((a + b) / 2 - 0.03, (a + b) / 2 + 0.03, z0, z1, '#2b2550'); wf(a - 0.06, b + 0.06, z0 - 3, z0 - 1, '#8a80c0');
  }
  /** A framed picture on either wall, in the role's colours. */
  function frameOn(wf, a, b, z0, z1, role) {
    var c = POSTER[role], w = b - a, h = z1 - z0, k;
    wf(a - 0.04, b + 0.04, z0 - 2, z1 + 2, '#2b2550'); wf(a, b, z0, z1, c[0]);
    for (k = 0; k < 3; k++) wf(a + w * 0.12, a + w * (0.45 + 0.15 * (k % 2)), z0 + h * (0.2 + k * 0.25), z0 + h * (0.3 + k * 0.25), c[1 + (k & 1)]);
    wf(a + w * 0.62, a + w * 0.88, z0 + h * 0.2, z0 + h * 0.8, c[2]);
  }
  /** The room behind a worker: floor, two walls with skirting, a window or two, and a picture. */
  function room(role, seed) {
    var N = 8, M = 7, gx, gy, q, color = ROLES[role].color;
    for (gx = 0; gx < N; gx++) for (gy = 0; gy < M; gy++) {
      q = [pt(gx, gy, 0), pt(gx + 1, gy, 0), pt(gx + 1, gy + 1, 0), pt(gx, gy + 1, 0)];
      poly(q, sh(((gx + gy) & 1) ? '#aab1cd' : '#9ea6c4', 0.97 + rnd(gx * 7 + gy * 3 + seed) * 0.06));
      L(q[0][0], q[0][1], q[1][0], q[1][1], 'rgba(0,0,0,.08)', 0.5); L(q[0][0], q[0][1], q[3][0], q[3][1], 'rgba(0,0,0,.08)', 0.5);
    }
    var wall = mix('#645ba0', color, 0.14), wain = mix('#4a4280', color, 0.14), dark = mix('#4f4789', color, 0.14), dwain = mix('#3c3570', color, 0.14);
    wallR(0, N, 0, 84, wall); wallR(0, N, 0, 22, wain); wallR(0, N, 22, 24.5, '#9a90d0'); wallR(0, N, 0, 3, '#2f2a58');
    wallL(0, M, 0, 84, dark); wallL(0, M, 0, 22, dwain); wallL(0, M, 22, 24.5, '#7a70b8'); wallL(0, M, 0, 3, '#2f2a58');
    if (seed % 2) { windowOn(wallR, 1.0, 2.2, 26, 60, seed); windowOn(wallR, 2.7, 3.9, 26, 60, seed + 1); }
    else windowOn(wallR, 1.3, 3.1, 26, 60, seed);
    frameOn(wallL, 0.8, 2.0, 30, 56, role);
  }

  /**
   * One agent at their desk, as a square picture: the office around them (floor, walls, a window and a picture
   * on the wall), a rug in the role's colour, the desk and the worker, with the role's name plate. A still:
   * no speech bubble, no animation frame.
   */
  function portrait(w) {
    var SIZE = 136, cv = mk(SIZE * Z, SIZE * Z), color = ROLES[w.role].color;
    g = cv.getContext('2d'); ORX = 53; ORY = 44;
    R(0, 0, SIZE, SIZE, '#241f3f');
    room(w.role, w.seed || 0);
    flat(0.95, 0.35, 1.95, 1.95, 0.4, 'rgba(0,0,0,.22)');
    flat(0.95, 0.35, 1.95, 1.95, 0.5, sh(color, 0.45)); flat(1.05, 0.45, 1.75, 1.75, 0.6, sh(color, 0.58));
    station(1.0, 0.3, 100, 0, { role: w.role, look: w.look, born: -99 });
    nameTag(1.0, 0.3, ROLES[w.role].name, color);
    return { width: cv.w, height: cv.h, rgba: cv.data };
  }

  /** A deterministic look for a given agent: same seed, same person. */
  function lookFor(role, seed) { return makeLook(role, rnd(seed * 3.7) < 0.5 ? 'm' : 'f', seeded(seed)); }
  return { portrait: portrait, lookFor: lookFor, roles: ROLES };
}
