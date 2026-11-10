// SLICE 0 SPIKE: throwaway probe. Reports what this Claude Code build draws.
// Production code replaces this file under TDD (design doc, Slice 2+).
import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

const PANE = 'vault'
const REPORT =
  '/private/tmp/claude-502/-Users-raymond-Desktop-Prompt-Vault-for-Claude-Code/3353d60f-15d7-464a-b9f1-9b563660fd9e/scratchpad/probe-report.json'
const VAULT_COPY =
  '/private/tmp/claude-502/-Users-raymond-Desktop-Prompt-Vault-for-Claude-Code/3353d60f-15d7-464a-b9f1-9b563660fd9e/scratchpad/vault-copy'

const seen = atom({ plugin: 'prompt-vault-mod', key: 'seen' } as const, [], { shape: 'seen-1' })
const events = atom({ plugin: 'prompt-vault-mod', key: 'events' } as const, [], { shape: 'events-1' })
const pings = atom({ plugin: 'prompt-vault-mod', key: 'pings' } as const, 0)
const draft = atom({ plugin: 'prompt-vault-mod', key: 'draft' } as const, '')

const facts: Record<string, unknown> = {}

async function save($: any) {
  const body = {
    facts,
    seen: await read($, seen),
    events: await read($, events),
    pings: await read($, pings),
    draftLength: (await read($, draft)).length,
  }
  await $.fs.write(REPORT, JSON.stringify(body, null, 2)).catch(() => undefined)
}

async function note($: any, text: string) {
  const stamp = await $.clock.now()
  await update($, events, (list: string[]) => [...list, `${stamp} ${text}`].slice(-80))
  await save($)
}

async function see($: any, key: string) {
  await update($, seen, (list: string[]) => (list.includes(key) ? list : [...list, key]))
  await save($)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'vault',
      description: 'Prompt Vault spike: doctor | pane | tree | fs | status | submit <text>',
      argumentHint: 'doctor | pane | tree | fs | status | submit <text>',
    })
    facts.version = await $.session.version()
    facts.surfaces = await $.session.surfaces()
    facts.startSurface = (e as any).surface
    const home = await $.env.get('HOME')
    facts.home = home
    const opened = await $.ui.open({ id: PANE, title: 'Prompt Vault' })
    facts.openAtStart = opened
    await note($, `session.start surface=${String((e as any).surface)} opened=${JSON.stringify(opened)}`)
    return next(e)
  })

  on('command.run', { command: 'vault' }, async ($, e) => {
    const [sub, ...rest] = e.args.trim().split(/\s+/)
    if (sub === 'pane' || sub === 'doctor' || sub === '') {
      const opened = await $.ui.open({ id: PANE, title: 'Prompt Vault', focus: true, closeOnEscape: true })
      await note($, `command ${sub || 'open'} -> ${JSON.stringify(opened)}`)
      return { text: `vault: pane ${JSON.stringify(opened)}; report written` }
    }
    if (sub === 'status') {
      $.ui.status('Prompt Vault spike: status line draws')
      $.ui.toast('Prompt Vault spike: toast draws')
      await note($, 'status+toast called')
      return { text: 'vault: status and toast called' }
    }
    if (sub === 'fs') {
      const out: Record<string, unknown> = {}
      try {
        const path = `${VAULT_COPY}/prompts.md`
        const stat = await $.fs.stat(path)
        const text = (await $.fs.read(path)) as string
        out.stat = stat
        out.readLength = text.length
        await $.fs.write(`${VAULT_COPY}/probe.txt`, 'one\n```\ntwo\n```\n')
        out.back = await $.fs.read(`${VAULT_COPY}/probe.txt`)
        out.stat2 = await $.fs.stat(`${VAULT_COPY}/probe.txt`)
      } catch (err) {
        out.error = String(err)
      }
      facts.fs = out
      await note($, `fs probe ${JSON.stringify(out).slice(0, 300)}`)
      return { text: 'vault: fs probe done' }
    }
    if (sub === 'submit') {
      const text = rest.join(' ')
      const started = await $.clock.now()
      await note($, `submit start len=${text.length}`)
      void $.prompt
        .submit({ text, asUser: true })
        .then(async (r: any) => {
          const ms = (await $.clock.now()) - started
          await note($, `submit resolved after ${ms}ms drop=${String(r.drop)} sameText=${r.text === text}`)
        })
        .catch(async (err: unknown) => {
          await note($, `submit rejected ${String(err)}`)
        })
      return { text: 'vault: submit started (not awaited)' }
    }
    if (sub === 'tree') {
      return { text: 'vault: tree' }
    }
    return { text: `vault: unknown subcommand ${sub}` }
  })

  on('prompt.submit', async ($, e, next) => {
    await note(
      $,
      `prompt.submit origin=${e.origin.kind} len=${e.text.length} command=${e.command ? e.command.name : '-'} turnId=${String(e.turnId)}`,
    )
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    await note($, `turn.start agent=${String(e.agentId ?? 'main')} len=${String((e as any).text?.length)}`)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    await note($, `turn.complete agent=${String((e as any).agentId ?? 'main')}`)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    await see($, `AbovePrompt@${e.surface}`)
    if (e.props.hasSurvey) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    return (
      <Box>
        <Button
          key="launch"
          label="Prompt Vault"
          variant="primary"
          onPress={async () => {
            await note($, `launcher pressed surface=${e.surface}`)
            const opened = await $.ui.open({ id: PANE, title: 'Prompt Vault', focus: true, closeOnEscape: true })
            await note($, `launcher open -> ${JSON.stringify(opened)}`)
          }}
        />
        <Text dimColor> spike</Text>
      </Box>
    )
  })

  on('ui.render', { component: 'CommandOutput' }, async ($, e, next) => {
    if (e.props.command !== 'vault') return next(e)
    await see($, `CommandOutput@${e.surface}`)
    if (!e.props.args.startsWith('tree')) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Text>tree under command output (surface {e.surface})</Text>
        <Button
          key="treeping"
          label="press me"
          onPress={() => update($, pings, (n: number) => n + 1).then(() => note($, 'tree button pressed'))}
        />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    await see($, `Pane@${e.surface}`)
    facts.paneProps = { ...e.props, placement: e.props.placement, viewport: e.viewport }
    const { Box, Text, Button, Input, Code } = $.ui.resolve(e)
    const count = await read($, pings)
    const text = await read($, draft)
    const list = await read($, events)
    return (
      <Box flexDirection="column">
        <Text>Prompt Vault spike pane. surface={e.surface} placement={String(e.props.placement)}</Text>
        <Text>
          viewport={JSON.stringify(e.viewport ?? null)} bodyColumns={e.props.bodyColumns}
        </Text>
        <Button key="ping" label={`ping (${count})`} onPress={() => update($, pings, (n: number) => n + 1).then(() => note($, 'pane ping pressed'))} />
        <Input
          key="draft"
          label="draft"
          rows={4}
          value={text}
          onInput={(v: string) => {
            void update($, draft, () => v).then(() =>
              note($, `input change len=${v.length} newlines=${v.split('\n').length - 1} fence=${v.includes('```')}`),
            )
          }}
          onSubmit={(v: string) => {
            void note($, `input submit len=${v.length}`)
          }}
        />
        <Code>{list.slice(-6).join('\n') || 'no events yet'}</Code>
      </Box>
    )
  })
}
