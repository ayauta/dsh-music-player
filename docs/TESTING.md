# TESTING.md — 测试矩阵、执行方式与副作用

本文件是**验证方法与结果**的权威来源。它回答三个问题：
哪些测试安全、哪些有副作用、改完之后怎么证明"真的对了"。

> 规范看 `docs/DESIGN.md`；规则看 `AGENTS.md`。本文件不放产品决策。

最后更新：2026-11-02（Phase 0B-2；验证对象为未提交工作区）

---

## 0. 三条硬规则

1. **默认命令必须安全。** `npm test` 只跑不碰真实库、不出声、不改用户状态的测试。
2. **有副作用的测试必须先告知用户，并说明如何恢复现场。**
3. **提交 ≠ 已验证。** 没跑过的，在 `docs/CURRENT.md` 里登记为未验证。

---

## 1. 四层测试

| 层 | 目标 | 环境 | 出声 | 触碰真实库/设置 | 自动化 |
|---|---|---|---|---|---|
| **L1** | 纯逻辑：文件名解析、LRC、**播放状态机与队列算法**、淡变时序 | `node --test`，无 IO、无进程 | 否 | 否 | 是 |
| **L2** | Host 集成：mpv IPC、SQLite、API、持久化、迁移 | 独立 `DSH_HOME` + 独立数据库；夹具音频 | 取决于用例 | 否（隔离） | 是 |
| **L3** | 真实 DSH 宿主：slot 挂载、面板显示、交互、窗口适配、**bundle 版本确认** | 运行中的 DSH + 截图/点击脚本 | 取决于用例 | 视用例 | 半自动 |
| **L4** | 真实体验：视觉一致性、媒体键、极端数据、动效手感 | 用户环境，人工 | 是 | 视操作 | 人工 |

---

## 2. 现有资产盘点

| 资产 | 层 | 状态 | 副作用 | 备注 |
|---|---|---|---|---|
| `npm test`（`test/*.test.mjs`） | L1 | ✅ 安全 | 无 | 单元测试 + 状态机测试 + 授权门测试；**不启动 mpv**，只允许受控的本机测试通信（授权门用例会自起一个临时回环服务并断言收到 0 个请求），**不访问真实宿主或外部服务** |
| `test/parser.test.mjs` / `test/lrc.test.mjs` | L1 | ✅ 安全 | 无 | 解析器与 LRC |
| `test/player-transport.test.mjs` | L1 | ✅ 安全 | 无 | 空队列、`playQueue`、`next/prev`、`prev` 3 秒规则、四态切换不重载（8 例 = 7 回归 + 1 诊断 B11） |
| `test/player-queue.test.mjs` | L1 | ✅ 安全 | 无 | 队列编辑保持当前曲、shuffle 起点与可达性（7 回归）+ 4 诊断：B10 / B12 / B13 / B14（共 11 例） |
| `test/player-eof-persist.test.mjs` | L1 | ✅ 安全 | 无 | 四态 EOF、解码错误、`dispose → init` 往返、异常存档降级（10 例，全回归） |
| `test/support/player-harness.mjs` | L1 支撑 | ✅ 安全 | 无 | 假 engine（记录命令 + 可回推事件）、假 db（Map）、`delay: () => Promise.resolve()` |
| `test/integration/queue-api.test.mjs` | L2 | ✅ 隔离无声 | **无声**（`--ao=null`）、仅临时根 | `queue.list ↔ snapshot` 顺序与元数据一致、写操作回包一致性（7 回归）+ B14 真实 mpv 复现（1 诊断） |
| `scripts/bundle-id.mjs` | — | ✅ **只读**（仅 `--write` 写文件） | 默认不联网、不写；`--write` 只改标记行；`--served` 只发回环 GET | Bundle ID 校验、`--served` 宿主字节比对、`--runtime` 运行时比对（见 §2.2） |
| `test/bundle-id.test.mjs` | L1 | ✅ 安全 | 临时目录（`mkdtemp`） | 指纹一致性 / 标记唯一性 / 换行归一 / `--write` 幂等 / 缺标记与重复标记拒绝 / 运行时值比对（9 例） |
| `test/client-source.test.mjs` | L1 | ✅ 安全 | 只读 `client.js` | **静态守卫**（无 DOM 渲染器）：`Cover` 不得解引用可为 null 的 `track`；`ErrorBoundary` 必须同时支持 `fallback` 与 `makeFallback`，且所有调用点使用其中之一。3 例 |
| `test/guard.test.mjs` | L1 | ✅ 安全 | 无（只起一个本地计数 HTTP 服务） | 证明危险脚本未授权时拒绝，且**目标服务器收到 0 个请求** |
| `test/support/fixtures.mjs` | L1 支撑 | ✅ 安全 | 写临时目录 | 用 ffmpeg 生成 8s/3s/3s 夹具与封面 |
| `test/support/host.mjs` | L2 支撑 | ✅ 隔离 | 临时 `DSH_HOME`、临时库 | 自建临时根、强制 `ao=null`、进程内 dispatch、先 dispose 再删目录 |
| `test/integration/playback.test.mjs` | L2 | ✅ 隔离无声 | **无声**（`--ao=null`）、仅临时根 | 原 `playback-test` 的 12 组断言迁移地 |
| `npm run smoke`（`scripts/service-smoke.mjs`） | L2 | ✅ 隔离无声 | 临时根，结束删除 | 默认夹具库；真实库需 `--library … --allow-real-library`，仍只读且 `ao=null` |
| `scripts/playback-test.mjs` | L3 | ⛔ **默认拒绝** | 改真实队列/设置/播放 | 需 `DSH_MUSIC_ALLOW_LIVE=1` + 显式 `DSH_MUSIC_API`；逻辑已迁到 L2 |
| `scripts/loadtest.mjs` | L4 | ⛔ **默认拒绝** | 同上 + CPU 饱和 | 另需 `DSH_MUSIC_ALLOW_PERF=1`；永远不进默认流程 |
| `scripts/probe-mpv.mjs` | — | 一次性探针 | 出声 | 建议移出仓库 |
| `scripts/patch-probe.mjs` / `skeleton.mjs` | — | 调试遗留 | 无 | 建议移出仓库 |
| `scripts/capture-window.ps1` / `click.ps1` / `uia.ps1` | L3 | ✅ 可用 | 无 | 截图/点击；UIA 取不到元素 |

