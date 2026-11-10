import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { OPERATIONS } from '../mod/hooks/lib/registry.mjs'
import { searchHelp, renderHelp, settingsFromManifest, SHORTCUTS, FAQ, TROUBLESHOOTING } from '../mod/hooks/lib/help.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(join(root, 'mod/.claude-plugin/plugin.json'), 'utf8'))
const ctx = { operations: OPERATIONS, userConfig: manifest.userConfig }

test('an empty search shows every registered operation, every setting, and all sections', () => {
  const r = searchHelp('', ctx)
  assert.deepEqual(r.operations.map(o => o.id), OPERATIONS.map(o => o.id))
  assert.deepEqual(r.settings.map(s => s.key).sort(), Object.keys(manifest.userConfig).sort())
  assert.equal(r.shortcuts.length, SHORTCUTS.length)
  assert.equal(r.faq.length, FAQ.length)
  assert.equal(r.troubleshooting.length, TROUBLESHOOTING.length)
  assert.equal(r.empty, false)
})

test('every registered operation, with its syntax and an example, appears in the rendered help', () => {
  const text = renderHelp(searchHelp('', ctx))
  for (const o of OPERATIONS) {
    assert.ok(text.includes(o.syntax), o.id + ' syntax')
    assert.ok(text.includes(o.examples[0]), o.id + ' example')
    assert.ok(text.includes(o.description), o.id + ' description')
  }
})

test('search is case-insensitive and matches name, syntax, description and examples', () => {
  assert.ok(searchHelp('EXECUTE', ctx).operations.some(o => o.id === 'run'))
  assert.ok(!searchHelp('execute', ctx).operations.some(o => o.id === 'categories'))
  assert.deepEqual(searchHelp('/vault search <query>', ctx).operations.map(o => o.id), ['search'])
  assert.ok(searchHelp('token savior', ctx).operations.some(o => o.id === 'search'))
})

test('several words must all match', () => {
  const ids = searchHelp('submit complete', ctx).operations.map(o => o.id)
  assert.deepEqual(ids, ['run'])
})

test('settings are searchable and come from the manifest, so they cannot drift', () => {
  const r = searchHelp('vaultDir', ctx)
  assert.deepEqual(r.settings.map(s => s.key), ['vaultDir'])
  assert.equal(r.settings[0].default, '')
  assert.deepEqual(settingsFromManifest(manifest.userConfig).map(s => s.key).sort(), Object.keys(manifest.userConfig).sort())
})

test('no match yields empty sections and a flag, not an error', () => {
  const r = searchHelp('zzzzqqq', ctx)
  assert.equal(r.empty, true)
  assert.equal(r.operations.length + r.shortcuts.length + r.settings.length + r.faq.length + r.troubleshooting.length, 0)
  assert.match(renderHelp(r), /No help matches "zzzzqqq"/)
})

test('FAQ and troubleshooting entries are complete', () => {
  for (const x of [...FAQ, ...TROUBLESHOOTING]) assert.ok(x.q && x.a && x.q.length > 5 && x.a.length > 10, x.q)
  for (const s of SHORTCUTS) assert.ok(s.keys && s.does, s.keys)
})
