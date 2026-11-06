# dsh-session-batch

[![CI](https://github.com/ajsney764-blip/dsh-session-batch/actions/workflows/ci.yml/badge.svg)](https://github.com/ajsney764-blip/dsh-session-batch/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![DSH](https://img.shields.io/badge/DSH-0.2.x-brightgreen)](https://github.com/deepseek-ai/deepseek-harness)

[English](README.md) | [中文](README.zh-CN.md)

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) plugin that adds a sidebar panel for **deleting the chat records of many conversations at once**, optionally **together with the files each conversation produced**, and that reports an **honest session status**: actually running versus merely kept in host memory.

> Deletion is permanent. Nothing goes to a recycle bin.

## Why this exists

The harness ships archive, not delete: the persistence seam deliberately offers no removal API, so session logs accumulate under `$DSH_HOME/sessions` forever. And its sidebar cannot tell you why a conversation looks "in use" — a session that was merely *opened once* stays in host memory for the life of the process, which no page refresh clears.

Artifact attribution — working out which workspace files a conversation actually produced — is a separate, much harder problem, and [`dsh-session-artifacts`](https://github.com/ShirohaChan/dsh-session-artifacts) already solves it well (create-only evidence, per-command time windows, cross-session uniqueness, DSH-home and package fences). This plugin does **not** re-implement any of that. When that plugin is installed, this one delegates to its exported functions verbatim.

## Features

- **Batch deletion of chat records** — tick any number of conversations in one panel and delete them in a single request: session logs, subagent records, workspace membership, pin and archive markers.
- **Optional artifact removal** — one checkbox in the confirm dialog deletes the files those conversations produced, including files produced by their subagent sessions. The list and total size are shown before anything is removed.
- **Honest status badges** — `Running` (a turn, owned jobs, subagents or scheduled reminders are active, read from the harness' own `workspace/session-activity` waterfall) versus `In memory` (the host still holds the Session object; refreshing will not change it, restarting the app will).
- **Deletion that can be trusted** — every log directory is verified gone on disk, a running session that refuses to stop aborts the whole operation with zero side effects, purged ids are tombstoned so the panel agrees with reality, and anything that could not be removed is queued and retried on the next start.

## Requirements

- DSH `0.2.x` with the `connection`, `sessionQuery` and `workspaceRegistry` services (every shipped web composition has them).
- Optional: [`dsh-session-artifacts`](https://github.com/ShirohaChan/dsh-session-artifacts) `>= 0.7.0` for artifact removal. Without it the artifact checkbox is hidden and only chat records are deleted.

## Install

```sh
# from npm (once published)
dsh plugin --profile <profile> add dsh-session-batch

# from a local checkout
dsh plugin --profile <profile> add <absolute-path-to-this-repo>
```

Then **fully restart DSH**: host-side code is only loaded at startup.

### Windows helper for the Desktop app

The Desktop shell owns its profile exclusively, so `dsh plugin` refuses to touch it. `scripts/install-when-closed.ps1` performs the swap while the app is closed and verifies the result:

```powershell
# fully quit DeepSeek Harness first
pwsh -ExecutionPolicy Bypass -File scripts/install-when-closed.ps1 -WaitForExit
```

It edits the profile manifest, runs the bundled pnpm, force-syncs the runtime files, checks their SHA-256 against the source, and restarts the app. `scripts/rollback-when-closed.ps1` reverts to the manifest it backed up.

## Usage

1. Open **Batch purge** in the sidebar.
2. Press **Select**, tick conversations (or use *Select all*), then press **Delete records of N selected**.
3. In the dialog:
   - **Chat records only** (default) — logs, subagent records, workspace membership.
   - Tick **Also delete the files these conversations produced (N · size)** to remove their workspace artifacts as well. The file list is shown first.
4. Confirm. Single conversations can be deleted from their own row without entering selection mode.

## How deletion works

```
stop work ─► detach workspace ─► remove artifacts ─► remove logs ─► drop cache ─► tombstone
 (official seams)                (companion plugin)   (verified)     (best effort)
```

- **Stop first.** `workspace/session-activity` is asked whether the session does work; if it does, `workspace/session-stop` is invoked and the answer is polled for up to 8 seconds. Still busy? The purge is refused and **nothing** is touched.
- **Remove artifacts first**, while the logs still exist to attribute from. Each session in the group (root and every subagent) is asked separately through `dsh-session-artifacts`; the union is deduped by path.
- **Verify the logs are gone.** A session held in host memory can recreate its directory right after a successful `rm`, so the removal is re-checked on disk and retried up to four times. Whatever still comes back is queued in `$DSH_HOME/session-batch/pending.json` and retried on the next start — files by path, since by then the log is gone.
- **Tombstones.** Purged ids are written to `$DSH_HOME/session-batch/removed.json` and hidden from the panel until the host genuinely forgets them. If the host still lists an id, the panel says so instead of pretending the deletion failed.
- **Only session directories are touched directly.** Ids containing `/`, `\`, `.` or `..` are rejected; one request handles at most 200 sessions.

## Compatibility matrix

| Resource | this plugin | dsh-session-artifacts |
|---|---|---|
| Sidebar panel | `sidebar.panellist` id `session-batch`, `main` key `session-batch` | none |
| Session row menu | unused | `sidebar.workspaces.session.menu.item` id `dsh-session-artifacts.delete` |
| Host services | `connection`, `sessionQuery`, `workspaceRegistry` | `webServer`, `sessionPersistence`, `agents` |

No slot or service is contested, so both can be installed together. The only overlap is that both can remove a session record; whichever runs first wins and the other finds nothing to do.

## What is never deleted

- Files a conversation only **delivered** (`present` without creating them).
- Files it merely **edited or rewrote**.
- Files that fall inside another session's command window too (ambiguous → claimed by neither).
- Anything under `$DSH_HOME`.

These are `dsh-session-artifacts`' rules, inherited by delegation, and they are deliberate: a conversation that handed you a file you already owned must not make that file disposable.

## Known limitations

- A Session that was already open cannot be released — the harness exposes no release call. Deleting such a conversation removes its log immediately and hides its row here, but the harness' **own** sidebar keeps the row until the app restarts.
- Retro-attribution needs the log. Once a log is gone, its queued files can only be retried by path.
- The batch cap is 200 sessions per request.
- Deleting from a second browser tab that still has the conversation open can recreate the log; close it first.

## Development

```sh
npm test          # both suites, no dependencies required
npm run test:host # route-level behaviour against stub services
npm run test:client # render-level behaviour against a miniature React
```

Both suites run with nothing but Node: the host suite points `$DSH_HOME` at a temporary directory and stubs the harness services, while the client suite supplies a tiny React implementation plus a stub `fetch` and drives real render passes. Neither needs DSH installed, which is why CI can run them on Linux and Windows.

See [`docs/architecture.md`](docs/architecture.md) for the design and invariants, and [`docs/self-review.md`](docs/self-review.md) for the defect log from the review pass that produced 0.2.1.

## License

[MIT](LICENSE)