**已补齐**：L1 播放状态机测试（Phase 0B-2，`test/player-*.test.mjs`，29 例）。

### 2.1 回归测试 vs 诊断测试（必读）

测试全绿**不等于**缺陷已修。本仓库的测试分两类，语义不同：

| 类别 | 命名 | 通过意味着 | 失败意味着 | 谁来改 |
|---|---|---|---|---|
| **Regression**（回归） | 普通用例名 | 该行为仍然正确 | **回归**，必须停下来查 | 修代码，不改断言 |
| **Diagnostic / Known Behavior**（已知问题诊断） | 前缀 `DIAGNOSTIC (known behaviour, Bxx):` | 该缺陷**仍可复现** | 行为已变化：要么缺陷被修了，要么变了形态 | 若缺陷已修：**改写成正确行为的回归断言**并关闭 Bxx；若只是变了形态：更新登记 |

`DIAGNOSTIC (pending decision, Bxx):` 是第三种：行为尚无产品裁定，用例只记录现状，**不得**被读成"验收通过"。

当前诊断用例清单（**均为预期通过，且都不代表需求已满足**）：

| 用例 | 缺陷 | 断言的是什么现状 |
|---|---|---|
| `test/player-transport.test.mjs` · DIAGNOSTIC (B11) | B11 | 播放中切单曲循环不裁 mpv 镜像尾 |
| `test/player-queue.test.mjs` · DIAGNOSTIC (B10) | B10 | shuffle 下 `enqueue{next}` 落错位置 |
| `test/player-queue.test.mjs` · DIAGNOSTIC (pending decision, B12) | B12 | 删当前曲回到队首 |
| `test/player-queue.test.mjs` · DIAGNOSTIC (B13) | B13 | 重复曲游标跳到第一份拷贝 |
| `test/player-queue.test.mjs` · DIAGNOSTIC (B14) | B14 | `queue.set` 之后 `trackId` 与 mpv 实际文件不一致 |
| `test/integration/queue-api.test.mjs` · DIAGNOSTIC (B14, real mpv) | B14 | 同上，真实 mpv 证据 |

规则：

1. **不得删除**诊断用例；修好缺陷时把它改名并改成正确行为断言（同一提交内完成）。
2. 诊断用例**不得**计入任何"功能验收 Passed"。
3. 报告测试结果时必须分开写：`回归 N 通过 / 诊断 M 通过（仅代表可复现）`。
4. 诊断用例失败时，先判断是"缺陷被修"还是"行为换了形态"，不要直接改断言让它变绿。

### 2.2 Bundle ID 取证（Client 版本）

