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

import { OPERATIONS } from '../mod/hooks/lib/registry.mjs'

const skillSubs = text => {
  const subs = new Set()
  for (const m of text.matchAll(/^### `\/prompt-vault(?: ([a-z]+))?[^`]*`/gm)) subs.add(m[1] ?? 'overview')
  return subs
}
const tableSubs = text => {
  const subs = new Set()
  for (const m of text.matchAll(/^\| `\/prompt-vault(?: ([a-z]+))?[^`]*` \|/gm)) subs.add(m[1] ?? 'overview')
  return subs
}
const sorted = s => [...s].sort()

test('the skill documents exactly the ten commands the mod mirrors', () => {
  const skill = skillSubs(read('skills/prompt-vault/SKILL.md'))
  assert.equal(skill.size, 10, 'SKILL.md command headings: ' + sorted(skill).join(', '))
  const mirrored = new Set(OPERATIONS.map(o => o.skillEquivalent).filter(Boolean))
  assert.deepEqual(sorted(mirrored), sorted(skill))
})

test('both READMEs list the same skill commands as SKILL.md', () => {
  const skill = sorted(skillSubs(read('skills/prompt-vault/SKILL.md')))
  assert.deepEqual(sorted(tableSubs(read('README.md'))), skill, 'README.md')
  assert.deepEqual(sorted(tableSubs(read('prompt-vault-template/README.md'))), skill, 'template README')
})

test('every registry operation has a distinct name that /vault can dispatch', () => {
  const names = OPERATIONS.map(o => o.name)
  assert.equal(new Set(names).size, names.length)
  for (const o of OPERATIONS) assert.ok(o.syntax.startsWith('/vault'), o.id)
})

import { USER_CONFIG } from '../mod/hooks/lib/config.mjs'

test('the settings the code knows about equal the manifest userConfig', () => {
  const manifest = JSON.parse(read('mod/.claude-plugin/plugin.json'))
  assert.deepEqual(USER_CONFIG, manifest.userConfig)
})

import { MOD_VERSION } from '../mod/hooks/lib/config.mjs'

test('the version the code reports equals the manifest version and package.json', () => {
  const manifest = JSON.parse(read('mod/.claude-plugin/plugin.json'))
  assert.equal(MOD_VERSION, manifest.version)
  assert.equal(JSON.parse(read('package.json')).version, manifest.version)
})

test('the release version is the same in manifest, install.sh, README pin and CHANGELOG head', () => {
  const v = JSON.parse(read('mod/.claude-plugin/plugin.json')).version
  assert.match(read('install.sh'), new RegExp(`REF="\\$\\{PROMPT_VAULT_REF:-v${v.replace(/\./g, '\\.')}\\}"`))
  assert.ok(read('README.md').includes(`/v${v}/install.sh`), 'README install URL pin')
  const head = read('CHANGELOG.md').match(/^## (v[0-9][^\s]*)/m)
  assert.equal(head && head[1], 'v' + v)
})

test('README documents every /vault operation with its exact syntax', () => {
  const readme = read('README.md')
  for (const o of OPERATIONS) assert.ok(readme.includes('`' + o.syntax + '`'), o.syntax)
})

test('README documents every setting the mod declares', () => {
  const readme = read('README.md')
  for (const key of Object.keys(USER_CONFIG)) assert.ok(readme.includes('`' + key + '`'), key)
})

test('the mod ships an icon', () => {
  const png = readFileSync(join(root, 'mod/.claude-plugin/icon.png'))
  assert.equal(png.subarray(1, 4).toString(), 'PNG')
  assert.equal(png.readUInt32BE(16), 512)
  assert.equal(png.readUInt32BE(20), 512)
})
