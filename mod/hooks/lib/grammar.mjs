// Prompt Vault file grammar. Pure: no I/O, no import from `claude-code`.
// Canonical rules live in skills/prompt-vault/SKILL.md; tests/drift.test.mjs
// asserts these constants match it.

export const PRIORITIES = ['High', 'Medium', 'Low']
export const PROJECT_NAME_MAX = 60
export const START_MARKER = '<!-- PROMPTS START -->'
export const END_MARKER = '<!-- PROMPTS END -->'
export const MIN_FENCE = 3

const HEADING_RE = /^## \[( |x)\] (P\d{4,}): (.*)$/
const PROJECTS_RE = /^Projects:[ \t]*(.*)$/
const META_RE = /^- ([^:]+):\s?(.*)$/
const OPEN_RE = /^(`{3,})([^`]*)$/
const BARE_FENCE_RE = /^`{3,}\s*$/

/**
 * @typedef {{ text: string, start: number, end: number, next: number, hadCR: boolean }} Line
 * @param {string} text
 * @returns {Line[]}
 */
function splitLines(text) {
  const lines = []
  let start = 0
  while (start <= text.length) {
    const nl = text.indexOf('\n', start)
    const hasNl = nl !== -1
    const stop = hasNl ? nl : text.length
    const hadCR = hasNl && stop > start && text[stop - 1] === '\r'
    const end = hadCR ? stop - 1 : stop
    lines.push({ text: text.slice(start, end), start, end, next: hasNl ? nl + 1 : text.length, hadCR })
    if (!hasNl) break
    start = nl + 1
  }
  // A text ending in '\n' yields a final empty line past the end; drop it.
  if (lines.length > 0 && lines[lines.length - 1].start === text.length && text.length > 0) lines.pop()
  return lines
}

const isBoundary = line => HEADING_RE.test(line.text) || line.text === END_MARKER

/**
 * Parse prompts.md into entries. Never throws.
 * @param {string} text
 */
export function parseVault(text) {
  const lines = splitLines(text)
  const startIdx = lines.findIndex(l => l.text === START_MARKER)
  const hasStart = startIdx !== -1
  const firstHeading = lines.findIndex(l => HEADING_RE.test(l.text))
  const headerEnd = hasStart ? startIdx : firstHeading === -1 ? lines.length : firstHeading
  let projects = []
  for (let i = 0; i < headerEnd; i++) {
    const m = PROJECTS_RE.exec(lines[i].text)
    if (m) projects = m[1].split(',').map(x => x.trim()).filter(Boolean)
  }

  const entries = []
  const errors = []
  let hasEnd = false
  let i = hasStart ? startIdx + 1 : headerEnd

  while (i < lines.length) {
    const line = lines[i]
    if (line.text === END_MARKER) {
      hasEnd = true
      break
    }
    const h = HEADING_RE.exec(line.text)
    if (!h) {
      i++
      continue
    }
    const { entry, next } = parseEntry(text, lines, i, h)
    entries.push(entry)
    if (entry.error) errors.push({ code: entry.error, id: entry.id })
    i = next
  }

  const seen = new Map()
  for (const e of entries) seen.set(e.id, (seen.get(e.id) ?? 0) + 1)
  for (const [id, n] of seen) {
    if (n > 1) {
      errors.push({ code: 'duplicate-id', id })
      for (const e of entries) if (e.id === id) e.duplicate = true
    }
  }

  return { header: { projects }, entries, errors, hasStart, hasEnd }
}

function parseEntry(text, lines, i, h) {
  const entry = {
    id: h[2],
    done: h[1] === 'x',
    title: h[3],
    project: undefined,
    priority: undefined,
    created: undefined,
    status: undefined,
    extra: [],
    body: undefined,
    empty: false,
    start: lines[i].start,
  }

  let j = i + 1
  for (; j < lines.length; j++) {
    const t = lines[j].text
    if (t === '') continue
    if (OPEN_RE.test(t)) break
    const m = META_RE.exec(t)
    if (!m) break
    const key = m[1]
    if (key === 'Project') entry.project = m[2]
    else if (key === 'Category') entry.legacyProject = m[2]
    else if (key === 'Priority') entry.priority = m[2]
    else if (key === 'Created') entry.created = m[2]
    else if (key === 'Status') entry.status = m[2]
    else entry.extra.push(t)
  }

  if (entry.project === undefined && entry.legacyProject !== undefined) entry.project = entry.legacyProject
  delete entry.legacyProject

  const finish = (endLine, extraFields) => {
    const end = endLine < lines.length ? lines[endLine].start : text.length
    Object.assign(entry, extraFields, { end, raw: text.slice(entry.start, end) })
    return { entry, next: endLine }
  }

  const open = j < lines.length ? OPEN_RE.exec(lines[j].text) : null
  if (!open) {
    let b = j
    while (b < lines.length && !isBoundary(lines[b])) b++
    return finish(b, { error: 'no-fence' })
  }

  const n = open[1].length
  const closeRe = new RegExp('^`{' + n + ',}\\s*$')
  let k = j + 1
  while (k < lines.length && !closeRe.test(lines[k].text)) k++
  if (k >= lines.length) {
    let b = j + 1
    while (b < lines.length && !isBoundary(lines[b])) b++
    return finish(b, { error: 'unclosed-fence' })
  }

  const crlf = lines[j].hadCR
  const sliceBody = (openLine, closeLine) => {
    const bodyStart = lines[openLine].next
    const bodyEnd = lines[closeLine].start - (crlf ? 2 : 1)
    return bodyEnd < bodyStart ? '' : text.slice(bodyStart, bodyEnd)
  }

  // After the closing fence: blank lines, then `---`, a boundary, or EOF.
  let m = k + 1
  while (m < lines.length && lines[m].text.trim() === '') m++
  const atSeparator = m < lines.length && lines[m].text === '---'
  const atBoundary = m >= lines.length || isBoundary(lines[m])

  if (atSeparator || atBoundary) {
    const body = sliceBody(j, k)
    return finish(atSeparator ? m + 1 : k + 1, { body, empty: body.trim() === '' })
  }

  // Content after the closing fence: an older entry whose inner fence closed it early.
  let b = m
  while (b < lines.length && !isBoundary(lines[b])) b++
  let f = b - 1
  while (f > k && !BARE_FENCE_RE.test(lines[f].text)) f--
  if (f <= k) return finish(b, { error: 'trailing-content' })

  let after = f + 1
  while (after < b && lines[after].text.trim() === '') after++
  const endLine = after < b && lines[after].text === '---' ? after + 1 : f + 1
  const body = sliceBody(j, f)
  return finish(endLine, { body, empty: body.trim() === '', legacy: true })
}