刷新页面**不能**证明 client 已更新，重启之前也**不能**证明。本节定义唯一可信的取证方式，
并把三种"身份"分开记录——它们证明的东西不同，任何一方都不得冒充另一方。

| 身份 | 由谁产生 | 证明什么 | 不证明什么 |
|---|---|---|---|
| **source id**（`dshm-xxxxxxxxxxxx`） | `scripts/bundle-id.mjs` 对 `client.js` 内容做 SHA-256（**排除标记行本身**），先做 CRLF→LF 归一化 | 仓库当前的 `client.js` 是哪一版；支持未提交改动 | 浏览器执行的是不是它 |
| **artifact rev**（12 hex） | Host：`sha1(mtimeMs, ctimeMs, size)`；脚本用同一算法重算 | Host 的服务视图是否是"当前文件"（元数据层面） | 内容是否相同（同尺寸同时间戳会被骗过） |
| **runtime id** | **执行的 Client 自己**：`apply(ctx)` 里用 `ctx.effect` 写 `documentElement.dataset.dshMusicBundle` | 页面到达了本插件的激活点，且执行的是这个 id 的字节 | 四个 slot 是否已注册；组件是否已挂载或渲染成功 |

`data-dsh-music-bundle-phase="plugin-active"` 是同一处写入的语义标签：**只表示激活点**。
slot 是否注册/active 由 Inspector 独立观察，组件是否真的渲染成功**当前无法自动观察**。

**标记的写入点与清理**：`client.js` 的 `apply(ctx)` 内、第一个 `ctx.effect`；disposer 清掉
`dsh-music-bundle` / `…-phase` / `…-owner` 三个属性。因此"属性在"＝"当前有一个活跃实例"，
"属性值"＝"该实例的身份"。"属性不在"两种可能都有：没激活，或已被卸载。

**实例所有权**：`data-dsh-music-bundle-owner` 是每次激活生成的短 token。disposer 只在
owner 仍等于自己时才清理——**同一 Bundle ID 可能对应不同激活实例**，若旧实例的清理晚于
新实例的写入，无条件 `delete` 会把新标记抹掉，看起来像"没激活"。rc.5 的 HMR 路径
（`dsh-client-modules/lib/client.js:492-506`）是 `tearDownEntryFiber → import → refresh`，
清理确实先于新 `apply`；但宿主侧的禁用/重启用路径不由该文件决定，token 让结论与顺序无关。

**不在脚本顶层写入**——顶层只能证明字节被解析，不能证明插件被激活。

#### 命令（全部只读，除 `--write`）

```bash
node scripts/bundle-id.mjs                  # 源码指纹 vs 嵌入 ID；不一致 exit 1
node scripts/bundle-id.mjs --json           # 同上，机器可读（取证记录用）
node scripts/bundle-id.mjs --write          # 刷新标记行；标记缺失/重复时拒绝写入
node scripts/bundle-id.mjs --runtime <id>   # 把页面读到的 id 与源码比对；不一致 exit 1
node scripts/bundle-id.mjs --served --url http://127.0.0.1:PORT [--id @local/dsh-music]
```

`--served` 的安全约束：`--url` **必填**（不设默认端口）、只接受回环地址、只接受 http、
带超时（`--timeout`，默认 8000ms）、读完首个 graph 帧后 `reader.cancel()` **正常断开 SSE**。
退出码：`0` 一致 / `1` 不一致 / `2` 读不到（跳过，明确打印"未证明"）/ `3` 用法错误。

#### L3 取证步骤（必须重启）

1. `git status --porcelain` + `git rev-parse --short HEAD`，记录脏净与 HEAD。
2. `node scripts/bundle-id.mjs --json` → 记 **source id**。
3. `node scripts/bundle-id.mjs --served --url http://127.0.0.1:<port>` → 记 **served 结果**与 **host release / rev**。
4. **彻底退出 DSH 再启动**（不是关窗、不是 Ctrl+R）。
5. 主窗口按 **F12**，粘贴：

   ```js
   ({ bundle: document.documentElement.dataset.dshMusicBundle ?? null,
      phase:  document.documentElement.dataset.dshMusicBundlePhase ?? null,
      owner:  document.documentElement.dataset.dshMusicBundleOwner ?? null })
   ```

6. `node scripts/bundle-id.mjs --runtime <粘贴到的 id>` → PASS/FAIL。
7. Inspector 独立核对 slot：`cordis_inspect_query` → client/`Slots`.`listSubTree`，
   `root` 分别取 `sidebar.footer.action` / `sidebar.panellist` / `main` / `settings.section`，
   记录 `occupants[].id` 与 `occupants[].active`。
