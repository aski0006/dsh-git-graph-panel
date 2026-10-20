// Loads the browser half outside a browser: the bundle is evaluated in a fresh
// vm context that only offers `window.__ModuleLoader__`, so each test gets its
// own registration instead of sharing the ESM module cache.
import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'

/** Element factory that keeps children walkable. */
export const el = (type, props, ...children) => {
  // React reserves `ref` and `key`; dropping them keeps the stub honest about props.
  const { ref, key, ...rest } = props ?? {}
  return { type, props: { ...rest, children }, key }
}

/** Minimal class component so a boundary can extend something in tests. */
class Component {
  constructor(props) {
    this.props = props ?? {}
    this.state = {}
  }
  setState(next) {
    this.state = { ...this.state, ...(typeof next === 'function' ? next(this.state) : next) }
  }
}

/** Hook shim: a static render only needs the first value back. */
export function reactStub() {
  return {
    Component,
    createElement: el,
    Fragment: 'Fragment',
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useEffect: () => {},
    useLayoutEffect: () => {},
    useRef: (value) => ({ current: value }),
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
  }
}

/**
 * Evaluate lib/client.js and call the registered factory.
 * @returns the captured module id and its exports.
 */
export function loadClientBundle() {
  const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  const react = reactStub()
  let captured
  const context = {
    window: {
      __ModuleLoader__: {
        load: (spec) => {
          captured = spec
        },
      },
    },
    console,
    setTimeout,
    clearTimeout,
    AbortController,
    URL,
    fetch: () => {
      throw new Error('the bundle must not fetch outside an effect')
    },
  }
  context.globalThis = context
  createContext(context)
  runInContext(source, context, { filename: 'lib/client.js' })

  if (captured === undefined) throw new Error('the module loader was not called')
  const requireStub = (name) => {
    if (name === 'react') return react
    if (name === 'react/jsx-runtime') return { jsx: el, jsxs: el, Fragment: 'Fragment' }
    throw new Error('unexpected require: ' + name)
  }
  return { id: captured.id, mod: captured.factory(requireStub) }
}
