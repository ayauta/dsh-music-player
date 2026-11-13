# TESTING.md — 测试矩阵、执行方式与副作用

本文件是**验证方法与结果**的权威来源。它回答三个问题：
哪些测试安全、哪些有副作用、改完之后怎么证明"真的对了"。

> 规范看 `docs/DESIGN.md`；规则看 `AGENTS.md`。本文件不放产品决策。

最后更新：2026-11-11（文档重构：§3 补入脚本副作用口径，判定规则内联；历史记录不改写）

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
| `test/player-queue.test.mjs` | L1 | ✅ 安全 | 无 | 队列编辑保持当前曲、shuffle 起点与可达性、四模式「下一首播放」（8 回归）+ 3 诊断：B12 / B13 / B14（共 11 例） |
| `test/player-eof-persist.test.mjs` | L1 | ✅ 安全 | 无 | 四态 EOF、解码错误、`dispose → init` 往返、异常存档降级（10 例，全回归） |
| `test/support/player-harness.mjs` | L1 支撑 | ✅ 安全 | 无 | 假 engine（记录命令 + 可回推事件）、假 db（Map）、`delay: () => Promise.resolve()` |
| `test/integration/queue-api.test.mjs` | L2 | ✅ 隔离无声 | **无声**（`--ao=null`）、仅临时根 | `queue.list ↔ snapshot` 顺序与元数据一致、写操作回包一致性（7 回归）+ B14 真实 mpv 复现（1 诊断） |
| `test/integration/scan.test.mjs` | L2 | ✅ 隔离无声 | 仅临时根；真实 `node:sqlite`；**stub ffprobe**（不启动 mpv、不需要 ffmpeg）；故障注入是 `upsertTrack` / `setMissing` 的包装、`roots` DELETE 触发器与可延迟的探针桩 | 扫描结局守恒与生命周期（C1，8 例）+ 身份与来源生命周期（13 例）：单根守恒、探测失败 → `partial`、写入失败不计入 unchanged、每根独立、全失败 → `error`、sweep 写入失败 → `error` 且索引=已提交状态、重扫覆盖、v1→v2 升级与幂等；同路径重扫 id/收藏/歌单不变、相同内容两条路径两首曲目、改名＝新曲目+旧行 missing、移除来源保留行与引用且重新添加恢复同 id（幂等两轮）、移除来源全有或全无（中途失败回滚）、扫描进行中拒绝移除、仍缺失的文件不被复活、移出曲库的曲目不被重扫复活、目录不可读 → `error` 且全员不标 missing、父子根拒绝/同前缀接受/历史重叠一个文件一行且 `root_id` 不来回转移 |
| `scripts/bundle-id.mjs` | — | ✅ **只读**（仅 `--write` 写文件） | 默认不联网、不写；`--write` 只改标记行；`--served` 只发回环 GET | Bundle ID 校验、`--served` 宿主字节比对、`--runtime` 运行时比对（见 §2.2） |
| `test/bundle-id.test.mjs` | L1 | ✅ 安全 | 临时目录（`mkdtemp`） | 指纹一致性 / 标记唯一性 / 换行归一 / `--write` 幂等 / 缺标记与重复标记拒绝 / 运行时值比对（9 例） |
| `test/client-source.test.mjs` | L1 | ✅ 安全 | 只读 `client.js` | **静态守卫**（无 DOM 渲染器）：`Cover` 不得解引用可为 null 的 `track`；`ErrorBoundary` 必须同时支持 `fallback` 与 `makeFallback` 且调用点用其中之一；传输行三键 + 模式在 header；hooks 不得在 early return 之后；**Space 让位于获得焦点的控件**（CUI-01）；**队列读取失败不得渲染成加载中**（CUI-02）。14 例 |
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
| `test/player-queue.test.mjs` · DIAGNOSTIC (pending decision, B12) | B12 | 删当前曲回到队首 |
| `test/player-queue.test.mjs` · B10 回归（原诊断已转换） | B10 | 已修为正确行为：A 播放中「下一首播放」X，点下一首必须打开 X（四模式 + 真实 mpv） |
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
> 对 shell 不可见，Inspector 会继续显示 `active: true`。因此 `active: true` 只算 slot 注册证据，
**不算渲染证据**；渲染要看第 8 步的人眼观察。

### 2.3 模型驱动的状态机回归（日常档 + 压力档）

参考模型在 `test/support/queue-model.mjs`，按 DESIGN R13 / R07.c 与 DECISIONS D-14..D-17 的行为**重写**：
不 `import lib/host`，也不调用生产里的 `normalize()` / `commit()` 求期望值——模型必须有能力与实现不一致。

| 档位 | 命令 | 规模 | 成本 |
|---|---|---|---|
| 日常 | `npm test` 里的 `test/player-model.test.mjs` | 固定 seed `20261106`，20 runs × 8–20 命令 × 2 suite | ≈0.19s |
| 压力 | `npm run test:stress` | 1000 runs × 60–100 命令 × 2 suite ≈ **15.7 万次状态转换** | ≈77s |
| 扩展 | `npm run test:stress -- --runs 10000` | 需显式指定，不默认执行 | ≈13min |

两条 suite：`exact`（sequence / all / one，每步与模型逐字段比对队列、cursor、mode、paused）与
`shuffle`（排列不可预测，只查不变量与洗牌契约：条目集合不变、当前槽位不移动）。

每次转换后检查：trackId 唯一且可用；cursor 不越界；`trackId === queue[cursor]`；
有文件时 `engineFile === trackPath`；队列编辑不得让暂停中的播放器开始播放；mode 合法。

失败时 `scripts/stress-model.mjs` 输出：

- `seed` 与 `--suite/--runs/--max-length`，用同一 seed 重放整轮；
- `first rule`：首个被违反的规则，附模型状态、播放器状态与已执行到的轨迹；
- `reduced`：确定性 minimizer 压出的**缩减后的反例**（保留同一条被违反的规则，不保证全局最短），
  以及 `--replay '<json>'` 直接重放该序列。

fast-check 负责生成、seed 与数组 shrink；该属性是异步且带状态的，实测它在本仓库 **0 次 shrink**，
缩减后的反例由 minimizer 给出（注入故障演练：92 条 → **3 条**，见验证记录）。

受控性：`delay` 由 harness 注入（无淡变等待）、位置轮询在测试期间冻结、shuffle 使用固定线性同余流，
因此"同 seed + 同初始数据 + 同命令序列"必然复现。全部运行使用假 engine：不启动 mpv、不碰真实队列或数据库。

---

### 2.4 动效验证（2026-11-12，来源 `DESIGN.md` §6）

**静态守卫（L1，随 `npm test` 跑）**

| # | 断言 | 失败含义 |
|---|---|---|
| 1 | `transition` / `animation` 的时长 ∈ 白名单 `{0,110,120,130,150,160,200,240}` | 出现未批准的时长 |
| 2 | `transition` 不含 `height` / `width` / `top` / `left` / `margin` / `padding` / `box-shadow` | 动了布局或绘制属性 |
| 3 | 不出现裸 `ease-in`（`ease-in-out` 与自定义贝塞尔允许） | 动画在用户注视点最慢 |
| 4 | 每个 `@keyframes` 名至少被引用一次 | 死动效 |
| 5 | 每个 `[data-x="…"]` 选择器在 JS 里至少被写入一次 | 不可达状态（如 B22） |
| 6 | `:hover` 上的 `transform` 位于 `@media (hover: hover) and (pointer: fine)` 内，或在豁免表登记 | 触控误触 |
| 7 | 单次 `animation` ≤300ms | 违反上限 |

**人工（L4）**

- 0.25× 录屏：进入与退出同路径、关闭不瞬断、快速开关不从头重播；
- `prefers-reduced-motion: reduce` 下无位移、无缩放，但仍能感知状态变化；
- 亮 / 暗两个主题各看一遍，确认动效不改变层级；
- 记录按 §7；任一项不过就写 `Failed`，不得写"基本可用"。

**豁免表**：目前无。新增豁免必须写理由与到期条件。

### 2.5 L1 夹具的能力边界（写用例前必读）

`test/support/player-harness.mjs` 的假引擎不是"一个假的 mpv"，它是**一组可编排的时序**。
写用例前先查这张表，判断你要验证的事在不在它的表达范围内；不在，就先扩夹具（见本节末尾的规则）。