8. 记录人眼看到的界面状态（是否可见、是否有内容）。

记录字段：日期 / 类型 / 层 / 宿主版本（`0.2.1-rc.5`、commit）/ source id / artifact rev / runtime id /
Inspector 的 slot 与 active / 可见状态 / Git HEAD 与脏净 / 结果。

> **`active: true` 不等于渲染正常。** 它只表示该贡献未被 shell 弃权（abdicate）。
> 本插件的 `guardedCell` 会在 shell 的边界**内侧**先接住渲染异常，因此本插件三处 slot 的崩溃
> 对 shell 不可见，Inspector 会继续显示 `active: true`。判读规则见 `docs/CURRENT.md` §4。


---

## 3. 默认拒绝的脚本（Phase 0B-1 起由代码强制）

```
scripts/playback-test.mjs   ← 需 DSH_MUSIC_ALLOW_LIVE=1 + DSH_MUSIC_API（回环 + /music/api）
scripts/loadtest.mjs        ← 另需 DSH_MUSIC_ALLOW_PERF=1，缺任一项退出码 2
```

- 两个门都在**任何 fetch / 文件读写 / 播放之前**执行；未授权路径不产生任何副作用。
- 没有默认端口：宿主每次重启都会换，必须显式传入。
- `test/guard.test.mjs` 用一个本地计数 HTTP 服务验证"拒绝时目标收到 0 个请求"。
- 原 `playback-test` 的**逻辑**已迁移到 L2（`test/integration/playback.test.mjs`），
  这个脚本只保留为真实宿主的诊断入口。

---

## 4. 副作用矩阵（执行前必看）

| 操作 | 真实数据库 | 真实队列 | 用户设置 | 音乐文件 | 出声 | 播放状态 |
|---|---|---|---|---|---|---|
| `node --test test/*.test.mjs` | 不碰 | 不碰 | 不碰 | 只读 | 否 | 不碰 |
| `service-smoke.mjs`（隔离 `DSH_HOME`） | 隔离库 | 隔离实例 | 隔离库 | 只读 | **是** | 独立 mpv 进程 |
| 对运行中插件调 `POST /music/api` | **写** | **改** | **改**（`prefs.set`） | 只读 | 视 op | **改** |
| 截图 / 点击脚本 | 不碰 | 不碰 | 不碰 | 不碰 | 否 | 取决于点击了什么 |

**结论**：只有 L1 与"隔离 `DSH_HOME` 的 L2"可以无条件执行。

---

## 5. 各层执行方式

### L1 — 单元与授权门

```bash
npm test                       # = node --test "test/*.test.mjs"
```

包含：解析器 / LRC / 授权门。**不启动 mpv、不写真实状态**；
其中授权门用例会自起一个临时回环 HTTP 服务（仅本机、仅用于断言"0 个请求"），
**不访问真实宿主或任何外部服务**。

> **生产 WASAPI 输出：`Not tested`。** 本轮只做了静态检查与 `ao=null` 的隔离测试，
> 没有用真实音频设备播放过；不得据此宣称生产音频路径已验证。

**状态机测试（Phase 0B-2 已建）**：`test/player-*.test.mjs`，用假 engine（记录命令、可回推事件）
+ 假 db + 注入的 `delay`/`random`，**不启动 mpv、不等待淡变**。当前覆盖：

- `next/prev` 在四种模式下的目标曲与是否重载；`prev` 的 3 秒规则
- 到达队尾时 `sequence` 停止 / `all` 回绕 / `shuffle` 重排 / `one` 重播（手动与 EOF 两条路径分开测）
- `setMode` 不触发重载（断言 engine 的 `load` 次数）
- 队列编辑（enqueue/remove/move/setQueue）后当前曲与位置是否保持
- 重复曲目时的游标定位（当前用 `indexOf`，已知薄弱点，见 `LIMITATIONS.md` B13）
- `dispose → init` 往返与异常存档降级

未覆盖、也不打算在 L1 覆盖：淡变的听感与真实时序、mpv 的无缝推进竞态（L2）、UI 高亮（L3）。

### L2 — Host 集成（隔离、无声）

```bash
npm run test:l2                # = node --test "test/integration/*.test.mjs"
npm run smoke                  # 夹具库的完整 Host 冒烟（同样无声、隔离）
npm run smoke -- --library <path> --allow-real-library   # 只读诊断，需显式授权
```

