# Prompt Vault as a Claude Code mod

* **Author:** Raymond Tian
* **Date:** 2026-11-10

## Overview

Prompt Vault today is a Claude Code skill. It keeps prompts in one markdown file, `~/.claude/prompt-vault/prompts.md`, and Claude edits that file when you type `/prompt-vault ...`. There is no UI, and sending a prompt means copying text by hand.

The goal is to add a Claude Code mod (a hooks module loaded by Claude Code, not a VS Code extension) that gives Prompt Vault:

1. A Prompt Vault button in the Claude Code interface that opens a UI to browse, search, filter, add, edit and delete prompts.
2. An Execute button per prompt that submits the full prompt to Claude Code and reports success only after Claude Code accepts it.
3. A Help view generated from one command registry.
4. Automated tests, a README with install, uninstall, activation and known limits, and pushed commits in this repo.

Decisions already made by the user:

* The skill and `install.sh` stay as a backup. The mod lives in `mod/` of this repo and uses the same `prompts.md`.
* The mod's slash command is `/vault` (the skill owns `/prompt-vault`).
* Done is a separate button. Execute never marks a prompt done.
* The user runs Claude Code inside the VS Code extension and wants a button.
* Install goes through `/plugin install <mod> --marketplace raymondtian30/Prompt-Vault-for-Claude-Code`.

Facts checked against this machine's API docs and files:

* `$.prompt.submit({ text, asUser })` submits through the same path as a typed prompt. It returns `{ text }` or `{ drop: reason }`. It queues behind a running turn and resolves when its own turn starts, not when it ends. A queued call has no cancel handle.
* The above-prompt band, the only documented place for a clickable launcher button, is raised on terminal and desktop only. `Pane` is raised on every attached surface. There is no toolbar slot.
* The installed VS Code extension is `anthropic.claude-code-2.1.318`. The CLI is 2.1.308 and the API docs are 2.1.322. It is not known whether the VS Code build loads mods or draws anything. The extension has a setting `claudeCode.useTerminal` that switches it to the terminal UI, and a command "Claude Code: Install Plugin" whose behavior is unknown.

## Analysis

What is wrong or risky, most serious first.

**1. A button in VS Code is unproven and may be impossible.** The documented button host is not raised on the VS Code surface, and nothing shows the VS Code build attaches a surface at all. If nothing draws, browse, edit and Execute have no UI there. The earlier fallback (pane, `/vault`, status line) assumes panes draw; the status line is plain text and not clickable. Other hosts raised on every surface and worth testing: a drawn tree under the `/vault` command's own output row (Buttons inside the transcript), a row placed at the transcript end (scrolls away), and a pane (needs a wide panel; VS Code's side panel is usually narrow). The only documented route to a real button in VS Code is switching it to the terminal UI with `claudeCode.useTerminal`, which gives up the native chat view. The first task is therefore a spike that reports what draws, and the final design follows the result. "Button" also means two things: a launcher in the interface, and a button inside a pane. They need separate acceptance criteria.

**2. The `prompts.md` format cannot safely carry verbatim text.** The skill wraps each prompt in a fenced block but has no rule for a prompt that itself contains a triple-backtick line, which is common in Claude Code prompts. Such an entry ends early. Execute would then submit a truncated prompt and show "accepted". Also undefined: `---` or a fake `## [ ] P0009:` heading inside a prompt, CRLF, a missing `<!-- PROMPTS END -->` marker, and where the counter line sits. The fix is a CommonMark-style fence rule (closing fence at least as long as the opening one; the writer picks a longer opener than any inner run), a strict heading pattern, and a rule that Execute refuses any entry that does not round-trip byte for byte. `SKILL.md` must adopt the same rule. That is a latent data-loss bug in the shipped skill, so it ships as a skill fix and a version bump.

**3. Two writers on one file, and the API has no safe write.** `$.fs.write` replaces the whole file. There is no append, patch, rename or lock. The skill is told to use targeted edits and never overwrite the file. If the pane holds a stale copy while Claude adds a prompt through the skill, a mod write can erase it or reuse its ID. A crash during write can truncate the only copy. Mitigations: never write after a failed read or parse; change only the touched byte span instead of re-serializing; re-read and compare content and modification time right before writing; write `prompts.md.bak` first; re-read after writing; say in the README that cross-process safety is best effort. Whether v1 includes writes at all is a staging decision (see below).

