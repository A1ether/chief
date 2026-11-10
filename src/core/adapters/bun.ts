import type { ManagerCapabilities, ManagerProbe, PackageItem } from '../../shared/types'
import type { CoreContext } from '../env'
import { runCommand } from '../exec'
import type { AdapterRuntime, PackageManagerAdapter } from './types'
import { packageId, probeExecutable, splitLines } from './helpers'

const capabilities: ManagerCapabilities = {
  list: true,
  outdated: false,
  update: true,
  updateAll: true,
  uninstall: true
}

export const bunAdapter: PackageManagerAdapter = {
  id: 'bun',
  name: 'Bun',
  description: '全局 Node.js CLI 工具（bun）',
  installHint: 'curl -fsSL https://bun.sh/install | bash',
  executable: 'bun',
  versionArgs: ['--version'],
  capabilities,

  probe(ctx: CoreContext): Promise<ManagerProbe> {
    return probeExecutable(ctx, 'bun', ['--version'])
  },

  async list(ctx: CoreContext, runtime: AdapterRuntime): Promise<PackageItem[]> {
    const result = await runCommand(runtime.executablePath, ['pm', 'ls', '-g'], ctx.pathEnv, {
      timeoutMs: 60_000
    })

    if (result.code !== 0) {
      throw new Error(result.stderr.trim() || 'bun pm ls 执行失败')
    }

    const packages: PackageItem[] = []

    for (const line of splitLines(result.stdout)) {
      if (line.includes(' installed)')) continue

      const cleaned = line.replace(/^[\s│├└─┌┐┘┬┴┼]+/, '').trim()
      if (!cleaned || cleaned.includes(' ')) continue

      const at = cleaned.lastIndexOf('@')
      if (at <= 0) continue

      const name = cleaned.slice(0, at)
      const version = cleaned.slice(at + 1)
      if (!name || !version || version.includes('(')) continue

      packages.push({
        id: packageId('bun', name),
        manager: 'bun',
        name,
        version,
        kind: 'npm-global',
        outdated: false,
        target: name
      })
    }

    return packages
  },

  commands: {
    update(pkg: PackageItem, runtime: AdapterRuntime) {
      return { command: runtime.executablePath, args: ['update', '-g', pkg.target] }
    },
    updateAll(runtime: AdapterRuntime) {
      return { command: runtime.executablePath, args: ['update', '-g'] }
    },
    uninstall(pkg: PackageItem, runtime: AdapterRuntime) {
      return { command: runtime.executablePath, args: ['remove', '-g', pkg.target] }
    }
  }
}