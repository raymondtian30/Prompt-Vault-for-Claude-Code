// Prompt Vault views. Pure drawing: each function takes the surface's element table
// (`UI`, from $.ui.resolve), plain data, and an `actions` object of callbacks made by
// register.tsx. Nothing here touches `$`, state or files.
//
// Layout rules for a narrow pane: one idea per block, a blank row between blocks
// (gap), the way back always first, words on buttons instead of symbols, labels above
// fields instead of beside them, destructive actions last and apart.
import { truncate, pageOf, runLine } from '../lib/viewmodel.mjs'
import { canExecute } from '../lib/runstate.mjs'
import { OPERATIONS } from '../lib/registry.mjs'
import { USER_CONFIG } from '../lib/config.mjs'
import { searchHelp, helpMarkdown } from '../lib/help.mjs'
import { CATEGORIES, PRIORITIES } from '../lib/grammar.mjs'

const FLAG_TEXT: Record<string, string> = {
  broken: 'This entry has a broken fence in prompts.md, so it cannot be run, edited or deleted here.',
  legacy: 'This entry predates the fence rule and contains a triple-backtick line, so its end is a guess. Fix it in prompts.md.',
  duplicate: 'This ID appears more than once in prompts.md. Fix that first.',
  empty: 'This prompt is empty.',
}

const rule = (columns: number) => '─'.repeat(Math.max(8, Math.min(columns - 2, 48)))

/** Back button plus the screen's title, with a rule under it. */
function Header(UI: any, d: any, title: string, back: { key: string; onPress: any } | null, extra?: string) {
  const { Box, Text, Button } = UI
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" gap={1}>
        {back && <Button key={back.key} label="‹ Back" onPress={back.onPress} />}
        <Text bold>{title}</Text>
        {extra && <Text dimColor>{extra}</Text>}
      </Box>
      <Text dimColor>{rule(d.columns)}</Text>
    </Box>
  )
}

function RunLine(UI: any, exec: any, id: string | null, actions: any) {
  const { Box, Text, Button } = UI
  const run = exec.run && (id === null || exec.run.id === id) ? exec.run : null
  const line = runLine(run)
  if (!line) return null
  const bad = run.state === 'refused' || run.state === 'failed'
  const good = run.state === 'accepted'
  return (
    <Box flexDirection="column">
      <Text color={bad ? 'error' : good ? 'success' : run.slow ? 'warning' : undefined}>{line}</Text>
      {run.state === 'sending' && run.slow && (
        <Button key="reset" label="Reset (it may still start later)" onPress={actions.reset} />
      )}
    </Box>
  )
}

function Menu(UI: any, d: any, a: any) {
  const { Box, Text, Button } = UI
  const idx = d.index
  const count = idx && idx.ok ? idx.entries.length : null
  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        <Text bold>Prompt Vault</Text>
        <Text dimColor>{count === null ? 'Your saved prompts' : `${count} saved prompt${count === 1 ? '' : 's'}`}</Text>
        <Text dimColor>{rule(d.columns)}</Text>
      </Box>
      {idx && !idx.ok && <Text color="error">{idx.message}</Text>}
      {RunLine(UI, d.exec, null, a)}
      <Box flexDirection="column" gap={1}>
        <Button key="m-browse" variant="primary" label="Browse prompts" onPress={a.openList} />
        <Button key="m-run" label="Run a prompt by ID" onPress={a.openRunId} />
        <Button key="m-add" label="Add a prompt" onPress={a.openAdd} />
      </Box>
      <Box flexDirection="row" gap={2}>
        <Button key="m-help" label="Help" onPress={a.openHelp} />
        <Button key="m-refresh" label="Refresh" onPress={a.refresh} />
        <Button key="m-close" label="Close" onPress={a.close} />
      </Box>
    </Box>
  )
}

