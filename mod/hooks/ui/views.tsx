// Prompt Vault views. Pure drawing: each function takes the surface's element table
// (`UI`, from $.ui.resolve), plain data, and an `actions` object of callbacks made by
// register.tsx. Nothing here touches `$`, state or files.
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
    <Box flexDirection="column">
      <Box flexDirection="row">
        <Text bold>Prompt Vault</Text>
        {count !== null && <Text dimColor> {count} saved</Text>}
      </Box>
      {idx && !idx.ok && <Text color="error">{idx.message}</Text>}
      {RunLine(UI, d.exec, null, a)}
      <Button key="m-browse" variant="primary" label="Browse prompts" onPress={a.openList} />
      <Button key="m-run" label="Run a prompt by ID" onPress={a.openRunId} />
      <Button key="m-add" label="Add a prompt" onPress={a.openAdd} />
      <Button key="m-help" label="Help" onPress={a.openHelp} />
      <Box flexDirection="row" gap={1}>
        <Button key="m-refresh" label="Refresh" onPress={a.refresh} />
        <Button key="m-close" label="Close" onPress={a.close} />
      </Box>
    </Box>
  )
}

function List(UI: any, d: any, a: any) {
  const { Box, Text, Button, Input } = UI
  const { view, index, exec } = d
  const pageSize = d.pageSize
  const room = Math.max(10, d.columns - 14)
  const p = index && index.ok ? pageOf(index.entries, { query: view.query, filter: view.filter, page: view.page, pageSize }) : null
  const blocked = canExecute(exec)
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" gap={1}>
        <Button key="l-back" label="‹ Back" onPress={a.openMenu} />
        <Text bold>Prompts{p ? ` (${p.total})` : ''}</Text>
      </Box>
      {index && !index.ok && <Text color="error">{index.message}</Text>}
      <Input key="l-search" placeholder="Search, then Enter" value={view.query} onSubmit={a.setQuery} />
      <Box flexDirection="row" gap={1}>
        {['all', 'pending', 'done'].map(f => (
          <Button key={'l-f-' + f} label={(view.filter === f ? '• ' : '') + f} onPress={() => a.setFilter(f)} />
        ))}
      </Box>
      {RunLine(UI, exec, null, a)}
      {p && p.rows.length === 0 && <Text dimColor>No prompts{view.query ? ' match' : ''}.</Text>}
      {p &&
        p.rows.map((r: any) =>
          view.pendingDelete === r.id ? (
            <Box key={'row-' + r.id} flexDirection="row" gap={1}>
              <Text color="warning">Delete {r.id}?</Text>
              <Button key={'del-yes-' + r.id} label="Yes" onPress={() => a.confirmDelete(r.id)} />
              <Button key={'del-no-' + r.id} label="No" onPress={a.cancelDelete} />
            </Box>
          ) : (
            <Box key={'row-' + r.id} flexDirection="row" gap={1}>
              {blocked.ok && !r.flag ? (
                <Button key={'run-' + r.id} label="▶" onPress={() => a.run(r.id)} />
              ) : (
                <Text dimColor>·</Text>
              )}
              <Button key={'del-' + r.id} label="✕" onPress={() => a.askDelete(r.id)} />
              <Button
                key={'open-' + r.id}
                label={`${r.done ? '✓' : '○'} ${r.id} ${truncate(r.title, room)}`}
                onPress={() => a.openDetail(r.id)}
              />
            </Box>
          ),
        )}
      {p && p.pages > 1 && (
        <Box flexDirection="row" gap={1}>
          <Button key="l-prev" label="‹" onPress={() => a.setPage(p.page - 1)} />
          <Text dimColor>
            {p.page + 1}/{p.pages}
          </Text>
          <Button key="l-next" label="›" onPress={() => a.setPage(p.page + 1)} />
        </Box>
      )}
      <Text dimColor>▶ run   ✕ delete   click a title to open</Text>
    </Box>
  )
}

