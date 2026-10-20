// Lane math for the drawn graph: lanes, edges, and the rows they land on.
import { loadClientBundle } from './load-client.mjs'

const { id, mod } = loadClientBundle()
const { computeGraph } = mod
if (typeof computeGraph !== 'function') throw new Error('computeGraph is not exported')

const fail = []
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) fail.push(`${name}\n  expected ${e}\n  actual   ${a}`)
}
const commit = (sha, parents = []) => ({ sha, parents, short: sha.slice(0, 7), author: 'A', when: 'now', at: 0, subject: sha, refs: [] })

// Linear history: every commit stays in lane 0.
const linear = computeGraph([commit('c3', ['c2']), commit('c2', ['c1']), commit('c1', [])])
check('linear lanes', linear.rows, [0, 0, 0])
check('linear laneCount', linear.laneCount, 1)
check('linear edges', linear.edges.map((e) => [e.row, e.toRow]), [[0, 1], [1, 2]])
check('linear height', linear.height, 3 * 44)

// Merge: c0 merges c1 (lane 0) and c2 (lane 1); both rejoin c3.
const merge = computeGraph([
  commit('c0', ['c1', 'c2']),
  commit('c1', ['c3']),
  commit('c2', ['c3']),
  commit('c3', []),
])
check('merge lanes', merge.rows, [0, 0, 1, 0])
check('merge laneCount', merge.laneCount, 2)
check('merge edges', merge.edges.map((e) => [e.row, e.lane, e.toRow, e.toLane]), [
  [0, 0, 1, 0],
  [0, 0, 2, 1],
  [1, 0, 3, 0],
  [2, 1, 3, 0],
])

// Parent outside the loaded window: dangling edge, no crash.
const dangling = computeGraph([commit('c2', ['c1']), commit('c1', ['c0'])])
check('dangling edge', dangling.edges.map((e) => e.toRow), [1, -1])
check('dangling rows', dangling.rows, [0, 0])

// Two independent roots keep separate lanes.
const roots = computeGraph([commit('a1', ['a0']), commit('b1', ['b0']), commit('a0', []), commit('b0', [])])
check('roots rows', roots.rows, [0, 1, 0, 1])
check('roots laneCount', roots.laneCount, 2)

// Empty log still yields a drawable box.
const empty = computeGraph([])
check('empty', { rows: empty.rows, edges: empty.edges.length, laneCount: empty.laneCount, height: empty.height }, {
  rows: [],
  edges: 0,
  laneCount: 1,
  height: 44,
})

if (fail.length > 0) {
  console.error(fail.join('\n\n'))
  process.exit(1)
}
console.log('computeGraph OK —', id, 'exports:', Object.keys(mod).join(', '))
