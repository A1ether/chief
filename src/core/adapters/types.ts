import type { ManagerCapabilities, ManagerId, ManagerProbe, PackageItem } from '../../shared/types'
import type { CoreContext } from '../env'

export interface AdapterRuntime {
  executablePath: string
  version: string
}

export interface CommandSpec {
  command: string
  args: string[]
  env?: NodeJS.ProcessEnv
  /** Prepended to PATH so the command resolves its own node/npm runtime */
  pathPrefix?: string
}

/** One command, or several when the manager spans multiple installations */
export type CommandSpecs = CommandSpec | CommandSpec[]

export interface PackageManagerAdapter {
  id: ManagerId
  name: string
  description: string
  installHint: string
  executable: string
  versionArgs: string[]
  capabilities: ManagerCapabilities
  probe(ctx: CoreContext): Promise<ManagerProbe>
  list(ctx: CoreContext, runtime: AdapterRuntime): Promise<PackageItem[]>
  /** Map of package id -> latest version */
  outdated?(
    ctx: CoreContext,
    runtime: AdapterRuntime,
    packages: PackageItem[]
  ): Promise<Map<string, string>>
  commands: {
    update(pkg: PackageItem, runtime: AdapterRuntime): CommandSpecs | Promise<CommandSpecs>
    updateAll(
      runtime: AdapterRuntime,
      ctx: CoreContext,
      installRoot?: string
    ): CommandSpecs | Promise<CommandSpecs>
    uninstall(pkg: PackageItem, runtime: AdapterRuntime): CommandSpecs | Promise<CommandSpecs>
  }
}
