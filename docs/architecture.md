# Architecture

## What this plugin owns, and what it deliberately does not

Two responsibilities, no more:

1. **A list that tells the truth** about whether a conversation does work right now.
2. **Deleting chat records in bulk**, verified on disk.

Workspace files are *not* re-implemented here. [`dsh-session-artifacts`](https://github.com/ShirohaChan/dsh-session-artifacts) already decides which files a conversation produced, and getting that wrong deletes a user's own work. This plugin calls it:

```js
const api = await loadArtifactsApi()            // import('dsh-session-artifacts')
const { files } = await api.discoverSessionArtifacts(options, sessionId)
await api.removeArtifacts(files, { cwd, sessionRoot, dshHome })
```

If that package is absent the capability is hidden rather than approximated. `DSH_SESSION_BATCH_ARTIFACTS` overrides the module specifier so the test suite can inject a stub; a path is turned into a `file:` URL, which Windows requires for dynamic import.

## Seams used

| Purpose | Seam | Why not something else |
|---|---|---|
| Is the session doing work? | `ctx.waterfall('workspace/session-activity', { sessionId }, …)` | Same source the archive admission rule reads. The harness' own sidebar projects a client-side notion of "running" that the host cannot trust. |
| Stop it | `ctx.workspaceRegistry.stopSessionActivity(id)` → `parallel('workspace/session-stop')` | The archive-grade stop path; a bare `agent.cancel()` leaves jobs, subagents and reminders alive. An unreadable activity answer is treated as *busy*, never as idle. |
| Where is the log? | `$DSH_HOME/sessions/<project>/<sessionId>` | The persistence seam has no delete API and its own contract says logs accumulate until removed externally. |
| Session corpus | `ctx.sessionQuery.listSessions()`, `traceSession()`, `readTitleSnapshots()` | Live-preferred and header-only, so listing never wakes a cold session. |
| Workspace accounting | `ctx.workspaceRegistry` `detachSession`, `unarchiveSession`, `unpinSession` | Registry-global sets are the durable truth for grouping, pinning and archiving. |
| Routes | `ctx.connection.fetch.register` | Authenticated, same-origin, and the same channel the harness' own UI uses. |

## Deletion pipeline

```
for each requested session group (root + subagents):
    stop work            activity → stop → poll ≤ 8s → refuse and change nothing
    detach accounting    workspace membership, archive flag, pin flag
    remove artifacts     per session, deduped by path, before logs disappear
    remove logs          rm -r, then re-check on disk, retry ≤ 4
    drop projection      best effort through storageDomain
    tombstone            removed.json, hidden until the host forgets the id
```

Invariants that the tests pin down:

- **Refusal is total.** If the root session will not stop, no log, file or marker is touched, and no pending entry is left behind.
- **A tombstone only outlives its usefulness.** An id is retired from `removed.json` once it is neither live, nor persisted, nor present on disk.
- **A failed file removal is still actionable.** Path, size and workspace are written into the pending entry (`artifactRetry`); the next start retries them by path, because the log is gone and re-attribution is impossible.
- **Opt-in is explicit.** `includeArtifacts` defaults to false on both sides: the client never sends it unless the user ticked the box, and the host never removes files otherwise.
- **Ids cannot steer paths.** `/`, `\`, `.`, `..` and empty ids are rejected before any filesystem call; batches are capped at 200.

## Why verification, not just `rm`

A Session that is still held in host memory can recreate its log directory moments after a successful `rm` — the writer is still attached. Reporting success after a single `rm` is therefore a lie in exactly the case users complain about. The pipeline re-checks the directory on disk, retries, and finally records what it could not finish.

The same reasoning drives the tombstone: `listSessions()` keeps reporting a purged session while its Session object lives, so without a tombstone the panel would show a row the user just deleted and look broken.

## Lifecycle notes

- One plugin instance owns two routes and a startup timer (`retryPending`, 3 s after load).
- Destructive work is serialised through a promise queue, so two browser tabs cannot interleave a stop and a remove.
- State lives in `$DSH_HOME/session-batch/`: `pending.json` (retries) and `removed.json` (tombstones). Both are plain JSON, written atomically through a temp file and a rename.
