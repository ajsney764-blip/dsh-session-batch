/**
 * Host half of dsh-session-batch.
 *
 * Owns exactly two things the harness (and dsh-session-artifacts) does not:
 *
 *   1. a list that separates "running right now" from "merely kept in host
 *      memory", so the sidebar badge stops lying;
 *   2. deleting the *chat records* of many sessions at once.
 *
 * It never touches workspace files — artifact attribution and file removal
 * belong to dsh-session-artifacts. Every path here is a session log directory
 * under $DSH_HOME/sessions.
 *
 * Routes (authenticated, registered through the official connection service):
 *   GET  /api/session-batch.list
 *   POST /api/session-batch.delete  { sessionIds: string[] }
 */

import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const name = 'session-batch'
export const inject = ['connection', 'sessionQuery', 'workspaceRegistry']

/**
 * Internal handles for the test suite. Not part of the plugin's supported
 * surface: they exist so the state helpers can be exercised concurrently, which
 * is the only way to pin the write-serialisation guarantee.
 */
export const __testing = {
  upsertPending,
  removePending,
  readManifest,
  addRemoved,
  forgetRemoved,
  readRemoved,
}

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const SESSIONS_ROOT = process.env.DSH_SESSIONS_ROOT || path.join(HOME, 'sessions')
const STATE_DIR = path.join(HOME, 'session-batch')
const MANIFEST_PATH = path.join(STATE_DIR, 'pending.json')
const REMOVED_PATH = path.join(STATE_DIR, 'removed.json')

/** How long a running session's work is given to stop before the purge is refused. */
const STOP_WAIT_MS = 8000
/** Attempts at removing one session log directory before it is left to the startup retry. */
const REMOVE_ATTEMPTS = 4
/** Upper bound on one batch, so a single request cannot run for minutes. */
const MAX_BATCH = 200

const ROUTE_LIST = '/api/session-batch.list'
const ROUTE_DELETE = '/api/session-batch.delete'
const ROUTE_PREVIEW_ARTIFACTS = '/api/session-batch.preview-artifacts'

/**
 * The companion plugin that owns artifact attribution. Its exported functions are
 * reused verbatim — this plugin never re-implements the rules (create-only
 * evidence, per-command windows, cross-session uniqueness, DSH-home and package
 * fences). Overridable so tests can inject a stub.
 */
const ARTIFACTS_MODULE = process.env.DSH_SESSION_BATCH_ARTIFACTS || 'dsh-session-artifacts'

/** @type {{ discoverSessionArtifacts: Function, removeArtifacts: Function } | null | undefined} */
let artifactsApi

async function loadArtifactsApi() {
  if (artifactsApi !== undefined) return artifactsApi
  try {
    // A bare specifier resolves through node_modules; a path (used by tests, or a
    // local checkout) has to become a file: URL on Windows.
    const specifier = /^[A-Za-z]:|^\\\\|^\//.test(ARTIFACTS_MODULE) || ARTIFACTS_MODULE.startsWith('.')
      ? pathToFileURL(ARTIFACTS_MODULE).href
      : ARTIFACTS_MODULE
    const loaded = await import(specifier)
    artifactsApi = typeof loaded.discoverSessionArtifacts === 'function' && typeof loaded.removeArtifacts === 'function'
      ? loaded
      : null
  } catch {
    artifactsApi = null
  }
  return artifactsApi
}

let queue = Promise.resolve()

/** Serialize destructive work so two tabs cannot interleave. */
function exclusive(operation) {
  const next = queue.then(operation, operation)
  queue = next.then(() => undefined, () => undefined)
  return next
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

async function readBody(request) {
  let text
  try {
    text = await request.text()
  } catch {
    text = ''
  }
  if (!text) return {}
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    throw new Error('请求内容不是有效的 JSON')
  }
}

