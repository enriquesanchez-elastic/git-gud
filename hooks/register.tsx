import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { GitGudBannerKind, GitGudStats } from '../types'

import {
  appraisals,
  BANNER_COLORS,
  BANNER_TITLES,
  between,
  DURATION_WORDS,
  GIT_GUD_REPLIES,
  isFogWall,
  killerOf,
  kindOf,
  levelCost,
  newTrophies,
  pick,
  runesText,
  soapstone,
  SPINNER_WORDS,
  streakMultiplier,
  titleOf,
  TROPHIES,
} from './lore'

/**
 * git-gud: Claude Code as a Souls-like.
 *
 * A failed command is a death (YOU DIED above the prompt), and the runes you
 * earned by editing drop where you fell; succeed at the command that killed
 * you to retrieve them, die again first and they are gone. Passing tests fell
 * an enemy (a GREAT one if they were failing), a commit lights a bonfire, the
 * spinner and turn footer speak the games' verbs, and every session opens with
 * a message from another Tarnished. `/bonfire` shows your stats (and `rest`
 * compacts: the enemies respawn); `/soapstone` reads or writes messages.
 */

const PLUGIN = 'git-gud'
const STATS_KEY = 'stats'
const MESSAGES_KEY = 'messages'
const BANNER_MS = 5000
const MAX_MESSAGES = 50
const MAX_MESSAGE_CHARS = 120

const EDIT_TOOLS = /^(Edit|Write|MultiEdit|NotebookEdit)$/

const banner = atom({ plugin: 'git-gud', key: 'banner' } as const, null)

const FRESH: GitGudStats = {
  deaths: 0,
  runes: 0,
  felled: 0,
  greatFelled: 0,
  bonfires: 0,
  bloodstain: null,
  testsFailing: false,
  level: 1,
  streak: 0,
  deathStreak: 0,
  fogsCrossed: 0,
  trophies: [],
}

const rng = () => Math.random()

/** A stable pick per input, so a turn's spinner does not flicker. */
function hashPick<T>(list: readonly T[], seed: string): T {
  let h = 2166136261

  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  }

  return list[(h >>> 0) % list.length] as T
}

const basename = (path: string) => path.split(/[\\/]/).pop() ?? path

/** What a tool call is filed under, for deaths and bloodstains alike. */
function killerOfCall(e: { tool: string; [k: string]: unknown }): string {
  if (e.tool === 'Bash' && typeof e.command === 'string') {
    return killerOf(e.command)
  }

  const path = e.file_path ?? e.notebook_path

  return typeof path === 'string' ? `${e.tool} ${basename(path)}` : e.tool
}

function asStats(value: unknown): GitGudStats {
  const merged: GitGudStats =
    value && typeof value === 'object'
      ? { ...FRESH, ...(value as Partial<GitGudStats>) }
      : { ...FRESH }

  merged.trophies = Array.isArray(merged.trophies)
    ? merged.trophies.filter(t => typeof t === 'string')
    : []

  return merged
}

/** The module's own working copy; `$.store` is the record across sessions. */
let stats: GitGudStats = { ...FRESH }
let isLoaded = false
let saving: Promise<void> = Promise.resolve()
let bannerId = 0
let isHardcore = false
let isSpeaking = false

async function load($: EngineInterface) {
  if (!isLoaded) {
    stats = asStats(await $.store.get(STATS_KEY).catch(() => undefined))
    isLoaded = true
  }
}

/** Applies a change to the stats, saves them in order, refreshes the status. */
async function change($: EngineInterface, fn: (s: GitGudStats) => void) {
  await load($)
  fn(stats)

  for (const trophy of newTrophies(stats)) {
    stats.trophies = [...stats.trophies, trophy.id]
    $.ui.toast(`🏆 Trophy: ${trophy.name}. ${trophy.hint}`, { timeoutMs: 6000 })
  }

  const snapshot = { ...stats }
  saving = saving
    .then(() => $.store.set(STATS_KEY, snapshot))
    .catch(() => undefined)
  showStatus($)
}

