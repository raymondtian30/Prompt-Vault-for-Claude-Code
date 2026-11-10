# Prompt Vault for Claude Code

A vault of saved prompts you can browse and run from inside Claude Code, in two parts that share one file:

- **`prompt-vault-mod`** — a Claude Code *mod*. A **Prompt Vault** button sits above the prompt box. It opens a menu where you browse, search, run, add, edit and remove prompts, with built-in Help.
- **`prompt-vault` skill** — the original `/prompt-vault` commands, where Claude edits the file for you. Kept as a backup; it works without the mod.

Both read and write `~/.claude/prompt-vault/prompts.md` (plain markdown), so you can use either, or both.

## Install the mod

Needs Claude Code 2.1.322 or later. From a shell:

```bash
claude plugin marketplace add raymondtian30/Prompt-Vault-for-Claude-Code
claude plugin install prompt-vault-mod@prompt-vault-for-claude-code
```

Or in a terminal Claude Code session:

```
/plugin install prompt-vault-mod --marketplace raymondtian30/Prompt-Vault-for-Claude-Code
```

Then **start a new Claude Code session** (VS Code, terminal or desktop). The **Prompt Vault** button appears above the prompt box. Type `/vault doctor` to confirm: it prints the mod version, the Claude Code version, the surfaces in use and whether your vault loads.

The marketplace tracks the default branch (`main`), which is kept releasable. The mod can read and write files and submit prompts, so read what you install: everything is in [`mod/`](mod/).

### Settings (all optional)

Open `/config`, or run `claude plugin configure prompt-vault-mod@prompt-vault-for-claude-code`.

| Setting | Default | What it does |
|---|---|---|
| `submitAsUser` | on | Run submits the prompt as your own words. Off: Claude sees "The Prompt Vault plugin sent a message: …". |
| `confirmNonClaudeCodeCategories` | on | Ask before Run sends a ChatGPT, Research, Coding Projects or Other prompt to Claude Code. |
| `pageSize` | 5 | Prompts shown per page in the menu. |
| `vaultDir` | empty | Absolute folder holding `prompts.md`. Empty means `~/.claude/prompt-vault`. For testing against a copy. |

## Using the mod

Click **Prompt Vault** (click again to close). The menu offers:

- **Browse prompts** — cards with the title, category and priority. **Run** sends the whole saved prompt to Claude Code. **Remove** asks first. Click a title to open the prompt. Search, All/Pending/Done filter, paging.
- **Run a prompt by ID** — type `P0001`, press Enter.
- **Add a prompt** — category is required (no default); your text is stored exactly as typed, code fences included.
- **Help** — every command, shortcut, setting, FAQ answer and troubleshooting tip, searchable.

On a prompt's page: **Run this prompt**, **Put it in the prompt box** (loads it so you can edit it, or use `@file` and slash commands as typed), **Mark done / Mark pending**, **Edit**, **Remove**, and **Stop the turn** while a run is going.

**What Run reports.** "Accepted by Claude Code" appears only after Claude Code takes the prompt and starts a turn for it. It does not mean Claude finished or understood it. If another plugin changes the text on the way, it says so. If Claude Code refuses, you see its reason. Run is disabled while Claude is working (nothing is queued), and a second press during a run is ignored. Run never changes the saved prompt and never marks it done; **Mark done** is separate.

### `/vault` commands

`/vault` with no argument opens the menu. The same operations as text:

| Command | What it does |
|---|---|
| `/vault overview` | Summary: totals, then prompts grouped by category. |
| `/vault list [pending\|done\|all]` | One line per prompt. |
| `/vault search <query>` | Search title, category and prompt text. |
| `/vault next` | The next unfinished prompt (High before Medium before Low when several have a priority). |
| `/vault send <id>` | Open one prompt in full. |
| `/vault categories` | The five categories with counts. |
| `/vault done <id>` | Mark a prompt completed. |
| `/vault reopen <id>` | Mark it pending again. |
| `/vault add <category>[:<priority>] \| <title> \| <prompt text>` | Save a new prompt. |
| `/vault edit <id> title\|category\|priority\|body <value>` | Change one field. |
| `/vault delete <id> [confirm]` | Delete after confirmation. IDs are never reused. |
| `/vault run <id>` | Run (Execute) a prompt. |
| `/vault load <id>` | Put a prompt in the prompt box without sending it. |
| `/vault stop [confirm]` | Stop the turn Run started. |
| `/vault refresh` | Re-read `prompts.md`. |
| `/vault help [search words]` | Searchable help. |
| `/vault doctor` | Versions, surfaces, vault path and problems. |

The syntax column is checked against the code by the test suite, so this table cannot silently drift.

## The skill (backup)

