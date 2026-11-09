# Changelog

## v1.0.0 — 2026-11-09

- Installer copies `skills/` and `prompt-vault-template/` instead of embedding duplicate heredocs; downloads them when run via `curl | bash`.
- Installer backs up a modified `SKILL.md` / vault `README.md` to `.bak` before replacing.
- Install URL pinned to a release tag (`PROMPT_VAULT_REF` overrides); fixed repo name in URLs.
- Removed the `categories/` per-category view feature.
- Added `uninstall.sh` (keeps user data).
- Skill: renamed "First run", `Created` required, priority fixed to High/Medium/Low, ID counter recovery rule.
- Added CI (shellcheck + syntax check).
