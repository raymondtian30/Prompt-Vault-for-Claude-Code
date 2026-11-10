// Execute run state: one global in-flight slot plus main-loop turn tracking, as a
// pure reducer so the mod can apply it with the state library's compare-and-set
// `update`. No I/O, no import from `claude-code`.
//
// Run states: sending, accepted, accepted-changed, refused, failed, confirming.
// ("Run state" is the name used everywhere: `Status:` in prompts.md already means
// pending or completed.)

export const initialExec = () => ({ turn: { running: false }, slot: null, run: null })

/**
 * @param {{ turn: { running: boolean, turnId?: string }, slot: object | null, run: object | null }} s
 * @param {object} e
 */
export function reduce(s, e) {
  switch (e.type) {
    case 'turn.start': {
      if (e.agentId !== undefined) return s
      const slot = s.slot && s.slot.turnId === undefined ? { ...s.slot, turnId: e.turnId } : s.slot
      return { ...s, turn: { running: true, turnId: e.turnId }, slot }
    }
    case 'turn.complete': {
      if (e.agentId !== undefined) return s
      const ours = s.slot !== null && s.slot.turnId !== undefined && s.slot.turnId === e.turnId
      const run = ours && s.run ? { ...s.run, finished: true } : s.run
      return { turn: { running: false }, slot: ours ? null : s.slot, run }
    }
    case 'claim': {
      if (s.slot !== null) return s
      const slot = { ...e.claim, phase: 'sending' }
      return { ...s, slot, run: { state: 'sending', id: e.claim.promptId } }
    }
    case 'accepted': {
      if (!s.slot || s.slot.token !== e.token) return s
      return {
        ...s,
        slot: { ...s.slot, phase: 'accepted' },
        run: { state: e.changed ? 'accepted-changed' : 'accepted', id: s.slot.promptId },
      }
    }
    case 'refused':
    case 'failed': {
      if (!s.slot || s.slot.token !== e.token) return s
      return { ...s, slot: null, run: { state: e.type, id: s.slot.promptId, reason: e.reason } }
    }
    case 'slow': {
      if (!s.slot || s.slot.token !== e.token || s.slot.phase !== 'sending' || !s.run) return s
      return { ...s, run: { ...s.run, slow: true } }
    }
    case 'confirming':
      return { ...s, run: { state: 'confirming', id: e.id } }
    case 'confirm.cancel':
      return s.run && s.run.state === 'confirming' ? { ...s, run: null } : s
    case 'session.end':
      return initialExec()
    case 'reset':
      return { ...s, slot: null, run: null }
    default:
      return s
  }
}

/**
 * Whether a new Execute may start now.
 * @param {ReturnType<typeof initialExec>} s
 */
export function canExecute(s) {
  if (s.turn.running) {
    return { ok: false, code: 'busy-turn', message: 'Claude Code is working. Execute is available when the turn ends.' }
  }
  if (s.slot) {
    return { ok: false, code: 'busy-slot', message: 'Another Execute is still in progress.' }
  }
  return { ok: true }
}
