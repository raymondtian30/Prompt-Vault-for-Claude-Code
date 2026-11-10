import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseVault, renderEntry } from '../mod/hooks/lib/grammar.mjs'
import { OPERATIONS, createHandlers, parseCommand, argumentHint } from '../mod/hooks/lib/registry.mjs'

const mk = (id, over = {}) =>
  renderEntry({ id, done: false, title: 'Title ' + id, category: 'Claude Code', created: '2026-11-10', body: 'body of ' + id, ...over })
const vaultOf = entries => ({
  ok: true,
  ...parseVault(`# DB\n\nNext ID counter: 9\n\n<!-- PROMPTS START -->\n${entries.join('')}<!-- PROMPTS END -->\n`),
})
const V = vaultOf([
  mk('P0001', { priority: 'High', title: 'Token Savior' }),
  mk('P0002', { category: 'Research', priority: 'Low', done: true, body: 'Look into Code Explorer' }),
  mk('P0003'),
  mk('P0004', { category: 'Other', priority: 'Medium' }),
])
const handlers = createHandlers()

test('every operation is fully described and tied to the skill or marked mod-only', () => {
  const ids = new Set()
  for (const op of OPERATIONS) {
    assert.ok(!ids.has(op.id), 'unique id ' + op.id)
    ids.add(op.id)
    assert.ok(op.name && op.syntax.startsWith('/vault') && op.description && op.section, op.id)
    assert.ok(Array.isArray(op.examples) && op.examples.length > 0, op.id + ' examples')
    assert.ok(Array.isArray(op.surfaces) && op.surfaces.length > 0, op.id + ' surfaces')
    assert.ok(Boolean(op.skillEquivalent) !== Boolean(op.modOnly), op.id + ' skillEquivalent xor modOnly')
  }
})

test('there is exactly one handler per operation and no extras', () => {
  assert.deepEqual(Object.keys(handlers).sort(), OPERATIONS.map(o => o.id).sort())
})

test('parseCommand: empty opens the menu, names are case-insensitive, args are kept whole', () => {
  assert.deepEqual(parseCommand(''), { op: 'overview', args: '' })
  assert.deepEqual(parseCommand('  list   pending '), { op: 'list', args: 'pending' })
  assert.deepEqual(parseCommand('SEARCH foo  bar'), { op: 'search', args: 'foo  bar' })
  const bad = parseCommand('nope')
  assert.equal(bad.error, 'unknown-command')
  assert.ok(bad.known.includes('list'))
})

test('argumentHint names every operation', () => {
  const hint = argumentHint()
  for (const op of OPERATIONS) assert.ok(hint.includes(op.name), op.name)
})

test('list: all, pending, done; one line each with checkbox, id, title, category, priority', async () => {
  const all = await handlers.list({ vault: V }, '')
  assert.equal(all.ok, true)
  assert.equal(all.data.length, 4)
  assert.ok(all.details.includes('[ ] P0001 Token Savior · Claude Code · High'))
  assert.ok(all.details.includes('[x] P0002'))
  assert.ok(!all.details.includes('body of'), 'no prompt text in a list')
  assert.equal((await handlers.list({ vault: V }, 'pending')).data.length, 3)
  assert.equal((await handlers.list({ vault: V }, 'done')).data.length, 1)
  assert.equal(all.text, '4 prompts (3 pending).')
})

test('overview: summary line and entries grouped by category', async () => {
  const r = await handlers.overview({ vault: V }, '')
  assert.match(r.details, /4 prompts, 1 completed, 3 pending/)
  assert.match(r.details, /Claude Code[\s\S]*P0001[\s\S]*P0003/)
  assert.match(r.details, /Research[\s\S]*P0002/)
})

test('search is case-insensitive over title, category and body, and says so when nothing matches', async () => {
  assert.deepEqual((await handlers.search({ vault: V }, 'token')).data.map(e => e.id), ['P0001'])
  assert.deepEqual((await handlers.search({ vault: V }, 'RESEARCH')).data.map(e => e.id), ['P0002'])
  assert.deepEqual((await handlers.search({ vault: V }, 'code explorer')).data.map(e => e.id), ['P0002'])
  const none = await handlers.search({ vault: V }, 'zzz')
  assert.equal(none.data.length, 0)
  assert.match(none.text, /No prompts match/)
  assert.match((await handlers.search({ vault: V }, '')).text, /Usage: \/vault search/)
})

test('next: priority wins when several pending have one, else file order; never marks done', async () => {
  assert.equal((await handlers.next({ vault: V }, '')).data.id, 'P0001')
  const noPrio = vaultOf([mk('P0003'), mk('P0004', { priority: 'Medium' })])
  assert.equal((await handlers.next({ vault: noPrio }, '')).data.id, 'P0003')
  const two = vaultOf([mk('P0004', { priority: 'Low' }), mk('P0005', { priority: 'Medium' })])
  assert.equal((await handlers.next({ vault: two }, '')).data.id, 'P0005')
  const none = await handlers.next({ vault: vaultOf([mk('P0001', { done: true })]) }, '')
  assert.match(none.text, /No pending prompts/)
})

test('send returns the entry for the UI and a short line, never the body in text', async () => {
  const r = await handlers.send({ vault: V }, 'P0001')
  assert.equal(r.data.body, 'body of P0001')
  assert.ok(!r.text.includes('body of'))
  assert.match((await handlers.send({ vault: V }, 'p0001')).text, /P0001/)
  assert.match((await handlers.send({ vault: V }, 'P0099')).text, /No prompt P0099/)
})

test('categories counts all five, including empty ones', async () => {
  const r = await handlers.categories({ vault: V }, '')
  assert.deepEqual(r.data, [
    { category: 'Claude Code', count: 2 },
    { category: 'ChatGPT', count: 0 },
    { category: 'Coding Projects', count: 0 },
    { category: 'Research', count: 1 },
    { category: 'Other', count: 1 },
  ])
})

test('queries report an unreadable vault instead of an empty list', async () => {
  const r = await handlers.list({ vault: { ok: false, error: 'missing', message: 'prompts.md does not exist.' } }, '')
  assert.equal(r.ok, false)
  assert.equal(r.text, 'prompts.md does not exist.')
})

test('run, load, refresh, help and doctor hand off to the host', async () => {
  const seen = []
  const ctx = {
    vault: V,
    run: async (id, source) => (seen.push(['run', id, source]), { ok: true, state: 'accepted', id }),
    load: async id => (seen.push(['load', id]), { ok: true }),
    refresh: async () => (seen.push(['refresh']), { ok: true }),
    help: async q => (seen.push(['help', q]), { ok: true, text: 'help' }),
    doctor: async () => (seen.push(['doctor']), { ok: true, text: 'doctor' }),
    source: { kind: 'command', origin: { kind: 'composer' } },
  }
  assert.equal((await handlers.run(ctx, 'P0001')).ok, true)
  assert.deepEqual(seen[0], ['run', 'P0001', ctx.source])
  assert.match((await handlers.run(ctx, '')).text, /Usage: \/vault run <id>/)
  await handlers.load(ctx, 'P0001')
  await handlers.refresh(ctx, '')
  await handlers.help(ctx, 'search')
  await handlers.doctor(ctx, '')
  assert.deepEqual(seen.slice(1).map(s => s[0]), ['load', 'refresh', 'help', 'doctor'])
})
