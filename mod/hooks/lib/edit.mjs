// Pure edits on the vault text. Each returns { ok, changed, text, ... } or
// { ok: false, error, message } and splices only the span it owns: every entry it was
// not asked to touch stays byte-identical. No I/O, no import from `claude-code`.
//
// A project is just a name (no AI tool attached). It exists if it is in the header
// `Projects:` line or any entry uses it. A prompt may have no project (unfiled).
// Edits that change several entries return `touched`, the ids they changed.

import { parseVault, renderEntry, nextId, listProjects, isValidProjectName, PROJECT_NAME_MAX, PRIORITIES, START_MARKER, END_MARKER } from './grammar.mjs'

const fail = (error, message) => ({ ok: false, error, message })
const eolOf = s => (s.includes('\r\n') ? '\r\n' : '\n')
const PROJECT_RULE = `A project name is one line, up to ${PROJECT_NAME_MAX} characters, with no commas.`

function find(text, id) {
  const v = parseVault(text)
  const hits = v.entries.filter(e => e.id === id)
  if (hits.length === 0) return { error: fail('not-found', `No prompt ${id} in the vault.`) }
  if (hits.length > 1) return { error: fail('duplicate-id', `${id} appears more than once in prompts.md; fix that first.`) }
  return { v, entry: hits[0] }
}

const unsafe = (entry, verb) =>
  entry.legacy || entry.error
    ? fail('unsafe-entry', `${entry.id} cannot be ${verb} safely: its fence is not trustworthy. Fix it in prompts.md first.`)
    : null

const validTitle = t => typeof t === 'string' && t.trim() !== '' && !/[\r\n]/.test(t)

function validate({ title, project, priority, body }) {
  if (title !== undefined && !validTitle(title)) return fail('bad-title', 'The title must be one non-empty line.')
  if (project !== undefined && project !== null && project.trim() !== '' && !isValidProjectName(project)) {
    return fail('bad-project', PROJECT_RULE)
  }
  if (priority !== undefined && priority !== null && !PRIORITIES.includes(priority)) {
    return fail('bad-priority', `Priority must be one of: ${PRIORITIES.join(', ')}.`)
  }
  if (body !== undefined && body.trim() === '') return fail('empty-body', 'The prompt text is empty.')
  return null
}

/** Mark an entry done or pending: changes the heading checkbox and the Status value only. */
export function setDone(text, id, done) {
  const { error, entry } = find(text, id)
  if (error) return error
  if (entry.done === done) return { ok: true, changed: false, text }
  const raw = entry.raw
  const fenceAt = raw.search(/^`{3,}/m)
  const metaEnd = fenceAt === -1 ? raw.length : fenceAt
  const meta = raw
    .slice(0, metaEnd)
    .replace(/^(- Status:[ \t]*)[^\r\n]*/m, `$1${done ? 'completed' : 'pending'}`)
  const next = raw.slice(0, 4) + (done ? 'x' : ' ') + meta.slice(5) + raw.slice(metaEnd)
  return { ok: true, changed: true, text: text.slice(0, entry.start) + next + text.slice(entry.end) }
}

/** Append a new entry before the end marker, using the lowest unused id. */
export function addEntry(text, fields) {
  const bad = validate(fields) ?? (fields.body === undefined ? fail('empty-body', 'The prompt text is empty.') : null)
  if (bad) return bad
  const v = parseVault(text)
  if (!v.hasStart) return fail('not-a-vault', `prompts.md has no ${START_MARKER} line; refusing to guess where entries go.`)
  const n = nextId(v.entries)
  const project = fields.project && fields.project.trim() !== '' ? fields.project.trim() : undefined
  const entryText = renderEntry({
    id: n.id,
    done: false,
    title: fields.title.trim(),
    project,
    priority: fields.priority ?? undefined,
    created: fields.created,
    body: fields.body,
    eol: eolOf(text),
  })
  const endAt = text.lastIndexOf(END_MARKER)
  const out =
    endAt !== -1 && (endAt === 0 || text[endAt - 1] === '\n')
      ? text.slice(0, endAt) + entryText + text.slice(endAt)
      : text + (text.endsWith('\n') ? '' : eolOf(text)) + entryText
  return { ok: true, changed: true, text: out, id: n.id }
}

/** Change named fields of one entry. `project: null` unfiles it; `priority: null` clears it. */
export function editEntry(text, id, changes) {
  const { error, entry } = find(text, id)
  if (error) return error
  const refuse = unsafe(entry, 'edited')
  if (refuse) return refuse
  const bad = validate(changes)
  if (bad) return bad
  const project =
    changes.project === undefined
      ? entry.project
      : changes.project === null || changes.project.trim() === ''
        ? undefined
        : changes.project.trim()
  const merged = {
    title: changes.title !== undefined ? changes.title.trim() : entry.title,
    project,
    priority: changes.priority === undefined ? entry.priority : (changes.priority ?? undefined),
    body: changes.body !== undefined ? changes.body : entry.body,
  }
  if (merged.title === entry.title && merged.project === entry.project && merged.priority === entry.priority && merged.body === entry.body) {
    return { ok: true, changed: false, text }
  }
  const raw = renderEntry({
    id,
    done: entry.done,
    title: merged.title,
    project: merged.project,
    priority: merged.priority,
    created: entry.created ?? '',
    extra: entry.extra,
    body: merged.body,
    eol: eolOf(entry.raw),
  })
  return { ok: true, changed: true, text: text.slice(0, entry.start) + raw + text.slice(entry.end) }
}

/** Remove one entry. Its id becomes free and the next added prompt takes the lowest free id. */
export function deleteEntry(text, id) {
  const { error, entry } = find(text, id)
  if (error) return error
  const refuse = unsafe(entry, 'deleted')
  if (refuse) return refuse
  return { ok: true, changed: true, text: text.slice(0, entry.start) + text.slice(entry.end) }
}

// ---------- projects ----------

const same = (a, b) => a.toLowerCase() === b.toLowerCase()

/** The existing project name that matches `name` ignoring case, or undefined. */
function canonical(v, name) {
  return listProjects(v.header, v.entries).projects.find(p => same(p.name, name))?.name
}

/** Rewrite the header `Projects:` line from `names` (removing it when empty). */
function withHeaderProjects(text, names) {
  const eol = eolOf(text)
  const startAt = text.indexOf(START_MARKER)
  const header = text.slice(0, startAt)
  const rest = text.slice(startAt)
  const line = /^Projects:[^\r\n]*(\r?\n)?/m
  let nextHeader
  if (names.length === 0) {
    nextHeader = header.replace(line, '').replace(/(\r?\n){3,}$/, eol + eol)
  } else if (line.test(header)) {
    nextHeader = header.replace(/^Projects:[^\r\n]*/m, `Projects: ${names.join(', ')}`)
  } else {
    nextHeader = header + `Projects: ${names.join(', ')}${eol}${eol}`
  }
  return nextHeader + rest
}

/** Set (or remove, when `project` is null) the project line inside one entry's metadata. */
function setEntryProject(raw, project) {
  const fenceAt = raw.search(/^`{3,}/m)
  const metaEnd = fenceAt === -1 ? raw.length : fenceAt
  let meta = raw.slice(0, metaEnd)
  const rest = raw.slice(metaEnd)
  const eol = eolOf(raw)
  const lineRe = /^- (?:Project|Category):[^\r\n]*(\r?\n)/gm
  if (new RegExp(lineRe.source, 'm').test(meta)) {
    let first = true
    meta = meta.replace(lineRe, (_m, nl) => {
      if (project !== null && first) {
        first = false
        return `- Project: ${project}${nl}`
      }
      return ''
    })
  } else if (project !== null) {
    const nl = meta.indexOf('\n')
    meta = meta.slice(0, nl + 1) + `- Project: ${project}${eol}` + meta.slice(nl + 1)
  }
  return meta + rest
}

