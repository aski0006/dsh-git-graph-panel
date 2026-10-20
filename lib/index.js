/**
 * dsh-git-graph-panel — host half.
 *
 * Owns one same-origin, read-only JSON route on the shared web server:
 * `POST /git-graph-panel/data` with `{ path }` (or
 * `GET /git-graph-panel/data?path=...`). It answers "is this directory
 * a git repository?" and, when it is, the commit log, branch list and working
 * tree state the sidebar tab needs to draw the graph.
 *
 * Nothing here mutates the repository: every command is a `rev-parse`,
 * `log`, `for-each-ref` or `status` read. The route is loopback-only because it
 * runs a local binary against a caller-supplied directory.
 *
 * @module dsh-git-graph-panel
 */

import { execFile } from 'node:child_process'
import { statSync } from 'node:fs'

/** The route prefix this plugin owns on the shared web server. */
const ROUTE_PREFIX = '/git-graph-panel'

/** This package's name, i.e. the id its browser half is registered under. */
const PACKAGE_NAME = 'dsh-git-graph-panel'

/** How many commits one read returns. */
const MAX_COMMITS = 120

/** Per-command wall clock cap. */
const GIT_TIMEOUT_MS = 20000

/** Field separator for every record the parsers below split. */
const US = '\x1f'

/** Record separator between commits. */
const RS = '\x1e'

/** Per-stream collected-output cap when running through the host subprocess seam. */
const OUTPUT_CAP_BYTES = 1 << 20

/** Required service: the web server route registry. */
// `clientModules` is read reflectively (`ctx.get`) when the reload route is used,
// so it stays out of `inject`: this Cordis treats an inject map as service → config,
// not as a required/optional split, and declaring it would hold the fiber back.
export const inject = ['webServer']

/**
 * Run one git command in `cwd`.
 *
 * A missing executable, a non-zero exit and a timeout all settle the same way
 * (an exit code plus collected output) so callers never need a try/catch. The
 * managed subprocess seam is preferred when the host exposes it (it carries
 * cancellation and the platform's process tree); otherwise the plugin falls
 * back to node's own `execFile`.
 * @param context - the host context (may expose `subprocess`).
 * @param cwd - working directory for the command.
 * @param args - git arguments.
 * @returns the exit code and both streams.
 */
async function runGit(context, cwd, args) {
  const subprocess = typeof context?.get === 'function' ? context.get('subprocess') : undefined
  if (subprocess === undefined || subprocess === null || typeof subprocess.spawn !== 'function') {
    return runGitProcess(cwd, args)
  }
  try {
    const handle = subprocess.spawn({
      argv: ['git', ...args],
      cwd,
      stdio: { stdin: 'ignore', stdout: { maxBytes: OUTPUT_CAP_BYTES }, stderr: { maxBytes: OUTPUT_CAP_BYTES } },
      graceMs: 10000,
    })
    const outcome = await handle.done
    const stdout = handle.collected?.stdout?.readFrom(0)?.text ?? ''
    const stderr = handle.collected?.stderr?.readFrom(0)?.text ?? ''
    const code = typeof outcome?.exitCode === 'number' ? outcome.exitCode : 1
    return { code, stdout, stderr }
  } catch (error) {
    return { code: 127, stdout: '', stderr: `git: ${String(error?.message ?? error)}` }
  }
}

/**
 * Fallback runner: node's `execFile`, used when the host has no subprocess seam.
 * @param cwd - working directory for the command.
 * @param args - git arguments.
 * @returns the exit code and both streams.
 */
function runGitProcess(cwd, args) {
  return new Promise((resolve) => {
    execFile(
      'git',
      args,
      { cwd, timeout: GIT_TIMEOUT_MS, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const text = String(stdout ?? '')
        const noise = String(stderr ?? '')
        if (error === null || error === undefined) {
          resolve({ code: 0, stdout: text, stderr: noise })
          return
        }
        const code = typeof error.code === 'number' ? error.code : error.code === 'ENOENT' ? 127 : 1
        resolve({ code, stdout: text, stderr: noise !== '' ? noise : String(error.message ?? '') })
      },
    )
  })
}

/**
 * Whether `path` names an existing directory.
 * @param path - absolute path to test.
 * @returns true when the path is a readable directory.
 */
