/**
 * Host-side tests.
 *
 * Points $DSH_HOME at a throwaway directory, drives the registered routes
 * against stub services, and checks everything this plugin owns:
 *
 *   - "running" versus "merely in host memory"
 *   - batch deletion of chat records
 *   - artifact delegation to dsh-session-artifacts (stubbed through
 *     DSH_SESSION_BATCH_ARTIFACTS), including subagent sessions
 *   - verified removal, tombstones, refusal, and the retry manifest
 *
 * Run: node test/host.test.mjs   (no dependencies required)
 */
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const HOME = await fs.mkdtemp(path.join(os.tmpdir(), 'sb-host-'))
process.env.DSH_HOME = HOME
process.env.DSH_SESSIONS_ROOT = path.join(HOME, 'sessions')
delete process.env.DSH_PROFILE_DIR

const SESSIONS = path.join(HOME, 'sessions')
const STATE = path.join(HOME, 'session-batch')
const WORK = path.join(HOME, 'work')

// ---------------------------------------------------------------------------
// Stub for the companion plugin
// ---------------------------------------------------------------------------

globalThis.__artifactCalls = { discover: [], remove: [] }
globalThis.__artifactWorkspace = WORK
globalThis.__artifactPlan = {}
const STUB = path.join(HOME, 'stub-artifacts.mjs')
await fs.writeFile(STUB, `
import fs from 'node:fs'
const calls = globalThis.__artifactCalls
export async function discoverSessionArtifacts(options, sessionId) {
  calls.discover.push(sessionId)
  const plan = globalThis.__artifactPlan || {}
  const files = (plan[sessionId] || []).map((file) => ({ path: file, display: file, bytes: 3, source: 'write' }))
  return { header: { cwd: globalThis.__artifactWorkspace }, files, skipped: [], shell: { enabled: true } }
}
export async function removeArtifacts(files) {
  calls.remove.push(files.map((file) => file.path))
  const removed = []
  const failed = []
  const retry = []
  let bytes = 0
  for (const file of files) {
    if (String(file.path).includes('locked')) {
      failed.push({ path: file.path, reason: 'remove-failed' })
      retry.push({ path: file.path, bytes: file.bytes })
      continue
    }
    try {
      fs.unlinkSync(file.path)
      removed.push({ path: file.path, bytes: file.bytes || 0 })
      bytes += file.bytes || 0
    } catch {
      failed.push({ path: file.path, reason: 'already-gone' })
    }
  }
  return { removed, failed, bytes, retry }
}
`, 'utf8')
process.env.DSH_SESSION_BATCH_ARTIFACTS = STUB
await fs.mkdir(WORK, { recursive: true })

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function seedSession(id) {
  const directory = path.join(SESSIONS, '--proj--', id)
  await fs.mkdir(directory, { recursive: true })
  await fs.writeFile(path.join(directory, 'session.v4.jsonl.zstd'), 'stub', 'utf8')
  return directory
}

async function dirExists(target) {
  try {
    return (await fs.stat(target)).isDirectory()
  } catch {
    return false
  }
}

