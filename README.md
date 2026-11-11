# Prompt Vault for Claude Code

A vault of saved prompts you can browse and run from inside Claude Code, in two parts that share one file:

- **`prompt-vault-mod`** — a Claude Code *mod*. A **Prompt Vault** button sits above the prompt box. It opens a menu where you browse, search, run, add, edit and remove prompts, group them into **projects**, and read built-in Help.
- **`prompt-vault` skill** — the original `/prompt-vault` commands, where Claude edits the file for you. Kept as a backup; it works without the mod.

Both read and write `~/.claude/prompt-vault/prompts.md` (plain markdown), so you can use either, or both. The vault is **global**: one file in your home folder, the same in every repo and every Claude Code session.

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

The default **user scope** is what you want: the mod then loads in every repo, not just one. Then **start a new Claude Code session** (VS Code, terminal or desktop). The **Prompt Vault** button appears above the prompt box. Type `/vault doctor` to confirm: it prints the mod version, the Claude Code version, the surfaces in use and whether your vault loads.

The marketplace tracks the default branch (`main`), which is kept releasable. The mod can read and write files, call GitHub for updates, and submit prompts, so read what you install: everything is in [`mod/`](mod/).

### Settings (all optional)

Open `/config`, or run `claude plugin configure prompt-vault-mod@prompt-vault-for-claude-code`.

| Setting | Default | What it does |
|---|---|---|
| `submitAsUser` | on | Run submits the prompt as your own words. Off: Claude sees "The Prompt Vault plugin sent a message: …". |
| `pageSize` | 5 | Prompts shown per page in the menu. |
| `vaultDir` | empty | Absolute folder holding `prompts.md`. Empty means `~/.claude/prompt-vault`. For testing against a copy. |

## Using the mod

Click **Prompt Vault**. The menu opens in a pane and the small launcher above the prompt box hides while the pane is open; close the pane (**Close**, or Esc) and the launcher returns. The menu offers:

