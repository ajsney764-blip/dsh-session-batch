/**
 * Print the `version` field of a package.json, or exit non-zero.
 *
 * Usage: node read-version.mjs <package.json>
 */
import fs from 'node:fs'

const [file] = process.argv.slice(2)
if (!file) {
  console.error('usage: node read-version.mjs <package.json>')
  process.exit(2)
}

try {
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
  console.log(String(pkg.version || ''))
} catch (error) {
  console.error(String(error && error.message ? error.message : error))
  process.exit(3)
}
