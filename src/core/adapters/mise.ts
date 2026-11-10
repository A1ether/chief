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

interface MiseEntry {
  version?: string
  installed?: boolean
  install_path?: string
  active?: boolean
}

interface MiseOutdatedEntry {
  name?: string
  current?: string
  latest?: string
}

type MiseOutdated = Record<string, MiseOutdatedEntry>

export const miseAdapter: PackageManagerAdapter = {
  id: 'mise',
  name: 'mise',
  description: '语言运行时与开发工具版本管理',
  installHint: 'curl https://mise.run | sh',
  executable: 'mise',
  versionArgs: ['--version'],
  capabilities,

  probe(ctx: CoreContext): Promise<ManagerProbe> {
    return probeExecutable(ctx, 'mise', ['--version'])
  },

  async list(ctx: CoreContext, runtime: AdapterRuntime): Promise<PackageItem[]> {
    const [listResult, outdatedResult] = await Promise.all([
      runCommand(runtime.executablePath, ['ls', '--json'], ctx.pathEnv, { timeoutMs: 60_000 }),
      runCommand(runtime.executablePath, ['outdated', '--json'], ctx.pathEnv, {
        timeoutMs: 120_000
      }).catch(() => null)
    ])

    if (listResult.code !== 0) {
      throw new Error(listResult.stderr.trim() || 'mise ls 执行失败')
    }

    const data = parseJson<Record<string, MiseEntry[] | MiseEntry>>(listResult.stdout, 'mise ls')
    const outdated: MiseOutdated = outdatedResult?.code === 0
      ? parseJson<MiseOutdated>(outdatedResult.stdout || '{}', 'mise outdated')
      : {}

    const packages: PackageItem[] = []

    for (const [tool, rawEntries] of Object.entries(data)) {
      const entries = Array.isArray(rawEntries) ? rawEntries : [rawEntries]

      for (const entry of entries) {
        if (entry.installed === false || !entry.version) continue

        const newer = outdated[tool]
        const latest = newer?.current === entry.version ? newer.latest : undefined
        const target = `${tool}@${entry.version}`

        packages.push({
          id: packageId('mise', target),
          manager: 'mise',
          name: tool,
          version: entry.version,
          latest,
          kind: 'runtime',
          outdated: Boolean(latest && latest !== entry.version),
          installPath: entry.install_path,
          target,
          meta: { active: String(Boolean(entry.active)) }
        })
      }
    }

    return packages
  },

  commands: {
    update(pkg: PackageItem, runtime: AdapterRuntime) {
      return { command: runtime.executablePath, args: ['upgrade', pkg.target] }
    },
    updateAll(runtime: AdapterRuntime) {
      return { command: runtime.executablePath, args: ['upgrade'] }
    },
    uninstall(pkg: PackageItem, runtime: AdapterRuntime) {
      return { command: runtime.executablePath, args: ['uninstall', pkg.target] }
    }
  }
}