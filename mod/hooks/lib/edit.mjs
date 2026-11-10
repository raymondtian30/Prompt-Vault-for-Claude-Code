// Pure edits on the vault text. Each returns { ok, changed, text, ... } or
// { ok: false, error, message } and splices only the span it owns: every entry it was
// not asked to touch stays byte-identical. No I/O, no import from `claude-code`.

import { parseVault, renderEntry, nextId, CATEGORIES, PRIORITIES, START_MARKER, END_MARKER } from './grammar.mjs'

const fail = (error, message) => ({ ok: false, error, message })
const eolOf = s => (s.includes('\r\n') ? '\r\n' : '\n')

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

function validate({ title, category, priority, body }, { requireAll }) {
  if (title !== undefined && !validTitle(title)) return fail('bad-title', 'The title must be one non-empty line.')
  if (requireAll && category === undefined) return fail('category-required', 'Choose a category; there is no default.')
  if (category !== undefined && !CATEGORIES.includes(category)) return fail('bad-category', `Category must be one of: ${CATEGORIES.join(', ')}.`)
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

/** Append a new entry before the end marker and bump the counter in the same text. */
export function addEntry(text, fields) {
  const bad = validate(fields, { requireAll: true }) ?? (fields.body === undefined ? fail('empty-body', 'The prompt text is empty.') : null)
  if (bad) return bad
  const v = parseVault(text)
  if (!v.hasStart) return fail('not-a-vault', `prompts.md has no ${START_MARKER} line; refusing to guess where entries go.`)
  const eol = eolOf(text)
  const n = nextId(v.header, v.entries)
  const entryText = renderEntry({
    id: n.id,
    done: false,
    title: fields.title.trim(),
    category: fields.category,
    priority: fields.priority ?? undefined,
    created: fields.created,
    body: fields.body,
    eol,
  })

  let out
  const endAt = text.lastIndexOf(END_MARKER)
  if (endAt !== -1 && (endAt === 0 || text[endAt - 1] === '\n')) {
    out = text.slice(0, endAt) + entryText + text.slice(endAt)
  } else {
    out = text + (text.endsWith('\n') ? '' : eol) + entryText
  }

  const startAt = out.indexOf(START_MARKER)
  const header = out.slice(0, startAt)
  const counterLine = `Next ID counter: ${n.counter}`
  const newHeader = /^Next ID counter:.*$/m.test(header)
    ? header.replace(/^Next ID counter:[^\r\n]*/m, counterLine)
    : header + counterLine + eol + eol
  return { ok: true, changed: true, text: newHeader + out.slice(startAt), id: n.id, repaired: n.repaired }
}

/** Change named fields of one entry. `priority: null` clears it. Only that entry is rewritten. */
export function editEntry(text, id, changes) {
  const { error, entry } = find(text, id)
  if (error) return error
  const refuse = unsafe(entry, 'edited')
  if (refuse) return refuse
  const bad = validate(changes, { requireAll: false })
  if (bad) return bad
  const merged = {
    title: changes.title !== undefined ? changes.title.trim() : entry.title,
    category: changes.category !== undefined ? changes.category : entry.category,
    priority: changes.priority === undefined ? entry.priority : (changes.priority ?? undefined),
    body: changes.body !== undefined ? changes.body : entry.body,
  }
  if (
    merged.title === entry.title &&
    merged.category === entry.category &&
    merged.priority === entry.priority &&
    merged.body === entry.body
  ) {
    return { ok: true, changed: false, text }
  }
  const raw = renderEntry({
    id,
    done: entry.done,
    title: merged.title,
    category: merged.category,
    priority: merged.priority,
    created: entry.created ?? '',
    extra: entry.extra,
    body: merged.body,
    eol: eolOf(entry.raw),
  })
  return { ok: true, changed: true, text: text.slice(0, entry.start) + raw + text.slice(entry.end) }
}

/** Remove one entry. The ID counter is never lowered. */
export function deleteEntry(text, id) {
  const { error, entry } = find(text, id)
  if (error) return error
  const refuse = unsafe(entry, 'deleted')
  if (refuse) return refuse
  return { ok: true, changed: true, text: text.slice(0, entry.start) + text.slice(entry.end) }
}
