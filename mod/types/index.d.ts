export type RunInfo = {
  state: string
  id: string
  reason?: string
  slow?: boolean
  finished?: boolean
}

export type Exec = {
  turn: { running: boolean; turnId?: string }
  slot: { token: string; promptId: string; startedAt: number; phase: string; turnId?: string } | null
  run: RunInfo | null
}

export type Seed = { title: string; project: string; priority: string; body: string }

export type View = {
  screen: string
  page: number
  query: string
  filter: string
  project: string
  paneOpen: boolean
  selectedId: string | null
  pendingDelete: string | null
  pendingStop: boolean
  pendingProjectDelete: string | null
  notice: string | null
  helpQuery: string
  formMode: string
  formId: string | null
  seed: Seed
  formError: string | null
  projectFormMode: string
  projectFrom: string | null
  projectSeed: string
  projectError: string | null
  updateInfo: { state: string; message: string; version: string | null } | null
}

export type LightEntry = {
  id: string
  done: boolean
  title: string
  project?: string
  priority?: string
  created?: string
  bodyLength: number
  flag?: string
  hay: string
}

export type Index =
  | { ok: true; mtimeMs: number; projects: { name: string; count: number }[]; unfiled: number; entries: LightEntry[] }
  | { ok: false; error: string; message: string }
  | null

export type Detail = {
  id: string
  done: boolean
  title: string
  project?: string
  priority?: string
  created?: string
  bodyLength: number
  flag?: string
  preview: { text: string; hiddenLines: number; truncated: boolean }
} | null

export type Form = Seed & { runId: string; projectName: string }

declare module 'claude-code' {
  interface PluginState {
    'prompt-vault-mod': {
      exec: Shaped<Exec>
      view: Shaped<View>
      index: Shaped<Index>
      detail: Shaped<Detail>
      form: Shaped<Form>
    }
  }
}
