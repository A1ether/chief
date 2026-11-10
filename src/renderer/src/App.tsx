import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  ArrowUpCircle,
  Boxes,
  Check,
  ChevronRight,
  Crown,
  ExternalLink,
  LayoutDashboard,
  Loader2,
  Package,
  RefreshCw,
  Search,
  ShieldCheck,
  Terminal,
  Trash2,
  X
} from 'lucide-react'
import type {
  ManagerId,
  ManagerSnapshot,
  PackageItem,
  ScanResult,
  TaskEvent,
  TaskRequest
} from '../../shared/types'

type Selection = ManagerId | 'all'
type Filter = 'all' | 'updates'

interface LogLine {
  id: number
  manager: ManagerId
  stream: TaskEvent['stream']
  text: string
  at: number
}

interface TaskRun {
  taskId?: string
  label: string
  manager: ManagerId
  running: boolean
  ok?: boolean
  message?: string
  startedAt: number
}

interface ConfirmState {
  title: string
  body: ReactNode
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function formatClock(value: number): string {
  return new Date(value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

function formatScanTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

function kindLabel(kind: PackageItem['kind']): string {
  switch (kind) {
    case 'formula':
      return 'Formula'
    case 'cask':
      return 'Cask'
    case 'tool':
      return 'Tool'
    case 'runtime':
      return 'Runtime'
    case 'gem':
      return 'Gem'
    default:
      return 'Node CLI'
  }
}

function managerInitial(name: string): string {
  return name.slice(0, 2)
}

export default function App(): React.JSX.Element {
  const [scan, setScan] = useState<ScanResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Selection>('all')
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [logs, setLogs] = useState<LogLine[]>([])
  const [logsOpen, setLogsOpen] = useState(false)
  const [tasks, setTasks] = useState<Partial<Record<ManagerId, TaskRun>>>({})
  const [refreshPending, setRefreshPending] = useState(0)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)

  const logId = useRef(0)
  const logEnd = useRef<HTMLDivElement>(null)
  const didInit = useRef(false)
  const busyManagers = useRef<Set<ManagerId>>(new Set())

  const refresh = useCallback(async (quiet = false): Promise<void> => {
    if (!window.chief) {
      setError('Chief 需要在 Electron 中运行。请使用 pnpm dev 启动。')
      setLoading(false)
      return
    }

    if (!quiet) setLoading(true)
    setError(null)

    try {
      const result = await window.chief.scan()
      setScan(result)
    } catch (caught) {
      setError(errorText(caught))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (didInit.current) return
    didInit.current = true
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!window.chief) return

    return window.chief.onTaskEvent((event) => {
      setLogs((previous) => {
        const next = [
          ...previous,
          {
            id: ++logId.current,
            manager: event.manager,
            stream: event.stream,
            text: event.text,
            at: event.at
          }
        ]
        return next.slice(-300)
      })
      setLogsOpen(true)
    })
  }, [])

  useEffect(() => {
    if (logsOpen) logEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [logs, logsOpen])

  useEffect(() => {
    if (!confirm) return

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setConfirm(null)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [confirm])

  useEffect(() => {
    const running = Object.values(tasks).some((run) => run?.running)
    if (running || refreshPending === 0) return

    setRefreshPending(0)
    void refresh(true)
  }, [refresh, refreshPending, tasks])

  const managers = useMemo(() => scan?.managers ?? [], [scan])
  const detected = useMemo(() => managers.filter((item) => item.manager.detected), [managers])
  const allPackages = useMemo(() => managers.flatMap((item) => item.packages), [managers])
  const updates = useMemo(() => allPackages.filter((item) => item.outdated), [allPackages])

  const managerStats = useMemo(() => {
    const stats = new Map<ManagerId, { packages: number; updates: number }>()
    for (const snapshot of managers) {
      stats.set(snapshot.manager.id, {
        packages: snapshot.packages.length,
        updates: snapshot.packages.filter((item) => item.outdated).length
      })
    }
    return stats
  }, [managers])

  const selectedSnapshot = useMemo<ManagerSnapshot | null>(() => {
    if (selected === 'all') return null
    return managers.find((item) => item.manager.id === selected) ?? null
  }, [managers, selected])

  const visiblePackages = useMemo(() => {
    let items = selectedSnapshot ? selectedSnapshot.packages : allPackages

    if (filter === 'updates') items = items.filter((item) => item.outdated)

    const needle = query.trim().toLowerCase()
    if (needle) {
      items = items.filter((item) => {
        const managerName =
          managers.find((snapshot) => snapshot.manager.id === item.manager)?.manager.name ?? ''
        return (
          item.name.toLowerCase().includes(needle) ||
          (item.description ?? '').toLowerCase().includes(needle) ||
          item.manager.includes(needle) ||
          managerName.toLowerCase().includes(needle)
        )
      })
    }

    return [...items].sort(
      (a, b) => Number(b.outdated) - Number(a.outdated) || a.name.localeCompare(b.name)
    )
  }, [allPackages, filter, managers, query, selectedSnapshot])

  const updateTargets = useMemo(() => {
    if (selectedSnapshot) {
      return selectedSnapshot.packages.some((item) => item.outdated) ? [selectedSnapshot] : []
    }
    return managers.filter(
      (snapshot) => snapshot.manager.detected && snapshot.packages.some((item) => item.outdated)
    )
  }, [managers, selectedSnapshot])

  const scopeUpdates = selectedSnapshot
    ? selectedSnapshot.packages.filter((item) => item.outdated).length
    : updates.length

  const isManagerBusy = (manager: ManagerId): boolean => tasks[manager]?.running === true
  const anyBusy = useMemo(() => Object.values(tasks).some((run) => run?.running), [tasks])
  const runningTasks = useMemo(
    () => Object.values(tasks).filter((run): run is TaskRun => Boolean(run?.running)),
    [tasks]
  )
  const finishedTasks = useMemo(
    () =>
      Object.values(tasks)
        .filter((run): run is TaskRun => Boolean(run && !run.running))
        .sort((a, b) => b.startedAt - a.startedAt),
    [tasks]
  )
  const availableUpdateTargets = useMemo(
    () => updateTargets.filter((target) => !tasks[target.manager.id]?.running),
    [tasks, updateTargets]
  )

  const managerLabel = (manager: ManagerId): string =>
    managers.find((snapshot) => snapshot.manager.id === manager)?.manager.name ?? manager

  const runTaskForManager = async (request: TaskRequest, label: string): Promise<void> => {
    if (!window.chief || busyManagers.current.has(request.manager)) return

    busyManagers.current.add(request.manager)
    const startedAt = Date.now()

    setTasks((previous) => ({
      ...previous,
      [request.manager]: {
        label,
        manager: request.manager,
        running: true,
        startedAt
      }
    }))
    setLogsOpen(true)

    try {
      const result = await window.chief.task(request)
      setTasks((previous) => ({
        ...previous,
        [request.manager]: {
          taskId: result.taskId,
          label,
          manager: request.manager,
          running: false,
          ok: result.ok,
          message: result.message,
          startedAt: previous[request.manager]?.startedAt ?? startedAt
        }
      }))
    } catch (caught) {
      const message = errorText(caught)
      setTasks((previous) => ({
        ...previous,
        [request.manager]: {
          label,
          manager: request.manager,
          running: false,
          ok: false,
          message,
          startedAt: previous[request.manager]?.startedAt ?? startedAt
        }
      }))
      setError(message)
    } finally {
      busyManagers.current.delete(request.manager)
      setRefreshPending((value) => value + 1)
    }
  }

  const runSingle = (request: TaskRequest, label: string): void => {
    setConfirm(null)
    if (!window.chief || busyManagers.current.has(request.manager)) return

    if (busyManagers.current.size === 0) setLogs([])
    setLogsOpen(true)
    void runTaskForManager(request, label)
  }

  const runUpdateAll = async (): Promise<void> => {
    setConfirm(null)
    const targets = availableUpdateTargets
    if (!window.chief || targets.length === 0) return

    if (busyManagers.current.size === 0) setLogs([])
    setLogsOpen(true)

    await Promise.all(
      targets.map((target) =>
        runTaskForManager(
          { type: 'update-all', manager: target.manager.id },
          `更新 ${target.manager.name}`
        )
      )
    )
  }

  const openUpdateAll = (): void => {
    if (availableUpdateTargets.length === 0) return

    const summary = availableUpdateTargets
      .map(
        (target) =>
          `${target.manager.name}（${target.packages.filter((item) => item.outdated).length} 个）`
      )
      .join('、')

    setConfirm({
      title: selectedSnapshot ? `更新 ${selectedSnapshot.manager.name} 的全部包` : '更新全部可更新包',
      body: (
        <>
          将并行更新：<strong>{summary}</strong>。
          <br />
          更新可能需要数分钟，期间请保持 Chief 开启。
        </>
      ),
      confirmLabel: '开始更新',
      onConfirm: () => {
        void runUpdateAll()
      }
    })
  }

  const openUninstall = (item: PackageItem): void => {
    const manager = managers.find((snapshot) => snapshot.manager.id === item.manager)?.manager

    setConfirm({
      title: `卸载 ${item.name}`,
      danger: true,
      body: (
        <>
          将从 <strong>{manager?.name ?? item.manager}</strong> 卸载{' '}
          <strong>
            {item.name} {item.version}
          </strong>
          。
          <br />
          此操作不可撤销，相关命令与配置可能需要手动清理。
        </>
      ),
      confirmLabel: '确认卸载',
      onConfirm: () => {
        void runSingle(
          { type: 'uninstall', manager: item.manager, packageId: item.id },
          `卸载 ${item.name}`
        )
      }
    })
  }

  const title = selectedSnapshot?.manager.name ?? '总览'
  const subtitle = selectedSnapshot
    ? selectedSnapshot.manager.detected
      ? `${selectedSnapshot.manager.version ?? '版本未知'} · ${selectedSnapshot.packages.length} 个包`
      : selectedSnapshot.manager.description
    : scan
      ? `最后扫描 ${formatScanTime(scan.scannedAt)} · ${detected.length} 个管理器 · ${allPackages.length} 个包`
      : '正在读取本机包管理器…'

  return (
    <div className={`app ${logsOpen ? 'logs-open' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <Crown size={18} />
          </div>
          <div className="brand-text">
            <div className="brand-title">Chief</div>
            <div className="brand-sub">包总管</div>
          </div>
        </div>

        <nav className="nav" aria-label="主导航">
          <button
            type="button"
            className={`nav-item ${selected === 'all' ? 'is-active' : ''}`}
            onClick={() => setSelected('all')}
          >
            <LayoutDashboard size={17} />
            <span>总览</span>
            <span className="nav-spacer" />
            <span className="nav-count">{allPackages.length}</span>
          </button>

          <div className="nav-label">包管理器</div>

          {managers.map((snapshot) => {
            const { manager } = snapshot
            const stats = managerStats.get(manager.id)
            const itemUpdates = stats?.updates ?? 0

            return (
              <button
                key={manager.id}
                type="button"
                className={`nav-item nav-manager ${selected === manager.id ? 'is-active' : ''} ${
                  manager.detected ? '' : 'is-off'
                }`}
                onClick={() => setSelected(manager.id)}
                title={
                  manager.detected
                    ? `${manager.name} ${manager.version ?? ''}`
                    : `${manager.name} 未检测到`
                }
              >
                <span
                  className={`status-dot ${manager.detected ? 'ok' : 'off'} ${
                    itemUpdates > 0 ? 'warn' : ''
                  }`}
                />
                <span className="nav-name">{manager.name}</span>
                <span className="nav-spacer" />
                {itemUpdates > 0 && <span className="badge badge-warn">{itemUpdates}</span>}
                <span className="nav-count">{manager.detected ? stats?.packages ?? 0 : '—'}</span>
              </button>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          <button
            type="button"
            className="sidebar-link"
            onClick={() => {
              if (window.chief) void window.chief.openExternal('https://github.com/A1ether/chief')
            }}
          >
            <ExternalLink size={14} />
            项目主页
          </button>
          <div className="sidebar-version">Chief v0.1.0</div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>

          <div className="topbar-actions">
            {logs.length > 0 && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setLogsOpen((open) => !open)}
              >
                <Terminal size={16} />
                日志
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void refresh()}
              disabled={loading || anyBusy}
            >
              <RefreshCw size={16} className={loading ? 'spin' : ''} />
              重新扫描
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={openUpdateAll}
              disabled={availableUpdateTargets.length === 0}
            >
              <ArrowUpCircle size={16} />
              {selectedSnapshot ? `更新 ${selectedSnapshot.manager.name}` : '全部更新'}
              {scopeUpdates > 0 && <span className="btn-badge">{scopeUpdates}</span>}
            </button>
          </div>
        </header>

        <div className="content">
          {error && (
            <div className="banner banner-error" role="alert">
              <AlertTriangle size={17} />
              <span>{error}</span>
              <button type="button" className="banner-action" onClick={() => void refresh()}>
                重试
              </button>
            </div>
          )}

          {selectedSnapshot?.error && (
            <div className="banner banner-error">
              <AlertTriangle size={17} />
              <span>
                {selectedSnapshot.manager.name} 扫描失败：{selectedSnapshot.error}
              </span>
            </div>
          )}

          {loading && !scan ? (
            <div className="loading-state">
              <div className="loading-orbit">
                <Loader2 size={26} className="spin" />
              </div>
              <h2>正在扫描本机包管理器</h2>
              <p>逐个读取 brew、uv、mise、npm 等管理器的包列表…</p>
            </div>
          ) : selectedSnapshot && !selectedSnapshot.manager.detected ? (
            <div className="empty-manager">
              <div className="empty-icon">
                <Package size={28} />
              </div>
              <h2>未检测到 {selectedSnapshot.manager.name}</h2>
              <p>{selectedSnapshot.manager.description}</p>
              <div className="install-hint">
                <span>安装方式</span>
                <code>{selectedSnapshot.manager.installHint}</code>
              </div>
              <button type="button" className="btn btn-ghost" onClick={() => void refresh()}>
                <RefreshCw size={15} />
                安装后重新扫描
              </button>
            </div>
          ) : (
            <>
              <section className="stats" aria-label="统计">
                <div className="stat-card">
                  <div className="stat-icon">
                    <Boxes size={18} />
                  </div>
                  <div>
                    <div className="stat-value">{allPackages.length}</div>
                    <div className="stat-label">已安装包</div>
                  </div>
                </div>

                <div className={`stat-card ${updates.length > 0 ? 'is-warn' : ''}`}>
                  <div className="stat-icon">
                    <ArrowUpCircle size={18} />
                  </div>
                  <div>
                    <div className="stat-value">{updates.length}</div>
                    <div className="stat-label">可更新</div>
                  </div>
                </div>

                <div className="stat-card">
                  <div className="stat-icon">
                    <ShieldCheck size={18} />
                  </div>
                  <div>
                    <div className="stat-value">
                      {detected.length}
                      <span className="stat-total"> / {managers.length}</span>
                    </div>
                    <div className="stat-label">管理器已检测</div>
                  </div>
                </div>

                <div className="stat-card">
                  <div className="stat-icon">
                    <RefreshCw size={18} />
                  </div>
                  <div>
                    <div className="stat-value">
                      {scan ? `${(scan.durationMs / 1000).toFixed(1)}s` : '—'}
                    </div>
                    <div className="stat-label">本次扫描耗时</div>
                  </div>
                </div>
              </section>

              {selected === 'all' && (
                <section className="manager-grid" aria-label="包管理器">
                  {managers.map((snapshot) => {
                    const { manager } = snapshot
                    const stats = managerStats.get(manager.id)
                    const itemUpdates = stats?.updates ?? 0

                    return (
                      <button
                        key={manager.id}
                        type="button"
                        className={`manager-card ${manager.detected ? '' : 'is-off'} ${
                          snapshot.error ? 'has-error' : ''
                        }`}
                        onClick={() => setSelected(manager.id)}
                      >
                        <div className="manager-card-head">
                          <div className={`manager-icon accent-${manager.id}`}>
                            {managerInitial(manager.name)}
                          </div>
                          <div className="manager-card-title">
                            <h3>{manager.name}</h3>
                            <p>{manager.detected ? manager.version ?? '已检测' : '未检测到'}</p>
                          </div>
                          <span className={`badge ${itemUpdates > 0 ? 'badge-warn' : snapshot.error ? 'badge-danger' : manager.detected ? 'badge-ok' : 'badge-muted'}`}>
                            {snapshot.error
                              ? '扫描失败'
                              : itemUpdates > 0
                                ? `${itemUpdates} 可更新`
                                : manager.detected
                                  ? manager.capabilities.outdated
                                    ? '已是最新'
                                    : '已检测'
                                  : '未安装'}
                          </span>
                        </div>
                        <div className="manager-card-foot">
                          <span>
                            {manager.detected ? `${stats?.packages ?? 0} 个包` : manager.description}
                          </span>
                          <ChevronRight size={16} />
                        </div>
                      </button>
                    )
                  })}
                </section>
              )}

              <section className="panel">
                <div className="panel-head">
                  <div className="segmented" role="tablist" aria-label="筛选">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={filter === 'all'}
                      className={filter === 'all' ? 'is-active' : ''}
                      onClick={() => setFilter('all')}
                    >
                      全部
                      <span>{selectedSnapshot?.packages.length ?? allPackages.length}</span>
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={filter === 'updates'}
                      className={filter === 'updates' ? 'is-active' : ''}
                      onClick={() => setFilter('updates')}
                    >
                      可更新
                      <span>{selectedSnapshot ? managerStats.get(selectedSnapshot.manager.id)?.updates ?? 0 : updates.length}</span>
                    </button>
                  </div>

                  <label className="search">
                    <Search size={16} />
                    <input
                      type="search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="搜索包名或描述…"
                      aria-label="搜索包"
                    />
                  </label>
                </div>

                {visiblePackages.length === 0 ? (
                  <div className="table-empty">
                    <Check size={22} />
                    <h3>{filter === 'updates' ? '所有包都是最新的' : '没有找到匹配的包'}</h3>
                    <p>
                      {filter === 'updates'
                        ? '当前范围内没有可更新项。'
                        : query
                          ? '换个关键词试试，或切换到「全部」。'
                          : '这个管理器目前没有扫描到已安装包。'}
                    </p>
                  </div>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th className="col-package">包</th>
                          {selected === 'all' && <th className="col-source">来源</th>}
                          <th className="col-version">当前版本</th>
                          <th className="col-latest">最新</th>
                          <th className="col-kind">类型</th>
                          <th className="col-actions align-right">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visiblePackages.map((item) => {
                          const manager = managers.find(
                            (snapshot) => snapshot.manager.id === item.manager
                          )?.manager
                          const canUpdate =
                            item.outdated || manager?.capabilities.outdated === false

                          return (
                            <tr key={item.id}>
                              <td>
                                <div className="pkg-name">
                                  <div className="pkg-name-line">
                                    <span>{item.name}</span>
                                    {item.pinned && <span className="tag">固定</span>}
                                  </div>
                                  {item.description && <small>{item.description}</small>}
                                </div>
                              </td>
                              {selected === 'all' && (
                                <td>
                                  <span className={`source-tag accent-${item.manager}`}>
                                    {manager?.name ?? item.manager}
                                  </span>
                                </td>
                              )}
                              <td>
                                <code title={item.version}>{item.version}</code>
                              </td>
                              <td>
                                {item.outdated ? (
                                  item.latest ? (
                                    <code className="latest" title={item.latest}>{item.latest}</code>
                                  ) : (
                                    <span className="muted">未知</span>
                                  )
                                ) : manager?.capabilities.outdated === false ? (
                                  <span className="muted">未知</span>
                                ) : (
                                  <span className="up-to-date">
                                    <Check size={13} />
                                    最新
                                  </span>
                                )}
                              </td>
                              <td>
                                <span className="kind">{kindLabel(item.kind)}</span>
                              </td>
                              <td className="align-right">
                                <div className="row-actions">
                                  <button
                                    type="button"
                                    className="icon-btn"
                                    title={item.outdated ? '更新' : '更新到最新'}
                                    aria-label={`更新 ${item.name}`}
                                    disabled={isManagerBusy(item.manager) || !canUpdate}
                                    onClick={() => {
                                      void runSingle(
                                        {
                                          type: 'update',
                                          manager: item.manager,
                                          packageId: item.id
                                        },
                                        `更新 ${item.name}`
                                      )
                                    }}
                                  >
                                    <ArrowUpCircle size={16} />
                                  </button>
                                  <button
                                    type="button"
                                    className="icon-btn danger"
                                    title={item.pinned ? '固定包不可卸载' : '卸载'}
                                    aria-label={`卸载 ${item.name}`}
                                    disabled={isManagerBusy(item.manager) || item.pinned}
                                    onClick={() => openUninstall(item)}
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </main>

      {logsOpen && (
        <section className="logs" aria-label="运行日志">
          <header className="logs-head">
            <div className="logs-title">
              <Terminal size={15} />
              <span>运行日志</span>
              {runningTasks.length > 0 && <Loader2 size={14} className="spin" />}
            </div>
            <div className="logs-actions">
              {runningTasks.length > 0 ? (
                <span className="task-result running">
                  <Loader2 size={13} className="spin" />
                  {runningTasks.map((run) => managerLabel(run.manager)).join('、')} 运行中
                </span>
              ) : finishedTasks.length > 0 ? (
                <span
                  className={`task-result ${finishedTasks.every((run) => run.ok) ? 'ok' : 'fail'}`}
                >
                  {finishedTasks.every((run) => run.ok) ? (
                    <Check size={13} />
                  ) : (
                    <AlertTriangle size={13} />
                  )}
                  最近：
                  {finishedTasks
                    .slice(0, 3)
                    .map((run) => `${managerLabel(run.manager)} ${run.ok ? '✓' : '✕'}`)
                    .join(' · ')}
                </span>
              ) : null}
              <button
                type="button"
                className="icon-btn"
                aria-label="收起日志"
                onClick={() => setLogsOpen(false)}
              >
                <X size={15} />
              </button>
            </div>
          </header>

          <div className="logs-body">
            {logs.length === 0 ? (
              <div className="logs-empty">命令输出会显示在这里。</div>
            ) : (
              logs.map((line) => (
                <div key={line.id} className={`log-line is-${line.stream}`}>
                  <span className="log-time">{formatClock(line.at)}</span>
                  <span className="log-source">{managerLabel(line.manager)}</span>
                  <span className="log-text">{line.text}</span>
                </div>
              ))
            )}
            <div ref={logEnd} />
          </div>
        </section>
      )}

      {confirm && (
        <div className="modal-backdrop" role="presentation" onClick={() => setConfirm(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={`modal-icon ${confirm.danger ? 'is-danger' : ''}`}>
              {confirm.danger ? <AlertTriangle size={20} /> : <ArrowUpCircle size={20} />}
            </div>
            <h2 id="confirm-title">{confirm.title}</h2>
            <div className="modal-body">{confirm.body}</div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" autoFocus onClick={() => setConfirm(null)}>
                取消
              </button>
              <button
                type="button"
                className={`btn ${confirm.danger ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => confirm.onConfirm()}
              >
                {confirm.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}