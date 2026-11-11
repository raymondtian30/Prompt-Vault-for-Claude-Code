import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseVersion, compareVersions, parseRelease, runUpdate, RELEASES_URL, UPDATE_ARGV } from '../mod/hooks/lib/update.mjs'

const release = (tag, over = {}) => JSON.stringify({ tag_name: tag, html_url: 'https://github.com/x/y/releases/tag/' + tag, draft: false, prerelease: false, ...over })
const ok = body => ({ status: 200, ok: true, text: body })

test('versions parse with or without a leading v and nothing else', () => {
  assert.deepEqual(parseVersion('v1.2.3'), [1, 2, 3])
  assert.deepEqual(parseVersion('10.0.7'), [10, 0, 7])
  for (const bad of ['1.2', 'v1.2.3-beta', '1.2.3.4', 'latest', '', undefined, '1.2.3; rm -rf /']) assert.equal(parseVersion(bad), null, String(bad))
})

test('versions compare numerically, not as text', () => {
  assert.equal(compareVersions('1.10.0', '1.9.0'), 1)
  assert.equal(compareVersions('1.1.0', 'v1.1.0'), 0)
  assert.equal(compareVersions('1.1.0', '2.0.0'), -1)
  assert.equal(compareVersions('1.1.1', '1.1.0'), 1)
})

test('a release response is read for its version and link; drafts, prereleases and junk are refused', () => {
  const good = parseRelease(release('v1.2.0'))
  assert.deepEqual([good.ok, good.version, good.url], [true, '1.2.0', 'https://github.com/x/y/releases/tag/v1.2.0'])
  assert.equal(parseRelease(release('v1.2.0', { draft: true })).ok, false)
  assert.equal(parseRelease(release('v1.2.0', { prerelease: true })).ok, false)
  assert.equal(parseRelease(release('nightly')).ok, false)
  assert.equal(parseRelease('not json').ok, false)
  assert.equal(parseRelease('{}').ok, false)
})

test('the update uses the project releases endpoint and fixed commands, never anything from the response', () => {
  assert.equal(RELEASES_URL, 'https://api.github.com/repos/raymondtian30/Prompt-Vault-for-Claude-Code/releases/latest')
  assert.deepEqual(UPDATE_ARGV, [
    ['claude', 'plugin', 'marketplace', 'update', 'prompt-vault-for-claude-code'],
    ['claude', 'plugin', 'update', 'prompt-vault-mod@prompt-vault-for-claude-code', '--scope', 'user'],
  ])
})

function deps(over = {}) {
  const calls = { fetched: [], ran: [] }
  return {
    calls,
    currentVersion: '1.1.0',
    fetchRelease: async url => (calls.fetched.push(url), ok(release('v1.2.0'))),
    run: async argv => (calls.ran.push(argv), { exitCode: 0, stdout: 'done', stderr: '' }),
    ...over,
  }
}

test('already on the latest release: nothing is run', async () => {
  const d = deps({ currentVersion: '1.2.0' })
  const r = await runUpdate(d, { apply: true })
  assert.deepEqual([r.ok, r.state], [true, 'up-to-date'])
  assert.match(r.message, /1\.2\.0/)
  assert.equal(d.calls.ran.length, 0)
})

test('ahead of the latest release (a development build): reported, nothing is run', async () => {
  const d = deps({ currentVersion: '1.3.0' })
  const r = await runUpdate(d, { apply: true })
  assert.deepEqual([r.ok, r.state], [true, 'ahead'])
  assert.equal(d.calls.ran.length, 0)
})

test('check only: says a newer release exists and runs nothing', async () => {
  const d = deps()
  const r = await runUpdate(d, { apply: false })
  assert.deepEqual([r.ok, r.state, r.version], [true, 'available', '1.2.0'])
  assert.match(r.message, /1\.2\.0.*1\.1\.0/)
  assert.deepEqual(d.calls.fetched, [RELEASES_URL])
  assert.equal(d.calls.ran.length, 0)
})

test('apply: refreshes the marketplace, then updates the plugin, in that order, then says to restart', async () => {
  const d = deps()
  const r = await runUpdate(d, { apply: true })
  assert.deepEqual([r.ok, r.state, r.version], [true, 'updated', '1.2.0'])
  assert.deepEqual(d.calls.ran, UPDATE_ARGV)
  assert.match(r.message, /new Claude Code session/)
})

test('a failing first command stops there and shows its error', async () => {
  const d = deps({ run: async argv => (d.calls.ran.push(argv), { exitCode: 1, stdout: '', stderr: 'marketplace unreachable' }) })
  const r = await runUpdate(d, { apply: true })
  assert.deepEqual([r.ok, r.state], [false, 'failed'])
  assert.match(r.message, /marketplace unreachable/)
  assert.equal(d.calls.ran.length, 1)
})

test('a failing second command is reported as a failure, not an update', async () => {
  let n = 0
  const d = deps({ run: async () => (++n === 1 ? { exitCode: 0, stdout: '', stderr: '' } : { exitCode: 2, stdout: '', stderr: 'plugin not installed' }) })
  const r = await runUpdate(d, { apply: true })
  assert.deepEqual([r.ok, r.state], [false, 'failed'])
  assert.match(r.message, /plugin not installed/)
})

test('where commands cannot run here, it gives the two commands to run by hand', async () => {
  const d = deps({ run: async () => { throw new Error('process.run is not available on this surface') } })
  const r = await runUpdate(d, { apply: true })
  assert.deepEqual([r.ok, r.state], [false, 'manual'])
  for (const argv of UPDATE_ARGV) assert.ok(r.message.includes(argv.join(' ')), argv.join(' '))
})

test('GitHub unreachable or answering badly is an error with a reason, and nothing is run', async () => {
  for (const fetchRelease of [
    async () => { throw new Error('network down') },
    async () => ({ status: 403, ok: false, text: 'rate limited' }),
    async () => ok('not json'),
  ]) {
    const d = deps({ fetchRelease })
    const r = await runUpdate(d, { apply: true })
    assert.deepEqual([r.ok, r.state], [false, 'error'])
    assert.ok(r.message.length > 10)
    assert.equal(d.calls.ran.length, 0)
  }
})
