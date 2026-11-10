declare module 'claude-code' {
  interface PluginState {
    'prompt-vault-mod': {
      events: Shaped<string[]>
      pings: number
      draft: string
    }
  }
}