**4. The Execute state model in the concept does not match the API.** A result of `{ text }` does not say whether the prompt started a turn or was queued. No "is the session idle" query exists. A mis-click while a turn runs becomes a queued prompt that cannot be pulled back, and the button would show "sending" until that turn ends. Calling `$.prompt.submit` and waiting for it inside a `/vault run` command handler can also hang, because the handler is the busy part. Recommendation: Execute is enabled only when no main-loop turn is running (tracked from `turn.start` and `turn.complete`), runs from a button press handler without waiting inside a command handler, and uses one global in-flight slot kept in session state, released on turn completion, session end, or a time limit. This removes the queued state and most of the cancel problem. The cooldown timer and per-prompt locks in the original concept are dropped: a timer is lost on reload and a per-prompt lock lets two prompts queue.

**5. "Cancel" cannot be tied to the turn a submit started.** `turn.start` carries no origin. `$.turn.abort` stops the running main-loop turn and its tools. With idle-only Execute and one slot, the next main-loop `turn.start` after our submit is ours, so a "Stop turn" button is workable, with a confirmation because stopping can leave half-finished tool work. Esc already aborts a turn, so this is built last and can be cut.

**6. "Submit verbatim" is only partly true.** With `asUser: true` the model reads the text bare, but the transcript still names the plugin. `@file` mentions and pasted images are not expanded for plugin prompts. A saved prompt that starts with `/` may run as a slash command, and the API gives no way to suppress that. Other plugins' prompt hooks can rewrite or drop a plugin's submit. So the UI must compare the returned text with the sent text and show "accepted, text changed by another plugin" when they differ, refuse a leading-`/` prompt unless the spike shows it is treated as text, and warn when a prompt contains `@` paths. A secondary "Load into prompt box" button (`$.prompt.fill`) keeps typed semantics for those cases. Because `asUser: true` presents text as the person's own words, Execute must run only from a button press or the person's own input, never from a model-reachable path.

**7. The tests cannot prove the headline requirements.** `claude plugin test` has no file system, network or process access. Hooks the test supplies stand in for the engine, so a stubbed submit fakes the acceptance the user wants proven, and the kit checks the drawn tree, not paint. Mod files must be `.ts`, `.tsx`, `.jsx`, `.js`, `.mjs`, `.cjs`, `.mts` or `.cts`, so a JSON registry is not loaded. `tsc`, `bun` and `shellcheck` are not installed here. Proposed split: Tier A, plain `.mjs` pure logic (parser, writer, registry, help search, state) tested with `node --test`, which can read repo files, so fixture and drift tests live here and CI needs no Claude CLI. Tier B, `claude plugin validate` and `claude plugin test` with fake file system and fake submit, looped over the terminal, desktop and VS Code element tables; added to CI only after the spike shows it runs headless. Tier C, a manual VS Code acceptance checklist plus an in-product `/vault doctor` command. Live acceptance (does Claude Code really accept the prompt) is manual and is the only evidence for "successful execution".

**8. Version skew.** Docs 2.1.322, CLI 2.1.308, VS Code extension 2.1.318. The API says it may change between releases. The tested version goes in the README and a runtime version check warns on mismatch.

**9. The Help registry and the drift test are aimed at the wrong target.** `$.command.register` takes one flat name, and the command name must be a string literal, so a registry cannot register many commands dynamically. With one `/vault` command, the registry holds operations, each with a handler, and dispatch comes from it, so docs and behavior cannot disagree. The skill's `/prompt-vault <sub>` list is a different namespace (the skill has `next`, `send`, `categories`; the mod has `run`, `help`). Each registry entry therefore carries either `skillEquivalent` or `modOnly`, and a Tier A test parses `SKILL.md` headings and fails when a skill command has no entry. This guards names, not behavior. A command's returned text is read by the model on later turns, so `/vault list` returns one short line and draws its content in the UI.

**10. Install and activation are unverified for VS Code.** The documented `/plugin install` line is a terminal command. The shell form `claude plugin install <mod> --marketplace ...` at user scope loads in later sessions. The repo has no marketplace file yet. `source: "./"` would pull the root `skills/` folder into the plugin and register the skill twice, so the marketplace entry must use `./mod`, and the spike must prove a nested source installs from GitHub. The plugin name must not be `prompt-vault`; suggested `prompt-vault-mod`, and it must be fixed before coding because state keys hard-code it. The repo pins releases by tag while a marketplace install tracks the default branch, so `main` must stay releasable. `uninstall.sh` removes only the skill, so the README needs a second uninstall path, confirmed in the spike. The mod has file-system and prompt-submit power, so install trust is a real consideration.

