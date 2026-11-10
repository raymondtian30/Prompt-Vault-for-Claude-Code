import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveVaultPath, loadVault, createVault, SEED, MAX_READ_BYTES } from '../mod/hooks/lib/vault.mjs'

const enoent = p => Object.assign(new Error(`ENOENT: no such file or directory, open '${p}'`), { code: 'ENOENT' })

function memfs(files = {}, { mtimeMs = 1000, sizeOverride } = {}) {
  const calls = { read: 0, write: 0 }
  return {
    files,
    calls,
    async read(p) {
      calls.read++
      if (!(p in files)) throw enoent(p)
      return files[p]
    },
    async stat(p) {
      if (!(p in files)) throw enoent(p)
      return { kind: 'file', size: sizeOverride ?? Buffer.byteLength(files[p]), mtimeMs }
    },
    async write(p, t) {
      calls.write++
      files[p] = t
    },
  }
}

const P = '/h/.claude/prompt-vault/prompts.md'
const oneEntry =
  '# DB\n\nNext ID counter: 2\n\n<!-- PROMPTS START -->\n## [ ] P0001: T\n- Category: Other\n- Created: 2026-11-10\n- Status: pending\n\n```text\nhi\n```\n\n---\n<!-- PROMPTS END -->\n'

test('vault path defaults to $HOME/.claude/prompt-vault/prompts.md', () => {
  assert.deepEqual(resolveVaultPath({ home: '/Users/x', vaultDir: '' }), {
    ok: true,
    dir: '/Users/x/.claude/prompt-vault',
    path: '/Users/x/.claude/prompt-vault/prompts.md',
  })
})

test('a vaultDir override replaces the default and drops a trailing slash', () => {
  const r = resolveVaultPath({ home: '/Users/x', vaultDir: '/tmp/copy/' })
  assert.equal(r.path, '/tmp/copy/prompts.md')
})

test('no home and no override disables the vault: no cwd fallback', () => {
  assert.deepEqual(resolveVaultPath({ home: undefined, vaultDir: '' }), {
    ok: false,
    error: 'no-home',
    message: 'HOME is not set, so the vault folder cannot be found. Set the vaultDir option or HOME.',
  })
})

test('a relative vaultDir is refused', () => {
  const r = resolveVaultPath({ home: '/Users/x', vaultDir: 'prompts' })
  assert.equal(r.ok, false)
  assert.equal(r.error, 'bad-vault-dir')
})

test('loadVault returns entries, header and the mtime it read at', async () => {
  const fs = memfs({ [P]: oneEntry }, { mtimeMs: 4242 })
  const v = await loadVault(fs, P)
  assert.equal(v.ok, true)
  assert.equal(v.entries.length, 1)
  assert.equal(v.header.counter, 2)
  assert.equal(v.mtimeMs, 4242)
  assert.equal(v.text, oneEntry)
})

test('a missing file is reported as missing, not as an empty vault', async () => {
  const v = await loadVault(memfs(), P)
  assert.equal(v.ok, false)
  assert.equal(v.error, 'missing')
})

test('a file over the read limit is refused without reading it', async () => {
  const fs = memfs({ [P]: 'x' }, { sizeOverride: MAX_READ_BYTES + 1 })
  const v = await loadVault(fs, P)
  assert.equal(v.ok, false)
  assert.equal(v.error, 'too-large')
  assert.equal(fs.calls.read, 0)
  assert.match(v.message, /4 MiB/)
})

test('a read failure is reported as unreadable with the reason', async () => {
  const fs = memfs({ [P]: 'x' })
  fs.read = async () => {
    throw new Error('EACCES: permission denied')
  }
  const v = await loadVault(fs, P)
  assert.equal(v.ok, false)
  assert.equal(v.error, 'unreadable')
  assert.match(v.message, /permission denied/)
})

test('garbage text loads as an empty vault and never throws', async () => {
  const v = await loadVault(memfs({ [P]: '\u0000\u0001 not a vault' }), P)
  assert.equal(v.ok, true)
  assert.equal(v.entries.length, 0)
})

test('createVault writes the seed header and the result loads with no entries', async () => {
  const fs = memfs()
  const made = await createVault(fs, P)
  assert.equal(made.ok, true)
  assert.equal(fs.files[P], SEED)
  const v = await loadVault(fs, P)
  assert.equal(v.entries.length, 0)
  assert.equal(v.header.counter, 1)
  assert.equal(v.hasStart && v.hasEnd, true)
})

test('createVault never overwrites an existing file', async () => {
  const fs = memfs({ [P]: oneEntry })
  const made = await createVault(fs, P)
  assert.equal(made.ok, false)
  assert.equal(made.error, 'exists')
  assert.equal(fs.files[P], oneEntry)
  assert.equal(fs.calls.write, 0)
})
