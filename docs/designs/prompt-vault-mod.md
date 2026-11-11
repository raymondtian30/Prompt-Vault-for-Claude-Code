# Prompt Vault Mod (`prompt-vault-mod`)

*   **Author:** Raymond Tian
*   **Status:** Draft
*   **Date:** 2026-11-10

--------------------------------------------------------------------------------


> **Revision after approval (2026-11-10), at the author's request.** Four changes supersede the matching parts of this design:
> 1. **Projects replace the five fixed categories.** A project is a free-form name (create, rename, delete, move a prompt, add into one); it never picks an AI. Run no longer asks for confirmation by category. A prompt may have no project. The file field is `- Project:`; legacy `- Category:` lines are read as projects, and untouched entries are never rewritten. Empty projects are listed on a header `Projects:` line. Deleting a project unfiles its prompts.
> 2. **IDs are reused.** A new prompt takes the lowest unused ID; the counter line and the "never reused" rule are gone.
> 3. **The launcher band hides while the pane is open.**
> 4. **`/vault update`** checks the latest GitHub release and installs it on request; the mod is installed at user scope so the global vault is available in every repo.
> The sections below describe the original design and are kept for history; where they say "category", read "project".

## Overview

Prompt Vault is a Claude Code skill that stores prompts in one markdown file, `~/.claude/prompt-vault/prompts.md`. This design adds a Claude Code mod, `prompt-vault-mod`, in `mod/` of the same repository. A mod is a hooks module that Claude Code loads and lets draw UI, register a slash command and submit prompts. It is not a VS Code extension and not a command-hook plugin.

The mod gives the vault a Prompt Vault button, a menu to browse, search, filter and pick prompts, an Execute button that submits a prompt to Claude Code, a Help view generated from one operation registry, and, in later slices, add, edit, delete and Done. The skill, `install.sh` and `uninstall.sh` stay as a backup and keep working. Both read and write the same `prompts.md`.

Scope and ordering come from `docs/designs/prompt-vault-mod-brief.md` (seven-lens review, 2026-11-10) and the user's decisions recorded there.

## The Problem

Today a saved prompt can only be used by asking Claude to print it and then copying it by hand. There is no browsing UI, no way to run a prompt from the vault, and no built-in help. The user wants Prompt Vault to feel like part of Claude Code: open Claude Code, click Prompt Vault, pick a prompt, run it, with Help inside.

Three facts shape the solution, all checked against this machine's API docs (`claude-code.d.ts` and `reference.md`, version 2.1.322) and files:

*   `$.prompt.submit({ text, asUser })` is a supported call that submits through the same path as a typed prompt and returns `{ text }` or `{ drop }`. A plugin's submit waits for the session to be idle and resolves when its own turn starts. It cannot be cancelled once queued.
*   The band above the prompt box, which can hold a clickable button, is raised on terminal and desktop only. The pane is raised on every surface. There is no toolbar slot.
*   The user's VS Code extension is 2.1.318, the CLI is 2.1.308, the docs are 2.1.322. Nothing yet shows that the VS Code build loads mods or draws any UI.

The solution is a staged build that starts with a spike to find out what the VS Code build draws, then builds one surface-independent core with thin UI hosts on top.

## Goals

*   A `mod/` plugin that Claude Code loads, with its own name (`prompt-vault-mod`), a `/vault` slash command and a Prompt Vault launcher button on every surface that can draw one.
*   Clicking the launcher opens a menu of saved prompts with search, category filter and done/pending filter. Picking a prompt opens its detail view.
*   Execute submits the complete saved prompt to Claude Code and shows "accepted" only after `$.prompt.submit` resolves `{ text }`. Formatting, code blocks, tabs, unicode and length up to the limits below are preserved. The saved entry is never modified by Execute.
*   Execute is blocked while a turn runs or another Execute is in flight, shows its run state, handles refusal and failure with a reason, and asks for confirmation on ChatGPT, Research and Other prompts.
*   A Help view, also reachable as `/vault help`, that lists every operation with syntax, description, examples, keyboard shortcuts, settings, FAQ and troubleshooting, searchable, generated from one registry. A test fails if the registry and the skill's command list drift.
*   By the end of v1.1.0 the mod mirrors every skill command: overview, add, done, edit, search, delete, next, send, list, categories.
*   A fence rule for `prompts.md` that cannot truncate a prompt, adopted by `SKILL.md`, the template and the parser.
*   Automated tests for the pure logic in CI, mod-level tests through `claude plugin test` once proven runnable headless, and a manual VS Code acceptance checklist.
*   README with install, uninstall, activation, configuration, tested versions and known limitations, each feature marked implemented, partial or unsupported. CHANGELOG entry. Release v1.1.0 pushed to GitHub as a new release.

## Non-Goals