约定（由 `test/support/host.mjs` 强制）：

- harness **自建**唯一临时根，并覆盖 `DSH_HOME`；调用方给的值不被信任；
- 数据库、缓存、日志、夹具全部在临时根内，结束先 `dispose()` 再删目录（带重试）；
- mpv 用 `--ao=null`：解码、时钟、`playlist-pos`、`eof` 都照常，**不出声**；
- 只用进程内 `service.api.dispatch`，**不开端口、不连运行中的 DSH**；
- 工具缺失（mpv/ffprobe/ffmpeg）时 L2 **抛错而不是静默 skip**。

### L3 — 真实 DSH 宿主

前提：**必须先确认 bundle 已加载**（见 §6），否则结论无效。

- 挂载与显示：面板打开/关闭、焦点进出、Esc、点外部关闭；
- 交互：进度条点击与拖动、模式切换、音量、队列入口；
- 窗口适配：至少两档窗口尺寸下的面板钳制；
- 记录：截图路径 + 窗口尺寸 + 主题。

### L4 — 人工验收

| 项 | 判据 | 参考 |
|---|---|---|
| 视觉一致性 | 与宿主其他面板并排看，字号/间距/圆角/悬停是否同族 | `apple-design`：`references/hig/motion.md › Best practices`（高频交互不额外加动效） |
| 按压与悬停手感 | 按下有反馈、松开即回、无回弹；悬停无阴影外溢 | `emil-design-eng › Review Checklist` |
| 动效 | 入场 <300ms、无 `ease-in`、可中断、`prefers-reduced-motion` 生效 | `review-animations › The Ten Non-Negotiable Standards` |
| 该不该有动效 | 高频/键盘触发的一律不加 | `remove-animations › The Gate` |
| 掉帧 | 进度条拖动、面板开合时无明显卡顿 | `animation-performance › The Symptom Table` |
| 极端数据 | 超长标题、单曲队列、上千首、emoji/中英混排 | `break-ui › Failure signatures` |
| Windows 媒体键 | 按媒体键、看系统媒体浮层是否识别并响应 | 见 `docs/DECISIONS.md` D-07 |

> 引用这些 skill 时必须先读取实际文件，并写明文件与章节；不得凭印象引用。

---

## 6. 如何确认 Client bundle 已加载

`client.js` 的改动**不会**随页面刷新生效。按顺序取证：

1. `git log -1` 记录 HEAD；
2. 重启 DSH（唯一可靠方式）或在界面上放置**可见标记**；
3. 观察标记 / 变化是否出现，截图留证；
4. 拿不到证据 → 结论写"未验证"。

反例（会误判）：只刷新页面、只看插件是否启用、只看代码是否保存。

---

## 7. 验证记录格式

每条记录必须自带**类型**与**版本关联**，否则视为无效记录：

| 字段 | 要求 |
|---|---|
| 类型 | `Manual` / `Automated`，不得混用 |
| 日期 | 具体到天 |
| 版本 | 对应版本或 commit（未记录时写"未记录"） |
| 层 | L1–L4 |
| 步骤 | 命令，或人工复现路径 |
| 结果 | Passed / Failed / Blocked + 现象 |
| 执行者 | 用户 / Agent（人工），或"脚本" |
| 适用范围 | 这条结论能覆盖什么、不能覆盖什么 |

一条记录只写一次运行；重跑另起一行。**不得**把多次尝试合并成"通过"。

---

## 8. 验证记录

> 每条记录只代表**当次运行**。脚本后来被改过、宿主后来被重启过、代码后来被改过，
> 都不能把旧结论平移到当前版本；需要重新跑并新起一行。
> **历史 Failed 与当前版本 Not tested 是两件事**（见 `docs/DESIGN.md` 规则 3）。

