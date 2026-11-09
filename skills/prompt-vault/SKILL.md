---
name: prompt-vault
description: Store, organize, search, and retrieve prompts the user intends to send later to AI tools (Claude Code, ChatGPT, etc). Use when the user invokes /prompt-vault (with or without a subcommand like add, done, edit, search, delete, next, send, list, categories), or says things like "save this as a prompt", "mark X prompt as done/completed", "show me my unfinished prompts", "find my prompt about X", "what's the next prompt I should send", or otherwise asks to save, retrieve, organize, or track reusable prompts.
---

# Prompt Vault

A global, cross-project, cross-session prompt manager. All data lives at
`~/.claude/prompt-vault/prompts.md` (plus optional per-category views in
`~/.claude/prompt-vault/categories/` and docs in
`~/.claude/prompt-vault/README.md`). This is NOT project-local — never look
for or create a vault inside the current project directory. Always use the
absolute path under the user's home directory (`~/.claude/prompt-vault/`,
i.e. `$HOME/.claude/prompt-vault/`), regardless of which project or cwd this
session is running in.

On first use in a fresh environment where this path doesn't exist yet, create
it (directory + `prompts.md` with the header shown below + empty
`categories/` + `README.md`) before doing anything else. Otherwise, never
recreate or overwrite `prompts.md` wholesale — always read it first and make
targeted edits.

## Before implementing / on first invocation ever

The first time this skill is invoked in a given environment, before touching
anything:
1. Check whether `~/.claude/skills/prompt-vault/` and
   `~/.claude/prompt-vault/` already exist and are populated, to avoid
   duplicating setup work or clobbering existing prompts.
2. Check whether `~/.claude/prompt-vault/prompts.md` exists. If not, create
   the directory structure and seed files (see "Data file" below).
3. Never require or perform any project-specific install step. This skill
   must work identically from any working directory.

## Data file

`~/.claude/prompt-vault/prompts.md` is the single source of truth. Format:

```
## [ ] P0001: Token Savior
- Category: Claude Code
- Priority: High
- Created: 2026-11-09
- Status: pending

```text
<the complete, original, unedited prompt text>
```

---
```

Rules for this file:
- IDs are `P` + 4-digit zero-padded sequence (`P0001`, `P0002`, ...), assigned
  in increasing order, **never reused** even after a delete. Track the next
  free number via the "Next ID counter" line near the top of the file, and
  update that line every time you assign one.
- Checkbox in the heading: `[ ]` pending, `[x]` completed. This is the single
  source of truth for completion — keep the `Status:` line in sync with it
  (`pending`/`completed`) but the checkbox is canonical.
- `Category` must be one of: Claude Code, ChatGPT, Coding Projects, Research,
  Other. If the user doesn't specify one when adding a prompt, ask which
  category it belongs to (or infer from context and confirm) rather than
  defaulting silently.
- `Priority` is optional — omit the line entirely if not given. Valid values
  if present: High, Medium, Low (or whatever scale the user uses — don't
  force it, just be consistent within the file).
- `Created` is optional, an ISO date. Fill it in with today's date when a
  prompt is added, unless the user gives a different date.
