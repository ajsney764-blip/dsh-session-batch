/**
 * Client-side tests.
 *
 * The real client runtime only exists inside the harness, so this file supplies
 * the two things a render needs: a miniature React (elements, hooks, an
 * effect/flush loop) and a stub `fetch` for the three host routes. It then
 * drives real render passes and asserts on what the user would see.
 *
 * Run: node test/client.test.mjs   (no dependencies required)
 */
import assert from 'node:assert/strict'

// ---------------------------------------------------------------------------
// Miniature React
// ---------------------------------------------------------------------------

let currentHooks = null
const hookStore = new Map()
let dirty = false
const pendingEffects = []

const React = {
  Fragment: Symbol('Fragment'),
  createElement(type, props, ...children) {
    const flat = children.length === 0 ? undefined : children.length === 1 ? children[0] : children
    return { type, props: { ...(props || {}), children: flat } }
  },
  useState(initial) {
    const hooks = currentHooks
    const index = hooks.index++
    if (!(index in hooks.values)) hooks.values[index] = typeof initial === 'function' ? initial() : initial
    const set = (next) => {
      const value = typeof next === 'function' ? next(hooks.values[index]) : next
      if (value === hooks.values[index]) return
      hooks.values[index] = value
      dirty = true
    }
    return [hooks.values[index], set]
  },
  useEffect(effect, deps) {
    const hooks = currentHooks
    const index = hooks.index++
    const previous = hooks.deps[index]
    const same = Array.isArray(deps) && Array.isArray(previous) &&
      deps.length === previous.length && deps.every((value, at) => Object.is(value, previous[at]))
    if (previous !== undefined && same) return
    hooks.deps[index] = deps
    pendingEffects.push(effect)
  },
  useRef(initial) {
    const hooks = currentHooks
    const index = hooks.index++
    if (!(index in hooks.values)) hooks.values[index] = { current: initial }
    return hooks.values[index]
  },
}

function renderNode(node, path) {
  if (node === null || node === undefined || node === false || node === true) return null
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map((child, at) => renderNode(child, `${path}/${at}`)).filter((child) => child !== null)
  const { type, props } = node
  if (typeof type === 'function') {
    const key = `${path}#${type.name || 'anon'}`
    let hooks = hookStore.get(key)
    if (!hooks) {
      hooks = { values: [], deps: [], index: 0 }
      hookStore.set(key, hooks)
    }
    hooks.index = 0
    const previous = currentHooks
    currentHooks = hooks
    try {
      return renderNode(type(props || {}), key)
    } finally {
      currentHooks = previous
    }
  }
  if (type === React.Fragment) return renderNode(props.children, path)
  const { children, ...rest } = props || {}
  return { type, props: rest, children: renderNode(children, `${path}>`) }
}

async function drive(root, passes = 24) {
  let tree = null
  for (let pass = 0; pass < passes; pass += 1) {
    dirty = false
    pendingEffects.length = 0
    tree = renderNode(root, 'root')
    if (pendingEffects.length === 0) break
    for (const effect of pendingEffects) {
      const cleanup = effect()
      if (typeof cleanup === 'function') void cleanup
    }
    for (let tick = 0; tick < 8; tick += 1) await new Promise((resolve) => setTimeout(resolve, 0))
    if (!dirty) break
  }
  return tree
}

function resetMount() {
  hookStore.clear()
  dirty = false
  pendingEffects.length = 0
}

// ---------------------------------------------------------------------------
// Element helpers
// ---------------------------------------------------------------------------

function walk(node, visit) {
  if (node === null || node === undefined || typeof node === 'string') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  visit(node)
  walk(node.children, visit)
}

function textOf(node) {
  let out = ''
  const collect = (value) => {
    if (value === null || value === undefined) return
    if (typeof value === 'string') { out += value; return }
    if (Array.isArray(value)) { for (const child of value) collect(child); return }
    collect(value.children)
  }
  collect(node)
  return out
}

function buttons(node) {
  const found = []
  walk(node, (element) => {
    if (element.type === 'button' && element.props && typeof element.props.onClick === 'function') found.push(element)
  })
  return found
}

function buttonByText(node, needle) {
  const match = buttons(node).find((element) => textOf(element).includes(needle))
  assert.ok(match, `button containing "${needle}" not found; buttons: ${buttons(node).map((b) => textOf(b)).join(' | ')}`)
  return match
}

function checkboxes(node) {
  const found = []
  walk(node, (element) => {
    if (element.type === 'input' && element.props && element.props.type === 'checkbox') found.push(element)
  })
  return found
}