/**
 * Fence that cannot be closed by anything inside the body.
 * @param {string} body
 */
export function chooseFence(body) {
  let longest = 0
  for (const run of body.match(/`+/g) ?? []) longest = Math.max(longest, run.length)
  return '`'.repeat(Math.max(MIN_FENCE, longest + 1))
}

/**
 * Render one entry as it is stored: heading, metadata, fenced body, separator.
 * `eol` (default LF) is used for the entry's own lines only; the body is never altered.
 * `project` is optional: an entry without one is unfiled.
 * @param {{ id: string, done: boolean, title: string, project?: string, priority?: string, created: string, extra?: string[], body: string, eol?: string }} e
 */
export function renderEntry(e) {
  const eol = e.eol ?? '\n'
  const fence = chooseFence(e.body)
  const lines = [`## [${e.done ? 'x' : ' '}] ${e.id}: ${e.title}`]
  if (e.project) lines.push(`- Project: ${e.project}`)
  if (e.priority) lines.push(`- Priority: ${e.priority}`)
  lines.push(`- Created: ${e.created}`, `- Status: ${e.done ? 'completed' : 'pending'}`)
  for (const x of e.extra ?? []) lines.push(x)
  return lines.join(eol) + `${eol}${eol}${fence}text${eol}${e.body}${eol}${fence}${eol}${eol}---${eol}`
}

/** A project name is one non-empty line without commas (the header list is comma separated). */
export function isValidProjectName(name) {
  return typeof name === 'string' && name.trim() !== '' && name.trim().length <= PROJECT_NAME_MAX && !/[,\r\n]/.test(name)
}

/**
 * The projects in order: those listed in the header first, then any only entries mention.
 * Prompts with no project are counted apart as `unfiled`.
 */
export function listProjects(header, entries) {
  const counts = new Map()
  for (const name of header.projects ?? []) counts.set(name, 0)
  let unfiled = 0
  for (const e of entries) {
    if (!e.project) unfiled++
    else counts.set(e.project, (counts.get(e.project) ?? 0) + 1)
  }
  return { projects: [...counts].map(([name, count]) => ({ name, count })), unfiled }
}

const idNumber = id => Number(String(id).slice(1))
const formatId = n => 'P' + String(n).padStart(4, '0')

/**
 * The next ID is the lowest number no entry uses, so deleting P0001 frees it for the next prompt.
 * @param {{ id: string }[]} entries
 */
export function nextId(entries) {
  const used = new Set(entries.map(e => idNumber(e.id)))
  let n = 1
  while (used.has(n)) n++
  return { id: formatId(n) }
}
