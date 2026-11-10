import type { ManagerCapabilities, ManagerProbe, PackageItem } from '../../shared/types'
import type { CoreContext } from '../env'
import { runCommand } from '../exec'
import type { AdapterRuntime, PackageManagerAdapter } from './types'
import { parseJson, packageId, probeExecutable } from './helpers'

const BREW_ENV = {
  HOMEBREW_NO_AUTO_UPDATE: '1',
  HOMEBREW_NO_ENV_HINTS: '1',
  HOMEBREW_NO_INSTALL_CLEANUP: '1'
}

const capabilities: ManagerCapabilities = {
  list: true,
  outdated: true,
  update: true,
  updateAll: true,
  uninstall: true
}

interface BrewFormula {
  name: string
  full_name?: string
  tap?: string
  desc?: string
  homepage?: string
  versions?: { stable?: string }
  installed?: Array<{ version?: string }>
  outdated?: boolean
  pinned?: boolean
}

interface BrewCask {
  token: string
  name?: string[]
  desc?: string
  homepage?: string
  version?: string
  installed?: string | string[]
  outdated?: boolean
}

interface BrewInfo {
  formulae?: BrewFormula[]
  casks?: BrewCask[]
}

function caskInstalledVersion(cask: BrewCask): string {
  if (Array.isArray(cask.installed)) return cask.installed[0] ?? cask.version ?? ''
  return cask.installed ?? cask.version ?? ''
}

export const brewAdapter: PackageManagerAdapter = {
  id: 'brew',
  name: 'Homebrew',
  description: 'macOS 系统工具、CLI 与 GUI Cask',
  installHint: 'https://brew.sh',
  executable: 'brew',
  versionArgs: ['--version'],
  capabilities,

  probe(ctx: CoreContext): Promise<ManagerProbe> {
    return probeExecutable(ctx, 'brew', ['--version'])
  },

  async list(ctx: CoreContext, runtime: AdapterRuntime): Promise<PackageItem[]> {
    const result = await runCommand(
      runtime.executablePath,
      ['info', '--json=v2', '--installed'],
      ctx.pathEnv,
      { env: BREW_ENV, timeoutMs: 120_000 }
    )

    if (result.code !== 0) {
      throw new Error(result.stderr.trim() || 'brew info 执行失败')
    }

    const data = parseJson<BrewInfo>(result.stdout, 'brew info')
    const packages: PackageItem[] = []

    for (const formula of data.formulae ?? []) {
      const current = formula.installed?.at(-1)?.version ?? formula.versions?.stable ?? ''
      const latest = formula.versions?.stable
      const target = formula.full_name || formula.name
      packages.push({
        id: packageId('brew', `formula:${target}`),
        manager: 'brew',
        name: formula.name,
        version: current,
        latest,
        kind: 'formula',
        outdated: Boolean(formula.outdated),
        pinned: formula.pinned,
        description: formula.desc,
        homepage: formula.homepage,
        target,
        meta: formula.tap ? { tap: formula.tap } : undefined
      })
    }

    for (const cask of data.casks ?? []) {
      const current = caskInstalledVersion(cask)
      packages.push({
        id: packageId('brew', `cask:${cask.token}`),
        manager: 'brew',
        name: cask.name?.[0] ?? cask.token,
        version: current,
        latest: cask.version,
        kind: 'cask',
        outdated: Boolean(cask.outdated),
        description: cask.desc,
        homepage: cask.homepage,
        target: cask.token
      })
    }

    return packages
  },

  commands: {
    update(pkg: PackageItem, runtime: AdapterRuntime) {
      return pkg.kind === 'cask'
        ? { command: runtime.executablePath, args: ['upgrade', '--cask', pkg.target], env: BREW_ENV }
        : { command: runtime.executablePath, args: ['upgrade', pkg.target], env: BREW_ENV }
    },
    updateAll(runtime: AdapterRuntime) {
      return { command: runtime.executablePath, args: ['upgrade'], env: BREW_ENV }
    },
    uninstall(pkg: PackageItem, runtime: AdapterRuntime) {
      return pkg.kind === 'cask'
        ? { command: runtime.executablePath, args: ['uninstall', '--cask', pkg.target], env: BREW_ENV }
        : { command: runtime.executablePath, args: ['uninstall', pkg.target], env: BREW_ENV }
    }
  }
}