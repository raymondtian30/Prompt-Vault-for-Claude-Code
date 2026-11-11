// `/vault update`: find the newest GitHub release and move the installed mod to it.
// Pure over injected deps; no import from `claude-code`. The only thing taken from the
// network is a validated x.y.z version used in a message; the commands that run are fixed.

export const RELEASES_URL = 'https://api.github.com/repos/raymondtian30/Prompt-Vault-for-Claude-Code/releases/latest'

export const UPDATE_ARGV = [
  ['claude', 'plugin', 'marketplace', 'update', 'prompt-vault-for-claude-code'],
  ['claude', 'plugin', 'update', 'prompt-vault-mod@prompt-vault-for-claude-code'],
]

/** [major, minor, patch] from "v1.2.3" or "1.2.3"; null for anything else. */
export function parseVersion(s) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(typeof s === 'string' ? s : '')
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

export function compareVersions(a, b) {
  const x = parseVersion(a)
  const y = parseVersion(b)
  for (let i = 0; i < 3; i++) {
    if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1
  }
  return 0
}

/** Read GitHub's "latest release" JSON. Drafts, prereleases and odd tags are refused. */
export function parseRelease(text) {
  let j
  try {
    j = JSON.parse(text)
  } catch {
    return { ok: false, message: 'GitHub answered with something that is not a release.' }
  }
  if (!j || typeof j.tag_name !== 'string' || j.draft || j.prerelease) {
    return { ok: false, message: 'GitHub has no published release to update to.' }
  }
  const v = parseVersion(j.tag_name)
  if (!v) return { ok: false, message: `The latest release tag "${String(j.tag_name).slice(0, 40)}" is not a version number.` }
  return { ok: true, version: v.join('.'), url: typeof j.html_url === 'string' ? j.html_url : undefined }
}

const tail = s => String(s ?? '').trim().split('\n').slice(-3).join(' ').slice(0, 300)

/**
 * @param {{ currentVersion: string, fetchRelease: (url: string) => Promise<{ status: number, ok: boolean, text: string }>, run: (argv: string[]) => Promise<{ exitCode: number, stdout: string, stderr: string }> }} deps
 * @param {{ apply: boolean }} opts apply false only checks
 */
export async function runUpdate(deps, { apply }) {
  let res
  try {
    res = await deps.fetchRelease(RELEASES_URL)
  } catch (err) {
    return { ok: false, state: 'error', message: `Could not reach GitHub to look for a release: ${String(err?.message ?? err)}` }
  }
  if (!res || !res.ok) {
    return { ok: false, state: 'error', message: `GitHub did not return the latest release (HTTP ${res?.status ?? '?'}). Try again later.` }
  }
  const rel = parseRelease(res.text)
  if (!rel.ok) return { ok: false, state: 'error', message: rel.message }

  const cmp = compareVersions(rel.version, deps.currentVersion)
  if (cmp === 0) return { ok: true, state: 'up-to-date', version: rel.version, message: `Prompt Vault ${deps.currentVersion} is the latest release.` }
  if (cmp < 0) {
    return { ok: true, state: 'ahead', version: rel.version, message: `Prompt Vault ${deps.currentVersion} is newer than the latest release (${rel.version}); nothing to update.` }
  }
  if (!apply) {
    return { ok: true, state: 'available', version: rel.version, url: rel.url, message: `Version ${rel.version} is available (you have ${deps.currentVersion}). Run /vault update to install it.` }
  }

  for (const argv of UPDATE_ARGV) {
    let out
    try {
      out = await deps.run(argv)
    } catch {
      return {
        ok: false,
        state: 'manual',
        version: rel.version,
        message: `This session cannot run commands, so run these in a terminal, then start a new Claude Code session:\n${UPDATE_ARGV.map(a => a.join(' ')).join('\n')}`,
      }
    }
    if (out.exitCode !== 0) {
      return { ok: false, state: 'failed', version: rel.version, message: `\`${argv.join(' ')}\` failed (exit ${out.exitCode}): ${tail(out.stderr || out.stdout)}` }
    }
  }
  return { ok: true, state: 'updated', version: rel.version, url: rel.url, message: `Updated Prompt Vault to ${rel.version}. Start a new Claude Code session to use it.` }
}