| 日期 | 类型 | 版本 / commit | 层 | 步骤 | 结果 | 执行者 | 适用范围 |
|---|---|---|---|---|---|---|---|
| 2026-10-29 | Manual | `60b67e9`（v1.5） | L3 | 点击面板右上队列按钮 | **Failed**：面板消失，之后无法再打开 | 用户 | 仅 v1.5 |
| 2026-10-30 | Manual | `b8dc624`（v1.7） | L3 | 重启后打开音乐库 →「播放队列」 | **Failed**：内容区空白（探针确认收到 41 条队列数据） | 用户 + 探针 | v1.7 基线；v1.7 之后的容器改动**未验证** |
| 2026-10-30 | Manual | `b8dc624`（v1.7） | L3 | 面板内音量滑杆 / 五键传输行 / 顺序图标 | **Passed**（截图 `artifacts/v12-crop-pop.png`） | Agent | 仅该版本该窗口尺寸 |
| 2026-10-29 | Automated | **未记录**（v1.1–v1.2 之间） | L3（真实宿主，非隔离） | `node scripts/playback-test.mjs`（当时 11 组） | **Passed（仅代表当次运行）** | 脚本 | 不覆盖 v1.7；脚本已列入 §3 禁用清单 |
| 2026-11-01 | Manual（静态检索） | `b8dc624`（v1.7） | — | 在 `client.js` / `lib/` / `locale/` / `scripts/` / `test/` 中检索 `waveform` / `spectrogram` / `peaks` / `thumbnail` / `sprite`，并检查 `locale/zh.json` 是否有对应文案 | **范围内未发现**（记 Passed） | Agent | **仅**证明上述范围内无对应实现；**未**做完整 UI 走查，**未**做运行期验证（`DESIGN.md` R10） |
| 2026-11-02 | Automated | 工作区（后提交为 `18e8cf5`） | L1 | `npm test` | **Passed**：16 tests / 0 fail / 606ms；不启动 mpv，不访问真实宿主或外部网络（6 个授权门用例各自起一个临时回环 HTTP 服务，只用于断言"收到 0 个请求"） | 脚本 | 含 6 个授权门用例；覆盖当时的 `test/*.test.mjs` |
| 2026-11-02 | Automated | 工作区（后提交为 `18e8cf5`） | L2 | `npm run test:l2`（隔离 `DSH_HOME` + `--ao=null`） | **Passed**：14 tests / 0 fail / 24.1s；`engine.ao === 'null'`；临时根已删除 | 脚本 | 夹具 8s/3s/3s；**不覆盖**真实宿主与真实音频输出 |
| 2026-11-02 | Automated | 工作区（后提交为 `18e8cf5`） | L2 | `npm run smoke`（夹具模式） | **Passed**：21 checks / 0 fail；`temp root removed` | 脚本 | 真实库诊断模式本轮**未执行** |
| 2026-11-02 | Automated | 工作区（Phase 0B-2，未提交） | L1 | `npm test`（含新增 `test/player-*.test.mjs`） | **Passed**：45 tests / 0 fail / 640ms；无 mpv、无淡变等待 | 脚本 | 29 例状态机测试；假 engine + 注入 `delay`/`random`；**不覆盖**真实 mpv 时序 |
| 2026-11-02 | Automated | 工作区（Phase 0B-2，未提交） | L2 | `npm run test:l2`（新增 `queue-api.test.mjs`） | **Passed**：22 tests / 0 fail / 24.4s；`ao=null`；临时根已删除 | 脚本 | 队列两次读取的一致性；B14 在真实 mpv 下复现；**不覆盖**真实音频输出与真实宿主 |
| 2026-11-02 | Automated | 工作区（Phase 0B-2，未提交） | L2 | `npm run smoke`（夹具模式） | **Passed**：21 checks / 0 fail；`temp root removed` | 脚本 | 仅回归确认，未新增断言 |
| 2026-11-02 | Automated | 工作区（Phase 0B-3，未提交） | L1 | `npm test`（含新增 `test/bundle-id.test.mjs`） | **Passed**：54 tests / 0 fail / 883ms | 脚本 | 45 例既有 + 9 例 Bundle ID；**不证明**浏览器执行的字节（**已被复审取代**，见下方复审行） |
| 2026-11-02 | Automated | 工作区（Phase 0B-3，未提交） | L1 | `node scripts/bundle-id.mjs --json` | **Passed**：source id = embedded id（`dshm-647cab86354f`） | 脚本 | 只读；**不**证明运行时（**已被复审取代**，见下方复审行） |
| 2026-11-02 | Automated | 工作区（Phase 0B-3，未提交） | L2 | `node scripts/bundle-id.mjs --served --url http://127.0.0.1:55844` | **Passed**：artifact rev 与 Host 一致、served 126455 字节内容相同、trailer 正常、served id 相同；host release `0.2.1-rc.5 / d4db512` | 脚本 | 证明 Host **愿意**提供这份字节；**不**证明页面执行了它（**已被复审取代**，见下方复审行） |
| 2026-11-02 | Automated | 工作区（Phase 0B-3，未提交） | L1 | `node scripts/bundle-id.mjs --runtime <id>`（正向/反向各一次） | **Passed**：相同值 exit 0；`dshm-ffffffffffff` exit 1 | 脚本 | 入参为**人工粘贴**的页面值；本轮未在真实页面取值，见下方 L3 |
| 2026-11-02 | Automated | 工作区（Phase 0B-3 复审后，未提交） | L1 | `npm test` | **Passed**：55 tests / 0 fail / 924ms（45 既有 + 10 Bundle ID） | 脚本 | 含 artifact rev 真实向量（`aa30fdc87659`）回归 |
| 2026-11-02 | Automated | 工作区（Phase 0B-3 复审后，未提交） | L1 | `node scripts/bundle-id.mjs --json` | **Passed**：source id = embedded id = `dshm-67b0677998e1` | 脚本 | 只读；**不**证明运行时 |
| 2026-11-02 | Automated | 工作区（Phase 0B-3 复审后，未提交） | L2 | `node scripts/bundle-id.mjs --served --url http://127.0.0.1:55844` | **Passed**：artifact rev `bf6085bd2344` 与 Host 一致；served 126965 字节内容相同、trailer 正常、served id 相同 | 脚本 | 证明 Host **愿意**提供这份字节；**不**证明页面执行了它 |
| 2026-11-02 | Automated | 工作区（Phase 0B-3 复审后，未提交） | L2 | `npm run test:l2` | **Passed**：22 tests / 0 fail / 24.3s；`ao=null`；临时根已删除 | 脚本 | 播放与队列语义未受本轮影响 |
| 2026-11-02 | Automated | 工作区（Phase 0B-3 复审后，未提交） | L2 | `npm run smoke` | **Passed**：21 checks / 0 fail；`temp root removed` | 脚本 | 仅回归 |
| 2026-11-02 | **Manual** | 工作区（Phase 0B-3 复审后）+ 重启后实例（`0.2.1-rc.5 / d4db512`，端口 64519） | L3 | 用户重启 → `bundle-id --served` 复跑 → `cordis_inspect_query` client/`Slots`（4 个 root）→ `capture-window.ps1` 截图 | **Passed（部分项）**：① served rev `bf6085bd2344` 与 Host 一致、内容与 `dshm-67b0677998e1` 相同；② 四个 slot 均 `active: true`（`dsh-music`/`music`/`music`/`dsh-music`）；③ 迷你行渲染出真实曲目与三键行（截图 `%TEMP%\dsh-music-l3.png`）。**未取得**：`data-dsh-music-bundle` 字面值（无 DOM 通道）、音乐库/队列页是否正常（B1 未观察） | Agent | 只覆盖该次重启、该端口；`active:true` 不证明 React 渲染成功 |
| 2026-11-02 | **Manual** | Phase 0B-3 工作区 / source id `dshm-67b0677998e1`（重启后实例 `0.2.1-rc.5 / d4db512`） | L3 | 用户在主窗口 F12 Console 执行 `({bundle: document.documentElement.dataset.dshMusicBundle, phase: document.documentElement.dataset.dshMusicBundlePhase})` | **Passed（仅此一项）**：`{bundle: "dshm-67b0677998e1", phase: "plugin-active"}`，与源码 ID 一致；`--runtime` 复核 exit 0 | 用户 | 证明页面**执行到本插件的激活标记点**、且执行的是该 ID 的字节；**不**证明四个 slot 已挂载、组件渲染无错、B1 已修 |
| 2026-11-02 | **Manual** | 工作区 / source id `dshm-ab394dbf0ec0`（**经 HMR 热替换，未重启**） | L3（预览，**非 L3 验收**） | 点开侧栏「音乐」→ 左栏「播放队列」；截图 `%TEMP%\b1-step2-queue.png`（修复前）、`b1-step4-queue-after-boundary.png`（仅修降级契约）、`b1-step5-queue-fixed.png`（修根因后） | **修复前**：标题「播放队列」与工具栏正常，内容区全白且无任何文字 → **复现 B1**；**仅修降级后**：显示 `播放队列: Cannot read properties of null (reading 'hasCover')` → 证实是渲染抛错；**修根因后**：队列 6 行全部可见（封面/标题/艺术家/移除键），当前曲高亮 | Agent | 只证明 HMR 预览下该视图恢复；**未**在完整重启后复验，也**未**覆盖空队列状态 |
| 2026-11-02 | **Manual** | 工作区 / source id `dshm-ab394dbf0ec0`（**完整重启后**，端口 59324，`0.2.1-rc.5 / d4db512`） | L3 | 用户重启 → F12 读 `dataset` → `bundle-id --served` + `--runtime` → 点「音乐」→「播放队列」→ 截图 `%TEMP%\b1-l3-queue.png` | **Passed（B1 验收；不含控制台直读与空队列）**：F12 `{bundle: "dshm-ab394dbf0ec0", phase: "plugin-active"}`；`--served` rev `0d9847268425` 与 Host 一致、127799 字节内容相同、served id 相同；`--runtime` exit 0；**队列 6 行全部可见**（封面/标题/艺术家/移除键）；`sidebar.footer.action` 的 `dsh-music` 仍 `active: true`；迷你行与「全部歌曲」无回归 | 用户 + Agent | 覆盖本次重启与该端口、该 source id；**未**覆盖空队列状态（Not tested，需清空真实队列）与深色主题、队列行拖拽。**控制台无错误属间接证据**：未直接读取 Console，仅由“修复前该路径必抛、修复后降级面不再出现”推得 |

