import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initialExec, reduce, canExecute } from '../mod/hooks/lib/runstate.mjs'

const claim = (token, promptId = 'P0001') => ({ type: 'claim', claim: { token, promptId, startedAt: 1 } })
const apply = (s, ...events) => events.reduce(reduce, s)

test('initial state: no turn, no slot, no run', () => {
  assert.deepEqual(initialExec(), { turn: { running: false }, slot: null, run: null })
})

test('claim takes an empty slot in the sending phase', () => {
  const s = apply(initialExec(), claim('a'))
  assert.deepEqual(s.slot, { token: 'a', promptId: 'P0001', startedAt: 1, phase: 'sending' })
  assert.equal(s.run.state, 'sending')
})

test('a second claim by another token does not take the slot; the same token is idempotent', () => {
  const first = apply(initialExec(), claim('a'))
  assert.equal(apply(first, claim('b', 'P0002')).slot.token, 'a')
  assert.deepEqual(apply(first, claim('a')), first)
})

test('subagent turns are ignored; main turns set and clear running', () => {
  const s0 = initialExec()
  assert.equal(apply(s0, { type: 'turn.start', agentId: 'sub1', turnId: 't9' }).turn.running, false)
  const s1 = apply(s0, { type: 'turn.start', turnId: 't1' })
  assert.deepEqual(s1.turn, { running: true, turnId: 't1' })
  assert.deepEqual(apply(s1, { type: 'turn.complete', turnId: 't1' }).turn, { running: false })
})

test('the first main turn after a claim is tied to the slot; only its completion releases the slot', () => {
  let s = apply(initialExec(), claim('a'), { type: 'turn.start', turnId: 't7' })
  assert.equal(s.slot.turnId, 't7')
  s = apply(s, { type: 'accepted', token: 'a', changed: false })
  assert.equal(apply(s, { type: 'turn.complete', turnId: 'other' }).slot.token, 'a')
  const done = apply(s, { type: 'turn.complete', turnId: 't7' })
  assert.equal(done.slot, null)
  assert.equal(done.run.state, 'accepted')
  assert.equal(done.run.finished, true)
})

test('accepted and accepted-changed set the run state', () => {
  const base = apply(initialExec(), claim('a'))
  assert.equal(apply(base, { type: 'accepted', token: 'a', changed: false }).run.state, 'accepted')
  assert.equal(apply(base, { type: 'accepted', token: 'a', changed: true }).run.state, 'accepted-changed')
})

test('refused and failed release the slot and keep the reason verbatim', () => {
  const base = apply(initialExec(), claim('a'))
  const r = apply(base, { type: 'refused', token: 'a', reason: 'blocked by policy' })
  assert.equal(r.slot, null)
  assert.deepEqual(r.run, { state: 'refused', id: 'P0001', reason: 'blocked by policy' })
  const f = apply(base, { type: 'failed', token: 'a', reason: 'boom' })
  assert.equal(f.slot, null)
  assert.deepEqual(f.run, { state: 'failed', id: 'P0001', reason: 'boom' })
})

test('an event for a stale token changes nothing', () => {
  const base = apply(initialExec(), claim('new'))
  assert.deepEqual(apply(base, { type: 'accepted', token: 'old', changed: false }), base)
  assert.deepEqual(apply(base, { type: 'refused', token: 'old', reason: 'x' }), base)
})

test('slow marks a still-sending run', () => {
  const s = apply(initialExec(), claim('a'), { type: 'slow', token: 'a' })
  assert.equal(s.run.slow, true)
})

test('session.end clears everything; reset clears slot and run but not the running turn', () => {
  const busy = apply(initialExec(), { type: 'turn.start', turnId: 't1' }, claim('a'))
  assert.deepEqual(apply(busy, { type: 'session.end' }), initialExec())
  const r = apply(busy, { type: 'reset' })
  assert.equal(r.slot, null)
  assert.equal(r.run, null)
  assert.equal(r.turn.running, true)
})

test('confirming and cancelling the confirmation', () => {
  const c = apply(initialExec(), { type: 'confirming', id: 'P0007' })
  assert.deepEqual(c.run, { state: 'confirming', id: 'P0007' })
  assert.equal(apply(c, { type: 'confirm.cancel' }).run, null)
})

test('canExecute is blocked by a running turn or a held slot', () => {
  assert.deepEqual(canExecute(initialExec()), { ok: true })
  assert.equal(canExecute(apply(initialExec(), { type: 'turn.start', turnId: 't1' })).code, 'busy-turn')
  assert.equal(canExecute(apply(initialExec(), claim('a'))).code, 'busy-slot')
})
