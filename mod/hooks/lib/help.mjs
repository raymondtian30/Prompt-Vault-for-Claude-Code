// Help content and search. Operations come from the registry and settings from the
// manifest's userConfig, so neither can drift; shortcuts, FAQ and troubleshooting are
// the only hand-written parts. Pure: no import from `claude-code`.

// Claude Code's own keys for a mod's pane and band, as documented for this build.
export const SHORTCUTS = [
  { keys: 'ctrl+x tab', does: 'Move the keyboard focus to the Prompt Vault pane, and between panes.' },
  { keys: 'Esc', does: 'Close the Prompt Vault pane (it opens with close-on-escape).' },
  { keys: 'ctrl+x x', does: 'Close the focused pane.' },
  { keys: 'ctrl+x ctrl+a', does: 'Collapse or expand the band above the prompt box.' },
]

export const FAQ = [
  {
    q: 'Does Execute change my saved prompt?',
    a: 'No. Execute reads the entry and submits its text. It never writes prompts.md. Marking a prompt done is a separate action.',
  },
  {
    q: 'What does "accepted" mean?',
    a: 'Claude Code took the prompt and started a turn for it. It does not mean Claude has finished or understood it.',
  },
  {
    q: 'Why is Execute disabled?',
    a: 'Claude is working, or another Execute is still in progress. Execute waits for the turn to end; nothing is queued behind a running turn.',
  },
  {
    q: 'What is the difference between /prompt-vault and /vault?',
    a: '/prompt-vault is the skill: Claude edits the file for you. /vault is the mod: a menu, buttons and Execute. Both use the same prompts.md, so you can use either.',
  },
  {
    q: 'Where are my prompts stored?',
    a: 'In ~/.claude/prompt-vault/prompts.md as plain markdown. Copy that folder to back it up or move it to another machine.',
  },
  {
    q: 'Why am I asked to confirm before Execute?',
    a: 'The prompt is filed under a category other than Claude Code (ChatGPT, Research, Coding Projects or Other). You can turn the question off in the confirmNonClaudeCodeCategories setting.',
  },
  {
    q: 'Do @file mentions and pasted images work with Execute?',
    a: 'Execute sends the text as saved. Claude Code does not expand @file mentions or pasted images for a plugin\'s prompt. Use Load into prompt box and press Enter yourself if the prompt needs them.',
  },
]

export const TROUBLESHOOTING = [
  {
    q: 'There is no Prompt Vault button.',
    a: 'Run /vault doctor. It lists the surfaces this session draws on and what each can show. Some surfaces draw no button; /vault and the menu still work where they can draw.',
  },
  {
    q: 'The vault is reported missing.',
    a: 'There is no prompts.md at the path /vault doctor shows. Run the skill\'s /prompt-vault once; it creates the folder and file without touching anything that exists.',
  },
  {
    q: 'A prompt says it cannot be run.',
    a: 'Its fence in prompts.md is broken, it predates the fence rule and contains a triple-backtick line, or its ID appears twice. Fix the entry in prompts.md (lengthen its fence or renumber it); the saved text is never guessed.',
  },
  {
    q: 'Execute says the prompt was refused.',
    a: 'Another plugin or Claude Code refused it. The reason is shown exactly as Claude Code gave it.',
  },
  {
    q: 'A prompt I just added does not show.',
    a: 'Run /vault refresh. The menu re-reads the file when it opens and after its own changes, not when another program edits it.',
  },
  {
    q: 'The vault is disabled and mentions HOME.',
    a: 'The HOME environment variable is not set, so the folder cannot be found. Set HOME, or set the vaultDir option to an absolute folder.',
  },
]

/** @param {Record<string, any> | undefined} userConfig the manifest's userConfig */
export function settingsFromManifest(userConfig) {
  return Object.entries(userConfig ?? {}).map(([key, f]) => ({
    key,
    title: f.title ?? key,
    description: f.description ?? '',
    default: f.default,
    type: f.type,
  }))
}

const norm = v => (Array.isArray(v) ? v.join(' ') : String(v ?? '')).toLowerCase()

/**
 * Filter every help section by the query: all words must match somewhere in an item.
 * @param {string} query
 * @param {{ operations: any[], userConfig?: Record<string, any> }} ctx
 */
export function searchHelp(query, { operations, userConfig }) {
  const words = (query ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean)
  const hit = (...fields) => {
    const hay = fields.map(norm).join('\n')
    return words.every(w => hay.includes(w))
  }
  const result = {
    query: (query ?? '').trim(),
    operations: operations.filter(o => hit(o.id, o.name, o.syntax, o.description, o.examples, o.section)),
    shortcuts: SHORTCUTS.filter(s => hit(s.keys, s.does)),
    settings: settingsFromManifest(userConfig).filter(s => hit(s.key, s.title, s.description)),
    faq: FAQ.filter(x => hit(x.q, x.a)),
    troubleshooting: TROUBLESHOOTING.filter(x => hit(x.q, x.a)),
  }
  result.empty =
    result.operations.length + result.shortcuts.length + result.settings.length + result.faq.length + result.troubleshooting.length === 0
  return result
}

/** Plain-text rendering (used by /vault help where nothing can draw). */
export function renderHelp(r) {
  if (r.empty) return `No help matches "${r.query}".`
  const out = []
  if (r.operations.length) {
    out.push('Commands')
    for (const o of r.operations) {
      out.push(`  ${o.syntax}`, `    ${o.description}`, `    e.g. ${o.examples.join('   ')}`)
    }
  }
  if (r.shortcuts.length) out.push('', 'Keyboard shortcuts', ...r.shortcuts.map(s => `  ${s.keys}: ${s.does}`))
  if (r.settings.length) {
    out.push('', 'Settings')
    for (const s of r.settings) out.push(`  ${s.key} (default ${JSON.stringify(s.default)}): ${s.description}`)
  }
  if (r.faq.length) out.push('', 'FAQ', ...r.faq.flatMap(x => [`  ${x.q}`, `    ${x.a}`]))
  if (r.troubleshooting.length) out.push('', 'Troubleshooting', ...r.troubleshooting.flatMap(x => [`  ${x.q}`, `    ${x.a}`]))
  return out.join('\n')
}

/** Markdown rendering (used by the Help view, which draws it). */
export function helpMarkdown(r) {
  if (r.empty) return `No help matches "${r.query}".`
  const out = []
  if (r.operations.length) {
    out.push('### Commands')
    for (const o of r.operations) out.push(`\`${o.syntax}\``, o.description, `e.g. ${o.examples.map(x => '`' + x + '`').join('  ')}`, '')
  }
  if (r.shortcuts.length) {
    out.push('### Keyboard shortcuts')
    for (const s of r.shortcuts) out.push(`**${s.keys}**: ${s.does}`, '')
  }
  if (r.settings.length) {
    out.push('### Settings')
    for (const s of r.settings) out.push(`**${s.key}** (default \`${JSON.stringify(s.default)}\`): ${s.description}`, '')
  }
  if (r.faq.length) {
    out.push('### FAQ')
    for (const x of r.faq) out.push(`**${x.q}**`, x.a, '')
  }
  if (r.troubleshooting.length) {
    out.push('### Troubleshooting')
    for (const x of r.troubleshooting) out.push(`**${x.q}**`, x.a, '')
  }
  return out.join('\n').trimEnd()
}
