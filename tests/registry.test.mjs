import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseVault, renderEntry } from '../mod/hooks/lib/grammar.mjs'
import { OPERATIONS, createHandlers, parseCommand, argumentHint } from '../mod/hooks/lib/registry.mjs'

const mk = (id, over = {}) =>
  renderEntry({ id, done: false, title: 'Title ' + id, project: 'Claude Code', created: '2026-11-10', body: 'body of ' + id, ...over })
const vaultOf = entries => ({
  ok: true,
  ...parseVault(`# DB\n\n<!-- PROMPTS START -->\n${entries.join('')}<!-- PROMPTS END -->\n`),
})
const V = vaultOf([
  mk('P0001', { priority: 'High', title: 'Token Savior' }),
  mk('P0002', { project: 'Research', priority: 'Low', done: true, body: 'Look into Code Explorer' }),
  mk('P0003'),
  mk('P0004', { project: 'Other', priority: 'Medium' }),
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

test('projects lists each project with its count, then the unfiled count', async () => {
  const r = await handlers.projects({ vault: V }, '')
  assert.deepEqual(r.data, {
    projects: [
      { name: 'Claude Code', count: 2 },
      { name: 'Research', count: 1 },
      { name: 'Other', count: 1 },
    ],
    unfiled: 0,
  })
  assert.match(r.details, /Claude Code: 2/)
  const withUnfiled = await handlers.projects({ vault: vaultOf([mk('P0001', { project: undefined }), mk('P0002', { project: 'A' })]) }, '')
  assert.match(withUnfiled.details, /Unfiled: 1/)
  assert.equal((await handlers.projects({ vault: vaultOf([]) }, '')).text, 'No projects yet.')
})

test('list can be limited to one project, ignoring case, or to unfiled prompts', async () => {
  const withUnfiled = vaultOf([mk('P0001', { project: 'Alpha' }), mk('P0002', { project: undefined }), mk('P0003', { project: 'Alpha' })])
  const alpha = await handlers.list({ vault: withUnfiled }, 'alpha')
  assert.deepEqual(alpha.data.map(e => e.id), ['P0001', 'P0003'])
  assert.deepEqual(alpha.view, { filter: 'all', project: 'Alpha' })
  assert.deepEqual((await handlers.list({ vault: withUnfiled }, 'pending unfiled')).view, { filter: 'pending', project: '__unfiled__' })
  assert.deepEqual((await handlers.list({ vault: withUnfiled }, '')).view, { filter: 'all', project: '' })
  assert.deepEqual((await handlers.list({ vault: withUnfiled }, 'unfiled')).data.map(e => e.id), ['P0002'])
  const none = await handlers.list({ vault: withUnfiled }, 'nonesuch')
  assert.equal(none.ok, false)
  assert.match(none.text, /No project called "nonesuch"/)
})

test('overview groups prompts by project and shows unfiled ones last', async () => {
  const v = vaultOf([mk('P0001', { project: 'Alpha' }), mk('P0002', { project: undefined }), mk('P0003', { project: 'Beta' })])
  const r = await handlers.overview({ vault: v }, '')
  assert.match(r.details, /Alpha \(1\)[\s\S]*P0001[\s\S]*Beta \(1\)[\s\S]*P0003[\s\S]*Unfiled \(1\)[\s\S]*P0002/)
})

test('queries report an unreadable vault instead of an empty list', async () => {
  const r = await handlers.list({ vault: { ok: false, error: 'missing', message: 'prompts.md does not exist.' } }, '')
  assert.equal(r.ok, false)
  assert.equal(r.text, 'prompts.md does not exist.')
})

test('run, load, refresh, help, doctor and update hand off to the host', async () => {
  const seen = []
  const ctx = {
    vault: V,
    run: async (id, source) => (seen.push(['run', id, source]), { ok: true, state: 'accepted', id }),
    load: async id => (seen.push(['load', id]), { ok: true }),
    refresh: async () => (seen.push(['refresh']), { ok: true }),
    help: async q => (seen.push(['help', q]), { ok: true, text: 'help' }),
    doctor: async () => (seen.push(['doctor']), { ok: true, text: 'doctor' }),
    update: async mode => (seen.push(['update', mode]), { ok: true, text: 'update' }),
    source: { kind: 'command', origin: { kind: 'composer' } },
  }
  assert.equal((await handlers.run(ctx, 'P0001')).ok, true)
  assert.deepEqual(seen[0], ['run', 'P0001', ctx.source])
  assert.match((await handlers.run(ctx, '')).text, /Usage: \/vault run <id>/)
  await handlers.load(ctx, 'P0001')
  await handlers.refresh(ctx, '')
  await handlers.help(ctx, 'search')
  await handlers.doctor(ctx, '')
  await handlers.update(ctx, '')
  await handlers.update(ctx, 'check')
  assert.deepEqual(seen.slice(1).map(s => s[0]), ['load', 'refresh', 'help', 'doctor', 'update', 'update'])
  assert.deepEqual(seen.filter(s => s[0] === 'update').map(s => s[1]), ['apply', 'check'])
})

// ---- write operations ----
import { parseVault as pv } from '../mod/hooks/lib/grammar.mjs'

const W_TEXT = `# DB\n\n<!-- PROMPTS START -->\n${mk('P0001')}${mk('P0002', { done: true })}<!-- PROMPTS END -->\n`
const wctx = () => {
  const calls = []
  return {
    calls,
    vault: { ok: true, ...pv(W_TEXT) },
    today: () => '2026-11-10',
    mutate: async (edit, opts) => {
      calls.push(opts)
      return edit(W_TEXT)
    },
    stop: async args => ({ ok: true, text: 'stop ' + args }),
  }
}

test('done and reopen go through the guarded mutate and name the id', async () => {
  const c = wctx()
  const d = await handlers.done(c, 'p0001')
  assert.deepEqual([d.ok, d.text], [true, 'P0001 marked done.'])
  assert.deepEqual(c.calls[0], { touched: 'P0001' })
  const r = await handlers.reopen(c, 'P0002')
  assert.equal(r.text, 'P0002 reopened.')
  assert.match((await handlers.done(c, '')).text, /Usage: \/vault done <id>/)
  assert.match((await handlers.done(c, 'P0099')).text, /No prompt P0099/)
})

test('add parses "[project[:priority]] | title | text", keeps the text whole, files into an existing project case-insensitively', async () => {
  const c = wctx()
  const ok = await handlers.add(c, 'claude code:high | My title | line one\nline | two')
  assert.equal(ok.ok, true)
  assert.match(ok.text, /Added P0003 "My title"/)
  const e = pv(ok.data.text).entries.find(x => x.id === 'P0003')
  assert.deepEqual([e.project, e.priority, e.title, e.body, e.created], ['Claude Code', 'High', 'My title', 'line one\nline | two', '2026-11-10'])
  const unfiled = await handlers.add(c, ' | Loose | text')
  assert.equal(pv(unfiled.data.text).entries.find(x => x.id === 'P0003').project, undefined)
  const fresh = await handlers.add(c, 'Brand new | T | b')
  assert.equal(pv(fresh.data.text).entries.find(x => x.id === 'P0003').project, 'Brand new')
  assert.match((await handlers.add(c, '')).text, /Usage: \/vault add/)
  assert.match((await handlers.add(c, 'My title | text')).text, /Usage: \/vault add/)
  assert.match((await handlers.add(c, 'a,b | t | b')).text, /A project name is one line/)
})

test('add into a gap takes the lowest free id', async () => {
  const c = wctx()
  c.mutate = async (edit, opts) => (c.calls.push(opts), edit(W_TEXT.replace(/## \[ \] P0001[\s\S]*?---\n/, '')))
  const r = await handlers.add(c, ' | T | b')
  assert.match(r.text, /Added P0001/)
})

test('edit changes one named field; priority clear and project clear remove them', async () => {
  const c = wctx()
  const t = await handlers.edit(c, 'P0001 title New title here')
  assert.equal(t.ok, true)
  assert.equal(pv(t.data.text).entries[0].title, 'New title here')
  const p = await handlers.edit(c, 'P0001 priority High')
  assert.equal(pv(p.data.text).entries[0].priority, 'High')
  const proj = await handlers.edit(c, 'P0001 project Beta')
  assert.equal(pv(proj.data.text).entries[0].project, 'Beta')
  const cleared = await handlers.edit(c, 'P0001 project clear')
  assert.equal(pv(cleared.data.text).entries[0].project, undefined)
  const canon = await handlers.edit(c, 'P0001 project claude CODE')
  assert.equal(canon.text, 'Nothing to change.')
  const b = await handlers.edit(c, 'P0001 body two\nlines')
  assert.equal(pv(b.data.text).entries[0].body, 'two\nlines')
  assert.match((await handlers.edit(c, 'P0001 nonsense x')).text, /Usage: \/vault edit/)
  assert.match((await handlers.edit(c, 'P0001 title Title P0001')).text, /Nothing to change/)
})

test('delete asks first and only deletes when confirmed', async () => {
  const c = wctx()
  const ask = await handlers.delete(c, 'P0001')
  assert.equal(ask.ok, true)
  assert.match(ask.text, /\/vault delete P0001 confirm/)
  assert.equal(c.calls.length, 0)
  const done = await handlers.delete(c, 'P0001 confirm')
  assert.equal(done.text, 'Deleted P0001.')
  assert.equal(pv(done.data.text).entries.length, 1)
  assert.match((await handlers.delete(c, '')).text, /Usage: \/vault delete <id>/)
})

test('stop hands off to the host', async () => {
  assert.equal((await handlers.stop(wctx(), 'confirm')).text, 'stop confirm')
})

test('project new, rename and delete work through the guarded mutate', async () => {
  const c = wctx()
  const made = await handlers.project(c, 'new Gamma')
  assert.equal(made.text, 'Created project "Gamma".')
  assert.deepEqual(pv(made.data.text).header.projects, ['Gamma'])
  assert.match((await handlers.project(c, 'new claude code')).text, /already a project/)
  const renamed = await handlers.project(c, 'rename Claude Code | Core')
  assert.equal(renamed.text, 'Renamed "Claude Code" to "Core" (2 prompts moved).')
  assert.deepEqual(c.calls.at(-1), {})
  const ask = await handlers.project(c, 'delete Claude Code')
  assert.match(ask.text, /unfiles its 2 prompts/)
  assert.match(ask.text, /\/vault project delete Claude Code confirm/)
  const before = c.calls.length
  const gone = await handlers.project(c, 'delete Claude Code confirm')
  assert.equal(gone.text, 'Deleted project "Claude Code". Its 2 prompts are kept, now unfiled.')
  assert.equal(c.calls.length, before + 1)
  assert.match((await handlers.project(c, '')).text, /Usage: \/vault project/)
  assert.match((await handlers.project(c, 'rename OnlyOne')).text, /Usage: \/vault project rename/)
  assert.match((await handlers.project(c, 'delete Nope confirm')).text, /no project called "Nope"/i)
})

test('every skill command has a registry entry that mirrors it', () => {
  const skillCommands = ['overview', 'add', 'done', 'edit', 'search', 'delete', 'next', 'send', 'list', 'projects']
  const mirrored = new Set(OPERATIONS.map(o => o.skillEquivalent).filter(Boolean))
  for (const c of skillCommands) assert.ok(mirrored.has(c), c)
})
