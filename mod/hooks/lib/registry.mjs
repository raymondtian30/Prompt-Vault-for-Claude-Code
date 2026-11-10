// The operation registry: one list that drives `/vault` dispatch, its argument hint,
// and the Help view. Pure: no import from `claude-code`.
//
// Each operation: id (= name), name, syntax, description, examples, section,
// surfaces (skill | slash | button), and either skillEquivalent (the /prompt-vault
// subcommand it mirrors) or modOnly. tests/drift.test.mjs checks the skill list
// against SKILL.md so the two cannot drift apart unnoticed.

import { CATEGORIES, PRIORITIES } from './grammar.mjs'
import { setDone, addEntry, editEntry, deleteEntry } from './edit.mjs'

const op = (o) => Object.freeze(o)

export const OPERATIONS = Object.freeze([
  op({
    id: 'overview', name: 'overview', syntax: '/vault overview',
    description: 'Summary of the vault: totals, then prompts grouped by category. With no argument, /vault opens the menu instead.',
    examples: ['/vault overview'], section: 'Browse', surfaces: ['skill', 'slash', 'button'], skillEquivalent: 'overview',
  }),
  op({
    id: 'list', name: 'list', syntax: '/vault list [pending|done|all]',
    description: 'One line per prompt: checkbox, ID, title, category, priority. Optionally only pending or only done prompts.',
    examples: ['/vault list', '/vault list pending'], section: 'Browse', surfaces: ['skill', 'slash', 'button'], skillEquivalent: 'list',
  }),
  op({
    id: 'search', name: 'search', syntax: '/vault search <query>',
    description: 'Case-insensitive search over title, category and prompt text.',
    examples: ['/vault search token savior'], section: 'Browse', surfaces: ['skill', 'slash', 'button'], skillEquivalent: 'search',
  }),
  op({
    id: 'next', name: 'next', syntax: '/vault next',
    description: 'Show the next unfinished prompt: when several pending prompts have a priority, High before Medium before Low, otherwise file order. Never marks it done.',
    examples: ['/vault next'], section: 'Browse', surfaces: ['skill', 'slash', 'button'], skillEquivalent: 'next',
  }),
  op({
    id: 'send', name: 'send', syntax: '/vault send <id>',
    description: 'Open one prompt in full, ready to Execute or load into the prompt box. The saved text is never altered.',
    examples: ['/vault send P0003'], section: 'Browse', surfaces: ['skill', 'slash', 'button'], skillEquivalent: 'send',
  }),
  op({
    id: 'categories', name: 'categories', syntax: '/vault categories',
    description: 'The five categories with how many prompts each holds.',
    examples: ['/vault categories'], section: 'Browse', surfaces: ['skill', 'slash', 'button'], skillEquivalent: 'categories',
  }),
  op({
    id: 'run', name: 'run', syntax: '/vault run <id>',
    description: 'Execute: submit the complete saved prompt to Claude Code as a new turn. Reports accepted only after Claude Code takes it. Blocked while Claude is working.',
    examples: ['/vault run P0003'], section: 'Execute', surfaces: ['slash', 'button'], modOnly: true,
  }),
  op({
    id: 'load', name: 'load', syntax: '/vault load <id>',
    description: 'Put a prompt into the prompt box without sending it, so you can edit it or use @file mentions and slash commands as typed.',
    examples: ['/vault load P0003'], section: 'Execute', surfaces: ['slash', 'button'], modOnly: true,
  }),
  op({
    id: 'done', name: 'done', syntax: '/vault done <id>',
    description: 'Mark a prompt completed. This is the only way a prompt is marked done; Execute and viewing never do it.',
    examples: ['/vault done P0003'], section: 'Manage', surfaces: ['skill', 'slash', 'button'], skillEquivalent: 'done',
  }),
  op({
    id: 'reopen', name: 'reopen', syntax: '/vault reopen <id>',
    description: 'Mark a completed prompt pending again.',
    examples: ['/vault reopen P0003'], section: 'Manage', surfaces: ['skill', 'slash', 'button'], skillEquivalent: 'done',
  }),
  op({
    id: 'add', name: 'add', syntax: '/vault add <category>[:<priority>] | <title> | <prompt text>',
    description: 'Save a new prompt. The category is required (no default) and is one of the five categories; the text after the second | is stored exactly as typed, newlines and | included.',
    examples: ['/vault add Research:High | Compare vector stores | List the trade-offs of ...'], section: 'Manage', surfaces: ['skill', 'slash', 'button'], skillEquivalent: 'add',
  }),
  op({
    id: 'edit', name: 'edit', syntax: '/vault edit <id> title|category|priority|body <value>',
    description: 'Change one field of a prompt. "priority clear" removes the priority. Only that prompt is rewritten; the others stay byte for byte as they were.',
    examples: ['/vault edit P0003 title Better title', '/vault edit P0003 priority clear'], section: 'Manage', surfaces: ['skill', 'slash', 'button'], skillEquivalent: 'edit',
  }),
  op({
    id: 'delete', name: 'delete', syntax: '/vault delete <id> [confirm]',
    description: 'Delete a prompt after confirmation. Its ID is never reused.',
    examples: ['/vault delete P0003', '/vault delete P0003 confirm'], section: 'Manage', surfaces: ['skill', 'slash', 'button'], skillEquivalent: 'delete',
  }),
  op({
    id: 'stop', name: 'stop', syntax: '/vault stop [confirm]',
    description: 'Stop the turn Execute started. Stopping can leave a tool half-finished, so it asks first.',
    examples: ['/vault stop', '/vault stop confirm'], section: 'Execute', surfaces: ['slash', 'button'], modOnly: true,
  }),
  op({
    id: 'refresh', name: 'refresh', syntax: '/vault refresh',
    description: 'Re-read prompts.md. The menu does this when it opens and after every change; use it after the skill or a text editor changed the file.',
    examples: ['/vault refresh'], section: 'Vault', surfaces: ['slash', 'button'], modOnly: true,
  }),
  op({
    id: 'help', name: 'help', syntax: '/vault help [search words]',
    description: 'Every command, shortcut, setting, FAQ answer and troubleshooting tip, searchable.',
    examples: ['/vault help', '/vault help execute'], section: 'Help', surfaces: ['slash', 'button'], modOnly: true,
  }),
  op({
    id: 'doctor', name: 'doctor', syntax: '/vault doctor',
    description: 'What this Claude Code build can draw, which version runs, where the vault is and whether it parses. Run it first when something does not show up.',
    examples: ['/vault doctor'], section: 'Help', surfaces: ['slash', 'button'], modOnly: true,
  }),
])

