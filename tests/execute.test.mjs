import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseVault, renderEntry } from '../mod/hooks/lib/grammar.mjs'
import { initialExec, reduce } from '../mod/hooks/lib/runstate.mjs'
import { precheck, runPrompt, fnv1a } from '../mod/hooks/lib/execute.mjs'

const mk = (id, body, over = {}) =>
  renderEntry({ id, done: false, title: 'T ' + id, category: 'Claude Code', created: '2026-11-10', body, ...over })

const NESTED = 'do the thing\n```js\nconst x = 1\n```\nend\tTAB ✓ ünï\r\nCRLF'
const wrapText = entries =>
  `# DB\n\nNext ID counter: 9\n\n<!-- PROMPTS START -->\n${entries.join('')}<!-- PROMPTS END -->\n`

const LEGACY =
  '## [ ] P0005: Old\n- Category: Claude Code\n- Created: 2026-11-09\n- Status: pending\n\n```text\none\n```js\nc\n```\ntwo\n```\n\n---\n'

const vaultOf = () => ({
  ok: true,
  ...parseVault(
    wrapText([
      mk('P0001', NESTED),
      mk('P0002', 'chatgpt prompt', { category: 'ChatGPT' }),
      mk('P0003', ''),
      mk('P0004', '  \n\t '),
      LEGACY,
      mk('P0006', 'dup a'),
      mk('P0006', 'dup b'),
      mk('P0007', 'x'.repeat(100000)),
    ]),
  ),
})

function harness(over = {}) {
  let exec = initialExec()
  const out = { submits: [], logs: [], timers: [], tokens: 0, loads: 0 }
  const deps = {
    loadVault: async () => {
      out.loads++
      return out.vault ?? vaultOf()
    },
    getExec: () => exec,
    dispatch: async ev => {
      exec = reduce(exec, ev)
    },
    submit: async args => {
      out.submits.push(args)
      return { text: args.text }
    },
    newToken: () => 'tok' + ++out.tokens,
    now: () => 1000,
    log: line => out.logs.push(line),
    startTimer: (ms, fn) => {
      const t = { ms, fn, cancelled: false }
      out.timers.push(t)
      return () => {
        t.cancelled = true
      }
    },
    settings: { submitAsUser: true, confirmNonClaudeCodeCategories: true },
    ...over,
  }
  return { deps, out, exec: () => exec, setExec: s => (exec = s) }
}

const press = { kind: 'press' }

test('Execute submits the saved body exactly, as the person, and reports accepted', async () => {
  const h = harness()
  const r = await runPrompt(h.deps, { id: 'P0001', source: press })
  assert.equal(r.ok, true)
  assert.equal(r.state, 'accepted')
  assert.equal(h.out.submits.length, 1)
  assert.equal(h.out.submits[0].text, NESTED)
  assert.equal(h.out.submits[0].asUser, true)
  assert.equal(h.exec().run.state, 'accepted')
  assert.equal(h.exec().slot.phase, 'accepted')
})

test('a 100,000-character prompt is submitted whole', async () => {
  const h = harness()
  const r = await runPrompt(h.deps, { id: 'P0007', source: press })
  assert.equal(r.ok, true)
  assert.equal(h.out.submits[0].text.length, 100000)
})

test('the asUser setting is passed through', async () => {
  const h = harness({ settings: { submitAsUser: false, confirmNonClaudeCodeCategories: true } })
  await runPrompt(h.deps, { id: 'P0001', source: press })
  assert.equal(h.out.submits[0].asUser, false)
})

test('text changed by another plugin is accepted-changed, never plain accepted', async () => {
  const h = harness({ submit: async args => ({ text: args.text + ' [masked]' }) })
  const r = await runPrompt(h.deps, { id: 'P0001', source: press })
  assert.equal(r.state, 'accepted-changed')
  assert.equal(h.exec().run.state, 'accepted-changed')
})

test('a drop is refused with the reason verbatim and frees the slot', async () => {
  const h = harness({ submit: async () => ({ drop: 'blocked by policy' }) })
  const r = await runPrompt(h.deps, { id: 'P0001', source: press })
  assert.deepEqual([r.ok, r.state, r.message], [false, 'refused', 'blocked by policy'])
  assert.equal(h.exec().slot, null)
  assert.deepEqual(h.exec().run, { state: 'refused', id: 'P0001', reason: 'blocked by policy' })
})

test('a rejected submit is failed with the reason and frees the slot', async () => {
  const h = harness({
    submit: async () => {
      throw new Error('session closed')
    },
  })
  const r = await runPrompt(h.deps, { id: 'P0001', source: press })
  assert.equal(r.state, 'failed')
  assert.match(r.message, /session closed/)
  assert.equal(h.exec().slot, null)
})

test('an unreadable vault stops before anything is claimed or submitted', async () => {
  const h = harness({ loadVault: async () => ({ ok: false, error: 'missing', message: 'prompts.md does not exist.' }) })
  const r = await runPrompt(h.deps, { id: 'P0001', source: press })
  assert.deepEqual([r.ok, r.code], [false, 'vault-unreadable'])
  assert.equal(h.out.submits.length, 0)
  assert.equal(h.exec().slot, null)
})

test('unknown id, empty body and whitespace-only body are refused before submit', async () => {
  for (const [id, code] of [['P0099', 'not-found'], ['P0003', 'empty'], ['P0004', 'empty']]) {
    const h = harness()
    const r = await runPrompt(h.deps, { id, source: press })
    assert.equal(r.code, code, id)
    assert.equal(h.out.submits.length, 0)
  }
})