*   A VS Code extension, a webview, clipboard paste or keystroke injection.
*   Queuing an Execute behind a running turn.
*   Cooldown timers, per-prompt locks, markers added to prompt text.
*   A second data store, or a JSON or per-file format for prompts.
*   Rewriting `install.sh` to install the mod, or moving the plugin root to the repo root.
*   Type checking in v1 (no `tsc` is installed), Windows support, `CLAUDE_CONFIG_DIR` support.
*   Generating `SKILL.md` or the READMEs from the registry. A test checks them instead.
*   Run history stored on disk. Execute never writes `prompts.md`.
*   Editing prompts longer than 100,000 characters in the UI (read-only there).

## Open Questions

Each question is answered by the spike (Slice 0). Until then the design gives the fallback.

*   **Does the VS Code 2.1.318 build load a hooks module?** If not, the VS Code deliverable is the skill only, and the mod ships for terminal and desktop. The README says so.
*   **Which hosts draw in VS Code and deliver button presses?** Candidates: the above-prompt band, a pane, a tree drawn under the `/vault` command's output row, the status line. The outcome picks one of three ship shapes (see Technical Plan, "Surface tiers").
*   **When does `$.prompt.submit` resolve when the session is idle, and what does a leading `/` or `@file` do in a plugin submit?** The design assumes it resolves when the turn starts and that a leading `/` may run as a command. The user allowed leading-`/` prompts, so the README states what actually happens.
*   **How does the multi-line `Input` take a newline and a paste on VS Code?** The edit form falls back to "Load into prompt box, then Save from box" if `Input` is unusable.
*   **Which install route works in VS Code?** Candidates: `/plugin install`, the shell form `claude plugin install`, the extension command "Claude Code: Install Plugin". Does a nested `source: "./mod"` install from GitHub? What is the uninstall command?
*   **Do `claude plugin validate` and `claude plugin test` exist in 2.1.308 and the extension's binary, and do they run headless in GitHub Actions?** CI adds the second test tier only if they do.
*   **Does hot-reload consent appear in VS Code?** If not, the mod loads at the next session start.

--------------------------------------------------------------------------------

## Critical User Journeys (CUJs)

### CUJ 1: Run a saved prompt from the menu

*   **Given**: The mod is installed and active, `prompts.md` holds P0003 "Token Savior" in category Claude Code, no turn is running, no Execute is in flight.
*   **When**: The user clicks the Prompt Vault button, picks P0003 in the menu, and presses Execute.
*   **Then**: The mod re-reads `prompts.md`, parses P0003, checks the body is non-empty and the entry round-trips byte for byte, takes the in-flight slot, and calls `$.prompt.submit` with the body exactly as stored and `asUser: true`. The run state goes idle, sending, accepted. "Accepted" appears only when the call resolves `{ text }`, and the detail view says "Accepted by Claude Code. Its turn started." If the returned text differs from what was sent, it says "Accepted, but another plugin changed the text." The saved entry and its checkbox are unchanged. The slot is released when the turn completes.

### CUJ 2: Execute pressed while Claude is busy

*   **Given**: A main-loop turn is running.
*   **When**: The user opens the menu.
*   **Then**: Execute is shown disabled with the line "Claude Code is working. Execute is available when the turn ends." No submit call is made, so nothing is queued.

### CUJ 3: Execute on a prompt that is not for Claude Code

*   **Given**: P0007 has category ChatGPT.
*   **When**: The user presses Execute.
*   **Then**: The detail view shows "This prompt is filed under ChatGPT. Send it to Claude Code anyway?" with Send and Cancel. Only Send continues into CUJ 1.

### CUJ 4: Refused or failed submit

*   **Given**: Another plugin's `prompt.submit` hook drops the prompt, or the engine refuses it.
*   **When**: The user presses Execute.
*   **Then**: The run state becomes refused and shows the reason exactly as returned. If the call rejects, or the entry is invalid, the run state becomes failed with a plain reason. Both release the slot immediately. Nothing is marked accepted.

### CUJ 5: Damaged or unreadable vault

*   **Given**: `prompts.md` is missing, over 4 MiB, not UTF-8, or has an entry that does not parse or round-trip.
*   **When**: The user opens the menu or runs Execute.
*   **Then**: A missing vault shows a "Create vault" action that writes the header with the same content as the template. An unreadable file shows an error naming the problem and disables writes. A bad entry is shown as "unparseable, read-only" with its bytes untouched and Execute, Edit and Delete disabled for it. Nothing is written after a failed read or parse.

### CUJ 6: Help

*   **Given**: The user is in the menu.
*   **When**: The user presses Help and types "search" in the Help search box.
*   **Then**: The list narrows to operations whose name, syntax, description or examples contain "search", each showing syntax, an example, and which surfaces offer it (skill, `/vault`, button). Clearing the box shows all operations, then shortcuts, settings, FAQ and troubleshooting.

### CUJ 7: No UI draws in VS Code

*   **Given**: The spike showed that VS Code draws no pane and no band.
*   **When**: The user types `/vault`.
*   **Then**: Text subcommands cover every action, including `/vault run P0003` (run from a command handler with the same slot and checks). `/vault doctor` shows what the surface supports. The README states that VS Code has no button in this build and names `claudeCode.useTerminal` as the route to one.

### CUJ 8: Mark done and edit (later slices)

