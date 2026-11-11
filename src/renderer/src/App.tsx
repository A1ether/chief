import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import {
  AlertTriangle,
  ArrowUpCircle,
  Boxes,
  Check,
  ChevronDown,
  ChevronRight,
  Cpu,
  Crown,
  ExternalLink,
  GitFork,
  Layers,
  LayoutDashboard,
  Loader2,
  Moon,
  Package,
  RefreshCw,
  Search,
  ShieldCheck,
  Sun,
  Terminal,
  Trash2,
  X
} from 'lucide-react'
import type {
  LineageNode,
  ManagerId,
  ManagerSnapshot,
  PackageItem,
  ScanResult,
  TaskEvent,
  TaskRequest
} from '../../shared/types'

type Selection = 'all' | 'lineage' | ManagerId
type Theme = 'dark' | 'light'
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

interface InstallOption {
  /** Global root directory, stable across scans */
  key: string
  label: string
  /** Install path, shortened for display under the source name */
  detail?: string
  packages: number
  updates: number
}

interface InstallFilterProps {
  options: InstallOption[]
  total: number
  totalUpdates: number
  value: string
  onChange: (key: string) => void
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

function formatDuration(ms: number | undefined): string {
  if (typeof ms !== 'number') return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function compactPath(value: string): string {
  return value.replace(/\/lib\/node_modules$/, '').replace(/^\/Users\/[^/]+/, '~')
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

interface StatItem {
  key: string
  icon: ReactNode
  value: ReactNode
  label: string
  tone?: 'warn' | 'ok'
}

function StatCard({ icon, value, label, tone }: Omit<StatItem, 'key'>): React.JSX.Element {
  return (
    <div className={`stat-card ${tone ? `is-${tone}` : ''}`}>
      <div className="stat-icon">{icon}</div>
      <div>
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  )
}

function InstallFilter({
  options,
  total,
  totalUpdates,
  value,
  onChange
}: InstallFilterProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  const items = useMemo<InstallOption[]>(
    () => [
      {
        key: 'all',
        label: '全部安装',
        detail: '所有安装来源',
        packages: total,
        updates: totalUpdates
      },
      ...options
    ],
    [options, total, totalUpdates]
  )

  const currentIndex = Math.max(
    0,
    items.findIndex((item) => item.key === value)
  )
  const current = items[currentIndex] ?? items[0]!

  const close = useCallback((restoreFocus = false): void => {
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }, [])

  const openMenu = useCallback((): void => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return

    setAnchor({
      top: rect.bottom + 8,
      right: Math.max(12, window.innerWidth - rect.right)
    })
    setOpen(true)
  }, [])

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node
      if (wrapRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    const onViewportChange = (): void => setOpen(false)

    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('resize', onViewportChange)
    window.addEventListener('scroll', onViewportChange, true)

    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('resize', onViewportChange)
      window.removeEventListener('scroll', onViewportChange, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    setActive(currentIndex)
    menuRef.current?.focus()
  }, [currentIndex, open])

  const select = (key: string): void => {
    onChange(key)
    close(true)
  }

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close(true)
      return
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const delta = event.key === 'ArrowDown' ? 1 : -1
      setActive((index) => (index + delta + items.length) % items.length)
      return
    }

    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      setActive(event.key === 'Home' ? 0 : items.length - 1)
      return
    }