| 能力 | 用法 | 它能表达什么 |
|---|---|---|
| 位置 | `setTimePos(ms)` | mpv 此刻报的位置；`seek` / `load` 会同步它 |
| **在途读取** | `holdNextTimePos()` → 返回释放函数；`suspendedReads()` | `getProperty` 是**异步**的：这次读跨过一次 seek / 暂停时返回旧值——B35 的成因 |
| 轮询节奏 | `createPlayerHarness(t, { pollMs })` | 真实 1000ms；测试用 5–200ms（`createPlayer` 的注入点，D-13 纪律） |
| 命令不被确认 | `failNextWrite` / `failNextPause` | 命令被接受但属性没到 |
| 播放列表自己漂移 | `moveBeforeNextWrite` / `moveDuringNextWrite` / `corruptNextWrite` / `reportUnknownSeen` | 写尾部期间 mpv 动了或列表形状不对 |

**规则一：替身不得比被测对象更同步**（`AGENTS.md` §9）。夹具同步返回时，所有"读取在途"的竞态
都会从测试里消失，闭环就在一个不存在的世界里自证——B35 连续三次修错层正是从这里来的。
要验证"两个 async 步骤交错"，用 `holdNextTimePos()` 把交错**摆出来**，不要用 `await delay()` 去猜。

**规则二：概率性症状要量红率**，不要用一次绿就跑完：

```bash
npm run test:repeat -- test/player-transport.test.mjs 20    # 打印 n/20 red
```

**规则三**：夹具表达不了某类竞态时，在用例里写明"这条测不到什么"，不要留一个看起来覆盖了、
实际上只覆盖同步路径的断言。

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
- 两者都会改**真实队列、真实设置与当前播放**；隔离改造完成前禁止自动执行。
  副作用矩阵见 §4（原 `LIMITATIONS.md` §四 的口径已并入本节）。

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
- 队列条目唯一：同一曲目不会入队两次（B13 已结构性消除，见 D-15）
- `dispose → init` 往返与异常存档降级

未覆盖、也不打算在 L1 覆盖：淡变的听感与真实时序、mpv 的无缝推进竞态（L2）、UI 高亮（L3）。

