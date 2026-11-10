// Guarded writes to prompts.md. `fs` is { read, stat, write } (the mod passes $.fs, which
// can only replace a whole file), so safety comes from procedure: re-read, compare content
// and mtime right before writing, keep a .bak, write, re-read to verify, and refuse any edit
// that would alter an entry it does not own. Pure: no import from `claude-code`.

import { loadVault } from './vault.mjs'
import { parseVault } from './grammar.mjs'

const fail = (error, message) => ({ ok: false, error, message })

/** Serialises writes within this session so two mod writes never overlap. */
export function createWriteQueue() {
  let tail = Promise.resolve()
  return {
    run(fn) {
      const p = tail.then(fn, fn)
      tail = p.then(
        () => undefined,
        () => undefined,
      )
      return p
    },
  }
}

function intact(oldVault, newText, touched, added) {
  const next = parseVault(newText)
  for (const e of oldVault.entries) {
    if (e.id === touched) continue
    if (!next.entries.some(x => x.id === e.id && x.raw === e.raw)) return false
  }
  return next.entries.filter(x => !oldVault.entries.some(o => o.id === x.id)).every(x => x.id === added)
}

/**
 * Apply `edit(text)` (a function from edit.mjs) to the vault safely.
 * @param {{ fs: any, path: string, queue?: { run: Function }, retries?: number }} deps
 * @param {(text: string) => any} edit
 * @param {{ touched?: string, retries?: number }} [opts] `touched`: the one id the edit may change
 */
export function mutateVault(deps, edit, opts = {}) {
  const retries = opts.retries ?? deps.retries ?? 3
  const { fs, path } = deps

  const attemptAll = async () => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      const v = await loadVault(fs, path)
      if (!v.ok) return v

      const r = edit(v.text)
      if (!r.ok || !r.changed) return r
      if (!intact(v, r.text, opts.touched, r.id)) {
        return fail('integrity', 'The edit would have changed another prompt, so nothing was written.')
      }

      let st
      let again
      try {
        st = await fs.stat(path)
        again = await fs.read(path)
      } catch (err) {
        return fail('unreadable', `Cannot re-read ${path}: ${String(err?.message ?? err)}`)
      }
      if (st.mtimeMs !== v.mtimeMs || again !== v.text) continue

      const backup = path + '.bak'
      try {
        await fs.write(backup, v.text)
        await fs.write(path, r.text)
      } catch (err) {
        return fail('write-failed', `Could not write ${path}: ${String(err?.message ?? err)}`)
      }

      let back
      try {
        back = await fs.read(path)
      } catch (err) {
        return fail('verify-failed', `Wrote ${path} but could not read it back: ${String(err?.message ?? err)}. The previous text is in ${backup}.`)
      }
      if (back !== r.text) {
        return fail('verify-failed', `Wrote ${path} but what is on disk differs from what was written. The previous text is in ${backup}.`)
      }
      return { ...r, backup }
    }
    return fail('vault-changed', 'The vault changed while saving. Nothing was written. Try again.')
  }

  return deps.queue ? deps.queue.run(attemptAll) : attemptAll()
}
