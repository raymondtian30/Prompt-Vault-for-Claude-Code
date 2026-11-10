// The operation registry: one list that drives `/vault` dispatch, its argument hint,
// and the Help view. Pure: no import from `claude-code`.
//
// Each operation: id (= name), name, syntax, description, examples, section,
// surfaces (skill | slash | button), and either skillEquivalent (the /prompt-vault
// subcommand it mirrors) or modOnly. tests/drift.test.mjs checks the skill list
// against SKILL.md so the two cannot drift apart unnoticed.

import { CATEGORIES } from './grammar.mjs'

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