**模型驱动的随机回归（2026-11-06 加入）**：`test/player-model.test.mjs` 随 `npm test` 一起跑；
更长的扫描用 `npm run test:stress`（详见 §2.3）。两者都用假 engine，不启动 mpv。

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
> 被后续运行取代的记录**保留原样、不改写**：在「适用范围」列标注"已被…取代"，不删除。

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
| 2026-11-05 | Automated | 工作区（C1，未提交） | L1 | `npm test`（`test/player-queue.test.mjs` 重写为队列规格，`player-eof-persist` 两例改写，`client-source` +2 守卫） | **Passed**：75 tests / 0 fail；无 mpv、无淡变等待 | 脚本 | 23 例队列规格：唯一/去重、移动而非复制、删除当前与末位、暂停保持、setQueue 三态、随机只重排未来、clear、缺曲不错位、"命令已发但属性未回传"两条；**不覆盖**真实 mpv 时序 |
| 2026-11-05 | Automated | 工作区（C1，未提交） | L2 | `npm run test:l2`（隔离 `DSH_HOME` + `--ao=null`） | **Passed**：25 tests / 0 fail / 25s；B14 与 B17 为真实 mpv 回归断言；`queue.clear` 与"暂停中替换队列"两条断言直接读写入 op 的返回快照；临时根已删除 | 脚本 | 证明 mpv 属性回传完成前 op 不会返回不一致快照；**不覆盖**真实音频输出 |
| 2026-11-05 | Automated | 工作区（C1，未提交） | L2 | `npm run smoke`（夹具模式） | **Passed**：21 checks / 0 fail；`temp root removed` | 脚本 | 仅回归确认 |
| 2026-11-05 | Automated（**真实宿主，用户授权**） | 工作区（C1；**运行中的 build 早于两次滞后修复**） | L3 | `node %TEMP%/l3-queue-test.mjs` → 真实实例 `POST /music/api`，全程 `player.mute` | **16/18 Passed**；失败 2 项为 mpv 属性回传滞后（`queue.remove` 删末位当前曲、`queue.clear` 的返回快照仍带旧 `engineFile`），**已在工作区修复** | Agent | **有副作用**：改动真实队列（脚本结束时恢复为原 6 首、原 mode、原静音状态）、静音状态开播过；开始前 `db.backup`；每轮结束核对 `R 恢复` 断言 |
| 2026-11-05 | Automated（**真实宿主，用户授权**） | 工作区（C1，含滞后修复；重启后 `dshm-b690e5daba83`） | L3 | `node %TEMP%/l3-queue-test.mjs`（23 项探针：去重 / 移动 / 删除当前与末位 / 暂停纪律 / setQueue 三态 / 随机语义 / 四态切换 / next 回绕 / prev 3 秒规则 / 播放中重排 / clear / 空队列播放） | **Passed：23/23**，4.7s；`queue.clear` 与删末位当前曲的返回快照均已 `engineFile=null`；`diag.logs` 0 条 error | Agent | **有副作用**（同上一行，已恢复）；证明真实 mpv 下 Host 快照与文件一致；**不覆盖**出声验证（全程静音）与长时间播放 |
| 2026-11-05 | Automated | 工作区（C2，未提交） | L1 | `npm test`（新增 `test/player-mirror.test.mjs` 9 例；`player-queue` / `player-transport` 的镜像断言改为状态断言） | **Passed**：84 tests / 0 fail | 脚本 | 镜像契约：写入后 mpv 的状态、`current-moved` 只重写一次、写入失败不动锚点、条目数相同但内容错 → 不采纳、`seen` 不在队列 → 不设锚点、engine 停止仍可编辑队列、mode one 单条目镜像；**不覆盖**真实 mpv 时序 |
| 2026-11-05 | Automated | 工作区（C2，未提交） | L2 | `npm run test:l2`（隔离 `DSH_HOME` + `--ao=null`） | **Passed**：27 tests / 0 fail；新增「接近 EOF 时重写尾部」与引擎级「拒绝过期当前曲 + 读回核对条目」 | 脚本 | 写入与自然 EOF 竞争后仍自洽；`playlist/N/filename` 读回在真实 mpv 上可用；**不覆盖**强制超时（L1 用假 engine 覆盖） |
| 2026-11-05 | Automated | 工作区（B15，未提交） | L1 | `npm test` | **Passed**：89 tests / 0 fail；新增「jumping by track id follows the track, not the slot it had」「an entry that is no longer queued plays nothing」与四条客户端静态守卫（只发 `player.jump{trackId}`、标题取 `player.queue`、行可键盘触发、无按钮嵌套） | 脚本 | 证明按 id 解析位置、拒绝已移除曲目；**不证明**渲染（client 无 DOM 渲染器） |
| 2026-11-05 | Automated | 工作区（B15，未提交） | L2 | `npm run test:l2`（隔离 `DSH_HOME` + `--ao=null`） | **Passed**：28 tests / 0 fail；「B15: the jump follows the track, not the index it used to have」：`[A,B,C]` 改成 `[A,C,B]` 后按 B 的 id 跳转播放 B；删除 B 后跳转被拒、未播 C、未加载任何文件 | 脚本 | 验证 Host 按当前队列解析下标与实际当前歌曲；**不覆盖**浏览器点击/键盘事件本身 |
| 2026-11-05 | Automated | 工作区（B19，未提交） | L1 | `npm test` | **Passed**：91 tests / 0 fail；新增「playing again after a sequence queue ends starts over from the top」（断言 `load([a,b], 0, 0)`、cursor 0）与「resuming a paused track continues where it stopped」（不重载、位置保持 4000） | 脚本 | 证明"已播完"与"暂停"被区分；**不覆盖**真实 mpv 时序 |
| 2026-11-05 | Automated | 工作区（B19，未提交） | L2 | `npm run test:l2`（隔离 `DSH_HOME` + `--ao=null`） | **Passed**：29 tests / 0 fail；新增「10b. playing again after the queue ended restarts from the first track」：播完 b 后 `player.play` → `trackId=a`、`cursor=0`、`engineFile=a.path`、`positionMs < 1000`，1.5s 后仍在播 | 脚本 | 真实 mpv 下确认重新打开第一首且不再立即结束；**不覆盖**声音输出 |
| 2026-11-05 | Automated | 工作区（F1，未提交） | L1 | `npm test` | **Passed**：93 tests / 0 fail；新增「a pause the engine does not confirm fails instead of reporting a stale snapshot」（假 engine `failNextPause` → `player.pause()` 必须 reject）与「a confirmed pause is reflected in the snapshot the op returns」 | 脚本 | 证明超时不再伪装成功；**不覆盖**真实 mpv 属性时序（假 engine 只建模契约） |
| 2026-11-05 | Automated | 工作区（F1，未提交） | L2 | `npm run test:l2`（隔离 `DSH_HOME` + `--ao=null`） | **Passed**：30 tests / 0 fail；新增「F1: the pause op returns the state mpv has already confirmed」：连续 10 轮暂停/恢复，**每一次回包**都必须是已确认状态（修复前 20 次中 18 次陈旧） | 脚本 | 断言的是操作自身的返回值，不是事后的 status |
| 2026-11-06 | Automated | 工作区（模型测试固化，未提交） | L1 | `npm test`（含新增 `test/player-model.test.mjs` 日常档） | **Passed**：95 tests / 0 fail / 935ms；模型档 2 suite × 20 runs，固定 seed `20261106` | 脚本 | 覆盖 16 类命令；**不覆盖**真实 mpv 时序与 UI |
| 2026-11-06 | Automated | 工作区（模型测试固化，未提交） | 压力 | `npm run test:stress` | **Passed**：1000 runs × 2 suite，**157,312** 次状态转换 / 77.4s | 脚本 | 假 engine；不启动 mpv、不碰真实队列 |
| 2026-11-06 | Automated（**故障注入演练**） | 工作区（模型测试固化，未提交） | 压力 | 临时删掉 EOF 驱动的 `pos` 事件 → `npm run test:stress -- --runs 300` | **Failed（预期）**：seed `20261106`；fast-check 0 次 shrink；minimizer 把 92 条压到 **3 条**；`--replay` 复现同一失败；还原后重跑 **Passed** | Agent | 注入只发生在 `test/support/queue-model.mjs`，已还原；生产代码未改动 |
| 2026-11-02 | Automated | 工作区（Phase 0B-3 复审后，未提交） | L2 | `npm run test:l2` | **Passed**：22 tests / 0 fail / 24.3s；`ao=null`；临时根已删除 | 脚本 | 播放与队列语义未受本轮影响 |
| 2026-11-02 | Automated | 工作区（Phase 0B-3 复审后，未提交） | L2 | `npm run smoke` | **Passed**：21 checks / 0 fail；`temp root removed` | 脚本 | 仅回归 |
| 2026-11-02 | **Manual** | 工作区（Phase 0B-3 复审后）+ 重启后实例（`0.2.1-rc.5 / d4db512`，端口 64519） | L3 | 用户重启 → `bundle-id --served` 复跑 → `cordis_inspect_query` client/`Slots`（4 个 root）→ `capture-window.ps1` 截图 | **Passed（部分项）**：① served rev `bf6085bd2344` 与 Host 一致、内容与 `dshm-67b0677998e1` 相同；② 四个 slot 均 `active: true`（`dsh-music`/`music`/`music`/`dsh-music`）；③ 迷你行渲染出真实曲目与三键行（截图 `%TEMP%\dsh-music-l3.png`）。**未取得**：`data-dsh-music-bundle` 字面值（无 DOM 通道）、音乐库/队列页是否正常（B1 未观察） | Agent | 只覆盖该次重启、该端口；`active:true` 不证明 React 渲染成功 |
| 2026-11-02 | **Manual** | Phase 0B-3 工作区 / source id `dshm-67b0677998e1`（重启后实例 `0.2.1-rc.5 / d4db512`） | L3 | 用户在主窗口 F12 Console 执行 `({bundle: document.documentElement.dataset.dshMusicBundle, phase: document.documentElement.dataset.dshMusicBundlePhase})` | **Passed（仅此一项）**：`{bundle: "dshm-67b0677998e1", phase: "plugin-active"}`，与源码 ID 一致；`--runtime` 复核 exit 0 | 用户 | 证明页面**执行到本插件的激活标记点**、且执行的是该 ID 的字节；**不**证明四个 slot 已挂载、组件渲染无错、B1 已修 |
| 2026-11-02 | **Manual** | 工作区 / source id `dshm-ab394dbf0ec0`（**经 HMR 热替换，未重启**） | L3（预览，**非 L3 验收**） | 点开侧栏「音乐」→ 左栏「播放队列」；截图 `%TEMP%\b1-step2-queue.png`（修复前）、`b1-step4-queue-after-boundary.png`（仅修降级契约）、`b1-step5-queue-fixed.png`（修根因后） | **修复前**：标题「播放队列」与工具栏正常，内容区全白且无任何文字 → **复现 B1**；**仅修降级后**：显示 `播放队列: Cannot read properties of null (reading 'hasCover')` → 证实是渲染抛错；**修根因后**：队列 6 行全部可见（封面/标题/艺术家/移除键），当前曲高亮 | Agent | 只证明 HMR 预览下该视图恢复；**未**在完整重启后复验，也**未**覆盖空队列状态 |
| 2026-11-02 | **Manual** | 工作区 / source id `dshm-ab394dbf0ec0`（**完整重启后**，端口 59324，`0.2.1-rc.5 / d4db512`） | L3 | 用户重启 → F12 读 `dataset` → `bundle-id --served` + `--runtime` → 点「音乐」→「播放队列」→ 截图 `%TEMP%\b1-l3-queue.png` | **Passed（B1 验收；不含控制台直读与空队列）**：F12 `{bundle: "dshm-ab394dbf0ec0", phase: "plugin-active"}`；`--served` rev `0d9847268425` 与 Host 一致、127799 字节内容相同、served id 相同；`--runtime` exit 0；**队列 6 行全部可见**（封面/标题/艺术家/移除键）；`sidebar.footer.action` 的 `dsh-music` 仍 `active: true`；迷你行与「全部歌曲」无回归 | 用户 + Agent | 覆盖本次重启与该端口、该 source id；**未**覆盖空队列状态（Not tested，需清空真实队列）与深色主题、队列行拖拽。**控制台无错误属间接证据**：未直接读取 Console，仅由“修复前该路径必抛、修复后降级面不再出现”推得 |
| 2026-11-02 | Automated | 修复前的工作区（B10） | L1 | `node --test test/player-queue.test.mjs` | **Failed（预期的 Red）**：`shuffle: the entry sits right after the current one`；其余三个模式在此之前已通过 | 脚本 | 证明新回归断言能抓住旧行为 |
| 2026-11-02 | Automated | 工作区（B10 修复，未提交） | L1 | `npm test` | **Passed**：59 tests / 0 fail（四模式「下一首播放」+ 重复曲目插入位置，取代原 B10 诊断） | 脚本 | 假 engine；**不**证明真实 mpv 打开的文件 |
| 2026-11-02 | Automated | 初版修复 vs `b02ec77` 基线（B10 复核） | L1 | `git stash push -- lib/host/player.js` 后复跑 `node --test test/player-queue.test.mjs` | **基线通过、初版失败**：`play next lands after the playing copy when the queue repeats a track`（`[a,b,a]` 播第三项时初版给出 `[a,x,b,a]`，基线为 `[a,b,a,x]`） | 脚本 | 证明该插入位置差异由初版引入；调整后两侧都通过 |
| 2026-11-02 | Automated | 工作区（B10 修复，未提交） | L2 | `npm run test:l2`（隔离 mpv） | **Passed**：23 tests / 0 fail；新增 `B10: play next opens the enqueued file (real mpv, shuffle)` 断言 mpv 打开的就是刚插入曲目的路径 | 脚本 | 真实 mpv 确认打开的是刚插入的文件；**不**覆盖 UI 高亮（B16） |
| 2026-11-02 | Automated | 工作区（B10 修复，未提交） | L2 | `npm run smoke` | **Passed**：21 checks / 0 fail；`temp root removed` | 脚本 | 仅回归 |
| 2026-11-02 | **Manual** | `4abd9e8`（Host 侧修复）；重启后实例 `0.2.1-rc.5 / d4db512`，端口 56586 | L3 | 用户重启 DSH（窗口进程 02:45:13 启动，晚于 `player.js` 修改时间 02:40:56）后，在随机播放下执行「下一首播放」再点「下一首」 | **Passed（用户口述）**：用户反馈"修好了"；**未记录**当时播放的曲目名、被插入的曲目名与实际出声曲目 | 用户 | 仅代表该次人工操作的用户判断；若需可复核的记录，补一行"A→X→实际播 X"即可 |
| 2026-11-02 | Automated | 基线 `4abd9e8` vs 修复后的工作区（B17） | L1 | `git stash push -- lib/host/player.js` 后复跑 `node --test test/player-eof-persist.test.mjs` | **基线失败、修复后通过**：`a rebuilt order keeps the auto-advance mapping anchored`（重建顺序后 `pos` 事件落到错误曲目） | 脚本 | 证明该锚点缺陷真实存在，且修复确实消除它 |
| 2026-11-02 | Automated | 工作区（B17 + R08，未提交） | L2 | `npm run test:l2`（隔离 mpv） | **Passed**：24 tests / 0 fail；新增 `B17: a natural EOF after an order change reports the track that is playing` 断言 `trackPath === engine.currentFile` | 脚本 | 真实 mpv；**不**覆盖迷你行/队列高亮（客户端） |
| 2026-11-02 | Automated | 工作区（B17 + R08，未提交） | L1 | `npm test` | **Passed**：61 tests / 0 fail（含 `the transport keeps one four-state mode control (R08)`） | 脚本 | 静态守卫只锁定「一个四态控件 + 循环顺序」，不证明渲染 |
| 2026-11-02 | Automated | 工作区（B17 + R08，未提交） | L2 | `npm run smoke` | **Passed**：21 checks / 0 fail；`temp root removed` | 脚本 | 仅回归 |
| 2026-11-02 | Automated（只读接口） | 运行中实例（端口 49898） | — | `POST /music/api {op:"status"}` 读取快照 | **确认根因**：`mode=shuffle`、`cursor=2`、`trackId` 的队列下标是 4 → 高亮错行 | Agent | 只读；未改动任何队列/设置 |
| 2026-11-02 | **Manual** | 工作区（B16 修复，**HMR 预览，未重启**） | L3（预览） | 打开「音乐」→「播放队列」→ 截图 `%TEMP%\b16-queue-fixed.png` | **Passed（预览）**：5 行队列中最后一行「天上飞琼」高亮，与迷你播放器一致；修复前同位置高亮「莲梦」 | Agent | 不是 L3 验收：HMR 热替换，未重启；标题仍显示整库 85 首（B15） |
| 2026-11-06 | Automated | 基线 `f0ad2e0`（扫描台账 C1 实施前） | L2 | `node --test test/integration/scan.test.mjs`（第 1 次 Red） | **Failed（预期）**：`5 !== 3`——根 2 的 `scanned` 把根 1 的两个文件也算进来 | 脚本 | 证明"每根独立计数"这条断言能抓住跨根累加 |
| 2026-11-06 | Automated | 工作区（扫描台账 C1 第 1 步后） | L2 | 同上（第 2 次 Red） | **Failed（预期）**：`1 !== 3`——两个探测失败的文件没有结局，`scanned` 停在 1 | 脚本 | 证明"失败也要有结局"这条断言能抓住失败不计数 |
| 2026-11-06 | Automated | 工作区（探测失败已计数后） | L2 | 同上（第 3 次 Red） | **Failed（预期）**：`0 !== 1`——数据库写入失败走了 catch，只记日志、不进 `failed` | 脚本 | 证明写入失败与"未变化"确实会被混淆，且断言能区分二者 |
| 2026-11-06 | Automated | 工作区（失败计数完成后） | L2 | 同上（第 4 次 Red） | **Failed（预期）**：`'running' !== 'error'`——sweep 抛错后行永久停在 `running` | 脚本 | 证明"异常必须收尾"这条断言能抓住生产缺陷 |
| 2026-11-06 | Automated | 工作区（扫描台账 C1，未提交） | L2 | `node --test test/integration/scan.test.mjs` | **Passed**：7/7 / 0.38s；隔离 `DSH_HOME` + 真实 `node:sqlite` + stub ffprobe；不启动 mpv | 脚本 | 结局守恒、`partial/error` 判据、首条原因、每根独立、索引=已提交状态、v1→v2 升级与幂等；**不覆盖**真实 ffprobe 时序与真实库 |
| 2026-11-06 | Automated | 工作区（扫描台账 C1，未提交） | L1 | `npm test` | **Passed**：95 tests / 0 fail / 0.98s | 脚本 | 本轮未改播放代码，播放与队列断言为回归确认 |
| 2026-11-06 | Automated | 工作区（扫描台账 C1，未提交） | L2 | `npm run test:l2`（隔离 `DSH_HOME` + `--ao=null`） | **Passed**：38 tests / 0 fail / 26.6s；临时根已删除 | 脚本 | 30 例既有 + 8 例扫描；**不覆盖**真实音频输出 |
| 2026-11-06 | Automated | 工作区（扫描台账 C1，未提交） | L2 | `npm run smoke`（夹具模式） | **Passed**：21 checks / 0 fail；`temp root removed` | 脚本 | 仅回归确认 |
| 2026-11-06 | Automated（**真实库的隔离副本**） | 工作区（扫描台账 C1，未提交） | — | 复制 `library.db`（含 `-wal`/`-shm`）到临时目录 → 用新 `openDatabase` 连续打开两次 | **Passed**：`user_version 1→2`；tracks 85→85（track id 全同）；4 条历史 run 保留且 `failed=0`；重复打开幂等；副本已删除 | Agent | **真实库未被打开或修改**；仅证明迁移本身，不证明真实宿主启动路径（见下两行） |
| 2026-11-06 | Automated（**真实宿主，用户授权**） | 工作区（扫描台账 C1，未提交）；用户重启后的实例（端口 60438） | L3 | ① 只读核对库与 API；② `POST /music/api {op:'library.scan'}`（全库）→ 轮询 `status` → 读 `library.scanStatus`；③ `library.list` + `queue.list` + `status` 一致性核对 | **Passed**：`user_version 1→2`、`failed` 列就位、85 行与 track id 原样、4 条历史 run 保留；全库重扫 **344 ms**，四根各自 `total/scanned/skipped` = `41/41/41`、`12/12/12`、`12/12/12`、**`20/20/19`**（1 首因 mtime 漂移重新探测），全部 `done` / `failed 0` / `error null`（修复前会写成 41、53、65、20）；`library.list` 85 = `status.tracks` 85 = 库存 85；队列 6 条 id **全部仍可解析**，当前曲仍在库内 | Agent | **有副作用**：本轮扫描覆盖了真实库的 4 行 `scan_runs` 与 `roots.last_scan_at`，并因磁盘 mtime 漂移**原地更新**了 1 个 track 行（`id` 与 `added_at` 不变）。未改曲目集合、收藏、歌单、队列、播放状态 |
| 2026-11-06 | Automated | 同上（真实宿主 + 2026-11-04 备份库对照） | L3 | 检查被重新探测的那一行（`被生命所厌恶。（中文版）.flac`）与备份库、磁盘三方比对 | **符合预期**：备份里 `mtime=1793293691082`，磁盘 `1793293721280`（**+30 198 ms**），`size` 未变 → 走 `(size, mtime)` 快路径判定为"已漂移"，重新探测后原地更新；扫描未误判，也不是重复入库 | Agent | 证明"未变化"快路径确实按磁盘事实工作；**不覆盖**失败分支（真实库不能注入损坏文件，该分支由 `test/integration/scan.test.mjs` 覆盖） |
| 2026-11-06 | Automated（**只读复核**） | 工作区（扫描台账 C1，未提交）+ 运行中实例（端口 60438） | L3 | 对同一 root、同一次 run 三方对照：`scan_runs` 行、`library.scanStatus`、该时间窗内的进度日志 | **Passed（澄清报告笔误）**：三处一致为 `total 20 / scanned 20 / skipped 19 / failed 0`，守恒 `20 = 19 未变化 + 1 更新 + 0 失败`；日志里的 `scanned:19` 是 **19/20 时的中途快照**，`phase:'done'` 才是 20。上一轮汇总表把 `skipped` 填进了 `scanned` 列 | Agent | 只读：未触发扫描、未写库；证明差异来自报告口径，而非代码或持久化 |
| 2026-11-06 | Automated | 工作区（扫描台账 C1，未提交） | L2 | `node --test test/integration/scan.test.mjs`（新增 1 例） | **Passed**：8/8 / 0.43s；新增「a probe failure leaves the existing row, its favorite and its playlist entry alone」：已有行 + 文件 mtime 变化 + 探测失败 → `partial` / `failed=1` / `skipped=2`，旧行**不置 missing**、无重复行、收藏与歌单引用不变；恢复正常探测后重扫 `done` / `failed=0`，行内 mtime 更新为新值 | 脚本 | 覆盖"探测失败不得把既有行变成 missing"这条安全边界；**不覆盖**真实 ffprobe 时序 |
| 2026-11-06 | Automated（**临时变异，已还原**） | 工作区（扫描台账 C1，未提交） | L2 | 在探测失败分支临时插入 `db.setMissing([id], true)` → 跑 `--test-name-pattern "leaves the existing row"` | **Red（预期）**：失败于「a failed probe is not a missing file」（`true !== false`）；还原后重跑 1/1 通过 | Agent | 证明该守卫不是恒真断言；变异只存在于工作区数秒，未入库 |
| 2026-11-07 | Automated | 工作区（Phase 1，基线 `94ece94`；实现前） | L2 | `node --test test/integration/scan.test.mjs`（新增 4 例根重叠） | **Failed（预期）**：`Missing expected exception`——`addRoot` 不拒绝父子目录，`roots()` 也不报告重叠 | 脚本 | 证明重叠断言能抓住缺失的校验 |
| 2026-11-07 | Automated | 工作区（Phase 1，实现中） | L2 | 同文件（C1 的 sweep 崩溃例） | **Failed（预期，随后改写）**：`'done' !== 'error'`——自动 relocate 删除后，改名不再让 sweep 崩溃，该用例改为注入 `setMissing` 失败 | 脚本 | 用例改写的是注入点，C1 的四条承诺（不留在 `running`、`error`、首条原因、索引=已提交）一条没减 |
| 2026-11-07 | Automated | 工作区（Phase 1，未提交） | L2 | `node --test test/integration/scan.test.mjs` | **Passed**：19/19 / 0.6s | 脚本 | C1 8 例（含改写后的 sweep 例）+ 11 例身份/来源/安全；**不覆盖**真实库、真实 ffprobe 时序、L3 |
| 2026-11-07 | Automated（**临时变异，均已还原**） | 工作区（Phase 1，未提交） | L2 | 5 次变异：`walk` 回退成 warn+continue / `removeRoot` 回退成 `DELETE FROM tracks` / 去掉 `removed_at` 守卫 / `rootId` 恒取当前根 / 去掉 `findByPath` 路径优先 | **全部 Red（预期）**，各自只被对应用例抓住：`an unreadable folder…` / `removing a folder keeps tracks…` / `a track removed from the library…` / `historical overlapping roots… do not steal ownership`（第二轮） / `removing a folder…`（id 恢复） | Agent | 证明这些断言不是恒真守卫 |
| 2026-11-07 | Automated | 工作区（Phase 1，未提交） | L1 | `npm test` | **Passed**：95 tests / 0 fail | 脚本 | 未改播放代码，播放/队列断言为回归确认 |
| 2026-11-07 | Automated | 工作区（Phase 1，未提交） | L2 | `npm run test:l2`（隔离 `DSH_HOME` + `--ao=null`） | **Passed**：49 tests / 0 fail；临时根已删除 | 脚本 | 38 例既有 + 11 例新增；**不覆盖**真实音频输出 |
| 2026-11-07 | Automated | 工作区（Phase 1，未提交） | L2 | `npm run smoke`（夹具模式） | **Passed**：21 checks / 0 fail；`temp root removed` | 脚本 | 仅回归确认 |
| 2026-11-07 | Automated | 工作区（Phase 1 收尾，实现前） | L2 | `node --test test/integration/scan.test.mjs`（新增 2 例） | **Failed（预期）**：`its ledger row is still there`（`0 !== 1`，三步写入已部分提交）与 `Missing expected exception`（扫描进行中移除不被拒绝） | 脚本 | 证明原子性与并发守卫两条断言都不是恒真 |
| 2026-11-07 | Automated（**临时变异，均已还原**） | 工作区（Phase 1 收尾） | L2 | 2 次变异：去掉 `BEGIN IMMEDIATE` / 去掉 `scanningRoots` 守卫 | **各自 Red**：`removing a folder is all-or-nothing` / `a folder cannot be removed while its scan is running` | Agent | 与另外 5 次变异合计 7 次，覆盖本轮全部新增守卫 |
| 2026-11-07 | Automated | 工作区（Phase 1 收尾，未提交） | L2 | `node --test test/integration/scan.test.mjs` | **Passed**：21/21 | 脚本 | 含原子性与并发两例 |
| 2026-11-07 | Automated | 工作区（Phase 1 收尾，未提交） | L2 | `npm run test:l2`（隔离 `DSH_HOME` + `--ao=null`） | **Passed**：51 tests / 0 fail；临时根已删除 | 脚本 | 38 例既有 + 13 例新增 |
| 2026-11-07 | Automated（**真实库的隔离副本**，只读真实文件） | 工作区（Phase 1 收尾） | — | 复制 `library.db` + `-wal` + `-shm` 到临时目录 → 读 `user_version` 与 `scan_runs` 列 → 用 v2 代码打开、写一条 run、读回、核对 85 行 id | **Passed（向前兼容）**：真实库是 **v3**（多出 `conflicts` 列，来自被否决的 C2 构建）；v2 代码读出 **85 行、id 全同**，run 可读写，`user_version` **保持 3 不降级**；副本已删除 | Agent | 证明 v2 代码能安全读写 v3 文件；**真实文件未被打开**（mtime 未变）。是否把真实库降回 v2 由用户决定 |
| 2026-11-07 | **Manual** | `59a1e9b`（真实 Desktop，host release `0.2.2-rc.1 / c59d10a`，端口 50811） | L3 | 用户启用插件后手动点播、播放 / 暂停 / 切歌；Agent 只读读取 `status` / `diag.logs` 并截图 | **Passed（仅限下列范围）**：库 85 首、4 个来源；数据库 v2、`integrity_check = ok`；启动未触发扫描或升级；6 首 shuffle 队列与设置恢复；mpv 加载 `…09.《破碎时间》…24bits.48khz.wav`，`ao=wasapi`、`exclusive=false`，解码 `s32/48k/2ch`、设备 `float/48k/2ch`；`playing=true`、位置正常推进、`lastError=null`；用户点播触发 `queue.play` → 7 首 `sequence` 取代 6 首 `shuffle`（**预期行为，不是异常**） | 用户（试听）+ Agent（只读） | 覆盖：读取、点播、WASAPI 共享输出与状态同步。**不覆盖**：音乐库与队列页面的完整交互、UI 进度与控制状态的逐项核对、DOM Bundle ID、缺失曲目界面与重新定位（未实现）、扫描失败状态的 UI（未实现）。**副作用**：试听期间 `app_state` 按设计被写入（位置 / 队列 / 模式），数据库以 WAL 打开 |
| 2026-11-07 | Automated（**只读**） | `59a1e9b`（端口 50811） | L3 | `POST /music/api` 的 `status` / `library.scanStatus` / `roots.list` / `queue.list` / `player.state` / `diag.logs`；复制 `library.db` + `-wal` + `-shm` 读 `user_version` / `integrity_check` / `table_info`；`bundle-id --served`；`capture-window.ps1` 截图 | **Passed（只读取证）**：`user_version 2`、`scan_runs` 无 `conflicts`、4 条 run 的 `startedAt` 未变（未自动扫描）、`trackId 4b5f76…` / shuffle / 73 与迁移前备份一致、served 字节 = 工作区 `client.js`（`dshm-3c68b1072173`）、`diag.logs` 1 条 0 warn/error | Agent | 不构成人工验收，不能证明渲染细节或出声质量。截图 `C:\Users\andy\AppData\Local\Temp\dshm-l3\live.png` 只覆盖迷你行与侧栏入口 |
| 2026-11-12 | Automated | 工作区（未提交，动效修复 B22–B28 + #310 修复） | L1 | `npm test`（新增 `test/motion-source.test.mjs` 7 例 + `client-source` 的 hooks 顺序守卫） | **Passed**：103 tests / 0 fail / 890ms | 脚本 | 静态守卫：时长白名单、禁布局/绘制属性、禁裸 `ease-in`、keyframes 引用与 ≤120ms、`data-*` 写入、hover 门控、**hooks 必须在 early return 之前**；**不覆盖**真实动效手感（需重启 L3） |
| 2026-11-12 | Automated | 工作区（未提交，bundle `dshm-7031e31a7568`） | L3（只读） | `bundle-id --served --url http://127.0.0.1:52224`（宿主 `0.2.2-rc.1 / c59d10a`） | **Passed**：served 130 637 B、source/served id 同为 `dshm-7031e31a7568`、artifact rev `ee922db9fe3a` 与宿主一致 | 脚本 | 只证明宿主会提供这份字节；**不证明**渲染与动效手感 |
| 2026-11-12 | Automated | 工作区（未提交，动效修复后） | L2 | `npm run test:l2`（隔离 `DSH_HOME`、`ao=null`） | **Passed**：51 tests / 0 fail / 28.2s | 脚本 | 客户端改动不影响 Host 集成；本次为确认无连带回归 |
| 2026-11-12 | Automated | 工作区（未提交，动效修复后） | L2 | `npm run smoke`（夹具库） | **Passed**：SMOKE PASSED，`temp root removed` | 脚本 | 同上 |
| 2026-11-12 | Automated | 工作区（未提交，动效二轮：退出可感知 + 按压不对称 + 乐观图标） | L1 | `npm test`（新增 exit-timer 同步守卫） | **Passed**：104 tests / 0 fail / 847ms | 脚本 | 新增：`POP_EXIT_MS` 必须等于 `--dshm-dur-pop-out`；**不覆盖**手感与图标即时性（需重启 L3） |
| 2026-11-12 | Automated | 工作区（未提交，面板版式 §7） | L1 | `npm test`（新增传输行守卫：三键 + 模式在 header） | **Passed**：105 tests / 0 fail / 861ms | 脚本 | 守卫：传输行恰好 3 个 IconButton 且不含 ModeButton；header 必须含 ModeButton 且不得有可见标题；**不覆盖**视觉节奏（需重启 L3） |
| 2026-11-12 | Automated | 工作区（未提交，模式 / 进度 / 传输悬停按 HIG 修正） | L1 | `npm test`（新增模式键守卫 + 传输悬停守卫） | **Passed**：106 tests / 0 fail / 844ms | 脚本 | 守卫：`ModeButton` 不得出现 `data-active`；传输行三键必须同为 `size: 'lg'` 且不得出现 `xl`（HIG：用样式不用尺寸）；hover 不得被改成 `transparent`；**不覆盖**视觉观感（需重启 L3） |
| 2026-11-12 | **Manual** | `dshm-c517ae41e53e`（重启后的真实宿主；served artifact rev `07613eca9631`） | L3 | 用户重启后查看播放面板：模式四态无底色、进度/音量滑块常显、传输三键同尺寸 44、悬停圆角矩形底、音量标准滑块 | **Passed**：用户确认"功能符合预期" | 用户 | 覆盖视觉与基本交互；**不覆盖**录屏逐帧判读、空队列状态、字体缩放 |
| 2026-11-12 | Manual（实机） | `dshm-cfd78a28fa9c`（重启后的宿主，端口 63179） | L3 | 用户重启后观察侧栏 | **Failed**：`Minified React error #310`（hooks 在空态 early return 之后，曲目出现时 hook 数量变化） | 用户（截图） | 已修：hooks 上移 + 静态守卫；新 bundle `dshm-7031e31a7568` 待重启复验 |
| 2026-11-13 | Automated | 工作区（未提交，CUI-01 / CUI-02；审查后修正一轮） | L1 | `npm run check`（`node --check` + `npm test`，两条静态守卫）；审查 agent 另独立跑 `node scripts/bundle-id.mjs` 核对 | **Passed**：108 tests / 0 fail / 821ms；**source id** `dshm-c517ae41e53e` → **`dshm-2a24b8d96206`**，内嵌标记与源码一致 | 脚本 | 守卫：`event.defaultPrevented` 与 `controlOwnsKey` 都排在 Space 之前，`inMusicSurface` 限定音乐上下文；队列读取状态 `ready/failed` 齐备、重读不得回落 pending、失败分支只 `setAttempt` 且无写操作。**不覆盖**真实键盘归属、断连与写操作后的界面表现（需重启 L3） |
| 2026-11-14 | Automated（实现前，**预期红**） | 工作区（D-24 竖切 1） | L1 | `node --test test/playhead.test.mjs` | **Failed**：`ERR_MODULE_NOT_FOUND … lib/shared/playhead.js` | 脚本 | 证明用例先于实现存在，不是照着实现补写的 |
| 2026-11-14 | Automated | 工作区（D-24 竖切 1） | L1 | `node --test test/playhead.test.mjs` | **Passed**：10 tests / 0 fail / 102ms | 脚本 | 覆盖：补间推进、暂停不推进、无采样时刻不推进、上界夹取、未知时长不下夹上界、**采样时刻晚于 now 不回退**、非有限时钟、进度分数 0..1、剩余时间地板 0 |
| 2026-11-14 | Automated（**临时变异，均已还原**） | 工作区（D-24 竖切 1） | L1 | 变异 A：删掉模块的下界夹取（`Math.max(0, nowMs - sampled)`）→ `9 pass / 1 fail`；变异 B：只改模块、不重跑 `--write`（生成区变陈旧）→ 守卫 `1 pass / 1 fail` | **各自 Red** | Agent | 证明缺陷用例与生成区守卫都不是恒真，还原后 `npm run check` 120/120 |
| 2026-11-14 | Automated | 工作区（D-24；bundle `dshm-df11aeedaff9`） | L1 | `npm run check`（`node --check` ×2 + `npm test`），另跑 `node scripts/inline-playhead.mjs`（verify） | **Passed**：120 tests / 0 fail / 959ms；生成区与 `lib/shared/playhead.js` 逐字符一致；**source id** `dshm-2a24b8d96206` → **`dshm-df11aeedaff9`** | 脚本 | 守卫：生成区一致 + `positionSampledAt` 只出现在生成区。**不覆盖**真实渲染、进度条观感与键盘 seek 手感（需重启 L3） |
| 2026-11-14 | Automated（**只读取证**） | 工作区（bundle `dshm-df11aeedaff9`）+ 重启后的宿主 | L3 | `node scripts/bundle-id.mjs --served --url http://127.0.0.1:64050` | **Passed**：source id 与 served id 同为 `dshm-df11aeedaff9`，artifact rev `e3f1933f478d` 与宿主一致，served 138 441 B 与源码逐字节相同、trailer 正常；**宿主已是 `0.2.2-rc.3 / 6b729fe`**（上次人工验收在 `rc.1 / c59d10a`） | 脚本 | 只证明宿主会提供这份字节；**不证明**渲染，也不代表 rc.1 上的验收可平移到 rc.3 |
| 2026-11-14 | Automated（实现前，**预期红**） | 工作区（D-27 竖切 2） | L1 | `node --test test/playhead.test.mjs` | **Failed**：`does not provide an export named 'anchorOf'` | 脚本 | 证明新用例先于新实现存在 |
| 2026-11-14 | Automated | 工作区（D-27 竖切 2） | L1 | `node --test test/playhead.test.mjs` | **Passed**：19 tests / 0 fail | 脚本 | 覆盖：锚点字段与 `advancing` 判定、补间、暂停、无锚点不推进、上下界夹取、非有限时钟、分数、剩余时间、等待的三条判据（放行 / 粘住 / 时钟回退丢弃）、以及"宿主一次都没采样"与"请求没有可比较时刻"两种退化输入 |
| 2026-11-14 | Automated（**临时变异，均已还原**） | 工作区（D-27 竖切 2） | L1 | 变异 A：`sampledAt >= requestedAt` 改 `>` → `18 pass / 1 fail`；变异 B：删掉"墙钟回退即丢弃"分支 → `18 pass / 1 fail`；变异 C：组件里写回 `1600`/`900` 阈值 → `client-source` 14 pass / 1 fail | **各自 Red** | Agent | 三条规则都不是恒真；还原后 `npm run check` 130/130 |
| 2026-11-14 | Automated | 工作区（D-27；bundle `dshm-e03542edadba`） | L1 | `npm run check`（`node --check` ×2 + `npm test`）+ `node scripts/inline-playhead.mjs`（verify） | **Passed**：130 tests / 0 fail；生成区与模块逐字符一致；**source id** `dshm-df11aeedaff9` → **`dshm-e03542edadba`** | 脚本 | 守卫：生成区一致、`positionSampledAt` 只在生成区、`ProgressBar` 必须走 `resolveSeek` 且旧阈值不得复现。**不覆盖**真实渲染与手感（需重启 L3） |
| 2026-11-14 | Automated（**紧闭环，实现前**） | 工作区（B30） | L1 | `node --test test/player-transport.test.mjs`（新增「the first press on a cold engine…」，用 `stored` 重放重启后的恢复态 + 空引擎） | **Failed**：`there is no file to pause`——`actual: [{name:'pause', args:[true]}]`，即第一按被解析成暂停 | 脚本 | 复现用户报告的"重启后第一次点播放没反应"；同一命令、同一次运行里另一例（已加载时仍应暂停）通过，说明闭环能分辨两种情形 |
| 2026-11-14 | Automated | 工作区（B30 修后） | L1 | `node --test test/player-transport.test.mjs` | **Passed**：10 tests / 0 fail | 脚本 | 断言：不发 `pause`、发出 `load`、起点 1500ms（恢复位置）、快照 `playing: true` / `paused: false` |
| 2026-11-14 | Automated（实现前，**预期红**） | 工作区（B31） | L1 | `node --test test/playhead.test.mjs` | **Failed**：`does not provide an export named 'nextAnchor'` | 脚本 | 5 例重锚定用例先于实现存在 |
| 2026-11-14 | Automated（**临时变异，均已还原**） | 工作区（B30 / B31） | L1 | 变异 A：`toggle()` 去掉 `currentFile === null` 分支 → `9 pass / 1 fail`；变异 B：`nextAnchor` 一律返回新锚点 → `22 pass / 2 fail` | **各自 Red** | Agent | B30 与"锚点复用"两条规则都不是恒真 |
| 2026-11-14 | Automated（实现前，**预期红**） | 工作区（D-28） | L1 | `node --test test/client-source.test.mjs`（把「全局 Space 让位」守卫换成「客户端不绑键」） | **Failed**：`no document-level key listener`（当时 `attachKeyboard` 仍在） | 脚本 | 守卫先写、代码后删：证明它盯的是真存在的绑定 |
| 2026-11-14 | Automated | 工作区（D-28；bundle `dshm-fe6cba61dd8e`） | L1 | `npm run check` + `node scripts/inline-playhead.mjs`（verify） | **Passed**：137 tests / 0 fail；生成区一致；**source id** `dshm-e03542edadba` → **`dshm-fe6cba61dd8e`** | 脚本 | 守卫：不得出现 `addEventListener('keydown'`（除 Escape）、`role: 'slider'`、`tabIndex`、任何动作键判定；`positionSampledAt` 只在生成区。**不覆盖**真实键盘行为与观感（需重启 L3） |
| 2026-11-14 | **Manual** | `dshm-fe6cba61dd8e`（重启后的真实宿主 `rc.3 / 6b729fe`） | L3 | 用户重启后测试六条判据：重启后首按是否出声、键位是否已撤、seek 是否回弹、暂停后显示是否自己爬、面板可开合、进度条连续性 | **Passed（基本正常）**：用户确认"基本正常"——B30 首按即出声、键盘动作已消失、seek 不回弹；**除外**：暂停后进度条仍抖动（另立 B32） | 用户 | 覆盖 B30 / D-28 / B31 的行为与基本观感；**不覆盖**逐帧判读、rc.3 上其它界面项、音量与队列面板 |
| 2026-11-14 | Automated（**只读取证**） | 运行中的宿主（端口 59917） | — | `POST /music/api` 的 `player.state` 每 150ms 一次 × 40（6s）；再比对一次 `status.player` 与 `player.state` | **Passed（排除宿主）**：暂停状态下 `positionMs` 恒为 **101764**（min=max，spread 0ms，distinct 1），`playing:false`、`paused:true`、`engineStatus:running`，`positionSampledAt` 每秒照旧推进；`status.player` 与 `player.state` 逐字段一致 | Agent | 只证明**宿主没有在动**；据此把 B32 的范围收窄到客户端 |
| 2026-11-14 | Automated（实现前，**预期红**） | 工作区（B32） | L1 | `node --test test/playhead.test.mjs` | **Failed**：`does not provide an export named 'nextPaint'` | 脚本 | 8 例"写不写"用例先于实现存在 |
| 2026-11-14 | Automated | 工作区（B32） | L1 | `node --test test/playhead.test.mjs` | **Passed**：32 tests / 0 fail | 脚本 | 关键例：**10 秒暂停（600 帧）只允许 1 次绘制**，而旧行为是 1200 次；另覆盖首帧必写、分数变化必写、标签变化必写、亚像素噪声不写、非有限分数按 0、播放时最后一帧的值必须落地 |
| 2026-11-14 | Automated（实现前，**预期红**） | 工作区（B32） | L1 | `node --test test/client-source.test.mjs`（新增「the progress bar paints only when the value changes」） | **Failed**：`the bubble text is assigned only through the guarded path`——抓到 hover 时对气泡的第二次写入 | 脚本 | 守卫先写、代码后改：证明它盯的是真实存在的双写者 |
| 2026-11-14 | Automated（**临时变异，均已还原**） | 工作区（B32） | L1 | 变异 A：`nextPaint` 一律 `write: true` → `29 pass / 3 fail`；变异 B：`if (next.write === false) return` 改成 `if (false) return`（先 diff 确认变异已落到文件）→ `client-source` 15 pass / 1 fail | **各自 Red** | Agent | 纯函数语义与"组件真的用了它"两面都钉住；还原后 `npm run check` 146/146 |
| 2026-11-14 | Automated | 工作区（B32；bundle `dshm-cc5effbf6882`） | L1 | `npm run check` + `node scripts/inline-playhead.mjs`（verify） | **Passed**：146 tests / 0 fail；生成区与模块一致；**source id** `dshm-fe6cba61dd8e` → **`dshm-cc5effbf6882`** | 脚本 | 守卫：`nextPaint(paintedRef.current` 必须出现、`write:false` 必须直接返回、写入值必须被记住。**不覆盖**真实渲染（需重启 L3） |
| 2026-11-14 | **Manual** | `dshm-cc5effbf6882`（重启后的真实宿主 `rc.3 / 6b729fe`） | L3 | 用户按四条判据复验：暂停后静止 / 播放平滑 / 拖动气泡 / 拖完不回弹 | **Failed**（②③④ 通过，① 不过）：暂停后条仍会动一下（→ B33） | 用户 | 覆盖 B32 的 ②③④；① 交由 B33 |
| 2026-11-14 | Automated（**紧闭环，实现前**） | 工作区（B33） | L1 | `node --test test/player-transport.test.mjs`（新增「pausing … stamps where it stopped」，用 41.6s 旧轮询 + 42.5s 引擎真值 + 客户端已画 ~42.3s 重放；夹具引擎新增可设 `time-pos`） | **Failed**：`the pause snapshot carries where mpv actually stopped, not the last polled position`——快照停在 41 600 | 脚本 | 复现"客户端画到真值、却被旧快照按回去"的完整链条；断言同时覆盖"等于引擎真值"与"不落后于已画值" |
| 2026-11-14 | Automated | 工作区（B33 修后） | L1 | `node --test test/player-transport.test.mjs` | **Passed**：11 tests / 0 fail | 脚本 | 另有附带发现：夹具引擎的 `time-pos` 原本恒为 0，改完立刻让既有用例「resuming a paused track continues where it stopped」变红——说明盖章是承重的，旧例只是被不真实的夹具掩盖 |
| 2026-11-14 | Automated（**临时变异，已还原**） | 工作区（B33） | L1 | 变异：把 `pause()` 的盖章分支改成 `if (false)`（先 diff 确认变异落到文件）→ B33 用例 | **Red**：`10 pass / 1 fail` | Agent | 证明该守卫不是恒真 |
| 2026-11-14 | Automated | 工作区（B33；宿主改动，客户端 bundle 不变 `dshm-cc5effbf6882`） | L1 | `npm run check` | **Passed**：147 tests / 0 fail | 脚本 | 夹具引擎现在跟随 `seek` / `load` 更新 `time-pos`。**不覆盖**真实 mpv 的暂停时序（需重启 DSH 后 L3） |
| 2026-11-14 | **Manual** | `dshm-cc5effbf6882` + B33 宿主修复 | L3 | 用户点暂停，反复观察 | **Failed**：仍有**概率性**回缩再前进（→ B34） | 用户 | 概率性说明存在交错，不是算法错 |
| 2026-11-14 | Automated（**紧闭环，实现前**） | 工作区（B34） | L1 | `node --test test/playhead.test.mjs`（新增 4 例定序，含「a late, older answer must not move the bar backwards」——钉死到达顺序） | **Failed**：`does not provide an export named 'acceptResponse'` | 脚本 | 把概率性竞态钉成确定性输入：①接受首答 ②丢弃更旧 ③丢弃重复 ④回放后绘制序列必须只有 `[100900]` |
| 2026-11-14 | Automated | 工作区（B34 修后） | L1 | `node --test test/playhead.test.mjs` | **Passed**：36 tests / 0 fail | 脚本 | 定序门与补间/等待/绘制守卫共存 |
| 2026-11-14 | Automated（**临时变异，均已还原**） | 工作区（B34） | L1 | 变异 A：`acceptResponse` 恒为 `true` → `33 pass / 3 fail`；变异 B：客户端门改成 `if (false)`（先 diff 确认落地）→ `client-source` 16 pass / 1 fail | **各自 Red** | Agent | 纯函数与"组件真的用了它"两面都钉住 |
| 2026-11-14 | Automated | 工作区（B34；bundle `dshm-016c9bffbb5c`） | L1 | `npm run check` + `node scripts/inline-playhead.mjs`（verify） | **Passed**：152 tests / 0 fail；生成区一致；**source id** `dshm-cc5effbf6882` → **`dshm-016c9bffbb5c`** | 脚本 | 守卫：编号在发出时、判定在 `session.setStatus` 之前。**不覆盖**真实交错频率（需重启 L3 连点验证） |

