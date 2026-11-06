# Security policy

## What this plugin can do to your machine

It deletes things, permanently:

- session log directories under `$DSH_HOME/sessions/<project>/<sessionId>`
- workspace files, **only** when you tick the artifact checkbox, **only** the
  files `dsh-session-artifacts` attributes to that conversation
- workspace accounting entries (membership, pin, archive markers)

It never touches anything under `$DSH_HOME` as an *artifact*, never deletes a
directory as a file, and never follows a symlink out of the workspace. There is
no recycle bin and no undo.

## Trust boundaries

- The browser half can only send session ids and booleans. Paths are never
  accepted from it; attribution is recomputed on the host.
- Routes are registered through the harness' authenticated `connection` channel.
- Session ids containing `/`, `\`, `.` or `..` are rejected before any
  filesystem call.
- The privileged work happens in the host process, with the permissions of the
  user running DSH.

## Reporting a vulnerability

Open a private security advisory on this repository (Security → Advisories →
Report a vulnerability) rather than a public issue.

Please include:

- the version (`package.json`) and the DSH build it ran on
- a minimal description of the path that misbehaves — for example an input that
  makes the plugin delete something outside the workspace, or a request that
  bypasses the opt-in for artifact deletion

Anything that could delete a file the user did not ask for is treated as a
vulnerability, not a bug.