function Row(UI: any, r: any, d: any, a: any, blocked: any) {
  const { Box, Text, Button } = UI
  const room = Math.max(10, d.columns - 10)
  const meta = [r.category ?? 'no category', r.priority, r.flag ? `⚠ ${r.flag}` : null].filter(Boolean).join(' · ')
  if (d.view.pendingDelete === r.id) {
    return (
      <Box key={'row-' + r.id} flexDirection="column">
        <Text bold>
          {r.id} {truncate(r.title, room)}
        </Text>
        <Text color="warning">Remove this prompt for good?</Text>
        <Box flexDirection="row" gap={2}>
          <Button key={'del-yes-' + r.id} label="Yes, remove" onPress={() => a.confirmDelete(r.id)} />
          <Button key={'del-no-' + r.id} label="Keep it" onPress={a.cancelDelete} />
        </Box>
      </Box>
    )
  }
  return (
    <Box key={'row-' + r.id} flexDirection="column">
      <Button key={'open-' + r.id} label={`${r.done ? '✓' : '○'} ${r.id}  ${truncate(r.title, room)}`} onPress={() => a.openDetail(r.id)} />
      <Text dimColor>{'   ' + meta}</Text>
      <Box flexDirection="row" gap={2}>
        {blocked.ok && !r.flag && <Button key={'run-' + r.id} label="Run" onPress={() => a.run(r.id)} />}
        <Button key={'del-' + r.id} label="Remove" onPress={() => a.askDelete(r.id)} />
      </Box>
    </Box>
  )
}

function List(UI: any, d: any, a: any) {
  const { Box, Text, Button, Input } = UI
  const { view, index, exec } = d
  const p = index && index.ok ? pageOf(index.entries, { query: view.query, filter: view.filter, page: view.page, pageSize: d.pageSize }) : null
  const blocked = canExecute(exec)
  return (
    <Box flexDirection="column" gap={1}>
      {Header(UI, d, 'Prompts', { key: 'l-back', onPress: a.openMenu }, p ? `${p.total}` : undefined)}
      {index && !index.ok && <Text color="error">{index.message}</Text>}
      <Box flexDirection="column">
        <Text bold>Search</Text>
        <Input key="l-search" placeholder="type, then press Enter" value={view.query} onSubmit={a.setQuery} />
      </Box>
      <Box flexDirection="row" gap={2}>
        {['all', 'pending', 'done'].map(f => (
          <Button key={'l-f-' + f} variant={view.filter === f ? 'primary' : undefined} label={f} onPress={() => a.setFilter(f)} />
        ))}
      </Box>
      {RunLine(UI, exec, null, a)}
      {p && p.rows.length === 0 && <Text dimColor>No prompts{view.query ? ' match your search' : ''}.</Text>}
      {p && p.rows.map((r: any) => Row(UI, r, d, a, blocked))}
      {p && p.pages > 1 && (
        <Box flexDirection="row" gap={2}>
          <Button key="l-prev" label="‹ Previous" onPress={() => a.setPage(p.page - 1)} />
          <Text dimColor>
            page {p.page + 1} of {p.pages}
          </Text>
          <Button key="l-next" label="Next ›" onPress={() => a.setPage(p.page + 1)} />
        </Box>
      )}
    </Box>
  )
}

