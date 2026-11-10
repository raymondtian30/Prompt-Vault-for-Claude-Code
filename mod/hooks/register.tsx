// Prompt Vault mod: wiring between Claude Code and the pure modules in ./lib.
// Every function that takes `$` is a top-level declaration (the validator follows `$`
// only through those). Drawing hooks never write state; handlers do.
import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { PaneScreen, Launcher } from './ui/views.tsx'
import { initialExec, reduce } from './lib/runstate.mjs'
import { runPrompt } from './lib/execute.mjs'
import { loadVault, resolveVaultPath } from './lib/vault.mjs'
import { mutateVault, createWriteQueue } from './lib/writer.mjs'
import { setDone, addEntry, editEntry, deleteEntry } from './lib/edit.mjs'
import { createHandlers, parseCommand, argumentHint } from './lib/registry.mjs'
import { lightIndex, lightEntry, previewBody, runLine } from './lib/viewmodel.mjs'
import { MOD_VERSION } from './lib/config.mjs'

const PANE = 'vault'
const MAX_EDIT_CHARS = 100000
const EMPTY_SEED = { title: '', category: '', priority: '', body: '' }
const VIEW0 = {
  screen: 'menu',
  page: 0,
  query: '',
  filter: 'all',
  selectedId: null,
  pendingDelete: null,
  pendingStop: false,
  notice: null,
  helpQuery: '',
  formMode: 'add',
  formId: null,
  seed: EMPTY_SEED,
  formError: null,
}

const exec = atom({ plugin: 'prompt-vault-mod', key: 'exec' } as const, initialExec(), { shape: 'exec-1' })
const view = atom({ plugin: 'prompt-vault-mod', key: 'view' } as const, VIEW0, { shape: 'view-1' })
const index = atom({ plugin: 'prompt-vault-mod', key: 'index' } as const, null, { shape: 'index-1' })
const detail = atom({ plugin: 'prompt-vault-mod', key: 'detail' } as const, null, { shape: 'detail-1' })
const form = atom({ plugin: 'prompt-vault-mod', key: 'form' } as const, { ...EMPTY_SEED, runId: '' }, { shape: 'form-1' })

const queue = createWriteQueue()
const handlers: Record<string, any> = createHandlers()
let tokenSeq = 0

// ---------- vault access ----------

function fsOf($: any) {
  return {
    read: (p: string) => $.fs.read(p),
    stat: (p: string) => $.fs.stat(p),
    write: (p: string, t: string) => $.fs.write(p, t),
  }
}

async function vaultPath($: any, options: any) {
  const home = await $.env.get('HOME')
  return resolveVaultPath({ home, vaultDir: String(options.vaultDir ?? '') })
}

async function readVault($: any, options: any): Promise<any> {
  const p: any = await vaultPath($, options)
  if (!p.ok) return p
  return loadVault(fsOf($), p.path)
}

function setView($: any, patch: any) {
  return update($, view, (s: any) => ({ ...s, ...patch }))
}

async function refreshIndex($: any, options: any) {
  const v = await readVault($, options)
  await update($, index, () => lightIndex(v))
  return v
}

async function loadDetail($: any, options: any, id: string) {
  const v = await readVault($, options)
  const e = v.ok ? v.entries.find((x: any) => x.id === id) : undefined
  await update($, detail, () =>
    e ? { ...lightEntry(e), hay: undefined, preview: previewBody(e.body, { maxLines: 6, maxChars: 600 }) } : null,
  )
  return e
}

async function mutate($: any, options: any, edit: any, opts: any) {
  const p: any = await vaultPath($, options)
  if (!p.ok) return { ok: false, error: p.error, message: p.message }
  const r: any = await mutateVault({ fs: fsOf($), path: p.path, queue }, edit, opts)
  await refreshIndex($, options)
  const sel = (await read($, view)).selectedId
  if (r.ok && sel) await loadDetail($, options, sel)
  return r
}

