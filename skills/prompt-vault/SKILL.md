---
name: prompt-vault
description: Store, organize, search, and retrieve prompts the user intends to send later to AI tools (Claude Code, ChatGPT, etc). Use when the user invokes /prompt-vault (with or without a subcommand like add, done, edit, search, delete, next, send, list, projects), or says things like "save this as a prompt", "mark X prompt as done/completed", "show me my unfinished prompts", "find my prompt about X", "what's the next prompt I should send", or otherwise asks to save, retrieve, organize, or track reusable prompts.
---

# Prompt Vault

A global, cross-project, cross-session prompt manager. All data lives at
`~/.claude/prompt-vault/prompts.md` (plus docs in
`~/.claude/prompt-vault/README.md`). This is NOT project-local — never look
for or create a vault inside the current project directory. Always use the
absolute path under the user's home directory (`~/.claude/prompt-vault/`,
i.e. `$HOME/.claude/prompt-vault/`), regardless of which project or cwd this
session is running in.

The optional `prompt-vault-mod` Claude Code mod reads and writes this same
file under the same rules, so the skill and the mod can be used side by side.

On first use in a fresh environment where this path doesn't exist yet, create
it (directory + `prompts.md` with the header shown below + `README.md`)
before doing anything else. Otherwise, never
recreate or overwrite `prompts.md` wholesale — always read it first and make
targeted edits.

## First run

