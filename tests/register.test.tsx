import type { On, RenderInput } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const SESSION = { surface: 'terminal', isInteractive: true, cwd: '/work' } as const

const BAND: RenderInput<'AbovePrompt'> = {
  component: 'AbovePrompt',
  surface: 'terminal',
  requestId: 'above-prompt',
  viewport: { columns: 100, rows: 40 },
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 8,
    bodyColumns: 96,
    scroll: { offset: 0, bodyRows: 8 },
    view: {},
  },
}

const TYPED = {
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 100 },
} as const

const run = ($: Engine, command: string, args = '') =>
  $.command.run({ command, args, ...TYPED })

const say = ($: Engine, text: string) =>
  $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })

type World = {
  mem: Record<string, unknown>
  toasts: string[]
  statuses: (string | undefined)[]
  failing: Set<string>
  denied: Set<string>
  clock: ReturnType<typeof mock.clock>
}

/** The engine beneath git-gud: a store, a clock, a toast bar and a shell. */
function world(on: On, mem: Record<string, unknown> = {}): World {
  const w: World = {
    mem,
    toasts: [],
    statuses: [],
    failing: new Set(),
    denied: new Set(),
    clock: mock.clock(on),
  }

  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('store.get', ($, e) => ({ value: w.mem[e.key] }))
  on('store.set', ($, e) => {
    w.mem[e.key] = e.value

    return { value: undefined }
  })
  on('ui.toast', ($, e) => {
    w.toasts.push(e.text)

    return { value: undefined }
  })
  on('ui.status', ($, e) => {
    w.statuses.push(e.text)

    return { value: undefined }
  })
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)

    return <Box />
  })
  on('tool.call', ($, e) => {
    const key = e.tool === 'Bash' ? String(e.command) : String(e.tool)

    if (w.denied.has(key)) {
      return { deny: 'turned away' }
    }

    return w.failing.has(key)
      ? { isError: true as const, result: 'boom', text: 'boom' }
      : { result: 'ok' }
  })

  return w
}

const bash = ($: Engine, command: string) =>
  $.tool.call({ tool: 'Bash', command } as never)

const subagentBash = ($: Engine, command: string) =>
  $.tool.call({ tool: 'Bash', command, agentId: 'phantom-1' } as never)

const edit = ($: Engine) =>
  $.tool.call({
    tool: 'Edit',
    file_path: '/work/boss.ts',
    old_string: 'a',
    new_string: 'b',
  } as never)

const banner = async ($: Engine) => JSON.stringify(await $.ui.render(BAND))

type Stats = {
  deaths: number
  runes: number
  felled: number
  greatFelled: number
  bonfires: number
  bloodstain: { runes: number; killer: string } | null
}

const statsOf = (w: World) => w.mem.stats as Stats

