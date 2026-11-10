import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const PATH_MARKER = '__CHIEF_PATH__'

let cachedPath: string | null = null

export interface CoreContext {
  pathEnv: string
  home: string
  platform: NodeJS.Platform
}

function mergePath(base: string): string {
  const home = homedir()
  const known = [
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/usr/local/bin',
    '/usr/local/sbin',
    join(home, '.local/bin'),
    join(home, '.bun/bin'),
    join(home, '.cargo/bin'),
    join(home, 'Library/pnpm'),
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin'
  ]

  return [...new Set([...base.split(':'), ...known].filter(Boolean))].join(':')
}

/**
 * GUI apps start without the user's shell PATH. Ask the login shell once and
 * cache it, then merge the well-known package manager directories as a fallback.
 */
export async function getPathEnv(): Promise<string> {
  if (cachedPath) return cachedPath

  const shell = process.env.SHELL || '/bin/zsh'
  try {
    const { stdout } = await execFileAsync(
      shell,
      ['-ilc', `printf '${PATH_MARKER}%s' "$PATH"`],
      { timeout: 5000, maxBuffer: 1024 * 1024 }
    )
    const index = stdout.lastIndexOf(PATH_MARKER)
    if (index >= 0) {
      const value = stdout.slice(index + PATH_MARKER.length).trim()
      if (value) {
        cachedPath = mergePath(value)
        return cachedPath
      }
    }
  } catch {
    // Fall back to the inherited PATH below.
  }

  cachedPath = mergePath(process.env.PATH ?? '')
  return cachedPath
}

export async function getContext(): Promise<CoreContext> {
  return {
    pathEnv: await getPathEnv(),
    home: homedir(),
    platform: process.platform
  }
}

async function isExecutable(file: string): Promise<boolean> {
  try {
    await access(file, constants.X_OK)
    return true
  } catch {
    return false
  }
}

export async function resolveExecutable(name: string, pathEnv: string): Promise<string | null> {
  if (name.includes('/')) {
    return (await isExecutable(name)) ? name : null
  }

  for (const dir of pathEnv.split(':')) {
    if (!dir) continue
    const candidate = join(dir, name)
    if (await isExecutable(candidate)) return candidate
  }

  return null
}