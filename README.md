# Prompt Vault — a global Claude Code skill

A centralized, persistent vault for storing, organizing, and retrieving
prompts you intend to send later to AI tools (Claude Code, ChatGPT, or
anywhere else). Works globally across every Claude Code project on your
machine, in both the terminal and VS Code, and persists between sessions.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/raymondtian30/prompt-vault-skill/main/install.sh | bash
```

Or clone the repo and run `install.sh` locally:

```bash
git clone https://github.com/raymondtian30/prompt-vault-skill.git
cd prompt-vault-skill
bash install.sh
```

This writes two things into your real home directory:

- `~/.claude/skills/prompt-vault/SKILL.md` — the skill itself.
- `~/.claude/prompt-vault/` — your personal data store (created once; the
  installer never overwrites an existing `prompts.md`, so it's safe to
  re-run to pick up skill updates).

Then start a **new** Claude Code session (terminal or VS Code) and run
`/prompt-vault` to use it. Skills are read at session start, so an
already-open session won't pick it up until restarted.

## What it does

Organizes prompts into five categories — Claude Code, ChatGPT, Coding
Projects, Research, Other — each with a unique ID, title, category, the
complete original prompt text, a completion checkbox, and optional priority
and creation date. Prompt wording is preserved exactly unless you explicitly
ask for an edit.

### Commands

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

Natural language works too — "save this as a Claude Code prompt", "mark the
Token Savior prompt as done", "show me unfinished prompts", "find my prompt
about Code Explorer", "give me the next prompt I should send".

## Storage

Everything lives in plain Markdown under `~/.claude/prompt-vault/`:

- `prompts.md` — the database, one entry per prompt.
- `categories/` — optional per-category views, regenerated on demand.
- `README.md` — local usage docs (copied in by the installer).

Plain text, no dependencies, trivial to back up or move to another machine —
just copy the folder.

## Repo layout

```
skills/prompt-vault/SKILL.md       the skill Claude Code reads
prompt-vault-template/             clean template copied to ~/.claude/prompt-vault/ on first install
install.sh                         installer — writes both of the above into ~/.claude
```

## License

MIT — see [LICENSE](LICENSE).