| 2026-11-14 | **Manual** | `dshm-016c9bffbb5c` + B33/B34 宿主改动 | L3 | 用户连点暂停 | **Failed**：仍会回缩（第三次） | 用户 | 说明前三次修的不是写入者 |
| 2026-11-14 | Automated（**紧闭环，实现前**） | 工作区（B35） | L1 | `node --test test/player-transport.test.mjs`（夹具新增 `holdNextTimePos()`：挂起下一次 `time-pos` 读取，释放时返回读取**开始**那一刻的值；另新增可注入 `pollMs`） | **Failed**：`the late read must not move the playhead back to 41 600 under a paused track`——`actual: [42500, 41600]` | 脚本 | 复现"读在途跨过暂停"：盖章 42.5s 之后，在途读取把 41.6s 写回去 |
| 2026-11-14 | Automated（**临时变异，已还原**） | 工作区（B35） | L1 | 先试 `issuedAt >= state.positionSampledAt` → 连跑 5 次里 2 次失败，日志出现 `issuedAt === stamp === …426`（同毫秒并列放行）；改为代数比较后再变异（去掉比较）→ 5/5 全红 | **混红→稳定红** | Agent | 毫秒精度不足以表达"先后"；代数比较才是判据 |
| 2026-11-14 | Automated | 工作区（B35 修后） | L1 | `node --test test/player-transport.test.mjs` × 10 次 | **Passed**：每次 12 tests / 0 fail | 脚本 | 循环现在双向确定：变异稳定红、修复稳定绿 |
| 2026-11-14 | Automated | 工作区（B35；宿主改动，客户端 bundle 不变 `dshm-016c9bffbb5c`） | L1 | `npm run check` | **Passed**：153 tests / 0 fail | 脚本 | **不覆盖**真实 mpv 下 `getProperty` 的真实延迟分布（需重启 DSH 后 L3） |
**关于 2026-10-29 那条 L3 记录（`scripts/playback-test.mjs`）的说明**：

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

