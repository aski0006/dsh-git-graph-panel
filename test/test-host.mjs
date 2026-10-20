import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { apply } from '../lib/index.js'

const here = new URL('./', import.meta.url)
const fixture = (name) => readFileSync(new URL(name, here), 'utf8')

const REPO = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '')

/**
 * A stand-in for the host subprocess seam: answers each git argv from the
 * captured fixtures instead of spawning, so the whole read path (not just the
 * parsers) runs without a child process.
 */
function fakeSubprocess() {
  const answer = (argv) => {
    const args = argv.slice(1)
    const joined = args.join(' ')
    if (joined === 'rev-parse --show-toplevel') return { code: 0, stdout: REPO + '\n' }
    if (joined === 'rev-parse --verify -q HEAD') return { code: 0, stdout: '0123456789abcdef0123456789abcdef01234567\n' }
    if (joined === 'rev-parse --abbrev-ref HEAD') return { code: 0, stdout: 'main\n' }
    if (joined === 'rev-parse --short HEAD') return { code: 0, stdout: '100703a\n' }
    if (args[0] === 'log') return { code: 0, stdout: fixture('log.txt') }
    if (args[0] === 'status') return { code: 0, stdout: fixture('status.txt') }
    if (args[0] === 'for-each-ref') return { code: 0, stdout: fixture('branches.txt') }
    return { code: 1, stdout: '', stderr: 'unexpected: ' + joined }
  }
  const calls = []
  return {
    calls,
    spawn(spec) {
      calls.push(spec.argv.join(' '))
      const result = answer(spec.argv)
      return {
        done: Promise.resolve({ exitCode: result.code }),
        collected: {
          stdout: { readFrom: () => ({ text: result.stdout ?? '' }) },
          stderr: { readFrom: () => ({ text: result.stderr ?? '' }) },
        },
      }
    },
  }
}

const subprocess = fakeSubprocess()
const routes = []
const ctx = {
  effect: (cb) => cb(),
  get: (name) => (name === 'subprocess' ? subprocess : undefined),
  logger: { warn: (...args) => console.warn('[warn]', ...args) },
  webServer: {
    register(spec) {
      routes.push(spec)
      return () => {}
    },
  },
}

const dispose = apply(ctx)
if (routes.length !== 1) throw new Error('expected one route, got ' + routes.length)
if (routes[0].kind !== 'prefix' || routes[0].path !== '/git-graph-panel') {
  throw new Error('unexpected route: ' + routes[0].kind + ' ' + routes[0].path)
}
console.log('route:', routes[0].kind, routes[0].path)

const handler = routes[0].handler

function call(pathname, { method = 'GET', body, address = '127.0.0.1' } = {}) {
  return new Promise((resolve) => {
    const listeners = {}
    const req = {
      url: pathname,
      method,
      socket: { remoteAddress: address },
      headers: {},
      body,
      destroy() {},
      on(event, fn) {
        ;(listeners[event] ??= []).push(fn)
        return req
      },
    }
    const res = {
      statusCode: 0,
      writeHead(code) {
        this.statusCode = code
      },
      end(text) {
        resolve({ status: res.statusCode, body: text === undefined || text === '' ? undefined : JSON.parse(text) })
      },
    }
    const payload = method === 'POST' ? JSON.stringify(body ?? {}) : ''
    const run = async () => {
      setTimeout(() => {
        if (payload !== '') for (const fn of listeners.data ?? []) fn(Buffer.from(payload))
        for (const fn of listeners.end ?? []) fn()
      }, 0)
      await handler(req, res)
    }
    run().catch((error) => res.end(JSON.stringify({ crash: String(error) })))
  })
}

const fail = []
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) fail.push(`${name}\n  expected ${e}\n  actual   ${a}`)
}

const ok = await call('/git-graph-panel/data?path=' + encodeURIComponent(REPO))
check('response status', ok.status, 200)
check('isRepo', ok.body.isRepo, true)
check('root', ok.body.root, REPO)
check('branch', ok.body.branch, 'main')
check('detached', ok.body.detached, false)
check('head', ok.body.head, '100703a')
check('dirty', ok.body.dirty, 1)
check('conflicts', ok.body.conflicts, 0)
check('commits', ok.body.commits.length, 6)
check('truncated', ok.body.truncated, false)
check('first subject', ok.body.commits[0].subject, 'after merge')
check('first refs', ok.body.commits[0].refs, [
  { name: 'main', kind: 'head' },
  { name: 'v1.0', kind: 'tag' },
])
check('merge parents', ok.body.commits[1].parents.length, 2)
check('branches', ok.body.branches.map((b) => [b.name, b.current]), [
  ['main', true],
  ['feature', false],
])

const posted = await call('/git-graph-panel/data', { method: 'POST', body: { path: REPO } })
check('POST path honoured', posted.body.isRepo, true)
check('POST root', posted.body.root, REPO)

const forbidden = await call('/git-graph-panel/data', { method: 'POST', body: { path: REPO }, address: '10.0.0.5' })
check('remote address rejected', [forbidden.status, forbidden.body], [403, { ok: false, error: 'forbidden' }])

const missing = await call('/git-graph-panel/data?path=' + encodeURIComponent('/definitely/missing/dir'))
check('no directory', [missing.body.isRepo, missing.body.reason], [false, 'no-workspace'])

const unknown = await call('/git-graph-panel/other')
check('unknown endpoint', unknown.status, 404)

// --- the reload route -------------------------------------------------------
// A second host instance, this time with a client-module registry on the
// context: the route must republish THIS package and report the new revision.
const reloadRoutes = []
const rebuiltWith = []
const reloadCtx = {
  effect: (cb) => cb(),
  get: (name) => {
    if (name === 'subprocess') return subprocess
    if (name === 'clientModules') {
      return {
        rebuilt(id) {
          rebuiltWith.push(id)
          return 'rev-1'
        },
      }
    }
    return undefined
  },
  logger: { warn: (...args) => console.warn('[warn]', ...args) },
  webServer: {
    register(spec) {
      reloadRoutes.push(spec)
      return () => {}
    },
  },
}

const disposeReload = apply(reloadCtx)
const reloadHandler = reloadRoutes[0].handler
const reload = await new Promise((resolve) => {
  const req = {
    url: '/git-graph-panel/reload',
    method: 'POST',
    socket: { remoteAddress: '127.0.0.1' },
    headers: {},
    destroy() {},
    on() {
      return req
    },
  }
  const res = {
    statusCode: 0,
    writeHead(code) {
      this.statusCode = code
    },
    end(text) {
      resolve({ status: res.statusCode, body: JSON.parse(text) })
    },
  }
  Promise.resolve(reloadHandler(req, res)).catch((error) => res.end(JSON.stringify({ crash: String(error) })))
})
check('reload status', reload.status, 200)
check('reload body', reload.body, { ok: true, rev: 'rev-1' })
check('reload names this package', rebuiltWith, ['dsh-git-graph-panel'])
check('reload route registered', reloadRoutes.map((route) => route.path), ['/git-graph-panel'])
disposeReload()

// Without a registry the route still answers, just with a reason to show.
const noRegistry = await call('/git-graph-panel/reload', { method: 'POST' })
check('reload without registry', noRegistry.body, { ok: false, error: 'no-registry' })

dispose()
if (fail.length > 0) {
  console.error(fail.join('\n\n'))
  process.exit(1)
}
console.log(
  'host route OK —',
  ok.body.commits.length,
  'commits,',
  ok.body.branches.length,
  'branches,',
  subprocess.calls.length,
  'git calls',
)
