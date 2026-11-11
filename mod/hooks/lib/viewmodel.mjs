// View-model helpers: what the UI draws, computed from data. Pure; no import from `claude-code`.

import { listProjects } from './grammar.mjs'

export function truncate(s, n) {
  if (s.length <= n) return s
  return s.slice(0, Math.max(0, n - 1)) + '…'
}

const flagOf = e => (e.error ? 'broken' : e.legacy ? 'legacy' : e.duplicate ? 'duplicate' : e.empty ? 'empty' : undefined)

/** The list needs no bodies; keep a short searchable string instead. */
export function lightEntry(e) {
  const body = e.body ?? ''
  return {
    id: e.id,
    done: e.done,
    title: e.title,
    project: e.project,
    priority: e.priority,
    created: e.created,
    bodyLength: body.length,
    flag: flagOf(e),
    hay: `${e.id} ${e.title} ${e.project ?? ''} ${body.slice(0, 2000)}`.toLowerCase(),
  }
}

export function lightIndex(v) {
  if (!v.ok) return { ok: false, error: v.error, message: v.message }
  const { projects, unfiled } = listProjects(v.header, v.entries)
  return { ok: true, mtimeMs: v.mtimeMs, projects, unfiled, entries: v.entries.map(lightEntry) }
}

export const UNFILED = '__unfiled__'

/** `project`: '' for all, UNFILED for prompts with no project, or a project name. */
export function pageOf(entries, { query = '', filter = 'all', project = '', page = 0, pageSize = 8 } = {}) {
  const q = query.trim().toLowerCase()
  const hit = entries.filter(
    e =>
      (filter === 'pending' ? !e.done : filter === 'done' ? e.done : true) &&
      (project === '' || (project === UNFILED ? !e.project : e.project === project)) &&
      (q === '' || e.hay.includes(q)),
  )
  const pages = Math.max(1, Math.ceil(hit.length / pageSize))
  const p = Math.min(Math.max(0, page), pages - 1)
  return { rows: hit.slice(p * pageSize, (p + 1) * pageSize), page: p, pages, total: hit.length }
}

/** Display only: control characters other than tab and newline are dropped. The submitted text is never touched. */
export function previewBody(body, { maxLines = 6, maxChars = 600 } = {}) {
  if (!body) return { text: '', hiddenLines: 0, truncated: false }
  // eslint-disable-next-line no-control-regex
  const clean = body.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
  const lines = clean.split('\n')
  let text = lines.slice(0, maxLines).join('\n')
  let truncated = lines.length > maxLines
  if (text.length > maxChars) {
    text = text.slice(0, maxChars)
    truncated = true
  }
  return { text, hiddenLines: Math.max(0, lines.length - maxLines), truncated }
}

/** One plain sentence for the current run state; null when there is nothing to say. */
export function runLine(run) {
  if (!run) return null
  switch (run.state) {
    case 'sending':
      return run.slow
        ? `Still waiting for Claude Code. ${run.id} has not been accepted yet.`
        : `Sending ${run.id}…`
    case 'accepted':
      return `${run.id} accepted by Claude Code. Its turn ${run.finished ? 'has finished' : 'started'}.`
    case 'accepted-changed':
      return `${run.id} accepted, but another plugin changed the text before it was sent.`
    case 'refused':
      return `${run.id} refused: ${run.reason}`
    case 'failed':
      return `${run.id} failed: ${run.reason}`
    default:
      return null
  }
}
