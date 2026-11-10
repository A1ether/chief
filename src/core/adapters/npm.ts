import type { ManagerCapabilities, ManagerProbe, PackageItem } from '../../shared/types'
import type { CoreContext } from '../env'
import { runCommand } from '../exec'
import type { AdapterRuntime, PackageManagerAdapter } from './types'
import { packageId, parseJson, probeExecutable } from './helpers'

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

interface NpmList {
  dependencies?: Record<string, { version?: string; resolved?: string; problems?: string[] }>
}

interface NpmOutdatedEntry {
  current?: string
  wanted?: string
  latest?: string
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

  async list(ctx: CoreContext, runtime: AdapterRuntime): Promise<PackageItem[]> {
    const result = await runCommand(
      runtime.executablePath,
      ['ls', '-g', '--depth=0', '--json'],
      ctx.pathEnv,
      { env: NPM_ENV, timeoutMs: 60_000 }
    )

    const data = parseJson<NpmList>(result.stdout || '{}', 'npm ls')

    return Object.entries(data.dependencies ?? {}).map(([name, info]) => ({
      id: packageId('npm', name),
      manager: 'npm',
      name,
      version: info.version ?? 'unknown',
      kind: 'npm-global',
      outdated: false,
      installPath: info.resolved,
      target: name
    }))
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
      { env: NPM_ENV, timeoutMs: 120_000 }
    )

    if (!result.stdout.trim()) return new Map()

    let data: Record<string, NpmOutdatedEntry>
    try {
      data = parseJson<Record<string, NpmOutdatedEntry>>(result.stdout, 'npm outdated')
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
        args: ['install', '-g', `${pkg.target}@latest`],
        env: NPM_ENV
      }
    },
    updateAll(runtime: AdapterRuntime) {
      return { command: runtime.executablePath, args: ['update', '-g'], env: NPM_ENV }
    },
    uninstall(pkg: PackageItem, runtime: AdapterRuntime) {
      return { command: runtime.executablePath, args: ['uninstall', '-g', pkg.target], env: NPM_ENV }
    }
  }
}