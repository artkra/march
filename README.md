# March

A VS Code extension: sketch an architecture on a canvas -- drag typed shapes,
hand-drawable too (backend: entity/endpoint/interface/database/queue/
implementation/input/output/external; frontend: component/page/store/
api_client) -- and generate real, runnable code from it via your own coding
agent CLI (Claude Code by default, but any CLI-based agent works -- see
`march.agentBin`) in an interactive terminal session you watch and approve,
independently per module, in whatever language/framework that module
targets. Or have it reverse-engineer a starting set of diagrams from your
whole existing workspace.

Runs as an extension, not a server: the webview is a real browser context
(tldraw and all the canvas logic run unmodified), and the extension host is
just your own OS process -- so your agent CLI runs with your actual shell and
your actual login, no container to authenticate into.

## Prerequisites

- VS Code 1.93+ (needed for the Terminal Shell Integration API Autodiscover
  relies on -- see "How code generation runs" below)
- Node.js 20+ and npm, to build it
- A CLI-based coding agent installed and logged in -- the
  [Claude Code CLI](https://docs.claude.com/en/docs/claude-code) by default
  (`claude --version` should work in your regular terminal), or any other
  agent CLI pointed at via `march.agentBin`. March just shells out to it
  with your inherited environment.

## Checking it out locally (development)

```bash
git clone <this repo>
cd march
npm install
npm run build   # spec-schema -> webview bundle -> extension host
code .
```

Make sure the **repo root** (`march`, not a subfolder) is the folder open in
that window -- `.vscode/launch.json` is checked in and defines a "Run March
Extension" configuration scoped to `${workspaceFolder}`, which only resolves
correctly from the root.

Then press **F5** (or Run > Start Debugging; it auto-builds first via the
checked-in task). This launches a second VS Code window -- the "Extension
Development Host" -- with March loaded. In that new window, open the folder
you want to sketch architecture for, then run the command **March: Open**
(Cmd/Ctrl+Shift+P, type "March").

If F5 tries to debug whatever file you had open instead, open the Run and
Debug panel (Cmd/Ctrl+Shift+D), pick **Run March Extension** from the
dropdown at the top, then press the green play button (or F5 again) -- this
happens if VS Code hasn't picked up `.vscode/launch.json` as the active
config yet, e.g. right after cloning.

Changes to `apps/extension/src/**` need `npm run build` (or
`npm run watch --workspace=apps/extension` in a separate terminal) + reload
the dev host window (Cmd/Ctrl+R inside it). Changes to `apps/web/src/**`
(the canvas UI) need `npm run build --workspace=apps/web` + reload the panel
(close and reopen it, or reload the whole dev host window).

### Packaging a `.vsix` (install without publishing)

```bash
npm run package   # builds everything, then runs vsce package in apps/extension
```

This produces `apps/extension/march-<version>.vsix`. Install it into any VS
Code (yours or someone else's) without going through the Marketplace:

```bash
code --install-extension apps/extension/march-0.1.0.vsix
```

or via the UI: Extensions panel -> `...` menu -> "Install from VSIX...".

## How it works

1. Open a folder in VS Code, run **March: Open** from the command palette.
   All of a workspace's March data lives under `.march/` in that folder's
   root (see below) -- there's no separate login or profile, the workspace
   *is* the project.
2. The left nav panel is a tree: **Root** at the top is the project's own
   root canvas, with every module nested under it -- click Root to see every
   module as a node on one canvas, draw (freely labeled) arrows between them
   to describe how modules relate, and double-click a module node to open
   it.
3. **+ New module** picks a **kind** (backend or frontend -- this decides
   both the node vocabulary the canvas offers and the language/framework
   list below), a name, description, and language. There's no per-module
   discovery -- use **Autodiscover** (below) to populate modules from an
   existing codebase. Hover a module in the nav tree for a **×** to delete
   it -- this only removes its March data (`.march/modules/<slug>/`) and its
   node on the Root canvas; it never touches whatever code was already
   generated at its `codePath`.
4. Each module has its own canvas. Drag a node type from the palette, or
   hand-draw a shape with the draw tool (key `D`) -- see the shape table
   below -- and it's swapped for a typed node automatically; the draw tool
   stays active so you can keep sketching. Click a node to edit it (including
   a free-text comment) in the inspector panel.
5. Draw an arrow between *any* two nodes to connect them -- click the arrow
   to pick a relationship type (or type a custom one) in the inspector; it's
   stored as the arrow's own visible label.
6. Two whole-project actions live under the project name at the top of the
   nav panel, available from anywhere (not just Root) -- see "How code
   generation runs" below for what each one actually does:
   - **Generate code** opens one interactive agent terminal per module for
     you to watch and approve, each in its own code folder
     (`.march/modules/<slug>/module.json`'s `codePath`, a top-level folder
     named after the module by default).
   - **Autodiscover** prompts your agent to explore the whole open workspace,
     infer its module boundaries and architecture, and write back a full set
     of March diagrams for it (one canvas per discovered module, wired into
     the Root canvas via inferred cross-module relationships) -- a fast way
     to get an existing, undocumented codebase onto a canvas instead of
     drawing it by hand. Backend-only for now -- see the note in
     `packages/spec-schema/src/schema.ts` on `ProjectDiscovery`.

### `.march/` -- where your data actually lives

No database, no server -- plain JSON files in your own workspace, so it's
git-diffable and reviewable in PRs like anything else:

```
.march/
  project.json            { name, description }
  root-diagram.json       the Root canvas: tldraw snapshot + module graph
  modules/<slug>/
    module.json              name, description, kind, language, codePath
    diagram.json              tldraw snapshot + the module's spec (nodes/edges)
  jobs/<run-id>-*.txt     prompt files handed to the agent, for audit
  jobs/<run-id>-*.json    autodiscovery's raw output, deleted once ingested
```

A module's identity is its folder name under `modules/`.

### Node/edge vocabulary

Backend modules (drag from the palette, or hand-draw -- see the shape table
below):

| Node type        | Meaning                                      |
|-------------------|-----------------------------------------------|
| `entity`          | Data model / database table                   |
| `endpoint`        | API operation: method + path                   |
| `interface`       | Abstract contract -- a named set of methods (name/params/return type), UML-interface style |
| `database`        | A storage system (postgres/mysql/sqlite/mongodb/redis/dynamodb) |
| `queue`           | A message broker (redis/rabbitmq/kafka)        |
| `implementation`  | Implementation notes -- folds into the connected endpoint's behavior on generation |
| `input`           | Standalone request-shape node -- feeds a connected endpoint's request |
| `output`          | Standalone response-shape node -- feeds a connected endpoint's response |
| `external`        | Third-party dependency stub (Stripe, S3, ...)  |

Frontend modules (palette, or hand-draw -- see the shape table below):

| Node type    | Meaning                                                |
|--------------|---------------------------------------------------------|
| `component`  | A reusable UI component -- `props` describe its inputs   |
| `page`       | A routed view -- has a route `path`                       |
| `store`      | Client-side state -- `fields` describe its shape          |
| `api_client` | A call boundary out to a backend -- optional `baseUrl` + notes |

Every node also has a free-text **comment**. Any node may connect to any
other -- there's no source/target-type restriction. An arrow's own visible
text label *is* the relationship: pick one of the curated types (association,
depends on, implements, extends, has one, has many, stored in, provides
input, provides output) from the inspector's dropdown, or just type your own
custom label directly.

The shape classifier itself is generic path geometry (corner count, winding
angle, self-intersection, tolerant of hand tremor) with no notion of node
types -- it recognizes nine gestures, and each module kind maps a subset of
them onto its own node vocabulary:

| Shape | Gesture | Backend node type | Frontend node type |
|---|---|---|---|
| ▭ rectangle | a box, 4 square corners | `entity` | `component` |
| ◻ square | a box about as tall as it is wide | `implementation` | `page` |
| ○ circle | a round loop | `database` | `store` |
| △ triangle | 3 corners | `external` | `api_client` |
| ◇ diamond | a box rotated 45° | `interface` | -- |
| 🌀 swirl | a spiral, wind around 1.5+ times | `queue` | -- |
| V | down then up, one open stroke, point facing down | `input` | -- |
| Λ | up then down, one open stroke, point facing up | `output` | -- |
| e | an open loop, almost a full circle but not closed | `endpoint` | -- |

### Languages

Chosen per module, from the list its **kind** determines:

- Backend -- framework/ORM choice within the language is left to the agent:
  TypeScript/Node.js, Python, Rust, Go, Java, C#/.NET, Ruby, PHP.
- Frontend: React, Vue, Svelte, Angular, SolidJS.

### Theming

No theme of its own, no toggle -- March binds directly to the `--vscode-*`
CSS custom properties every webview gets for free, so it always matches
whatever your actual VS Code color theme is, live, including the canvas
(tldraw's own color variables are overridden to point at the same ones).

### Choosing an agent

An **Agent** picker sits under the project name in the nav panel (below
Generate code / Autodiscover) -- Claude Code, Aider, and Codex CLI are
listed by default, or pick "Custom binary..." to type any exact bin name or
path. This writes straight to the `march.agentBin` setting below, so it's
just a more discoverable front end for it; either way works.

### Settings

- `march.agentBin` (default `"claude"`) -- path to your coding agent's CLI
  binary. Any CLI-based agent that opens into an interactive chat when run
  with no arguments works, not just Claude Code. If March can't run it,
  it'll ask you to locate it via a file picker and save the result here
  itself. Behind the scenes this check goes through your login shell
  (`$SHELL -ilc`), not a direct spawn -- VS Code is normally launched from a
  GUI/dock rather than a terminal, so it doesn't otherwise inherit PATH
  entries added by `.zshrc`/`.bashrc`/nvm/asdf/etc, and a direct spawn could
  report a real, working CLI as "missing".
- `march.agentArgs` (default `["-p", "--dangerously-skip-permissions",
  "--output-format", "text", "--verbose"]`) -- flags for Autodiscover's
  one-shot non-interactive run only (see below); change these if
  `march.agentBin` points at a different agent with different flags for
  that kind of run.

### How code generation runs

**Generate code** opens a real, visible VS Code terminal per module and runs
your agent there fully interactively -- for Claude Code, that means no `-p`,
no `--dangerously-skip-permissions`. Its own permission prompts (if it has
them) work normally, and you watch/approve/intervene exactly as if you'd
typed it yourself; the module's spec is written to a prompt file under
`.march/jobs/` and March just tells the agent (in one line) to go read it,
rather than trying to paste the whole multi-paragraph prompt into the
terminal. Because this is an open-ended interactive session, March has no
way to know when you're "done" with it -- there's no completion status to
report back, it's purely a hand-off.

**Autodiscover** is different: it's read-only analysis that produces one
JSON file March needs to parse and act on (creating modules from it), so it
still needs a deterministic "it's finished, here's the exit code" signal.
It runs non-interactively (`march.agentArgs`, defaulting to Claude Code's
`-p --dangerously-skip-permissions`) but inside a *visible* terminal rather
than a hidden background process, using VS Code's [Terminal Shell
Integration API](https://code.visualstudio.com/docs/terminal/shell-integration)
to detect completion -- this needs a POSIX-ish shell (bash/zsh/fish/pwsh);
it won't activate for cmd.exe, and if it doesn't activate in time March
tells you rather than silently guessing at success.

Same trust model either way as running the agent yourself in a terminal,
because that's what's actually happening -- generation just additionally
gets the agent's own interactive safety net back (for agents that have one),
since headless mode is what required skipping permissions in the first
place.

### What Generate's prompt actually asks for

Beyond the module's own spec, every generation prompt includes:

- The **project's** own name and description -- the free-text "General
  project comments/notes" field on the Root canvas -- so cross-cutting
  instructions that don't belong to any one module (e.g. "package
  everything with Docker Compose", "this is a pnpm monorepo") live there
  once instead of needing to be repeated on every module's own diagram.
  Without an instruction there, packaging is left to the agent's judgment
  rather than assumed.
- A small nudge to **fix small gaps**: if a module's spec is missing
  something minor it needs to actually work (an implied field, a missing
  edge, a small node), the agent is told to make the smallest reasonable
  *addition* -- and asked to prefer adding something new over changing a
  node/edge that's already drawn, since only additions round-trip cleanly.
  It reflects whatever it added by updating that module's own
  `diagram.json` (`specJson` only, `tldrawSnapshot` untouched) directly, and
  the next time that module's canvas is opened, anything it added that
  isn't already on screen gets pulled in automatically (see
  `CanvasEditor.tsx`'s reconciliation against `importSpec`, which skips
  anything that already has a shape and only creates what's missing).
- An instruction to create or refresh a short **README.md at the workspace
  root** (not the module's own generated repo, which gets its own README
  too) summarizing the whole project, additively across runs -- each
  module's generation is told to only touch the section relevant to it.

## Development (monorepo layout)

```
packages/spec-schema/   IR types + Zod schemas + the webview<->host RPC protocol
apps/web/                the webview's React app (canvas, shape classifier, etc.)
apps/extension/           the VS Code extension (host logic + packaging)
```

`npm run build` / `npm run typecheck` at the root run all three in order.
`apps/web` is not independently runnable (`acquireVsCodeApi()` only exists
inside a real webview) -- always test via the Extension Development Host.

## Roadmap / explicitly cut

- Self-hosting tldraw's icon/font/translation assets instead of fetching them
  from `cdn.tldraw.com` at runtime (the webview CSP currently allowlists that
  origin so the canvas loads at all -- tldraw 2.4.6 doesn't bundle these
  locally). Only external network dependency in the whole extension.
- `resolvedBehavior` write-back (round-tripping the agent's implementation
  decisions back into the diagram)
- Renaming modules from the UI (delete + recreate for now)
- Frontend-aware Autodiscover (it only infers backend architecture today)
- Multi-root workspace support (uses the first workspace folder only)
- Repo round-trip editing (regenerating into a directory that already has
  agent-written code, reconciling diffs)
