import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { access, readdir, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import type { ManagerCapabilities, ManagerProbe, PackageItem } from '../../shared/types'
import type { CoreContext } from '../env'
import { runCommand } from '../exec'
import type { AdapterRuntime, CommandSpec, PackageManagerAdapter } from './types'
import { firstLine, packageId, parseJson, probeExecutable } from './helpers'

const NPM_ENV = {
  npm_config_update_notifier: 'false',
  npm_config_fund: 'false'
}

const capabilities: ManagerCapabilities = {
  list: true,
  outdated: true,
  update: true,
  updateAll: true,
  uninstall: true
}

/** npm 自带的运行时包，不算用户安装的全局包 */
const RUNTIME_PACKAGES = new Set(['npm', 'corepack'])

interface NpmInstall {
  /** npm 可执行文件 */
  npm: string
  /** npm 与 node 所在的 bin 目录，运行时优先放进 PATH */
  binDir: string
  /** npm root -g 报出的全局 node_modules */
  root: string
  /** 给人看的来源标签，例如 mise node 26.13.0 */
  label: string
}

interface NpmList {
  dependencies?: Record<string, { version?: string }>
}

interface NpmOutdatedEntry {
  current?: string
  wanted?: string
  latest?: string
}

function withBinDir(binDir: string, pathEnv: string): string {
  return `${binDir}:${pathEnv}`
}

async function isExecutable(file: string): Promise<boolean> {
  try {
    await access(file, constants.X_OK)
    return true
  } catch {
    return false
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function childNames(base: string): Promise<string[]> {
  try {
    const entries = await readdir(base, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
      .map((entry) => entry.name)
      .sort()
  } catch {
    return []
  }
}

/**
 * 版本管理器各自把 node/npm 放在自己的目录下。列出这些目录，才能看到
 * PATH 当前没选中的那些安装。
 */
function versionRoots(home: string): Array<{ base: string; suffix: string[] }> {
  const env = process.env
  const mise = env.MISE_DATA_DIR ?? join(home, '.local', 'share', 'mise')
  const nvm = env.NVM_DIR ?? join(home, '.nvm')
  const fnm = env.FNM_DIR ?? join(home, '.local', 'share', 'fnm')
  const volta = env.VOLTA_HOME ?? join(home, '.volta')
  const asdf = env.ASDF_DATA_DIR ?? join(home, '.asdf')

  return [
    { base: join(nvm, 'versions', 'node'), suffix: ['bin'] },
    { base: join(fnm, 'node-versions'), suffix: ['installation', 'bin'] },
    { base: join(home, '.fnm', 'node-versions'), suffix: ['installation', 'bin'] },
    { base: join(volta, 'tools', 'image', 'node'), suffix: ['bin'] },
    { base: join(asdf, 'installs', 'nodejs'), suffix: ['bin'] },
    { base: join(mise, 'installs', 'node'), suffix: ['bin'] },
    { base: join(mise, 'installs', 'npm'), suffix: ['package', 'bin'] },
    { base: join(home, '.nodenv', 'versions'), suffix: ['bin'] }
  ]
}

async function installLabel(root: string, home: string, npm: string): Promise<string> {
  let realNpm = npm

  try {
    realNpm = await realpath(npm)
  } catch {
    // 无法解引用时用原路径判断
  }

  if (realNpm.includes('/.hermes/')) return 'Hermes'

  const rel = root.startsWith(`${home}/`) ? root.slice(home.length + 1) : root

  const miseNode = /^\.local\/share\/mise\/installs\/node\/([^/]+)\//.exec(rel)
  if (miseNode?.[1]) return `mise node ${miseNode[1]}`

  const miseNpm = /^\.local\/share\/mise\/installs\/npm\/([^/]+)\//.exec(rel)
  if (miseNpm?.[1]) return `mise npm ${miseNpm[1]}`

  if (rel.startsWith('.nvm/versions/node/')) return `nvm ${rel.split('/')[3] ?? ''}`
  if (rel.startsWith('.local/share/fnm/node-versions/')) {
    return `fnm ${rel.split('/')[3] ?? ''}`
  }
  if (rel.startsWith('.volta/')) return 'Volta'
  if (rel.startsWith('.asdf/installs/nodejs/')) return `asdf ${rel.split('/')[2] ?? ''}`
  if (rel.startsWith('.nodenv/versions/')) return `nodenv ${rel.split('/')[2] ?? ''}`

  if (root === '/opt/homebrew/lib/node_modules') return 'Homebrew'
  if (root === '/usr/local/lib/node_modules' || root === '/usr/lib/node_modules') {
    return '系统 node'
  }

  return `~/${rel.replace(/\/lib\/node_modules$/, '')}`
}

/** 找出本机所有能用的 npm 及其全局根目录（去重后按路径顺序返回） */
async function resolveInstalls(ctx: CoreContext): Promise<NpmInstall[]> {
  const candidates = new Set<string>()

  for (const dir of ctx.pathEnv.split(':')) {
    if (dir) candidates.add(dir)
  }

  for (const dir of [
    join(ctx.home, '.hermes', 'node', 'bin'),
    join(ctx.home, '.local', 'bin'),
    join(ctx.home, '.npm-global', 'bin'),
    '/opt/homebrew/bin',
    '/opt/homebrew/opt/node/bin',
    '/usr/local/bin',
    '/usr/bin'
  ]) {
    candidates.add(dir)
  }

  for (const { base, suffix } of versionRoots(ctx.home)) {
    for (const name of await childNames(base)) {
      candidates.add(join(base, name, ...suffix))
    }
  }

  const binDirs: string[] = []
  const seenDirs = new Set<string>()

  for (const dir of [...candidates].sort()) {
    let real: string
    try {
      real = await realpath(dir)
    } catch {
      continue
    }

    if (seenDirs.has(real)) continue
    if (!(await isExecutable(join(dir, 'npm')))) continue

    seenDirs.add(real)
    binDirs.push(dir)
  }

  const resolved = await Promise.all(
    binDirs.map(async (binDir): Promise<NpmInstall | null> => {
      const npm = join(binDir, 'npm')
      const result = await runCommand(npm, ['root', '-g'], withBinDir(binDir, ctx.pathEnv), {
        env: NPM_ENV,
        timeoutMs: 8000
      })

      const reported = firstLine(result.stdout)
      const root = reported.startsWith('/') ? reported : join(binDir, '..', 'lib', 'node_modules')

      if (!(await isDirectory(root))) return null

      let key = root
      try {
        key = await realpath(root)
      } catch {
        // 根目录无法 resolve 时用原值
      }

      return { npm, binDir, root: key, label: await installLabel(key, ctx.home, npm) }
    })
  )

  const installs = new Map<string, NpmInstall>()
  for (const install of resolved) {
    if (!install || installs.has(install.root)) continue
    installs.set(install.root, install)
  }

  return [...installs.values()]
}

/** 从已扫描到的包反推安装信息，避免 outdated 阶段再发现一次 */
function installsFromPackages(packages: PackageItem[]): NpmInstall[] {
  const installs = new Map<string, NpmInstall>()

  for (const pkg of packages) {
    const root = pkg.meta?.root
    const npm = pkg.meta?.npm
    const binDir = pkg.meta?.bin
    if (!root || !npm || !binDir || installs.has(root)) continue

    installs.set(root, { root, npm, binDir, label: pkg.meta?.label ?? root })
  }

  return [...installs.values()]
}

function installationOf(pkg: PackageItem): NpmInstall | null {
  const root = pkg.meta?.root
  const npm = pkg.meta?.npm
  const binDir = pkg.meta?.bin
  if (!root || !npm || !binDir) return null
  return { root, npm, binDir, label: pkg.meta?.label ?? root }
}

async function listInstall(
  ctx: CoreContext,
  install: NpmInstall,
  showLabel: boolean
): Promise<PackageItem[]> {
  const result = await runCommand(
    install.npm,
    ['ls', '-g', '--depth=0', '--json'],
    withBinDir(install.binDir, ctx.pathEnv),
    { env: NPM_ENV, timeoutMs: 60_000 }
  )

  const data = parseJson<NpmList>(result.stdout.trim() || '{}', 'npm ls')
  const rootKey = createHash('sha1').update(install.root).digest('hex').slice(0, 8)
  const packages: PackageItem[] = []

  for (const [name, info] of Object.entries(data.dependencies ?? {})) {
    if (RUNTIME_PACKAGES.has(name)) continue

    packages.push({
      id: packageId('npm', `${name}:${rootKey}`),
      manager: 'npm',
      name,
      version: info.version ?? 'unknown',
      kind: 'npm-global',
      outdated: false,
      description: showLabel ? install.label : undefined,
      installPath: join(install.root, name),
      target: name,
      meta: {
        root: install.root,
        npm: install.npm,
        bin: install.binDir,
        label: install.label
      }
    })
  }

  return packages
}

export const npmAdapter: PackageManagerAdapter = {
  id: 'npm',
  name: 'npm',
  description: '全局 Node.js CLI 工具',
  installHint: '随 Node.js 安装，或使用 mise install node',
  executable: 'npm',
  versionArgs: ['--version'],
  capabilities,

  probe(ctx: CoreContext): Promise<ManagerProbe> {
    return probeExecutable(ctx, 'npm', ['--version'])
  },

  async list(ctx: CoreContext): Promise<PackageItem[]> {
    const installs = await resolveInstalls(ctx)
    const errors: string[] = []

    const listed = await Promise.all(
      installs.map(async (install) => {
        try {
          return await listInstall(ctx, install, installs.length > 1)
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error))
          return []
        }
      })
    )

    if (errors.length > 0 && listed.every((items) => items.length === 0)) {
      throw new Error(errors[0])
    }

    return listed.flat()
  },

  async outdated(
    ctx: CoreContext,
    _runtime: AdapterRuntime,
    packages: PackageItem[]
  ): Promise<Map<string, string>> {
    const installs = installsFromPackages(packages)

    const checked = await Promise.all(
      installs.map(async (install) => {
        const result = await runCommand(
          install.npm,
          ['outdated', '-g', '--json'],
          withBinDir(install.binDir, ctx.pathEnv),
          { env: NPM_ENV, timeoutMs: 120_000 }
        )

        if (!result.stdout.trim()) return []

        let data: Record<string, NpmOutdatedEntry>
        try {
          data = parseJson<Record<string, NpmOutdatedEntry>>(result.stdout, 'npm outdated')
        } catch {
          return []
        }

        const found: Array<[string, string]> = []
        for (const pkg of packages) {
          if (pkg.meta?.root !== install.root) continue
          const newer = data[pkg.name]?.latest
          if (newer) found.push([pkg.id, newer])
        }

        return found
      })
    )

    return new Map(checked.flat())
  },

  commands: {
    update(pkg: PackageItem, runtime: AdapterRuntime): CommandSpec {
      const install = installationOf(pkg)
      const spec: CommandSpec = {
        command: install?.npm ?? runtime.executablePath,
        args: ['install', '-g', `${pkg.target}@latest`],
        env: NPM_ENV
      }

      if (install) spec.pathPrefix = install.binDir
      return spec
    },

    async updateAll(_runtime: AdapterRuntime, ctx: CoreContext, installRoot?: string): Promise<CommandSpec[]> {
      const installs = await resolveInstalls(ctx)
      const selected = installRoot
        ? installs.filter((install) => install.root === installRoot)
        : installs

      if (installRoot && selected.length === 0) {
        throw new Error('找不到该 npm 安装，可能已被移除或改动，请重新扫描')
      }

      return selected.map((install) => ({
        command: install.npm,
        args: ['update', '-g'],
        env: NPM_ENV,
        pathPrefix: install.binDir
      }))
    },

    uninstall(pkg: PackageItem, runtime: AdapterRuntime): CommandSpec {
      const install = installationOf(pkg)
      const spec: CommandSpec = {
        command: install?.npm ?? runtime.executablePath,
        args: ['uninstall', '-g', pkg.target],
        env: NPM_ENV
      }

      if (install) spec.pathPrefix = install.binDir
      return spec
    }
  }
}
