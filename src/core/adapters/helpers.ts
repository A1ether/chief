import type { ManagerProbe } from '../../shared/types'
import { resolveExecutable, type CoreContext } from '../env'
import { runCommand } from '../exec'

export function firstLine(text: string): string {
  return text.trim().split('\n')[0]?.trim() ?? ''
}

export function parseJson<T>(text: string, label: string): T {
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`${label} 返回了无法解析的内容`)
  }
}

export function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
}

export async function probeExecutable(
  ctx: CoreContext,
  executable: string,
  versionArgs: string[]
): Promise<ManagerProbe> {
  const executablePath = await resolveExecutable(executable, ctx.pathEnv)
  if (!executablePath) return { detected: false }

  const result = await runCommand(executablePath, versionArgs, ctx.pathEnv, { timeoutMs: 5000 })
  const version = firstLine(result.stdout || result.stderr)

  return {
    detected: true,
    executablePath,
    version: version || undefined
  }
}

export function packageId(manager: string, key: string): string {
  return `${manager}:${key}`
}

export function makeOutdatedMap(entries: Iterable<[string, string]>): Map<string, string> {
  return new Map(entries)
}

export function isNewer(latest: string | undefined, current: string): boolean {
  return Boolean(latest) && latest !== current
}