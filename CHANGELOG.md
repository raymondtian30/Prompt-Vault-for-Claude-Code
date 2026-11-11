# Changelog

## v1.1.0 — 2026-11-10

- **New: `prompt-vault-mod`, a Claude Code mod** (`mod/`). A Prompt Vault button above the prompt box opens a menu: browse, search, filter, run, run by ID, add, edit, remove, mark done, put a prompt in the prompt box, and searchable Help. Also `/vault` with the same operations as text commands. Install through the new marketplace file (`.claude-plugin/marketplace.json`) at user scope, so it works in every repo. The small launcher hides while the pane is open.
- **Projects replace categories.** A project is a free-form name that groups prompts (create, rename, delete, move a prompt, add into one). It never picks an AI, so Run no longer asks for confirmation by category and the five fixed categories are gone. A prompt may have no project. Deleting a project keeps its prompts, unfiled. Entries written with `- Category:` are read as projects; untouched entries are not rewritten. The skill's `/prompt-vault categories` is now `/prompt-vault projects`.
- **IDs are reused.** A new prompt takes the lowest unused ID, so after deleting `P0001` the next prompt is `P0001`. The `Next ID counter` line is no longer used. This replaces the old "IDs are never reused" rule in the skill, the template and the docs.
- **`/vault update`**: looks up the newest GitHub release and installs it (`claude plugin marketplace update` then `claude plugin update`), only when asked. `/vault update check` only looks.
- **Run (Execute)** submits the complete saved prompt through Claude Code's own prompt path and reports "accepted" only after Claude Code takes it. It is blocked while Claude is working, ignores duplicate presses, shows refusals with Claude Code's reason, and never changes the saved prompt.
- **Help** is generated from one operation registry; tests fail if the registry, `SKILL.md`, the READMEs or the manifest settings drift apart.
- **Fix (skill and template): the fence rule.** A prompt containing a triple-backtick line used to close its own entry early, silently truncating it. Prompts now sit in a fence one backtick longer than the longest run inside them. Entries cut short by the old behavior are flagged read-only instead of guessed.
- **Guarded writes** by the mod: re-read and compare before writing, change only the touched entry (or, for a project rename or delete, only the entries in it), `prompts.md.bak` first, verify after.
- Tests: 160+ logic tests (`npm test`), 17 mod-level tests (`claude plugin test mod`), CI job for the logic tests.
- `install.sh` pins v1.1.0; `uninstall.sh` points at the mod's uninstall command.
- Known limits: early-access mod API, not atomic against other programs, 34-column pane in VS Code, `/vault update` untested against real GitHub. See the README.

## v1.0.1 — 2026-11-09

- Fix shellcheck SC2088 in `install.sh` so CI passes; pins updated to v1.0.1.

## v1.0.0 — 2026-11-09

- Installer copies `skills/` and `prompt-vault-template/` instead of embedding duplicate heredocs; downloads them when run via `curl | bash`.
- Installer backs up a modified `SKILL.md` / vault `README.md` to `.bak` before replacing.
- Install URL pinned to a release tag (`PROMPT_VAULT_REF` overrides); fixed repo name in URLs.
- Removed the `categories/` per-category view feature.
- Added `uninstall.sh` (keeps user data).
- Skill: renamed "First run", `Created` required, priority fixed to High/Medium/Low, ID counter recovery rule.
- Added CI (shellcheck + syntax check).
