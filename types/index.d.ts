/** Which banner is on screen: the big centred line above the prompt. */
export type GitGudBannerKind = 'died' | 'felled' | 'great' | 'bonfire'

/** The banner above the prompt, shown for a few seconds then cleared. */
export type GitGudBanner = {
  /** Increments per banner, so a stale timer never clears a newer one. */
  id: number
  kind: GitGudBannerKind
  /** The dim line under the title (what killed you, runes gained). */
  subtitle: string
}

/** Runes dropped on death, waiting where you fell. */
export type GitGudBloodstain = {
  runes: number
  /** The command that killed you: succeed at it again to retrieve them. */
  killer: string
}

/** Lifetime stats, kept in `$.store` across sessions. */
export type GitGudStats = {
  deaths: number
  runes: number
  felled: number
  greatFelled: number
  bonfires: number
  bloodstain: GitGudBloodstain | null
  /** The last test run died: the next green one is a GREAT enemy felled. */
  testsFailing: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'git-gud': { banner: GitGudBanner | null }
  }
}
