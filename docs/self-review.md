# Self-review log (0.2.1)

A full pass over the implementation after 0.2.0, plus the defects it found and
fixed. Kept in the repository because the reasoning is more useful than the diff.

## Defects found and fixed

| # | Defect | Impact | Fix |
|---|---|---|---|
| 1 | **Deployment could keep stale code** | pnpm refreshes only `package.json` for a `file:` dependency; the code files under `node_modules` are hardlinks, and rewriting a source file replaces its inode, so the link keeps the old content. The app then runs the previous build while reporting the new version. | The install script force-copies all four runtime files, unlinks the target first (a hardlink cannot simply be overwritten while something holds it), retries on lock errors, and compares SHA-256 with the source. Marker checks (`includeArtifacts`, `artifactRetry`, `artifactToggle`) run afterwards. |
| 2 | **Subagent artifacts were left behind** | Only the root session was attributed, so files produced by child sessions survived a "delete conversation and files". | Every session in the group is attributed separately and the union is deduped by canonical path before removal. |
| 3 | **A file that failed removal could never be retried** | Failures were queued, but the next start had no log left to attribute from, so the queued file was unreachable. | Pending entries carry `artifactRetry: [{ path, bytes, cwd }]`; the startup pass retries them by path through the companion plugin, independent of the log. |
| 4 | **The retry pass dropped `includeArtifacts`** | A queued deletion could come back as chat-only. | The flag is persisted in the manifest entry and read back; re-attribution is skipped when the log is already gone. |
| 5 | `removed` return shape | A numeric count from a differently-shaped implementation would silently record zero files. | Both an array and a number are accepted. |
| 6 | Misleading confirm label | After opting into artifact deletion the button still said "delete chat records". | The label changes to "…(含 N 个文件)" / "and N files". |
| 7 | Retry paths could accumulate duplicates | Repeated failures stacked the same path. | Merged and deduped by `path\|cwd` before writing. |
| 8 | Test state leaked between scenarios | A pending entry from one scenario broke a later assertion. | The assertion targets the session under test instead of the whole manifest; no production change. |

## Things re-checked and found sound

- Artifact removal runs **before** log removal, so attribution still has its evidence.
- Refusal path: an unreadable `workspace/session-activity` answer counts as busy, and the operation changes nothing.
- Tombstone retirement requires the id to be unknown *and* absent from disk; a live session never loses its tombstone.
- Route registration uses the authenticated `connection` channel; both routes validate and cap their input.
- The client keeps `includeArtifacts` false unless the user ticks the box; the host never removes files on a chat-only request.
- Batch size, path-shaped ids, and unknown JSON bodies all produce clean 400s.

## Layout note for the reviewer

`test/host.test.mjs` stubs the companion plugin through `DSH_SESSION_BATCH_ARTIFACTS`, so the delegation contract (`discoverSessionArtifacts` / `removeArtifacts` returning `{ removed, failed, bytes, retry }`) is exercised for real, including a file that resists removal. `test/client.test.mjs` ships a miniature React rather than a dependency, so `npm test` runs with no install step on both Linux and Windows CI.
