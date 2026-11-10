import { randomUUID } from 'node:crypto'
import type { TaskEvent, TaskRequest, TaskResult, TaskStream } from '../shared/types'
import { getContext } from './env'
import { streamCommand } from './exec'
import { getAdapter } from './registry'
import type { CommandSpec } from './adapters/types'

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
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

  let spec: CommandSpec
  let label: string

  try {
    if (request.type === 'update-all') {
      spec = adapter.commands.updateAll(runtime)
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

      spec = request.type === 'update'
        ? adapter.commands.update(pkg, runtime)
        : adapter.commands.uninstall(pkg, runtime)

      label = `${request.type === 'update' ? '更新' : '卸载'} ${pkg.name}`
    }
  } catch (error) {
    return fail(`准备命令失败：${errorMessage(error)}`)
  }

  emitLine('system', `$ ${[spec.command, ...spec.args].join(' ')}`)

  const result = await streamCommand(
    spec.command,
    spec.args,
    ctx.pathEnv,
    {
      env: spec.env,
      timeoutMs: request.type === 'uninstall' ? 120_000 : 15 * 60_000
    },
    emitLine
  )

  if (result.timedOut) {
    return fail(`${label}超时，命令已终止`)
  }

  if (result.truncated) {
    emitLine('system', '输出过长，后续内容已截断')
  }

  const ok = result.code === 0
  const message = ok
    ? `${label}完成`
    : `${label}失败（退出码 ${result.code ?? '未知'}）`

  emitLine('system', message)

  return {
    taskId,
    ok,
    exitCode: result.code,
    message
  }
}