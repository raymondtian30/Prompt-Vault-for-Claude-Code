declare module 'claude-code' {
  interface PluginState {
    'prompt-vault-mod': {
      seen: Shaped<string[]>
      events: Shaped<string[]>
      pings: number
      draft: string
    }
  }
}
