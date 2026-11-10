// Mod-level tests (claude plugin test mod). Nothing sits beneath the mod: each hook here
// stands for the engine, so these prove what the mod DRAWS and DOES with the calls it
// makes. They cannot prove Claude Code really accepts a prompt: docs/ACCEPTANCE.md does.
import { expect, test, mock } from 'claude-code/testing'

import { renderEntry } from '../hooks/lib/grammar.mjs'

const PLUGIN = 'prompt-vault-mod'
const VAULT = '/h/.claude/prompt-vault/prompts.md'
const entry = (id: string, over: any = {}) =>
  renderEntry({ id, done: false, title: 'Title ' + id, category: 'Claude Code', created: '2026-11-10', body: 'body of ' + id + '\n```js\nx\n```', ...over })
const VAULT_TEXT = `# DB\n\nNext ID counter: 3\n\n<!-- PROMPTS START -->\n${entry('P0001')}${entry('P0002', { category: 'ChatGPT' })}<!-- PROMPTS END -->\n`

const BAND = {
  plugin: PLUGIN,
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const
const PANE = {
  plugin: PLUGIN,
  component: 'Pane',
  requestId: 'vault',
  props: { title: 'Prompt Vault', isFocused: true, bodyColumns: 34, placement: 'inline', scroll: { offset: 0, bodyRows: 12 }, view: {} },
} as const
const SURFACES = ['terminal', 'desktop', 'vscode'] as const

function world($: any, on: any, initial = VAULT_TEXT) {
  const w: any = { files: { [VAULT]: initial } as Record<string, string>, writes: [] as string[], submitted: [] as any[], toasts: [] as string[], mtime: 1000 }
  mock.env(on, { HOME: '/h' })
  mock.clock(on)
  on('command.register', () => ({ value: { command: 'vault' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.toast', (_: any, e: any) => ((w.toasts.push(e.text), { value: undefined })))
  on('ui.log', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('fs.stat', (_: any, e: any) =>
    e.path in w.files
      ? { value: { kind: 'file', size: w.files[e.path].length, mtimeMs: w.mtime, isLink: false } }
      : { deny: 'ENOENT: no such file or directory' },
  )
  on('fs.read', (_: any, e: any) => (e.path in w.files ? { value: w.files[e.path] } : { deny: 'ENOENT: no such file or directory' }))
  on('fs.write', (_: any, e: any) => {
    w.files[e.path] = e.text
    w.writes.push(e.path)
    w.mtime += 1
    return { value: undefined }
  })
  on('prompt.submit', (_: any, e: any) => {
    w.submitted.push(e)
    return { text: e.text }
  })
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  return w
}

async function start($: any) {
  await $.session.start({ cwd: '/', surface: 'vscode', isInteractive: true })
}

test('the launcher button is drawn above the prompt on every surface', async ($, on) => {
  world($, on)
  await start($)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...BAND, surface })
    const button = await ui.find({ type: 'Button', key: 'launch' })
    expect(button?.text).toContain('Prompt Vault')
    await ui.unmount()
  }
})

test('the menu offers browse, run by ID, add and help on every surface', async ($, on) => {
  world($, on)
  await start($)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    for (const key of ['m-browse', 'm-run', 'm-add', 'm-help']) {
      expect(await ui.find({ type: 'Button', key })).toBeDefined()
    }
    expect((await ui.find({ type: 'Text', text: /2 saved/ }))?.text).toContain('2 saved')
    await ui.unmount()
  }
})

test('Browse lists every saved prompt with run and remove buttons', async ($, on) => {
  world($, on)
  await start($)
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  await ui.press({ key: 'm-browse' })
  for (const id of ['P0001', 'P0002']) {
    expect(await ui.find({ type: 'Button', key: 'open-' + id })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'del-' + id })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'run-' + id })).toBeDefined()
  }
  await ui.unmount()
})

