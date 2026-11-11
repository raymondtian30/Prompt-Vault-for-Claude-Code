// Execute: submit a saved prompt to Claude Code and report only what actually happened.
// Pure orchestration over injected deps; no import from `claude-code`, no vault writes.
//
// deps: { loadVault, getExec, dispatch, submit, newToken, now, log, startTimer, settings }
//   dispatch(event) applies a runstate.reduce event (the mod does it with the state
//   library's compare-and-set update); getExec() reads the current exec state
//   (sync or async).

import { canExecute } from './runstate.mjs'

export const SLOW_AFTER_MS = 15000

/** 32-bit FNV-1a of the UTF-16 code units, hex. Used in logs instead of prompt text. */
export function fnv1a(text) {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

function unsafeReason(entry) {
  if (entry.duplicate) return 'its ID appears more than once in prompts.md'
  if (entry.legacy) return 'it predates the fence rule and contains a triple-backtick line, so its end is a guess'
  if (entry.error) return `its fence is broken (${entry.error})`
  return undefined
}

/**
 * Ordered preconditions. Returns { ok: true, entry } or { ok: false, code, message }.
 * `expect` (title, created, bodyLength of the row the person clicked) guards against a reused id.
 * @param {{ vault: any, id: string, exec: any, source?: any, expect?: { title: string, created?: string, bodyLength: number } }} a
 */
export function precheck({ vault, id, exec, source, expect }) {
  const fromPerson = source && (source.kind === 'press' || (source.kind === 'command' && source.origin?.kind === 'composer'))
  if (!fromPerson) {
    return { ok: false, code: 'bad-origin', message: 'Execute only runs from a button press or your own /vault command.' }
  }
  if (!vault.ok) return { ok: false, code: 'vault-unreadable', message: vault.message }
  const entry = vault.entries.find(e => e.id === id)
  if (!entry) return { ok: false, code: 'not-found', message: `No prompt ${id} in the vault.` }
  if (expect && (entry.title !== expect.title || entry.created !== expect.created || (entry.body ?? '').length !== expect.bodyLength)) {
    return { ok: false, code: 'stale', message: `${id} has changed since the list was drawn. Refresh and look again.` }
  }
  const why = unsafeReason(entry)
  if (why) {
    return { ok: false, code: 'unsafe-entry', message: `${id} cannot be run: ${why}. Fix it in prompts.md or re-save it.` }
  }
  if (entry.body === undefined || entry.body.trim() === '') {
    return { ok: false, code: 'empty', message: `${id} has an empty prompt.` }
  }
  const free = canExecute(exec)
  if (!free.ok) return free
  return { ok: true, entry }
}

/**
 * Run one prompt. Success is reported only when submit resolves with text.
 * @param {object} deps
 * @param {{ id: string, source?: any, expect?: object }} req
 */
export async function runPrompt(deps, { id, source, expect }) {
  const vault = await deps.loadVault()
  const pre = precheck({ vault, id, exec: await deps.getExec(), source, expect })
  if (!pre.ok) return pre
  const entry = pre.entry
  const token = deps.newToken()
  await deps.dispatch({ type: 'claim', claim: { token, promptId: id, startedAt: await deps.now() } })
  if ((await deps.getExec()).slot?.token !== token) {
    return { ok: false, code: 'busy-slot', message: 'Another Execute is still in progress.' }
  }

  const note = (state, extra = '') => deps.log(`run ${id} ${state} len=${entry.body.length} hash=${fnv1a(entry.body)}${extra}`)
  note('sending')
  const cancelTimer = deps.startTimer(SLOW_AFTER_MS, () => deps.dispatch({ type: 'slow', token }))

  let result
  try {
    result = await deps.submit(deps.settings.submitAsUser ? { text: entry.body, asUser: true } : { text: entry.body })
  } catch (err) {
    cancelTimer()
    const reason = `Claude Code did not take the prompt: ${String(err?.message ?? err)}`
    await deps.dispatch({ type: 'failed', token, reason })
    note('failed')
    return { ok: false, code: 'failed', state: 'failed', message: reason }
  }
  cancelTimer()

  if (result && result.drop !== undefined) {
    await deps.dispatch({ type: 'refused', token, reason: result.drop })
    note('refused')
    return { ok: false, code: 'refused', state: 'refused', message: result.drop }
  }

  if (typeof result?.text !== 'string') {
    const reason = 'Claude Code answered without confirming it took the prompt.'
    await deps.dispatch({ type: 'failed', token, reason })
    note('failed')
    return { ok: false, code: 'failed', state: 'failed', message: reason }
  }

  const changed = result.text !== entry.body
  await deps.dispatch({ type: 'accepted', token, changed })
  const state = changed ? 'accepted-changed' : 'accepted'
  note(state)
  return { ok: true, state, id }
}
