// Full render pass for the pane body: a small hook runtime drives useState and
// useEffect so the data path (fetch -> RepoView -> drawn graph) actually runs,
// which a static shim cannot reach.
import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'

const payload = JSON.parse(readFileSync(new URL('./fixture-payload.json', import.meta.url), 'utf8'))

//#region hook runtime
let dirty = false
let rendering = null

function readSlot(init) {
  const inst = rendering
  const index = inst.index++
  if (inst.hooks[index] === undefined) inst.hooks[index] = init()
  return { inst, index }
}

/** One hook slot holding a plain value, plus a setter that marks a re-render. */
function useStateSlot(initial) {
  const s = readSlot(() => (typeof initial === 'function' ? initial() : initial))
  const set = (next) => {
    s.inst.hooks[s.index] = typeof next === 'function' ? next(s.inst.hooks[s.index]) : next
    dirty = true
  }
  return [s.inst.hooks[s.index], set]
}

function makeReact() {
  class Component {
    constructor(props) {
      this.props = props ?? {}
      this.state = {}
    }
    setState(next) {
      this.state = { ...this.state, ...(typeof next === 'function' ? next(this.state) : next) }
      dirty = true
    }
  }
  return {
    Component,
    createElement: (type, props, ...children) => {
      // React reserves `ref` and `key`: they never reach props. Mirroring that here
      // makes a component that reads them fail in the test instead of in the app.
      const { ref, key, ...rest } = props ?? {}
      return {
        type,
        props: { ...rest, children: children.length > 1 ? children : children[0] },
        key,
      }
    },
    Fragment: 'Fragment',
    useState: useStateSlot,
    useEffect(fn, deps) {
      const inst = rendering
      const index = inst.index++
      const prev = inst.hooks[index]
      const same =
        prev !== undefined &&
        Array.isArray(deps) &&
        Array.isArray(prev.deps) &&
        deps.length === prev.deps.length &&
        deps.every((d, i) => Object.is(d, prev.deps[i]))
      if (!same) {
        inst.hooks[index] = { deps }
        inst.pending.push({ index, fn, inst })
      }
    },
    useLayoutEffect() {},
    useRef(value) {
      const s = readSlot(() => ({ current: value }))
      return s.inst.hooks[s.index]
    },
    useCallback(fn) {
      return fn
    },
    useMemo(fn) {
      return fn()
    },
    useId: () => 'id',
  }
}

//#endregion

let renderSeq = 0
const instances = new Map()

function runComponent(Comp, props, path) {
  if (process.env.GG_DEBUG === '1') console.log('render', path, '#' + ++renderSeq)
  let inst = instances.get(path)
  if (inst === undefined) {
    inst = { path, hooks: [], index: 0, pending: [] }
    instances.set(path, inst)
  }
  inst.index = 0
  inst.pending = []
  const saved = rendering
  rendering = inst
  let out
  try {
    out = Comp(props)
  } finally {
    rendering = saved
  }
  const node = renderNode(out, inst, path)
  return { node, inst }
}

function renderNode(node, inst, path) {
  if (node === null || node === undefined || node === false) return null
  if (Array.isArray(node)) {
    return node.map((child, index) => renderNode(child, inst, path + '/' + index)).filter((child) => child !== null)
  }
  if (typeof node === 'function') {
    // A component: run it as its own instance so hooks and effects are isolated.
    if (rendering !== inst) throw new Error('nested component rendered outside a pass')
    return runComponent(node, {}, path + '/' + node.name).node
  }
  if (typeof node !== 'object') return node
  const { type, props } = node
  if (typeof type === 'function') {
    const outer = inst
    const key = path + '/' + (type.name || 'Anon') + (node.key === undefined ? '' : ':' + node.key)
    let inner = instances.get(key)
    const isClass = typeof type === 'function' && type.prototype !== undefined && typeof type.prototype.render === 'function'
    if (inner === undefined) {
      inner = { path: key, hooks: [], index: 0, pending: [] }
      if (isClass) inner.instance = new type(props ?? {})
      instances.set(key, inner)
    }
    inner.index = 0
    inner.pending = []
    const saved = rendering
    rendering = inner
    let product
    try {
      product = isClass ? inner.instance.render() : type(props ?? {})
    } finally {
      rendering = saved
    }
    const childNode = renderNode(product, inner, key)
    return childNode
  }
  return {
    type,
    props: { ...props, children: renderNode(props?.children, inst, path) },
  }
}