async function fileExists(target) {
  try {
    return (await fs.stat(target)).isFile()
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Stub services
// ---------------------------------------------------------------------------

const calls = { stopped: [], detached: [] }
const activity = new Map()
const descendantsFor = {}
let clearsOnStop = true
let records = []
let workspaces = []

const routes = new Map()
const cleanups = []

const ctx = {
  get(name) {
    if (name === 'sessionPersistence') return { list: async () => [] }
    if (name === 'storageDomain') return { get: () => ({ table: () => ({ delete: async () => {} }) }) }
    return undefined
  },
  async waterfall(name, args, fallback) {
    assert.equal(name, 'workspace/session-activity')
    const entry = activity.get(args.sessionId)
    return entry ? entry : fallback()
  },
  sessionQuery: {
    async listSessions() { return records },
    async traceSession(sessionId) { return { descendants: descendantsFor[sessionId] || [] } },
    async readTitleSnapshots(ids) {
      return ids.map((id) => ({ sessionId: id, status: 'fulfilled', value: { title: { title: `t-${id}` } } }))
    },
  },
  workspaceRegistry: {
    list() { return workspaces },
    async unarchiveSession() {},
    async unpinSession() {},
    async stopSessionActivity(id) {
      calls.stopped.push(id)
      if (clearsOnStop) activity.delete(id)
    },
  },
  connection: { fetch: { register(route) { routes.set(route.path, route); return () => {} } } },
  effect(fn) {
    const cleanup = fn()
    if (typeof cleanup === 'function') cleanups.push(cleanup)
    return cleanup
  },
}

const module = await import('../index.js')
assert.equal(module.name, 'session-batch')
assert.deepEqual(module.inject, ['connection', 'sessionQuery', 'workspaceRegistry'])
module.apply(ctx)
assert.deepEqual([...routes.keys()].sort(), [
  '/api/session-batch.delete',
  '/api/session-batch.list',
  '/api/session-batch.preview-artifacts',
])

const call = (route, body) => routes.get(route).fetch(
  body === undefined
    ? new Request('http://dsh.test')
    : new Request('http://dsh.test', { method: 'POST', body: JSON.stringify(body) }),
).then(async (response) => ({ status: response.status, body: await response.json() }))

// ---------------------------------------------------------------------------
// 1. Running versus merely in memory, plus tombstone retirement
// ---------------------------------------------------------------------------

const runningDir = await seedSession('session-running')
const idleDir = await seedSession('session-idle')
const pairDirA = await seedSession('session-pair-a')
const pairDirB = await seedSession('session-pair-b')

workspaces = [{
  id: 'ws-1',
  title: 'W',
  path: 'E:\\w',
  sessionIds: ['session-running', 'session-idle', 'session-pair-a', 'session-pair-b'],
  detachSession: async (id) => { calls.detached.push(id) },
}]
records = [
  { header: { id: 'session-running', createdAt: 1, cwd: 'E:\\w', origin: 'root' }, live: true, persisted: true },
  { header: { id: 'session-idle', createdAt: 2, cwd: 'E:\\w', origin: 'root' }, live: true, persisted: true },
  { header: { id: 'session-pair-a', createdAt: 3, cwd: 'E:\\w', origin: 'root' }, live: false, persisted: true },
  { header: { id: 'session-pair-b', createdAt: 4, cwd: 'E:\\w', origin: 'root' }, live: false, persisted: true },
]
activity.set('session-running', [{ kind: 'turn' }])
await fs.mkdir(STATE, { recursive: true })
await fs.writeFile(path.join(STATE, 'removed.json'), JSON.stringify({ version: 1, ids: ['session-long-gone', 'session-idle'] }), 'utf8')

const listed = await call('/api/session-batch.list')
assert.equal(listed.status, 200)
const rows = listed.body.groups[0].sessions
assert.deepEqual(rows.map((row) => row.id).sort(), ['session-pair-a', 'session-pair-b', 'session-running'])
assert.equal(rows.find((row) => row.id === 'session-running').running, true, 'a session reporting activity is running')
const pairA = rows.find((row) => row.id === 'session-pair-a')
assert.equal(pairA.running, false, 'a cold session is not running')
assert.equal(pairA.live, false, 'a cold session is not in memory')
assert.equal(listed.body.totals.awaitingRestart, 1, 'a hidden id the host still lists awaits a restart')
const tombstones = JSON.parse(await fs.readFile(path.join(STATE, 'removed.json'), 'utf8'))
assert.deepEqual(tombstones.ids, ['session-idle'], 'a tombstone the host forgot is retired')

// ---------------------------------------------------------------------------
// 2. Batch deletion is chat-records-only by default
// ---------------------------------------------------------------------------

const batch = await call('/api/session-batch.delete', { sessionIds: ['session-pair-a', 'session-pair-b'] })
assert.equal(batch.status, 200, JSON.stringify(batch.body))
assert.equal(batch.body.deleted.length, 2)
assert.deepEqual(batch.body.failed, [])
assert.equal(await dirExists(pairDirA), false, 'the first log directory must be gone')
assert.equal(await dirExists(pairDirB), false, 'the second log directory must be gone')
assert.ok(calls.detached.includes('session-pair-a'), 'workspace accounting must be detached')
assert.equal(globalThis.__artifactCalls.remove.length, 0, 'no workspace file is touched unless asked')
const afterBatch = JSON.parse(await fs.readFile(path.join(STATE, 'removed.json'), 'utf8'))
assert.ok(afterBatch.ids.includes('session-pair-a') && afterBatch.ids.includes('session-pair-b'))

// ---------------------------------------------------------------------------
// 3. Artifact preview and removal ride on the companion plugin
// ---------------------------------------------------------------------------

const artifactDir = await seedSession('session-with-files')
const producedA = path.join(WORK, 'report.md')
const producedB = path.join(WORK, 'script.py')
await fs.writeFile(producedA, 'abc', 'utf8')
await fs.writeFile(producedB, 'abc', 'utf8')
globalThis.__artifactPlan['session-with-files'] = [producedA, producedB]
records.push({ header: { id: 'session-with-files', createdAt: 5, cwd: WORK, origin: 'root' }, live: false, persisted: true })
workspaces[0].sessionIds.push('session-with-files')

const preview = await call('/api/session-batch.preview-artifacts', { sessionIds: ['session-with-files'] })
assert.equal(preview.status, 200, JSON.stringify(preview.body))
assert.equal(preview.body.available, true, 'the companion plugin must be detected')
assert.equal(preview.body.totals.files, 2)
assert.equal(preview.body.totals.bytes, 6)
assert.deepEqual(preview.body.sessions[0].files.map((file) => file.path).sort(), [producedA, producedB].sort())

const withFiles = await call('/api/session-batch.delete', { sessionIds: ['session-with-files'], includeArtifacts: true })
assert.equal(withFiles.status, 200, JSON.stringify(withFiles.body))
assert.equal(withFiles.body.artifacts.removed, 2, 'both produced files must be removed')
assert.equal(await dirExists(artifactDir), false, 'the log directory must be gone too')
assert.equal(await fileExists(producedA), false, 'the produced report must be deleted')
assert.equal(await fileExists(producedB), false, 'the produced script must be deleted')

// ---------------------------------------------------------------------------
// 4. A subagent session's own artifacts go too
// ---------------------------------------------------------------------------

const parentDir = await seedSession('session-parent')
await seedSession('session-child-a')
const parentFile = path.join(WORK, 'parent.md')
const childFile = path.join(WORK, 'child.md')
await fs.writeFile(parentFile, 'abc', 'utf8')
await fs.writeFile(childFile, 'abc', 'utf8')
globalThis.__artifactPlan['session-parent'] = [parentFile]
globalThis.__artifactPlan['session-child-a'] = [childFile]
descendantsFor['session-parent'] = [
  { session: { header: { id: 'session-child-a', parentSession: 'session-parent', origin: 'subagent', cwd: WORK } }, descendants: [] },
]
records.push({ header: { id: 'session-parent', createdAt: 6, cwd: WORK, origin: 'root' }, live: false, persisted: true })
workspaces[0].sessionIds.push('session-parent')

const withChild = await call('/api/session-batch.delete', { sessionIds: ['session-parent'], includeArtifacts: true })
assert.equal(withChild.status, 200, JSON.stringify(withChild.body))
assert.equal(withChild.body.deleted[0].subagents, 1, 'the child session must be part of the group')
assert.equal(withChild.body.artifacts.removed, 2, 'parent and child artifacts must both be removed')
assert.equal(await fileExists(parentFile), false, 'parent artifact must be gone')
assert.equal(await fileExists(childFile), false, 'child artifact must be gone')
assert.equal(await dirExists(parentDir), false, 'parent log must be gone')

// ---------------------------------------------------------------------------
// 5. A file that resists removal is remembered for the next start
// ---------------------------------------------------------------------------

await seedSession('session-locked')
const lockedFile = path.join(WORK, 'locked.txt')
await fs.writeFile(lockedFile, 'abc', 'utf8')
globalThis.__artifactPlan['session-locked'] = [lockedFile]
records.push({ header: { id: 'session-locked', createdAt: 7, cwd: WORK, origin: 'root' }, live: false, persisted: true })
workspaces[0].sessionIds.push('session-locked')

const withLocked = await call('/api/session-batch.delete', { sessionIds: ['session-locked'], includeArtifacts: true })
assert.equal(withLocked.status, 207, JSON.stringify(withLocked.body))
assert.equal(withLocked.body.artifacts.removed, 0)
assert.equal(withLocked.body.artifacts.pendingFiles, 1, 'the stuck file must be queued')
assert.equal(await fileExists(lockedFile), true, 'a file that resisted removal is left alone')
const manifest = JSON.parse(await fs.readFile(path.join(STATE, 'pending.json'), 'utf8'))
const lockedEntry = manifest.entries.find((item) => item.id === 'session-locked')
assert.ok(lockedEntry, 'the session must stay in the retry manifest')
assert.equal(lockedEntry.artifactRetry.length, 1, 'the stuck path must be remembered with its workspace')
assert.equal(lockedEntry.artifactRetry[0].cwd, WORK)

// ---------------------------------------------------------------------------
// 6. A session that refuses to stop is not deleted
// ---------------------------------------------------------------------------

clearsOnStop = false
activity.set('session-running', [{ kind: 'turn' }])
const refused = await call('/api/session-batch.delete', { sessionIds: ['session-running'] })
assert.equal(refused.status, 207, JSON.stringify(refused.body))
assert.match(refused.body.failed[0].error, /仍在运行/)
assert.equal(await dirExists(runningDir), true, 'a refused purge leaves the log untouched')
const pendingAfterRefusal = JSON.parse(await fs.readFile(path.join(STATE, 'pending.json'), 'utf8'))
assert.ok(
  !pendingAfterRefusal.entries.some((entry) => entry.id === 'session-running'),
  'a refusal must not leave a pending entry for that session',
)

// ---------------------------------------------------------------------------
// 7. Once the work stops, the same session goes through
// ---------------------------------------------------------------------------

clearsOnStop = true
const done = await call('/api/session-batch.delete', { sessionIds: ['session-running'] })
assert.equal(done.status, 200, JSON.stringify(done.body))
assert.equal(await dirExists(runningDir), false, 'the stopped session must be removed')
assert.ok(calls.stopped.includes('session-running'), 'the stop seam must be used')

// ---------------------------------------------------------------------------
// 8. Input guards
// ---------------------------------------------------------------------------

assert.equal((await call('/api/session-batch.delete', { sessionIds: [] })).status, 400)
assert.equal((await call('/api/session-batch.delete', { sessionIds: ['../etc'] })).status, 400, 'path-ish ids are rejected')
const tooMany = Array.from({ length: 201 }, (_, index) => `session-${index}`)
assert.equal((await call('/api/session-batch.delete', { sessionIds: tooMany })).status, 400, 'batch size is capped')
assert.equal((await call('/api/session-batch.preview-artifacts', { sessionIds: [] })).status, 400)

// ---------------------------------------------------------------------------
// 9. Concurrent state writes neither collide nor lose entries
// ---------------------------------------------------------------------------

// A startup retry pass and a user batch can write at the same time. Before the
// write queue existed this produced `ENOENT ... rename pending.json.<pid>.tmp`.
const state = module.__testing
assert.ok(state, 'the state helpers must be exposed for this test')

await Promise.all(Array.from({ length: 25 }, (_, index) =>
  state.upsertPending({ id: `race-${index}`, sessionIds: [`race-${index}`], createdAt: Date.now() })))
const afterConcurrent = await state.readManifest()
assert.equal(
  afterConcurrent.filter((entry) => String(entry.id).startsWith('race-')).length,
  25,
  'concurrent upserts must all survive',
)

await Promise.all(Array.from({ length: 25 }, (_, index) => state.removePending(`race-${index}`)))
assert.equal(
  (await state.readManifest()).filter((entry) => String(entry.id).startsWith('race-')).length,
  0,
  'concurrent removals must all apply',
)

await Promise.all(Array.from({ length: 25 }, (_, index) => state.addRemoved([`race-tombstone-${index}`])))
assert.equal(
  (await state.readRemoved()).filter((id) => String(id).startsWith('race-tombstone-')).length,
  25,
  'concurrent tombstone writes must all survive',
)

// Dispose the plugin first: its startup timer writes state and would otherwise
// race the cleanup below (which is exactly what it is designed to survive).
for (const cleanup of cleanups.reverse()) {
  try { cleanup() } catch { /* ignore */ }
}
await fs.rm(HOME, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
console.log('host: all scenarios passed')