```bash
curl -fsSL https://raw.githubusercontent.com/raymondtian30/Prompt-Vault-for-Claude-Code/v1.1.0/install.sh | bash
```

Or clone the repo and run `bash install.sh`. It writes `~/.claude/skills/prompt-vault/SKILL.md` and creates `~/.claude/prompt-vault/` (never overwriting an existing `prompts.md`). Start a **new** Claude Code session and run `/prompt-vault`.

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

`/prompt-vault` is the skill (Claude edits the file); `/vault` is the mod (menu, buttons, Run). Natural language also works with the skill: "save this as a Claude Code prompt", "find my prompt about X".

## Uninstall

```bash
claude plugin uninstall prompt-vault-mod@prompt-vault-for-claude-code   # the mod
bash uninstall.sh                                                       # the skill
```

Your prompts in `~/.claude/prompt-vault/` are kept by both; delete that folder yourself to remove them.

## Storage

Plain markdown in `~/.claude/prompt-vault/prompts.md`, one entry per prompt:

````
## [ ] P0001: Token Savior
- Category: Claude Code
- Priority: High
- Created: 2026-11-09
- Status: pending

```text
<the complete, original, unedited prompt text>
```

---
````

The fence around a prompt has N backticks, where N is one more than the longest run of backticks inside the prompt (at least 3), so a prompt containing a triple-backtick line cannot cut itself short. The skill and the mod both follow this rule. Entries written by older versions that were cut short are shown read-only as unsafe; Run, Edit and Remove refuse them until you fix the entry. Back up or move your vault by copying the folder. Before every change the mod writes `prompts.md.bak`.

## What works, what is partial, what is not supported

Verified in a real VS Code session (Claude Code 2.1.322): the button draws above the prompt box; the pane opens; button presses and typing reach the mod; submitting a multi-line prompt with a code fence, a tab and non-ASCII characters as the user works and arrives byte for byte.

| Status | Feature |
|---|---|
| Implemented, automated tests | Button and menu; browse, search, filter, paging; run and run by ID with accepted/refused/failed reporting; duplicate-run prevention; busy block; confirmation for non-Claude-Code prompts; put in prompt box; done/pending; add; edit; remove; Help; every `/vault` command; guarded writes with backup; the fence rule. |
| Implemented, **not yet checked live by a person** | Each menu action against a real vault, Stop the turn, put in prompt box, the confirmation flow, and the layout at your pane width. The checklist is [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md). |
| Partial | Layout was tuned without screenshots of every surface. Terminal and desktop are covered by automated mounts, not by eyes. |
| Not supported | Queuing a run behind a busy Claude (Run waits for idle); `@file` mentions and pasted images in a run (use *Put it in the prompt box*); editing a prompt over 100,000 characters in the menu (edit the file); Windows paths and `CLAUDE_CONFIG_DIR`; locking against another program writing `prompts.md` at the same moment. |

## Known limitations

- **Claude Code API drift.** Mods use an early-access API that "may change between releases". Tested with Claude Code 2.1.322 (VS Code) and CLI 2.1.308 (`claude plugin validate`, `claude plugin test`). A Claude Code update can break the mod; `/vault doctor` shows the running version.
- **Not atomic across programs.** The mod re-reads and compares before writing and keeps a backup, but it cannot stop the skill or an editor from saving the same moment.
- **Narrow pane.** In VS Code the pane is about 34 columns wide, so the menu is a vertical stack.
- **Per session.** The "one run at a time" guard is per Claude Code session; two windows can both run.
- **A saved prompt that starts with `/`** is submitted as text; whether Claude Code then runs it as a slash command is Claude Code's behavior, not checked here.
- **The documentation says the above-prompt button is terminal and desktop only.** On VS Code 2.1.322 it draws anyway; a different build may not show it. Then `/vault` and the menu still work where a pane can draw.

## Develop

```bash
npm test                      # logic tests (node --test), no dependencies
claude plugin test mod        # mod-level tests on terminal, desktop, vscode
claude plugin validate mod    # manifest and hooks
claude plugin validate .      # marketplace
```

```
.claude-plugin/marketplace.json    marketplace entry for the mod
mod/                               the mod (hooks/register.tsx, hooks/ui, hooks/lib, tests)
skills/prompt-vault/SKILL.md       the skill (backup)
prompt-vault-template/             seed prompts.md and README for ~/.claude/prompt-vault/
tests/                             logic tests and drift checks against SKILL.md and these docs
docs/designs/                      design and brainstorm brief
docs/ACCEPTANCE.md                 manual live checklist
install.sh, uninstall.sh           the skill's installer and remover
```

## License

MIT — see [LICENSE](LICENSE).
