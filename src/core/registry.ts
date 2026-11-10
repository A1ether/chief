import type { ManagerId } from '../shared/types'
import { brewAdapter } from './adapters/brew'
import { bunAdapter } from './adapters/bun'
import { gemAdapter } from './adapters/gem'
import { miseAdapter } from './adapters/mise'
import { npmAdapter } from './adapters/npm'
import { pnpmAdapter } from './adapters/pnpm'
import { uvAdapter } from './adapters/uv'
import type { PackageManagerAdapter } from './adapters/types'

export const ADAPTERS: PackageManagerAdapter[] = [
  brewAdapter,
  uvAdapter,
  miseAdapter,
  npmAdapter,
  pnpmAdapter,
  bunAdapter,
  gemAdapter
]

export function getAdapter(id: ManagerId): PackageManagerAdapter | undefined {
  return ADAPTERS.find((adapter) => adapter.id === id)
}