*   **Given**: P0003 is pending.
*   **When**: The user presses Done, or Edit and Save.
*   **Then**: The mod re-reads the file, checks the mtime and content, changes only the checkbox and `Status:` value (or the edited fields), writes `prompts.md.bak` first, writes, re-reads to verify, and refreshes the list. If the file changed since the read it asks the user to retry and writes nothing.

--------------------------------------------------------------------------------

## Technical Plan (Architecture)

### Principles

*   One source per fact. Categories, priorities, ID format, markers and the fence rule live in `SKILL.md` and are mirrored as constants in one mod module; a test asserts they match. Seed content lives in the template; a test asserts the embedded header equals it. Command names, syntax and help text live in the registry. The version lives in `mod/.claude-plugin/plugin.json`; a test asserts the marketplace entry, `install.sh`, README and CHANGELOG head agree.
*   Pure core, thin hosts. Parsing, writing, registry, help search and run-state logic are plain JavaScript modules with no import from `claude-code`, no UI and no file access of their own (file access arrives as an injected `fs` object). Views are functions of data plus the surface's element table. The same views mount in a pane, a command-output tree or the band.
*   Every button carries an operation id from the registry, so UI, `/vault` text commands, Help and tests use one path.
*   Never write after a failed read or parse. Never re-serialize the whole file.

### Components

```text
                       +---------------------------+
   user ── click ────► | Launcher (AbovePrompt)    |  terminal/desktop (+vscode if spike says)
   user ── /vault ───► | Command: /vault [op args] |  all surfaces
                       +-------------+-------------+
                                     | open / dispatch(op)
                         +-----------v------------+
                         | Hosts: Pane | CommandOutput tree | text reply
                         +-----------+------------+
                                     | props + element table
                         +-----------v------------+
                         | Views (tsx): Menu, Detail, Form, Help, RunLine
                         +-----------+------------+
                                     | operation ids
   +-------------+      +------------v-------------+      +------------------+
   | registry    +----► | Operations (handlers)    | ───► | execute / runstate|
   | (+ help)    |      +------------+-------------+      +---------+--------+
   +-------------+                   |                              |
                         +-----------v------------+      $.prompt.submit, turn.start/complete,
                         | vault (read/splice/write)|     session.end, $.state slot
                         +-----------+------------+
                                     | injected fs (read, write, stat)
                         +-----------v------------+
                         | grammar (parse, fence, |
                         | counter, constants)    |
                         +------------------------+
                         ~/.claude/prompt-vault/prompts.md  (shared with the skill)
```

### Surface tiers (decided by the Slice 0 spike)

*   **Tier 1, a pane draws and presses arrive.** Launcher button in the band (terminal, desktop; VS Code if the spike shows the band draws there). `/vault` with no argument opens the pane (`$.ui.open`, focus, close on Escape). The pane holds the menu. If `$.ui.open` returns `isPlaced: false` (too narrow), the same view is drawn under the `/vault` command's output row.
*   **Tier 2, only a command-output tree draws.** `/vault` draws the menu as a tree under its own output row, with buttons inside it. No launcher in VS Code.
*   **Tier 3, nothing draws.** Every operation is a text subcommand. `/vault run <id>` performs Execute from the command handler. Output is a single short line (the command's text is read by the model on later turns, so `/vault list` returns a count and the list is shown through the UI where possible). The README says plainly that VS Code has no button.

The terminal and desktop launcher is built against the documented band API regardless of the VS Code result, guarded by `e.surface`, and covered by a `claude plugin test` loop over surfaces.

### Vault grammar (new rule, also applied to `SKILL.md`)

*   Heading: `^## \[( |x)\] (P\d{4,}): (.*)$`. The title is everything after the first `: `. The checkbox is canonical; `Status:` is kept in sync.
*   Metadata lines directly under the heading: `- Category:`, `- Priority:` (optional), `- Created:`, `- Status:`. Unknown `- Key:` lines are preserved untouched.
*   Body: opened by a line of N or more backticks (N at least 3, with optional info string such as `text`), closed by the next line of N or more backticks. The writer chooses N as one more than the longest run of backticks anywhere in the body, minimum 3. The body is the exact text between the newline after the opener and the newline before the closer, with no trimming. A body is stored and returned with the same line endings it had.
*   Entry end: a line `---` after the closing fence. A `---` or a `## [ ] P…` line inside the fence does not end the entry.
*   Header: the `Next ID counter: N` line is looked for only above `<!-- PROMPTS START -->`. New entries go before `<!-- PROMPTS END -->`; if that marker is missing, at the end of the file. The new ID is the larger of the counter and the highest existing ID plus one, and the user is told when the counter is repaired.
*   Legacy entries written before the rule (an inner fence that closed the entry early) are handled: the parser tries the last bare fence line before the next entry boundary; if that fails the entry is shown read-only as unparseable. Execute refuses any entry that does not round-trip byte for byte or has an unclosed fence.
*   `Created:` uses the local date, as the skill does.

### Writing safely (Slice 5)

All writes work on the file's text as a string. Done and reopen replace one character in the heading and one word in `Status:`. Add inserts a new entry before the end marker and replaces the counter line in the same write. Edit replaces the touched fields and the body span. Delete removes one entry's span. Before each write the mod re-reads the file, compares both content and `stat.mtimeMs` with what its edit was based on, retries a small fixed number of times, and otherwise reports "vault changed, retry". It writes `prompts.md.bak` first (the backup is a plain copy of the current text) and re-reads afterwards to confirm the result parses and contains the expected change. A per-session write mutex prevents two mod writes at once. Writes from the skill in another process cannot be locked; the README states that cross-process safety is best effort. Input fields normalize line endings to `\n`, so an entry whose text the user did not change is never rewritten.

### Execute and run state

Run states: `idle`, `confirming`, `sending`, `accepted`, `accepted-changed`, `refused`, `failed`, `stopping`. "Run state" is the name used everywhere, because `Status:` already means pending or completed in the file.

Preconditions, checked in order, each with its own message: vault readable; entry exists, parses and round-trips; body not empty after the engine's own empty check (a body of only whitespace is refused); body length under the engine's limit; no main-loop turn running; the slot is free; category confirmation answered if needed; the call came from a button press or the person's own `/vault run` input (the origin check rejects a call whose origin is a plugin, bridge or SDK, because `asUser: true` presents text as the person's words and the model can write the vault through the skill).

