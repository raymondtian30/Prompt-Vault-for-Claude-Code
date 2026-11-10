import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  PRIORITIES,
  parseVault,
  chooseFence,
  renderEntry,
  nextId,
  isValidProjectName,
  listProjects,
} from '../mod/hooks/lib/grammar.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = name => readFileSync(join(here, 'fixtures', name), 'utf8')

const wrap = (entries, counter = 9) =>
  `# DB\n\nNext ID counter: ${counter}\n\n<!-- PROMPTS START -->\n${entries}<!-- PROMPTS END -->\n`

const entry = (id, body, { fence = '```text', close = '```', title = 'T', extra = '' } = {}) =>
  `## [ ] ${id}: ${title}\n- Project: Claude Code\n- Created: 2026-11-09\n- Status: pending\n${extra}\n${fence}\n${body}\n${close}\n\n---\n`

test('constants match the skill: three priorities', () => {
  assert.deepEqual(PRIORITIES, ['High', 'Medium', 'Low'])
})

test('parses a vault shaped like the real one', () => {
  const v = parseVault(fixture('shape-of-real-vault.md'))
  assert.equal(v.entries.length, 2)
  assert.deepEqual(v.header.projects, [])
  assert.equal(v.hasStart, true)
  assert.equal(v.hasEnd, true)
  const [a, b] = v.entries
  assert.equal(a.id, 'P0001')
  assert.equal(a.done, false)
  assert.equal(a.title, 'Short one')
  assert.equal(a.project, 'Claude Code')
  assert.equal(a.priority, undefined)
  assert.equal(a.created, '2026-11-09')
  assert.equal(a.body, 'hello world')
  assert.equal(b.id, 'P0002')
  assert.equal(b.done, true)
  assert.equal(b.title, 'Long one: with colon')
  assert.equal(b.priority, 'High')
})

test('headings, dashes and fake entry headings inside the fence stay in the body', () => {
  const b = parseVault(fixture('shape-of-real-vault.md')).entries[1]
  assert.ok(b.body.includes('## 1. Product Overview'))
  assert.ok(b.body.includes('\n---\n'))
  assert.ok(b.body.includes('## [ ] P0009: fake heading inside a prompt'))
  assert.ok(b.body.endsWith('more'))
  assert.equal(parseVault(fixture('shape-of-real-vault.md')).entries.length, 2)
})

test('a four-backtick outer fence keeps a nested triple-backtick block verbatim', () => {
  const body = 'before\n```js\nconst a = 1\n```\nafter'
  const v = parseVault(wrap(entry('P0001', body, { fence: '````text', close: '````' })))
  assert.equal(v.entries.length, 1)
  assert.equal(v.entries[0].body, body)
  assert.equal(v.entries[0].legacy, undefined)
})

test('body is the exact slice: no trimming, blank edge lines kept', () => {
  const body = '\nleading blank\n  indented\ttab\n\n'
  const v = parseVault(wrap(entry('P0001', body)))
  assert.equal(v.entries[0].body, body)
})

test('CRLF files keep carriage returns inside the body', () => {
  const text = wrap(entry('P0001', 'line1\nline2')).replace(/\n/g, '\r\n')
  const e = parseVault(text).entries[0]
  assert.equal(e.id, 'P0001')
  assert.equal(e.body, 'line1\r\nline2')
})

test('unknown metadata lines are kept in extra, not dropped', () => {
  const e = parseVault(wrap(entry('P0001', 'x', { extra: '- Owner: me\n' }))).entries[0]
  assert.deepEqual(e.extra, ['- Owner: me'])
})

test('empty body is reported as empty, not as a crash', () => {
  const e = parseVault(wrap(entry('P0001', ''))).entries[0]
  assert.equal(e.body, '')
  assert.equal(e.empty, true)
})

test('whitespace-only body counts as empty', () => {
  const e = parseVault(wrap(entry('P0001', '   \n\t '))).entries[0]
  assert.equal(e.empty, true)
})

test('duplicate ids are reported', () => {
  const v = parseVault(wrap(entry('P0001', 'a') + entry('P0001', 'b')))
  assert.equal(v.entries.length, 2)
  assert.ok(v.errors.some(x => x.code === 'duplicate-id' && x.id === 'P0001'))
})

test('ids longer than four digits parse', () => {
  const e = parseVault(wrap(entry('P10000', 'big'))).entries[0]
  assert.equal(e.id, 'P10000')
})

test('a missing end marker is reported and entries still parse', () => {
  const text = wrap(entry('P0001', 'x')).replace('<!-- PROMPTS END -->\n', '')
  const v = parseVault(text)
  assert.equal(v.hasEnd, false)
  assert.equal(v.entries.length, 1)
})

test('legacy entry whose inner fence closed early is flagged and recovered read-only', () => {
  const legacy =
    '## [ ] P0001: Old\n- Category: Claude Code\n- Created: 2026-11-09\n- Status: pending\n\n```text\nstep one\n```js\ncode\n```\nstep two\n```\n\n---\n'
  const e = parseVault(wrap(legacy)).entries[0]
  assert.equal(e.legacy, true)
  assert.equal(e.body, 'step one\n```js\ncode\n```\nstep two')
})

test('an unclosed fence is an error entry, never silently truncated', () => {
  const text = wrap('## [ ] P0001: Open\n- Category: Claude Code\n- Created: 2026-11-09\n- Status: pending\n\n```text\nno close\n')
  const v = parseVault(text)
  assert.ok(v.errors.some(x => x.code === 'unclosed-fence'))
  assert.equal(v.entries[0].error, 'unclosed-fence')
})

