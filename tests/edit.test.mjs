import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseVault, renderEntry } from '../mod/hooks/lib/grammar.mjs'
import { setDone, addEntry, editEntry, deleteEntry } from '../mod/hooks/lib/edit.mjs'

const mk = (id, over = {}) =>
  renderEntry({ id, done: false, title: 'T ' + id, category: 'Claude Code', created: '2026-11-09', body: 'body ' + id, ...over })
const doc = (entries, { counter = 'Next ID counter: 5\n\n', end = true } = {}) =>
  `# DB\n\n${counter}<!-- PROMPTS START -->\n${entries.join('')}${end ? '<!-- PROMPTS END -->\n' : ''}`
const TEXT = doc([mk('P0001'), mk('P0002', { priority: 'High', extra: ['- Owner: me'] }), mk('P0003')])
const rawOf = (text, id) => parseVault(text).entries.find(e => e.id === id).raw

test('setDone changes only the checkbox and the Status value', () => {
  const r = setDone(TEXT, 'P0002', true)
  assert.equal(r.ok, true)
  assert.equal(r.changed, true)
  const expected = TEXT.replace('## [ ] P0002', '## [x] P0002').replace(
    /(## \[x\] P0002[\s\S]*?- Status: )pending/,
    '$1completed',
  )
  assert.equal(r.text, expected)
})

test('setDone can reopen, and is a no-op when already in that state', () => {
  const done = setDone(TEXT, 'P0001', true).text
  const back = setDone(done, 'P0001', false)
  assert.equal(back.text, TEXT)
  const noop = setDone(TEXT, 'P0001', false)
  assert.deepEqual([noop.ok, noop.changed, noop.text], [true, false, TEXT])
})

test('setDone keeps CRLF line endings', () => {
  const crlf = TEXT.replace(/\n/g, '\r\n')
  const r = setDone(crlf, 'P0001', true)
  assert.ok(r.text.includes('## [x] P0001: T P0001\r\n'))
  assert.ok(r.text.includes('- Status: completed\r\n'))
  assert.ok(!r.text.replace(/\r\n/g, '').includes('\n'))
})

test('setDone refuses an unknown id and an id that appears twice', () => {
  assert.equal(setDone(TEXT, 'P0099', true).error, 'not-found')
  assert.equal(setDone(doc([mk('P0001'), mk('P0001')]), 'P0001', true).error, 'duplicate-id')
})

const NEW = { title: 'New: one', category: 'Research', priority: 'Low', created: '2026-11-10', body: 'with ```\nfence\n``` inside' }

test('addEntry inserts before the end marker, bumps the counter, and touches nothing else', () => {
  const r = addEntry(TEXT, NEW)
  assert.equal(r.ok, true)
  assert.equal(r.id, 'P0005')
  const v = parseVault(r.text)
  assert.equal(v.header.counter, 6)
  assert.deepEqual(v.entries.map(e => e.id), ['P0001', 'P0002', 'P0003', 'P0005'])
  const added = v.entries[3]
  assert.equal(added.body, NEW.body)
  assert.equal(added.title, 'New: one')
  assert.equal(added.category, 'Research')
  for (const id of ['P0001', 'P0002', 'P0003']) assert.equal(rawOf(r.text, id), rawOf(TEXT, id))
  assert.ok(r.text.endsWith('<!-- PROMPTS END -->\n'))
})

test('addEntry repairs a low counter and says so; appends when the end marker is missing; adds a missing counter line', () => {
  const low = addEntry(doc([mk('P0007')], { counter: 'Next ID counter: 2\n\n' }), NEW)
  assert.equal(low.id, 'P0008')
  assert.equal(low.repaired, true)
  const noEnd = addEntry(doc([mk('P0001')], { end: false }), NEW)
  assert.equal(parseVault(noEnd.text).entries.length, 2)
  const noCounter = addEntry(doc([mk('P0001')], { counter: '' }), NEW)
  assert.equal(parseVault(noCounter.text).header.counter, 3)
})

test('addEntry validates: category required and listed, priority listed, one-line title, non-empty body', () => {
  assert.equal(addEntry(TEXT, { ...NEW, category: undefined }).error, 'category-required')
  assert.equal(addEntry(TEXT, { ...NEW, category: 'Nope' }).error, 'bad-category')
  assert.equal(addEntry(TEXT, { ...NEW, priority: 'Urgent' }).error, 'bad-priority')
  assert.equal(addEntry(TEXT, { ...NEW, title: 'two\nlines' }).error, 'bad-title')
  assert.equal(addEntry(TEXT, { ...NEW, title: '   ' }).error, 'bad-title')
  assert.equal(addEntry(TEXT, { ...NEW, body: '  \n' }).error, 'empty-body')
  assert.equal(addEntry(TEXT, { ...NEW, priority: undefined }).ok, true)
})

test('editEntry changes only the named fields and only that entry', () => {
  const r = editEntry(TEXT, 'P0002', { title: 'Renamed', body: 'new\nbody' })
  assert.equal(r.ok, true)
  const e = parseVault(r.text).entries.find(x => x.id === 'P0002')
  assert.deepEqual([e.title, e.body, e.category, e.priority, e.created, e.done], ['Renamed', 'new\nbody', 'Claude Code', 'High', '2026-11-09', false])
  assert.deepEqual(e.extra, ['- Owner: me'])
  assert.equal(rawOf(r.text, 'P0001'), rawOf(TEXT, 'P0001'))
  assert.equal(rawOf(r.text, 'P0003'), rawOf(TEXT, 'P0003'))
})

test('editEntry can clear a priority, and a body needing a longer fence gets one', () => {
  const r = editEntry(TEXT, 'P0002', { priority: null, body: 'x\n````\ny\n````' })
  const e = parseVault(r.text).entries.find(x => x.id === 'P0002')
  assert.equal(e.priority, undefined)
  assert.equal(e.body, 'x\n````\ny\n````')
})

test('editEntry with nothing different changes nothing', () => {
  const r = editEntry(TEXT, 'P0001', { title: 'T P0001', body: 'body P0001', category: 'Claude Code' })
  assert.deepEqual([r.ok, r.changed, r.text], [true, false, TEXT])
})

test('editEntry validates like add and refuses unknown, legacy and duplicate entries', () => {
  assert.equal(editEntry(TEXT, 'P0099', { title: 'x' }).error, 'not-found')
  assert.equal(editEntry(TEXT, 'P0001', { category: 'Nope' }).error, 'bad-category')
  assert.equal(editEntry(TEXT, 'P0001', { body: '' }).error, 'empty-body')
  const legacy =
    '## [ ] P0001: Old\n- Category: Claude Code\n- Created: 2026-11-09\n- Status: pending\n\n```text\none\n```js\nc\n```\ntwo\n```\n\n---\n'
  assert.equal(editEntry(doc([legacy]), 'P0001', { title: 'x' }).error, 'unsafe-entry')
  assert.equal(editEntry(doc([mk('P0001'), mk('P0001')]), 'P0001', { title: 'x' }).error, 'duplicate-id')
})

test('deleteEntry removes exactly that entry and never lowers the counter', () => {
  const r = deleteEntry(TEXT, 'P0002')
  assert.equal(r.ok, true)
  const v = parseVault(r.text)
  assert.deepEqual(v.entries.map(e => e.id), ['P0001', 'P0003'])
  assert.equal(v.header.counter, 5)
  assert.equal(rawOf(r.text, 'P0001'), rawOf(TEXT, 'P0001'))
  assert.equal(r.text, TEXT.replace(rawOf(TEXT, 'P0002'), ''))
  assert.equal(deleteEntry(TEXT, 'P0099').error, 'not-found')
})