function showStatus($: EngineInterface) {
  const stain = stats.bloodstain
    ? ` · 🩸 ᚱ ${runesText(stats.bloodstain.runes)}`
    : ''

  const bonus = streakMultiplier(stats.streak)
  const streak = bonus > 1 ? ` · 🔥 ×${bonus}` : ''

  $.ui.status(
    `Lv ${stats.level} · ᚱ ${runesText(stats.runes)} · ☠ ${runesText(stats.deaths)}${stain}${streak}`,
  )
}

async function raise(
  $: EngineInterface,
  kind: GitGudBannerKind,
  subtitle: string,
) {
  bannerId += 1
  const id = bannerId
  await update($, banner, () => ({ id, kind, subtitle }))

  $.clock.after(BANNER_MS, () => {
    void update($, banner, current =>
      current?.id === id ? null : current,
    ).catch(() => undefined)
  })
}

/** You died: drop the runes where you fell, lose the old bloodstain. */
async function die($: EngineInterface, killer: string, isTests: boolean) {
  let dropped = 0
  let lost = 0

  await change($, s => {
    s.deaths += 1
    s.deathStreak += 1
    s.streak = 0
    lost = s.bloodstain?.runes ?? 0
    dropped = s.runes
    s.bloodstain = dropped > 0 ? { runes: dropped, killer } : null
    s.runes = 0
    s.testsFailing ||= isTests
  })

  const runes = dropped > 0 ? ` · ᚱ ${runesText(dropped)} dropped` : ''
  await raise($, 'died', `slain by ${killer}${runes}`)

  if (lost > 0) {
    $.ui.toast(
      `Your old bloodstain fades. ᚱ ${runesText(lost)} lost forever.`,
      { timeoutMs: 6000 },
    )
  }

  if (isSpeaking) {
    void $.audio.speak('You died').catch(() => undefined)
  }
}

/** A success: runes for the deed, and the bloodstain if this was the foe. */
async function prevail(
  $: EngineInterface,
  killer: string,
  earned: number,
): Promise<void> {
  let retrieved = 0

  await change($, s => {
    s.runes += Math.round(earned * streakMultiplier(s.streak))
    s.streak += 1
    s.deathStreak = 0

    if (s.bloodstain && s.bloodstain.killer === killer) {
      retrieved = s.bloodstain.runes
      s.runes += retrieved
      s.bloodstain = null
    }
  })

  if (retrieved > 0) {
    $.ui.toast(
      `ᚱ ${runesText(retrieved)} retrieved from your bloodstain.`,
      { timeoutMs: 6000 },
    )
  }
}


async function judgeBash(
  $: EngineInterface,
  agentId: string | undefined,
  command: string,
  ran: { deny?: string; isError?: true },
) {
  if (ran.deny !== undefined) {
    $.ui.toast('⚔  Parried! The command was turned away.')

    return
  }

  const kind = kindOf(command)
  const killer = killerOf(command)

  if (ran.isError === true) {
    if (kind === 'probe' && !isHardcore) {
      return
    }

    if (agentId !== undefined) {
      $.ui.toast('👻  Your summoned phantom has died.')

      return
    }

    await die($, killer, kind === 'tests')

    return
  }

  if (agentId !== undefined) {
    return
  }

  if (isFogWall(command)) {
    await change($, s => {
      s.fogsCrossed += 1
    })
  }

  switch (kind) {
    case 'tests': {
      const isGreat = stats.testsFailing
      const earned = isGreat ? between(2000, 3000, rng) : between(800, 1200, rng)

      await change($, s => {
        s.felled += 1
        s.greatFelled += isGreat ? 1 : 0
        s.testsFailing = false
      })
      await prevail($, killer, earned)
      await raise($, isGreat ? 'great' : 'felled', `ᚱ +${runesText(earned)}`)

      return
    }
    case 'commit': {
      const earned = between(400, 600, rng)

      await change($, s => {
        s.bonfires += 1
      })
      await prevail($, killer, earned)
      await raise($, 'bonfire', `checkpoint saved · ᚱ +${runesText(earned)}`)

      return
    }
    case 'probe':
      await prevail($, killer, between(1, 5, rng))

      return
    case 'other':
      await prevail($, killer, between(10, 60, rng))

      return
  }
}


