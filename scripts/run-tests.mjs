/**
 * Cross-platform test runner.
 *
 * Runs each suite in its own process, prints everything, and — when a suite
 * fails — re-emits the tail of its output as GitHub annotations, so a failure
 * is readable from the checks API even without access to the raw job log.
 *
 * Usage: node scripts/run-tests.mjs
 */
import { spawnSync } from 'node:child_process'

const suites = [
  ['host', 'test/host.test.mjs'],
  ['client', 'test/client.test.mjs'],
]

let failed = 0

for (const [name, file] of suites) {
  const result = spawnSync(process.execPath, [file], { encoding: 'utf8' })
  const output = `${result.stdout || ''}${result.stderr || ''}`
  process.stdout.write(`--- ${name} (${file}) ---\n`)
  process.stdout.write(output.endsWith('\n') || output === '' ? output : `${output}\n`)

  if (result.error) {
    failed += 1
    console.log(`::error title=${name} suite could not start::${String(result.error.message)}`)
    continue
  }
  if (result.status !== 0) {
    failed += 1
    const tail = output.split('\n').map((line) => line.replace(/\r$/, '')).filter(Boolean).slice(-12)
    for (const line of tail) console.log(`::error title=${name} suite failed::${line}`)
  }
}

if (failed > 0) {
  console.log(`::error::${failed} of ${suites.length} suites failed`)
  process.exit(1)
}

console.log(`all ${suites.length} suites passed`)
