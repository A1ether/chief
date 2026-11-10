# Chief

**Chief of your package managers.** 管理所有包管理器的本地 macOS 桌面工具。

Chief 自动发现本机的 Homebrew、uv、mise、npm、pnpm、Bun、RubyGems，把已安装包、可更新项和版本状态收进一个总控台；支持单包更新、单包卸载、按管理器全量更新，并实时展示命令输出。

![status](https://img.shields.io/badge/status-v0.1-orange)

## 功能

- 自动探测包管理器：Homebrew / uv / mise / npm / pnpm / Bun / RubyGems
- 统一包列表：当前版本、最新版本、类型、描述
- 可更新项汇总与按管理器全量更新
- 单包更新 / 卸载，危险操作二次确认
- 实时流式命令日志
- 只读扫描默认开启；不使用 `sudo`；命令以参数数组执行，不经过 shell

## 开发

要求：Node.js >= 22.12、pnpm。

```bash
pnpm install
pnpm dev        # 启动 Electron 桌面应用
pnpm lint       # TypeScript 类型检查
pnpm core:scan  # 不启动 GUI，直接验证核心扫描
```

`pnpm core:scan --full` 输出完整包数据。

> Electron 二进制默认从 GitHub 下载。仓库内的 `.npmrc` 指向 npmmirror 镜像以加速国内安装；不需要时可删除该行恢复官方源。

## 技术栈

Electron 45 + electron-vite 6 + React 19 + TypeScript 5.9。核心层是纯 Node，可被脚本或未来的 CLI/其他桌面壳复用。

## 目录

```
src/main         Electron 主进程与 IPC
src/preload      类型化 contextBridge
src/renderer     React 界面
src/core         包管理器适配器、扫描、任务执行
src/shared       IPC 类型与 zod 校验
scripts/scan.ts  核心扫描冒烟脚本
docs/PLAN.md     调研、竞品分析、技术选型与路线图
```

## 新增一个包管理器

1. 在 `src/core/adapters/` 新建适配器，实现 `PackageManagerAdapter`。
2. 在 `src/core/registry.ts` 注册。
3. 在 `src/shared/types.ts` 的 `MANAGER_IDS` 中加入 id。
4. 运行 `pnpm core:scan` 验证真实输出。
5. 在 `src/renderer/src/styles.css` 添加对应的 `accent-<id>` 颜色。

## 安全说明

- Chief 只会执行适配器中声明过的命令，且包名必须来自当前扫描结果。
- 卸载与全量更新必须确认。
- Chief 不会自动执行 `autoremove`、清理缓存或请求管理员权限。

## License

MIT