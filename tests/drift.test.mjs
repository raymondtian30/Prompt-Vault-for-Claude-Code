import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { SEED } from '../mod/hooks/lib/vault.mjs'
import { CATEGORIES, PRIORITIES, START_MARKER, END_MARKER } from '../mod/hooks/lib/grammar.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = p => readFileSync(join(root, p), 'utf8')

test('embedded vault header is byte-identical to the template prompts.md', () => {
  assert.equal(SEED, read('prompt-vault-template/prompts.md'))
})

test('grammar constants match what SKILL.md states', () => {
  const skill = read('skills/prompt-vault/SKILL.md').replace(/\s+/g, ' ')
  assert.ok(skill.includes(`must be one of: ${CATEGORIES.join(', ')}.`), 'categories')
  assert.ok(skill.includes(`Valid values if present: ${PRIORITIES.join(', ')}.`), 'priorities')
  assert.ok(skill.includes(START_MARKER), 'start marker')
  assert.ok(skill.includes(END_MARKER), 'end marker')
})