- **Browse prompts** — cards with the title, project and priority. **Run** sends the whole saved prompt to Claude Code. **Remove** asks first. Click a title to open the prompt. Search (title, project, ID and the first 2,000 characters of each prompt; `/vault search` reads the whole text), All/Pending/Done filter, paging.
- **Projects** — create, rename and delete projects, open one to see only its prompts, and add prompts straight into it.
- **Run a prompt by ID** — type `P0001`, press Enter.
- **Add a prompt** — project is optional; your text is stored exactly as typed, code fences included.
- **Help** — every command, shortcut, setting, FAQ answer and troubleshooting tip, searchable.
- **Check for updates** — see [Updating](#updating).

On a prompt's page: **Run this prompt**, a **Project** picker to move it, **Put it in the prompt box** (loads it so you can edit it, or use `@file` and slash commands as typed), **Mark done / Mark pending**, **Edit**, **Remove**, and **Stop the turn** while a run is going.

**Projects.** A project is just a name that groups prompts ("Website", "Research"). It never picks an AI: any prompt can be run in Claude Code whatever its project. A prompt can have no project. Renaming a project renames it on every prompt in it. Deleting a project keeps its prompts and leaves them unfiled; only the name goes away. Projects with no prompts yet are listed on a `Projects:` line in the vault's header.

**IDs.** A new prompt takes the **lowest unused ID**, so if you delete `P0001`, the next prompt you add is `P0001`. (An ID you saw earlier can therefore point at a different prompt later.)

**What Run reports.** "Accepted by Claude Code" appears only after Claude Code takes the prompt (it starts its turn as soon as Claude is free). It does not mean Claude finished or understood it. If another plugin changes the text on the way, it says so. If Claude Code refuses, you see its reason. Run is disabled while Claude is working (nothing is queued), and a second press during a run is ignored. Run never changes the saved prompt and never marks it done; **Mark done** is separate.

### `/vault` commands

`/vault` with no argument opens the menu. The same operations as text:

| Command | What it does |
|---|---|
| `/vault overview` | Summary: totals, then prompts grouped by project. |
| `/vault list [pending\|done\|all] [<project>\|unfiled]` | One line per prompt, optionally one project. |
| `/vault search <query>` | Search title, project and prompt text. |
| `/vault next` | The next unfinished prompt (High before Medium before Low when several have a priority). |
| `/vault send <id>` | Open one prompt in full. |
| `/vault projects` | Your projects with counts, and how many prompts are unfiled. |
| `/vault project new\|rename\|delete <name>` | Create, rename (`old \| new`) or delete a project (`delete <name> confirm`). |
| `/vault done <id>` | Mark a prompt completed. |
| `/vault reopen <id>` | Mark it pending again. |
| `/vault add [<project>[:<priority>]] \| <title> \| <prompt text>` | Save a new prompt, optionally in a project. |
| `/vault edit <id> title\|project\|priority\|body <value>` | Change one field; `project clear` unfiles it. |
| `/vault delete <id> [confirm]` | Delete after confirmation. The ID becomes free. |
| `/vault run <id>` | Run (Execute) a prompt. |
| `/vault load <id>` | Put a prompt in the prompt box without sending it. |
| `/vault stop [confirm]` | Stop the turn Run started. |
| `/vault refresh` | Re-read `prompts.md`. |
| `/vault update [check]` | Look for a newer release on GitHub and install it. |
| `/vault help [search words]` | Searchable help. |
| `/vault doctor` | Versions, surfaces, vault path and problems. |

The syntax column is checked against the code by the test suite, so this table cannot silently drift.

## Updating

`/vault update` (or **Check for updates** in the menu, then **Install**) asks GitHub for the latest release of this repository. If it is newer than the installed version, it runs `claude plugin marketplace update prompt-vault-for-claude-code` and `claude plugin update prompt-vault-mod@prompt-vault-for-claude-code`, then tells you to start a new Claude Code session. `/vault update check` only looks. The two commands are fixed in the code; the only thing taken from the network is the version number it compares. It installs only when you ask, never in the background. Releases are cut from `main`, which is what the marketplace serves.

If your surface does not let a mod run commands, `/vault update` prints the two commands for you to run in a terminal. Without the mod, run those two commands by hand to update.

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
| `/prompt-vault search <query>` | Search prompts by title, project, or content |
| `/prompt-vault delete` | Delete a prompt |
| `/prompt-vault next` | Display the next unfinished prompt |
| `/prompt-vault send <id>` | Retrieve a prompt in its complete, copy-ready form |
| `/prompt-vault list` | List all prompts |
| `/prompt-vault projects` | Display projects with prompt counts |

`/prompt-vault` is the skill (Claude edits the file); `/vault` is the mod (menu, buttons, Run). Natural language also works with the skill: "save this in the Website project", "find my prompt about X".

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
- Project: Website
- Priority: High
- Created: 2026-11-09
- Status: pending

```text
<the complete, original, unedited prompt text>
```

---
````

`Project` and `Priority` are optional. Entries written by earlier versions have `- Category:` instead of `- Project:`; it is read as the project, and untouched entries are never rewritten (an entry you edit is saved with `- Project:`).

The fence around a prompt has N backticks, where N is one more than the longest run of backticks inside the prompt (at least 3), so a prompt containing a triple-backtick line cannot cut itself short. The skill and the mod both follow this rule. Entries written by older versions that were cut short are shown read-only as unsafe; Run, Edit and Remove refuse them until you fix the entry. Back up or move your vault by copying the folder. Before every change the mod writes `prompts.md.bak`.

## What works, what is partial, what is not supported

Verified in a real VS Code session (Claude Code 2.1.322): the button draws above the prompt box; the pane opens; button presses and typing reach the mod; submitting a multi-line prompt with a code fence, a tab and non-ASCII characters as the user works and arrives byte for byte.

| Status | Feature |
|---|---|
| Implemented, automated tests | Button and menu; browse, search, filter, paging; projects (create, rename, delete, move prompts, add into one); lowest-free ID reuse; run and run by ID with accepted/refused/failed reporting; duplicate-run prevention; busy block; put in prompt box; done/pending; add; edit; remove; Help; every `/vault` command handler (against a stand-in for Claude Code); guarded writes with backup; refusal of `/vault` commands that did not come from you typing them; the fence rule; the launcher hiding while the pane is open; the update check and install flow (with fake GitHub and fake commands). |
| Implemented, **not yet checked live by a person** | Each menu action against a real vault, projects on the real screen, Stop the turn, put in prompt box, **`/vault update` against real GitHub and the real `claude` CLI**, and the layout at your pane width. The checklist is [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md). |
| Partial | Layout was tuned without screenshots of every surface. Terminal and desktop are covered by automated mounts of the menu and launcher, not by eyes. `/vault update` depends on the surface letting a mod run commands (documented as CLI-only); otherwise it prints the two commands. |
| Not supported | Queuing a run behind a busy Claude (Run waits for idle); `@file` mentions and pasted images in a run (use *Put it in the prompt box*); editing a prompt over 100,000 characters in the menu (edit the file); Windows paths and `CLAUDE_CONFIG_DIR`; locking against another program writing `prompts.md` at the same moment; updating to a specific release rather than the latest. |

## Known limitations

- **Claude Code API drift.** Mods use an early-access API that "may change between releases". Tested with Claude Code 2.1.322 (VS Code) and CLI 2.1.308 (`claude plugin validate`, `claude plugin test`). A Claude Code update can break the mod; `/vault doctor` shows the running version.
- **Not atomic across programs.** The mod re-reads and compares before writing and keeps a backup, but it cannot stop the skill or an editor from saving the same moment.
- **Reused IDs.** Because a deleted prompt's ID is reused, an ID you wrote down can later mean a different prompt.
- **Narrow pane.** In VS Code the pane is about 34 columns wide, so the menu is a vertical stack.
- **Per session.** The "one run at a time" guard is per Claude Code session; two windows can both run.
- **A saved prompt that starts with `/`** is submitted as text; whether Claude Code then runs it as a slash command is Claude Code's behavior, not checked here.
- **The documentation says the above-prompt button is terminal and desktop only.** On VS Code 2.1.322 it draws anyway; a different build may not show it. Then `/vault` and the menu still work where a pane can draw.
- **Update trust.** `/vault update` installs whatever the marketplace (this repository's `main`) holds once a newer release exists.

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
scripts/make-icon.mjs              draws the plugin icon
install.sh, uninstall.sh           the skill's installer and remover
```

## License

MIT — see [LICENSE](LICENSE).