**关于最后一条的说明**：

- 该脚本直接打运行中的插件，**副作用**：覆盖真实队列、`prefs.set` 改真实设置、改变当前播放、结束后不恢复（见 §4）。
- 该次运行**未记录 HEAD**，无法精确对应 commit；结论**不代表当前版本通过**。
- 该脚本现已列入 §3 的**禁止自动执行清单**，迁移到隔离 L2 之前不得再跑。

### 8.1 历史人工验收（v1.1–v1.2 时期，**未在当前版本复验**）

以下条目来自早期 README 的验收表，保留为历史事实；**不能**当作 v1.7 的通过证据。

| # | 当时的验收项 | 当时结论 | 对当前版本 |
|---|---|---|---|
| 1 | 导入并播放无封面 WAV | 41 个真实文件入库，mpv 上报 `wasapi / 48kHz / 2ch` | 未复验 |
| 2 | 解析中文书名号 / 序号 / 音质后缀 | 表驱动测试全绿 | 有 L1 单测覆盖，仍有效 |
| 3 | 显示真实规格（源 / 解码 / 设备） | 详情页并排比对 | UI 已改版，未复验 |
| 4 | 无封面也精致（中性占位） | 不生成伪艺术 | 未复验 |
| 5 | 迷你播放器直控不误触展开 | 三个按钮 `stopPropagation` | 代码仍在，未复验 |
| 6 | 完整面板：进度/音量/队列/模式 | 见当时截图 | **面板已重做**，验收作废 |
| 7 | 文件夹 / 播放列表 / 搜索 | 5 个文件夹、41 首，搜索命中 | 未复验 |
| 8 | 高负载下连续播放 | 4 线程 × 40s 饱和期间播放头推进 97.9%，最长停顿 914ms | 未复验（压测脚本已禁用） |
| 9 | 切会话 / 关面板不断播 | mpv 进程持续运行 | 未复验 |
| 10 | 不擅自改动本地音乐 | 写操作只落在插件数据目录 | 设计约束，见 `AGENTS.md` §12 |
| 11 | 禁用/卸载释放资源 | mpv 进程计数归零 | 未复验 |
| 12 | 明暗主题 / 尺寸 / 折叠态 | 只用语义 token；`wide` 适配折叠 | **暗色从未截图验证**（`DESIGN.md` R01.b） |

---

## 9. 待补的测试（按优先级）

| 优先级 | 项 | 层 | 说明 | 状态 |
|---|---|---|---|---|
| P0 | 播放状态机假 engine 测试 | L1 | 覆盖 §5 列出的全部转换 | **未开始**（Phase 0B-2） |
| P0 | bundle 版本确认手段 | L3 | 没有它，所有客户端"已验证"不可信 | 未开始 |
| P0 | `playback-test` 逻辑迁移到隔离 L2 | L2 | 从禁止清单中移除的前提 | ✅ **已完成**（12 组断言，`test/integration/playback.test.mjs`） |
| P1 | `package.json` 增加 `scripts`（`test` / `test:l2` / `smoke`） | — | 降低误用与连错端口 | ✅ 已完成 |
| P1 | seek 一致性、持久化迁移 | L2 | 覆盖已知风险点 | 部分（seek 有）；迁移用例未开始 |
| P2 | 面板交互与窗口适配脚本 | L3 | 回归保护 | 未开始 |
| P2 | 极端数据清单化 | L4 | 依 `break-ui` 的失败签名 | 未开始 |