function Detail(UI: any, d: any, a: any) {
  const { Box, Text, Button, Code } = UI
  const { detail, exec, view } = d
  if (!detail) {
    return (
      <Box flexDirection="column">
        <Text dimColor>Loading…</Text>
        <Button key="d-back" label="‹ Back" onPress={a.openList} />
      </Box>
    )
  }
  const run = exec.run && exec.run.id === detail.id ? exec.run : null
  const confirming = run && run.state === 'confirming'
  const blocked = canExecute(exec)
  const flagged = Boolean(detail.flag)
  const stoppable =
    run && (run.state === 'accepted' || run.state === 'accepted-changed') && !run.finished && exec.turn.running
  return (
    <Box flexDirection="column">
      <Text bold>
        {detail.done ? '✓' : '○'} {detail.id} {detail.title}
      </Text>
      <Text dimColor>
        {detail.category ?? 'no category'}
        {detail.priority ? ' · ' + detail.priority : ''} · {detail.created ?? ''}
      </Text>
      {detail.preview.text !== '' && <Code source={detail.preview.text} />}
      <Text dimColor>
        {detail.bodyLength} characters
        {detail.preview.truncated ? `. Preview cut (${detail.preview.hiddenLines} more lines); Run sends all of it.` : ''}
      </Text>
      {flagged && <Text color="warning">{FLAG_TEXT[detail.flag]}</Text>}
      {RunLine(UI, exec, detail.id, a)}
      {confirming && (
        <Box flexDirection="column">
          <Text color="warning">Filed under {detail.category ?? 'no category'}. Send it to Claude Code anyway?</Text>
          <Box flexDirection="row" gap={1}>
            <Button key="d-send" variant="primary" label="Send" onPress={() => a.run(detail.id, true)} />
            <Button key="d-cancel" label="Cancel" onPress={a.cancelConfirm} />
          </Box>
        </Box>
      )}
      {!confirming && !flagged && (blocked.ok ? (
        <Button key="d-run" variant="primary" label="Run" onPress={() => a.run(detail.id)} />
      ) : (
        <Text dimColor>{blocked.message}</Text>
      ))}
      {stoppable &&
        (view.pendingStop ? (
          <Box flexDirection="column">
            <Text color="warning">Stopping can leave a tool half-finished. Stop the turn?</Text>
            <Box flexDirection="row" gap={1}>
              <Button key="d-stop-yes" label="Yes, stop" onPress={a.confirmStop} />
              <Button key="d-stop-no" label="No" onPress={a.cancelStop} />
            </Box>
          </Box>
        ) : (
          <Button key="d-stop" label="Stop turn" onPress={a.askStop} />
        ))}
      <Box flexDirection="row" gap={1}>
        {detail.flag !== 'broken' && detail.flag !== 'empty' && (
          <Button key="d-load" label="Load into prompt box" onPress={() => a.load(detail.id)} />
        )}
      </Box>
      <Box flexDirection="row" gap={1}>
        <Button key="d-done" label={detail.done ? 'Reopen' : 'Done'} onPress={() => a.toggleDone(detail.id, !detail.done)} />
        {!flagged && <Button key="d-edit" label="Edit" onPress={() => a.openEdit(detail.id)} />}
      </Box>
      {view.pendingDelete === detail.id ? (
        <Box flexDirection="row" gap={1}>
          <Text color="warning">Delete {detail.id}?</Text>
          <Button key="d-del-yes" label="Yes" onPress={() => a.confirmDelete(detail.id)} />
          <Button key="d-del-no" label="No" onPress={a.cancelDelete} />
        </Box>
      ) : (
        !flagged && <Button key="d-del" label="Delete" onPress={() => a.askDelete(detail.id)} />
      )}
      <Button key="d-back" label="‹ Back" onPress={a.openList} />
    </Box>
  )
}

function RunById(UI: any, d: any, a: any) {
  const { Box, Text, Button, Input } = UI
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" gap={1}>
        <Button key="r-back" label="‹ Back" onPress={a.openMenu} />
        <Text bold>Run a prompt by ID</Text>
      </Box>
      <Input key="r-id" label="ID" placeholder="P0001" onInput={(v: string) => a.draftSet('runId', v)} onSubmit={(v: string) => a.runById(v)} />
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
    <Box flexDirection="column">
      <Text bold>{editing ? `Edit ${view.formId}` : 'Add a prompt'}</Text>
      <Select key="f-cat" label="Category" options={cats} value={view.seed.category} onSelect={(v: string) => a.draftSet('category', v)} />
      <Select key="f-pri" label="Priority" options={pris} value={view.seed.priority} onSelect={(v: string) => a.draftSet('priority', v)} />
      <Input key="f-title" label="Title" value={view.seed.title} onInput={(v: string) => a.draftSet('title', v)} onSubmit={(v: string) => a.draftSet('title', v)} />
      <Input key="f-body" label="Prompt" rows={5} value={view.seed.body} onInput={(v: string) => a.draftSet('body', v)} onSubmit={(v: string) => a.draftSet('body', v)} />
      <Text dimColor>Enter in the box above keeps the text; use Save below.</Text>
      {view.formError && <Text color="error">{view.formError}</Text>}
      <Box flexDirection="row" gap={1}>
        <Button key="f-save" variant="primary" label="Save" onPress={a.saveForm} />
        <Button key="f-cancel" label="Cancel" onPress={a.cancelForm} />
      </Box>
    </Box>
  )
}

function Help(UI: any, d: any, a: any) {
  const { Box, Text, Button, Input, Markdown } = UI
  const result = searchHelp(d.view.helpQuery, { operations: OPERATIONS, userConfig: USER_CONFIG })
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" gap={1}>
        <Button key="h-back" label="‹ Back" onPress={a.openMenu} />
        <Text bold>Help</Text>
      </Box>
      <Input key="h-q" placeholder="Search help, then Enter" value={d.view.helpQuery} onSubmit={a.setHelpQuery} />
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
    <Box flexDirection="column">
      {body}
      {d.view.notice && (
        <Box flexDirection="row" gap={1}>
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
      ? run.state === 'sending' ? ` sending ${run.id}…` : ` ${run.id} running`
      : ''
  return (
    <Box flexDirection="row">
      <Button key="launch" variant="primary" label="Prompt Vault" onPress={a.toggle} />
      {hint !== '' && <Text dimColor>{hint}</Text>}
    </Box>
  )
}
