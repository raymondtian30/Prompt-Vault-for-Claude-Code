# Prompt Vault

A global, persistent store for prompts you intend to send to AI tools later
(Claude Code, ChatGPT, or anywhere else). Lives outside any single project at
`~/.claude/prompt-vault/`, so it's available from every Claude Code session —
terminal or VS Code — on this machine.

## Files

- `prompts.md` — the main database. One `## ` section per prompt, each with
  a completion checkbox, metadata, and the full original prompt text in a
  fenced code block.
- `README.md` — this file.

## Using it

The vault is driven by the `prompt-vault` skill
(`~/.claude/skills/prompt-vault/SKILL.md`). In any Claude Code session, type:

```
/prompt-vault
```

to see a summary of everything stored, or use a subcommand:

| Command | Function |
|---|---|
| `/prompt-vault` | Display all saved prompts |
| `/prompt-vault add` | Add a new prompt |
| `/prompt-vault done` | Mark a prompt as completed |
| `/prompt-vault edit` | Edit an existing prompt |
| `/prompt-vault search <query>` | Search prompts by title, category, or content |
| `/prompt-vault delete` | Delete a prompt |
| `/prompt-vault next` | Display the next unfinished prompt |
| `/prompt-vault send <id>` | Retrieve a prompt in its complete, copy-ready form |
| `/prompt-vault list` | List all prompts |
| `/prompt-vault categories` | Display available categories |

You can also just talk naturally — "save this as a Claude Code prompt",
"mark the Token Savior prompt as done", "show me unfinished prompts" — and
Claude will route it to the right action.

## Data format

Each entry in `prompts.md` looks like this (shown inside a four-backtick
fence so the entry's own fence is visible):

````
## [ ] P0001: Token Savior
- Category: Claude Code
- Priority: High
- Created: 2026-11-09
- Status: pending

```text
<the complete, original, unedited prompt text goes here>
```

---
````

The fence around a prompt has N backticks, where N is one more than the
longest run of backticks inside the prompt (at least 3), so a prompt that
contains a ` ``` ` line cannot cut itself short. The stored prompt is exactly
the text between the opening and closing fence lines.

IDs are zero-padded and never reused. Prompt wording is preserved exactly as
given unless you explicitly ask for an edit. A prompt is only ever marked
completed when you explicitly say so — never just because it was viewed or
copied.

## Backup / migration

Everything lives in plain Markdown under `~/.claude/prompt-vault/`. Back it up
or move it to another machine by copying that one folder.