function todayOf(ms: number) {
  const d = new Date(ms)
  const two = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`
}

// ---------- execute ----------

function execDeps($: any, options: any) {
  return {
    loadVault: () => readVault($, options),
    getExec: () => read($, exec),
    dispatch: (ev: any) => update($, exec, (s: any) => reduce(s, ev)),
    submit: (args: any) => $.prompt.submit(args),
    newToken: () => `${++tokenSeq}-${Math.random().toString(36).slice(2, 8)}`,
    now: () => $.clock.now(),
    log: (line: string) => $.ui.log(line, { to: 'debug' }),
    startTimer: (ms: number, fn: () => void) => {
      const t = $.clock.after(ms, fn)
      return () => t.cancel()
    },
    settings: {
      submitAsUser: options.submitAsUser !== false,
      confirmNonClaudeCodeCategories: options.confirmNonClaudeCodeCategories !== false,
    },
  }
}

async function afterRun($: any, r: any) {
  if (r.ok) {
    const s = await read($, exec)
    $.ui.status(`Prompt Vault: ${runLine(s.run)}`)
    $.ui.toast(r.state === 'accepted' ? `${r.id} accepted by Claude Code` : `${r.id} accepted, text changed by another plugin`)
  } else if (r.code !== 'needs-confirm') {
    $.ui.toast(r.message)
  }
}

async function pressRun($: any, options: any, id: string, confirmed: boolean) {
  const r: any = await runPrompt(execDeps($, options), { id, confirmed, source: { kind: 'press' } })
  if (!r.ok && !r.state) await setView($, { notice: r.message })
  await afterRun($, r)
  return r
}

async function commandRun($: any, options: any, id: string, source: any) {
  const p: Promise<any> = runPrompt(execDeps($, options), { id, confirmed: true, source })
  const first: any = await Promise.race([p, $.clock.sleep(300).then(() => null)])
  void p.then((r: any) => afterRun($, r))
  if (first === null) return { ok: true, text: `Sending ${id}… the Prompt Vault pane shows the result.` }
  return first.ok ? { ok: true, text: `${id} accepted by Claude Code.` } : { ok: false, text: first.message }
}

async function stopTurn($: any, confirmed: boolean) {
  const s: any = await read($, exec)
  const turnId = s.slot && s.slot.turnId
  if (!turnId || !s.turn.running) return { ok: false, text: 'No turn started by Execute is running.' }
  if (!confirmed) return { ok: true, text: 'Stopping can leave a tool half-finished. Run /vault stop confirm to stop it.' }
  try {
    await $.turn.abort({ turnId })
    return { ok: true, text: 'Asked Claude Code to stop the turn.' }
  } catch (err) {
    return { ok: false, text: `The turn could not be stopped (it may have ended): ${String((err as any)?.message ?? err)}` }
  }
}

async function loadIntoBox($: any, options: any, id: string) {
  const v = await readVault($, options)
  if (!v.ok) return { ok: false, text: v.message }
  const e = v.entries.find((x: any) => x.id === id)
  if (!e) return { ok: false, text: `No prompt ${id} in the vault.` }
  if (e.error || e.legacy || e.duplicate || (e.body ?? '').trim() === '') {
    return { ok: false, text: `${id} cannot be loaded: its entry is not safe to read here.` }
  }
  const box = await $.prompt.read()
  const filled = await $.prompt.fill(
    box.text === '' ? { text: e.body, mode: 'replace' } : { text: '\n' + e.body, mode: 'append' },
  )
  return filled.isFilled
    ? { ok: true, text: `${id} is in the prompt box. Press Enter to send it as typed.` }
    : { ok: false, text: 'The prompt box could not take the text right now (a dialog may be open).' }
}

// ---------- pane and commands ----------

async function openPane($: any) {
  const r = await $.ui.open({ id: PANE, title: 'Prompt Vault', focus: true, closeOnEscape: true, rows: 20 })
  if (!r.isPlaced) $.ui.toast(`Prompt Vault pane could not open: ${r.reason ?? 'no room'}`)
  return r
}

async function togglePane($: any, options: any) {
  const open = (await $.ui.panes()).some((p: any) => p.id === PANE)
  if (open) return $.ui.close({ id: PANE })
  await refreshIndex($, options)
  await setView($, { ...VIEW0 })
  return openPane($)
}

async function doctor($: any, options: any) {
  const surfaces = await $.session.surfaces()
  const v = await $.session.version()
  const panes = await $.ui.panes()
  const p: any = await vaultPath($, options)
  const lines = [
    `Prompt Vault mod ${MOD_VERSION} on Claude Code ${v.version}`,
    `Surfaces: ${surfaces.join(', ') || 'none'}; pane ${panes.some((x: any) => x.id === PANE && x.isPlaced) ? 'open' : 'closed'}`,
  ]
  if (!p.ok) lines.push(p.message)
  else {
    const loaded: any = await loadVault(fsOf($), p.path)
    lines.push(loaded.ok ? `Vault ${p.path}: ${loaded.entries.length} prompts, ${loaded.errors.length} problems` : loaded.message)
  }
  return { ok: true, text: lines.join('\n') }
}

async function runCommand($: any, options: any, e: any) {
  if (e.args.trim() === '') {
    await refreshIndex($, options)
    await setView($, { ...VIEW0 })
    const r = await openPane($)
    return { text: r.isPlaced ? 'Prompt Vault opened.' : 'Prompt Vault could not open its pane here. Try /vault help.' }
  }
  const parsed: any = parseCommand(e.args)
  if (parsed.error) return { text: `Unknown /vault command "${parsed.input}". Try: ${parsed.known.join(', ')}.` }
  const v = await readVault($, options)
  const nowMs = await $.clock.now()
  const ctx = {
    vault: v,
    source: { kind: 'command', origin: e.origin },
    today: () => todayOf(nowMs),
    mutate: (edit: any, opts: any) => mutate($, options, edit, opts),
    run: (id: string, source: any) => commandRun($, options, id, source),
    load: (id: string) => loadIntoBox($, options, id),
    refresh: async () => {
      await refreshIndex($, options)
      return { ok: true, text: 'Vault re-read.' }
    },
    help: async (q: string) => {
      await setView($, { ...VIEW0, screen: 'help', helpQuery: q })
      await openPane($)
      return { ok: true, text: 'Help opened in the Prompt Vault pane.' }
    },
    doctor: () => doctor($, options),
    stop: (args: string) => stopTurn($, args === 'confirm'),
  }
  const r = await handlers[parsed.op](ctx, parsed.args)
  if (r.ok && ['list', 'search', 'overview'].includes(parsed.op)) {
    const f = parsed.args.toLowerCase()
    await refreshIndex($, options)
    await setView($, {
      ...VIEW0,
      screen: 'list',
      query: parsed.op === 'search' ? parsed.args : '',
      filter: parsed.op === 'list' && (f === 'pending' || f === 'done') ? f : 'all',
    })
    await openPane($)
  } else if (r.ok && (parsed.op === 'send' || parsed.op === 'next') && r.data && r.data.id) {
    await refreshIndex($, options)
    await loadDetail($, options, r.data.id)
    await setView($, { ...VIEW0, screen: 'detail', selectedId: r.data.id })
    await openPane($)
  }
  return { text: r.text ?? (r.ok ? 'Done.' : 'Failed.') }
}

// ---------- pane actions ----------

async function openForm($: any, mode: string, id: string | null, seed: any) {
  await update($, form, (s: any) => ({ ...s, ...seed }))
  await setView($, { screen: 'form', formMode: mode, formId: id, seed, formError: null, notice: null })
}

async function saveForm($: any, options: any) {
  const f: any = await read($, form)
  const v: any = await read($, view)
  if (v.formMode === 'add') {
    const created = todayOf(await $.clock.now())
    const r = await mutate(
      $,
      options,
      (t: string) => addEntry(t, { title: f.title, category: f.category || undefined, priority: f.priority || undefined, created, body: f.body }),
      {},
    )
    if (!r.ok) return setView($, { formError: r.message })
    $.ui.toast(`Added ${r.id}`)
    return setView($, { screen: 'list', formError: null, query: '', filter: 'all', page: 0 })
  }
  const id = v.formId
  const changes: any = { title: f.title, body: f.body }
  if (f.category) changes.category = f.category
  changes.priority = f.priority === '' ? null : f.priority
  const r = await mutate($, options, (t: string) => editEntry(t, id, changes), { touched: id })
  if (!r.ok) return setView($, { formError: r.message })
  return setView($, { screen: 'detail', formError: null })
}

function makeActions($: any, options: any) {
  const go = (patch: any) => setView($, patch)
  const raw: Record<string, (...args: any[]) => any> = {
    openMenu: () => go({ screen: 'menu', notice: null, pendingDelete: null, pendingStop: false }),
    openList: async () => {
      await refreshIndex($, options)
      await go({ screen: 'list', notice: null, pendingDelete: null, pendingStop: false })
    },
    setQuery: (q: string) => go({ query: q, page: 0 }),
    setFilter: (f: string) => go({ filter: f, page: 0 }),
    setPage: (n: number) => go({ page: n }),
    openDetail: async (id: string) => {
      await loadDetail($, options, id)
      await go({ screen: 'detail', selectedId: id, pendingDelete: null, pendingStop: false, notice: null })
    },
    openRunId: () => go({ screen: 'runid', notice: null }),
    openAdd: () => openForm($, 'add', null, EMPTY_SEED),
    openEdit: async (id: string) => {
      const v = await readVault($, options)
      const e = v.ok ? v.entries.find((x: any) => x.id === id) : undefined
      if (!e) return go({ notice: `No prompt ${id} in the vault.` })
      if ((e.body ?? '').length > MAX_EDIT_CHARS) {
        return go({ notice: `${id} is ${(e.body ?? '').length} characters, too long to edit here. Edit it in prompts.md.` })
      }
      return openForm($, 'edit', id, { title: e.title, category: e.category ?? '', priority: e.priority ?? '', body: e.body ?? '' })
    },
    openHelp: () => go({ screen: 'help', notice: null }),
    setHelpQuery: (q: string) => go({ helpQuery: q }),
    close: () => $.ui.close({ id: PANE }),
    refresh: async () => {
      await refreshIndex($, options)
      await go({ notice: 'Vault re-read.' })
    },
    run: (id: string, confirmed?: boolean) => pressRun($, options, id, Boolean(confirmed)),
    runById: async (text: string | null) => {
      const typed = text !== null ? text : (await read($, form)).runId
      const id = String(typed ?? '').trim().toUpperCase()
      if (id === '') return go({ notice: 'Type a prompt ID such as P0001.' })
      return pressRun($, options, id, false)
    },
    cancelConfirm: () => update($, exec, (s: any) => reduce(s, { type: 'confirm.cancel' })),
    load: async (id: string) => {
      const r = await loadIntoBox($, options, id)
      await go({ notice: r.text })
    },
    toggleDone: async (id: string, done: boolean) => {
      const r = await mutate($, options, (t: string) => setDone(t, id, done), { touched: id })
      if (!r.ok) await go({ notice: r.message })
    },
    askDelete: (id: string) => go({ pendingDelete: id }),
    cancelDelete: () => go({ pendingDelete: null }),
    confirmDelete: async (id: string) => {
      const r = await mutate($, options, (t: string) => deleteEntry(t, id), { touched: id })
      if (r.ok) await go({ pendingDelete: null, screen: 'list', selectedId: null, notice: `Deleted ${id}.` })
      else await go({ pendingDelete: null, notice: r.message })
    },
    askStop: () => go({ pendingStop: true }),
    cancelStop: () => go({ pendingStop: false }),
    confirmStop: async () => {
      const r = await stopTurn($, true)
      await go({ pendingStop: false, notice: r.text })
    },
    reset: () => update($, exec, (s: any) => reduce(s, { type: 'reset' })),
    draftSet: (field: string, value: string) => update($, form, (s: any) => ({ ...s, [field]: value })),
    saveForm: () => saveForm($, options),
    cancelForm: async () => {
      const v: any = await read($, view)
      await go({ screen: v.formMode === 'edit' ? 'detail' : 'menu', formError: null })
    },
    clearNotice: () => go({ notice: null }),
    toggle: () => togglePane($, options),
  }
  const safe = (fn: (...args: any[]) => any) => async (...args: any[]) => {
    try {
      return await fn(...args)
    } catch (err) {
      await setView($, { notice: `Something went wrong: ${String((err as any)?.message ?? err)}` })
    }
  }
  return Object.fromEntries(Object.entries(raw).map(([k, fn]) => [k, safe(fn)]))
}

// ---------- hooks ----------

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'vault',
      description: 'Prompt Vault: open the menu, or run a subcommand (help lists them)',
      argumentHint: argumentHint(),
    })
    await refreshIndex($, options)
    return next(e)
  })

  on('command.run', { command: 'vault' }, async ($, e) => runCommand($, options, e))

  on('turn.start', async ($, e, next) => {
    await update($, exec, (s: any) => reduce(s, { type: 'turn.start', agentId: e.agentId, turnId: e.turnId }))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    await update($, exec, (s: any) => reduce(s, { type: 'turn.complete', agentId: (e as any).agentId, turnId: e.turnId }))
    const s: any = await read($, exec)
    if (!s.slot) $.ui.status(undefined)
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    await update($, exec, (s: any) => reduce(s, { type: 'session.end' }))
    $.ui.status(undefined)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    return Launcher($.ui.resolve(e), { exec: await read($, exec) }, makeActions($, options))
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const d = {
      columns: e.props.bodyColumns,
      exec: await read($, exec),
      view: await read($, view),
      index: await read($, index),
      detail: await read($, detail),
      pageSize: Number(options.pageSize) > 0 ? Number(options.pageSize) : 5,
    }
    return PaneScreen($.ui.resolve(e), d, makeActions($, options))
  })
}
