import { scanAll } from '../src/core/scan'

async function main(): Promise<void> {
  const full = process.argv.includes('--full')
  const result = await scanAll()

  if (full) {
    console.log(JSON.stringify(result, null, 2))
    return
  }

  const summary = result.managers.map((snapshot) => ({
    manager: snapshot.manager.name,
    id: snapshot.manager.id,
    detected: snapshot.manager.detected,
    version: snapshot.manager.version ?? null,
    path: snapshot.manager.executablePath ?? null,
    packages: snapshot.packages.length,
    updates: snapshot.packages.filter((item) => item.outdated).length,
    error: snapshot.error ?? null
  }))

  console.log(
    JSON.stringify(
      {
        scannedAt: result.scannedAt,
        durationMs: result.durationMs,
        managers: summary
      },
      null,
      2
    )
  )
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})