- The prompt text goes verbatim inside a fenced code block (use ` ```text `
  or match the content's own language if it's clearly code) so formatting,
  indentation, and any nested code blocks inside the prompt are preserved
  exactly. **Never summarize, shorten, rewrite, or "clean up" the wording** —
  preserve it exactly as given unless the user explicitly asks for an edit.
- Separate entries with a `---` line.
- Read the file with Read, and make changes with Edit (exact string
  replacement) rather than rewriting the whole file, so unrelated entries are
  never touched. Only use Write for the very first creation of the file.

## Commands

Dispatch on the subcommand after `/prompt-vault`, or on the equivalent
natural-language request. In all cases, read `prompts.md` first to get
current state before acting.

### `/prompt-vault` (no args) — overview
Show, in the reply (not a file):
1. Summary line: total prompts, completed count, pending count.
2. Grouped by category, each prompt shown as `[ ]`/`[x]` + ID + title
   (+ priority if set). Keep this scannable — title and ID per line, not
   the full prompt text.
3. A one-line reminder of how to retrieve full text (`/prompt-vault send <id>`).

### `/prompt-vault add` [or "save this as a prompt", "add a prompt"]
1. Determine the prompt text: if the user just gave/pasted it in this turn,
   use that verbatim. If they say "save this" referring to something earlier
   in the conversation (e.g. a prompt they drafted together with you, or
   text they pasted a few turns back), use that exact text — do not
   re-derive or rephrase it from memory of what it meant.
2. Determine title: ask, or propose a short descriptive title derived from
   the content and confirm with the user if it's not obvious.
3. Determine category: ask if not stated, offering the five valid categories.
4. Priority/date: ask only if the user seems to want them tracked; otherwise
   leave priority unset and default created-date to today.
5. Assign the next ID from the counter, append a new entry before
   `<!-- PROMPTS END -->`, bump the counter line.
6. Confirm back with the assigned ID and title (not the full text again).

### `/prompt-vault done` [or "mark X as completed/done"]
1. Resolve which prompt: by ID if given, else by title match (fuzzy ok, but
   confirm if more than one plausible match).
2. Flip `[ ]` → `[x]` in the heading and `Status: pending` → `Status:
   completed`. This is the ONLY trigger for marking complete — never do this
   automatically because a prompt was displayed, sent, or copied.
3. Support the reverse too ("reopen", "mark as not done", "undo complete"):
   flip back to `[ ]` / `pending`.

### `/prompt-vault edit`
1. Resolve the prompt (by ID or title, as above).
2. Apply only the specific change the user asks for (title, category,
   priority, or the prompt text itself). Never rewrite parts they didn't ask
   to change.
3. If they ask to edit the prompt text itself, confirm the new text with them
   before applying if it's a substantial rewrite; a small stated correction
   can just be applied.

### `/prompt-vault search <query>` [or "find my prompt about X"]
Search title, category, and full prompt text (case-insensitive substring or
close match) across all entries. Return matches as ID + title + category,
with enough surrounding context to disambiguate if there are several. If
nothing matches, say so plainly — don't guess.

### `/prompt-vault delete`
1. Resolve the prompt (by ID or title).
2. Confirm with the user before deleting (this is destructive and IDs are
   never reused, so get it right) unless they've clearly already confirmed
   in the same request (e.g. "delete P0003, I'm sure").
3. Remove the entire entry (heading through the trailing `---`). Do not
   renumber or reuse its ID for anything else.

### `/prompt-vault next` [or "what's the next prompt I should send"]
1. Find the first pending (`[ ]`) prompt, in file order (oldest/lowest ID
   first), unless the user has a stated priority preference — if several
   pending prompts have an explicit Priority set, prefer High > Medium > Low
   before falling back to file order.
2. Display it in full, copy-ready form (same as `send`).
3. Do NOT mark it completed just because it was shown.

### `/prompt-vault send <id>` [or "give me prompt P0003", "retrieve the Token Savior prompt"]
1. Resolve the ID (or title if no ID given — confirm if ambiguous).
2. Output the complete prompt text, verbatim, formatted so it's trivial to
   select and copy into another AI tool: put it in its own fenced code block
   in your reply, with no added commentary inside the block, no summarizing,
   no truncation. A short line above/below the block (title, ID) is fine.
3. Never mark it completed as a side effect of sending it.

### `/prompt-vault list` [or "list all prompts", "show me unfinished prompts"]
Flat or filtered list (e.g. "unfinished" → only `[ ]` entries). One line per
prompt: checkbox, ID, title, category, priority if set. No full text unless
asked.

### `/prompt-vault categories`
List the five valid categories with a count of prompts in each from the
current file. Optionally, if the user wants persistent per-category views,
write/update the matching file under `~/.claude/prompt-vault/categories/`
(e.g. `claude-code.md`) by extracting that category's entries — but treat
`prompts.md` as the only authoritative copy; regenerate these on demand
rather than maintaining them incrementally.

## Natural-language routing

Map intent to the commands above even when the user doesn't type a slash
command:
- "Save this as a Claude Code prompt." → add, category=Claude Code
- "Mark the Token Savior prompt as completed." → done, resolve by title
- "Show me all unfinished prompts." → list, filter=pending
- "Find my prompt about Code Explorer." → search
- "Give me the next prompt I should send." → next

## General rules (apply to every command)

- Never auto-mark anything completed except via an explicit user request to
  mark it done/completed/finished.
- Never summarize, shorten, or rewrite stored prompt text when displaying or
  retrieving it — exact reproduction only. Edits to wording happen only when
  explicitly requested, via `edit`.
- Never silently drop existing prompts when adding new ones — always read
  current content before appending/editing, use Edit for targeted changes,
  and never reuse an ID.
- If `prompts.md` is somehow missing or corrupted when this skill is invoked,
  say so and offer to recreate the structure (losing nothing you can still
  read — try to salvage any readable entries first) rather than silently
  overwriting.