function Detail(UI: any, d: any, a: any) {
  const { Box, Text, Button, Code } = UI
  const { detail, exec, view } = d
  const back = { key: 'd-back', onPress: a.openList }
  if (!detail) {
    return (
      <Box flexDirection="column" gap={1}>
        {Header(UI, d, 'Prompt', back)}
        <Text dimColor>Loading…</Text>
      </Box>
    )
  }
  const run = exec.run && exec.run.id === detail.id ? exec.run : null
  const confirming = run && run.state === 'confirming'
  const blocked = canExecute(exec)
  const flagged = Boolean(detail.flag)
  const stoppable =
    run && (run.state === 'accepted' || run.state === 'accepted-changed') && !run.finished && exec.turn.running
  const meta = [detail.id, detail.category ?? 'no category', detail.priority, detail.created].filter(Boolean).join(' · ')
  return (
    <Box flexDirection="column" gap={1}>
      {Header(UI, d, 'Prompt', back)}
      <Box flexDirection="column">
        <Text bold>
          {detail.done ? '✓ ' : ''}
          {detail.title}
        </Text>
        <Text dimColor>{meta}</Text>
      </Box>
      <Box flexDirection="column">
        {detail.preview.text !== '' && <Code source={detail.preview.text} />}
        <Text dimColor>
          {detail.bodyLength} characters
          {detail.preview.truncated ? ` · preview cut, ${detail.preview.hiddenLines} more lines. Run sends all of it.` : ''}
        </Text>
      </Box>
      {flagged && <Text color="warning">{FLAG_TEXT[detail.flag]}</Text>}
      {RunLine(UI, exec, detail.id, a)}
      {confirming && (
        <Box flexDirection="column">
          <Text color="warning">This prompt is filed under {detail.category ?? 'no category'}. Send it to Claude Code anyway?</Text>
          <Box flexDirection="row" gap={2}>
            <Button key="d-send" variant="primary" label="Send it" onPress={() => a.run(detail.id, true)} />
            <Button key="d-cancel" label="Cancel" onPress={a.cancelConfirm} />
          </Box>
        </Box>
      )}
      {!confirming && !flagged && (blocked.ok ? (
        <Button key="d-run" variant="primary" label="Run this prompt" onPress={() => a.run(detail.id)} />
      ) : (
        <Text dimColor>{blocked.message}</Text>
      ))}
      {stoppable &&
        (view.pendingStop ? (
          <Box flexDirection="column">
            <Text color="warning">Stopping can leave a tool half-finished. Stop the turn?</Text>
            <Box flexDirection="row" gap={2}>
              <Button key="d-stop-yes" label="Yes, stop" onPress={a.confirmStop} />
              <Button key="d-stop-no" label="No" onPress={a.cancelStop} />
            </Box>
          </Box>
        ) : (
          <Button key="d-stop" label="Stop the turn" onPress={a.askStop} />
        ))}
      <Box flexDirection="column">
        {detail.flag !== 'broken' && detail.flag !== 'empty' && (
          <Button key="d-load" label="Put it in the prompt box" onPress={() => a.load(detail.id)} />
        )}
        <Box flexDirection="row" gap={2}>
          <Button key="d-done" label={detail.done ? 'Mark pending' : 'Mark done'} onPress={() => a.toggleDone(detail.id, !detail.done)} />
          {!flagged && <Button key="d-edit" label="Edit" onPress={() => a.openEdit(detail.id)} />}
        </Box>
      </Box>
      {view.pendingDelete === detail.id ? (
        <Box flexDirection="column">
          <Text color="warning">Remove this prompt for good?</Text>
          <Box flexDirection="row" gap={2}>
            <Button key="d-del-yes" label="Yes, remove" onPress={() => a.confirmDelete(detail.id)} />
            <Button key="d-del-no" label="Keep it" onPress={a.cancelDelete} />
          </Box>
        </Box>
      ) : (
        !flagged && <Button key="d-del" label="Remove" onPress={() => a.askDelete(detail.id)} />
      )}
    </Box>
  )
}

function RunById(UI: any, d: any, a: any) {
  const { Box, Text, Button, Input } = UI
  return (
    <Box flexDirection="column" gap={1}>
      {Header(UI, d, 'Run a prompt by ID', { key: 'r-back', onPress: a.openMenu })}
      <Text dimColor>Type an ID such as P0001, then press Enter or Run.</Text>
      <Box flexDirection="column">
        <Text bold>Prompt ID</Text>
        <Input key="r-id" placeholder="P0001" onInput={(v: string) => a.draftSet('runId', v)} onSubmit={(v: string) => a.runById(v)} />
      </Box>
      <Button key="r-go" variant="primary" label="Run" onPress={() => a.runById(null)} />
      {RunLine(UI, d.exec, null, a)}
    </Box>
  )
}

