# Contributing

Thanks for taking a look. This plugin deletes data, so the bar for changes is a
little higher than for a UI wrapper: a wrong path or a wrong attribution rule
destroys someone's work.

## Ground rules

- **Do not re-implement artifact attribution.** It belongs to
  [`dsh-session-artifacts`](https://github.com/ShirohaChan/dsh-session-artifacts)
  and is delegated through its exported functions. If you think the rules are
  wrong, raise it there first; this repository only decides *when* those
  functions run.
- **Never trust the client.** The browser may only send session ids and a
  boolean; every path and every rule is resolved on the host.
- **Refuse rather than half-do.** If a session will not stop, or the input cannot
  be fully validated, change nothing and say so.
- **Report what actually happened.** "Deleted" must mean the directory is gone
  from disk, verified after the fact.

## Development

```sh
npm test           # both suites, no dependencies required
npm run test:host  # host routes against stub services
npm run test:client# render passes against a miniature React
```

There is no build step: `index.js` and `client.js` are shipped as-is. The client
bundle registers itself through `window.__ModuleLoader__`, so keep that entry
point and the module id identical to the package name.

When touching the deletion pipeline, extend `test/host.test.mjs`. Useful stubs
that already exist there: a companion-plugin stub (via
`DSH_SESSION_BATCH_ARTIFACTS`), a session that refuses to stop, and a file that
resists removal.

## Commits and pull requests

- One logical change per commit; Conventional Commits prefixes (`feat:`, `fix:`,
  `docs:`, `chore:`) are welcome but not required.
- In the pull request, state what you deleted, what you verified, and which test
  scenario covers it.
- If the change alters a user-visible rule (what gets deleted), update
  `README.md` and `CHANGELOG.md` in the same pull request.

## Reporting a bug

Include: DSH version, Windows/macOS/Linux, what you clicked, what you expected,
what happened, and any relevant line from
`$DSH_HOME/session-batch/pending.json`. Do not paste conversation contents.