### 8.2 2026-11-07 Codex UI 实地走查

验证对象：`2473b79` / 插件 1.7.0；开始时工作区 clean。执行者 Agent（Codex）。
宿主 `0.2.2-rc.1 / c59d10a`，Windows，`@oai/sky` Computer Use；主题最初为跟随系统（呈浅色），
临时切深色，随后恢复跟随系统。截图坐标范围约 799×601 / 1920×1032，不当作 DOM CSS 测量。
完整 UI 发现与截图索引见 [实地审计](UI_AUDIT_2026-11-07.md)。

#### Automated（隔离与只读诊断）

| 命令 / 方法 | 退出码 | 结果 | 耗时 |
|---|---|---|---|
| `npm.cmd test` | 0 | 95 通过：94 回归、1 诊断（B11 仅说明已知行为可复现），0 失败/跳过 | Node 汇总 1017.5 ms |
| `npm.cmd run test:l2` | 0 | 51 回归通过，0 失败/跳过；独立 DSH_HOME、夹具、ao=null；包括播放、队列、扫描失败与来源生命周期 | Node 汇总 29347.9 ms |
| `npm.cmd run smoke` | 0 | 21 项检查（含临时根清理）通过；ao=null、夹具库 | 命令墙钟约 8.52 s |
| `node scripts/bundle-id.mjs --served --url http://127.0.0.1:50811` | 0 | source/served `dshm-3c68b1072173`，129615 bytes 内容相同；artifact rev `6f4d96484937` | 命令墙钟约 0.59 s |
| node_repl + VM 提取当前 `attachKeyboard`，仅桩 document/session/command | 成功执行（非独立进程） | DIV / BUTTON / defaultPrevented Space 均记录 toggle；INPUT 不触发；是函数诊断，不是宿主传播验收 | 未单独计时 |