/** A session id must never be able to steer a path. */
function normalizeSessionId(value) {
  const id = typeof value === 'string' ? value : ''
  return id && !id.includes('/') && !id.includes('\\') && id !== '.' && id !== '..' ? id : ''
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// Pending manifest and removal tombstones
// ---------------------------------------------------------------------------

/**
 * Serialise every state read-modify-write.
 *
 * Two writers genuinely coexist: a user batch (inside `exclusive`) and the
 * startup retry pass, which runs on a timer. Without this queue they could
 * interleave, and because the atomic-write temp name is unique per write, the
 * loser of the race would see its temp file already renamed away (ENOENT).
 */
let stateQueue = Promise.resolve()

function withStateLock(operation) {
  const next = stateQueue.then(operation, operation)
  stateQueue = next.then(() => undefined, () => undefined)
  return next
}

let tempCounter = 0

/** A temp path no other write in this process can collide with. */
function tempPathFor(target) {
  tempCounter += 1
  return `${target}.${process.pid}.${tempCounter}.${Math.random().toString(36).slice(2, 8)}.tmp`
}

async function readManifest() {
  try {
    const parsed = JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8'))
    if (parsed && Array.isArray(parsed.entries)) return parsed.entries
  } catch {
    /* missing or unreadable means nothing is pending */
  }
  return []
}

async function writeManifest(entries) {
  await fs.mkdir(STATE_DIR, { recursive: true })
  const temporary = tempPathFor(MANIFEST_PATH)
  await fs.writeFile(temporary, JSON.stringify({ version: 1, entries }, null, 2), 'utf8')
  await fs.rename(temporary, MANIFEST_PATH)
}

function upsertPending(entry) {
  return withStateLock(async () => {
    const entries = (await readManifest()).filter((item) => item.id !== entry.id)
    entries.push(entry)
    await writeManifest(entries)
  })
}

function removePending(id) {
  return withStateLock(async () => {
    const entries = (await readManifest()).filter((item) => item.id !== id)
    await writeManifest(entries)
  })
}

/**
 * Tombstones make a deletion stick in this panel.
 *
 * The harness keeps a reopened Session in host memory and exposes no release
 * call, so `listSessions()` keeps reporting a session whose log is gone. Hiding
 * purged ids until the host genuinely forgets them is what makes a successful
 * deletion look successful.
 */
async function readRemoved() {
  try {
    const parsed = JSON.parse(await fs.readFile(REMOVED_PATH, 'utf8'))
    if (parsed && Array.isArray(parsed.ids)) return parsed.ids.map(String)
  } catch {
    /* nothing was removed */
  }
  return []
}

async function writeRemoved(ids) {
  const unique = [...new Set(ids.map(String).filter(Boolean))]
  await fs.mkdir(STATE_DIR, { recursive: true })
  const temporary = tempPathFor(REMOVED_PATH)
  await fs.writeFile(temporary, JSON.stringify({ version: 1, ids: unique }, null, 2), 'utf8')
  await fs.rename(temporary, REMOVED_PATH)
}

function addRemoved(ids) {
  if (ids.length === 0) return Promise.resolve()
  return withStateLock(async () => {
    await writeRemoved([...(await readRemoved()), ...ids])
  })
}

function forgetRemoved(ids) {
  if (ids.length === 0) return Promise.resolve()
  return withStateLock(async () => {
    const drop = new Set(ids.map(String))
    await writeRemoved((await readRemoved()).filter((id) => !drop.has(id)))
  })
}

// ---------------------------------------------------------------------------
// Corpus helpers
// ---------------------------------------------------------------------------

async function findSessionDir(id) {
  if (!normalizeSessionId(id)) return null
  let projects
  try {
    projects = await fs.readdir(SESSIONS_ROOT)
  } catch {
    return null
  }
  for (const project of projects) {
    const candidate = path.join(SESSIONS_ROOT, project, id)
    try {
      const stat = await fs.stat(candidate)
      if (stat.isDirectory()) return candidate
    } catch {
      /* keep looking */
    }
  }
  return null
}

function flattenDescendants(node, out) {
  if (!node || typeof node !== 'object') return out
  const session = node.session
  if (session && session.header) out.push({ header: session.header })
  const children = Array.isArray(node.descendants) ? node.descendants : []
  for (const child of children) flattenDescendants(child, out)
  return out
}

async function descendantsOf(ctx, sessionId) {
  try {
    const trace = await ctx.sessionQuery.traceSession(sessionId)
    return flattenDescendants({ descendants: trace.descendants || [] }, [])
  } catch {
    return []
  }
}

async function readTitles(ctx, ids) {
  const titles = new Map()
  if (ids.length === 0) return titles
  try {
    const observations = await ctx.sessionQuery.readTitleSnapshots(ids)
    for (const observation of observations) {
      if (observation && observation.status === 'fulfilled') {
        const title = observation.value && observation.value.title
        if (title && typeof title.title === 'string' && title.title.trim()) {
          titles.set(observation.sessionId, title.title.trim())
        }
      }
    }
  } catch {
    /* titles are cosmetic */
  }
  return titles
}

function sessionRow(record, titles, sizes) {
  const header = record.header || {}
  const id = header.id
  return {
    id,
    title: titles.get(id) || (header.origin === 'subagent' ? '子代理会话' : '未命名对话'),
    createdAt: typeof header.createdAt === 'number' ? header.createdAt : 0,
    cwd: header.cwd || '',
    kind: header.origin === 'subagent' ? 'subagent' : 'root',
    live: Boolean(record.live),
    running: false,
    persisted: Boolean(record.persisted),
    sizeBytes: sizes.get(id) || 0,
  }
}

/**
 * Ask every provider whether the session still does work: a running turn, owned
 * jobs, live subagent descendants, reminders. An empty answer means idle.
 */
async function sessionActivity(ctx, id) {
  if (typeof ctx.waterfall !== 'function') return []
  try {
    const activity = await ctx.waterfall('workspace/session-activity', { sessionId: id }, () => Promise.resolve([]))
    return Array.isArray(activity) ? activity : []
  } catch {
    // An unreadable answer must not be mistaken for "idle".
    return [{ kind: 'unknown' }]
  }
}

/** Stop the session's work through the archive-grade seam, then wait for it to settle. */
async function stopSessionWork(ctx, id) {
  const initial = await sessionActivity(ctx, id)
  if (initial.length === 0) return { stopped: true, kinds: [] }
  const kinds = [...new Set(initial.map((entry) => String((entry && entry.kind) || 'activity')))]
  try {
    if (ctx.workspaceRegistry && typeof ctx.workspaceRegistry.stopSessionActivity === 'function') {
      await ctx.workspaceRegistry.stopSessionActivity(id)
    }
  } catch {
    /* the deadline below reports it */
  }
  const deadline = Date.now() + STOP_WAIT_MS
  while (Date.now() < deadline) {
    await delay(250)
    if ((await sessionActivity(ctx, id)).length === 0) return { stopped: true, kinds }
  }
  return { stopped: false, kinds }
}

async function isStillKnown(ctx, id) {
  try {
    const records = await ctx.sessionQuery.listSessions()
    return records.some((record) => record.header.id === id)
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Artifact delegation (dsh-session-artifacts owns the rules)
// ---------------------------------------------------------------------------

/**
 * Ask the companion plugin which workspace files this session produced.
 * @returns {Promise<{ api: any, discovered: any } | null>} null when unavailable.
 */
async function discoverArtifacts(ctx, sessionId) {
  const api = await loadArtifactsApi()
  if (!api) return null
  const persistence = ctx.get('sessionPersistence')
  if (!persistence) return null
  const records = await ctx.sessionQuery.listSessions()
  const siblingSessionIds = records.map((record) => record.header.id).filter((id) => id !== sessionId)
  const discovered = await api.discoverSessionArtifacts(
    {
      sessionPersistence: persistence,
      sessionRoot: SESSIONS_ROOT,
      dshHome: HOME,
      includeDelivered: false,
      includeShell: true,
      siblingSessionIds,
      listSessions: () => ctx.sessionQuery.listSessions(),
    },
    sessionId,
  )
  return { api, discovered }
}

function artifactRowsOf(discovered) {
  const files = Array.isArray(discovered && discovered.files) ? discovered.files : []
  return files.map((file) => ({
    path: String(file.path),
    display: typeof file.display === 'string' ? file.display : String(file.path),
    bytes: typeof file.bytes === 'number' ? file.bytes : 0,
    source: typeof file.source === 'string' ? file.source : '',
  }))
}

async function handlePreviewArtifacts(ctx, request) {
  try {
    const body = await readBody(request)
    const requested = Array.isArray(body.sessionIds) ? body.sessionIds : []
    const ids = [...new Set(requested.map(normalizeSessionId).filter(Boolean))]
    if (ids.length === 0) return jsonResponse({ ok: false, error: '缺少有效的 sessionIds' }, 400)
    if (ids.length > MAX_BATCH) return jsonResponse({ ok: false, error: `一次最多 ${MAX_BATCH} 个对话` }, 400)

    const api = await loadArtifactsApi()
    if (!api) return jsonResponse({ ok: true, available: false, sessions: [], totals: { files: 0, bytes: 0 } })

    const sessions = []
    const totals = { files: 0, bytes: 0 }
    for (const id of ids) {
      try {
        const found = await discoverArtifacts(ctx, id)
        if (!found) return jsonResponse({ ok: true, available: false, sessions: [], totals: { files: 0, bytes: 0 } })
        const files = artifactRowsOf(found.discovered)
        sessions.push({
          sessionId: id,
          cwd: found.discovered && found.discovered.header ? found.discovered.header.cwd || '' : '',
          files,
          skipped: Array.isArray(found.discovered && found.discovered.skipped) ? found.discovered.skipped.length : 0,
          shell: found.discovered ? found.discovered.shell : undefined,
        })
        totals.files += files.length
        totals.bytes += files.reduce((sum, file) => sum + file.bytes, 0)
      } catch (error) {
        sessions.push({ sessionId: id, files: [], error: messageOf(error) })
      }
    }
    return jsonResponse({ ok: true, available: true, sessions, totals })
  } catch (error) {
    return jsonResponse({ ok: false, error: messageOf(error) }, 500)
  }
}

// ---------------------------------------------------------------------------
// Deletion
// ---------------------------------------------------------------------------

async function removeSessionLog(id) {
  const directory = await findSessionDir(id)
  if (!directory) return { sessionId: id, ok: true, missing: true }
  try {
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 })
    return { sessionId: id, ok: true }
  } catch (error) {
    return { sessionId: id, ok: false, error: messageOf(error) }
  }
}

/**
 * Remove a session log and prove it is gone: a session still held in host memory
 * can have its directory recreated right after a successful rm, which is how a
 * deletion reports success while the conversation survives.
 */
async function removeSessionLogVerified(id) {
  let attempts = 0
  for (let attempt = 0; attempt < REMOVE_ATTEMPTS; attempt += 1) {
    attempts = attempt + 1
    const result = await removeSessionLog(id)
    if (!result.ok) return { ...result, attempts }
    await delay(attempt === 0 ? 150 : 300)
    if (!(await findSessionDir(id))) return { sessionId: id, ok: true, missing: Boolean(result.missing), attempts }
  }
  return {
    sessionId: id,
    ok: false,
    attempts,
    error: '日志目录在删除后又被宿主重建(该对话仍在内存中),已隐藏这一行,并放到下次启动时继续清理',
  }
}

/** Windows paths are case-insensitive, so dedupe keys are lowercased there. */
function canonicalPath(target) {
  const resolved = path.resolve(target)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

async function detachFromWorkspaces(ctx, sessionId, warnings) {
  for (const workspace of ctx.workspaceRegistry.list()) {
    if (!Array.isArray(workspace.sessionIds) || !workspace.sessionIds.includes(sessionId)) continue
    try {
      await workspace.detachSession(sessionId)
    } catch (error) {
      warnings.push(`从工作区「${workspace.title}」移除失败:${messageOf(error)}`)
    }
  }
  try {
    await ctx.workspaceRegistry.unarchiveSession(sessionId)
  } catch (error) {
    warnings.push(`取消归档失败:${messageOf(error)}`)
  }
  try {
    await ctx.workspaceRegistry.unpinSession(sessionId)
  } catch (error) {
    warnings.push(`取消置顶失败:${messageOf(error)}`)
  }
}

/** Delete the chat records of one session group. Safe to call again after a partial failure. */
async function purgeGroup(ctx, entry, options = {}) {
  const sessionId = String(entry.id)
  const sessionIds = Array.isArray(entry.sessionIds) && entry.sessionIds.length > 0
    ? entry.sessionIds.map(String)
    : [sessionId]
  const warnings = []
  const artifacts = { removed: 0, bytes: 0, failed: [], available: false, retry: [] }
  const deleted = []
  const pending = []

  const root = await stopSessionWork(ctx, sessionId)
  if (!root.stopped) {
    return {
      refused: `该对话仍在运行(${root.kinds.join('、')}),已请求停止但 ${Math.round(STOP_WAIT_MS / 1000)} 秒内没有停下来;未删除任何内容,请稍后重试或先手动停止它`,
      deleted: [],
      pending: [],
      warnings,
    }
  }
  for (const id of sessionIds.slice(1)) {
    const child = await stopSessionWork(ctx, id)
    if (!child.stopped) {
      return {
        refused: `子代理会话 ${id} 仍在运行(${child.kinds.join('、')}),未删除任何内容,请稍后重试`,
        deleted: [],
        pending: [],
        warnings,
      }
    }
  }

  await detachFromWorkspaces(ctx, sessionId, warnings)

  // Workspace files first, while the session logs are still there to attribute from.
  // Subagent sessions keep their own records, so each one is asked separately and
  // the union is deduped by path before anything is unlinked.
  if (options.includeArtifacts) {
    const seen = new Set()
    try {
      for (const id of sessionIds) {
        const found = await discoverArtifacts(ctx, id)
        if (!found) {
          warnings.push('未安装 dsh-session-artifacts,已跳过产物删除,只删了聊天记录')
          artifacts.available = false
          break
        }
        artifacts.available = true
        const header = found.discovered && found.discovered.header ? found.discovered.header : {}
        const cwd = typeof header.cwd === 'string' ? header.cwd : ''
        const candidates = Array.isArray(found.discovered && found.discovered.files) ? found.discovered.files : []
        if (candidates.length === 0 || cwd.length === 0) continue
        const files = []
        for (const file of candidates) {
          const key = canonicalPath(String(file.path))
          if (seen.has(key)) continue
          seen.add(key)
          files.push(file)
        }
        if (files.length === 0) continue
        const outcome = await found.api.removeArtifacts(files, {
          cwd,
          sessionRoot: SESSIONS_ROOT,
          dshHome: HOME,
        })
        artifacts.removed += Array.isArray(outcome.removed)
          ? outcome.removed.length
          : typeof outcome.removed === 'number' ? outcome.removed : 0
        artifacts.bytes += typeof outcome.bytes === 'number' ? outcome.bytes : 0
        if (Array.isArray(outcome.failed)) artifacts.failed.push(...outcome.failed)
        // Files still worth another attempt are remembered with their workspace,
        // because by the next start the session log is gone and cannot be re-attributed.
        if (Array.isArray(outcome.retry)) {
          for (const file of outcome.retry) artifacts.retry.push({ path: file.path, bytes: file.bytes, cwd })
        }
      }
      for (const failure of artifacts.failed) {
        if (failure && failure.reason === 'already-gone') continue
        pending.push({ kind: 'file', id: failure && failure.path, error: (failure && failure.reason) || '未能删除' })
      }
    } catch (error) {
      warnings.push(`产物删除失败:${messageOf(error)}`)
    }
  }

  for (const id of sessionIds) {
    const result = await removeSessionLogVerified(id)
    deleted.push(result)
    if (!result.ok) pending.push({ kind: 'session', id, error: result.error })
  }
  await addRemoved(sessionIds)

  // Best effort: drop the title/statistics row through the open storage domain.
  try {
    const domain = ctx.get('storageDomain') && ctx.get('storageDomain').get('session_projcache')
    if (domain) await domain.table('sessions').delete(sessionId)
  } catch {
    /* the cache is derived state */
  }

  return { refused: '', deleted, pending, warnings, artifacts }
}

async function retryPending(ctx) {
  let entries
  try {
    entries = await readManifest()
  } catch {
    return
  }
  for (const entry of entries) {
    if (!entry || typeof entry.id !== 'string') continue

    // Files remembered from a previous attempt come first: by now the session log
    // may be gone, so they can no longer be re-attributed — only retried as-is.
    if (Array.isArray(entry.artifactRetry) && entry.artifactRetry.length > 0) {
      const api = await loadArtifactsApi()
      if (api) {
        const byCwd = new Map()
        for (const file of entry.artifactRetry) {
          const cwd = typeof file.cwd === 'string' ? file.cwd : ''
          if (!cwd || typeof file.path !== 'string') continue
          if (!byCwd.has(cwd)) byCwd.set(cwd, [])
          byCwd.get(cwd).push({ path: file.path, bytes: file.bytes })
        }
        const remaining = []
        for (const [cwd, files] of byCwd) {
          try {
            const outcome = await api.removeArtifacts(files, { cwd, sessionRoot: SESSIONS_ROOT, dshHome: HOME })
            if (Array.isArray(outcome.retry)) {
              for (const file of outcome.retry) remaining.push({ path: file.path, bytes: file.bytes, cwd })
            }
          } catch {
            for (const file of files) remaining.push({ path: file.path, bytes: file.bytes, cwd })
          }
        }
        entry.artifactRetry = remaining
      }
    }

    try {
      // Re-attribution needs the log; skip discovery once it is already gone.
      const logStillThere = Boolean(await findSessionDir(entry.id))
      const result = await exclusive(() => purgeGroup(ctx, entry, {
        includeArtifacts: entry.includeArtifacts === true && logStillThere,
      }))
      if (result.refused) continue
      if (result.artifacts && Array.isArray(result.artifacts.retry) && result.artifacts.retry.length > 0) {
        const merged = new Map()
        for (const file of [...(entry.artifactRetry || []), ...result.artifacts.retry]) {
          if (!file || typeof file.path !== 'string') continue
          merged.set(`${canonicalPath(file.path)}|${file.cwd || ''}`, file)
        }
        entry.artifactRetry = [...merged.values()]
      }
      const stuck = (entry.artifactRetry || []).length > 0
      if (result.pending.length === 0 && !stuck) await removePending(entry.id)
      else await upsertPending(entry)
    } catch {
      /* keep it for the next startup */
    }
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

async function listPayload(ctx) {
  const persistence = ctx.get('sessionPersistence')
  const [records, snapshots, workspaces, pending, removedIds] = await Promise.all([
    ctx.sessionQuery.listSessions(),
    persistence ? persistence.list().catch(() => []) : Promise.resolve([]),
    Promise.resolve(ctx.workspaceRegistry.list()),
    readManifest(),
    readRemoved(),
  ])
  const knownIds = new Set(records.map((record) => record.header.id))
  const removed = new Set(removedIds)

  const retired = []
  for (const id of removed) {
    if (knownIds.has(id)) continue
    if (await findSessionDir(id)) continue
    retired.push(id)
  }
  if (retired.length > 0) {
    await forgetRemoved(retired)
    for (const id of retired) removed.delete(id)
  }

  const hidden = new Set([...pending.map((entry) => entry.id), ...removed])
  const sizes = new Map()
  for (const snapshot of snapshots) sizes.set(snapshot.header.id, typeof snapshot.sizeBytes === 'number' ? snapshot.sizeBytes : 0)
  const visibleIds = records.map((record) => record.header.id).filter((id) => !hidden.has(id))
  const titles = await readTitles(ctx, visibleIds)
  const byId = new Map(records.map((record) => [record.header.id, record]))
  const awaitingRestart = [...removed].filter((id) => knownIds.has(id)).length

  const claimed = new Set()
  const groups = []
  for (const workspace of workspaces) {
    const sessions = []
    for (const id of workspace.sessionIds || []) {
      const record = byId.get(id)
      if (!record || hidden.has(id)) continue
      claimed.add(id)
      sessions.push(sessionRow(record, titles, sizes))
    }
    if (sessions.length > 0) groups.push({ id: workspace.id, title: workspace.title, path: workspace.path, sessions })
  }

  const orphans = []
  const orphanSubagents = []
  for (const record of records) {
    const id = record.header.id
    if (claimed.has(id) || hidden.has(id)) continue
    const row = sessionRow(record, titles, sizes)
    if (record.header.origin === 'subagent') {
      const parent = record.header.parentSession
      if (parent && byId.has(parent) && !hidden.has(parent)) continue
      orphanSubagents.push(row)
    } else {
      orphans.push(row)
    }
  }

  let totalBytes = 0
  for (const record of records) {
    if (hidden.has(record.header.id)) continue
    totalBytes += sizes.get(record.header.id) || 0
  }

  // Only a live session can be busy, so the activity waterfall is asked for those alone.
  const runningIds = new Set()
  for (const record of records) {
    const id = record.header.id
    if (!record.live || hidden.has(id)) continue
    if ((await sessionActivity(ctx, id)).length > 0) runningIds.add(id)
  }
  const applyRunning = (rows) => rows.map((row) => ({ ...row, running: runningIds.has(row.id) }))

  for (const group of groups) group.sessions = applyRunning(group.sessions)

  return {
    ok: true,
    groups,
    orphans: applyRunning(orphans),
    orphanSubagents: applyRunning(orphanSubagents),
    totals: { sessions: visibleIds.length, bytes: totalBytes, pending: pending.length, awaitingRestart },
  }
}

async function handleDelete(ctx, request) {
  try {
    const body = await readBody(request)
    const requested = Array.isArray(body.sessionIds) ? body.sessionIds : []
    const ids = [...new Set(requested.map(normalizeSessionId).filter(Boolean))]
    if (ids.length === 0) return jsonResponse({ ok: false, error: '缺少有效的 sessionIds' }, 400)
    if (ids.length > MAX_BATCH) return jsonResponse({ ok: false, error: `一次最多删除 ${MAX_BATCH} 个对话` }, 400)
    const includeArtifacts = body.includeArtifacts === true
    const artifactTotals = { removed: 0, bytes: 0, pendingFiles: 0 }

    return await exclusive(async () => {
      const results = []
      const failures = []
      const warnings = []

      for (const sessionId of ids) {
        const known = await isStillKnown(ctx, sessionId)
        const entry = {
          id: sessionId,
          sessionIds: [sessionId, ...(await descendantsOf(ctx, sessionId)).map((item) => item.header.id)],
          includeArtifacts,
          createdAt: Date.now(),
        }
        await upsertPending(entry)
        const result = await purgeGroup(ctx, entry, { includeArtifacts })
        if (result.refused) {
          await removePending(sessionId)
          failures.push({ sessionId, error: result.refused })
          warnings.push(...result.warnings)
          continue
        }
        if (result.pending.length === 0) await removePending(sessionId)
        results.push({
          sessionId,
          subagents: entry.sessionIds.length - 1,
          pending: result.pending.length,
          artifacts: result.artifacts ? result.artifacts.removed : 0,
          artifactBytes: result.artifacts ? result.artifacts.bytes : 0,
        })
        if (result.artifacts && result.artifacts.removed > 0) {
          artifactTotals.removed += result.artifacts.removed
          artifactTotals.bytes += result.artifacts.bytes
        }
        // Keep files that resisted removal for the next start; the log is about to
        // disappear, so they can only be retried by path from now on.
        if (result.artifacts && Array.isArray(result.artifacts.retry) && result.artifacts.retry.length > 0) {
          const merged = new Map()
          for (const file of [...(entry.artifactRetry || []), ...result.artifacts.retry]) {
            if (!file || typeof file.path !== 'string') continue
            merged.set(`${canonicalPath(file.path)}|${file.cwd || ''}`, file)
          }
          entry.artifactRetry = [...merged.values()]
          await upsertPending(entry)
          artifactTotals.pendingFiles += result.artifacts.retry.length
        }
        if (result.pending.length > 0) {
          failures.push({ sessionId, error: `有 ${result.pending.length} 项未删完,已排队到下次启动` })
        }
        warnings.push(...result.warnings)
        if (known) warnings.push(`「${sessionId}」仍在宿主内存中,重启应用后才会从侧栏消失`)
      }

      return jsonResponse({
        ok: failures.length === 0,
        deleted: results,
        failed: failures,
        artifacts: artifactTotals,
        warnings: [...new Set(warnings)],
      }, failures.length === 0 ? 200 : 207)
    })
  } catch (error) {
    return jsonResponse({ ok: false, error: messageOf(error) }, 500)
  }
}

export function apply(ctx) {
  ctx.effect(
    () =>
      ctx.connection.fetch.register({
        path: ROUTE_LIST,
        methods: ['GET'],
        requestBody: 'buffered',
        fetch: async () => {
          try {
            return jsonResponse(await listPayload(ctx))
          } catch (error) {
            return jsonResponse({ ok: false, error: messageOf(error) }, 500)
          }
        },
      }),
    'session-batch: list route',
  )

  ctx.effect(
    () =>
      ctx.connection.fetch.register({
        path: ROUTE_PREVIEW_ARTIFACTS,
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: (request) => handlePreviewArtifacts(ctx, request),
      }),
    'session-batch: artifact preview route',
  )

  ctx.effect(
    () =>
      ctx.connection.fetch.register({
        path: ROUTE_DELETE,
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: (request) => handleDelete(ctx, request),
      }),
    'session-batch: delete route',
  )

  ctx.effect(() => {
    const timer = setTimeout(() => {
      void retryPending(ctx)
    }, 3000)
    return () => clearTimeout(timer)
  }, 'session-batch: retry pending deletions')
}
