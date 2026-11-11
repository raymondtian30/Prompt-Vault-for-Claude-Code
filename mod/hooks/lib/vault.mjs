// Vault file access over an injected fs. Pure: no import from `claude-code`.
// `fs` is { read(path), stat(path), write(path, text) } (the mod passes $.fs).
import { parseVault } from './grammar.mjs'

export const MAX_READ_BYTES = 4 * 1024 * 1024

// Must equal prompt-vault-template/prompts.md byte for byte (tests/drift.test.mjs).
export const SEED = "# Prompt Vault Database\n\nThis file is the single source of truth for all stored prompts. Each prompt is\na level-2 section (`## `) so entries can be located and edited reliably with\nexact-string replacements. Do not reformat or \"clean up\" existing entries —\nonly add, edit, or remove the specific entry requested.\n\nCheckbox legend: `[ ]` = pending, `[x]` = completed.\n\nA project is any name you choose, and a prompt may have none. A project with no\nprompts yet is listed on a line starting with the word Projects and a colon, in\nthis header (comma-separated).\n\nIDs: a new prompt takes the lowest unused ID, so the ID of a deleted prompt is reused.\n\nFence rule: each prompt sits in a fence of N backticks (N = longest backtick\nrun inside the prompt + 1, minimum 3), closed by a line of at least N backticks.\n\n<!-- PROMPTS START -->\n<!-- PROMPTS END -->\n"

/**
 * Where the vault lives. `vaultDir` overrides the default; with no HOME and no override
 * the vault is disabled (never a project-relative fallback).
 * @param {{ home?: string, vaultDir?: string }} o
 */
export function resolveVaultPath({ home, vaultDir }) {
  let dir
  if (vaultDir && vaultDir.trim() !== '') {
    dir = vaultDir.trim()
    if (!dir.startsWith('/')) {
      return { ok: false, error: 'bad-vault-dir', message: 'The vaultDir option must be an absolute path.' }
    }
    dir = dir.replace(/\/+$/, '')
  } else if (home && home !== '') {
    dir = home.replace(/\/+$/, '') + '/.claude/prompt-vault'
  } else {
    return {
      ok: false,
      error: 'no-home',
      message: 'HOME is not set, so the vault folder cannot be found. Set the vaultDir option or HOME.',
    }
  }
  return { ok: true, dir, path: dir + '/prompts.md' }
}

const isMissing = err => /ENOENT|no such file|not found/i.test(String(err?.code ?? '') + ' ' + String(err?.message ?? err))

/**
 * Read and parse the vault. Never throws.
 * @param {{ read: Function, stat: Function }} fs
 * @param {string} path
 */
export async function loadVault(fs, path) {
  let stat
  try {
    stat = await fs.stat(path)
  } catch (err) {
    if (isMissing(err)) return { ok: false, error: 'missing', message: path + ' does not exist.' }
    return { ok: false, error: 'unreadable', message: 'Cannot read ' + path + ': ' + String(err?.message ?? err) }
  }
  if (stat.size > MAX_READ_BYTES) {
    return {
      ok: false,
      error: 'too-large',
      message: path + ' is larger than 4 MiB, which is the most Prompt Vault can read at once.',
    }
  }
  let text
  try {
    text = await fs.read(path)
  } catch (err) {
    return { ok: false, error: 'unreadable', message: 'Cannot read ' + path + ': ' + String(err?.message ?? err) }
  }
  const parsed = parseVault(text)
  return { ok: true, text, mtimeMs: stat.mtimeMs, size: stat.size, ...parsed }
}

/**
 * Create the vault with the seed header. Refuses to touch an existing file.
 * @param {{ stat: Function, write: Function }} fs
 * @param {string} path
 */
export async function createVault(fs, path) {
  try {
    await fs.stat(path)
    return { ok: false, error: 'exists', message: path + ' already exists; it was left untouched.' }
  } catch (err) {
    if (!isMissing(err)) {
      return { ok: false, error: 'unreadable', message: 'Cannot check ' + path + ': ' + String(err?.message ?? err) }
    }
  }
  try {
    await fs.write(path, SEED)
  } catch (err) {
    return { ok: false, error: 'write-failed', message: 'Cannot write ' + path + ': ' + String(err?.message ?? err) }
  }
  return { ok: true }
}
