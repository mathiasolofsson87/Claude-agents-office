# Agent Office

A pixel-art office in a pane next to your Claude Code chat. Every running subagent gets its own square portrait, at its desk, with a line underneath saying what it is doing right now, like `reading login.ts` or `running tests`.

![Four of the characters](.claude-plugin/icon.png)

## Install

In a Claude Code session, type:

```
/plugin install agent-office --marketplace mathiasolofsson87/Claude-agents-office
```

Answer `y` to add the marketplace, then pick a scope. The plugin is active straight away.

## Use

Type `/office` to open the pane, or just start a subagent: the pane opens by itself the first time.

| Command | What it does |
| --- | --- |
| `/office` | Opens the pane. |
| `/office demo` | Staffs the office with demo agents (`/office demo 12` for twelve, up to 16), so you can see it without real subagents. |
| `/office clear` | Sends every subagent home, waving. |
| `/office auto` | The default: portraits where the terminal can draw them, a text list everywhere else. |
| `/office image` | Always portraits, even if this terminal cannot draw them (you would then see only a placeholder). |
| `/office text` | Always the text list, the lightest option. |
| `/office aspect` | Shows the cell aspect in use and how it was found. `/office aspect 2.3` sets it by hand for this session; `/office aspect auto` goes back to measuring. |
| `/office info` | What the plugin sees: which terminal, whether it can draw pictures, and the pane's size. Useful when something looks wrong. |
| `/office stats` | How many pictures were drawn and how often the pane redrew. |

Close the pane with its close mark; closing it stops all of the plugin's work.

## What you see

When a subagent starts, a new tile appears: its portrait, its role, and its current task. The portrait shows the agent at their desk in a small office, with a window and a picture on the wall in the role's colours. Tiles sit two across and the grid grows downward as agents are added. One agent shows as one tile. When an agent finishes, it waves goodbye for a few seconds, its tile says `done`, and then the tile goes and the grid closes up. The wave is two small pictures swapped in place about three times a second, only while someone is leaving. Up to 16 tiles are drawn (the main agent's included); beyond that the pane says how many more are working.

The main agent, the one you are talking to, always has the first tile, with a headset and a navy blazer. It shows what it is doing like any other agent (`thinking`, `reading login.ts`, `delegating`). When it finishes and is waiting for you, it falls asleep with a few Z's over its head and says `waiting for you`. When it needs an answer from you, a question mark appears over its head: for a question it asks you, a plan to approve, or a permission dialog (`waiting for your OK`). The label clears as soon as the call finishes, which is right after you answer.

Each subagent becomes a character, chosen from its subagent type and description:

| Character | Subagents |
| --- | --- |
| Explorer, with a fedora | Explore, or anything about finding, searching and researching |
| Planner, with a hard hat | Plan, or anything about design and architecture |
| Coder, with headphones | general-purpose and everything else |
| Reviewer, with glasses | code review, simplify, security, audit |
| Thinker, in a lab coat | deep-thinker |
| Tester, with goggles | anything about tests or verification |
| Runner, with a cap | quick-helper |
| Writer, with a beret | docs, README, guides |

Each new agent is randomly a man or a woman with their own hair, beard, glasses and skin tone, and the same agent always keeps the same face.

The task line comes from what the agent's tool calls are doing: reading and editing files by name, running tests or builds, searching the code, researching the web. Where pictures cannot be drawn, or the pane is too narrow for tiles, the same information appears as a list.

Each portrait is drawn once, when the agent arrives. After that only the task text changes, which keeps the pane light on the terminal.

## Requirements

- A Claude Code build with plugin hooks and panes. A pane that opens by itself needs a wide terminal (it docks from 110 columns in fullscreen); `/office` tells you if there is no room.
- For the picture: kitty, Ghostty or iTerm2 3.5 or later, in Claude Code's fullscreen mode and not inside tmux. In any other terminal the plugin shows the text list.
- This is an early release. It has been tried in one terminal setup only. If the picture looks stretched, set `cellAspect` (below).

## How the pictures fit your terminal

A terminal cell is taller than it is wide, and by how much depends on your font and line spacing. To fill each portrait's box exactly, the plugin tries to ask the terminal how big it is in pixels: once, and again if its size in cells changes (a new font size does that). It does this by running a one-line `perl` command that reads the terminal's window size, the same call `stty` makes. The command only reads; it changes nothing. Turn it off with `autoAspect`.

Some builds of Claude Code cannot run commands from a plugin, and some terminals do not report their pixel size. In either case the `cellAspect` setting is used. Each tile is also drawn on a dark card in the portrait's own colour, so a small mismatch shows up as a little extra card around the picture, not a black bar. `/office info` says what was measured, or why not, and `/office aspect 2.4` tries another value on the spot.

## Settings

Change these in the plugin's `/config` menu:

| Setting | Default | Meaning |
| --- | --- | --- |
| `autoOpen` | on | Open the pane the first time a subagent starts. |
| `autoAspect` | on | Measure the terminal's cell size so the pictures fit exactly, whatever your font. See below. |
| `cellAspect` | 2.2 | Used when measuring is off or fails: how many times taller a character cell is than it is wide (1 to 4). |
| `detail` | auto | `auto` and `high` draw sharp portraits, `normal` draws smaller, lighter ones. |
| `display` | auto | `auto`, `image` or `text`. `auto` picks portraits only where the terminal can draw them. |

## Development

```
claude --plugin-dir .                 # run the plugin from this folder
claude plugin test .                  # the tests
claude plugin validate .              # the manifest and the hooks module
node tools/demo.ts out/               # a contact sheet of every character (Node 22 or later)
node tools/fingerprint-portraits.ts   # a hash of every portrait, to check a renderer change left each pixel alone
node tools/icon.ts                    # redraw the icon
```

How it fits together:

- `hooks/lib/render.ts` is a software renderer. It draws an isometric desk scene into a plain RGBA pixel buffer, with no browser canvas. It started life as an HTML mockup and still carries `// @ts-nocheck`.
- `hooks/lib/png.ts` is a small PNG encoder for flat pixel art, so a portrait is about 20 KB.
- `hooks/lib/office.ts` holds the state: who is in the office, role mapping and tool-call descriptions.
- `hooks/register.tsx` connects it to Claude Code: subagent start and end, tool calls, the pane and the `/office` command.

## License

MIT. See `LICENSE`.