test('pressing run submits the exact saved text as the person and shows accepted only after it resolves', async ($, on) => {
  const w = world($, on)
  await start($)
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  await ui.press({ key: 'm-browse' })
  await ui.press({ key: 'run-P0001' })
  expect(w.submitted).toHaveLength(1)
  expect(w.submitted[0].text).toBe('body of P0001\n```js\nx\n```')
  expect(w.submitted[0].origin.asUser).toBe(true)
  expect(await ui.find({ type: 'Text', text: /P0001 accepted by Claude Code/ })).toBeDefined()
  expect(w.writes).toHaveLength(0)
  await ui.unmount()
})

test('a prompt outside Claude Code asks first and sends nothing until confirmed', async ($, on) => {
  const w = world($, on)
  await start($)
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  await ui.press({ key: 'm-browse' })
  await ui.press({ key: 'run-P0002' })
  expect(w.submitted).toHaveLength(0)
  await ui.press({ key: 'open-P0002' })
  expect(await ui.find({ type: 'Text', text: /Send it to Claude Code anyway/ })).toBeDefined()
  await ui.press({ key: 'd-send' })
  expect(w.submitted).toHaveLength(1)
  expect(w.submitted[0].text).toContain('body of P0002')
  await ui.unmount()
})

test('removing a prompt needs a second press and leaves the others untouched', async ($, on) => {
  const w = world($, on)
  await start($)
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  await ui.press({ key: 'm-browse' })
  await ui.press({ key: 'del-P0001' })
  expect(w.writes).toHaveLength(0)
  await ui.press({ key: 'del-yes-P0001' })
  expect(w.files[VAULT]).not.toContain('P0001: Title')
  expect(w.files[VAULT]).toContain(entry('P0002', { category: 'ChatGPT' }))
  expect(w.files[VAULT + '.bak']).toBe(VAULT_TEXT)
  await ui.unmount()
})

test('adding a prompt saves it with the chosen category and keeps its text exactly', async ($, on) => {
  const w = world($, on)
  await start($)
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  await ui.press({ key: 'm-add' })
  await ui.input({ key: 'f-title', text: 'My new prompt' })
  await ui.input({ key: 'f-body', text: 'first\n```\nsecond' })
  await ui.press({ key: 'f-save' })
  expect(await ui.find({ type: 'Text', text: /Choose a category/ })).toBeDefined()
  expect(w.writes).toHaveLength(0)
  await ui.select({ key: 'f-cat', value: 'Research' })
  await ui.press({ key: 'f-save' })
  expect(w.files[VAULT]).toContain('## [ ] P0003: My new prompt')
  expect(w.files[VAULT]).toContain('````text\nfirst\n```\nsecond\n````')
  expect(w.files[VAULT]).toContain('Next ID counter: 4')
  await ui.unmount()
})

test('run by ID submits the prompt with that ID', async ($, on) => {
  const w = world($, on)
  await start($)
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  await ui.press({ key: 'm-run' })
  await ui.input({ key: 'r-id', text: 'p0001' })
  await ui.press({ key: 'r-go' })
  expect(w.submitted).toHaveLength(1)
  expect(w.submitted[0].text).toContain('body of P0001')
  await ui.unmount()
})

test('Help lists every command, and its search narrows them', async ($, on) => {
  world($, on)
  await start($)
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  await ui.press({ key: 'm-help' })
  const all = await ui.find({ type: 'Markdown' })
  for (const syntax of ['/vault run <id>', '/vault list [pending|done|all]', '/vault add <category>']) {
    expect(all?.props.text as string).toContain(syntax)
  }
  await ui.input({ key: 'h-q', text: 'categories', kind: 'submit' })
  const narrowed = await ui.find({ type: 'Markdown' })
  expect(narrowed?.props.text as string).toContain('/vault categories')
  expect(narrowed?.props.text as string).not.toContain('/vault run <id>')
  await ui.unmount()
})

test('a missing vault is reported in the menu instead of an empty list', async ($, on) => {
  const w = world($, on)
  delete w.files[VAULT]
  await start($)
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  expect(await ui.find({ type: 'Text', text: /does not exist/ })).toBeDefined()
  await ui.unmount()
})
