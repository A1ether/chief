import { createHash } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { runCommand } from './exec'
import type {
  LineageGraph,
  LineageNode,
  ManagerId,
  ManagerSnapshot,
  PackageItem
} from '../shared/types'
import type { CoreContext } from './env'

const LIB_NODE_MODULES = '/lib/node_modules'

/** 这些包本质是运行时，树里用运行时图标区分 */
const RUNTIME_PACKAGES = new Set([
  'node',
  'nodejs',
  'ruby',
  'python',
  'python3',
  'java',
  'go',
  'deno',
  'php'
])

interface Host {
  managerId: ManagerId
  managerName: string
  pkg?: PackageItem
  /** 命中的最具体目录，用来判断谁更贴近 */
  base: string
}

function isInside(path: string, base: string): boolean {
  const prefix = base.endsWith('/') ? base : `${base}/`
  return path.startsWith(prefix)
}

function splitAt(path: string, base: string): string[] {
  return path.slice(base.length + 1).split('/')
}

async function resolvePath(path: string): Promise<string> {
  try {
    return await realpath(path)
  } catch {
    return path
  }
}

function shortVersion(version: string | undefined, name: string): string | undefined {
  if (!version) return undefined

  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const stripped = version.replace(new RegExp(`^${escaped}\\s*`, 'i'), '').trim()
  const match = /^v?(\d+(?:\.\d+)*(?:[-+][0-9A-Za-z.]+)?)/.exec(stripped)

  return match?.[1] ?? (stripped.split(/\s+/)[0] || undefined)
}

/**
 * 把任意一条路径映射回「谁安装了它」：Homebrew 的 Cellar、mise 的
 * installs、npm 的全局 node_modules、uv 的 tools。
 */
function buildLocator(
  managers: ManagerSnapshot[],
  ctx: CoreContext
): (path: string) => Host | null {
  const byId = new Map<ManagerId, ManagerSnapshot>()
  for (const snapshot of managers) byId.set(snapshot.manager.id, snapshot)

  const brew = byId.get('brew')
  const brewPrefix = brew?.manager.executablePath
    ? dirname(dirname(brew.manager.executablePath))
    : null
  const brewPackages = new Map<string, PackageItem>()
  for (const pkg of brew?.packages ?? []) {
    if (pkg.kind === 'cask') continue
    brewPackages.set(pkg.name.toLowerCase(), pkg)
  }

  const mise = byId.get('mise')
  const miseBase =
    process.env['MISE_DATA_DIR'] ?? join(ctx.home, '.local', 'share', 'mise')
  const misePackages = new Map<string, PackageItem[]>()
  for (const pkg of mise?.packages ?? []) {
    const list = misePackages.get(pkg.name)
    if (list) list.push(pkg)
    else misePackages.set(pkg.name, [pkg])
  }

  const npm = byId.get('npm')
  const npmRoots = new Map<string, PackageItem[]>()
  for (const pkg of npm?.packages ?? []) {
    const root = pkg.meta?.['root']
    if (!root) continue
    const list = npmRoots.get(root)
    if (list) list.push(pkg)
    else npmRoots.set(root, [pkg])
  }

  const uv = byId.get('uv')
  const uvBase = join(ctx.home, '.local', 'share', 'uv')

  return (rawPath: string): Host | null => {
    let best: Host | null = null

    const consider = (host: Host): void => {
      if (!best || host.base.length > best.base.length) best = host
    }

    if (brewPrefix && isInside(rawPath, brewPrefix)) {
      const parts = splitAt(rawPath, brewPrefix)
      const head = parts[0]
      const formula = head === 'Cellar' || head === 'opt' ? parts[1] : undefined
      const pkg = formula ? brewPackages.get(formula.toLowerCase()) : undefined

      consider({
        managerId: 'brew',
        managerName: brew?.manager.name ?? 'Homebrew',
        ...(pkg ? { pkg } : {}),
        base: formula ? join(brewPrefix, 'Cellar', formula) : brewPrefix
      })
    }

    if (isInside(rawPath, miseBase)) {
      const parts = splitAt(rawPath, miseBase)
      const kind = parts[0]
      const tool = parts[1]
      const version = parts[2]

      if (kind === 'installs' && tool && version) {
        const pkg = misePackages.get(tool)?.find((item) => item.version === version)

        consider({
          managerId: 'mise',
          managerName: mise?.manager.name ?? 'mise',
          ...(pkg ? { pkg } : {}),
          base: join(miseBase, 'installs', tool, version)
        })
      }
    }

    for (const [root, packages] of npmRoots) {
      if (!isInside(rawPath, root)) continue

      const rest = splitAt(rawPath, root)
      const head = rest[0] ?? ''
      const name = head.startsWith('@') ? `${head}/${rest[1] ?? ''}` : head
      if (!name) continue

      const pkg = packages.find((item) => item.name === name)

      consider({
        managerId: 'npm',
        managerName: npm?.manager.name ?? 'npm',
        ...(pkg ? { pkg } : {}),
        base: join(root, name)
      })
    }

    if (isInside(rawPath, uvBase)) {
      const rest = splitAt(rawPath, uvBase)
      const name = rest[0] === 'tools' ? rest[1] : undefined

      if (name) {
        const pkg = uv?.packages.find((item) => item.name === name)

        consider({
          managerId: 'uv',
          managerName: uv?.manager.name ?? 'uv',
          ...(pkg ? { pkg } : {}),
          base: join(uvBase, 'tools', name)
        })
      }
    }

    return best
  }
}