describe('register', () => {
  test('a failed command is a death: YOU DIED, runes dropped at the bloodstain', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)

    await edit($)
    const earned = statsOf(w).runes
    expect(earned, 'an edit earns runes').toBeGreaterThan(0)

    w.failing.add('npm test')
    await bash($, 'npm test')

    expect(await banner($)).toContain('Y O U   D I E D')
    expect(await banner($)).toContain('slain by npm test')
    expect(statsOf(w)).toMatchObject({
      deaths: 1,
      runes: 0,
      bloodstain: { runes: earned, killer: 'npm test' },
    })

    await w.clock.advance(6000)
    expect(await banner($), 'the banner fades').not.toContain('D I E D')
  })

  test('beating what killed you retrieves the bloodstain, and the boss is GREAT', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)

    await edit($)
    const earned = statsOf(w).runes

    w.failing.add('npm test')
    await bash($, 'npm test')
    w.failing.delete('npm test')
    await bash($, 'npm test -- --runInBand')

    expect(await banner($)).toContain('G R E A T   E N E M Y   F E L L E D')
    expect(statsOf(w).bloodstain).toBeNull()
    expect(statsOf(w).runes, 'the stain plus the boss').toBeGreaterThan(earned + 2000)
    expect(statsOf(w)).toMatchObject({ felled: 1, greatFelled: 1 })
    expect(w.toasts.some(t => t.includes('retrieved from your bloodstain'))).toBe(true)
  })

  test('dying again before retrieval loses the old bloodstain', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)

    await edit($)
    w.failing.add('make build')
    await bash($, 'make build')
    w.failing.add('Edit')
    await edit($)

    expect(statsOf(w)).toMatchObject({ deaths: 2, runes: 0, bloodstain: null })
    expect(w.toasts.some(t => t.includes('lost forever'))).toBe(true)
  })

  test('a grep that finds nothing is no death, unless hardcore', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)

    w.failing.add('grep -rn TODO src')
    await bash($, 'grep -rn TODO src')

    expect(statsOf(w)?.deaths ?? 0).toBe(0)
    expect(await banner($)).not.toContain('D I E D')
  })

  test('hardcore: the grep kills', { options: { hardcore: true } }, async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)

    w.failing.add('grep -rn TODO src')
    await bash($, 'grep -rn TODO src')

    expect(statsOf(w).deaths).toBe(1)
  })

  test('a commit lights a bonfire', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)

    await bash($, 'git add -A && git commit -m "fix: the boss"')

    expect(await banner($)).toContain('B O N F I R E   L I T')
    expect(statsOf(w).bonfires).toBe(1)
  })

  test('/bonfire shows the stats, kept across sessions', async ($, on) => {
    world(on, {
      stats: {
        deaths: 41,
        runes: 1234567,
        felled: 3,
        greatFelled: 1,
        bonfires: 9,
        bloodstain: { runes: 3400, killer: 'cargo test' },
        testsFailing: true,
      },
    })
    await $.session.start(SESSION)

    const { text } = await run($, 'bonfire')

    expect(text).toContain('ᚱ 1,234,567')
    expect(text).toContain('☠ 41')
    expect(text).toContain('ᚱ 3,400 at `cargo test`')
  })

  test('"git gud" is not a prompt', async ($, on) => {
    world(on)
    on('prompt.submit', ($, e) => ({ text: e.text }))
    await $.session.start(SESSION)

    const dropped = await say($, 'git gud')
    const passed = await say($, 'fix the login bug')

    expect(dropped.drop).toBeDefined()
    expect(passed.drop).toBeUndefined()
  })

  test('/soapstone keeps a message for a future you', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)

    await run($, 'soapstone', 'Be wary of Friday deploy')

    expect(w.mem.messages).toEqual(['Be wary of Friday deploy'])
  })

  test('a failed Edit is a death filed under the file', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)

    await edit($)
    w.failing.add('Edit')
    await edit($)

    expect(await banner($)).toContain('slain by Edit boss.ts')
    expect(statsOf(w)).toMatchObject({ deaths: 1, runes: 0 })
  })

  test('Write and NotebookEdit earn runes, filed by path', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)

    await $.tool.call({ tool: 'Write', file_path: '/work/a.ts', content: 'x' } as never)
    const afterWrite = statsOf(w).runes
    expect(afterWrite).toBeGreaterThan(0)

    await $.tool.call({ tool: 'NotebookEdit', notebook_path: '/work/n.ipynb' } as never)
    expect(statsOf(w).runes).toBeGreaterThan(afterWrite)

    w.failing.add('NotebookEdit')
    await $.tool.call({ tool: 'NotebookEdit', notebook_path: '/work/n.ipynb' } as never)
    expect(await banner($)).toContain('slain by NotebookEdit n.ipynb')
  })

  test('garbage in the store falls back to fresh stats', async ($, on) => {
    const w = world(on, { stats: 'not an object' })
    await $.session.start(SESSION)

    await edit($)

    expect(statsOf(w)).toMatchObject({ deaths: 0, felled: 0, bonfires: 0 })
    expect(statsOf(w).runes).toBeGreaterThan(0)
  })

  test('npm test || true is not an enemy felled', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)

    await bash($, 'npm test || true')

    expect(await banner($)).not.toContain('F E L L E D')
    expect(statsOf(w).felled).toBe(0)
  })

  test('a commit message mentioning && still lights a bonfire', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)

    await bash($, 'git commit -m "lint && format"')

    expect(statsOf(w).bonfires).toBe(1)
  })

  test('a summoned phantom dies in your stead', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)

    w.failing.add('npm test')
    await subagentBash($, 'npm test')

    expect(statsOf(w)?.deaths ?? 0).toBe(0)
    expect(w.toasts.some(t => t.includes('summoned phantom has died'))).toBe(true)
  })

  test('a subagent success earns nothing', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)

    await subagentBash($, 'git commit -m "x"')

    expect(statsOf(w)?.bonfires ?? 0).toBe(0)
  })

  test('a denied call is parried, not a death', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)

    w.denied.add('make deploy')
    await bash($, 'make deploy')

    expect(statsOf(w)?.deaths ?? 0).toBe(0)
    expect(w.toasts.some(t => t.includes('Parried'))).toBe(true)
  })

  test('"praise the sun" is passed on, with a toast', async ($, on) => {
    const w = world(on)
    on('prompt.submit', ($, e) => ({ text: e.text }))
    await $.session.start(SESSION)

    const passed = await say($, 'praise the sun')

    expect(passed.drop).toBeUndefined()
    expect(w.toasts.some(t => t.includes('Praise the Sun'))).toBe(true)
  })
})