键盘诊断首次提取范围错误报 `Illegal return statement`，修正为完整函数范围后才取得上述结果；
未改源文件。原始结果 `artifacts/ui-audit-20261107-codex/isolated-keyboard-diagnostic.json`。
未运行禁用的 live/perf 脚本。测试没有访问真实音乐文件或真实数据库。

#### Manual（Agent 操作真实 GUI，API 辅助只读取证）

| 步骤 | 结果 | 观察 |
|---|---|---|
| 音乐 → 全部歌曲，控件输入“莲梦” / 无匹配关键词 / 清空 | Passed | 2 首 / 无匹配提示 / 恢复原内容；通过 UIA set_value 输入，不能等同实测中文 IME 全链路 |
| 专辑页输入无匹配关键词 | Failed | 仍显示全部 27 张；工具与页面能力不一致 |
| 收藏零首 | Failed | 显示“音乐库是空的”与添加文件夹 |
| 专辑“于山”进入详情 | Failed | 标题“原唱”，曲目仍为“于山” |
| 更多 → 文件与规格 | Failed | 菜单消失，无对话框 |
| 展开面板 → 播放 → 暂停 | Passed | Host 播放态变化，迷你行/面板同步按钮，暂停后稳定；不表示音质人工听验通过 |
| 暂停时进度条从尾部拖到中段 | Passed | position 146986 → 72918 ms，保持 paused；面板时间和迷你进度随后同步 |
| 静音按钮 | 功能 Passed / 标签 Failed | muted=true 生效，名称仍是“静音” |
| Escape、浮层队列入口 | Passed / R06 缺口 | Escape 关闭；队列按钮关闭浮层并显示主队列，尚无面板内切换 |
| 约 799×601 全部歌曲 | Failed | 标题列几乎消失、次要固定列仍占宽；最大化恢复可读 |
| 同一矮窗口展开浮层，再滚动 | Passed（可达性） | 音量最初在下方，滚动可到达；未判成控件丢失 |
| 深色设置/队列/浮层/艺术家/文件夹/播放列表 | 已观察，非整套视觉验收 | 未见白色整页失配；浮层明显偏亮；不推导全部页面/对比度/动态效果通过 |
| 宿主设置内 Space；离开音乐后会话正文 Space | 未复现误播放 | 两次 API 均仍 paused；不能冒充键盘修复通过，真实传播链仍待验证 |