async function nodeVersion(nodePath: string, pathEnv: string): Promise<string | undefined> {
  const result = await runCommand(nodePath, ['--version'], pathEnv, { timeoutMs: 5000 })
  const raw = result.stdout.trim() || result.stderr.trim()
  if (!raw) return undefined

  return shortVersion(raw, 'node')
}

export async function buildLineage(
  managers: ManagerSnapshot[],
  ctx: CoreContext
): Promise<LineageGraph> {
  const detected = managers.filter(
    (snapshot) => snapshot.manager.detected && snapshot.manager.executablePath
  )
  const byId = new Map<ManagerId, ManagerSnapshot>()
  for (const snapshot of detected) byId.set(snapshot.manager.id, snapshot)

  const nodes = new Map<string, LineageNode>()
  const children = new Map<string, string[]>()
  const parents = new Map<string, Set<string>>()
  let edges = 0

  const link = (parentKey: string, childKey: string): void => {
    if (parentKey === childKey) return

    const list = children.get(parentKey) ?? []
    if (!list.includes(childKey)) {
      list.push(childKey)
      children.set(parentKey, list)
      edges += 1
    }

    const set = parents.get(childKey) ?? new Set<string>()
    set.add(parentKey)
    parents.set(childKey, set)
  }

  const ensureManagerNode = (id: ManagerId): string => {
    const key = `manager:${id}`
    if (nodes.has(key)) return key

    const snapshot = byId.get(id)
    if (!snapshot) return key

    nodes.set(key, {
      id: key,
      kind: 'manager',
      label: snapshot.manager.name,
      version: shortVersion(snapshot.manager.version, snapshot.manager.name),
      managerId: id,
      detail: `${snapshot.packages.length} 个包`,
      children: []
    })

    return key
  }

  const ensureHostNode = (host: Host): string => {
    if (!host.pkg) return ensureManagerNode(host.managerId)

    const key = `pkg:${host.managerId}:${host.pkg.id}`
    if (nodes.has(key)) return key

    const runtime =
      host.pkg.kind === 'runtime' || RUNTIME_PACKAGES.has(host.pkg.name.toLowerCase())

    nodes.set(key, {
      id: key,
      kind: runtime ? 'runtime' : 'package',
      label: host.pkg.name,
      version: host.pkg.version,
      detail: `由 ${host.managerName} 安装`,
      children: []
    })

    link(ensureManagerNode(host.managerId), key)
    return key
  }

  const locate = buildLocator(managers, ctx)

  // 独立安装（uv/pnpm 等）也要有节点，npm 会按安装逐份出现
  for (const snapshot of detected) {
    if (snapshot.manager.id === 'npm') continue
    ensureManagerNode(snapshot.manager.id)
  }

  // 1) 普通管理器：自己的可执行文件落在谁的目录里
  for (const snapshot of detected) {
    const id = snapshot.manager.id
    if (id === 'npm') continue

    const executable = snapshot.manager.executablePath
    if (!executable) continue

    const host = locate(await resolvePath(executable))
    if (!host || host.managerId === id) continue

    const sameName =
      Boolean(host.pkg) &&
      host.pkg?.name.toLowerCase() === snapshot.manager.name.toLowerCase()
    const parentKey =
      host.pkg && !sameName ? ensureHostNode(host) : ensureManagerNode(host.managerId)

    link(parentKey, ensureManagerNode(id))
  }

  // 2) npm 会横跨多个 node 安装：每个全局根挂回对应的 node
  const npmSnapshot = byId.get('npm')
  if (npmSnapshot) {
    const installs = new Map<string, { label: string; count: number }>()

    for (const pkg of npmSnapshot.packages) {
      const root = pkg.meta?.['root']
      if (!root) continue

      const label = pkg.meta?.['label'] ?? root
      const current = installs.get(root)
      if (current) current.count += 1
      else installs.set(root, { label, count: 1 })
    }

    for (const [root, install] of installs) {
      const prefix = root.endsWith(LIB_NODE_MODULES)
        ? root.slice(0, -LIB_NODE_MODULES.length)
        : dirname(root)
      const nodePath = await resolvePath(join(prefix, 'bin', 'node'))
      const host = locate(nodePath)

      const key = `manager:npm:${createHash('sha1').update(root).digest('hex').slice(0, 8)}`
      if (!nodes.has(key)) {
        nodes.set(key, {
          id: key,
          kind: 'manager',
          label: 'npm',
          version: shortVersion(npmSnapshot.manager.version, npmSnapshot.manager.name),
          managerId: 'npm',
          installRoot: root,
          detail: `${install.count} 个包`,
          children: []
        })
      }

      if (host && host.managerId !== 'npm') {
        const parentKey = host.pkg ? ensureHostNode(host) : ensureManagerNode(host.managerId)
        link(parentKey, key)
        continue
      }

      const runtimeKey = `runtime:${install.label}`
      if (!nodes.has(runtimeKey)) {
        nodes.set(runtimeKey, {
          id: runtimeKey,
          kind: 'runtime',
          label: `node（${install.label}）`,
          version: await nodeVersion(nodePath, ctx.pathEnv),
          children: []
        })
      }
      link(runtimeKey, key)
    }

    // npm 一个包都没扫到时也让它出现在树里
    if (installs.size === 0) ensureManagerNode('npm')
  }

  // 3) 没有父节点的就是根（独立安装）
  const rootKeys: string[] = []
  for (const [key, node] of nodes) {
    if (node.kind === 'package') continue
    if ((parents.get(key)?.size ?? 0) > 0) continue
    rootKeys.push(key)
  }

  const build = (key: string, stack: Set<string>): LineageNode => {
    const node = nodes.get(key)
    if (!node) {
      return { id: key, kind: 'manager', label: key, children: [] }
    }

    if (stack.has(key)) return { ...node, children: [] }

    const next = new Set(stack)
    next.add(key)

    const childKeys = children.get(key) ?? []
    const childNodes = childKeys
      .map((childKey) => build(childKey, next))
      .sort((a, b) => a.label.localeCompare(b.label) || (a.version ?? '').localeCompare(b.version ?? ''))

    return { ...node, children: childNodes }
  }

  const roots = rootKeys
    .map((key) => build(key, new Set<string>()))
    .sort((a, b) => a.label.localeCompare(b.label))

  return { roots, edges }
}