// Headless smoke test for the browser half: mount the registered seats with a
// hook shim and assert the guide card opens this plugin's tab.
import { loadClientBundle } from './load-client.mjs'

const { mod } = loadClientBundle()

const sessions = {
  list: {
    getSnapshot: () => ({ byId: { s1: { cwd: 'C:/work/project' } } }),
  },
}

const seats = []
let tabSpec
const ctx = {
  effect: (run) => run(),
  get: (name) => (name === 'sessions' ? sessions : undefined),
  locale: {
    bind: () => (key) => key,
    register: () => {},
  },
  slots: {
    inject: (_name, run) => run(),
    register: (spec, Component) => {
      seats.push({ spec, Component })
      return { dispose: () => {} }
    },
  },
  sidebarRightTabs: {
    register: (spec) => {
      tabSpec = spec
      return { dispose: () => {} }
    },
  },
}

mod.apply(ctx)

const fail = []
const check = (name, ok, detail) => {
  if (!ok) fail.push(name + (detail === undefined ? '' : ' — ' + detail))
}

check('tab registered', tabSpec !== undefined)
check('tab kind', tabSpec?.kind === 'git-graph', tabSpec?.kind)
check('tab id', tabSpec?.id === 'dsh-git-graph-panel', tabSpec?.id)
check('guide entry', Array.isArray(tabSpec?.guide) && tabSpec.guide.length === 1)
check('guide copy', tabSpec?.guide?.[0]?.title() === 'new' && tabSpec?.guide?.[0]?.description() === 'description')
check('three seats', seats.length === 3, 'got ' + seats.length)
check(
  'seat names',
  seats.map((s) => s.spec.name).sort().join(',') ===
    ['sidebar.right.pane.tab', 'sidebar.right.pane.tab.title', 'sidebar.right.tab.guide.entry'].join(','),
  seats.map((s) => s.spec.name).join(',')
)
check('seat keys', seats.every((s) => s.spec.key === 'dsh-git-graph-panel'))

/** Depth-first walk over the element tree produced by the shim. */
function walk(node, visit) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit)
    return
  }
  visit(node)
  const kids = node.props?.children
  if (kids !== undefined) walk(kids, visit)
}

const opened = []
const useTabInfo = () => ({ tab: { actions: { openTab: (kind, options) => opened.push([kind, options]) } } })
const t = (key) => key

for (const seat of seats) {
  const face = seat.spec.inject('s1')
  check('face for ' + seat.spec.name, typeof face?.resolveDir === 'function')
  check('face path ' + seat.spec.name, face?.resolveDir() === 'C:/work/project', String(face?.resolveDir()))
  let tree
  try {
    tree = seat.Component({ ...face, t, useTabInfo, title: 'title', description: 'description', kind: 'git-graph' })
  } catch (error) {
    fail.push('render ' + seat.spec.name + ' threw ' + error)
    continue
  }
  check('render ' + seat.spec.name, tree !== null && tree !== undefined)
  let buttons = 0
  walk(tree, (node) => {
    if (node.type === 'button') buttons++
    if (typeof node.props?.onClick === 'function' && node.props?.className?.includes?.('gg-entry')) node.props.onClick()
  })
  if (seat.spec.name === 'sidebar.right.tab.guide.entry') check('guide renders one button', buttons === 1, 'got ' + buttons)
}

check('guide opened the tab', opened.length === 1, 'got ' + opened.length)
check('openTab args', opened[0]?.[0] === 'git-graph' && opened[0]?.[1]?.replaceTab === true, JSON.stringify(opened[0]))

if (fail.length > 0) {
  console.error(fail.join('\n'))
  process.exit(1)
}
console.log('render OK — tab:', tabSpec.kind, 'seats:', seats.length, 'openTab:', JSON.stringify(opened[0]))