真实状态副作用已获用户本轮全面测试授权，播放前已告知可能出声；
先调用 `db.backup`，备份为 `$DSH_HOME/plugin-data/dsh-music/backups/library-2026-11-07T13-54-21-463Z.db`。
随后有限操作播放/暂停/seek/mute、宿主主题与导航。应用按设计更新播放持久化。
未对真实库扫描/增删来源、编辑收藏/歌单/元数据、拖排/清空队列或修改音频文件。
结束 API 核对：七首队列及顺序、trackId、mode、volume、muted、prefs 全同；
paused=true，positionMs 精确恢复为 138179，tracks=85、roots=4。
窗口恢复最初约 799×601、会话页、折叠侧栏；主题恢复跟随系统。
前后快照在证据目录 `before-status.json` / `after-status.json`。

限制：只读 served 核对不证明 DOM runtime bundle ID；本轮未重启或修改 Client。
未覆盖组合、媒体键、真实故障与队列手感等见实地审计末节；以上 Passed 只覆盖对应步骤。

---

## 9. 待补的测试（按优先级）

| 优先级 | 项 | 层 | 说明 | 状态 |
|---|---|---|---|---|
| P0 | 播放状态机假 engine 测试 | L1 | 覆盖 §5 列出的全部转换 | **未开始**（Phase 0B-2） |
| P0 | bundle 版本确认手段 | L3 | 没有它，所有客户端"已验证"不可信 | 未开始 |
| P0 | `playback-test` 逻辑迁移到隔离 L2 | L2 | 从禁止清单中移除的前提 | ✅ **已完成**（12 组断言，`test/integration/playback.test.mjs`） |
| P1 | `package.json` 增加 `scripts`（`test` / `test:l2` / `smoke`） | — | 降低误用与连错端口 | ✅ 已完成 |
| P1 | seek 一致性、持久化迁移 | L2 | 覆盖已知风险点 | 部分（seek 有）；**schema 升级已验证**（`scan_runs.failed`，v1→v2 + 幂等），见 `test/integration/scan.test.mjs` |
| P1 | 扫描链路 L3（升级后首次真实扫描） | L3 | 重启 DSH 后确认 `user_version=2`、`library.scanStatus` 的 `done/partial/error` 与 `failed` | ✅ **已完成**（2026-11-06，见 §8：四根各自计数、`failed 0`、队列 6/6 可解析） |
| P2 | 面板交互与窗口适配脚本 | L3 | 回归保护 | 未开始 |
| P2 | 极端数据清单化 | L4 | 依 `break-ui` 的失败签名 | 未开始 |