**11. UI hazards in a narrow panel.** `Input` is multi-line only with `rows` of 2 or more, Enter submits, and the newline key on VS Code is unspecified, so a multi-line prompt can be saved half-written. Use an explicit Save button and keep drafts in session state. A tree draws only its first 100,000 characters, and a Button whose label is cut becomes unpressable, so lists are paginated and long bodies show "preview truncated; Execute sends the full text". Prompts over 100,000 characters are read-only in the UI. `Code` and `Markdown` accept only tab and newline as control characters, so display strips others (never the submitted text). Adding a prompt needs a category choice with no silent default. Delete needs a confirmation (two-press button) and the ID counter never goes down. Reads over 4 MiB reject and must show an error, never an empty list. Other points: `~` is not expanded (use `HOME`); with `HOME` unset every action is disabled, and there is no project-local fallback; the vault path is `$HOME/.claude/prompt-vault` only (no Windows or `CLAUDE_CONFIG_DIR` support, as in the skill).

**12. Smaller points.** Prompts in the ChatGPT, Research and Other categories would be sent into Claude Code by Execute; they need a warning or a hidden Execute. Nothing records that a prompt ran, so after reload it looks unrun; a session-only badge is the only record proposed, and Execute never writes `prompts.md`. Debug logging: one line per run-state change (id, state, turn id, reason, text length, hash, never text). Use the term "run state" for execution state, because `Status:` already means pending or completed in the file. The mod should also tell apart `failed` (rejected promise, unparseable entry) from `refused` (`{ drop }`, reason shown verbatim).

Weakest assumption in the original concept: that a button, a pane and a submit all behave the same in the VS Code build as the docs say for the CLI. None of that is verified.

What does hold up: submit through `$.prompt.submit` is a real, supported, programmatic path with a real accept-or-drop result, so the Execute requirement is achievable without clipboard tricks. Keeping the skill and the shared file means the mod can ship in stages without breaking existing use.

Ideal Final Result: opening Claude Code shows a Prompt Vault button; one click opens the vault; one click on Execute runs a prompt, and the UI says "accepted" only because the engine returned `{ text }`. Where VS Code cannot draw that, the README says so plainly instead of pretending.

## Goals vs. Non-Goals

* **In-Scope Goals:**
  * A `mod/` plugin: manifest, hooks module, `/vault` command, pane UI, launcher button where the surface supports it.
  * Execute per prompt with the run-state model above, global slot, idle-only, `asUser: true`, returned-text comparison, "Load into prompt box" as a secondary action, optional "Stop turn".
  * Help view and `/vault help` generated from one operation registry, with search, syntax, examples, keyboard shortcuts, settings, FAQ, troubleshooting.
  * A fence rule for `prompts.md` adopted by `SKILL.md`, a parser and a span-splicing writer with a fixture corpus.
  * `/vault doctor` reporting version, surfaces, what draws, vault path and parse errors.
  * Tier A tests in CI, Tier B tests once proven headless, a manual acceptance checklist.
  * README: install (shell and in-app forms), uninstall (skill and mod), activation, configuration, tested version, per-surface known limitations, marked as implemented, partial or unsupported.
  * One release number across `plugin.json`, marketplace entry, `install.sh`, README and CHANGELOG.
* **Out-of-Scope Non-Goals:**
  * A VS Code extension, a webview, clipboard or keystroke injection.
  * Queuing an Execute behind a running turn.
  * A cooldown timer, per-prompt locks, nonce markers in prompt text.
  * A second data store, a JSON or per-file format for prompts.
  * Rewriting `install.sh` to install the mod, or moving the plugin root to the repo root.
  * Type checking (no `tsc` in v1), Windows support, `CLAUDE_CONFIG_DIR`.
  * Generating `SKILL.md` or the READMEs from the registry (a test checks them instead).
  * Run history stored on disk.

## Alternatives Weighed