export const register: Register = (on, options) => {
  isHardcore = options.hardcore === true
  isSpeaking = options.speak === true
  const isMessaging = options.messages !== false

  on('session.start', async ($, e, next) => {
    isLoaded = false
    await load($)
    showStatus($)

    await $.command.register({
      name: 'bonfire',
      description:
        'Rest at a bonfire: your level, deaths, runes and bloodstain. `level` spends runes to rise, `trophies` lists achievements, `rest` compacts (enemies respawn).',
      argumentHint: '[level|trophies|rest]',
    })

    await $.command.register({
      name: 'soapstone',
      description: 'Read a message from another Tarnished, or write one for a future you.',
      argumentHint: '[message]',
    })

    if (isMessaging) {
      const own = (await $.store.get(MESSAGES_KEY).catch(() => [])) as unknown
      const mine = Array.isArray(own) ? own.filter(m => typeof m === 'string') : []
      const isOwn = mine.length > 0 && rng() < 0.4

      $.ui.toast(
        isOwn
          ? `✎ A message from a past you: "${pick(mine, rng)}"`
          : `✎ "${soapstone(rng)}"  (appraised ${appraisals(rng)} times)`,
        { timeoutMs: 8000 },
      )
    }

    return next(e)
  })

  // Failed shell commands kill you; good ones fell enemies and light bonfires.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const command = typeof e.command === 'string' ? e.command : ''

    if (isFogWall(command)) {
      try {
        $.ui.notice(e.tool_use_id, '🌫  A fog wall. Only those who mean it may pass.')
      } catch {
        // no dialog open for this call: the fog is just atmosphere
      }
    }

    const ran = await next(e)

    try {
      await judgeBash($, e.agentId, command, ran)
    } catch {
      // the lore never gets in the way of the work
    }

    return ran
  })

  // Edits earn runes; an Edit whose old_string is not there is a death too.
  on('tool.call', { tool: EDIT_TOOLS }, async ($, e, next) => {
    const ran = await next(e)

    try {
      const killer = killerOfCall(e)

      if (ran.deny !== undefined || e.agentId !== undefined) {
        return ran
      }

      if (ran.isError === true) {
        await die($, killer, false)
      } else {
        await prevail($, killer, between(50, 300, rng))
      }
    } catch {
      // the lore never gets in the way of the work
    }

    return ran
  }).catch(($, e, next) => next(e))

  // The banner above the prompt.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const shown = await read($, banner)

    if (shown === null || e.props.hasSurvey) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box
        flexDirection="column"
        alignItems="center"
        width={e.props.bodyColumns}
        paddingY={1}
      >
        <Text bold color={BANNER_COLORS[shown.kind]} size="title">
          {BANNER_TITLES[shown.kind]}
        </Text>
        <Text dimColor>{shown.subtitle}</Text>
      </Box>
    )
  })

  // The spinner and the turn's closing line speak the games' verbs.
  on('ui.render', { component: 'Spinner' }, ($, e, next) =>
    next({ ...e, props: { ...e.props, word: hashPick(SPINNER_WORDS, e.props.word) } }),
  )

  on('ui.render', { component: 'TurnDuration' }, ($, e, next) =>
    next({
      ...e,
      props: {
        ...e.props,
        word: hashPick(DURATION_WORDS, `${e.props.word}:${e.props.durationMs}`),
      },
    }),
  )

  // "git gud" is not a prompt. It is a way of life.
  on('prompt.submit', ($, e, next) => {
    const text = e.text.trim()

    if (/^git\s+gud[.!]*$/i.test(text)) {
      return { drop: pick(GIT_GUD_REPLIES, rng) }
    }

    if (/^praise\s+the\s+sun[.!]*$/i.test(text)) {
      $.ui.toast('\\[T]/  Praise the Sun!')
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'bonfire' }, async ($, e) => {
    await load($)

    const arg = (e.args ?? '').trim().toLowerCase()

    if (arg === 'level') {
      const cost = levelCost(stats.level)

      if (stats.runes < cost) {
        return {
          text: `Not enough runes. Level ${stats.level + 1} costs ᚱ ${runesText(cost)}; you hold ᚱ ${runesText(stats.runes)}.`,
        }
      }

      await change($, s => {
        s.runes -= cost
        s.level += 1
      })

      return {
        text: `🔥 Level ${stats.level}. You are now a ${titleOf(stats.level)}. (-ᚱ ${runesText(cost)}, next level costs ᚱ ${runesText(levelCost(stats.level))})`,
      }
    }

    if (arg === 'trophies') {
      const rows = TROPHIES.map(t =>
        stats.trophies.includes(t.id) ? `- 🏆 **${t.name}**: ${t.hint}` : `- ▫️ ${t.name}: ${t.hint}`,
      )

      return { text: [`**Trophies** ${stats.trophies.length}/${TROPHIES.length}`, '', ...rows].join('\n') }
    }

    const isResting = arg === 'rest'
    const stain = stats.bloodstain
      ? `ᚱ ${runesText(stats.bloodstain.runes)} at \`${stats.bloodstain.killer}\``
      : 'none'
    const verdict =
      stats.deaths === 0
        ? 'Not a single death. Suspicious.'
        : stats.felled >= stats.deaths
          ? 'You have been getting gud.'
          : 'Skill issue, but you persevere.'

    const lines = [
      '🔥 **Bonfire.** You sit by the fire for a moment.',
      '',
      '| | |',
      '| --- | --- |',
      `| Level | ${stats.level} · ${titleOf(stats.level)} (next: ᚱ ${runesText(levelCost(stats.level))}) |`,
      `| Streak | ${stats.streak} (×${streakMultiplier(stats.streak)}) |`,
      `| Trophies | ${stats.trophies.length}/${TROPHIES.length} |`,
      `| Runes held | ᚱ ${runesText(stats.runes)} |`,
      `| Deaths | ☠ ${runesText(stats.deaths)} |`,
      `| Enemies felled | ${stats.felled} (${stats.greatFelled} great) |`,
      `| Bonfires lit | ${stats.bonfires} |`,
      `| Bloodstain | ${stain} |`,
      '',
      `_${verdict}_`,
    ]

    if (isResting) {
      lines.push('', 'You rest. Your context is compacted. The enemies respawn.')
      void $.session
        .compact({ instructions: 'Keep the current task, decisions and open problems.' })
        .then(({ skip }) => {
          if (skip !== undefined) {
            $.ui.toast(`The bonfire would not let you rest: ${skip}`)
          }
        })
        .catch(() => $.ui.toast('The bonfire flickers. You could not rest right now.'))
    }

    return { text: lines.join('\n') }
  })

  on('command.run', { command: 'soapstone' }, async ($, e) => {
    const message = (e.args ?? '').trim().slice(0, MAX_MESSAGE_CHARS)

    if (message === '') {
      return { text: `✎ "${soapstone(rng)}"  _(appraised ${appraisals(rng)} times)_` }
    }

    const stored = (await $.store.get(MESSAGES_KEY).catch(() => [])) as unknown
    const list = Array.isArray(stored) ? stored.filter(m => typeof m === 'string') : []
    await $.store.set(MESSAGES_KEY, [...list, message].slice(-MAX_MESSAGES))

    return {
      text: `✎ You scrawl "${message}" on the ground. A future you may find it.`,
    }
  })
}