/** Every checkbox together with the text of the label that owns it. */
function labelledCheckboxes(node) {
  const found = []
  walk(node, (element) => {
    if (element.type !== 'label') return
    const labelText = textOf(element)
    walk(element, (child) => {
      if (child.type === 'input' && child.props && child.props.type === 'checkbox') found.push({ text: labelText, input: child })
    })
  })
  return found
}

// ---------------------------------------------------------------------------
// Harness stubs
// ---------------------------------------------------------------------------

const ROUTES = {
  list: 'api/session-batch.list',
  delete: 'api/session-batch.delete',
  preview: 'api/session-batch.preview-artifacts',
}
const deleteBodies = []
let listPayload = { ok: true, groups: [], orphans: [], orphanSubagents: [], totals: { sessions: 0, bytes: 0, pending: 0, awaitingRestart: 0 } }
let artifactPayload = {
  ok: true,
  available: true,
  sessions: [{ sessionId: 'session-a', cwd: 'E:\\w', files: [{ path: 'E:\\w\\report.md', display: 'report.md', bytes: 1536, source: 'write' }], skipped: 0 }],
  totals: { files: 1, bytes: 1536 },
}

globalThis.fetch = async (url, init) => {
  const body = init && init.body ? JSON.parse(init.body) : undefined
  if (url === ROUTES.list) return { ok: true, status: 200, text: async () => JSON.stringify(listPayload) }
  if (url === ROUTES.preview) return { ok: true, status: 200, text: async () => JSON.stringify(artifactPayload) }
  if (url === ROUTES.delete) {
    deleteBodies.push(body)
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        ok: true,
        deleted: body.sessionIds.map((sessionId) => ({ sessionId, subagents: 0, pending: 0 })),
        failed: [],
        artifacts: body.includeArtifacts ? { removed: 1, bytes: 1536 } : { removed: 0, bytes: 0 },
        warnings: [],
      }),
    }
  }
  throw new Error(`unexpected fetch ${url}`)
}

const slots = new Map()
const localeDict = new Map()
const ctx = {
  effect(fn) { return fn() },
  slots: {
    inject(name, factory) { factory() },
    register(options, component) { slots.set(`${options.name}:${options.id || options.key}`, component); return () => {} },
  },
  locale: {
    register(ns, lang, dict) { localeDict.set(`${ns}:${lang}`, dict); return () => {} },
    subscribe() { return () => {} },
    bind(ns) {
      return (key) => {
        const dict = localeDict.get(`${ns}:zh`) || {}
        return Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : key
      }
    },
  },
}

let captured = null
globalThis.window = { __ModuleLoader__: { load(spec) { captured = spec } } }
globalThis.document = {
  addEventListener() {},
  removeEventListener() {},
  body: { style: {} },
  createElement() { return { style: {}, setAttribute() {}, appendChild() {} } },
}

await import('../client.js')
assert.ok(captured, 'client.js did not register through __ModuleLoader__')
assert.equal(captured.id, 'dsh-session-batch', 'module id must match the package name')
const module = captured.factory((name) => {
  if (name === 'react') return React
  throw new Error(`unexpected require(${name})`)
})
assert.deepEqual(module.inject, ['slots', 'locale'])
module.apply(ctx)

const Panel = slots.get('main:session-batch')
assert.ok(Panel, 'the main panel slot was not registered')
assert.ok(slots.get('sidebar.panellist:session-batch'), 'the sidebar entry was not registered')

// ---------------------------------------------------------------------------
// 1. Status badges and hints
// ---------------------------------------------------------------------------

listPayload = {
  ok: true,
  groups: [{
    id: 'ws-1',
    title: 'Deepseekworkspace',
    path: 'E:\\Deepseekworkspace',
    sessions: [
      { id: 'session-a', title: '正在干活', createdAt: 1, cwd: 'E:\\w', kind: 'root', live: true, running: true, persisted: true, sizeBytes: 2048 },
      { id: 'session-b', title: '只是打开过', createdAt: 2, cwd: 'E:\\w', kind: 'root', live: true, running: false, persisted: true, sizeBytes: 1024 },
      { id: 'session-c', title: '纯磁盘对话', createdAt: 3, cwd: 'E:\\w', kind: 'root', live: false, running: false, persisted: true, sizeBytes: 512 },
    ],
  }],
  orphans: [],
  orphanSubagents: [],
  totals: { sessions: 3, bytes: 3584, pending: 1, awaitingRestart: 2 },
}

