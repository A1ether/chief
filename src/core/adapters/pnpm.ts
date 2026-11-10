import type { ManagerCapabilities, ManagerProbe, PackageItem } from '../../shared/types'
import type { CoreContext } from '../env'
import { runCommand } from '../exec'
import type { AdapterRuntime, PackageManagerAdapter } from './types'
import { packageId, parseJson, probeExecutable } from './helpers'

const capabilities: ManagerCapabilities = {
  list: true,
  outdated: true,
  update: true,
  updateAll: true,
  uninstall: true
}

interface PnpmGroup {
  path?: string
  dependencies?: Record<string, { version?: string }>
  devDependencies?: Record<string, { version?: string }>
}

interface PnpmOutdatedEntry {
  latest?: string
}

export const pnpmAdapter: PackageManagerAdapter = {
  id: 'pnpm',
  name: 'pnpm',
  description: '全局 Node.js CLI 工具（pnpm）',
  installHint: 'npm install -g pnpm',
  executable: 'pnpm',
  versionArgs: ['--version'],
  capabilities,

  probe(ctx: CoreContext): Promise<ManagerProbe> {
    return probeExecutable(ctx, 'pnpm', ['--version'])
  },

  async list(ctx: CoreContext, runtime: AdapterRuntime): Promise<PackageItem[]> {
    const result = await runCommand(
      runtime.executablePath,
      ['ls', '-g', '--depth=0', '--json'],
      ctx.pathEnv,
      { timeoutMs: 60_000 }
    )

    const parsed = parseJson<PnpmGroup[] | PnpmGroup>(result.stdout || '[]', 'pnpm ls')
    const groups = Array.isArray(parsed) ? parsed : [parsed]
    const packages: PackageItem[] = []

    for (const group of groups) {
      const dependencies = { ...group.dependencies, ...group.devDependencies }

      for (const [name, info] of Object.entries(dependencies)) {
        packages.push({
          id: packageId('pnpm', name),
          manager: 'pnpm',
          name,
          version: info.version ?? 'unknown',
          kind: 'npm-global',
          outdated: false,
          installPath: group.path,
          target: name
        })
      }
    }

    return packages
  },

  async outdated(
    ctx: CoreContext,
    runtime: AdapterRuntime,
    packages: PackageItem[]
  ): Promise<Map<string, string>> {
    const result = await runCommand(
      runtime.executablePath,
      ['outdated', '-g', '--json'],
      ctx.pathEnv,
      { timeoutMs: 120_000 }
    )

    if (!result.stdout.trim()) return new Map()

    let data: Record<string, PnpmOutdatedEntry>
    try {
      data = parseJson<Record<string, PnpmOutdatedEntry>>(result.stdout, 'pnpm outdated')
    } catch {
      return new Map()
    }

    const latest = new Map<string, string>()
    for (const pkg of packages) {
      const newer = data[pkg.name]?.latest
      if (newer) latest.set(pkg.id, newer)
    }
    return latest
  },

  commands: {
    update(pkg: PackageItem, runtime: AdapterRuntime) {
      return {
        command: runtime.executablePath,
        args: ['add', '-g', `${pkg.target}@latest`]
      }
    },
    updateAll(runtime: AdapterRuntime) {
      return { command: runtime.executablePath, args: ['update', '-g'] }
    },
    uninstall(pkg: PackageItem, runtime: AdapterRuntime) {
      return { command: runtime.executablePath, args: ['remove', '-g', pkg.target] }
    }
  }
}