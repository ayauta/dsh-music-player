/**
 * The bundle must *load*, not just parse.
 *
 * `npm run check` parses `client.js`; it never runs it. On 2026-11-15 a comment
 * inside the stylesheet template grew a backtick — the template ended early, the
 * rest of the CSS was parsed as JavaScript, and because the mangled code happened
 * to still be syntactically valid, `node --check` was happy. At runtime the
 * factory threw (`ReferenceError: vol is not defined`) before it could register a
 * single slot, so the whole plugin vanished from the host UI — no 音乐 entry, no
 * mini player — and only a restart showed it.
 *
 * This test runs the real bundle against a stub React and a stub `ctx`: it proves
 * the module registers, its factory returns the inject/apply pair, and applying it
 * injects the four slots. It cannot prove the components render (that needs the
 * host's real React and DOM), but it is the cheapest thing that would have caught
 * "the plugin is not there at all".
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { runInThisContext } from 'node:vm'

const repo = fileURLToPath(new URL('..', import.meta.url))
const source = readFileSync(join(repo, 'client.js'), 'utf8')

/** The four surfaces the host mounts; a missing one is a missing feature. */
const SLOTS = ['sidebar.footer.action', 'sidebar.panellist', 'main', 'settings.section']

function loadBundle () {
  let captured = null
  const raf = (fn) => setTimeout(() => fn(0), 0)
  globalThis.window = {
    __ModuleLoader__: { load: (mod) => { captured = mod } },
    addEventListener () {}, removeEventListener () {},
    requestAnimationFrame: raf, cancelAnimationFrame: (id) => clearTimeout(id),
    matchMedia: () => ({ matches: false, addEventListener () {}, removeEventListener () {} }),
    localStorage: { getItem: () => null, setItem () {} },
    location: { href: 'http://127.0.0.1/' },
  }
  globalThis.document = {
    createElement: () => ({ style: {}, setAttribute () {}, appendChild () {}, addEventListener () {} }),
    querySelector: () => null, querySelectorAll: () => [], addEventListener () {}, removeEventListener () {},
    body: { appendChild () {} }, head: { appendChild () {} },
    documentElement: { dataset: {}, style: {} },
  }
  globalThis.requestAnimationFrame = raf
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
  globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) })
  runInThisContext(source, { filename: 'client.js' })
  return captured
}

/** Just enough React for a class component and the hooks the module destructures. */
class FakeComponent {
  constructor (props) { this.props = props; this.state = {} }
  setState (patch) { this.state = { ...this.state, ...patch } }
  render () { return null }
}

function stubReact () {
  return {
    Component: FakeComponent,
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    createRef: () => ({ current: null }),
    useState: (value) => [typeof value === 'function' ? value() : value, () => {}],
    useEffect: () => {},
    useLayoutEffect: () => {},
    useRef: (value) => ({ current: value }),
    useCallback: (fn) => fn,
    useSyncExternalStore: (subscribe, get) => get(),
  }
}

function stubContext (injected) {
  const noop = () => {}
  return {
    effect: noop,
    layout: { selectPanel: noop },
    locale: { bind: () => (key) => key },
    uiWorkspace: undefined,
    slots: {
      inject: (name, cell) => { injected.push({ name, cell: cell() }) },
      register: (spec, Component) => ({ spec, Component }),
    },
    addToPlaylist: noop, albumCover: () => null, cover: () => null, edit: noop, editAlbum: noop,
    enqueue: noop, favorite: noop, noPlaylists: noop, playNext: noop, playNow: noop,
    remove: noop, removeHint: noop, reveal: noop, unfavorite: noop,
  }
}

/**
 * A shallow renderer: it calls function components and walks what they return, so
 * a throw in a component body is a test failure rather than a blank cell at
 * runtime. Class components are instantiated and asked for `render()`.
 * No DOM: refs stay null and effects are not run.
 */
function walk (node, seen = { count: 0 }) {
  if (node === null || node === undefined || typeof node !== 'object' || seen.count > 300) return seen.count
  if (Array.isArray(node)) { for (const child of node) walk(child, seen); return seen.count }
  const { type, props } = node
  if (typeof type === 'function') {
    seen.count += 1
    const rendered = type.prototype instanceof FakeComponent
      ? new type(props).render()
      : type(props)
    walk(rendered, seen)
    return seen.count
  }
  walk(props?.children, seen)
  return seen.count
}

test('the bundle registers itself under the package name (DSH ui-plugin contract)', () => {
  // `references/ui-plugin.md`: "The browser artifact registers a lazy factory whose
  // id equals the package name." Only one place knows the name — package.json — so
  // the two cannot drift after a rename.
  const manifest = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'))
  const mod = loadBundle()
  assert.ok(mod !== null, 'client.js never called window.__ModuleLoader__.load')
  assert.equal(mod.id, manifest.name, 'the client factory id must equal the package name')
  assert.equal(typeof mod.factory, 'function')
})

test('the factory returns the inject manifest and apply(ctx) mounts every slot', () => {
  const mod = loadBundle()
  const exported = mod.factory((name) => {
    if (name === 'react') return stubReact()
    throw new Error(`client.js required something unexpected: ${name}`)
  })
  assert.ok(Array.isArray(exported?.inject), 'the module must declare the ctx members it needs')
  assert.deepEqual([...exported.inject].sort(), ['layout', 'locale', 'slots', 'uiWorkspace'],
    'the manifest is the module\'s interface to the host; changing it is a host-contract change')
  assert.equal(typeof exported?.apply, 'function', 'the module must expose apply(ctx)')

  const injected = []
  exported.apply(stubContext(injected))
  assert.deepEqual(injected.map((slot) => slot.name).sort(), [...SLOTS].sort(),
    'every slot the host mounts must be injected')
})

test('every injected cell renders without throwing (shallow, no DOM)', () => {
  const mod = loadBundle()
  const exported = mod.factory((name) => {
    if (name === 'react') return stubReact()
    throw new Error(`client.js required something unexpected: ${name}`)
  })
  const injected = []
  exported.apply(stubContext(injected))
  for (const { name, cell } of injected) {
    const Component = cell?.Component ?? cell
    assert.equal(typeof Component, 'function', `the ${name} cell registered no component`)
    let rendered = 0
    try {
      rendered = walk({ type: Component, props: {} })
    } catch (error) {
      assert.fail(`the ${name} cell throws while rendering: ${error?.message ?? error}`)
    }
    assert.ok(rendered >= 1, `the ${name} cell rendered a tree the walker never entered`)
  }
})

test('the stylesheet template is fenced exactly twice (no stray backtick)', () => {
  const lines = source.split('\n')
  const start = lines.findIndex((line) => line.includes('const CSS = `'))
  assert.ok(start >= 0, 'the stylesheet template is gone')
  let end = -1
  const offenders = []
  for (let i = start; i < lines.length; i++) {
    const line = lines[i]
    if (i > start && line.trim() === '`') { end = i; break }
    const body = i === start ? line.slice(line.indexOf('const CSS = `') + 'const CSS = `'.length) : line
    if (body.includes('`')) offenders.push(`${i + 1}: ${line.trim().slice(0, 70)}`)
  }
  assert.deepEqual(offenders, [],
    'a backtick inside the stylesheet ends the template early and the rest becomes JavaScript: '
    + 'that is exactly how the plugin stopped loading on 2026-11-15')
  assert.ok(end > start, 'the stylesheet template is never closed')
})
