import { describe, expect, test } from 'claude-code/testing'

import { isFogWall, killerOf, kindOf, lastSegment, runesText, soapstone } from '../hooks/lore'

describe('lore', () => {
  test('reads what kind of foe a command is', async () => {
    expect(kindOf('npm test')).toBe('tests')
    expect(kindOf('cd app && pnpm run test:unit')).toBe('tests')
    expect(kindOf('python -m pytest -q')).toBe('tests')
    expect(kindOf('go test ./...')).toBe('tests')
    expect(kindOf('git commit -m "wip"')).toBe('commit')
    expect(kindOf('grep -rn foo .')).toBe('probe')
    expect(kindOf('git status')).toBe('probe')
    expect(kindOf('make build')).toBe('other')
  })

  test('only the command that ran last decides the foe', async () => {
    expect(kindOf('npm test || true')).toBe('other')
    expect(kindOf('npm test; echo done')).toBe('other')
    expect(kindOf('echo "run pytest"')).toBe('other')
    expect(kindOf('printf "%s" jest')).toBe('other')
    expect(kindOf('git add -A && git commit -m "fix"')).toBe('commit')
    expect(kindOf('npm run build && npm test')).toBe('tests')
    expect(kindOf('npm test | tee out.log')).toBe('tests')
  })

  test('operators inside quotes do not split a command', async () => {
    expect(kindOf('git commit -m "a && b"')).toBe('commit')
    expect(kindOf("git commit -m 'one; two'")).toBe('commit')
    expect(killerOf('git commit -m "a && b"')).toBe('git commit')
    expect(lastSegment('cd x && echo "a || b"')).toBe('echo "a || b"')
  })

  test('probes are read from the first command of a pipeline', async () => {
    expect(kindOf('grep -rn foo . | head')).toBe('probe')
    expect(kindOf('ls && make build')).toBe('other')
  })

  test('files a death under the last command run', async () => {
    expect(killerOf('cd app && npm test -- --watch=false')).toBe('npm test')
    expect(killerOf('cargo build --release')).toBe('cargo build')
  })

  test('knows a fog wall when it sees one', async () => {
    expect(isFogWall('rm -rf node_modules')).toBe(true)
    expect(isFogWall('git push --force origin main')).toBe(true)
    expect(isFogWall('git reset --hard HEAD~3')).toBe(true)
    expect(isFogWall('git push origin main')).toBe(false)
    expect(isFogWall('rm notes.txt')).toBe(false)
  })

  test('fog walls hide behind flag spellings too', async () => {
    expect(isFogWall('rm -r -f build')).toBe(true)
    expect(isFogWall('rm -fr build')).toBe(true)
    expect(isFogWall('rm -Rf build')).toBe(true)
    expect(isFogWall('rm --recursive --force build')).toBe(true)
    expect(isFogWall('sudo rm -rf /var/x')).toBe(true)
    expect(isFogWall('cd app && rm -r -f dist')).toBe(true)
    expect(isFogWall('git push -f')).toBe(true)
    expect(isFogWall('git push origin main -f')).toBe(true)
    expect(isFogWall('git push --force-with-lease')).toBe(true)
    expect(isFogWall('psql -c "DROP TABLE users"')).toBe(true)
    expect(isFogWall('rm -r build')).toBe(false)
    expect(isFogWall('rm -f notes.txt')).toBe(false)
    expect(isFogWall('git push origin main')).toBe(false)
  })

  test('fog walls hide behind paths, wrappers and force refspecs', async () => {
    expect(isFogWall('/bin/rm -rf build')).toBe(true)
    expect(isFogWall('find . -name x | xargs rm -rf')).toBe(true)
    expect(isFogWall('git push origin +main')).toBe(true)
    expect(isFogWall('git push origin +HEAD:main')).toBe(true)
    expect(isFogWall('git push origin main')).toBe(false)
    expect(isFogWall('git push origin feature/a+b')).toBe(false)
  })

  test('talking about a fog wall is not walking into one', async () => {
    expect(isFogWall('echo "rm -rf /"')).toBe(false)
    expect(isFogWall("printf 'git reset --hard'")).toBe(false)
  })

  test('counts runes with commas', async () => {
    expect(runesText(0)).toBe('0')
    expect(runesText(999)).toBe('999')
    expect(runesText(1234567)).toBe('1,234,567')
  })

  test('scrawls a message from the templates', async () => {
    const rolls = (values: number[]) => () => values.shift() ?? 0

    expect(soapstone(rolls([0, 0, 0.9]))).toBe('tests ahead')
    expect(soapstone(rolls([0, 0, 0, 0, 0, 0]))).toBe('tests ahead and then tests ahead')
  })
})
