import type { ManagerCapabilities, ManagerProbe, PackageItem } from '../../shared/types'
import type { CoreContext } from '../env'
import { runCommand } from '../exec'
import type { AdapterRuntime, PackageManagerAdapter } from './types'
import { packageId, probeExecutable, splitLines } from './helpers'

const capabilities: ManagerCapabilities = {
  list: true,
  outdated: true,
  update: true,
  updateAll: true,
  uninstall: true
}

interface GemEntry {
  name: string
  version: string
}

function parseGemList(output: string): GemEntry[] {
  const entries: GemEntry[] = []

  for (const line of splitLines(output)) {
    const match = /^(\S+)\s+\(([^)]+)\)/.exec(line)
    if (!match?.[1] || !match[2]) continue

    const versions = match[2]
      .split(',')
      .map((value) => value.trim())
      .filter((value) => !value.startsWith('default: '))

    // Skip default gems bundled with Ruby: users did not install them.
    if (versions.length === 0) continue

    entries.push({ name: match[1], version: versions[0]! })
  }

  return entries
}

function parseGemOutdated(output: string): Map<string, string> {
  const latest = new Map<string, string>()

  for (const line of splitLines(output)) {
    const match = /^(\S+)\s+\((\S+)\s+<\s+(\S+)\)/.exec(line)
    if (match?.[1] && match[3]) latest.set(match[1], match[3])
  }

  return latest
}

export const gemAdapter: PackageManagerAdapter = {
  id: 'gem',
  name: 'RubyGems',
  description: 'Ruby 全局 gem',
  installHint: '随 Ruby 安装',
  executable: 'gem',
  versionArgs: ['--version'],
  capabilities,

  probe(ctx: CoreContext): Promise<ManagerProbe> {
    return probeExecutable(ctx, 'gem', ['--version'])
  },

  async list(ctx: CoreContext, runtime: AdapterRuntime): Promise<PackageItem[]> {
    const [listResult, outdatedResult] = await Promise.all([
      runCommand(runtime.executablePath, ['list', '--local'], ctx.pathEnv, { timeoutMs: 60_000 }),
      runCommand(runtime.executablePath, ['outdated'], ctx.pathEnv, { timeoutMs: 120_000 }).catch(
        () => null
      )
    ])

    if (listResult.code !== 0) {
      throw new Error(listResult.stderr.trim() || 'gem list 执行失败')
    }

    const latest = outdatedResult ? parseGemOutdated(outdatedResult.stdout) : new Map<string, string>()

    return parseGemList(listResult.stdout).map((gem) => {
      const newer = latest.get(gem.name)
      return {
        id: packageId('gem', gem.name),
        manager: 'gem',
        name: gem.name,
        version: gem.version,
        latest: newer,
        kind: 'gem',
        outdated: Boolean(newer && newer !== gem.version),
        target: gem.name
      }
    })
  },

  commands: {
    update(pkg: PackageItem, runtime: AdapterRuntime) {
      return { command: runtime.executablePath, args: ['update', pkg.target] }
    },
    updateAll(runtime: AdapterRuntime) {
      return { command: runtime.executablePath, args: ['update'] }
    },
    uninstall(pkg: PackageItem, runtime: AdapterRuntime) {
      return { command: runtime.executablePath, args: ['uninstall', pkg.target] }
    }
  }
}