/** @param {string} argString everything after `/vault` */
export function parseCommand(argString) {
  const trimmed = (argString ?? '').trim()
  if (trimmed === '') return { op: 'overview', args: '' }
  const m = /^(\S+)(?:\s+([\s\S]*))?$/.exec(trimmed)
  const name = m[1].toLowerCase()
  const found = OPERATIONS.find(o => o.name === name)
  if (!found) {
    return { error: 'unknown-command', input: m[1], known: OPERATIONS.map(o => o.name) }
  }
  return { op: found.id, args: (m[2] ?? '').trim() === '' ? '' : m[2].trim() }
}

export const argumentHint = () => OPERATIONS.map(o => o.name).join('|')

const normId = s => String(s ?? '').trim().toUpperCase()
const line = e => `${e.done ? '[x]' : '[ ]'} ${e.id} ${e.title} · ${e.category ?? 'no category'}${e.priority ? ' · ' + e.priority : ''}`
const bad = ctx => (ctx.vault.ok ? null : { ok: false, text: ctx.vault.message })
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`

const canon = (list, v) => list.find(x => x.toLowerCase() === String(v).toLowerCase()) ?? v

async function toggle(ctx, args, done) {
  const id = normId(args.trim().split(/\s+/)[0])
  if (id === '') return { ok: false, text: `Usage: /vault ${done ? 'done' : 'reopen'} <id>` }
  const r = await ctx.mutate(t => setDone(t, id, done), { touched: id })
  if (!r.ok) return { ok: false, text: r.message }
  return { ok: true, text: r.changed ? `${id} ${done ? 'marked done' : 'reopened'}.` : `${id} was already ${done ? 'done' : 'pending'}.`, data: r }
}

const PRIORITY_RANK = { High: 0, Medium: 1, Low: 2 }

function pickNext(entries) {
  const pending = entries.filter(e => !e.done)
  const withPriority = pending.filter(e => PRIORITY_RANK[e.priority] !== undefined)
  if (withPriority.length >= 2) {
    return withPriority.reduce((best, e) => (PRIORITY_RANK[e.priority] < PRIORITY_RANK[best.priority] ? e : best))
  }
  return pending[0]
}

export function createHandlers() {
  return {
    async overview(ctx) {
      const b = bad(ctx)
      if (b) return b
      const es = ctx.vault.entries
      const done = es.filter(e => e.done).length
      const out = [`${plural(es.length, 'prompt')}, ${done} completed, ${es.length - done} pending`]
      for (const c of CATEGORIES) {
        const group = es.filter(e => e.category === c)
        if (group.length === 0) continue
        out.push('', `${c} (${group.length})`, ...group.map(line))
      }
      return { ok: true, text: `${plural(es.length, 'prompt')} (${es.length - done} pending).`, details: out.join('\n'), data: es }
    },

    async list(ctx, args) {
      const b = bad(ctx)
      if (b) return b
      const filter = (args || 'all').toLowerCase()
      const es = ctx.vault.entries.filter(e => filter === 'pending' ? !e.done : filter === 'done' ? e.done : true)
      const pending = ctx.vault.entries.filter(e => !e.done).length
      return {
        ok: true,
        text: filter === 'all' ? `${plural(es.length, 'prompt')} (${pending} pending).` : `${plural(es.length, filter + ' prompt')}.`,
        details: es.map(line).join('\n'),
        data: es,
      }
    },

    async search(ctx, args) {
      const b = bad(ctx)
      if (b) return b
      const q = args.trim().toLowerCase()
      if (q === '') return { ok: false, text: 'Usage: /vault search <query>' }
      const hit = ctx.vault.entries.filter(e =>
        [e.title, e.category ?? '', e.body ?? ''].some(s => s.toLowerCase().includes(q)),
      )
      if (hit.length === 0) return { ok: true, text: `No prompts match "${args.trim()}".`, details: '', data: [] }
      return { ok: true, text: `${plural(hit.length, 'prompt')} match.`, details: hit.map(line).join('\n'), data: hit }
    },

    async next(ctx) {
      const b = bad(ctx)
      if (b) return b
      const e = pickNext(ctx.vault.entries)
      if (!e) return { ok: true, text: 'No pending prompts.', data: undefined }
      return { ok: true, text: `Next: ${e.id} ${e.title}.`, details: line(e), data: e }
    },

    async send(ctx, args) {
      const b = bad(ctx)
      if (b) return b
      const id = normId(args)
      const e = ctx.vault.entries.find(x => x.id === id)
      if (!e) return { ok: false, text: `No prompt ${id || '(no id given)'} in the vault.` }
      return { ok: true, text: `${e.id} ${e.title}: ${(e.body ?? '').length} characters. Execute or load it from the menu.`, data: e }
    },

    async categories(ctx) {
      const b = bad(ctx)
      if (b) return b
      const data = CATEGORIES.map(category => ({ category, count: ctx.vault.entries.filter(e => e.category === category).length }))
      return { ok: true, text: data.map(d => `${d.category} ${d.count}`).join(', ') + '.', details: data.map(d => `${d.category}: ${d.count}`).join('\n'), data }
    },

    async run(ctx, args) {
      const id = normId(args)
      if (id === '') return { ok: false, text: 'Usage: /vault run <id>' }
      return ctx.run(id, ctx.source)
    },

    async load(ctx, args) {
      const id = normId(args)
      if (id === '') return { ok: false, text: 'Usage: /vault load <id>' }
      return ctx.load(id)
    },

    async done(ctx, args) {
      return toggle(ctx, args, true)
    },

    async reopen(ctx, args) {
      return toggle(ctx, args, false)
    },

    async add(ctx, args) {
      const i = args.indexOf('|')
      const j = i < 0 ? -1 : args.indexOf('|', i + 1)
      const usage = { ok: false, text: 'Usage: /vault add <category>[:<priority>] | <title> | <prompt text>' }
      if (i < 0 || j < 0) return usage
      const [catRaw, priRaw] = args.slice(0, i).trim().split(':').map(x => x.trim())
      const fields = {
        title: args.slice(i + 1, j).trim(),
        category: catRaw ? canon(CATEGORIES, catRaw) : undefined,
        priority: priRaw ? canon(PRIORITIES, priRaw) : undefined,
        created: ctx.today(),
        body: args.slice(j + 1).replace(/^ /, ''),
      }
      const r = await ctx.mutate(t => addEntry(t, fields), {})
      if (!r.ok) return { ok: false, text: r.message }
      return { ok: true, text: `Added ${r.id} "${fields.title}".${r.repaired ? ' The ID counter was out of date and has been repaired.' : ''}`, data: r }
    },

    async edit(ctx, args) {
      const m = /^(\S+)\s+(title|category|priority|body)(?: ([\s\S]*))?$/i.exec(args)
      if (!m || m[3] === undefined) return { ok: false, text: 'Usage: /vault edit <id> title|category|priority|body <value>' }
      const id = normId(m[1])
      const field = m[2].toLowerCase()
      const value = m[3]
      const changes =
        field === 'title' ? { title: value }
        : field === 'category' ? { category: canon(CATEGORIES, value.trim()) }
        : field === 'priority' ? { priority: value.trim().toLowerCase() === 'clear' ? null : canon(PRIORITIES, value.trim()) }
        : { body: value }
      const r = await ctx.mutate(t => editEntry(t, id, changes), { touched: id })
      if (!r.ok) return { ok: false, text: r.message }
      return { ok: true, text: r.changed ? `Updated ${id}.` : 'Nothing to change.', data: r }
    },

    async delete(ctx, args) {
      const [idRaw, word] = args.trim().split(/\s+/)
      const id = normId(idRaw)
      if (id === '') return { ok: false, text: 'Usage: /vault delete <id>' }
      if ((word ?? '').toLowerCase() !== 'confirm') {
        return { ok: true, text: `This permanently deletes ${id}. Run /vault delete ${id} confirm to go ahead.` }
      }
      const r = await ctx.mutate(t => deleteEntry(t, id), { touched: id })
      if (!r.ok) return { ok: false, text: r.message }
      return { ok: true, text: `Deleted ${id}.`, data: r }
    },

    async stop(ctx, args) {
      return ctx.stop(args.trim())
    },

    async refresh(ctx) {
      return ctx.refresh()
    },

    async help(ctx, args) {
      return ctx.help(args)
    },

    async doctor(ctx) {
      return ctx.doctor()
    },
  }
}
