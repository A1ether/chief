import type { ManagerInfo, ManagerSnapshot, ScanResult } from '../shared/types'
import { getContext } from './env'
import { ADAPTERS } from './registry'
import type { PackageManagerAdapter } from './adapters/types'

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function baseManager(adapter: PackageManagerAdapter): ManagerInfo {
  return {
    id: adapter.id,
    name: adapter.name,
    description: adapter.description,
    installHint: adapter.installHint,
    capabilities: adapter.capabilities,
    detected: false
  }
}

async function scanOne(
  adapter: PackageManagerAdapter,
  ctx: Awaited<ReturnType<typeof getContext>>
): Promise<ManagerSnapshot> {
  const scannedAt = new Date().toISOString()
  let manager = baseManager(adapter)

  try {
    const probe = await adapter.probe(ctx)
    manager = { ...manager, ...probe }

    if (!probe.detected || !probe.executablePath) {
      return { manager, packages: [], scannedAt }
    }

    const runtime = {
      executablePath: probe.executablePath,
      version: probe.version ?? ''
    }

    let packages = await adapter.list(ctx, runtime)

    if (adapter.outdated) {
      const latest = await adapter.outdated(ctx, runtime, packages).catch(() => new Map<string, string>())

      packages = packages.map((pkg) => {
        const newer = latest.get(pkg.id)
        if (!newer) return pkg
        return {
          ...pkg,
          latest: newer,
          outdated: newer !== pkg.version
        }
      })
    }

    return { manager, packages, scannedAt }
  } catch (error) {
    return {
      manager,
      packages: [],
      error: errorMessage(error),
      scannedAt
    }
  }
}

export async function scanAll(): Promise<ScanResult> {
  const startedAt = Date.now()
  const ctx = await getContext()

  const managers = await Promise.all(ADAPTERS.map((adapter) => scanOne(adapter, ctx)))

  return {
    managers,
    scannedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt
  }
}