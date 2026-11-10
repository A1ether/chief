# Chief — 调研与技术方案

> **Chief of your package managers.**
> 一个本地优先的 macOS 桌面工具：扫描、可视化并管理本机所有包管理器。

- 文档日期：2026-11-10
- 仓库名：`chief`（GitHub：`A1ether/chief`，当前未被占用）
- 目标平台：macOS（Apple Silicon 优先，Intel 兼容）
- 许可证：MIT

---

## 1. 项目定位

### 1.1 要解决的问题

macOS 开发者的软件包散落在多个管理器中：

| 管理器 | 典型内容 |
| --- | --- |
| Homebrew | 系统工具、CLI、GUI Cask |
| uv | Python CLI 工具（`uv tool`） |
| mise | 语言运行时（Node、Java、Python…） |
| npm / pnpm / bun | 全局 Node CLI |
| gem | Ruby 全局 gem |

现状是每个管理器都要记一套命令，更新状态互不可见。Chief 把它们收进一个界面：

1. **扫描**：自动发现本机装了哪些包管理器、各自版本、可执行文件路径。
2. **可视化**：统一展示包总量、可更新项、每个管理器的健康状态。
3. **管理**：单包更新、单包卸载、按管理器全量更新，实时输出命令日志。
4. **安全**：只读扫描默认执行；更新/卸载必须二次确认；绝不使用 `sudo`。

### 1.2 非目标（v1 不做）

- 项目级依赖管理（`package.json` / `pyproject.toml` 内的依赖）——与「本机全局包」是两件事。
- 包市场式发现与安装（先解决「管好已装的」）。
- Windows / Linux 适配（架构预留，v1 只保证 macOS）。
- 系统级包管理器（`softwareupdate`、`pkgutil`）与需要 sudo 的操作。
- 自动清理/`autoremove`（不可逆，且容易误删）。

---

## 2. GitHub 竞品调研

调研方式：`gh search repos`（2026-11-10），围绕 Homebrew GUI、package manager GUI/TUI、unified/cross package manager、package manager manager 等关键词检索，并对候选仓库做 `gh repo view` 元数据核验。

### 2.1 竞品清单

