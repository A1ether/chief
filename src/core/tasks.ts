import { randomUUID } from 'node:crypto'
import type { TaskEvent, TaskRequest, TaskResult, TaskStream } from '../shared/types'
import { getContext } from './env'
import { streamCommand } from './exec'
import { getAdapter } from './registry'
import type { CommandSpec, CommandSpecs } from './adapters/types'

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function normalizeSpecs(specs: CommandSpecs): CommandSpec[] {
  return Array.isArray(specs) ? specs : [specs]
}

export async function runTask(
  request: TaskRequest,
  emit: (event: TaskEvent) => void
): Promise<TaskResult> {
  const taskId = randomUUID()

  const emitLine = (stream: TaskStream, text: string): void => {
    emit({
      taskId,
      type: request.type,
      manager: request.manager,
      stream,
      text,
      at: Date.now()
    })
  }

  const fail = (message: string): TaskResult => {
    emitLine('system', message)
    return { taskId, ok: false, exitCode: null, message }
  }

  const adapter = getAdapter(request.manager)
  if (!adapter) return fail(`未知的包管理器：${request.manager}`)

  const ctx = await getContext()
  let probe

  try {
    probe = await adapter.probe(ctx)
  } catch (error) {
    return fail(`检测 ${adapter.name} 失败：${errorMessage(error)}`)
  }

  if (!probe.detected || !probe.executablePath) {
    return fail(`未检测到 ${adapter.name}，请先安装或检查 PATH`)
  }

  const runtime = {
    executablePath: probe.executablePath,
    version: probe.version ?? ''
  }

  let specs: CommandSpec[]
  let label: string

  try {
    if (request.type === 'update-all') {
      specs = normalizeSpecs(
        await adapter.commands.updateAll(runtime, ctx, request.installRoot)
      )
      label = `更新全部 ${adapter.name} 包`
    } else {
      const packages = await adapter.list(ctx, runtime)
      const pkg = packages.find((item) => item.id === request.packageId)

      if (!pkg) {
        return fail('找不到该包，可能已被移除，请重新扫描')
      }

      if (request.type === 'uninstall' && pkg.pinned) {
        return fail('该包被标记为固定版本，Chief 不会卸载它')
      }

      specs = normalizeSpecs(
        request.type === 'update'
          ? await adapter.commands.update(pkg, runtime)
          : await adapter.commands.uninstall(pkg, runtime)
      )

      label = `${request.type === 'update' ? '更新' : '卸载'} ${pkg.name}`
    }
  } catch (error) {
    return fail(`准备命令失败：${errorMessage(error)}`)
  }

  if (specs.length === 0) {
    return fail(`${label}失败：没有可执行的命令`)
  }

  let failures = 0
  let failureCode: number | null | undefined
  let timedOut = false

  for (const spec of specs) {
    emitLine('system', `$ ${[spec.command, ...spec.args].join(' ')}`)

    const pathEnv = spec.pathPrefix ? `${spec.pathPrefix}:${ctx.pathEnv}` : ctx.pathEnv

    const result = await streamCommand(
      spec.command,
      spec.args,
      pathEnv,
      {
        env: spec.env,
        timeoutMs: request.type === 'uninstall' ? 120_000 : 15 * 60_000
      },
      emitLine
    )

    if (result.timedOut) {
      timedOut = true
      failures += 1
      emitLine('system', '命令超时，已终止')
      continue
    }

    if (result.truncated) {
      emitLine('system', '输出过长，后续内容已截断')
    }

    if (result.code !== 0) {
      failures += 1
      if (failureCode === undefined) failureCode = result.code
    }
  }

  if (timedOut) {
    return fail(`${label}超时，命令已终止`)
  }

  const ok = failures === 0
  const message = ok
    ? specs.length > 1
      ? `${label}完成（${specs.length} 条命令）`
      : `${label}完成`
    : specs.length > 1
      ? `${label}失败（${failures}/${specs.length} 条命令未成功）`
      : `${label}失败（退出码 ${failureCode ?? '未知'}）`

  emitLine('system', message)

  return {
    taskId,
    ok,
    exitCode: ok ? 0 : failureCode ?? null,
    message
  }
}
