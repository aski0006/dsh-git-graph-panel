import { readFileSync } from 'node:fs'
import { parseBranches, parseLog, parseStatus } from '../lib/index.js'

const here = new URL('./', import.meta.url)
const read = (name) => readFileSync(new URL(name, here), 'utf8')

const fail = []
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) fail.push(`${name}\n  expected ${e}\n  actual   ${a}`)
}

const branches = parseBranches(read('branches.txt'))
check('branches', branches, [
  { name: 'main', current: true, sha: '100703a' },
  { name: 'feature', current: false, sha: '0866919' },
])

const status = parseStatus(read('status.txt'))
check('status', status, { dirty: 1, conflicts: 0 })

const log = parseLog(read('log.txt'))
check('log count', log.commits.length, 6)
check('log truncated', log.truncated, false)
check('head subject', log.commits[0].subject, 'after merge')
check('head refs', log.commits[0].refs, [
  { name: 'main', kind: 'head' },
  { name: 'v1.0', kind: 'tag' },
])
check('merge parents', log.commits[1].parents.length, 2)
check('merge subject', log.commits[1].subject, 'merge feature')
check('every commit has sha+short', log.commits.every((c) => c.sha.length === 40 && c.short.length >= 7), true)
check('authors', [...new Set(log.commits.map((c) => c.author))], ['Tester'])

// Truncation: more records than the window keeps only the window.
const many = Array.from({ length: 121 }, (_, i) => [String(i).padStart(40, 'a'), String(i), '', 'A', 'now', '0', '', `c${i}`].join('\x1f') + '\x1e').join('')
const capped = parseLog(many)
check('truncated flag', capped.truncated, true)
check('truncated length', capped.commits.length, 120)

// Empty repository output.
check('empty log', parseLog(''), { commits: [], truncated: false })
check('empty branches', parseBranches(''), [])
check('empty status', parseStatus(''), { dirty: 0, conflicts: 0 })

if (fail.length > 0) {
  console.error(fail.join('\n\n'))
  process.exit(1)
}
console.log('parsers OK — branches', branches.length, 'commits', log.commits.length, 'dirty', status.dirty)