The slot is one global record kept in `$.state`: `{ token, promptId, startedAt, phase }` or empty. It is taken with a compare-and-set: write `{ token }` only when empty, re-read, confirm the token is ours. It is released when the turn that Execute started completes (`turn.complete`, any reason), on `session.end`, or by the Reset action. The `sending` phase has no timer that releases the slot silently: if the call has not resolved after 15 seconds the line changes to "Still waiting for Claude Code. It has not accepted the prompt yet" and a Reset button appears with the warning that the earlier submit may still start later. A module reload keeps `$.state`, so a reload mid-send keeps the slot.

Turn tracking: `turn.start` for the main loop (no `agentId`) sets "turn running"; `turn.complete` clears it. After a hot reload the flag resets to not running, which is correct unless a turn is in progress at that moment; the spike checks this.

Correlation and Stop: with idle-only Execute and one slot, the first main-loop `turn.start` after our submit resolves belongs to Execute; the text of `turn.start` is compared as a sanity check only. "Stop turn" calls `$.turn.abort` with that turn id, asks for confirmation first ("Stopping can leave a tool half-finished"), and treats a rejection as "turn already ended". It is built last and can be dropped if it proves unreliable.

Submit options: `asUser: true` (a setting, default on). `result.text` is compared with the sent text; a mismatch yields `accepted-changed`. A saved prompt that starts with `/` is allowed; the spike determines whether it runs as a command or as text and the README says which. A prompt containing `@path` text shows a one-line warning that plugin prompts do not expand `@file` mentions. A secondary button, Load into prompt box, calls `$.prompt.fill` for those cases and returns `isFilled`.

Debug log: one `$.ui.log(..., { to: "debug" })` line per run-state change with prompt id, state, turn id, reason, text length and a hash, never the text. Failed hooks are skipped silently by the engine, so gating hooks carry a `.catch` that records a "last error" in `$.state`, and `/vault doctor` prints it.

### Registry and Help

The registry is a JavaScript array in `registry.mjs`. Each entry: `id`, `name`, `syntax`, `description`, `examples` (list), `section`, `surfaces` (any of `skill`, `slash`, `button`), `skillEquivalent` (a `/prompt-vault` subcommand name) or `modOnly: true`, and `run` (the handler). One command is registered with the engine, `/vault`, with a literal name; the `command.run` hook dispatches on the first argument through the registry, and `argumentHint` is built from it. A test checks that every registry id has a handler and every handler has an entry.