function isDirectory(path) {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/**
 * Parse a `%D` decoration string into ref chips.
 *
 * Shapes git produces: `HEAD -> main`, `origin/main`, `tag: v1.2.0`,
 * and comma-separated combinations of them.
 * @param decoration - the raw `%D` text.
 * @returns the ref chips in source order.
 */
function parseDecorations(decoration) {
  const refs = []
  if (decoration === '') return refs
  for (const raw of decoration.split(',')) {
    const part = raw.trim()
    if (part === '') continue
    if (part.startsWith('HEAD -> ')) {
      refs.push({ name: part.slice('HEAD -> '.length), kind: 'head' })
      continue
    }
    if (part === 'HEAD') {
      refs.push({ name: 'HEAD', kind: 'head' })
      continue
    }
    if (part.startsWith('tag: ')) {
      refs.push({ name: part.slice('tag: '.length), kind: 'tag' })
      continue
    }
    refs.push({ name: part, kind: /^[^/]+\//.test(part) && !/^refs\//.test(part) ? 'remote' : 'branch' })
  }
  return refs
}

/**
 * Parse `for-each-ref` output into branch entries.
 * @param stdout - tab separated `name<TAB>HEAD<TAB>sha` lines.
 * @returns the branch list, current branch first.
 */
export function parseBranches(stdout) {
  const branches = []
  for (const line of stdout.split('\n')) {
    if (line === '') continue
    const [name, head, sha] = line.split('\t')
    if (name === undefined || name === '') continue
    if (name.endsWith('/HEAD')) continue
    branches.push({ name, current: head === '*', sha: sha ?? '' })
  }
  branches.sort((a, b) => (a.current === b.current ? (a.name < b.name ? -1 : 1) : a.current ? -1 : 1))
  return branches
}

/**
 * Read the local and remote branches.
 * @param context - the host context (git runner).
 * @param root - repository root.
 * @returns the branch list, current branch first.
 */
async function readBranches(context, root) {
  const result = await runGit(context, root, [
    'for-each-ref',
    'refs/heads',
    'refs/remotes',
    '--format=%(refname:short)\t%(HEAD)\t%(objectname:short)',
  ])
  if (result.code !== 0) return []
  return parseBranches(result.stdout)
}

/**
 * Parse `git status --porcelain` output.
 * @param stdout - porcelain lines.
 * @returns the change counts.
 */
export function parseStatus(stdout) {
  let dirty = 0
  let conflicts = 0
  for (const line of stdout.split('\n')) {
    if (line.length < 3) continue
    dirty += 1
    const x = line[0]
    const y = line[1]
    if (x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')) conflicts += 1
  }
  return { dirty, conflicts }
}

/**
 * Read the working tree state.
 * @param context - the host context (git runner).
 * @param root - repository root.
 * @returns the change counts.
 */
async function readStatus(context, root) {
  const result = await runGit(context, root, ['status', '--porcelain'])
  if (result.code !== 0) return { dirty: 0, conflicts: 0 }
  return parseStatus(result.stdout)
}

/**
 * Parse the `git log` stream produced by readLog's format.
 * @param stdout - RS/US separated records.
 * @returns the parsed commits plus whether the window was truncated.
 */
export function parseLog(stdout) {
  const records = stdout.split(RS)
  const commits = []
  for (const raw of records) {
    const record = raw.replace(/^\n+/, '')
    if (record === '') continue
    const [sha, short, parents, author, when, at, decorations, subject] = record.split(US)
    if (sha === undefined || sha === '') continue
    commits.push({
      sha,
      short: short ?? sha.slice(0, 7),
      parents: (parents ?? '').split(' ').filter((parent) => parent !== ''),
      author: author ?? '',
      when: when ?? '',
      at: Number(at ?? 0),
      subject: subject ?? '',
      refs: parseDecorations(decorations ?? ''),
    })
  }
  const truncated = commits.length > MAX_COMMITS
  return { commits: truncated ? commits.slice(0, MAX_COMMITS) : commits, truncated }
}

/**
 * Read the commit log.
 * @param context - the host context (git runner).
 * @param root - repository root.
 * @returns the parsed commits plus whether the window was truncated.
 */
async function readLog(context, root) {
  const format = ['%H', '%h', '%P', '%an', '%ar', '%at', '%D', '%s'].join('%x1f') + '%x1e'
  const result = await runGit(context, root, [
    'log',
    '--no-color',
    `--max-count=${MAX_COMMITS + 1}`,
    `--pretty=format:${format}`,
  ])
  if (result.code !== 0) return { commits: [], truncated: false }
  return parseLog(result.stdout)
}

/**
 * Collect every fact the sidebar tab renders for one directory.
 * @param context - the host context (git runner).
 * @param dir - absolute directory to inspect.
 * @returns the repository view.
 */
async function readRepo(context, dir) {
  const top = await runGit(context, dir, ['rev-parse', '--show-toplevel'])
  if (top.code !== 0) {
    if (top.code === 127) {
      return { isRepo: false, reason: 'git-missing', detail: top.stderr.trim() }
    }
    const detail = top.stderr.trim()
    const notRepo = /not a git repository/i.test(detail)
    return { isRepo: false, reason: notRepo ? 'not-repo' : 'git-error', detail }
  }
  const root = top.stdout.trim()
  const head = await runGit(context, root, ['rev-parse', '--verify', '-q', 'HEAD'])
  const hasCommits = head.code === 0
  const branchResult = hasCommits
    ? await runGit(context, root, ['rev-parse', '--abbrev-ref', 'HEAD'])
    : await runGit(context, root, ['symbolic-ref', '--short', '-q', 'HEAD'])
  const branch = branchResult.code === 0 ? branchResult.stdout.trim() : ''
  const headShort = hasCommits ? (await runGit(context, root, ['rev-parse', '--short', 'HEAD'])).stdout.trim() : ''
  const [log, status, branches] = await Promise.all([
    hasCommits ? readLog(context, root) : Promise.resolve({ commits: [], truncated: false }),
    readStatus(context, root),
    readBranches(context, root),
  ])
  return {
    isRepo: true,
    root,
    branch,
    detached: hasCommits && branch === 'HEAD',
    head: headShort,
    empty: !hasCommits,
    dirty: status.dirty,
    conflicts: status.conflicts,
    branches,
    commits: log.commits,
    truncated: log.truncated,
    limit: MAX_COMMITS,
  }
}

/**
 * Whether a request originates from the local machine.
 * @param request - the node request.
 * @returns true for loopback addresses.
 */
function isLoopback(request) {
  const address = request.socket?.remoteAddress ?? ''
  return (
    address === '::1' ||
    address === '127.0.0.1' ||
    address === '::ffff:127.0.0.1' ||
    address.startsWith('127.') ||
    address.startsWith('::ffff:127.')
  )
}

/**
 * Write a JSON response.
 * @param response - the node response.
 * @param status - HTTP status.
 * @param body - JSON-serializable payload.
 */
function writeJson(response, status, body) {
  const text = JSON.stringify(body)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(text)
}

/**
 * Read a bounded JSON request body, or an empty object.
 * @param request - the node request.
 * @returns the parsed body.
 */
function readBody(request) {
  return new Promise((resolve) => {
    let size = 0
    const chunks = []
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > 64 * 1024) {
        resolve({})
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8').trim()
      if (text === '') {
        resolve({})
        return
      }
      try {
        const parsed = JSON.parse(text)
        resolve(parsed !== null && typeof parsed === 'object' ? parsed : {})
      } catch {
        resolve({})
      }
    })
    request.on('error', () => {
      resolve({})
    })
  })
}

/**
 * Mount the plugin: register the data route for this plugin's lifetime.
 * @param ctx - the host context carrying the web server.
 * @returns the disposer removing the route.
 */
export function apply(ctx) {
  const registry = () => ctx.get('workspaceRegistry')

  /** Pick the directory a request refers to: the given one, else the first workspace. */
  const directoryOf = (requested) => {
    if (typeof requested === 'string' && requested !== '' && requested.length < 2048 && isDirectory(requested)) {
      return requested
    }
    const workspaces = registry()?.list?.() ?? []
    for (const workspace of workspaces) {
      if (typeof workspace?.path === 'string' && isDirectory(workspace.path)) return workspace.path
    }
    return undefined
  }

  const handler = async (request, response) => {
    if (!isLoopback(request)) {
      writeJson(response, 403, { ok: false, error: 'forbidden' })
      return
    }
    let url
    try {
      url = new URL(request.url ?? '/', 'http://localhost')
    } catch {
      writeJson(response, 400, { ok: false, error: 'bad-url' })
      return
    }
    if (!url.pathname.startsWith(ROUTE_PREFIX)) {
      writeJson(response, 404, { ok: false, error: 'not-found' })
      return
    }
    const target = url.pathname.slice(ROUTE_PREFIX.length) || '/'
    if (target === '/reload') {
      // Re-read this package's browser half from disk and republish its revision,
      // so a window reload picks up an edited bundle without restarting the app.
      if (request.method !== 'POST') {
        writeJson(response, 405, { ok: false, error: 'method' })
        return
      }
      const registry = ctx.get('clientModules')
      if (registry === undefined || typeof registry.rebuilt !== 'function') {
        writeJson(response, 200, { ok: false, error: 'no-registry' })
        return
      }
      try {
        const rev = registry.rebuilt(PACKAGE_NAME)
        writeJson(response, 200, { ok: rev !== undefined, rev: rev ?? '' })
      } catch (error) {
        writeJson(response, 200, { ok: false, error: String(error) })
      }
      return
    }
    if (target !== '/data') {
      writeJson(response, 404, { ok: false, error: 'not-found' })
      return
    }
    const query = url.searchParams.get('path') ?? ''
    const body = request.method === 'POST' ? await readBody(request) : {}
    const requested = typeof body.path === 'string' ? body.path : query
    const dir = directoryOf(requested)
    if (dir === undefined) {
      writeJson(response, 200, { ok: true, dir: '', isRepo: false, reason: 'no-workspace' })
      return
    }
    try {
      const view = await readRepo(ctx, dir)
      writeJson(response, 200, { ok: true, dir, ...view })
    } catch (error) {
      ctx.logger?.warn?.(`dsh-git-graph-panel: read failed for ${dir}: ${String(error)}`)
      writeJson(response, 200, { ok: true, dir, isRepo: false, reason: 'git-error', detail: String(error) })
    }
  }

  return ctx.effect(
    () => ctx.webServer.register({ kind: 'prefix', path: ROUTE_PREFIX, handler }),
    'dsh-git-graph-panel: data route',
  )
}
