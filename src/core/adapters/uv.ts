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

interface ParsedTool {
  name: string
  version: string
}

function parseTools(output: string): ParsedTool[] {
  const tools: ParsedTool[] = []

  for (const line of splitLines(output)) {
    if (line.startsWith('- ') || line.startsWith(' ')) continue
    const match = /^(\S+)\s+v(\S+)/.exec(line)
    if (!match?.[1] || !match[2]) continue
    tools.push({ name: match[1], version: match[2] })
  }

  return tools
}

function parseOutdated(output: string): Map<string, string> {
  const latest = new Map<string, string>()

  for (const line of splitLines(output)) {
    if (line.startsWith('- ')) continue
    const name = /^(\S+)\s+v\S+/.exec(line)?.[1]
    const version = /\[latest:\s*([^\]\s]+)\]/.exec(line)?.[1]
    if (name && version) latest.set(name, version)
  }

  return latest
}

export const uvAdapter: PackageManagerAdapter = {
  id: 'uv',
  name: 'uv',
  description: 'Python CLI 工具与解释器',
  installHint: 'curl -LsSf https://astral.sh/uv/install.sh | sh',
  executable: 'uv',
  versionArgs: ['--version'],
  capabilities,

  probe(ctx: CoreContext): Promise<ManagerProbe> {
    return probeExecutable(ctx, 'uv', ['--version'])
  },

  async list(ctx: CoreContext, runtime: AdapterRuntime): Promise<PackageItem[]> {
    const [listResult, outdatedResult] = await Promise.all([
      runCommand(runtime.executablePath, ['tool', 'list'], ctx.pathEnv, { timeoutMs: 60_000 }),
      runCommand(runtime.executablePath, ['tool', 'list', '--outdated'], ctx.pathEnv, {
        timeoutMs: 120_000
      }).catch(() => null)
    ])

    if (listResult.code !== 0) {
      throw new Error(listResult.stderr.trim() || 'uv tool list 执行失败')
    }

    const latest = outdatedResult ? parseOutdated(outdatedResult.stdout) : new Map<string, string>()

    return parseTools(listResult.stdout).map((tool) => {
      const newer = latest.get(tool.name)
      return {
        id: packageId('uv', tool.name),
        manager: 'uv',
        name: tool.name,
        version: tool.version,
        latest: newer,
        kind: 'tool',
        outdated: Boolean(newer && newer !== tool.version),
        target: tool.name
      }
    })
  },

  commands: {
    update(pkg: PackageItem, runtime: AdapterRuntime) {
      return {
        command: runtime.executablePath,
        args: ['tool', 'upgrade', pkg.target]
      }
    },
    updateAll(runtime: AdapterRuntime) {
      return {
        command: runtime.executablePath,
        args: ['tool', 'upgrade', '--all']
      }
    },
    uninstall(pkg: PackageItem, runtime: AdapterRuntime) {
      return {
        command: runtime.executablePath,
        args: ['tool', 'uninstall', pkg.target]
      }
    }
  }
}