The Help view reads the registry for operations, plus static sections in `help.mjs` for shortcuts, settings (read from the manifest's `userConfig` list, so they cannot drift either), FAQ and troubleshooting. Search is a case-insensitive substring match over name, syntax, description and examples. "Section" (registry grouping) and "category" (prompt category) are different words and are never mixed.

Drift test (Tier A): parse `skills/prompt-vault/SKILL.md` headings with a tolerant pattern (`### \`/prompt-vault <sub>\`` plus trailing `[or …]` text and an em dash). Every skill subcommand must be named by a `skillEquivalent` in the registry, and every `skillEquivalent` must exist in `SKILL.md`. The README and template README command tables are checked by the same parse. This guards names and syntax, not behavior; the design says so rather than claiming otherwise.

### Menu and views

The menu has a search box, a category choice, a pending/done/all choice, a paginated list (about 20 rows, sized from `e.viewport.rows`), and a Refresh button. The list is re-read from the file when the pane opens, after every mutation and on Refresh. Each row shows checkbox, ID, title, category and priority. Picking a row opens the detail view: title, metadata, the body in a `Code` element (display strips control characters other than tab and newline, never the submitted text), the character count, a "preview truncated; Execute sends the full text" note when the body exceeds what one tree can draw (100,000 characters), the run line, and buttons Execute, Load into prompt box, Done or Reopen, Edit, Delete, Back, Help. The Add and Edit form uses single-line `Input` for the title, `Select` for category (no default; required) and priority, a multi-line `Input` (`rows` of 6 or more) for the body, and an explicit Save button. Drafts are kept in `$.state`, and the field's `value` is not rewritten per keystroke. Delete is a two-press button that resets itself after a few seconds; the ID counter never goes down.

Overview, `list`, `next`, `send`, `search` and `categories` are views or text outputs over the same parse result. `next` follows the skill's rule (first pending entry, High before Medium before Low when priorities are set). `send` shows the copy-ready body and offers Execute and Load into prompt box.

### Configuration

Settings are declared in `plugin.json` `userConfig` and appear in the `/config` menu: `submitAsUser` (default true), `confirmNonClaudeCodeCategories` (default true), `pageSize` (default 20), and `vaultDir` (default `$HOME/.claude/prompt-vault`, documented as an override for testing so the spike and tests never touch the real vault). `$HOME` comes from `$.env.get("HOME")`; if it is unset and `vaultDir` is empty, every action is disabled with a persistent error and nothing falls back to a project folder.

### Install and activation

`.claude-plugin/marketplace.json` at the repo root lists `prompt-vault-mod` with `source: "./mod"`. Install: `claude plugin install prompt-vault-mod --marketplace raymondtian30/Prompt-Vault-for-Claude-Code` from a shell (the form documented to load in later sessions at user scope), or `/plugin install prompt-vault-mod --marketplace raymondtian30/Prompt-Vault-for-Claude-Code` in a terminal session. The spike confirms the VS Code route and a nested source. Activation: the mod loads in the next session after install; "active" means `/vault doctor` reports the mod version and a launcher or pane is available. Uninstall: `uninstall.sh` removes the skill only (unchanged, plus a printed line about the mod); a second documented command removes the mod, confirmed in the spike; the vault data is never deleted. A marketplace install tracks the default branch rather than a tag, so `main` is kept releasable, and the README states the pin policy.

### Development loop

The deliverable lives in `mod/`. To load it in this session it is mirrored into the session mods folder (`<claude config>/dev-mods/<session>/prompt-vault-mod/`) with `rsync -a --delete --exclude .claude-plugin/types mod/ <that folder>/` after edits, and the first write there triggers the engine's one-time "Turn on the mods Claude writes in this session?" question to the user. A symlink in place of the mirror is tried in the spike. `claude plugin validate` runs on `mod/` and on the repo root (marketplace). No user settings file is edited.

### Risks and mitigations

*   VS Code may not draw anything: the three surface tiers and `/vault doctor` make this a known outcome, not a surprise.
*   API drift: the tested version is pinned in README, `/vault doctor` warns on a version outside it, and a scheduled CI canary is a possible later addition.
*   Data loss: the fence rule, round-trip refusal, span-only writes, `.bak`, never writing after a failed read.
*   Silent false success: "accepted" is derived only from `{ text }`; unit tests with a fake submit are labelled as logic tests and are not evidence of live acceptance. The manual VS Code checklist is.
*   Prompt injection into a user turn: origin check and button-press requirement for `asUser: true`.
*   Trust: the mod has file and prompt-submit power; the README says what it reads, writes and submits.

## Alternatives Considered

### Alternative A: Text-only `/vault` with no UI

*   **Pros**: Works on every surface; small.
*   **Cons**: No clickable launcher or menu; requirement 1 unmet.
*   **Reason for Rejection**: Rejected by author as the whole answer. Kept as Tier 3.

### Alternative B: A VS Code extension with a webview

*   **Pros**: Full control of the UI inside VS Code.
*   **Cons**: No supported way to submit into the Claude Code session without clipboard or keystroke tricks.
*   **Reason for Rejection**: Rejected by author: the user asked for a mod and forbade clipboard tricks.

### Alternative C: Terminal-only mod

*   **Pros**: The band and button are documented there.
*   **Cons**: The user runs VS Code; `claudeCode.useTerminal` gives up the native chat UI.
*   **Reason for Rejection**: Rejected as the target; documented as an option.

### Alternative D: Execute through the skill (`/prompt-vault run`)

*   **Pros**: No new code path.
*   **Cons**: The prompt reaches the model as tool output, not a user turn; it may be paraphrased or refused; no acceptance signal; formatting passes through the model.
*   **Reason for Rejection**: Rejected by author: cannot meet "only report success after Claude Code accepts".

### Alternative E: `$.prompt.fill` as the main action

*   **Pros**: Verbatim; typed semantics for `@file` and `/`.
*   **Cons**: The user still presses Enter; no acceptance status; `fill` can fail.
*   **Reason for Rejection**: Rejected as primary; kept as the secondary Load into prompt box.

### Alternative F: Sidecar JSON, lock files, JSON or per-file prompts

*   **Pros**: Easier structured access or concurrency control.
*   **Cons**: A second source of truth the skill cannot see; the skill cannot honor a lock; breaks the shipped skill and "copy the folder".
*   **Reason for Rejection**: Rejected by author. Use the span splice, re-read, mtime check and `.bak`.

### Alternative G: Cooldown timer, per-prompt lock, nonce in the prompt, queued Execute

*   **Pros**: Superficially simple duplicate protection.
*   **Cons**: A timer is lost on reload and is arbitrary; a per-prompt lock lets two prompts queue; a nonce alters the sent prompt; queued submits cannot be retracted.
*   **Reason for Rejection**: Rejected by author. One global slot plus idle-only Execute.

### Alternative H: Plugin root at the repo root, TypeScript with `tsc`, generated docs, JSON registry

*   **Pros**: One tree; type safety; no hand-written docs; a data file for the registry.
*   **Cons**: Root `skills/` would register the skill twice beside `~/.claude/skills/prompt-vault`; the 23,000-line type file would need vendoring on an early-access API; generated-diff checks are brittle; only code file types load in a mod.
*   **Reason for Rejection**: Rejected by author for v1.

--------------------------------------------------------------------------------

## Non-Functional Requirements

*   **Security & Privacy**: The mod reads and writes only the vault directory and submits only text the user pressed Execute on. Prompt text is never logged. `asUser: true` presents text as the person's words, so Execute accepts presses and the person's own `/vault run`, not calls from other plugins or bridges. The README discloses the mod's powers and that `main` is what a marketplace install tracks.
*   **Performance & Latency**: A parse of a vault up to the 4 MiB read limit on every open and mutation is acceptable at personal scale; if it is not, a cache keyed by `mtimeMs` is the first fix. Trees are paginated because only the first 100,000 characters of a tree draw and over-long button labels become unpressable. A command's returned text is read by the model, so `/vault` replies stay one short line.
*   **Rollout & Rollback**: Additive release v1.1.0. The skill and installers keep working unchanged apart from the fence-rule text and the `REF` pin. Rollback is `uninstall` of the mod and the skill's previous tag; vault data is never altered by install or uninstall. The fence rule is backward compatible: entries written by older skills parse, and a prompt containing a fence that an older skill truncated is flagged as unparseable rather than guessed.

--------------------------------------------------------------------------------

### Additional Resources

*   `docs/designs/prompt-vault-mod-brief.md`: seven-lens brainstorm and the user's decisions.
*   the Claude Code mod API reference (`reference.md` and `types/claude-code.d.ts`, shipped with the plugin-authoring skill): the mod API for this build.
*   `skills/prompt-vault/SKILL.md`, `prompt-vault-template/`: the format and commands being matched.

### Future Improvements

*   **Scheduled canary**: a weekly CI job that runs the mod tests against the latest Claude Code release to catch API drift early.
*   **Cached index**: an `mtimeMs`-keyed cache if parsing becomes slow.
*   **Bulk actions**: tick several prompts for bulk Done or Delete.
*   **Run history**: a session-only badge on prompts that were executed.

--------------------------------------------------------------------------------

## Detailed Implementation Plan

Slices run in order. Each slice ends with its tests passing and a commit; pushes happen at slice boundaries when everything green. Slice 0 gates the shape of Slices 3 and 4.

### Target Files to Create/Modify

#### 1. `mod/.claude-plugin/plugin.json` (Create)

*   **Type / Scope**: Mod manifest.
*   **Proposed Changes**: `name` `prompt-vault-mod`, `version` `1.1.0` (the single version source), one-line `description`, `types` pointing at `./types/index.d.ts`, `userConfig` fields `submitAsUser`, `confirmNonClaudeCodeCategories`, `pageSize`, `vaultDir` with defaults and descriptions. Field syntax is confirmed by `claude plugin validate` in Slice 0.

#### 2. `mod/hooks/hooks.json` (Create)

*   **Type / Scope**: Hooks manifest.
*   **Proposed Changes**: `{ "modules": ["./register.tsx"] }`.

#### 3. `mod/hooks/register.tsx` (Create)

*   **Type / Scope**: Hooks module, the only file that touches `claude-code`.
*   **Proposed Changes**: `register(on, options)`. `session.start`: register `/vault` (literal name, `argumentHint` from the registry); open nothing automatically. `command.run` for `vault`: dispatch through the registry, return one short text line, open the pane when no argument is given. `ui.render` for `Pane` with request id `vault`, for `CommandOutput` on `vault`, and for `AbovePrompt` (launcher, guarded by `e.surface` and `e.props.hasSurvey`). `turn.start` and `turn.complete` update the turn-running flag and the slot. `session.end` releases the slot. Gating hooks end in `.catch` that stores the last error. Wires injected deps (`fs` over `$.fs` with `$.env.get("HOME")`, `submit` over `$.prompt.submit`, clock over `$.clock.now`, state over atoms).

#### 4. `mod/hooks/lib/grammar.mjs` (Create)

*   **Type / Scope**: Pure JavaScript module with JSDoc.
*   **Proposed Changes**: Constants (categories, priorities, ID pattern, markers, minimum fence length), `parseVault(text)` returning header, entries (id, checkbox, title, metadata, body, byte span) and per-entry errors, `chooseFence(body)`, `renderEntry(entry)`, `nextId(header, entries)`, round-trip check `roundTrips(entry, text)`.

#### 5. `mod/hooks/lib/vault.mjs` (Create)

*   **Type / Scope**: Pure JavaScript module with an injected `fs` object (`read`, `write`, `stat`).
*   **Proposed Changes**: `loadVault(fs, path)` (never throws; returns `{ ok, entries, errors, mtimeMs }` or a typed error: missing, too large, not UTF-8), `createVault(fs, path)`, and in Slice 5 `markDone`, `reopen`, `addEntry`, `editEntry`, `deleteEntry`, each: re-read, compare content and mtime, retry, `.bak`, splice, write, re-read to verify.

#### 6. `mod/hooks/lib/registry.mjs` (Create)

*   **Type / Scope**: Pure JavaScript module.
*   **Proposed Changes**: The operations array described in the Technical Plan, including handlers for list, search, show/send, next, categories, overview, run, load, done, add, edit, delete, help, doctor, stop. Handlers return data and an optional short text line, never UI.

#### 7. `mod/hooks/lib/help.mjs` (Create)

*   **Type / Scope**: Pure JavaScript module.
*   **Proposed Changes**: `searchHelp(query, registry, extras)` and the static shortcut, FAQ and troubleshooting sections; settings are derived from the manifest's `userConfig` list passed in.

#### 8. `mod/hooks/lib/execute.mjs` (Create)

*   **Type / Scope**: Pure JavaScript module with injected `submit`, `loadVault`, `now`, `log`, `state`.
*   **Proposed Changes**: `precheck` (the ordered preconditions), `takeSlot`/`releaseSlot` (compare-and-set), `runPrompt` driving the run-state transitions from the `submit` result, text comparison, and the 15-second "still waiting" signal. Pure reducer `nextRunState(state, event)` for the views.

#### 9. `mod/hooks/ui/` (Create: `launcher.tsx`, `menu.tsx`, `detail.tsx`, `form.tsx`, `help.tsx`, `runline.tsx`)

*   **Type / Scope**: TSX views (global `h`, elements from `$.ui.resolve(e)`), no business logic.
*   **Proposed Changes**: The views described under "Menu and views". Each takes data and an `onOperation(id, args)` callback. The launcher is a Button labelled "Prompt Vault" with a short text fallback line. Hotkeys on buttons are assigned after Slice 0 and listed in Help.

#### 10. `mod/types/index.d.ts` (Create)

*   **Type / Scope**: `PluginState` contract under the key `prompt-vault-mod` (slot, run state, draft, search text, filters, selected id, page, last error, confirm state), each value tagged with a `shape` string so old stored values are declined after a change.

#### 11. `mod/tests/*.test.tsx` (Create)

*   **Type / Scope**: Tier B tests run by `claude plugin test mod`.
*   **Proposed Changes**: Mount the menu, detail and Help views through the plugin on `terminal`, `desktop` and `vscode`, looped. Cases: list renders, search narrows, Execute disabled while a turn runs, Execute calls a fake submit with the exact body and shows accepted only on `{ text }`, refused and failed paths, confirmation for ChatGPT, Reset appears after the wait. These use a fake engine and are logic evidence only. Whether tests outside `mod/` are discovered is checked in Slice 0; these stay inside.

#### 12. `tests/*.test.mjs` and `tests/fixtures/*.md` (Create)

*   **Type / Scope**: Tier A tests run with `node --test`, outside `mod/` so they do not ship with the install.
*   **Proposed Changes**: `grammar.test.mjs` and `vault.test.mjs` with the fixture corpus (nested fence, four-backtick outer fence, `---` inside a body, fake heading inside a body, empty body, 100,000-character body, unicode, tabs, CRLF, no priority, unknown metadata line, ID gaps, duplicate IDs, a legacy entry that closes early, golden files from the real skill) and splice tests that assert every byte outside the change is untouched. `registry.test.mjs` (handler for every id, hints), `help.test.mjs` (every registered operation appears, search cases), `execute.test.mjs` (fake submit: exact body, long body, special characters, duplicate prevention, busy refusal, refusal and rejection paths, changed-text detection, slot release, reload keeps slot), `drift.test.mjs` (SKILL.md headings versus registry, README and template README tables, constants versus SKILL.md, embedded header versus template, version agreement across `plugin.json`, marketplace entry, `install.sh`, README and CHANGELOG).

#### 13. `.claude-plugin/marketplace.json` (Create)

*   **Type / Scope**: Marketplace manifest.
*   **Proposed Changes**: Marketplace name, owner, one plugin `prompt-vault-mod` with `source: "./mod"`. Validated with `claude plugin validate .`.

#### 14. `package.json` (Create)

*   **Type / Scope**: Node metadata, no dependencies.
*   **Proposed Changes**: `private: true`, `engines`, script `test` running `node --test tests/`.

#### 15. `.github/workflows/ci.yml` (Modify)

*   **Type / Scope**: CI.
*   **Proposed Changes**: Keep the shellcheck job. Add a job with `actions/setup-node` and `npm test`. Add a `claude plugin validate`/`test` job only if Slice 0 shows they run headless without sign-in.

#### 16. `skills/prompt-vault/SKILL.md` (Modify)

*   **Type / Scope**: Skill text.
*   **Proposed Changes**: Replace the fence guidance with the new rule (fence length, closing rule, exact body, trailing newline), state the heading pattern, mention the `<!-- PROMPTS END -->` marker in the format section, and add a short note that the optional `prompt-vault-mod` reads the same file. No command behavior changes.

#### 17. `prompt-vault-template/prompts.md` and `prompt-vault-template/README.md` (Modify)

*   **Type / Scope**: Seed data and local docs.
*   **Proposed Changes**: Same fence rule wording; README mentions the mod and `/vault`. The header stays byte-identical to the constant embedded in `grammar.mjs`, and the drift test enforces it.

#### 18. `README.md` (Modify)

*   **Type / Scope**: Top-level docs.
*   **Proposed Changes**: Retitle (skill plus mod), a "which one when" note for `/prompt-vault` and `/vault`, mod install (both forms), uninstall (skill, mod), activation and configuration, per-surface behavior table, a feature table marked implemented, partial or unsupported, tested versions, known limitations (VS Code button result, API drift, non-atomic writes, `@file` and image handling, per-session lock, narrow panel), the Help system, troubleshooting, and the install pin policy. Repo layout block updated. The pinned install URLs move to v1.1.0.

#### 19. `CHANGELOG.md` (Modify)

*   **Type / Scope**: Release notes.
*   **Proposed Changes**: `v1.1.0` entry: the mod, Execute, Help, fence-rule fix to the skill, tests, CI, and the corrected CI description.

#### 20. `install.sh` and `uninstall.sh` (Modify)

*   **Type / Scope**: Shell scripts.
*   **Proposed Changes**: `REF` default becomes `v1.1.0`. `uninstall.sh` prints a line saying the mod is separate and how to remove it. No mod installation logic is added. `shellcheck` stays clean in CI.

#### 21. `.gitignore` (Modify)

*   **Type / Scope**: Ignore rules.
*   **Proposed Changes**: Add `.claude-plugin/types/`, `mod/.claude-plugin/types/` and `node_modules/`.

#### 22. `docs/ACCEPTANCE.md` (Create)

*   **Type / Scope**: Manual acceptance checklist.
*   **Proposed Changes**: Step-by-step VS Code, terminal and desktop checks with the expected result and a place to record the outcome: mod loads, launcher or pane appears, vault loads, search and filter, execute a short and a long multi-line prompt, formatting preserved in the transcript, duplicate press blocked, busy state, refusal, confirmation for a ChatGPT prompt, Help search, `/vault doctor`, existing Claude Code features unaffected.

#### 23. `docs/designs/prompt-vault-mod.md` (Create)

*   **Type / Scope**: The finalized design document, saved from this draft after approval. the brief is kept beside it as `prompt-vault-mod-brief.md`.

### Slice order

0. **Spike as product skeleton** (files 1, 2, 3 minimal, 10 minimal): load the mod in this VS Code session and answer every Open Question; record results in `docs/ACCEPTANCE.md` and the README limitations draft. Use a copy of the vault via `vaultDir`.
1. **Core** (4, 5 read side, 12 grammar and vault tests, 13, 14, 15 Node job, 16, 17, 21): parser, fixtures, SKILL.md rule, scaffolding, CI.
2. **`/vault` and Execute** (6 partial, 8, 3, 12 execute and registry tests): `list`, `search`, `run`, `help`, `doctor`.
3. **Menu UI and launcher** (9, 11): shaped by the spike tier.
4. **Help** (7, registry completion, `drift.test.mjs`).
5. **Writes** (5 write side): Done and reopen, then add, edit, delete, then Stop turn.
6. **Docs and release** (18, 19, 20, 22, 23): README, CHANGELOG, version agreement, final validation, push, GitHub release v1.1.0.

### Verification Plan

*   **Compilation/Build**: None for the mod (the loader transpiles TSX). `claude plugin validate mod` and `claude plugin validate .` report no errors and the expected gating hooks list.
*   **Unit Tests**: `npm test` (Node built-in runner) for Tier A; `claude plugin test mod` for Tier B where available.
*   **Static Analysis & Linting**: `shellcheck install.sh uninstall.sh` in CI. No JavaScript linter or type check in v1; the README says so.
*   **Test Coverage Requirement**: Every registry operation has a handler test and a help-appearance test; every grammar rule has a fixture; every run state has a transition test. No numeric coverage target.
*   **E2E/Integration**: Manual checklist `docs/ACCEPTANCE.md` run in VS Code (and terminal if available) before release. Acceptance of "successful execution" rests on this checklist: a real prompt is submitted from the menu and appears as a turn in the transcript, with the exact text. A regression pass runs the skill's own commands (`/prompt-vault list`, `add`, `done`, `send`) after the fence-rule change and confirms an existing vault still loads in both skill and mod.

--------------------------------------------------------------------------------

*Drafted with EGM*