/** Walk a rendered tree collecting text and host-element statistics. */
function survey(node, acc) {
  if (node === null || node === undefined) return acc
  if (Array.isArray(node)) {
    for (const child of node) survey(child, acc)
    return acc
  }
  if (typeof node === 'string' || typeof node === 'number') {
    acc.text.push(String(node))
    return acc
  }
  if (typeof node !== 'object') return acc
  acc.tags.set(node.type, (acc.tags.get(node.type) ?? 0) + 1)
  const cls = node.props?.className
  if (typeof cls === 'string') for (const name of cls.split(' ')) acc.classes.set(name, (acc.classes.get(name) ?? 0) + 1)
  survey(node.props?.children, acc)
  return acc
}

/** Render the tree, then drain every queued effect and re-render until stable. */
async function mount(Comp, props) {
  let tree
  for (let pass = 0; pass < 25; pass += 1) {
    dirty = false
    if (process.env.GG_DEBUG === '1') console.log('pass', pass)
    const result = runComponent(Comp, props, 'root')
    tree = result.node
    const effects = [...instances.values()].flatMap((inst) => inst.pending)
    if (effects.length === 0 && !dirty) return tree
    for (const inst of instances.values()) inst.pending = []
    for (const effect of effects) await effect.fn()
    // let aborted/awaited effects settle
    await new Promise((resolve) => setTimeout(resolve, 0))
    if (!dirty && effects.length === 0) return tree
  }
  return tree
}

//#region bundle
const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const requests = []
const context = {
  window: {},
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  AbortController,
  URL,
  Promise,
  fetch: async (url, init) => {
    requests.push({ url, init })
    if (process.env.GG_DEBUG === '1') {
      const nl = String.fromCharCode(10)
      const where = String(new Error('trace').stack).split(nl).slice(2, 4).join(' | ')
      console.log('FETCH', requests.length, where)
    }
    return {
      ok: true,
      status: 200,
      json: async () => payload,
    }
  },
}
context.globalThis = context
context.window.__ModuleLoader__ = {
  load: (spec) => {
    context.__captured = spec
  },
}
createContext(context)
runInContext(source, context, { filename: 'lib/client.js' })
const captured = context.__captured
const mod = captured.factory((name) => {
  if (name === 'react') return makeReact()
  if (name === 'react/jsx-runtime') return { jsx: (t, p) => ({ type: t, props: p }), jsxs: (t, p) => ({ type: t, props: p }), Fragment: 'Fragment' }
  throw new Error('unexpected require: ' + name)
})
//#endregion

const t = (key) => key
const fail = []
const check = (name, ok, detail) => {
  if (!ok) fail.push(name + (detail === undefined ? '' : ' — ' + detail))
}

const tree = await mount(mod.GitGraphBody, { t, sessionId: 's1', resolveDir: () => 'D:/test/test-git' })
const acc = survey(tree, { text: [], tags: new Map(), classes: new Map() })
const text = acc.text.join(' ')

console.log('urls', requests.map((r) => r.url))
check('one request issued', requests.length === 1, 'got ' + requests.length)
check('request is a GET', requests[0]?.init?.method === 'GET', String(requests[0]?.init?.method))
check(
  'request carries the dir in the query',
  requests[0]?.url === 'git-graph-panel/data?path=' + encodeURIComponent('D:/test/test-git'),
  String(requests[0]?.url),
)
check('no empty state left', !text.includes('loading') && !text.includes('gitError'), text.slice(0, 200))
check('branch chip', text.includes('master'), text.slice(0, 200))
check('merge subject', text.includes("Merge branch 'feature'"), text.slice(0, 400))
check('older subject', text.includes('feat: feature work one'), text.slice(0, 400))
check('graph nodes drawn', (acc.tags.get('circle') ?? 0) >= 6, 'circles ' + (acc.tags.get('circle') ?? 0))
check('ref chips rendered', (acc.classes.get('gg-ref') ?? 0) === 3, 'chips ' + (acc.classes.get('gg-ref') ?? 0))
check('tag chip styled', (acc.classes.get('gg-ref-tag') ?? 0) === 1, 'tag chips ' + (acc.classes.get('gg-ref-tag') ?? 0))
check('graph edges drawn', (acc.tags.get('path') ?? 0) >= 5, 'paths ' + (acc.tags.get('path') ?? 0))

if (fail.length > 0) {
  console.error(fail.join('\n'))
  process.exit(1)
}
console.log(
  'live render OK — requests:',
  requests.length,
  'circles:',
  acc.tags.get('circle'),
  'paths:',
  acc.tags.get('path'),
  'text:',
  text.slice(0, 90)
)
