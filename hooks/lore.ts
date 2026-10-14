/**
 * Everything git-gud says, and how it reads a shell command. Pure functions:
 * no `$`, so the tests can pin them down.
 */

import type { GitGudStats } from '../types'

export type Rng = () => number

export const pick = <T>(list: readonly T[], rng: Rng): T =>
  list[Math.floor(rng() * list.length) % list.length] as T

export const between = (min: number, max: number, rng: Rng): number =>
  min + Math.floor(rng() * (max - min + 1))

/** What the spinner says while Claude works. */
export const SPINNER_WORDS = [
  'Kindling',
  'Rolling',
  'Panic-rolling',
  'Fat-rolling',
  'Parrying',
  'Backstabbing',
  'Two-handing',
  'Praising the sun',
  'Summoning a phantom',
  'Farming runes',
  'Leveling Vigor',
  'Hollowing',
  'Reading item descriptions',
  'Gitting gud',
  'Chugging estus',
  'Coping',
  'Poise-breaking',
  'Traversing the fog',
  'Waiting for the elevator',
  'Grinding',
  'Respeccing',
  'Seeking grace',
  'Trying finger',
  'Kicking down the ladder',
  'Checking for mimics',
  'Hitting the wall (illusory?)',
  'Jumping with R1',
  'Spamming the roll button',
] as const

/** The past-tense word on the line that closes a turn ("Rested for 12s"). */
export const DURATION_WORDS = [
  'Rested',
  'Parried',
  'Backstabbed',
  'Kindled',
  'Persevered',
  'Survived',
  'Endured',
  'Got gud',
  'Rolled',
  'Grinded',
] as const

const TEMPLATES = [
  '{w} ahead',
  'No {w} ahead',
  '{w} required ahead',
  'Be wary of {w}',
  'Try {w}',
  'Likely {w}',
  'First off, {w}',
  'Seek {w}',
  'Still no {w}...',
  'Why is it always {w}?',
  'If only I had {w}...',
  "Didn't expect {w}...",
  'Visions of {w}...',
  'Could this be {w}?',
  'Time for {w}',
  'Behold, {w}!',
  'Praise the {w}!',
  'Let there be {w}',
  'Ahh, {w}...',
] as const

const WORDS = [
  'tests',
  'a flaky test',
  'merge conflict',
  'legacy code',
  'regex',
  'null',
  'undefined',
  'off-by-one',
  'production',
  'Friday deploy',
  'documentation',
  'the intern',
  'rm -rf',
  'force push',
  'dependency hell',
  'YAML',
  'tech debt',
  'rubber duck',
  'coffee',
  'sleep',
  'cache invalidation',
  'node_modules',
  'senior engineer',
  'a semicolon',
  'timezones',
  'tabs',
  'spaces',
  'hotfix',
  'rollback',
  'scope creep',
  'TODO',
  'console.log',
  'segfault',
  'race condition',
  'green build',
  'red build',
  'the README',
  'a rewrite in Rust',
  'Stack Overflow',
  'hole',
  'finger',
  'liar',
  'treasure',
  'shortcut',
  'dog',
  'lever',
] as const

const CONJUNCTIONS = [
  ' and then ',
  ' but ',
  ', therefore ',
  ', in short ',
  ' or ',
  ', only ',
  ', by the way, ',
  ', all the more ',
] as const

/** A message scrawled on the ground by another Tarnished. */
export function soapstone(rng: Rng): string {
  const phrase = () =>
    pick(TEMPLATES, rng).replace(/\{w\}/g, () => pick(WORDS, rng))

  const first = phrase()

  if (rng() >= 0.3) {
    return first
  }

  const second = phrase()

  return first + pick(CONJUNCTIONS, rng) + second[0]?.toLowerCase() + second.slice(1)
}

/** The rating under a message ("Appraised 412 times"). */
export const appraisals = (rng: Rng): number => between(0, 999, rng)