/** Apply `projectFor(entry)` (a name, null to unfile, undefined to leave alone) to every entry. */
function rewriteEntries(text, v, projectFor) {
  let out = text
  const touched = []
  for (const e of [...v.entries].reverse()) {
    const p = projectFor(e)
    if (p === undefined) continue
    out = out.slice(0, e.start) + setEntryProject(e.raw, p) + out.slice(e.end)
    touched.unshift(e.id)
  }
  return { text: out, touched }
}

/** Create a project (it exists with no prompts until some are filed under it). */
export function createProject(text, name) {
  if (typeof name !== 'string' || !isValidProjectName(name)) return fail('bad-project', PROJECT_RULE)
  const v = parseVault(text)
  if (!v.hasStart) return fail('not-a-vault', `prompts.md has no ${START_MARKER} line; refusing to guess where the project list goes.`)
  const clean = name.trim()
  const existing = canonical(v, clean)
  if (existing !== undefined) return fail('project-exists', `There is already a project called "${existing}".`)
  return { ok: true, changed: true, text: withHeaderProjects(text, [...v.header.projects, clean]), touched: [] }
}

/** Rename a project everywhere: the header list and every prompt filed under it. */
export function renameProject(text, from, to) {
  const v = parseVault(text)
  const source = typeof from === 'string' ? canonical(v, from.trim()) : undefined
  if (source === undefined) return fail('project-not-found', `There is no project called "${String(from)}".`)
  if (typeof to !== 'string' || !isValidProjectName(to)) return fail('bad-project', PROJECT_RULE)
  const target = to.trim()
  if (target === source) return { ok: true, changed: false, text }
  const clash = canonical(v, target)
  if (clash !== undefined && !same(clash, source)) return fail('project-exists', `There is already a project called "${clash}".`)
  const rewritten = rewriteEntries(text, v, e => (e.project === source ? target : undefined))
  const out = v.header.projects.includes(source)
    ? withHeaderProjects(rewritten.text, v.header.projects.map(p => (p === source ? target : p)))
    : rewritten.text
  return { ok: true, changed: true, text: out, touched: rewritten.touched }
}

/** Delete a project. Its prompts are kept and become unfiled; nothing but the project goes away. */
export function deleteProject(text, name) {
  const v = parseVault(text)
  const source = typeof name === 'string' ? canonical(v, name.trim()) : undefined
  if (source === undefined) return fail('project-not-found', `There is no project called "${String(name)}".`)
  const rewritten = rewriteEntries(text, v, e => (e.project === source ? null : undefined))
  const out = v.header.projects.includes(source)
    ? withHeaderProjects(rewritten.text, v.header.projects.filter(p => p !== source))
    : rewritten.text
  return { ok: true, changed: true, text: out, touched: rewritten.touched, unfiled: rewritten.touched.length }
}
