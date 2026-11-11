import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseVault, renderEntry, listProjects } from '../mod/hooks/lib/grammar.mjs'
import { setDone, addEntry, editEntry, deleteEntry, createProject, renameProject, deleteProject } from '../mod/hooks/lib/edit.mjs'

const mk = (id, over = {}) =>
  renderEntry({ id, done: false, title: 'T ' + id, project: 'Alpha', created: '2026-11-09', body: 'body ' + id, ...over })
const doc = (entries, { header = '', end = true } = {}) =>
  `# DB\n\n${header}<!-- PROMPTS START -->\n${entries.join('')}${end ? '<!-- PROMPTS END -->\n' : ''}`
const TEXT = doc([mk('P0001'), mk('P0002', { priority: 'High', extra: ['- Owner: me'] }), mk('P0003', { project: undefined })])
const rawOf = (text, id) => parseVault(text).entries.find(e => e.id === id).raw
const projectsOf = text => {
  const v = parseVault(text)
  return listProjects(v.header, v.entries)
}

test('setDone changes only the checkbox and the Status value', () => {
  const r = setDone(TEXT, 'P0002', true)
  assert.equal(r.ok, true)
  assert.equal(r.changed, true)
  const expected = TEXT.replace('## [ ] P0002', '## [x] P0002').replace(/(## \[x\] P0002[\s\S]*?- Status: )pending/, '$1completed')
  assert.equal(r.text, expected)
})

test('setDone can reopen, and is a no-op when already in that state', () => {
  const done = setDone(TEXT, 'P0001', true).text
  assert.equal(setDone(done, 'P0001', false).text, TEXT)
  const noop = setDone(TEXT, 'P0001', false)
  assert.deepEqual([noop.ok, noop.changed, noop.text], [true, false, TEXT])
})

test('setDone keeps CRLF line endings', () => {
  const r = setDone(TEXT.replace(/\n/g, '\r\n'), 'P0001', true)
  assert.ok(r.text.includes('## [x] P0001: T P0001\r\n'))
  assert.ok(r.text.includes('- Status: completed\r\n'))
  assert.ok(!r.text.replace(/\r\n/g, '').includes('\n'))
})

test('setDone refuses an unknown id and an id that appears twice', () => {
  assert.equal(setDone(TEXT, 'P0099', true).error, 'not-found')
  assert.equal(setDone(doc([mk('P0001'), mk('P0001')]), 'P0001', true).error, 'duplicate-id')
})

const NEW = { title: 'New: one', project: 'Beta', priority: 'Low', created: '2026-11-10', body: 'with ```\nfence\n``` inside' }

test('addEntry takes the lowest unused id, inserts before the end marker and touches nothing else', () => {
  const r = addEntry(TEXT, NEW)
  assert.equal(r.ok, true)
  assert.equal(r.id, 'P0004')
  const v = parseVault(r.text)
  assert.deepEqual(v.entries.map(e => e.id), ['P0001', 'P0002', 'P0003', 'P0004'])
  const added = v.entries[3]
  assert.deepEqual([added.body, added.title, added.project, added.priority], [NEW.body, 'New: one', 'Beta', 'Low'])
  for (const id of ['P0001', 'P0002', 'P0003']) assert.equal(rawOf(r.text, id), rawOf(TEXT, id))
  assert.ok(r.text.endsWith('<!-- PROMPTS END -->\n'))
})

test('a deleted id is reused by the next prompt added', () => {
  const without = deleteEntry(TEXT, 'P0002').text
  assert.equal(addEntry(without, NEW).id, 'P0002')
  const lowest = deleteEntry(TEXT, 'P0001').text
  assert.equal(addEntry(lowest, NEW).id, 'P0001')
})

test('addEntry appends when the end marker is missing', () => {
  const r = addEntry(doc([mk('P0001')], { end: false }), NEW)
  assert.equal(parseVault(r.text).entries.length, 2)
})

test('addEntry without a project is unfiled; project and priority are optional', () => {
  const r = addEntry(TEXT, { ...NEW, project: undefined, priority: undefined })
  assert.equal(r.ok, true)
  const e = parseVault(r.text).entries.find(x => x.id === r.id)
  assert.deepEqual([e.project, e.priority], [undefined, undefined])
  assert.ok(!rawOf(r.text, r.id).includes('- Project:'))
})

test('addEntry validates: one-line title, valid project name, listed priority, non-empty body', () => {
  assert.equal(addEntry(TEXT, { ...NEW, project: 'a,b' }).error, 'bad-project')
  assert.equal(addEntry(TEXT, { ...NEW, project: 'x'.repeat(61) }).error, 'bad-project')
  assert.equal(addEntry(TEXT, { ...NEW, priority: 'Urgent' }).error, 'bad-priority')
  assert.equal(addEntry(TEXT, { ...NEW, title: 'two\nlines' }).error, 'bad-title')
  assert.equal(addEntry(TEXT, { ...NEW, title: '   ' }).error, 'bad-title')
  assert.equal(addEntry(TEXT, { ...NEW, body: '  \n' }).error, 'empty-body')
  assert.equal(addEntry('no markers here', NEW).error, 'not-a-vault')
})

test('addEntry never edits a Next ID counter line it finds in an old header', () => {
  const old = doc([mk('P0001')], { header: 'Next ID counter: 2\n\n' })
  const r = addEntry(old, NEW)
  assert.ok(r.text.includes('Next ID counter: 2\n'))
})

test('editEntry changes only the named fields and only that entry', () => {
  const r = editEntry(TEXT, 'P0002', { title: 'Renamed', body: 'new\nbody' })
  assert.equal(r.ok, true)
  const e = parseVault(r.text).entries.find(x => x.id === 'P0002')
  assert.deepEqual([e.title, e.body, e.project, e.priority, e.created, e.done], ['Renamed', 'new\nbody', 'Alpha', 'High', '2026-11-09', false])
  assert.deepEqual(e.extra, ['- Owner: me'])
  assert.equal(rawOf(r.text, 'P0001'), rawOf(TEXT, 'P0001'))
  assert.equal(rawOf(r.text, 'P0003'), rawOf(TEXT, 'P0003'))
})

test('editEntry can move a prompt to another project, unfile it, or clear a priority', () => {
  const moved = editEntry(TEXT, 'P0001', { project: 'Beta' })
  assert.equal(parseVault(moved.text).entries[0].project, 'Beta')
  const unfiled = editEntry(TEXT, 'P0001', { project: null })
  assert.equal(parseVault(unfiled.text).entries[0].project, undefined)
  const cleared = editEntry(TEXT, 'P0002', { priority: null, body: 'x\n````\ny\n````' })
  const e = parseVault(cleared.text).entries.find(x => x.id === 'P0002')
  assert.deepEqual([e.priority, e.body], [undefined, 'x\n````\ny\n````'])
})

test('editEntry rewrites a legacy Category line as a Project line', () => {
  const legacy = '## [ ] P0001: Old\n- Category: Claude Code\n- Created: 2026-11-09\n- Status: pending\n\n```text\nx\n```\n\n---\n'
  const r = editEntry(doc([legacy]), 'P0001', { title: 'New title' })
  assert.ok(r.text.includes('- Project: Claude Code'))
  assert.ok(!r.text.includes('- Category:'))
})

test('editEntry with nothing different changes nothing', () => {
  const r = editEntry(TEXT, 'P0001', { title: 'T P0001', body: 'body P0001', project: 'Alpha' })
  assert.deepEqual([r.ok, r.changed, r.text], [true, false, TEXT])
})

test('editEntry validates like add and refuses unknown, legacy and duplicate entries', () => {
  assert.equal(editEntry(TEXT, 'P0099', { title: 'x' }).error, 'not-found')
  assert.equal(editEntry(TEXT, 'P0001', { project: 'a,b' }).error, 'bad-project')
  assert.equal(editEntry(TEXT, 'P0001', { body: '' }).error, 'empty-body')
  const legacy = '## [ ] P0001: Old\n- Project: A\n- Created: 2026-11-09\n- Status: pending\n\n```text\none\n```js\nc\n```\ntwo\n```\n\n---\n'
  assert.equal(editEntry(doc([legacy]), 'P0001', { title: 'x' }).error, 'unsafe-entry')
  assert.equal(editEntry(doc([mk('P0001'), mk('P0001')]), 'P0001', { title: 'x' }).error, 'duplicate-id')
})

test('deleteEntry removes exactly that entry', () => {
  const r = deleteEntry(TEXT, 'P0002')
  assert.equal(r.ok, true)
  assert.deepEqual(parseVault(r.text).entries.map(e => e.id), ['P0001', 'P0003'])
  assert.equal(rawOf(r.text, 'P0001'), rawOf(TEXT, 'P0001'))
  assert.equal(r.text, TEXT.replace(rawOf(TEXT, 'P0002'), ''))
  assert.equal(deleteEntry(TEXT, 'P0099').error, 'not-found')
})

test('createProject adds a name to the header list, and it exists with no prompts', () => {
  const r = createProject(TEXT, 'Beta')
  assert.equal(r.ok, true)
  assert.ok(r.text.includes('Projects: Beta\n'))
  assert.deepEqual(projectsOf(r.text).projects, [{ name: 'Beta', count: 0 }, { name: 'Alpha', count: 2 }])
  const more = createProject(r.text, 'Gamma')
  assert.ok(more.text.includes('Projects: Beta, Gamma\n'))
  for (const id of ['P0001', 'P0002', 'P0003']) assert.equal(rawOf(more.text, id), rawOf(TEXT, id))
  assert.deepEqual(r.touched, [])
})

test('createProject refuses a bad name or one that already exists (any case), changing nothing', () => {
  assert.equal(createProject(TEXT, 'a,b').error, 'bad-project')
  assert.equal(createProject(TEXT, '  ').error, 'bad-project')
  assert.equal(createProject(TEXT, 'alpha').error, 'project-exists')
  const withBeta = createProject(TEXT, 'Beta').text
  assert.equal(createProject(withBeta, 'BETA').error, 'project-exists')
})

test('createProject keeps CRLF and an existing header Projects line', () => {
  const crlf = doc([mk('P0001')], { header: 'Projects: Beta\n\n' }).replace(/\n/g, '\r\n')
  const r = createProject(crlf, 'Gamma')
  assert.ok(r.text.includes('Projects: Beta, Gamma\r\n'))
})

test('renameProject changes the header name and every prompt in it, and only those', () => {
  const start = createProject(TEXT, 'Empty').text
  const r = renameProject(start, 'Alpha', 'Renamed')
  assert.equal(r.ok, true)
  assert.deepEqual(r.touched.sort(), ['P0001', 'P0002'])
  const v = parseVault(r.text)
  assert.deepEqual(v.entries.map(e => e.project), ['Renamed', 'Renamed', undefined])
  assert.equal(rawOf(r.text, 'P0003'), rawOf(start, 'P0003'))
  const renamedEmpty = renameProject(start, 'Empty', 'Fresh')
  assert.ok(renamedEmpty.text.includes('Projects: Fresh\n'))
  assert.deepEqual(renamedEmpty.touched, [])
})

test('renameProject turns a legacy Category line into a Project line', () => {
  const legacy = '## [ ] P0001: Old\n- Category: Claude Code\n- Created: 2026-11-09\n- Status: pending\n\n```text\nx\n```\n\n---\n'
  const r = renameProject(doc([legacy]), 'Claude Code', 'Core')
  assert.ok(r.text.includes('- Project: Core'))
  assert.ok(!r.text.includes('Category'))
})

test('renameProject refuses unknown names, bad names, clashes, and does nothing for the same name', () => {
  assert.equal(renameProject(TEXT, 'Nope', 'X').error, 'project-not-found')
  assert.equal(renameProject(TEXT, 'Alpha', 'a,b').error, 'bad-project')
  assert.equal(renameProject(createProject(TEXT, 'Beta').text, 'Alpha', 'beta').error, 'project-exists')
  const same = renameProject(TEXT, 'Alpha', 'Alpha')
  assert.deepEqual([same.ok, same.changed, same.text], [true, false, TEXT])
})

test('deleteProject removes the project and unfiles its prompts, never deleting a prompt', () => {
  const start = createProject(TEXT, 'Alpha2').text
  const r = deleteProject(start, 'Alpha')
  assert.equal(r.ok, true)
  assert.equal(r.unfiled, 2)
  assert.deepEqual(r.touched.sort(), ['P0001', 'P0002'])
  const v = parseVault(r.text)
  assert.deepEqual(v.entries.map(e => [e.id, e.project]), [['P0001', undefined], ['P0002', undefined], ['P0003', undefined]])
  assert.deepEqual(v.entries.map(e => e.body), ['body P0001', 'body P0002', 'body P0003'])
  assert.ok(r.text.includes('Projects: Alpha2'))
  assert.equal(deleteProject(TEXT, 'Nope').error, 'project-not-found')
})

test('deleting an empty header project only edits the header', () => {
  const start = createProject(TEXT, 'Empty').text
  const r = deleteProject(start, 'Empty')
  assert.deepEqual([r.ok, r.unfiled, r.touched], [true, 0, []])
  for (const id of ['P0001', 'P0002', 'P0003']) assert.equal(rawOf(r.text, id), rawOf(TEXT, id))
})