test('chooseFence is one longer than the longest backtick run in the body, min 3', () => {
  assert.equal(chooseFence('plain'), '```')
  assert.equal(chooseFence('a ``` b'), '````')
  assert.equal(chooseFence('``````'), '```````')
  assert.equal(chooseFence('one ` two'), '```')
})

test('renderEntry then parse returns the same body for tricky bodies', () => {
  const bodies = [
    'plain',
    'with ```\nfence line\n``` inside',
    '````\nfour\n````',
    'has\n---\nrule and\n## [ ] P0009: heading',
    'tabs\there\r\ncrlf',
    'unicode ✓ — ünï',
    '\nblank edges\n',
    'x'.repeat(100000),
  ]
  for (const body of bodies) {
    const text = wrap(renderEntry({ id: 'P0001', done: false, title: 'T', project: 'Other', created: '2026-11-10', body }))
    const e = parseVault(text).entries[0]
    assert.equal(e.body, body)
    assert.equal(e.legacy, undefined)
  }
})

test('nextId is the lowest unused number, so a deleted id is reused', () => {
  assert.equal(nextId([]).id, 'P0001')
  assert.equal(nextId([{ id: 'P0001' }, { id: 'P0002' }]).id, 'P0003')
  assert.equal(nextId([{ id: 'P0002' }, { id: 'P0003' }]).id, 'P0001')
  assert.equal(nextId([{ id: 'P0001' }, { id: 'P0003' }]).id, 'P0002')
  assert.equal(nextId([{ id: 'P0001' }, { id: 'P0001' }, { id: 'P0002' }]).id, 'P0003')
  assert.equal(nextId([{ id: 'P10000' }]).id, 'P0001')
})

test('a legacy Category line is read as the project, and Project wins when both exist', () => {
  const legacy = '## [ ] P0001: A\n- Category: Old name\n- Created: 2026-11-09\n- Status: pending\n\n```text\nx\n```\n\n---\n'
  assert.equal(parseVault(wrap(legacy)).entries[0].project, 'Old name')
  const both = '## [ ] P0001: A\n- Category: Old\n- Project: New\n- Created: 2026-11-09\n- Status: pending\n\n```text\nx\n```\n\n---\n'
  assert.equal(parseVault(wrap(both)).entries[0].project, 'New')
})

test('an entry with no project line is unfiled; render omits the line when there is no project', () => {
  const none = '## [ ] P0001: A\n- Created: 2026-11-09\n- Status: pending\n\n```text\nx\n```\n\n---\n'
  assert.equal(parseVault(wrap(none)).entries[0].project, undefined)
  const text = renderEntry({ id: 'P0001', done: false, title: 'T', created: '2026-11-10', body: 'x' })
  assert.ok(!text.includes('- Project:'))
  assert.ok(!text.includes('- Category:'))
})

test('the header Projects line lists projects, including ones with no prompts yet', () => {
  const text = '# DB\n\nProjects: Alpha, Beta ,  Gamma\n\n<!-- PROMPTS START -->\n<!-- PROMPTS END -->\n'
  assert.deepEqual(parseVault(text).header.projects, ['Alpha', 'Beta', 'Gamma'])
  assert.deepEqual(parseVault('# DB\n\n<!-- PROMPTS START -->\n<!-- PROMPTS END -->\n').header.projects, [])
  const below = wrap(entry('P0001', 'Projects: Sneaky'))
  assert.deepEqual(parseVault(below).header.projects, [])
})

test('listProjects: header order first, then projects only entries mention; unfiled counted apart', () => {
  const v = parseVault(
    '# DB\n\nProjects: Beta, Empty\n\n<!-- PROMPTS START -->\n' +
      renderEntry({ id: 'P0001', done: false, title: 'a', project: 'Alpha', created: 'd', body: 'x' }) +
      renderEntry({ id: 'P0002', done: false, title: 'b', project: 'Beta', created: 'd', body: 'x' }) +
      renderEntry({ id: 'P0003', done: false, title: 'c', created: 'd', body: 'x' }) +
      renderEntry({ id: 'P0004', done: false, title: 'd', project: 'Beta', created: 'd', body: 'x' }) +
      '<!-- PROMPTS END -->\n',
  )
  assert.deepEqual(listProjects(v.header, v.entries), {
    projects: [
      { name: 'Beta', count: 2 },
      { name: 'Empty', count: 0 },
      { name: 'Alpha', count: 1 },
    ],
    unfiled: 1,
  })
})

test('project names: non-empty, one line, no commas, at most 60 characters', () => {
  assert.equal(isValidProjectName('AI Sanctum'), true)
  for (const bad of ['', '   ', 'a,b', 'two\nlines', 'x'.repeat(61), undefined]) assert.equal(isValidProjectName(bad), false, String(bad))
  assert.equal(isValidProjectName('x'.repeat(60)), true)
})

test('renderEntry can use CRLF for its own lines and still round-trips the body untouched', () => {
  const body = 'line one\nline two'
  const text = renderEntry({ id: 'P0001', done: false, title: 'T', project: 'Other', created: '2026-11-10', body, eol: '\r\n' })
  assert.ok(text.startsWith('## [ ] P0001: T\r\n- Project: Other\r\n'))
  assert.equal(parseVault(wrap(text)).entries[0].body, body)
})
