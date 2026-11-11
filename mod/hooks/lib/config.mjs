// The mod's settings, mirrored from plugin.json userConfig (a mod cannot import JSON).
// tests/drift.test.mjs asserts this equals the manifest.
export const USER_CONFIG = {
  "submitAsUser": {
    "type": "boolean",
    "title": "Submit as you",
    "description": "Execute submits the prompt as your own words (on) instead of framed as \"The Prompt Vault plugin sent a message\" (off).",
    "default": true
  },
  "pageSize": {
    "type": "number",
    "title": "Prompts per page",
    "description": "How many prompts the menu shows at once.",
    "default": 5
  },
  "vaultDir": {
    "type": "string",
    "title": "Vault folder (testing override)",
    "description": "Absolute path of a folder holding prompts.md. Leave empty to use ~/.claude/prompt-vault.",
    "default": ""
  }
}

export const MOD_VERSION = '1.1.0'
