/**
 * Edit a DSH profile's package.json without touching anything else.
 *
 * Verbs:
 *   set-dep    <manifest> <name> <spec>
 *   remove-dep <manifest> <name>
 *   add-bundle <manifest> <name> [afterName]
 *   remove-bundle <manifest> <name>
 *   show       <manifest>
 *
 * Used by the stop-time install scripts so their PowerShell side needs no JSON
 * handling. A UTF-8 BOM is tolerated, because editors on Windows add one.
 */
import fs from 'node:fs'

const [verb, file, name, extra] = process.argv.slice(2)
if (!verb || !file) {
  console.error('usage: node edit-manifest.mjs <verb> <package.json> [name] [extra]')
  process.exit(2)
}

const pkg = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
pkg.dependencies = pkg.dependencies || {}
pkg.dsh = pkg.dsh || {}
pkg.dsh.profile = pkg.dsh.profile || {}
const bundles = Array.isArray(pkg.dsh.profile.bundles) ? pkg.dsh.profile.bundles : []
pkg.dsh.profile.bundles = bundles

switch (verb) {
  case 'set-dep': {
    if (!name || extra === undefined) throw new Error('set-dep needs <name> <spec>')
    pkg.dependencies[name] = extra
    console.log(`dep ${name} = ${extra}`)
    break
  }
  case 'remove-dep': {
    if (!name) throw new Error('remove-dep needs <name>')
    if (name in pkg.dependencies) {
      delete pkg.dependencies[name]
      console.log(`dep ${name} removed`)
    } else {
      console.log(`dep ${name} was not present`)
    }
    break
  }
  case 'add-bundle': {
    if (!name) throw new Error('add-bundle needs <name>')
    if (bundles.includes(name)) {
      console.log(`bundle ${name} already listed`)
    } else if (extra && bundles.includes(extra)) {
      bundles.splice(bundles.indexOf(extra) + 1, 0, name)
      console.log(`bundle ${name} inserted after ${extra}`)
    } else {
      bundles.push(name)
      console.log(`bundle ${name} appended`)
    }
    break
  }
  case 'remove-bundle': {
    if (!name) throw new Error('remove-bundle needs <name>')
    const at = bundles.indexOf(name)
    if (at >= 0) {
      bundles.splice(at, 1)
      console.log(`bundle ${name} removed`)
    } else {
      console.log(`bundle ${name} was not listed`)
    }
    break
  }
  case 'show': {
    console.log(JSON.stringify({ dependencies: pkg.dependencies, bundles }, null, 2))
    break
  }
  default:
    throw new Error(`unknown verb ${verb}`)
}

fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8')