    if (event.key === 'Tab') {
      setOpen(false)
      return
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      const item = items[active]
      if (item) select(item.key)
    }
  }

  return (
    <div className="install-filter" ref={wrapRef}>
      <span className="install-filter-label">安装</span>
      <button
        ref={triggerRef}
        type="button"
        id={`${menuId}-trigger`}
        className={`install-select ${open ? 'is-open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={(event) => {
          if (open && event.key === 'Escape') {
            event.preventDefault()
            close(true)
            return
          }
          if (open) return
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
          event.preventDefault()
          openMenu()
        }}
      >
        <span className="install-select-mark">
          <Package size={14} />
        </span>
        <span className="install-select-text">
          <span className="install-select-name">{current.label}</span>
          <span className="install-select-meta">
            {current.packages} 个包
            {current.updates > 0 ? ` · ${current.updates} 可更新` : ''}
          </span>
        </span>
        <ChevronDown size={15} className="install-chevron" />
      </button>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          className="install-menu"
          role="listbox"
          aria-label="按安装来源筛选"
          aria-activedescendant={`${menuId}-opt-${active}`}
          tabIndex={-1}
          style={{ top: anchor?.top, right: anchor?.right }}
          onKeyDown={onMenuKeyDown}
        >
          <div className="install-menu-head">
            <span>安装来源</span>
            <span>{options.length} 处</span>
          </div>
          {items.map((item, index) => {
            const selected = item.key === current.key

            return (
              <button
                key={item.key}
                id={`${menuId}-opt-${index}`}
                type="button"
                role="option"
                aria-selected={selected}
                tabIndex={-1}
                className={`install-menu-item ${selected ? 'is-selected' : ''} ${
                  index === active ? 'is-active' : ''
                } ${item.key === 'all' ? 'is-all' : ''}`}
                style={{ '--i': Math.min(index, 8) } as React.CSSProperties}
                onMouseEnter={() => setActive(index)}
                onClick={() => select(item.key)}
              >
                <span className="install-menu-mark">
                  {item.key === 'all' ? <Layers size={14} /> : <Package size={14} />}
                </span>
                <span className="install-menu-text">
                  <span className="install-menu-name">{item.label}</span>
                  {item.detail && <span className="install-menu-detail">{item.detail}</span>}
                </span>
                {item.updates > 0 && (
                  <span className="install-menu-updates">{item.updates} 更新</span>
                )}
                <span className="install-menu-count">{item.packages}</span>
                <Check size={14} className="install-menu-check" />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function LineageBranch({
  node,
  onSelect,
  depth = 0
}: {
  node: LineageNode
  onSelect: (id: ManagerId, installRoot?: string) => void
  depth?: number
}): React.JSX.Element {
  const managerId = node.kind === 'manager' ? node.managerId : undefined
  const Icon = node.kind === 'runtime' ? Cpu : Package

  return (
    <li className={`tree-item ${depth === 0 ? 'is-root' : ''}`}>
      <div
        className={`tree-row ${managerId ? 'is-clickable' : ''}`}
        {...(managerId
          ? {
              role: 'button',
              tabIndex: 0,
              onClick: () => onSelect(managerId, node.installRoot),
              onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                onSelect(managerId, node.installRoot)
              }
            }
          : {})}
      >
        {managerId ? (
          <span className={`tree-avatar accent-${managerId}`}>{managerInitial(node.label)}</span>
        ) : (
          <span className="tree-avatar is-soft">
            <Icon size={13} />
          </span>
        )}
        <span className="tree-label">{node.label}</span>
        {node.version && <span className="tree-version">{node.version}</span>}
        {node.detail && <span className="tree-detail">{node.detail}</span>}
        {managerId && <ChevronRight size={14} className="tree-go" />}
      </div>

      {node.children.length > 0 && (
        <ul className="tree-children">
          {node.children.map((child) => (
            <LineageBranch
              key={`${node.id}>${child.id}`}
              node={child}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

export default function App(): React.JSX.Element {
  const [scan, setScan] = useState<ScanResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Selection>('all')
  const [installRoot, setInstallRoot] = useState<string>('all')
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [logs, setLogs] = useState<LogLine[]>([])
  const [logsOpen, setLogsOpen] = useState(false)
  const [tasks, setTasks] = useState<Partial<Record<ManagerId, TaskRun>>>({})
  const [refreshPending, setRefreshPending] = useState(0)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.dataset['theme'] === 'light' ? 'light' : 'dark'
  )

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

  /** 切换页面时重置安装筛选；来源关系里的 npm 节点会带上具体安装目录 */
  const selectManager = useCallback((id: Selection, root = 'all'): void => {
    setSelected(id)
    setInstallRoot(root)
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
    document.documentElement.dataset['theme'] = theme
    localStorage.setItem('chief-theme', theme)
  }, [theme])

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

  /** 每个全局安装目录一项，供安装筛选使用 */
  const installOptions = useMemo<InstallOption[]>(() => {
    if (!selectedSnapshot) return []

    const options = new Map<string, InstallOption>()
    for (const item of selectedSnapshot.packages) {
      const root = item.meta?.['root']
      if (!root) continue

      const current = options.get(root)
      if (current) {
        current.packages += 1
        if (item.outdated) current.updates += 1
        continue
      }

      const label = item.meta?.['label'] ?? root
      const detail = compactPath(root)

      options.set(root, {
        key: root,
        label,
        ...(detail !== label ? { detail } : {}),
        packages: 1,
        updates: item.outdated ? 1 : 0
      })
    }

    return [...options.values()].sort((a, b) => a.label.localeCompare(b.label))
  }, [selectedSnapshot])

  const selectedInstall = useMemo(
    () => installOptions.find((option) => option.key === installRoot) ?? null,
    [installOptions, installRoot]
  )

  // 重新扫描后安装可能消失，筛选回到「全部安装」
  useEffect(() => {
    if (installRoot === 'all') return
    if (installOptions.some((option) => option.key === installRoot)) return
    setInstallRoot('all')
  }, [installOptions, installRoot])

  /** 同一个管理器可能横跨多个安装（例如多个 node 版本各自的 npm） */
  const installLabels = useMemo(() => {
    const labels = new Set<string>()
    for (const item of selectedSnapshot?.packages ?? []) {
      const label = item.meta?.['label']
      if (label) labels.add(label)
    }
    return labels
  }, [selectedSnapshot])

  /** 安装筛选后的包集合；未选择具体安装时就是整个管理器 */
  const installPackages = useMemo(() => {
    if (!selectedSnapshot) return allPackages
    if (!selectedInstall) return selectedSnapshot.packages
    return selectedSnapshot.packages.filter((item) => item.meta?.['root'] === selectedInstall.key)
  }, [allPackages, selectedInstall, selectedSnapshot])

  const visiblePackages = useMemo(() => {
    let items = installPackages

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
  }, [filter, installPackages, managers, query])

  const updateTargets = useMemo(() => {
    if (selectedSnapshot) {
      return installPackages.some((item) => item.outdated) ? [selectedSnapshot] : []
    }
    return managers.filter(
      (snapshot) => snapshot.manager.detected && snapshot.packages.some((item) => item.outdated)
    )
  }, [installPackages, managers, selectedSnapshot])

  const scopeUpdates = installPackages.filter((item) => item.outdated).length

  /**
   * 总览时看全局口径；选中某个管理器时，只汇报这个管理器自己的数字。
   */
  const statItems = useMemo<StatItem[]>(() => {
    if (selectedSnapshot) {
      const { manager, durationMs } = selectedSnapshot
      const total = installPackages.length
      const updatable = scopeUpdates
      const tracksUpdates = manager.capabilities.outdated

      return [
        {
          key: 'packages',
          icon: <Boxes size={20} />,
          value: total,
          label: '已安装包'
        },
        {
          key: 'updates',
          icon: <ArrowUpCircle size={20} />,
          value: updatable,
          label: '可更新',
          tone: updatable > 0 ? 'warn' : undefined
        },
        {
          key: 'current',
          icon: <Check size={20} />,
          value: tracksUpdates ? total - updatable : '—',
          label: tracksUpdates ? '已是最新' : '不支持更新检测',
          tone: tracksUpdates && updatable === 0 ? 'ok' : undefined
        },
        {
          key: 'duration',
          icon: <RefreshCw size={20} />,
          value: formatDuration(durationMs),
          label: '管理器扫描耗时'
        }
      ]
    }

    return [
      {
        key: 'packages',
        icon: <Boxes size={20} />,
        value: allPackages.length,
        label: '已安装包'
      },
      {
        key: 'updates',
        icon: <ArrowUpCircle size={20} />,
        value: updates.length,
        label: '可更新',
        tone: updates.length > 0 ? 'warn' : undefined
      },
      {
        key: 'managers',
        icon: <ShieldCheck size={20} />,
        value: (
          <>
            {detected.length}
            <span className="stat-total"> / {managers.length}</span>
          </>
        ),
        label: '管理器已检测'
      },
      {
        key: 'duration',
        icon: <RefreshCw size={20} />,
        value: formatDuration(scan?.durationMs),
        label: '本次扫描耗时'
      }
    ]
  }, [allPackages.length, detected.length, installPackages.length, managers.length, scan?.durationMs, scopeUpdates, selectedSnapshot, updates.length])

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

    const scopedRoot = selectedInstall?.key
    const scopedLabel = selectedInstall?.label

    await Promise.all(
      targets.map((target) => {
        const installRoot =
          scopedRoot && target.manager.id === selectedSnapshot?.manager.id ? scopedRoot : undefined

        return runTaskForManager(
          {
            type: 'update-all',
            manager: target.manager.id,
            ...(installRoot ? { installRoot } : {})
          },
          `更新 ${target.manager.name}${installRoot && scopedLabel ? ` · ${scopedLabel}` : ''}`
        )
      })
    )
  }

  const openUpdateAll = (): void => {
    if (availableUpdateTargets.length === 0) return

    const summary = selectedInstall
      ? `${selectedSnapshot?.manager.name ?? ''}（${selectedInstall.label}，${scopeUpdates} 个）`
      : availableUpdateTargets
          .map(
            (target) =>
              `${target.manager.name}（${target.packages.filter((item) => item.outdated).length} 个）`
          )
          .join('、')

    setConfirm({
      title: selectedSnapshot
        ? `更新 ${selectedSnapshot.manager.name}${
            selectedInstall ? `（${selectedInstall.label}）` : ''
          }的全部包`
        : '更新全部可更新包',
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

  const lineage = scan?.lineage

  const overviewSubtitle = selectedSnapshot
    ? selectedSnapshot.manager.detected
      ? `${selectedSnapshot.manager.version ?? '版本未知'} · ${selectedSnapshot.packages.length} 个包${
          installLabels.size > 1 ? ` · ${installLabels.size} 个安装` : ''
        }${selectedInstall ? ` · 正在查看 ${selectedInstall.label}` : ''}`
      : selectedSnapshot.manager.description
    : scan
      ? `最后扫描 ${formatScanTime(scan.scannedAt)} · ${detected.length} 个管理器 · ${allPackages.length} 个包`
      : '正在读取本机包管理器…'

  const title = selected === 'lineage' ? '来源关系' : selectedSnapshot?.manager.name ?? '总览'
  const subtitle =
    selected === 'lineage'
      ? scan
        ? `按安装路径推断 · ${lineage?.roots.length ?? 0} 个根节点 · ${lineage?.edges ?? 0} 条关系`
        : '正在读取安装关系…'
      : overviewSubtitle

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
            onClick={() => selectManager('all')}
          >
            <LayoutDashboard size={17} />
            <span>总览</span>
            <span className="nav-spacer" />
            <span className="nav-count">{allPackages.length}</span>
          </button>

          <button
            type="button"
            className={`nav-item ${selected === 'lineage' ? 'is-active' : ''}`}
            onClick={() => selectManager('lineage')}
            title="哪些管理器装在哪些管理器里"
          >
            <GitFork size={17} />
            <span>来源关系</span>
            <span className="nav-spacer" />
            <span className="nav-count">{scan?.lineage.edges ?? '—'}</span>
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
                onClick={() => selectManager(manager.id)}
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
            <button
              type="button"
              className="btn btn-ghost theme-toggle"
              onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
              title={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
              aria-label={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              {theme === 'dark' ? '浅色' : '深色'}
            </button>

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
            {selected !== 'lineage' && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={openUpdateAll}
                disabled={availableUpdateTargets.length === 0}
                title={selectedInstall ? `只更新 ${selectedInstall.label} 中的包` : undefined}
              >
                <ArrowUpCircle size={16} />
                {selectedSnapshot ? `更新 ${selectedSnapshot.manager.name}` : '全部更新'}
                {scopeUpdates > 0 && <span className="btn-badge">{scopeUpdates}</span>}
              </button>
            )}
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
          ) : selected === 'lineage' ? (
            <section className="panel lineage-panel">
              <div className="lineage-head">
                <div className="lineage-head-text">
                  <h2>安装链</h2>
                  <p>根据可执行文件与全局包目录的位置推断：谁装在谁里面。点击管理器进入详情。</p>
                </div>
                <div className="lineage-legend" aria-hidden="true">
                  <span className="lineage-legend-title">图例</span>
                  <span>
                    <Package size={13} />
                    包
                  </span>
                  <span>
                    <Cpu size={13} />
                    运行时
                  </span>
                </div>
              </div>

              {lineage && lineage.roots.length > 0 ? (
                <div className="lineage-body">
                  <ul className="tree">
                    {lineage.roots.map((root) => (
                      <LineageBranch
                        key={root.id}
                        node={root}
                        onSelect={selectManager}
                        depth={0}
                      />
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="table-empty">
                  <h3>还没有识别到安装关系</h3>
                  <p>重新扫描后再试。</p>
                </div>
              )}
            </section>
          ) : (
            <>
              <section
                className="stats"
                aria-label={selectedSnapshot ? `${selectedSnapshot.manager.name} 统计` : '总览统计'}
              >
                {statItems.map(({ key, ...item }) => (
                  <StatCard key={key} {...item} />
                ))}
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
                        onClick={() => selectManager(manager.id)}
                      >
                        <div className="manager-card-head">
                          <div className={`manager-icon accent-${manager.id}`}>
                            {managerInitial(manager.name)}
                          </div>
                          <div className="manager-card-title">
                            <h3>{manager.name}</h3>
                            <p title={manager.version ?? undefined}>
                              {manager.detected ? manager.version ?? '已检测' : '未检测到'}
                            </p>
                          </div>
                        </div>
                        <div className="manager-card-foot">
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
                          <span className="manager-card-count">
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
                      <span>{installPackages.length}</span>
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={filter === 'updates'}
                      className={filter === 'updates' ? 'is-active' : ''}
                      onClick={() => setFilter('updates')}
                    >
                      可更新
                      <span>{scopeUpdates}</span>
                    </button>
                  </div>

                  <div className="panel-tools">
                    {installOptions.length > 1 && (
                      <InstallFilter
                        options={installOptions}
                        total={selectedSnapshot?.packages.length ?? installPackages.length}
                        totalUpdates={
                          selectedSnapshot?.packages.filter((item) => item.outdated).length ?? 0
                        }
                        value={selectedInstall?.key ?? 'all'}
                        onChange={setInstallRoot}
                      />
                    )}

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
                          : selectedInstall
                            ? '这个安装目前没有扫描到已安装包。'
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
                                  {item.description &&
                                    !(
                                      selectedInstall &&
                                      item.description === selectedInstall.label
                                    ) && <small>{item.description}</small>}
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
