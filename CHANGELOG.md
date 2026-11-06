# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.2] - 2026-11-06

### Fixed

- **Concurrent state writes could fail with `ENOENT`.** The startup retry pass
  (`retryPending`, on a 3 s timer) and a user batch can write the pending
  manifest at the same time; because the atomic-write temp name was unique per
  process rather than per write, the loser of the race found its temp file
  already renamed away. Reproduced in CI on three of four matrix legs. Temp names
  are now unique per write, and every state read-modify-write is serialised
  through a queue.
- Test teardown raced the plugin's own timer, which could leave the temporary
  `$DSH_HOME` behind; the suite now disposes the plugin before cleaning up.

### Changed

- Suites run through `scripts/run-tests.mjs`, which re-emits the tail of a
  failing suite as GitHub annotations so a failure is readable from the checks
  API; CI matrix is now node 20 and 24 on Linux and Windows.

## [0.2.1] - 2026-11-05

### Added

- A second test suite for the client half, driven by a miniature React and a stub
  `fetch`, so `npm test` covers rendering without any dependency or harness.

### Fixed

- A `file:` dependency can keep stale hardlinked code while reporting a new
  version; the install script now force-copies the runtime files and verifies
  their SHA-256 against the source.
- Artifacts produced by subagent sessions were not removed together with the
  parent conversation.
- A workspace file that resisted removal could never be retried once its session
  log was gone. Pending entries now remember the path, size and workspace.
- The startup retry pass lost the `includeArtifacts` flag, so a queued deletion
  could fall back to chat-only.
- `removeArtifacts` counts are accepted as either an array or a number.
- The confirm button now says how many files will be deleted once the artifact
  option is ticked.
- Queued retry paths are deduplicated by `path|cwd`.

## [0.2.0] - 2026-11-05

### Added

- Optional artifact deletion: one checkbox in the confirm dialog removes the
  files a conversation produced, previewed with count and total size. Attribution
  and removal are delegated to `dsh-session-artifacts`; nothing is re-implemented.
- `POST /api/session-batch.preview-artifacts` for the pre-deletion preview.

## [0.1.0] - 2026-11-04

### Added

- Sidebar panel listing conversations by workspace with honest status badges:
  `Running` from `workspace/session-activity`, `In memory` for a Session the host
  still holds.
- Multi-select batch deletion of chat records, one request per batch.
- Deletion pipeline: stop work through the official seams (refusing with zero
  side effects when a session will not stop), detach workspace accounting, remove
  logs, verify on disk with retries, tombstone the id, queue what could not be
  finished for the next start.
- Host-side test suite covering the pipeline against stub services.

[Unreleased]: https://github.com/ajsney764-blip/dsh-session-batch/compare/v0.2.2...HEAD
[0.2.2]: https://github.com/ajsney764-blip/dsh-session-batch/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/ajsney764-blip/dsh-session-batch/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/ajsney764-blip/dsh-session-batch/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/ajsney764-blip/dsh-session-batch/releases/tag/v0.1.0