/** `1234567` → `1,234,567`, without Intl (the hooks environment may lack it). */
export function runesText(n: number): string {
  return String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/**
 * Splits a shell command at `&&`, `||`, `;` and newlines (and at a lone `|`
 * when `pipes` is set), leaving quoted operators alone: the `&&` in
 * `git commit -m "lint && format"` is prose, not a second command.
 */
function splitCommand(command: string, pipes: boolean): string[] {
  const parts: string[] = []
  let current = ''
  let quote = ''

  for (let i = 0; i < command.length; i += 1) {
    const c = command[i] as string
    const two = command.slice(i, i + 2)

    if (quote !== '') {
      current += c

      if (c === '\\' && quote === '"') {
        i += 1
        current += command[i] ?? ''
      } else if (c === quote) {
        quote = ''
      }
    } else if (c === '"' || c === "'") {
      quote = c
      current += c
    } else if (two === '&&' || two === '||') {
      parts.push(current)
      current = ''
      i += 1
    } else if (c === ';' || c === '\n' || (pipes && c === '|')) {
      parts.push(current)
      current = ''
    } else {
      current += c
    }
  }

  parts.push(current)

  return parts.map(part => part.trim()).filter(part => part !== '')
}

/** The last segment of a compound command: `cd app && npm test` → `npm test`. */
export function lastSegment(command: string): string {
  const parts = splitCommand(command, false)

  return parts[parts.length - 1] ?? command.trim()
}

/** The first stage of a pipeline: `grep foo . | head` → `grep foo .`. */
const firstStage = (segment: string): string =>
  splitCommand(segment, true)[0] ?? segment

/**
 * The name a death is filed under: the first two words of the command that
 * ran last, so `npm test -- --watch=false` and `npm test` are the same foe.
 */
export function killerOf(command: string): string {
  return lastSegment(command).split(/\s+/).slice(0, 2).join(' ')
}

/** Commands whose failure is an answer, not a death: grep found nothing. */
const PROBE =
  /^(sudo\s+)?(grep|egrep|fgrep|rg|ag|find|fd|test|\[|\[\[|ls|which|command|type|diff|cmp|stat|file|pgrep|pidof|head|tail|wc|git\s+(diff|grep|status|log|show|rev-parse|ls-files|branch|remote|config))\b/

const TESTS =
  /\b(jest|vitest|mocha|pytest|rspec|phpunit|ctest|tox|nox|karma|cypress\s+run|playwright\s+test|(cargo|go|deno|bun|mix|dotnet|swift|gradle|mvn|make|rake)\s+test|(npm|pnpm|yarn|bun)\s+(run\s+)?test[\w:-]*|python3?\s+-m\s+(pytest|unittest))\b/

const COMMIT = /\bgit\s+commit\b/

/** Commands that only talk: what they print is never a deed. */
const SPEECH = /^(sudo\s+)?(echo|printf)\b/

const FOG_WALL =
  /\bgit\s+push\b.*(\s(--force(-with-lease)?|-f)\b|\s\+\S)|\bgit\s+reset\s+--hard\b|\bgit\s+clean\s+-[a-zA-Z]*f|\bdrop\s+(table|database|schema)\b|\bkubectl\s+delete\b|\bterraform\s+destroy\b/i

export type CommandKind = 'tests' | 'commit' | 'probe' | 'other'

/** What the command that ran last was: earlier segments and prose do not count. */
export function kindOf(command: string): CommandKind {
  const segment = lastSegment(command)

  if (SPEECH.test(segment)) {
    return 'other'
  }

  if (TESTS.test(segment)) {
    return 'tests'
  }

  if (COMMIT.test(segment)) {
    return 'commit'
  }

  return PROBE.test(firstStage(segment)) ? 'probe' : 'other'
}

/** `rm` with both a recursive and a force flag, in any spelling. */
function isRmRf(segment: string): boolean {
  const words = segment.split(/\s+/)
  const at = words.findIndex(w => w === 'rm' || w.endsWith('/rm'))

  if (at === -1) {
    return false
  }

  const flags = words.slice(at + 1).filter(w => w.startsWith('-'))
  const isRecursive = flags.some(f => f === '--recursive' || /^-[a-zA-Z]*[rR]/.test(f))
  const isForced = flags.some(f => f === '--force' || /^-[a-zA-Z]*f/.test(f))

  return isRecursive && isForced
}

/** A command past which there is no return: a fog wall. */
export const isFogWall = (command: string): boolean =>
  splitCommand(command, false).some(
    segment => !SPEECH.test(segment) && (isRmRf(segment) || FOG_WALL.test(segment)),
  )

/** Runes needed to rise from `level` to the next. */
export const levelCost = (level: number): number => 500 * level

/** Runes multiplier for a streak: +25% per five successes, capped at double. */
export const streakMultiplier = (streak: number): number =>
  1 + Math.min(Math.floor(streak / 5), 4) * 0.25

const TITLES = [
  [16, 'Elden Lord'],
  [11, 'Champion'],
  [7, 'Knight'],
  [4, 'Tarnished'],
  [2, 'Wanderer'],
  [1, 'Hollow'],
] as const

/** What a level makes you. */
export const titleOf = (level: number): string =>
  TITLES.find(([min]) => level >= min)?.[1] ?? 'Hollow'

export type Trophy = {
  id: string
  name: string
  /** What to do to earn it. */
  hint: string
  earned: (s: GitGudStats) => boolean
}

export const TROPHIES: readonly Trophy[] = [
  { id: 'first-blood', name: 'First Blood', hint: 'Die once.', earned: s => s.deaths >= 1 },
  { id: 'fall-guy', name: 'Fall Guy', hint: 'Die three times in a row.', earned: s => s.deathStreak >= 3 },
  { id: 'git-gud', name: 'Git Gud', hint: 'Light 10 bonfires.', earned: s => s.bonfires >= 10 },
  { id: 'great-hunter', name: 'Great Hunter', hint: 'Fell a great enemy.', earned: s => s.greatFelled >= 1 },
  { id: 'untouchable', name: 'Untouchable', hint: 'Win 20 in a row without dying.', earned: s => s.streak >= 20 },
  { id: 'fog-diver', name: 'Fog Diver', hint: 'Survive a fog wall.', earned: s => s.fogsCrossed >= 1 },
  { id: 'ascended', name: 'Ascended', hint: 'Reach level 5.', earned: s => s.level >= 5 },
]

/** Trophies the stats now qualify for that are not yet recorded. */
export const newTrophies = (s: GitGudStats): Trophy[] =>
  TROPHIES.filter(t => !s.trophies.includes(t.id) && t.earned(s))

/** What a prompt of nothing but "git gud" is told. */
export const GIT_GUD_REPLIES = [
  'Thou art already gud. Prompt dropped.',
  'There is no "git gud" command. There is only "git gud". (Prompt dropped.)',
  'You whisper "git gud" into the void. The void says: skill issue.',
] as const

/** The spaced-out titles of each banner. */
export const BANNER_TITLES = {
  died: 'Y O U   D I E D',
  felled: 'E N E M Y   F E L L E D',
  great: 'G R E A T   E N E M Y   F E L L E D',
  bonfire: 'B O N F I R E   L I T',
} as const

/** Raw colors in the games' spirit: blood red, rune gold, ember orange. */
export const BANNER_COLORS = {
  died: '#b3121b',
  felled: '#d8b25a',
  great: '#e8c46a',
  bonfire: '#e07b2a',
} as const
