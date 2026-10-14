# git-gud

> Prepare to code.

A Claude Code mod that turns your terminal into a Souls-like. Commands fail, you die. You earn runes, you drop them. You fix the bug, you get them back. Mostly.

```
                         Y O U   D I E D
                 slain by npm test · ᚱ 3,412 dropped
```

## What it does

| When | What happens |
| --- | --- |
| A command fails | **YOU DIED** in blood red above the prompt. Your runes drop at a bloodstain, filed under the command that killed you. |
| You succeed at the command that killed you | You retrieve the bloodstain. Die again first and the old one is lost forever. |
| Claude edits a file | Runes. An `Edit` whose `old_string` isn't there is a death too. |
| Tests pass | **ENEMY FELLED**. If they were failing before: **GREAT ENEMY FELLED** and a pile of runes. |
| `git commit` | **BONFIRE LIT**. Checkpoint saved. |
| A destructive command (`rm -rf`, `git push --force`, `git reset --hard`, `DROP TABLE`…) asks permission | A fog wall appears under the dialog. |
| You deny a tool call | *Parried!* |
| A subagent's command fails | Your summoned phantom has died. |
| Claude is thinking | The spinner is *Panic-rolling*, *Praising the sun*, *Reading item descriptions*, *Waiting for the elevator*… |
| A turn ends | *Rested for 12s*, *Parried for 3s*, *Got gud for 1m 4s* |
| A session starts | A message from another Tarnished: *"Be wary of Friday deploy, therefore try rubber duck"* (appraised 412 times) |
| You type `git gud` as a prompt | It's dropped. Thou art already gud. |

Your runes, deaths and bloodstain live in the status line (`ᚱ 1,240 · ☠ 12 · 🩸 ᚱ 3,400`) and persist across sessions, so the death counter only ever goes up.

A `grep` that finds nothing doesn't kill you (probing commands are exempt). Turn on **hardcore mode** and it does.

### Commands

- `/bonfire` — rest a moment: runes held, deaths, enemies felled, bonfires lit, where your bloodstain is, and a verdict.
- `/bonfire rest` — rest for real: compacts the conversation. The enemies respawn.
- `/soapstone` — read a message from another player.
- `/soapstone <text>` — scrawl your own. A future you will find it at the start of a later session.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install git-gud --marketplace <owner>/git-gud
```

Answer `y` to add the marketplace, then pick a scope.

From a shell:

```
claude plugin install git-gud --marketplace <owner>/git-gud
```

In the desktop app: click **+** next to the prompt box → **Plugins** → **Add marketplace** with `<owner>/git-gud` → **Add plugin**.

> Mods are early access in Claude Code: hooks modules load only where function hooks are enabled, and the API may change between releases.

## Options

Set them in `/config` (each is a row there) or under `pluginConfigs["git-gud"].options` in `~/.claude/settings.json`.

| Option | Default | |
| --- | --- | --- |
| `hardcore` | `false` | Every failed command kills you, even probes like `grep`, `test` and `git diff`. |
| `speak` | `false` | Say "You died" with the system voice (macOS `say`). Deeply unnecessary. Recommended. |
| `messages` | `true` | A soapstone message when each session starts. |

## Developing

```
claude --plugin-dir .        # run it from source, hot-reloads on save
claude plugin validate .     # what the engine will refuse, before it does
claude plugin test .         # the tests in tests/
```

`.claude-plugin/types/` holds the generated `claude-code` type declarations. It is gitignored; regenerate it with your Claude Code install before running `tsc -p .`.

All the words live in [`hooks/lore.ts`](hooks/lore.ts): spinner verbs, turn verbs, soapstone templates and words, and the regexes that decide what counts as tests, a commit, a probe or a fog wall. PRs adding better messages are very welcome. Keep them short, keep them about code.

## Fine print

A fan-made parody, not affiliated with or endorsed by FromSoftware or Bandai Namco. No game assets, sounds or logos are included; the banners are plain text.

MIT licensed.
