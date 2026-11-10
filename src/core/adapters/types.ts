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
}

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
    update(pkg: PackageItem, runtime: AdapterRuntime): CommandSpec
    updateAll(runtime: AdapterRuntime): CommandSpec
    uninstall(pkg: PackageItem, runtime: AdapterRuntime): CommandSpec
  }
}