resetMount()
let tree = await drive(React.createElement(Panel))
const text = textOf(tree)
assert.ok(text.includes('正在干活'), 'rows must render')
assert.ok(text.includes('运行中'), 'a busy session is labelled 运行中')
assert.ok(text.includes('内存中'), 'an idle live session is labelled 内存中')
assert.ok(!text.includes('使用中'), 'the misleading label must be gone')
assert.ok(text.includes('2 个已删除的对话仍留在宿主内存中'), 'the awaitingRestart hint must render')
assert.ok(text.includes('1 个删除任务将在下次启动时继续清理'), 'the pending hint must render')
assert.equal(checkboxes(tree).length, 0, 'checkboxes stay hidden until selection mode')

// ---------------------------------------------------------------------------
// 2. Multi-select, then a batch that opts into artifact deletion
// ---------------------------------------------------------------------------

buttonByText(tree, '多选').props.onClick()
tree = await drive(React.createElement(Panel))
assert.equal(checkboxes(tree).length, 3, 'one checkbox per row')
assert.ok(textOf(tree).includes('已选 0 个'))

buttonByText(tree, '全选').props.onClick()
tree = await drive(React.createElement(Panel))
assert.ok(textOf(tree).includes('已选 3 个'))

checkboxes(tree)[0].props.onChange()
tree = await drive(React.createElement(Panel))
assert.ok(textOf(tree).includes('已选 2 个'))

buttonByText(tree, '删除选中的 2 个聊天记录').props.onClick()
tree = await drive(React.createElement(Panel), 40)
assert.ok(textOf(tree).includes('删除聊天记录'), 'the confirm dialog opens')
assert.ok(textOf(tree).includes('工作区里的文件不会被碰'), 'the dialog states its default scope')
assert.ok(textOf(tree).includes('同时删除这些对话产出的文件'), 'the artifact option is offered')
assert.ok(textOf(tree).includes('report.md'), 'the produced file is listed before anything happens')

const artifactToggle = labelledCheckboxes(tree).find((item) => item.text.includes('同时删除'))
assert.ok(artifactToggle, 'the artifact checkbox must exist inside its label')
assert.notEqual(artifactToggle.input.props.disabled, true, 'the artifact checkbox must be clickable')
artifactToggle.input.props.onChange()
tree = await drive(React.createElement(Panel), 40)
assert.ok(textOf(tree).includes('含 1 个文件'), 'the confirm label must mention the files once opted in')

deleteBodies.length = 0
buttonByText(tree, '永久删除 2 个对话(含 1 个文件)').props.onClick()
tree = await drive(React.createElement(Panel), 40)
assert.equal(deleteBodies.length, 1, 'a batch is one request')
assert.equal(deleteBodies[0].sessionIds.length, 2)
assert.equal(deleteBodies[0].includeArtifacts, true, 'the opt-in reaches the host')
assert.ok(textOf(tree).includes('已删除 2 个对话的聊天记录'), 'the summary reaches the toast')
assert.ok(textOf(tree).includes('并删除 1 个文件'), 'the artifact count reaches the toast')
assert.equal(checkboxes(tree).length, 0, 'selection mode ends after a batch')

// ---------------------------------------------------------------------------
// 3. A single row deletes just that row, and defaults to chat-only
// ---------------------------------------------------------------------------

resetMount()
tree = await drive(React.createElement(Panel))
buttonByText(tree, '删除记录').props.onClick()
tree = await drive(React.createElement(Panel), 40)
assert.ok(textOf(tree).includes('永久删除聊天记录'), 'the single confirm label')

deleteBodies.length = 0
buttonByText(tree, '永久删除聊天记录').props.onClick()
tree = await drive(React.createElement(Panel), 40)
assert.equal(deleteBodies.length, 1)
assert.deepEqual(deleteBodies[0].sessionIds, ['session-a'])
assert.equal(deleteBodies[0].includeArtifacts, false, 'artifact deletion is opt-in, never implicit')

// ---------------------------------------------------------------------------
// 4. Without the companion plugin the option is hidden, not broken
// ---------------------------------------------------------------------------

artifactPayload = { ok: true, available: false, sessions: [], totals: { files: 0, bytes: 0 } }
resetMount()
tree = await drive(React.createElement(Panel))
buttonByText(tree, '删除记录').props.onClick()
tree = await drive(React.createElement(Panel), 40)
assert.ok(textOf(tree).includes('未安装 dsh-session-artifacts'), 'the missing companion is explained')
assert.ok(!textOf(tree).includes('同时删除这些对话产出的文件'), 'no dead checkbox is offered')

console.log('client: all scenarios passed')