function Form(UI: any, d: any, a: any) {
  const { Box, Text, Button, Input, Select } = UI
  const { view } = d
  const editing = view.formMode === 'edit'
  const cats = [{ value: '', label: 'Choose a category…' }, ...CATEGORIES.map(c => ({ value: c, label: c }))]
  const pris = [{ value: '', label: 'No priority' }, ...PRIORITIES.map(p => ({ value: p, label: p }))]
  return (
    <Box flexDirection="column" gap={1}>
      {Header(UI, d, editing ? `Edit ${view.formId}` : 'Add a prompt', { key: 'f-back', onPress: a.cancelForm })}
      <Box flexDirection="column">
        <Text bold>Category</Text>
        <Select key="f-cat" options={cats} value={view.seed.category} onSelect={(v: string) => a.draftSet('category', v)} />
      </Box>
      <Box flexDirection="column">
        <Text bold>Priority (optional)</Text>
        <Select key="f-pri" options={pris} value={view.seed.priority} onSelect={(v: string) => a.draftSet('priority', v)} />
      </Box>
      <Box flexDirection="column">
        <Text bold>Title</Text>
        <Input key="f-title" value={view.seed.title} onInput={(v: string) => a.draftSet('title', v)} onSubmit={(v: string) => a.draftSet('title', v)} />
      </Box>
      <Box flexDirection="column">
        <Text bold>Prompt text</Text>
        <Input key="f-body" rows={6} value={view.seed.body} onInput={(v: string) => a.draftSet('body', v)} onSubmit={(v: string) => a.draftSet('body', v)} />
        <Text dimColor>Enter keeps your text here. Press Save when you are done.</Text>
      </Box>
      {view.formError && <Text color="error">{view.formError}</Text>}
      <Box flexDirection="row" gap={2}>
        <Button key="f-save" variant="primary" label="Save" onPress={a.saveForm} />
        <Button key="f-cancel" label="Cancel" onPress={a.cancelForm} />
      </Box>
    </Box>
  )
}

function Help(UI: any, d: any, a: any) {
  const { Box, Text, Input, Markdown } = UI
  const result = searchHelp(d.view.helpQuery, { operations: OPERATIONS, userConfig: USER_CONFIG })
  return (
    <Box flexDirection="column" gap={1}>
      {Header(UI, d, 'Help', { key: 'h-back', onPress: a.openMenu })}
      <Box flexDirection="column">
        <Text bold>Search help</Text>
        <Input key="h-q" placeholder="type, then press Enter" value={d.view.helpQuery} onSubmit={a.setHelpQuery} />
      </Box>
      <Markdown text={helpMarkdown(result)} />
    </Box>
  )
}

/** The pane's whole body for the current screen. */
export function PaneScreen(UI: any, d: any, a: any) {
  const { Box, Text, Button } = UI
  const screen = d.view.screen
  const body =
    screen === 'list' ? List(UI, d, a)
    : screen === 'detail' ? Detail(UI, d, a)
    : screen === 'runid' ? RunById(UI, d, a)
    : screen === 'form' ? Form(UI, d, a)
    : screen === 'help' ? Help(UI, d, a)
    : Menu(UI, d, a)
  return (
    <Box flexDirection="column" gap={1} paddingX={1}>
      {body}
      {d.view.notice && (
        <Box flexDirection="column">
          <Text color="warning">{d.view.notice}</Text>
          <Button key="n-ok" label="OK" onPress={a.clearNotice} />
        </Box>
      )}
    </Box>
  )
}

/** The launcher in the band above the prompt box. */
export function Launcher(UI: any, d: any, a: any) {
  const { Box, Text, Button } = UI
  const run = d.exec.run
  const hint =
    run && (run.state === 'sending' || ((run.state === 'accepted' || run.state === 'accepted-changed') && !run.finished))
      ? run.state === 'sending' ? `  sending ${run.id}…` : `  ${run.id} running`
      : ''
  return (
    <Box flexDirection="row">
      <Button key="launch" variant="primary" label="Prompt Vault" onPress={a.toggle} />
      {hint !== '' && <Text dimColor>{hint}</Text>}
    </Box>
  )
}