test('legacy and duplicate-id entries are not run', async () => {
  for (const id of ['P0005', 'P0006']) {
    const h = harness()
    const r = await runPrompt(h.deps, { id, source: press })
    assert.equal(r.code, 'unsafe-entry', id)
    assert.equal(h.out.submits.length, 0)
  }
})

test('a running turn blocks Execute: nothing is queued', async () => {
  const h = harness()
  h.setExec(reduce(initialExec(), { type: 'turn.start', turnId: 't1' }))
  const r = await runPrompt(h.deps, { id: 'P0001', source: press })
  assert.equal(r.code, 'busy-turn')
  assert.equal(h.out.submits.length, 0)
})

test('two presses at once make exactly one submit', async () => {
  let release
  const gate = new Promise(res => (release = res))
  const h = harness({
    submit: async args => {
      h.out.submits.push(args)
      await gate
      return { text: args.text }
    },
  })
  const a = runPrompt(h.deps, { id: 'P0001', source: press })
  const b = runPrompt(h.deps, { id: 'P0001', source: press })
  await new Promise(r => setTimeout(r, 5))
  release()
  const results = await Promise.all([a, b])
  assert.equal(h.out.submits.length, 1)
  assert.equal(results.filter(r => r.ok).length, 1)
  assert.equal(results.find(r => !r.ok).code, 'busy-slot')
})

test('a prompt outside Claude Code asks for confirmation first, then runs when confirmed', async () => {
  const h = harness()
  const asked = await runPrompt(h.deps, { id: 'P0002', source: press })
  assert.deepEqual([asked.ok, asked.code, asked.state], [false, 'needs-confirm', 'confirming'])
  assert.match(asked.message, /ChatGPT/)
  assert.equal(h.out.submits.length, 0)
  assert.equal(h.exec().run.state, 'confirming')
  const go = await runPrompt(h.deps, { id: 'P0002', source: press, confirmed: true })
  assert.equal(go.ok, true)
  assert.equal(h.out.submits[0].text, 'chatgpt prompt')
})

test('the confirmation can be switched off in settings', async () => {
  const h = harness({ settings: { submitAsUser: true, confirmNonClaudeCodeCategories: false } })
  const r = await runPrompt(h.deps, { id: 'P0002', source: press })
  assert.equal(r.ok, true)
})

test('only a press or the person typing /vault may execute', async () => {
  for (const source of [
    { kind: 'command', origin: { kind: 'plugin', name: 'other' } },
    { kind: 'command', origin: { kind: 'sdk' } },
    undefined,
  ]) {
    const h = harness()
    const r = await runPrompt(h.deps, { id: 'P0001', source })
    assert.equal(r.code, 'bad-origin')
    assert.equal(h.out.submits.length, 0)
  }
  const h = harness()
  const ok = await runPrompt(h.deps, { id: 'P0001', source: { kind: 'command', origin: { kind: 'composer' } } })
  assert.equal(ok.ok, true)
})

test('a slow submit flags the run as still waiting, then still ends accepted', async () => {
  let release
  const gate = new Promise(res => (release = res))
  const h = harness({
    submit: async args => {
      await gate
      return { text: args.text }
    },
  })
  const p = runPrompt(h.deps, { id: 'P0001', source: press })
  await new Promise(r => setTimeout(r, 5))
  assert.equal(h.out.timers[0].ms, 15000)
  await h.out.timers[0].fn()
  assert.equal(h.exec().run.slow, true)
  release()
  const r = await p
  assert.equal(r.state, 'accepted')
  assert.equal(h.out.timers[0].cancelled, true)
})

test('the vault is re-read at every run', async () => {
  const h = harness()
  await runPrompt(h.deps, { id: 'P0001', source: press })
  h.setExec(initialExec())
  h.out.vault = { ok: true, ...parseVault(wrapText([mk('P0001', 'edited body')])) }
  await runPrompt(h.deps, { id: 'P0001', source: press })
  assert.equal(h.out.loads, 2)
  assert.equal(h.out.submits[1].text, 'edited body')
})

test('log lines carry id, state, length and a hash, never the prompt text', async () => {
  const h = harness()
  await runPrompt(h.deps, { id: 'P0001', source: press })
  assert.ok(h.out.logs.length >= 2)
  for (const line of h.out.logs) {
    assert.ok(!line.includes('do the thing'), line)
    assert.ok(!line.includes('const x'), line)
  }
  assert.ok(h.out.logs.some(l => l.includes('P0001') && l.includes('len=') && l.includes(fnv1a(NESTED))))
})

test('fnv1a is stable', () => {
  assert.equal(fnv1a(''), '811c9dc5')
  assert.equal(fnv1a('a'), 'e40c292c')
})

test('precheck explains each refusal in plain words', () => {
  const v = vaultOf()
  const ok = { vault: v, exec: initialExec(), confirmed: false, source: press, settings: { confirmNonClaudeCodeCategories: true } }
  assert.match(precheck({ ...ok, id: 'P0003' }).message, /empty/)
  assert.match(precheck({ ...ok, id: 'P0005' }).message, /fence/)
  assert.match(precheck({ ...ok, id: 'P0006' }).message, /more than once/)
  assert.match(precheck({ ...ok, id: 'P0099' }).message, /P0099/)
})

test('getExec may be async, as the mod reads state asynchronously', async () => {
  const base = harness()
  const h = harness({ getExec: async () => base.exec(), dispatch: base.deps.dispatch })
  const r = await runPrompt(h.deps, { id: 'P0001', source: press })
  assert.equal(r.ok, true)
  assert.equal(base.exec().run.state, 'accepted')
})

test('now may be async: the slot records a number, not a promise', async () => {
  const h = harness({ now: async () => 1234 })
  await runPrompt(h.deps, { id: 'P0001', source: press })
  assert.equal(h.exec().slot.startedAt, 1234)
})
