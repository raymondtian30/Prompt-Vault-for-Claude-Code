import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseVault, renderEntry } from '../mod/hooks/lib/grammar.mjs'
import { setDone, addEntry, renameProject } from '../mod/hooks/lib/edit.mjs'
import { mutateVault, createWriteQueue } from '../mod/hooks/lib/writer.mjs'

const P = '/v/prompts.md'
const mk = (id, over = {}) =>
  renderEntry({ id, done: false, title: 'T ' + id, project: 'Alpha', created: '2026-11-09', body: 'body ' + id, ...over })
const TEXT = `# DB\n\n<!-- PROMPTS START -->\n${mk('P0001')}${mk('P0002')}<!-- PROMPTS END -->\n`

function memfs(initial = TEXT) {
  const s = { files: { [P]: initial }, mtime: 1000, writes: [], reads: 0, stats: 0, hook: {} }
  s.read = async p => {
    s.reads++
    if (s.hook.read) return s.hook.read(p, s)
    if (!(p in s.files)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    return s.files[p]
  }
  s.stat = async p => {
    s.stats++
    if (!(p in s.files)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    if (s.hook.stat) return s.hook.stat(p, s)
    return { kind: 'file', size: s.files[p].length, mtimeMs: s.mtime }
  }
  s.write = async (p, t) => {
    if (s.hook.write) return s.hook.write(p, t, s)
    s.writes.push(p)
    s.files[p] = t
    s.mtime += 1
  }
  return s
}

test('a change writes a .bak of the old text, then the new text, and verifies by re-reading', async () => {
  const fs = memfs()
  const r = await mutateVault({ fs, path: P }, t => setDone(t, 'P0001', true), { touched: 'P0001' })
  assert.equal(r.ok, true)
  assert.equal(fs.files[P + '.bak'], TEXT)
  assert.equal(fs.files[P], setDone(TEXT, 'P0001', true).text)
  assert.deepEqual(fs.writes, [P + '.bak', P])
})

test('an edit that changes nothing writes nothing', async () => {
  const fs = memfs()
  const r = await mutateVault({ fs, path: P }, t => setDone(t, 'P0001', false), { touched: 'P0001' })
  assert.deepEqual([r.ok, r.changed], [true, false])
  assert.equal(fs.writes.length, 0)
})

test('an edit that fails (unknown id) writes nothing and passes its reason through', async () => {
  const fs = memfs()
  const r = await mutateVault({ fs, path: P }, t => setDone(t, 'P0099', true), { touched: 'P0099' })
  assert.deepEqual([r.ok, r.error], [false, 'not-found'])
  assert.equal(fs.writes.length, 0)
})

test('if the file changes between the read and the write, it re-reads and edits the fresh text', async () => {
  const fs = memfs()
  let first = true
  const realStat = fs.stat
  fs.hook.stat = async (p, s) => {
    const st = { kind: 'file', size: 1, mtimeMs: s.mtime }
    if (first && s.stats >= 2) {
      first = false
      // someone else (the skill) appended P0003 right now
      s.files[P] = addEntry(s.files[P], { title: 'Skill added', project: 'Other', created: '2026-11-10', body: 'x' }).text
      s.mtime += 5
      return { ...st, mtimeMs: s.mtime }
    }
    return st
  }
  void realStat
  const r = await mutateVault({ fs, path: P }, t => setDone(t, 'P0001', true), { touched: 'P0001' })
  assert.equal(r.ok, true)
  const ids = parseVault(fs.files[P]).entries.map(e => e.id)
  assert.deepEqual(ids, ['P0001', 'P0002', 'P0003'])
  assert.equal(parseVault(fs.files[P]).entries[0].done, true)
})

test('content that changed under an unchanged mtime is still caught', async () => {
  const fs = memfs()
  let n = 0
  fs.hook.read = async (p, s) => {
    n++
    if (n === 2) return s.files[p] + '\n<!-- sneaky -->'
    return s.files[p]
  }
  const r = await mutateVault({ fs, path: P }, t => setDone(t, 'P0001', true), { touched: 'P0001' })
  assert.equal(r.ok, true)
  assert.ok(n >= 3, 'retried after the mismatch')
})

test('a vault that keeps changing is reported as changed and nothing is written', async () => {
  const fs = memfs()
  fs.hook.stat = async (p, s) => ({ kind: 'file', size: 1, mtimeMs: ++s.mtime })
  const r = await mutateVault({ fs, path: P }, t => setDone(t, 'P0001', true), { touched: 'P0001', retries: 3 })
  assert.deepEqual([r.ok, r.error], [false, 'vault-changed'])
  assert.equal(fs.writes.length, 0)
})

test('an unreadable or missing vault is never written', async () => {
  const fs = memfs()
  delete fs.files[P]
  const r = await mutateVault({ fs, path: P }, t => setDone(t, 'P0001', true), { touched: 'P0001' })
  assert.equal(r.ok, false)
  assert.equal(r.error, 'missing')
  assert.equal(fs.writes.length, 0)
})

test('a failed write is reported', async () => {
  const fs = memfs()
  fs.hook.write = async p => {
    if (p === P) throw new Error('disk full')
    fs.files[p] = 'bak'
  }
  const r = await mutateVault({ fs, path: P }, t => setDone(t, 'P0001', true), { touched: 'P0001' })
  assert.deepEqual([r.ok, r.error], [false, 'write-failed'])
  assert.match(r.message, /disk full/)
})

test('if the re-read after writing differs, it says so and points at the backup', async () => {
  const fs = memfs()
  let wrote = false
  fs.hook.write = async (p, t, s) => {
    s.files[p] = t
    s.mtime++
    if (p === P) wrote = true
  }
  const realRead = fs.read
  fs.hook.read = async p => (wrote ? 'TRUNCATED' : fs.files[p])
  void realRead
  const r = await mutateVault({ fs, path: P }, t => setDone(t, 'P0001', true), { touched: 'P0001' })
  assert.deepEqual([r.ok, r.error], [false, 'verify-failed'])
  assert.match(r.message, /prompts\.md\.bak/)
})

test('an edit that would alter an entry it does not own is refused before any write', async () => {
  const fs = memfs()
  const buggy = t => ({ ok: true, changed: true, text: t.replace('body P0002', 'tampered') })
  const r = await mutateVault({ fs, path: P }, buggy, { touched: 'P0001' })
  assert.deepEqual([r.ok, r.error], [false, 'integrity'])
  assert.equal(fs.writes.length, 0)
})

test('two adds in a row through the queue get different ids and both land', async () => {
  const fs = memfs()
  const queue = createWriteQueue()
  const add = title => mutateVault({ fs, path: P, queue }, t => addEntry(t, { title, project: 'Other', created: '2026-11-10', body: 'b ' + title }), {})
  const [a, b] = await Promise.all([add('one'), add('two')])
  assert.equal(a.ok && b.ok, true)
  assert.notEqual(a.id, b.id)
  assert.deepEqual(parseVault(fs.files[P]).entries.map(e => e.title), ['T P0001', 'T P0002', 'one', 'two'])
})

test('an edit that changes several prompts names them in its result and passes the integrity check', async () => {
  const fs = memfs()
  const r = await mutateVault({ fs, path: P }, t => renameProject(t, 'Alpha', 'Renamed'), {})
  assert.equal(r.ok, true)
  assert.deepEqual(r.touched, ['P0001', 'P0002'])
  assert.deepEqual(parseVault(fs.files[P]).entries.map(e => e.project), ['Renamed', 'Renamed'])
})

test('an edit that also changes a prompt it did not name is refused', async () => {
  const fs = memfs()
  const sloppy = t => ({ ...renameProject(t, 'Alpha', 'Renamed'), touched: ['P0001'] })
  const r = await mutateVault({ fs, path: P }, sloppy, {})
  assert.deepEqual([r.ok, r.error], [false, 'integrity'])
  assert.equal(fs.writes.length, 0)
})
