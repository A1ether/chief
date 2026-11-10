import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

export interface CommandOptions {
  env?: NodeJS.ProcessEnv
  timeoutMs?: number
  cwd?: string
  maxOutputBytes?: number
}

export interface CommandResult {
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  truncated: boolean
}

export type StreamName = 'stdout' | 'stderr'

function buildEnv(pathEnv: string, extra?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: pathEnv,
    NO_COLOR: '1',
    ...extra
  }
}

function appendChunk(current: string, chunk: Buffer, maxBytes: number): { value: string; truncated: boolean } {
  const remaining = maxBytes - Buffer.byteLength(current)
  if (remaining <= 0) return { value: current, truncated: true }

  const text = chunk.toString('utf8')
  if (Buffer.byteLength(text) <= remaining) return { value: current + text, truncated: false }

  return { value: current + text.slice(0, remaining), truncated: true }
}

/**
 * Runs a command with an argument array and `shell: false`. Never pass user
 * input as a shell string.
 */
export function runCommand(
  command: string,
  args: string[],
  pathEnv: string,
  options: CommandOptions = {}
): Promise<CommandResult> {
  const maxBytes = options.maxOutputBytes ?? 32 * 1024 * 1024

  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let truncated = false
    let timedOut = false
    let settled = false

    const child = spawn(command, args, {
      env: buildEnv(pathEnv, options.env),
      cwd: options.cwd,
      shell: false
    })

    const killTimer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 3000).unref()
    }, options.timeoutMs ?? 120_000)

    const finish = (code: number | null, extraStderr?: string): void => {
      if (settled) return
      settled = true
      clearTimeout(killTimer)
      resolve({
        code,
        stdout,
        stderr: extraStderr ? `${stderr}${extraStderr}` : stderr,
        timedOut,
        truncated
      })
    }

    child.stdout.on('data', (chunk: Buffer) => {
      const next = appendChunk(stdout, chunk, maxBytes)
      stdout = next.value
      truncated = truncated || next.truncated
    })

    child.stderr.on('data', (chunk: Buffer) => {
      const next = appendChunk(stderr, chunk, maxBytes)
      stderr = next.value
      truncated = truncated || next.truncated
    })

    child.on('error', (error) => finish(null, `\n${error.message}`))
    child.on('close', (code) => finish(code))
  })
}

export function streamCommand(
  command: string,
  args: string[],
  pathEnv: string,
  options: CommandOptions,
  onLine: (stream: StreamName, line: string) => void
): Promise<CommandResult> {
  const maxBytes = options.maxOutputBytes ?? 32 * 1024 * 1024

  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let truncated = false
    let timedOut = false
    let settled = false

    const child = spawn(command, args, {
      env: buildEnv(pathEnv, options.env),
      cwd: options.cwd,
      shell: false
    })

    const outReader = child.stdout ? createInterface({ input: child.stdout }) : null
    const errReader = child.stderr ? createInterface({ input: child.stderr }) : null

    outReader?.on('line', (line) => onLine('stdout', line))
    errReader?.on('line', (line) => onLine('stderr', line))

    const killTimer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 3000).unref()
    }, options.timeoutMs ?? 15 * 60_000)

    const finish = (code: number | null, extraStderr?: string): void => {
      if (settled) return
      settled = true
      clearTimeout(killTimer)
      outReader?.close()
      errReader?.close()
      resolve({
        code,
        stdout,
        stderr: extraStderr ? `${stderr}${extraStderr}` : stderr,
        timedOut,
        truncated
      })
    }

    child.stdout?.on('data', (chunk: Buffer) => {
      const next = appendChunk(stdout, chunk, maxBytes)
      stdout = next.value
      truncated = truncated || next.truncated
    })

    child.stderr?.on('data', (chunk: Buffer) => {
      const next = appendChunk(stderr, chunk, maxBytes)
      stderr = next.value
      truncated = truncated || next.truncated
    })

    child.on('error', (error) => finish(null, `\n${error.message}`))
    child.on('close', (code) => finish(code))
  })
}