Before touching anything, check whether `~/.claude/prompt-vault/prompts.md`
exists. If not, create the directory structure and seed files (see "Data
file" below). Never clobber an existing, populated vault. Never require or
perform any project-specific install step. This skill must work identically
from any working directory.

## Data file

`~/.claude/prompt-vault/prompts.md` is the single source of truth. Format (shown inside a four-backtick fence so the entry's own fence is visible):

````
## [ ] P0001: Token Savior
- Project: Website
- Priority: High
- Created: 2026-11-09
- Status: pending

```text
<the complete, original, unedited prompt text>
```

---
````

Rules for this file:
- IDs are `P` + 4-digit zero-padded number (`P0001`, `P0002`, ...). **A new
  prompt takes the lowest unused ID**, so the ID of a deleted prompt is reused:
  with `P0002` and `P0003` present, the next prompt is `P0001`. There is no
  counter. An old header may still contain a `Next ID counter:` line; leave it
  alone and do not rely on it.
- Checkbox in the heading: `[ ]` pending, `[x]` completed. This is the single
  source of truth for completion — keep the `Status:` line in sync with it
  (`pending`/`completed`) but the checkbox is canonical.
- `Project` is optional: a free-form name the user chooses (one line, no
  commas, up to 60 characters) that groups prompts. A project never picks an AI
  or tool; the prompt can be used anywhere. Omit the line for an unfiled
  prompt. If the user doesn't name a project when adding, leave it unfiled
  (offer the existing projects). Older entries may have `- Category:` instead;
  read it as the project, and write `- Project:` when you edit that entry.
- A project with no prompts yet is listed on one header line above the START
  marker, `Projects: Alpha, Beta` (comma-separated). A project also exists
  whenever any entry uses it.
- `Priority` is optional — omit the line entirely if not given. Valid values
  if present: High, Medium, Low.
- `Created` is required, an ISO date. Fill it in with today's date when a
  prompt is added, unless the user gives a different date.
- The prompt text goes verbatim inside a fenced code block, opened by a line
  of N backticks followed by `text` and closed by a line of at least N
  backticks. **N is one more than the longest run of backticks anywhere in
  the prompt, and at least 3** — a prompt that contains a ` ``` ` line gets a
  four-backtick fence, so the prompt cannot close its own fence early. The
  stored prompt is exactly the text between the opening fence line and the
  closing fence line: no trimming, no added or removed blank lines, original
  line endings kept. Formatting, indentation, and nested code blocks inside
  the prompt are preserved exactly. **Never summarize, shorten, rewrite, or
  "clean up" the wording** — preserve it exactly as given unless the user
  explicitly asks for an edit.
- The entry heading is exactly `## [ ] P0001: Title` or `## [x] P0001: Title`;
  the title is everything after the first `: `. Metadata lines come next
  (`Project` if set, `Priority` if set, `Created`, `Status`); unknown `- Key: value`
  lines are left untouched. A `---` line or a `## [ ] P…` line inside the
  fence is part of the prompt, not the start of a new entry.
- Entries live between the `<!-- PROMPTS START -->` and `<!-- PROMPTS END -->`
  lines; new entries go immediately before the END line (at the end of the
  file if it is missing). The header `Projects:` line is read only above the
  START line.
- An older entry whose prompt contains a ` ``` ` line may have been cut short
  by its own fence. If you see one (text after the closing fence that is not
  `---`), tell the user and offer to lengthen that entry's fence; do not guess
  where the prompt ends.
- Separate entries with a `---` line.
- Read the file with Read, and make changes with Edit (exact string
  replacement) rather than rewriting the whole file, so unrelated entries are
  never touched. Only use Write for the very first creation of `prompts.md`.

## Commands

Dispatch on the subcommand after `/prompt-vault`, or on the equivalent
natural-language request. In all cases, read `prompts.md` first to get
current state before acting.

### `/prompt-vault` (no args) — overview
Show, in the reply (not a file):
1. Summary line: total prompts, completed count, pending count.
2. Grouped by project (unfiled prompts last), each prompt shown as
   `[ ]`/`[x]` + ID + title (+ priority if set). Keep this scannable — title and ID per line, not
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
3. Determine the project: use the one the user names (matching an existing
   project's name ignoring case); if none is named, leave the prompt unfiled.
   Do not invent one.
4. Priority/date: ask only if the user seems to want them tracked; otherwise
   leave priority unset and default created-date to today.
5. Assign the lowest unused ID and append a new entry before
   `<!-- PROMPTS END -->`.
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
2. Apply only the specific change the user asks for (title, project,
   priority, or the prompt text itself). Moving a prompt to another project,
   or out of its project, is an edit. Never rewrite parts they didn't ask
   to change.
3. If they ask to edit the prompt text itself, confirm the new text with them
   before applying if it's a substantial rewrite; a small stated correction
   can just be applied.

### `/prompt-vault search <query>` [or "find my prompt about X"]
Search title, project, and full prompt text (case-insensitive substring or
close match) across all entries. Return matches as ID + title + project,
with enough surrounding context to disambiguate if there are several. If
nothing matches, say so plainly — don't guess.

### `/prompt-vault delete`
1. Resolve the prompt (by ID or title).
2. Confirm with the user before deleting (this is destructive, and the ID
   will be reused by the next prompt added, so get it right) unless they've clearly already confirmed
   in the same request (e.g. "delete P0003, I'm sure").
3. Remove the entire entry (heading through the trailing `---`). Do not
   renumber the other prompts; the freed ID is simply the lowest unused one
   for the next prompt you add.

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
prompt: checkbox, ID, title, project, priority if set. Can be limited to one
project. No full text unless asked.

### `/prompt-vault projects`
List the projects with a count of prompts in each from the current file, and
the number of unfiled prompts. The user can also ask to create a project (add
it to the header `Projects:` line), rename one (change the header line and every
entry that uses it), or delete one (remove it from the header line and from the
entries that use it, which then become unfiled — the prompts themselves are
kept; confirm first).

## Natural-language routing

Map intent to the commands above even when the user doesn't type a slash
command:
- "Save this in the Website project." → add, project=Website
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
  and give a new prompt the lowest unused ID (never one that is in use).
- If `prompts.md` is somehow missing or corrupted when this skill is invoked,
  say so and offer to recreate the structure (losing nothing you can still
  read — try to salvage any readable entries first) rather than silently
  overwriting.
