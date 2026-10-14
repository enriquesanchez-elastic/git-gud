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
  /** Raised by spending runes at `/bonfire level`. Starts at 1. */
  level: number
  /** Successes in a row; each five add 25% to runes earned (max 2x). */
  streak: number
  /** Deaths in a row, reset by any success. */
  deathStreak: number
  /** Fog-wall commands that were survived. */
  fogsCrossed: number
  /** Ids of earned trophies. */
  trophies: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'git-gud': { banner: GitGudBanner | null }
  }
}
