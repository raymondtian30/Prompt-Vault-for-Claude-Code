import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseVault, renderEntry } from '../mod/hooks/lib/grammar.mjs'
import { truncate, lightIndex, pageOf, previewBody, runLine } from '../mod/hooks/lib/viewmodel.mjs'

const mk = (id, over = {}) =>
  renderEntry({ id, done: false, title: 'Title ' + id, project: 'Claude Code', created: '2026-11-10', body: 'body ' + id, ...over })
const loaded = entries => ({
  ok: true,
  mtimeMs: 7,
  ...parseVault(`# DB\n\nNext ID counter: 99\n\n<!-- PROMPTS START -->\n${entries.join('')}<!-- PROMPTS END -->\n`),
})

test('truncate fits a width with an ellipsis and leaves short text alone', () => {
  assert.equal(truncate('short', 10), 'short')
  assert.equal(truncate('abcdefghij', 5), 'abcd…')
  assert.equal(truncate('abc', 1), '…')
  assert.equal(truncate('', 5), '')
})

test('lightIndex keeps what the list needs and flags unsafe entries; no bodies', () => {
  const idx = lightIndex(loaded([mk('P0001', { priority: 'High', body: 'x'.repeat(5000) }), mk('P0002', { body: '' })]))
  assert.equal(idx.ok, true)
  assert.equal(idx.mtimeMs, 7)
  assert.equal(idx.entries[0].bodyLength, 5000)
  assert.equal(idx.entries[0].body, undefined)
  assert.ok(idx.entries[0].hay.length < 2200)
  assert.equal(idx.entries[1].flag, 'empty')
  assert.deepEqual(Object.keys(idx.entries[0]).sort(), ['bodyLength', 'created', 'done', 'flag', 'hay', 'id', 'priority', 'project', 'title'].sort())
})

test('lightIndex lists projects with counts, header ones included, and the unfiled count', () => {
  const v = loaded([mk('P0001', { project: 'Alpha' }), mk('P0002', { project: undefined }), mk('P0003', { project: 'Alpha' })])
  v.header.projects = ['Empty']
  const idx = lightIndex(v)
  assert.deepEqual(idx.projects, [{ name: 'Empty', count: 0 }, { name: 'Alpha', count: 2 }])
  assert.equal(idx.unfiled, 1)
  assert.equal(idx.entries[1].project, undefined)
})

test('lightIndex passes a vault error through', () => {
  assert.deepEqual(lightIndex({ ok: false, error: 'missing', message: 'nope' }), { ok: false, error: 'missing', message: 'nope' })
})

const many = Array.from({ length: 20 }, (_, i) => mk('P' + String(i + 1).padStart(4, '0'), { done: i % 4 === 0, project: i % 2 ? 'Research' : 'Claude Code' }))
const IDX = lightIndex(loaded(many))

test('pageOf paginates, clamps the page and reports totals', () => {
  const p0 = pageOf(IDX.entries, { page: 0, pageSize: 8 })
  assert.deepEqual([p0.rows.length, p0.pages, p0.total, p0.page], [8, 3, 20, 0])
  assert.equal(pageOf(IDX.entries, { page: 2, pageSize: 8 }).rows.length, 4)
  assert.equal(pageOf(IDX.entries, { page: 99, pageSize: 8 }).page, 2)
  assert.equal(pageOf(IDX.entries, { page: -3, pageSize: 8 }).page, 0)
  assert.deepEqual(pageOf([], { page: 0, pageSize: 8 }), { rows: [], page: 0, pages: 1, total: 0 })
})

test('pageOf filters by pending or done and searches id, title, project, text', () => {
  assert.equal(pageOf(IDX.entries, { filter: 'done', pageSize: 50 }).total, 5)
  assert.equal(pageOf(IDX.entries, { filter: 'pending', pageSize: 50 }).total, 15)
  assert.equal(pageOf(IDX.entries, { query: 'p0003', pageSize: 50 }).total, 1)
  assert.equal(pageOf(IDX.entries, { query: 'RESEARCH', pageSize: 50 }).total, 10)
  assert.equal(pageOf(IDX.entries, { query: 'body p0007', pageSize: 50 }).rows[0].id, 'P0007')
  assert.equal(pageOf(IDX.entries, { query: 'research', filter: 'done', pageSize: 50 }).total, 0)
})

test('pageOf filters by one project, or by unfiled prompts', () => {
  const idx = lightIndex(loaded([mk('P0001', { project: 'Alpha' }), mk('P0002', { project: undefined }), mk('P0003', { project: 'Beta' }), mk('P0004', { project: 'Alpha' })]))
  assert.deepEqual(pageOf(idx.entries, { project: 'Alpha', pageSize: 50 }).rows.map(r => r.id), ['P0001', 'P0004'])
  assert.deepEqual(pageOf(idx.entries, { project: '__unfiled__', pageSize: 50 }).rows.map(r => r.id), ['P0002'])
  assert.equal(pageOf(idx.entries, { project: '', pageSize: 50 }).total, 4)
  assert.equal(pageOf(idx.entries, { project: 'Alpha', filter: 'done', pageSize: 50 }).total, 0)
})

test('previewBody shows the first lines and says how much is hidden', () => {
  const body = Array.from({ length: 10 }, (_, i) => 'line ' + (i + 1)).join('\n')
  const p = previewBody(body, { maxLines: 4, maxChars: 1000 })
  assert.equal(p.text, 'line 1\nline 2\nline 3\nline 4')
  assert.equal(p.hiddenLines, 6)
  assert.equal(p.truncated, true)
  const whole = previewBody('a\nb', { maxLines: 4, maxChars: 1000 })
  assert.deepEqual([whole.text, whole.hiddenLines, whole.truncated], ['a\nb', 0, false])
  const long = previewBody('x'.repeat(50), { maxLines: 4, maxChars: 10 })
  assert.equal(long.text.length, 10)
  assert.equal(long.truncated, true)
  assert.equal(previewBody(undefined, { maxLines: 4, maxChars: 10 }).text, '')
})

test('previewBody strips control characters other than tab and newline, for display only', () => {
  assert.equal(previewBody('a\r\nb\u001b[31mc', { maxLines: 5, maxChars: 100 }).text, 'a\nb[31mc')
})

test('runLine says exactly what happened and nothing more', () => {
  assert.equal(runLine(null), null)
  assert.equal(runLine({ state: 'sending', id: 'P0003' }), 'Sending P0003…')
  assert.match(runLine({ state: 'sending', id: 'P0003', slow: true }), /Still waiting for Claude Code\. P0003 has not been accepted yet\./)
  assert.equal(runLine({ state: 'accepted', id: 'P0003' }), 'P0003 accepted by Claude Code.')
  assert.equal(runLine({ state: 'accepted', id: 'P0003', finished: true }), 'P0003 accepted by Claude Code. Its turn has finished.')
  assert.match(runLine({ state: 'accepted-changed', id: 'P0003' }), /accepted, but another plugin changed the text/)
  assert.equal(runLine({ state: 'refused', id: 'P0003', reason: 'blocked' }), 'P0003 refused: blocked')
  assert.equal(runLine({ state: 'failed', id: 'P0003', reason: 'boom' }), 'P0003 failed: boom')
  assert.equal(runLine({ state: 'idle', id: 'P0003' }), null)
})