* **Text-only `/vault` with no UI.** Kept as the floor and the fallback when nothing draws. Rejected as the whole answer: no clickable controls, so requirement 1 is unmet.
* **A real VS Code extension with a webview.** Rejected by author: no supported way to submit into the Claude Code session without clipboard or typing tricks; the user asked for a mod.
* **Terminal-only mod.** Rejected as the target because the user runs VS Code. Offered as an option via `claudeCode.useTerminal`, which gives up the native chat UI.
* **Adding `/prompt-vault run <id>` to the skill.** Rejected: the prompt reaches the model as tool-result data, not a user turn, so it may be paraphrased or refused, there is no acceptance signal, and it cannot be tested.
* **`$.prompt.fill` as the main action.** Rejected as primary (you still press Enter, so no Execute and no acceptance status); kept as the secondary "Load into prompt box".
* **Clipboard paste.** Rejected by the user; acceptance cannot be detected.
* **Sidecar JSON index or state file.** Rejected: a second source of truth the skill cannot see.
* **Lock files for concurrent writes.** Rejected: the skill is prose and cannot honor a lock, a crash leaves it stale, `$.fs` has no exclusive create. Use re-read, modification-time check, span splice and a `.bak`.
* **`prompts.md` as JSON or one file per prompt.** Rejected: breaks the shipped skill and the shared-file decision.
* **Read-only mod first, writes left to the skill.** Adopted for early slices, not forever; the guarded write path follows.
* **Mod as single writer through model tools.** Rejected for v1: adds tools to every request and a larger scope.
* **Plugin root at repo root so `skills/` ships inside it.** Rejected unless the user asks: reverses the `mod/` decision and risks registering the skill twice.
* **Generating `SKILL.md` and READMEs from the registry.** Rejected: brittle diffs; a test reads the repo files and fails on drift.
* **Cooldown timer; per-prompt lock; nonce in text.** Rejected: arbitrary constant lost on reload; lets two prompts queue; alters the sent prompt.
* **JSON registry.** Rejected: only code file types load in a mod.
* **TypeScript with `tsc` or `bun`.** Rejected for v1: new toolchain on an early-access API, the 23,000-line type file would need vendoring.
* **`mv` for atomic writes.** Rejected: documented as CLI-only, unknown under VS Code.
* **A permanent button via a placed transcript row or message footers.** Rejected: scrolls away, compaction ends it, rows accumulate.
* **Separate `/vault-add`, `/vault-help` commands.** Rejected: contradicts the single `/vault` choice and the literal-name rule.
* **Queue Execute behind a running turn.** Rejected: no dequeue, no queued flag, cancel mis-attribution.

## Key Decisions & Staging for Next Steps

Staging (each slice ends with tests and a commit; nothing is pushed broken):

0. **Spike as product skeleton (gate).** A mod in `mod/` that doubles as `/vault doctor`. It records: version and surfaces in VS Code; whether a hooks module loads; whether `/vault` shows in the typeahead; whether a pane, a command-output tree, the above-prompt band and the status line draw in VS Code; whether button presses arrive; submit timing idle vs mid-turn; byte equality for a multi-line prompt with a nested fence; leading `/` and `@file` behavior; `Input` newline and paste; `$.fs` read, write and stat on an absolute path; install routes (`/plugin install`, shell form, the VS Code Install Plugin command, nested `./mod` source) and uninstall; whether `claude plugin validate` and `claude plugin test` run headless. The outcome picks one of three ship shapes: panes draw, only command-output trees draw, or nothing draws (text subcommands only, including `run <id>`).
1. **Core.** Fence rule, parser, span-splice writer, fixture corpus, `SKILL.md` fence update, scaffolding (`.claude-plugin/marketplace.json`, `mod/.claude-plugin/plugin.json`, `.gitignore` entries), Tier A tests in CI, `claude plugin validate` clean.
2. **`/vault` and Execute.** `list`, `search`, `run <id>`, `help`; global slot, idle-only, `asUser: true`, refusal of invalid and leading-`/` entries, returned-text comparison, debug logging.
3. **Pane UI.** List, search, filter, select (open a prompt), detail, per-row Execute, run-state line, "Load into prompt box", pagination, launcher button where the surface supports it.
4. **Help.** Registry drives dispatch and `argumentHint`; Help view with search; drift test.
5. **Writes.** Done and reopen first, then add, edit, delete through the guarded path; "Stop turn" last.
6. **Docs and release.** README, CHANGELOG, one version bump (suggested v1.1.0), push.

Engineering defaults proposed (change any you disagree with): plain `.mjs`/JSX with JSDoc and no type check; plugin name `prompt-vault-mod`; editable-length cap 100,000 characters; page size about 20 rows; the lock is released on turn completion, session end, or after a time limit; vault path `$HOME/.claude/prompt-vault`; dates use the local date to match the skill; the spike runs against a copy of the vault, not the real one.

Decisions resolved by the user (2026-11-10):

1. Accepted: if VS Code cannot draw a launcher button, VS Code gets the pane or `/vault` text commands and terminal and desktop get the button, stated plainly in the README. The `claudeCode.useTerminal` route to a real button is documented too.
2. Accepted: v1 ships browse, Execute and Done first; add, edit and delete follow in a later slice of the same release.
3. Execute on ChatGPT, Research and Other prompts asks for confirmation first.
4. "Select" means: clicking the Prompt Vault button opens a menu, and you pick a prompt from it. The user's wording is "the entire thing should be a mod", so the mod mirrors every skill command (overview, add, done, edit, search, delete, next, send, list, categories) by the end of the release. The skill stays as the backup.
5. Saved prompts that start with `/` are allowed (no refusal). The README states what the spike found about how they are handled.
6. Accepted: plugin name `prompt-vault-mod`, release v1.1.0. After the work is tested, push to GitHub and publish v1.1.0 as a new GitHub release.
