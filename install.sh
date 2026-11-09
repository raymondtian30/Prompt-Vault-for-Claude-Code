#!/usr/bin/env bash
# Installs the prompt-vault Claude Code skill + data store into ~/.claude
# Safe to re-run: won't overwrite an existing prompts.md, and backs up a
# modified SKILL.md / README.md before replacing it.
# Works from a clone (copies local files) or via `curl | bash` (downloads them).
set -euo pipefail

# Version this script was released with; override with PROMPT_VAULT_REF=main for latest.
REF="${PROMPT_VAULT_REF:-v1.0.1}"
REPO_RAW="https://raw.githubusercontent.com/raymondtian30/Prompt-Vault-for-Claude-Code/$REF"
SKILL_DIR="$HOME/.claude/skills/prompt-vault"
VAULT_DIR="$HOME/.claude/prompt-vault"

# Locate source files: local clone if present, else download to a temp dir.
SRC=""
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [ -f "$here/skills/prompt-vault/SKILL.md" ] && [ -f "$here/prompt-vault-template/prompts.md" ]; then
    SRC="$here"
  fi
fi
if [ -z "$SRC" ]; then
  SRC="$(mktemp -d)"
  trap 'rm -rf "$SRC"' EXIT
  mkdir -p "$SRC/skills/prompt-vault" "$SRC/prompt-vault-template"
  for f in skills/prompt-vault/SKILL.md prompt-vault-template/prompts.md prompt-vault-template/README.md; do
    curl -fsSL "$REPO_RAW/$f" -o "$SRC/$f"
  done
fi

# install_file SRC DEST: copy, backing up DEST first if it exists and differs.
install_file() {
  if [ -f "$2" ] && ! cmp -s "$1" "$2"; then
    cp "$2" "$2.bak"
    echo "Backed up existing $2 -> $2.bak"
  fi
  cp "$1" "$2"
}

mkdir -p "$SKILL_DIR" "$VAULT_DIR"

install_file "$SRC/skills/prompt-vault/SKILL.md" "$SKILL_DIR/SKILL.md"

if [ ! -f "$VAULT_DIR/prompts.md" ]; then
  cp "$SRC/prompt-vault-template/prompts.md" "$VAULT_DIR/prompts.md"
  echo "Created $VAULT_DIR/prompts.md"
else
  echo "$VAULT_DIR/prompts.md already exists — left untouched"
fi

install_file "$SRC/prompt-vault-template/README.md" "$VAULT_DIR/README.md"

echo ""
echo "Prompt Vault installed:"
echo "  Skill:  $SKILL_DIR/SKILL.md"
echo "  Data:   $VAULT_DIR/"
echo ""
echo "Start a NEW Claude Code session (terminal or VS Code) and run /prompt-vault to use it."