| 项目 | Stars | 技术栈 | 覆盖范围 | License | 评估结论 |
| --- | ---: | --- | --- | --- | --- |
| [Devolutions/UniGetUI](https://github.com/Devolutions/UniGetUI) | 26.9k | C# / .NET / WinUI | Windows：winget、Scoop、Chocolatey、npm、pip 等 | MIT | **产品形态最接近**：自称 “package manager manager”。但 Windows 专属、C# 技术栈，**无法直接复用**；只借鉴功能矩阵与交互。 |
| [topgrade-rs/topgrade](https://github.com/topgrade-rs/topgrade) | 4.8k | Rust CLI | brew、npm、pipx、cargo、gem、mise 等大量管理器 | GPL-3.0 | 全量更新引擎的成熟参考。**GPL 代码不能并入 MIT 项目**；可作为用户已安装时的可选外部引擎，或仅参考其命令矩阵。 |
| [wickenico/WailBrew](https://github.com/wickenico/WailBrew) | 2.9k | Go + Wails + React | 仅 Homebrew | MIT | 交互与信息架构参考价值高（管理器状态、批量更新、日志）。Go/Wails 后端无法并入 Electron。 |
| [hreinssondev/BrewStation](https://github.com/hreinssondev/BrewStation) | 407 | 未标注主语言 | 仅 Homebrew | 未标注 | 仓库无明确 License，**不可复用代码**。 |
| [romankurnovskii/BrewMate](https://github.com/romankurnovskii/BrewMate) | 301 | Electron + React + TS | 仅 Homebrew / Cask | MIT | **技术栈最接近**，可参考 Electron 工程结构、打包与 Cask 处理；但仅覆盖 brew，核心多管理器能力仍需自研。 |
| [starhaven-io/Brewy](https://github.com/starhaven-io/Brewy) | 146 | Swift / SwiftUI | 仅 Homebrew | AGPL-3.0 | 原生 UX 参考；AGPL 不适合当前项目，**不复用**。 |
| [opennavo/OpenNavo](https://github.com/opennavo/OpenNavo) | 93 | Tauri + Rust + Nuxt | 仅 Homebrew | GPL-3.0 | 安装/更新/卸载流程与目录站思路可参考；**不复用代码**。 |
| [unjs/nypm](https://github.com/unjs/nypm) | 713 | TypeScript | npm / pnpm / yarn / bun / deno | MIT | 只做**项目级**包管理器检测与命令封装，不管理全局已装包，**不直接依赖**。 |
| [q-nick/npm-gui](https://github.com/q-nick/npm-gui) | 672 | TypeScript | npm / pnpm / yarn | 未核验 | 面向项目依赖的 GUI，不覆盖全局包，**不适用**。 |
| [SudoMakeMeASandwichDE/unipkg](https://github.com/SudoMakeMeASandwichDE/unipkg) | 6 | Python | 跨管理器 CLI | GPL-3.0 | 功能概念参考，代码规模与成熟度不足。 |

### 2.2 调研结论

1. **Windows 有成熟答案，macOS 没有。** UniGetUI 验证了「包管理器管理器」的产品价值，但 macOS 侧只有 BrewStation / WailBrew / BrewMate / Brewy / OpenNavo 等 **单管理器（Homebrew）GUI**。
2. **没有任何成熟项目同时覆盖 brew + uv + mise + npm 全局包。** 这是 Chief 的差异化空位。
3. **没有可直接 fork/依赖的候选。** 要么平台不符（UniGetUI），要么只覆盖 brew（BrewMate/WailBrew），要么只覆盖项目级 JS 依赖（nypm），要么许可证不兼容（topgrade/OpenNavo/Brewy 的 GPL/AGPL）。
4. **最值得复用的是官方 CLI 的 JSON 输出**，而不是第三方代码。

### 2.3 代码复用策略

| 对象 | 复用方式 | 说明 |
| --- | --- | --- |
| Homebrew JSON API | **直接使用** | `brew info --json=v2 --installed` 一次拿到 formula/cask 的版本、最新版、outdated、描述、主页。 |
| mise JSON | **直接使用** | `mise ls --json` + `mise outdated --json`。 |
| npm / pnpm JSON | **直接使用** | `npm ls -g --json`、`npm outdated -g --json`、`pnpm ls/outdated -g --json`。 |
| uv 文本输出 | **解析** | uv 尚无 JSON 列表；`uv tool list --outdated` 输出稳定，按行解析。 |
| topgrade | **可选外部引擎 / 命令参考** | 不复制 GPL 代码；v1 不依赖。未来检测到用户已安装时可提供「交给 topgrade 全量更新」。 |
| WailBrew / BrewMate / OpenNavo | **仅参考交互与工程结构** | 不复制代码。 |
| UniGetUI | **仅参考功能矩阵** | 平台与语言均不兼容。 |
| nypm | **不依赖** | 解决的是另一个问题（项目级 JS 包管理器）。 |

**结论：v1 约 95% 自研，复用边界清晰——复用官方 CLI 协议，复用成熟产品的交互经验，不复用不兼容许可证的代码。**

---

## 3. 技术选型

### 3.1 候选对比

| 方案 | AI 友好度 | 本机条件 | 包体 | 主要风险 | 结论 |
| --- | --- | --- | --- | --- | --- |
| **Electron + React + TypeScript** | 高：训练语料最多，TS 全栈，错误直观 | Node 26 / pnpm 12 已有，无需新工具链 | ~100–150MB | 包体大；需要允许 electron 安装脚本 | **选用** |
| Tauri 2 + React | 中：Rust 编译错误对 AI/人都更陡 | **未安装 Rust**，需新增工具链 | ~10MB | 首次编译慢，跨语言调试成本高 | 暂不选 |
| Wails + React | 中低：资料与 AI 语料少 | Go 已安装 | ~20MB | 生态窄，排错资料少 | 不选 |
| 本地 Web（Node + Vite） | 高 | 已有 | 无 | 不是桌面应用，需手动开浏览器 | 备选（可作为无 Electron 的降级模式） |
| TUI（Go/Rust） | 中 | Go 已有 | 小 | 与「可视化」目标不符 | 不选 |

### 3.2 最终技术栈

| 层 | 选择 | 版本策略 |
| --- | --- | --- |
| 桌面壳 | Electron | 45.x |
| 构建 | electron-vite | 6.x |
| 前端 | React 19 + TypeScript | React 19.x / TS 5.9 |
| 打包 | electron-builder | 26.x（M4 阶段接入） |
| 校验 | zod | 4.x（IPC 边界） |
| 图标 | lucide-react | 1.x |
| 样式 | 原生 CSS + design tokens | 不引入 Tailwind，减少配置面 |
| 核心层 | 纯 Node（无 Electron 依赖） | 可被 CLI 脚本直接复用 |

> 选择 TS 5.9 而不是 7.x：当前 electron-vite / 类型生态对 5.9 的兼容性最稳，升级收益小。待工具链稳定后再评估。

### 3.3 为什么这套栈「利好 vibe coding」

1. **单一语言**：主进程、preload、渲染进程、核心层全部 TypeScript。
2. **配置文件少**：一个 `electron.vite.config.ts`、一个 `tsconfig.json`、一个 `package.json`。
3. **可脱离 GUI 验证**：`pnpm core:scan` 直接跑核心扫描并输出 JSON，AI 不需要启动窗口就能验证适配器。
4. **适配器模式**：新增一个包管理器 = 新增一个文件 + 注册一行，复制粘贴即可。
5. **错误可读**：所有 CLI 失败都保留原始 stderr，并映射成带「下一步」的中文提示。
6. **类型即文档**：`src/shared/types.ts` 是 IPC 契约的唯一来源；zod 在入口校验。
7. **小依赖面**：不引入状态管理库、UI 组件库、ORM；React 状态足够。

---

## 4. 数据源与命令矩阵（已在本机验证）

验证环境：macOS Darwin 25.6.0 / Apple Silicon；Homebrew 7.0.13；uv 0.12.11；mise 2026.11.5；npm 12.0.2；pnpm 12.18.0；bun 1.4.4。

| 管理器 | 检测 | 列表 | 可更新 | 单包更新 | 全量更新 | 卸载 |
| --- | --- | --- | --- | --- | --- | --- |
| brew | `brew --version` | `brew info --json=v2 --installed` | JSON 内 `outdated` + `versions.stable` / cask `version` | `brew upgrade <formula>` / `brew upgrade --cask <token>` | `brew upgrade` | `brew uninstall <formula>` / `brew uninstall --cask <token>` |
| uv | `uv --version` | `uv tool list` | `uv tool list --outdated`（文本，含 `[latest: x]`） | `uv tool upgrade <name>` | `uv tool upgrade --all` | `uv tool uninstall <name>` |
| mise | `mise --version` | `mise ls --json` | `mise outdated --json` | `mise upgrade <tool>@<version>` | `mise upgrade` | `mise uninstall <tool>@<version>` |
| npm | `npm -v` | `npm ls -g --depth=0 --json` | `npm outdated -g --json` | `npm install -g <name>@latest` | `npm update -g` | `npm uninstall -g <name>` |
| pnpm | `pnpm -v` | `pnpm ls -g --depth=0 --json` | `pnpm outdated -g --json` | `pnpm add -g <name>@latest` | `pnpm update -g` | `pnpm remove -g <name>` |
| bun | `bun --version` | `bun pm ls -g`（文本） | v1 暂标记未知 | `bun update -g <name>` | `bun update -g` | `bun remove -g <name>` |
| gem | `gem --version` | `gem list --local`（文本） | `gem outdated`（文本） | `gem update <name>` | `gem update` | `gem uninstall <name>` |

### 4.1 已踩到的坑

1. **`brew outdated` 会触发自动更新**，输出前有一大段提示。v1 改用 `brew info` 里的 `outdated` 字段，只跑一条命令。
2. **GUI 应用的 PATH 与终端不同**：从 Finder/Dock 启动的 Electron 拿不到 Homebrew / mise shim 的 PATH。启动时通过登录 shell 取一次 PATH，并合并已知目录。
3. **Homebrew cask 的 `installed` 字段可能是字符串也可能是数组**，解析时两者都要兼容。
4. **cask 与 formula 的卸载命令不同**，必须带 `--cask`；数据模型里保存 `kind`。
5. **npm / pnpm 在有可更新项时 `outdated` 可能以 exit code 1 结束**，但 stdout 仍是合法 JSON，不能当失败。
6. **uv 没有 JSON 列表**；执行行以 `- ` 开头，解析时要跳过。
7. **mise 卸载必须给到唯一版本**（`node@26.8.1`），只给 `node` 会因多版本歧义失败。
8. **npm 由 mise 管理时，`npm ls -g` 里的 npm/pnpm 版本与 `npm -v` 可能不一致**——UI 按「管理器 + 包」维度展示，不做跨管理器去重，避免误导。
9. **绝不用 `shell: true`**；所有命令都以参数数组传入，包名做字符白名单校验。

---

## 5. 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│ Renderer (React 19 + TS)                                    │
│  总览 / 管理器侧栏 / 包表格 / 日志抽屉 / 确认弹窗             │
└───────────────▲─────────────────────────────────────────────┘
                │ window.chief (typed API)
┌───────────────┴─────────────────────────────────────────────┐
│ Preload (contextBridge)                                     │
│  scan() / task() / onTaskEvent() / openExternal()           │
└───────────────▲─────────────────────────────────────────────┘
                │ ipcMain.handle / webContents.send
┌───────────────┴─────────────────────────────────────────────┐
│ Main (Electron)                                             │
│  ipc.ts：zod 校验 → 调用 core → 转发任务事件                  │
└───────────────▲─────────────────────────────────────────────┘
                │ 纯 Node，无 Electron 依赖
┌───────────────┴─────────────────────────────────────────────┐
│ Core                                                        │
│  env.ts      登录 shell PATH 解析 + 可执行文件定位             │
│  exec.ts     spawn（shell:false）/ 超时 / 流式日志             │
│  scan.ts     探测 → 并行列表/outdated → 合并快照               │
│  tasks.ts    查找包 → 生成命令 → 流式执行 → 返回结果           │
│  adapters/   brew | uv | mise | npm | pnpm | bun | gem       │
└───────────────▲─────────────────────────────────────────────┘
                │ 官方 CLI（绝对路径）
        brew / uv / mise / npm / pnpm / bun / gem
```

### 5.1 目录结构

```
chief/
├── docs/PLAN.md
├── scripts/scan.ts              # 无 GUI 核心冒烟测试
├── src/
│   ├── main/                    # Electron 主进程
│   │   ├── index.ts
│   │   └── ipc.ts
│   ├── preload/index.ts         # 类型化 bridge
│   ├── renderer/
│   │   ├── index.html
│   │   └── src/{main.tsx,App.tsx,styles.css,env.d.ts}
│   ├── shared/{types.ts,schemas.ts}
│   └── core/
│       ├── env.ts / exec.ts / scan.ts / tasks.ts / registry.ts
│       └── adapters/{types.ts,helpers.ts,brew.ts,uv.ts,mise.ts,npm.ts,pnpm.ts,bun.ts,gem.ts}
├── electron.vite.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

### 5.2 适配器契约

```ts
interface PackageManagerAdapter {
  id: ManagerId
  name: string
  description: string
  probe(ctx: Context): Promise<ManagerProbe>
  list(ctx: Context, runtime: Runtime): Promise<PackageItem[]>
  outdated?: (ctx, runtime, packages) => Promise<Map<string, string>>
  commands: {
    update(pkg: PackageItem, runtime: Runtime): CommandSpec
    updateAll(runtime: Runtime): CommandSpec
    uninstall(pkg: PackageItem, runtime: Runtime): CommandSpec
  }
}
```

新增管理器只需：实现文件 → 在 `registry.ts` 注册 → 在 UI 类型枚举里加 id → `pnpm core:scan` 验证。

### 5.3 数据模型（核心字段）

```ts
type PackageItem = {
  id: string            // `${manager}:${stable-key}`
  manager: ManagerId
  name: string          // 展示名
  version: string
  latest?: string
  kind: 'formula' | 'cask' | 'tool' | 'runtime' | 'npm-global' | 'gem'
  outdated: boolean
  pinned?: boolean
  description?: string
  homepage?: string
  target: string        // 传给 CLI 的参数（formula 全名 / cask token / tool@version）
}
```

### 5.4 任务与流式日志

- 单任务串行：UI 在任务运行期间禁用其他操作。
- 主进程 `spawn` 后按行读取 stdout/stderr，通过 `chief:task-event` 推送。
- 渲染进程维护最多 300 行日志；任务结束显示退出码与友好结论。
- 任务结束后自动触发一次重新扫描。

---

## 6. 安全与可靠性

| 措施 | 实现 |
| --- | --- |
| 命令注入 | `spawn(command, args, { shell: false })`；命令必须是解析出的绝对路径 |
| 包名校验 | `TaskRequest` 经 zod 校验；包名白名单 `^[A-Za-z0-9@._/+:@~-]+$` |
| 目标存在性 | 执行前重新 `list()`，按 `id` 查找真实包；找不到即拒绝 |
| 破坏性操作 | 卸载、全量更新必须弹窗二次确认；显示管理器、包名、版本 |
| 权限 | 永不拼接 `sudo`；需要提权的命令直接失败并提示用户手动处理 |
| 只读默认 | 启动只做扫描；不自动更新、不自动清理 |
| 超时 | 扫描 90s / 更新 15min / 版本探测 5s，超时终止进程 |
| 输出截断 | 单命令 stdout/stderr 上限 32MB，超出提示截断 |
| 外链 | 只允许 `https?:`，交给系统浏览器 |

---

## 7. UI / UX

### 7.1 布局

- **左侧栏**：品牌区、总览、管理器列表（状态点 / 包数 / 更新数）、底部版本。
- **主区**：标题 + 最后扫描时间 + 重新扫描 + 全部更新；统计卡；管理器卡；包表格。
- **日志抽屉**：任务运行时从底部滑出，等宽字体，stdout/stderr 分色，可折叠。
- **确认弹窗**：危险操作统一使用，Esc 关闭，焦点默认在「取消」。

### 7.2 视觉

- 深色「总控台」气质：墨黑背景、暖铜色强调（Chief / 指挥官隐喻）。
- 设计 token 集中在 `:root`；不引入 UI 框架。
- 状态色：铜色=可更新，绿色=最新，红色=失败，蓝色=信息。
- 字体：系统 SF / PingFang SC；日志使用 SF Mono。
- 动效克制：只保留 fade-in、扫描 spinner、日志流入；尊重 `prefers-reduced-motion`。

### 7.3 空态与错误态

- 未检测到管理器：卡片置灰 + 安装提示。
- 某管理器扫描失败：该卡片显示错误，其他管理器不受影响。
- 无包/无更新：友好空态文案，不显示空表格骨架。
- 命令失败：日志抽屉保留 stderr，顶部 banner 给出「查看日志 / 重试」。

---

## 8. MVP 范围与里程碑

### v0.1（本次实现）

| 阶段 | 内容 | 验收 |
| --- | --- | --- |
| M0 脚手架 | Electron + Vite + React + TS；typed IPC；`pnpm lint` / `pnpm core:scan` | 窗口能启动；类型检查通过 |
| M1 扫描与可视化 | 7 个适配器的探测/列表/outdated；总览、侧栏、统计卡、包表格 | `core:scan` 输出真实数据；界面展示数量正确 |
| M2 管理动作 | 单包更新/卸载、按管理器全量更新、流式日志、确认弹窗 | 选择一个可更新包能完成更新并刷新 |
| M3 工程化 | README、脚本、错误映射、暗色视觉打磨 | 新同学按 README 可跑起来 |

### v0.2（后续）

- 批量选择多个包更新。
- topgrade 可选引擎（检测到才显示）。
- 扫描结果缓存 + 后台增量刷新。
- 安装（搜索 + 安装）能力。
- `brew services` / `mise` 配置管理。
- electron-builder 签名与公证。

### v0.3（更远）

- Tauri 壳替换评估（核心层可原样复用）。
- Linux（apt/dnf/pacman）与 Windows（winget/scoop）适配。
- 包来源与依赖关系可视化。

---

## 9. 风险与对策

| 风险 | 影响 | 对策 |
| --- | --- | --- |
| CLI 输出格式变化 | 解析失败 | 优先 JSON；适配器隔离；`probe` 记录版本；失败只影响单个管理器 |
| GUI 应用 PATH 缺失 | 扫描不到管理器 | 登录 shell 取 PATH + 已知路径兜底；UI 提示「未检测到」 |
| brew 扫描慢 | 首屏等待 | 单命令 `brew info`；骨架屏；后续加缓存 |
| npm registry 慢/断网 | outdated 超时 | 90s 超时；失败显示「无法检查更新」，列表仍可用 |
| 误卸载 | 破坏环境 | 二次确认 + 执行前重新查找 + 精确版本；默认不提供批量卸载 |
| 全局 npm 与 mise 管理的 npm 重复 | 用户困惑 | 按管理器维度展示，明确标注来源 |
| Electron 包体大 | 分发成本 | v1 可接受；核心层与壳解耦，未来可换 Tauri |
| GPL 污染 | 许可证风险 | 不复制 topgrade/OpenNavo/Brewy 代码；仅参考命令与交互 |

---

## 10. 命名与品牌

- 仓库：`chief`（`A1ether/chief` 当前空闲）
- 桌面应用名：**Chief**
- 标语：**Chief of your package managers.**
- 中文定位：**包总管** —— 管理所有包管理器。
- 未来若发布 npm 包/CLI，避免与已有 `chief@0.0.4` 冲突，使用 `chief-pm`。

---

## 11. 决策记录

- [x] 完成 GitHub 竞品检索与元数据核验
- [x] 明确无直接可复用项目；采用「官方 CLI JSON + 自研适配层」
- [x] 技术栈：Electron 45 + electron-vite 6 + React 19 + TS 5.9
- [x] 安全策略：只读默认、参数数组、二次确认、禁止 sudo
- [x] v1 管理器范围：brew / uv / mise / npm / pnpm / bun / gem
- [x] 实现 M0–M3

---

## 12. 实现记录（v0.1，2026-11-10）

### 已完成

- Electron + electron-vite + React + TypeScript 工程；`pnpm lint`、`pnpm build` 通过。
- 7 个适配器：brew、uv、mise、npm、pnpm、bun、gem。
- 总览、管理器侧栏、统计卡、包表格、搜索、可更新筛选、确认弹窗、实时日志抽屉。
- typed IPC + zod 校验；命令以参数数组执行，`shell: false`。
- `pnpm core:scan` 无 GUI 冒烟脚本。
- `.npmrc` 配置 Electron 国内镜像；Electron 45.2.3 二进制已按官方 `checksums.json` 校验后安装。

### 本机真实扫描结果（2026-11-10）

| 管理器 | 包数 | 可更新 |
| --- | ---: | ---: |
| Homebrew | 224 | 30 |
| uv | 3 | 3 |
| mise | 5 | 3 |
| npm | 2 | 0 |
| pnpm | 0 | 0 |
| Bun | 0 | 0 |
| RubyGems | 40 | 19 |
| **合计** | **274** | **55** |

### 已验证

- `pnpm core:scan` 输出真实数据，7 个管理器全部探测成功。
- Electron 窗口可启动，IPC 真实扫描数据渲染正确。
- 浏览器 mock 预览验证：筛选、搜索、管理器切换、卸载确认弹窗、全量更新确认弹窗、流式日志抽屉。
- 表格固定列宽修复：原先内容撑到 1631px 导致操作列不可见；现在 1018px 容器内完整显示。

### 已知行为 / 约束

- **npm 可能指向多个 Node 环境之一**：本机登录 shell 的 PATH 优先命中 `~/.local/bin/npm`（独立 Node 11.19），而 mise 管理的 npm 12.x 在 shim 目录。Chief 按登录 shell 的真实 PATH 选择一个，符合终端语义；两套全局包不会合并展示。
- Bun 原生不支持 `--json`，v1 只列包，最新版本标记为「未知」；更新按钮仍可执行。
- 未实现真实包更新/卸载的自动化测试（会修改本机环境）；动作链路通过 mock 任务事件与命令构建逻辑验证。
- Electron 45 的 GitHub 直连下载在本机网络上长时间停滞；已改用 npmmirror 并校验 SHA-256。正式分发时仍建议固定 `electron-builder` 的下载源与哈希。