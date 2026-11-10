# Changelog

## v1.1.0 — 2026-11-10

- **New: `prompt-vault-mod`, a Claude Code mod** (`mod/`). A Prompt Vault button above the prompt box opens a menu: browse, search, filter, run, run by ID, add, edit, remove, mark done, put a prompt in the prompt box, and searchable Help. Also `/vault` with the same operations as text commands. Install through the new marketplace file (`.claude-plugin/marketplace.json`).
- **Run (Execute)** submits the complete saved prompt through Claude Code's own prompt path and reports "accepted" only after Claude Code takes it. It is blocked while Claude is working, ignores duplicate presses, asks first for non-Claude-Code categories, shows refusals with Claude Code's reason, and never changes the saved prompt.
- **Help** is generated from one operation registry; tests fail if the registry, `SKILL.md`, the READMEs or the manifest settings drift apart.
- **Fix (skill and template): the fence rule.** A prompt containing a triple-backtick line used to close its own entry early, silently truncating it. Prompts now sit in a fence one backtick longer than the longest run inside them. Entries cut short by the old behavior are flagged read-only instead of guessed.
- **Guarded writes** by the mod: re-read and compare before writing, change only the touched entry, `prompts.md.bak` first, verify after.
- Tests: 130+ logic tests (`npm test`), 10 mod-level tests (`claude plugin test mod`), CI job for the logic tests.
- `install.sh` pins v1.1.0; `uninstall.sh` points at the mod's uninstall command.
- Known limits: early-access mod API, not atomic against other programs, 34-column pane in VS Code. See the README.

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
