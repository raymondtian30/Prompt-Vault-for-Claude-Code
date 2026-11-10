import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  CATEGORIES,
  PRIORITIES,
  parseVault,
  chooseFence,
  renderEntry,
  nextId,
} from '../mod/hooks/lib/grammar.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = name => readFileSync(join(here, 'fixtures', name), 'utf8')

const wrap = (entries, counter = 9) =>
  `# DB\n\nNext ID counter: ${counter}\n\n<!-- PROMPTS START -->\n${entries}<!-- PROMPTS END -->\n`

const entry = (id, body, { fence = '```text', close = '```', title = 'T', extra = '' } = {}) =>
  `## [ ] ${id}: ${title}\n- Category: Claude Code\n- Created: 2026-11-09\n- Status: pending\n${extra}\n${fence}\n${body}\n${close}\n\n---\n`

test('constants match the skill: five categories, three priorities', () => {
  assert.deepEqual(CATEGORIES, ['Claude Code', 'ChatGPT', 'Coding Projects', 'Research', 'Other'])
  assert.deepEqual(PRIORITIES, ['High', 'Medium', 'Low'])
})

test('parses a vault shaped like the real one', () => {
  const v = parseVault(fixture('shape-of-real-vault.md'))
  assert.equal(v.entries.length, 2)
  assert.equal(v.header.counter, 3)
  assert.equal(v.hasStart, true)
  assert.equal(v.hasEnd, true)
  const [a, b] = v.entries
  assert.equal(a.id, 'P0001')
  assert.equal(a.done, false)
  assert.equal(a.title, 'Short one')
  assert.equal(a.category, 'Claude Code')
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

test('a counter line below the start marker is not taken as the header counter', () => {
  const v = parseVault(wrap(entry('P0001', 'Next ID counter: 99')))
  assert.equal(v.header.counter, 9)
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
    const text = wrap(renderEntry({ id: 'P0001', done: false, title: 'T', category: 'Other', created: '2026-11-10', body }))
    const e = parseVault(text).entries[0]
    assert.equal(e.body, body)
    assert.equal(e.legacy, undefined)
  }
})

test('nextId takes the larger of counter and highest id plus one, and flags a repair', () => {
  assert.deepEqual(nextId({ counter: 3 }, [{ id: 'P0001' }, { id: 'P0002' }]), { id: 'P0003', counter: 4, repaired: false })
  assert.deepEqual(nextId({ counter: 1 }, [{ id: 'P0005' }]), { id: 'P0006', counter: 7, repaired: true })
  assert.deepEqual(nextId({ counter: undefined }, [{ id: 'P0002' }]), { id: 'P0003', counter: 4, repaired: true })
  assert.deepEqual(nextId({ counter: undefined }, []), { id: 'P0001', counter: 2, repaired: false })
  assert.deepEqual(nextId({ counter: 10 }, [{ id: 'P0002' }]), { id: 'P0010', counter: 11, repaired: false })
})

test('renderEntry can use CRLF for its own lines and still round-trips the body untouched', () => {
  const body = 'line one\nline two'
  const text = renderEntry({ id: 'P0001', done: false, title: 'T', category: 'Other', created: '2026-11-10', body, eol: '\r\n' })
  assert.ok(text.startsWith('## [ ] P0001: T\r\n- Category: Other\r\n'))
  assert.equal(parseVault(wrap(text)).entries[0].body, body)
})
