#!/usr/bin/env bash
# Removes the prompt-vault skill. Leaves your data in ~/.claude/prompt-vault/ untouched.
set -euo pipefail

rm -rf "$HOME/.claude/skills/prompt-vault"
echo "Removed skill: $HOME/.claude/skills/prompt-vault"
echo "Your prompts are kept in $HOME/.claude/prompt-vault/ — delete that folder to remove them."
