// The operation registry: one list that drives `/vault` dispatch, its argument hint,
// and the Help view. Pure: no import from `claude-code`.
//
// Each operation: id (= name), name, syntax, description, examples, section,
// surfaces (skill | slash | button), and either skillEquivalent (the /prompt-vault
// subcommand it mirrors) or modOnly. tests/drift.test.mjs checks the skill list
// against SKILL.md so the two cannot drift apart unnoticed.

import { PRIORITIES, listProjects } from './grammar.mjs'
import { setDone, addEntry, editEntry, deleteEntry, createProject, renameProject, deleteProject } from './edit.mjs'

const op = o => Object.freeze(o)

/** Operations that change the vault, run a prompt, fill the prompt box or install: only the person may start them. */
export const PERSON_ONLY = new Set(['done', 'reopen', 'add', 'edit', 'delete', 'project', 'stop', 'run', 'load', 'update'])

export const OPERATIONS = Object.freeze([
  op({
    id: 'overview', name: 'overview', syntax: '/vault overview',
    description: 'Summary of the vault: totals, then prompts grouped by project. With no argument, /vault opens the menu instead.',
    examples: ['/vault overview'], section: 'Browse', surfaces: ['skill', 'slash', 'button'], skillEquivalent: 'overview',
  }),
  op({
    id: 'list', name: 'list', syntax: '/vault list [pending|done|all] [<project>|unfiled]',
    description: 'One line per prompt: checkbox, ID, title, project, priority. Optionally only pending or done prompts, and only one project (or the unfiled ones).',
    examples: ['/vault list', '/vault list pending', '/vault list done Website'], section: 'Browse', surfaces: ['skill', 'slash', 'button'], skillEquivalent: 'list',
  }),
  op({
    id: 'search', name: 'search', syntax: '/vault search <query>',
    description: 'Case-insensitive search over title, project and prompt text.',
    examples: ['/vault search token savior'], section: 'Browse', surfaces: ['skill', 'slash', 'button'], skillEquivalent: 'search',
  }),
  op({
    id: 'next', name: 'next', syntax: '/vault next',
    description: 'Show the next unfinished prompt: when several pending prompts have a priority, High before Medium before Low, otherwise file order. Never marks it done.',
    examples: ['/vault next'], section: 'Browse', surfaces: ['skill', 'slash', 'button'], skillEquivalent: 'next',
  }),
  op({
    id: 'send', name: 'send', syntax: '/vault send <id>',
    description: 'Open one prompt in full, ready to Run or put in the prompt box. The saved text is never altered.',
    examples: ['/vault send P0003'], section: 'Browse', surfaces: ['skill', 'slash', 'button'], skillEquivalent: 'send',
  }),
  op({
    id: 'projects', name: 'projects', syntax: '/vault projects',
    description: 'Your projects with how many prompts each holds, and how many are unfiled.',
    examples: ['/vault projects'], section: 'Projects', surfaces: ['skill', 'slash', 'button'], skillEquivalent: 'projects',
  }),
  op({
    id: 'project', name: 'project', syntax: '/vault project new|rename|delete <name>',
    description: 'Create a project, rename one (its prompts follow), or delete one (its prompts are kept and become unfiled; asks first). A project is just a name: it never picks an AI. To file a prompt, use add or edit.',
    examples: ['/vault project new Website', '/vault project rename Website | Site redesign', '/vault project delete Website confirm'],
    section: 'Projects', surfaces: ['slash', 'button'], modOnly: true,
  }),
  op({
    id: 'done', name: 'done', syntax: '/vault done <id>',
    description: 'Mark a prompt completed. This is the only way a prompt is marked done; Run and viewing never do it.',
    examples: ['/vault done P0003'], section: 'Manage', surfaces: ['skill', 'slash', 'button'], skillEquivalent: 'done',
  }),
  op({
    id: 'reopen', name: 'reopen', syntax: '/vault reopen <id>',
    description: 'Mark a completed prompt pending again.',
    examples: ['/vault reopen P0003'], section: 'Manage', surfaces: ['skill', 'slash', 'button'], skillEquivalent: 'done',
  }),
  op({
    id: 'add', name: 'add', syntax: '/vault add [<project>[:<priority>]] | <title> | <prompt text>',
    description: 'Save a new prompt, optionally in a project (a new name creates the project). The new prompt takes the lowest unused ID, so the ID of a deleted prompt is reused. The text after the second | is stored exactly as typed, newlines and | included.',
    examples: ['/vault add Website:High | Compare vector stores | List the trade-offs of ...', '/vault add | Quick idea | Try ...'],
    section: 'Manage', surfaces: ['skill', 'slash', 'button'], skillEquivalent: 'add',
  }),
  op({
    id: 'edit', name: 'edit', syntax: '/vault edit <id> title|project|priority|body <value>',
    description: 'Change one field of a prompt, including moving it to another project. "project clear" unfiles it and "priority clear" removes the priority. Only that prompt is rewritten; the others stay byte for byte as they were.',
    examples: ['/vault edit P0003 title Better title', '/vault edit P0003 project Website', '/vault edit P0003 project clear'], section: 'Manage', surfaces: ['skill', 'slash', 'button'], skillEquivalent: 'edit',
  }),
  op({
    id: 'delete', name: 'delete', syntax: '/vault delete <id> [confirm]',
    description: 'Delete a prompt after confirmation. Its ID becomes free and is reused by the next prompt you add.',
    examples: ['/vault delete P0003', '/vault delete P0003 confirm'], section: 'Manage', surfaces: ['skill', 'slash', 'button'], skillEquivalent: 'delete',
  }),
  op({
    id: 'run', name: 'run', syntax: '/vault run <id>',
    description: 'Run (Execute): submit the complete saved prompt to Claude Code as a new turn. Reports accepted only after Claude Code takes it. Blocked while Claude is working.',
    examples: ['/vault run P0003'], section: 'Run', surfaces: ['slash', 'button'], modOnly: true,
  }),
  op({
    id: 'load', name: 'load', syntax: '/vault load <id>',
    description: 'Put a prompt into the prompt box without sending it, so you can edit it or use @file mentions and slash commands as typed.',
    examples: ['/vault load P0003'], section: 'Run', surfaces: ['slash', 'button'], modOnly: true,
  }),
  op({
    id: 'stop', name: 'stop', syntax: '/vault stop [confirm]',
    description: 'Stop the turn Run started. Stopping can leave a tool half-finished, so it asks first.',
    examples: ['/vault stop', '/vault stop confirm'], section: 'Run', surfaces: ['slash', 'button'], modOnly: true,
  }),
  op({
    id: 'refresh', name: 'refresh', syntax: '/vault refresh',
    description: 'Re-read prompts.md. The menu does this when it opens and after every change; use it after the skill or a text editor changed the file.',
    examples: ['/vault refresh'], section: 'Vault', surfaces: ['slash', 'button'], modOnly: true,
  }),
  op({
    id: 'update', name: 'update', syntax: '/vault update [check]',
    description: 'Look for a newer Prompt Vault release on GitHub and install it. "check" only looks. Start a new Claude Code session afterwards to use the new version.',
    examples: ['/vault update', '/vault update check'], section: 'Vault', surfaces: ['slash', 'button'], modOnly: true,
  }),
  op({
    id: 'help', name: 'help', syntax: '/vault help [search words]',
    description: 'Every command, shortcut, setting, FAQ answer and troubleshooting tip, searchable.',
    examples: ['/vault help', '/vault help run'], section: 'Help', surfaces: ['slash', 'button'], modOnly: true,
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
const line = e => `${e.done ? '[x]' : '[ ]'} ${e.id} ${e.title} · ${e.project ?? 'no project'}${e.priority ? ' · ' + e.priority : ''}`
const bad = ctx => (ctx.vault.ok ? null : { ok: false, text: ctx.vault.message })
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`
const canon = (list, v) => list.find(x => x.toLowerCase() === String(v).toLowerCase()) ?? v

/** The existing project matching `name` ignoring case, else the name as typed. */
function canonProject(vault, name) {
  const { projects } = listProjects(vault.header, vault.entries)
  return projects.find(p => p.name.toLowerCase() === name.toLowerCase())?.name ?? name
}

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

async function projectOp(ctx, args) {
  const m = /^(new|rename|delete)(?:\s+([\s\S]*))?$/i.exec(args.trim())
  if (!m) return { ok: false, text: 'Usage: /vault project new <name> | rename <old> | <new> | delete <name> [confirm]' }
  const verb = m[1].toLowerCase()
  const rest = (m[2] ?? '').trim()

  if (verb === 'new') {
    if (rest === '') return { ok: false, text: 'Usage: /vault project new <name>' }
    const r = await ctx.mutate(t => createProject(t, rest), {})
    return r.ok ? { ok: true, text: `Created project "${rest}".`, data: r } : { ok: false, text: r.message }
  }

  if (verb === 'rename') {
    const i = rest.indexOf('|')
    const from = i < 0 ? '' : rest.slice(0, i).trim()
    const to = i < 0 ? '' : rest.slice(i + 1).trim()
    if (from === '' || to === '') return { ok: false, text: 'Usage: /vault project rename <old> | <new>' }
    const shown = ctx.vault.ok ? canonProject(ctx.vault, from) : from
    const r = await ctx.mutate(t => renameProject(t, from, to), {})
    if (!r.ok) return { ok: false, text: r.message }
    if (!r.changed) return { ok: true, text: 'Nothing to change.', data: r }
    return { ok: true, text: `Renamed "${shown}" to "${to}" (${plural(r.touched.length, 'prompt')} moved).`, data: r }
  }

  const confirmed = /\sconfirm$/i.test(rest)
  const name = rest.replace(/\s+confirm$/i, '').trim()
  if (name === '') return { ok: false, text: 'Usage: /vault project delete <name> [confirm]' }
  if (ctx.vault.ok) {
    const { projects } = listProjects(ctx.vault.header, ctx.vault.entries)
    const found = projects.find(p => p.name.toLowerCase() === name.toLowerCase())
    if (!found) return { ok: false, text: `There is no project called "${name}".` }
    if (!confirmed) {
      return { ok: true, text: `Deleting the project "${found.name}" unfiles its ${plural(found.count, 'prompt')} (they are kept). Run /vault project delete ${found.name} confirm to go ahead.` }
    }
  } else if (!confirmed) {
    return { ok: false, text: ctx.vault.message }
  }
  const r = await ctx.mutate(t => deleteProject(t, name), {})
  if (!r.ok) return { ok: false, text: r.message }
  const shown = ctx.vault.ok ? canonProject(ctx.vault, name) : name
  return { ok: true, text: r.unfiled > 0 ? `Deleted project "${shown}". Its ${plural(r.unfiled, 'prompt')} ${r.unfiled === 1 ? 'is' : 'are'} kept, now unfiled.` : `Deleted project "${shown}".`, data: r }
}

export function createHandlers() {
  return {
    async overview(ctx) {
      const b = bad(ctx)
      if (b) return b
      const es = ctx.vault.entries
      const done = es.filter(e => e.done).length
      const out = [`${plural(es.length, 'prompt')}, ${done} completed, ${es.length - done} pending`]
      const { projects, unfiled } = listProjects(ctx.vault.header, es)
      for (const p of projects) {
        const group = es.filter(e => e.project === p.name)
        if (group.length === 0) continue
        out.push('', `${p.name} (${group.length})`, ...group.map(line))
      }
      if (unfiled > 0) out.push('', `Unfiled (${unfiled})`, ...es.filter(e => !e.project).map(line))
      return { ok: true, text: `${plural(es.length, 'prompt')} (${es.length - done} pending).`, details: out.join('\n'), data: es }
    },

    async list(ctx, args) {
      const b = bad(ctx)
      if (b) return b
      const whole = args.trim()
      const named = listProjects(ctx.vault.header, ctx.vault.entries).projects.some(p => p.name.toLowerCase() === whole.toLowerCase())
      // An exact project name wins over reading its first word as a filter ("Done deals").
      const m = named ? [whole, undefined, whole] : /^(?:(pending|done|all)(?:\s+|$))?([\s\S]*)$/i.exec(whole)
      const filter = (m[1] ?? 'all').toLowerCase()
      const projArg = m[2].trim()
      let es = ctx.vault.entries.filter(e => (filter === 'pending' ? !e.done : filter === 'done' ? e.done : true))
      let where = ''
      let project = ''
      if (projArg !== '') {
        if (projArg.toLowerCase() === 'unfiled') {
          es = es.filter(e => !e.project)
          where = ' unfiled'
          project = '__unfiled__'
        } else {
          const { projects } = listProjects(ctx.vault.header, ctx.vault.entries)
          const found = projects.find(p => p.name.toLowerCase() === projArg.toLowerCase())
          if (!found) return { ok: false, text: `No project called "${projArg}".` }
          es = es.filter(e => e.project === found.name)
          where = ` in ${found.name}`
          project = found.name
        }
      }
      const pending = ctx.vault.entries.filter(e => !e.done).length
      const text =
        filter === 'all' && where === ''
          ? `${plural(es.length, 'prompt')} (${pending} pending).`
          : `${plural(es.length, filter === 'all' ? 'prompt' : filter + ' prompt')}${where}.`
      return { ok: true, text, details: es.map(line).join('\n'), data: es, view: { filter, project } }
    },

    async search(ctx, args) {
      const b = bad(ctx)
      if (b) return b
      const q = args.trim().toLowerCase()
      if (q === '') return { ok: false, text: 'Usage: /vault search <query>' }
      const hit = ctx.vault.entries.filter(e =>
        [e.title, e.project ?? '', e.body ?? ''].some(s => s.toLowerCase().includes(q)),
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
      return { ok: true, text: `${e.id} ${e.title}: ${(e.body ?? '').length} characters. Run or load it from the menu.`, data: e }
    },

    async projects(ctx) {
      const b = bad(ctx)
      if (b) return b
      const data = listProjects(ctx.vault.header, ctx.vault.entries)
      if (data.projects.length === 0 && data.unfiled === 0) return { ok: true, text: 'No projects yet.', details: '', data }
      const lines = data.projects.map(p => `${p.name}: ${p.count}`)
      if (data.unfiled > 0) lines.push(`Unfiled: ${data.unfiled}`)
      const brief = data.projects.map(p => `${p.name} ${p.count}`)
      if (data.unfiled > 0) brief.push(`Unfiled ${data.unfiled}`)
      return { ok: true, text: brief.join(', ') + '.', details: lines.join('\n'), data }
    },

    async project(ctx, args) {
      return projectOp(ctx, args)
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
      const usage = { ok: false, text: 'Usage: /vault add [<project>[:<priority>]] | <title> | <prompt text>' }
      if (i < 0 || j < 0) return usage
      const head = /^([\s\S]*?)(?::\s*(high|medium|low))?$/i.exec(args.slice(0, i).trim())
      const typed = head[1].trim()
      const fields = {
        title: args.slice(i + 1, j).trim(),
        project: typed === '' ? undefined : ctx.vault.ok ? canonProject(ctx.vault, typed) : typed,
        priority: head[2] ? canon(PRIORITIES, head[2]) : undefined,
        created: ctx.today(),
        body: args.slice(j + 1).replace(/^ /, ''),
      }
      const r = await ctx.mutate(t => addEntry(t, fields), {})
      if (!r.ok) return { ok: false, text: r.message }
      return { ok: true, text: `Added ${r.id} "${fields.title}".`, data: r }
    },

    async edit(ctx, args) {
      const m = /^(\S+)\s+(title|project|priority|body)(?: ([\s\S]*))?$/i.exec(args)
      if (!m || m[3] === undefined) return { ok: false, text: 'Usage: /vault edit <id> title|project|priority|body <value>' }
      const id = normId(m[1])
      const field = m[2].toLowerCase()
      const value = m[3]
      const changes =
        field === 'title' ? { title: value }
        : field === 'project' ? { project: value.trim().toLowerCase() === 'clear' ? null : ctx.vault.ok ? canonProject(ctx.vault, value.trim()) : value.trim() }
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

    async update(ctx, args) {
      const a = args.trim().toLowerCase()
      if (a !== '' && a !== 'check') return { ok: false, text: 'Usage: /vault update [check]' }
      return ctx.update(a === 'check' ? 'check' : 'apply')
    },

    async help(ctx, args) {
      return ctx.help(args)
    },

    async doctor(ctx) {
      return ctx.doctor()
    },
  }
}
