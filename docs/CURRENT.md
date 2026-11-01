# CURRENT.md — 当前状态

> 每轮任务开始时读这里，结束时更新这里。它是"项目此刻在哪"的唯一来源；
> 规范看 `docs/DESIGN.md`，验证证据看 `docs/TESTING.md`。

最后更新：2026-11-02（Phase 0B-2 状态机回归网，工作区未提交）

---

## 1. 基线

| 项 | 值 |
|---|---|
| 分支 | `master`（无其它分支） |
| 最近验证基线 | **Phase 0B-2 的测试与代码提交**：`208023c`（player 注入）、`34defc6`（L1）、`38f4faa`（L2）；验证在提交前的工作区完成，三者内容一致 |
| 更早的已提交基线 | `18e8cf5`（Phase 0B-1）→ `16bcd45`（Phase 0A） |
| 当前 HEAD | 以 `git log -1` 为准；本轮最后一个是本文件所在的**文档提交**（不改变代码） |
| 版本 | `package.json` → `1.7.0`（本轮未变） |
| 标签 | **无**。计划中的 `baseline-v1.7.0` **必须指向 `b8dc624`**；打标签是单独的 Git 操作，尚未执行 |
| 工作区 | Phase 0B-3 改动，**未提交**：新增 `scripts/bundle-id.mjs`、`test/bundle-id.test.mjs`；修改 `client.js`（标记常量 + `apply` 内一处 `ctx.effect`）、`docs/TESTING.md`、本文件。Phase 0B-2 的代码与测试已在库：`208023c` / `34defc6` / `38f4faa` |

已提交的治理与测试基线：

| commit | 范围 | 状态 |
|---|---|---|
| `16bcd45` | Phase 0A 文档治理 | 已提交 |
| `18e8cf5` | Phase 0B-1 测试安全与隔离 | 已提交 |
| `208023c` | Phase 0B-2 第一步：`createPlayer` 注入 `delay` / `random` | 已提交 |
| `34defc6` | Phase 0B-2 第二步：L1 状态机测试（29 例） | 已提交 |
| `38f4faa` | Phase 0B-2 第三步：L2 队列一致性测试（8 例） | 已提交 |

历史回退点（无 tag 时按 commit 回退）：

| commit | 状态 | 适用场景 |
|---|---|---|
| `b8dc624` | v1.7，功能最全 | 默认回退点 |
| `0c9a626` | v1.6，队列已移出面板 | 队列相关排障 |
| `c0c3663` | v1.3，面板刚移入侧栏 | 结构最简的对照版本 |

---

## 2. 现在能用的

- mpv 独立进程播放；淡入淡出；`player.mode` 四态（Host 侧齐全）
- 迷你播放器：宿主行几何、封面 40px、点击/拖动进度、五键传输行
- 播放面板：封面优先、标题/艺术家、进度与剩余时间、音量行、打开/关闭/焦点
- 音乐库：41 首实测库、七类视图、搜索、排序、右键菜单、封面与规格
- 设置：库内嵌页 + `settings.section` 双挂载
- Host API：`queue.*`（含 `queue.list`）、`player.*`、`library.*`、`prefs.*`
- **L1 播放状态机测试**（29 例 = 24 回归 + 5 诊断；假 engine + 注入 `delay`/`random`；
  整批 45 例仍约 650ms，与改动前 16 例的 606–697ms 同一量级）与
  **L2 队列一致性测试**（8 例 = 7 回归 + 1 诊断，隔离 host、`ao=null`）
  ——见 `docs/TESTING.md` §2、§2.1
- **Bundle ID 取证**：`scripts/bundle-id.mjs`（源码指纹 / 宿主 served 字节 / 运行时 ID 三方比对）
  + `test/bundle-id.test.mjs`（9 例）。运行时标记由 `apply(ctx)` 的 `ctx.effect` 写入
  `<html data-dsh-music-bundle>`，随 fiber 卸载删除 —— 见 `docs/TESTING.md` §2.2

---

## 3. 已知未解决

| # | 问题 | 差异类型 | 影响 | 证据 | 状态 |
|---|---|---|---|---|---|
| **B1** | 音乐库「播放队列」一栏**渲染空白**（标题显示曲目数，内容区纯白） | Regression / Defect（**已修，L3 通过**） | 队列不可用；R07 无法验收 | **根因**：`QueuePanel` 以 `track: null` 调 `Cover`，`Cover` 在该路径读 `track.hasCover` → 首行抛 `TypeError`；而 `ErrorBoundary` 只读 `props.fallback`、两处调用点传的却是 `makeFallback` → 渲染 `null`，所以异常表现为"纯空白"而非报错。旧探针"纯 div 可渲染 / `.dshm-list` 不行"是把异常路径误读成了布局问题 | **已修**；2026-11-02 重启后 L3 通过：队列 6 行可见，`dshm-ab394dbf0ec0` 三方一致。**仍缺**：空队列状态 `Not tested`；"控制台无错误"只有间接证据（未直读 Console） |
| **B3** | 播放模式仍是两个按钮（随机 + 循环三态） | Implementation Gap | 与 R08 不符 | `client.js` 传输行 | 待排期 |
| **B4** | 面板内没有队列视图 | Implementation Gap | 与 R06 不符 | 队列按钮打开音乐库 | 待排期 |
| **B5** | Windows 媒体键未实现、路径未验证 | Implementation Gap | R11 `Not tested` | 见 `DECISIONS.md` D-07 | 待调查 |
| **B10** | 随机播放下「下一首播放」插到错误位置（`cursor+1` 是 `plays` 下标，却用来切 `queue`；随后又被整队重洗） | **已修（工作区，待重启 L3）**：仅 shuffle 受影响 | "下一首播放"在 shuffle 下不生效 | 见 `LIMITATIONS.md` §一 B10；L1 四模式 + L2 真实 mpv 均判定"下一个打开的文件就是刚插入的" | 已修，待 L3 |
| **B11** | 播放中切到单曲循环不裁 mpv 镜像尾，旧队列尾部仍被持有 | **未验证的技术风险**（无真实 mpv 证据前不宣称用户可见缺陷） | 队尾 EOF 时的实际表现未在真实 mpv 下复验 | 见 `LIMITATIONS.md` §一 B11 | 待 L2/L3 复验 |
| **B12** | 删除正在播放的队列条目会回到队首（而不是顺延到下一首） | **待产品裁定的交互行为**（不是已确认缺陷） | 与用户直觉不符，但无 Approved 条目 | 见 `LIMITATIONS.md` §一 B12 | 待裁定 |
| **B13** | 重复曲目时 `indexOf` 命中第一条，编辑队列后游标跳到第一份拷贝 | **已复现缺陷**：队列条目身份 / 游标一致性 | 队列高亮与"清空后续"可能作用在错误条目 | 见 `LIMITATIONS.md` §一 B13 | 已复现，修法未定 |
| **B14** | `queue.set` 丢掉当前曲时不重载：`trackId` 指向新队首，mpv 仍在播旧文件（同一份 snapshot 自相矛盾） | **已复现缺陷（高优先级）**：播放状态一致性，L1 + L2 双证据 | 现有 UI 只在含当前曲时调用，故未在界面暴露；`queue.set` 是公开 op | 见 `LIMITATIONS.md` §一 B14 | 已复现，待影响分析 |
| **B15** | 队列视图标题把整库曲目数当成队列长度 | **UI 缺陷**（不影响播放） | 标题「85 首」vs 队列 6 首，误导规模判断 | 见 `LIMITATIONS.md` §一 B15 | 待处理 |
| **B16** | 队列高亮行与实际播放曲目不一致（`cursor` 索引 `plays`） | **UI 缺陷**（与 B10/B13 同源） | 高亮错行 | 见 `LIMITATIONS.md` §一 B16 | 待处理（与 B10/B13 一并裁定） |

> **约束（原 B2）**：客户端 bundle 只在宿主启动时加载——这是**宿主约束**，已归入
> [`ARCHITECTURE.md`](../ARCHITECTURE.md) §8 约束 2；B2 编号不再复用。
> 全部缺陷编号见 [`LIMITATIONS.md`](../LIMITATIONS.md) §一。

---

## 4. 未验证清单

以下改动**已提交但未在真实环境确认**：

| 改动 | commit | 为什么未验证 |
|---|---|---|
| 按压反馈（`scale` + tint） | `b8dc624` | 需要真实指针与肉眼判读 |
| 迷你行悬停几何（去出血、无阴影） | `b8dc624` | 用户尚未复验 |
| 进度条"乐观定位"（防回弹） | `b8dc624` | 需要录屏/慢放判读 |
| 队列容器改用 `.dshm-list` | `b8dc624` | **已作废**：B1 的根因是渲染抛错，不是容器（见 §3 B1）；该改动本身无需再单独验收 |
| 自适应窗口尺寸下的面板钳制 | 历代 | 只做过一次失败尝试（窗口最大化时 `SetWindowPos` 无效） |

Phase 0B-2 新增的**部分验证**项：

| 项 | 已覆盖 | 缺什么 |
|---|---|---|
| B11 单曲循环镜像尾（**未验证的技术风险**） | L1（假 engine 断言未裁尾/未追加） | 真实 mpv 下的队尾 EOF 表现；拿到证据前不宣称用户可见缺陷 |
| B12 删除当前曲回到队首（**待产品裁定**） | L1 行为已锁定 | 产品意图（`DESIGN.md` 无对应条目）；测试通过不能代替裁定 |
| B14 `queue.set` 失步（**已复现的高优先级缺陷**） | L1 + L2（真实 mpv 确认 `trackId` 与 `engineFile` 矛盾） | 未修；修复需影响分析 |

Phase 0B-3（Bundle ID）的取证状态——2026-11-02 02:09 用户重启后核对：

| 项 | 状态 | 证据 / 缺口 |
|---|---|---|
| 当前客户端激活 ID（`data-dsh-music-bundle`） | **已观测（L3 通过）** | 用户在 F12 Console 读到 `{bundle: "dshm-67b0677998e1", phase: "plugin-active"}`，与源码 ID 一致；`--runtime` 复核 exit 0。旁证：进程启动 02:09:04 晚于最后一次编辑 02:06:52、artifact rev `bf6085bd2344` 与 Host 一致、错 rev 返回 404、Electron 对 `/plugins/*` 强制 `no-store` |
| Inspector 的四个 slot 注册与 `active` | **已核对（重启后）** | `sidebar.footer.action`→`dsh-music`(10)、`sidebar.panellist`→`music`(25)、`main`→`music`、`settings.section`→`dsh-music`(70)，全部 `active: true` |
| 实际可见组件状态 | **部分已核对** | 截图 `C:\Users\andy\AppData\Local\Temp\dsh-music-l3.png`：侧栏底部迷你行渲染出真实曲目「汀兰驭飞 / 兰音 Reine」与三键传输行；侧栏「音乐」入口可见。**未打开**音乐库/队列页，B1 仍未观察 |
| `active:true` 是否等于渲染正常 | **已证否**（rc.5 源码 + 本插件 `guardedCell` 在内侧先接住异常） | — | 见 `docs/TESTING.md` §2.2 的判读规则 |

---

## 5. 验证记录摘要

完整表在 `docs/TESTING.md` §8。最近四条（Phase 0B-3 工作区，未提交）：

- 2026-11-02 / Phase 0B-3 工作区 / L1 / `npm test` → **Passed** 55（45 既有 + 10 Bundle ID）
- 2026-11-02 / Phase 0B-3 工作区 / L2 / `npm run test:l2` → **Passed** 22
- 2026-11-02 / Phase 0B-3 工作区 / L2 / `npm run smoke` → **Passed** 21 checks
- 2026-11-02 / **用户重启后** / L3 / 打开「播放队列」→ **Passed**（6 行可见；`dshm-ab394dbf0ec0` 源码/served/运行时三方一致）

历史基线：

- 2026-10-30 / `b8dc624` / L3 / 打开音乐库「播放队列」 → **Failed**（内容区空白）
- 2026-10-30 / `b8dc624` / L3 / 面板音量行与五键行 → **Passed**（截图）

---

## 6. 下一步（按顺序）

1. **审核 B1 修复**（本轮，未提交）：`client.js` 两处（`Cover` 空值安全 + 错误降级契约）、
   `test/client-source.test.mjs`、文档
2. **B1 的空队列状态未验收**：需要在真实界面清空队列（会删掉待播列表），本轮未动
3. **B15 / B16**：队列标题的曲目数取整库、高亮行取错了下标空间——已登记，未修
4. **Phase 0B-2/0B-3 已入库**：`208023c` / `34defc6` / `38f4faa` / `3363e2e` / `537c39b`；
   打 `baseline-v1.7.0`（指向 `b8dc624`）仍待定
5. **候选 A 单独审查**：镜像计划深模块，属状态机高风险改动，需影响分析；前置条件已具备
5. **B1 队列空白**：F12 看是否有 `[dsh-music] render failed`——有＝渲染抛错，无＝容器/空子树
6. **缺陷裁定**：B12 / B13 / B14 逐个给结论（修 / 不修 / 改规范）；B11 先补 L2 复验；B10 已修（待 L3）
7. **R06 / R08**：面板内队列视图 + 单按钮四态（纯客户端）
8. **R11**：确认 SMTC 会话可见性，决定媒体键路径

---

## 7. 规范实现差异（不是待裁定）

| 规范 | 代码 | 差异类型 | 处理 |
|---|---|---|---|
| R06 面板内 封面 ⇄ 队列 | 队列在音乐库 | Implementation Gap | 修完 B1 后实现；实现方法未定（见 DESIGN §5） |
| R08 单按钮四态 | 两个按钮 | Implementation Gap | 纯客户端，待排期 |
| R11 媒体键 | 未实现 | Implementation Gap + 路径未验证 | 先确认 SMTC 可见性 |

> 按 `AGENTS.md` §2：先分类，再登记；不擅自改规范。

---

## 8. 本轮进展

**Phase 0A 第一步（已完成）**

- 新增 `AGENTS.md`、`docs/DESIGN.md`、`docs/TESTING.md`、`docs/DECISIONS.md`、`docs/CURRENT.md`
- 修订一：R01/R03/R07 拆子项；R04/R11 改 `Not tested`；新增"`Partial` 仅属 Implementation"、稳定 ID、单一事实来源
- 修订二（Phase 0A 最终审核）：
  - `DESIGN.md`：R06/R08 确立为**已批准目标**并移出待裁定；引入**版本绑定**、**父子摘要规则**、
    负面约束验证方式；S02 / D-04 明确为历史实现变化
  - `AGENTS.md`：§1/§10 改为"最近验证基线 + 当前状态"（不要求哈希等于 HEAD）；§2 引入
    Implementation Gap / Regression / Spec Drift 三分类；§4 明确"只改文档不算高风险"；
    §8 允许人工 `Passed` 但必须带类型/执行者/日期/版本/环境/步骤；§12 明确"恢复现场不能代替隔离"
  - `TESTING.md`：记录增加 类型 / 版本 / 适用范围 列；新增 §8.1 历史人工验收（v1.1–v1.2，未复用）
  - `DECISIONS.md`：D-04 明确其为历史实现变化，不否定 R06

**Phase 0A 第二步（已完成，`16bcd45`）**

- 新建 `CHANGELOG.md`：迁入 v1.1–v1.7 的版本记录（README 的流水账已移出）
- 收敛 `README.md`：安装 / 使用 / 开发 / 文档导航；历史与验收表移出
- `ARCHITECTURE.md`：只新增 §8 两条已证实宿主约束，并修正 `shell.overlay` 的历史标注
- `LIMITATIONS.md`：删除过期的"已完成清单"，改为缺陷登记（B1、B3–B9）+ 限制 + 不做清单

**Phase 0B-1（测试安全与隔离，已完成，`18e8cf5`）**

- `lib/host/plugin.js`：`DEFAULTS` 增加 `ao: 'wasapi'`，`normalizeConfig` 用白名单
  `AO_VALUES = ['wasapi','null']` 限制取值，非法值回落默认；`lib/host/engine.js` 的 argv
  改为 `--ao=${config.ao}`，**默认生产行为不变**
- `scripts/playback-test.mjs` / `scripts/loadtest.mjs`：顶部授权门（默认拒绝，退出码 2）；
  `loadtest` 另需 `DSH_MUSIC_ALLOW_PERF`；两者都移除了固定端口，要求显式 `DSH_MUSIC_API`
  且必须是回环 + `/music/api`
- `test/support/fixtures.mjs` / `test/support/host.mjs`：自建临时根、夹具生成、`ao=null`、
  进程内 dispatch、先 dispose 再删目录
- `test/integration/playback.test.mjs`：原 `playback-test` 的 12 组断言迁到隔离环境
- `test/guard.test.mjs`：本地计数 HTTP 服务证明"拒绝时目标收到 0 个请求"
- `test/support/host.mjs` 的异常路径加固：`mkdtemp` 之后的任何失败（模块加载、夹具生成、
  mpv 起不来、扫描失败）都会先 dispose 再删临时根，并把失败原因带出；
  `playback.test.mjs` 的 teardown 在 host 创建**之前**注册
- `scripts/service-smoke.mjs`：默认夹具库 + `ao=null`；真实库需 `--library … --allow-real-library`
- `package.json`：`test` / `test:l2` / `smoke` / `test:live` / `perf`

实测：`npm test` 16/16 通过（606ms）；`npm run test:l2` 14/14 通过（24.1s，`engine.ao='null'`）；
`npm run smoke` 21 项通过，`temp root removed`。**未执行**：真实宿主、真实音乐库诊断、有声测试、性能测试。

**Phase 0B-1 没有做的**

- 未改播放状态机、模式/队列/seek 语义、队列空白问题、UI/动效/Design Spec、`client.js`、版本号
- 未打标签、未重启 DSH、未删除 `artifacts/`
- **未验证生产音频路径**：`ao` 默认值仍是 `wasapi`，本轮只做了静态检查与隔离测试，
  没有用真实音频设备播放过（需要人工复验）

**Phase 0B-2（状态机回归保护，已提交：`208023c` / `34defc6` / `38f4faa` + 文档提交）**

目标：让播放状态机有快速、确定性的 L1 回归网，同时**不改生产行为、不改契约**。

- 选定的候选：架构评审里的 **B（注入时钟与随机）**；A（镜像计划）等状态机回归网就绪后单独审查；
  C（队列单一读取）不改变 Host/Client 契约、暂不实施；D（面板/边界）独立登记，等 bundle 标识与
  L3 验证能力具备后处理
- `lib/host/player.js`：`createPlayer` 增加两个**可选**参数 `delay`（默认 `engine.js` 的 `delay`）
  与 `random`（默认 `Math.random`），`shuffle()` 改用注入的 `random`。
  **未注入 `now`**：现有用例没有需要固定时间戳的断言，按"没有测试用途就不加"处理。
  淡变算法、`queue/plays/cursor/baseCursor`、`mode/next/prev/EOF/seek` 语义全部未动
- `test/support/player-harness.mjs`：假 engine（记录命令、可回推事件）+ 假 db（Map）
  + `delay: () => Promise.resolve()`；不导出任何生产私有函数
- `test/player-transport.test.mjs`（8 例 = 7 回归 + 1 诊断）：空队列、`playQueue` 起点与镜像、
  `next` 与回绕、`sequence` 队尾、单曲队列、`prev` 的 3 秒规则、切模式不重载；
  诊断项 = 单曲循环镜像尾（B11）
- `test/player-queue.test.mjs`（11 例 = 7 回归 + 4 诊断）：`move` / `removeAt` / `enqueue{next,end}` /
  `setQueue` 的当前曲保持、shuffle 起点与可达性；诊断项 = B10 / B12 / B13 / B14（B10 已于后续修复，转为回归断言）
- `test/player-eof-persist.test.mjs`（10 例，全回归）：`seek` 夹取、自动推进（`pos` 事件）、四态 EOF、
  解码错误跳过、`dispose → init` 往返、异常存档降级、`restoreQueue:false`
- `test/integration/queue-api.test.mjs`（8 例 = 7 回归 + 1 诊断，L2）：`queue.list ↔ snapshot` 顺序一致、
  `enqueue` 偏移一致、写操作回包可作权威快照、`move/remove` 一致、行元数据与库一致、
  `queue.clear`；诊断项 = `queue.set` 失步（B14，真实 mpv）

实测（提交前的工作区）：`npm test` **45/45**（40 回归 + 5 诊断，≈650ms）；
`npm run test:l2` **22/22**（21 回归 + 1 诊断，24.4s，`ao=null`）；
`npm run smoke` **21 项通过**，`temp root removed`。**未执行**：真实宿主、有声测试、性能测试。

敏感性核对（临时变异后立即还原，未入库）：把 `prev` 的 3 秒阈值改掉 → 对应用例失败；
把 `enqueue{next}` 的插入位置改一位 → 两条用例失败。证明这批断言不是"必然通过"。

**Phase 0B-2 没有做的**

- 未修任何已登记缺陷（B10–B14 只做 characterization + 登记）
- 未改 `client.js` / `ErrorBoundary` / slot / `DESIGN.md` / API 契约 / `package.json` 版本
- 未打标签、未开始 Phase 0B-3

**Phase 0B-3（Bundle ID 取证，工作区未提交）**

依据：rc.5 定向只读核验（slot 生命周期 / Electron `no-store` / Inspector 能力）。
采用精简方案 B'：**内容哈希 + 一处运行时标识 + 官方 Inspector**，不做 E/M/S 全套探针。

- `client.js`（+24 行，纯增量）：
  - factory 内 `const BUNDLE_ID = 'dshm-…' // dsh-music-bundle-id`——模块作用域，
    避免 19 个模块拼进同一经典脚本时顶层 `const` 冲突
  - `apply(ctx)` 第一个 `ctx.effect` 写 `documentElement.dataset.dshMusicBundle`、
    `…BundlePhase="plugin-active"` 与 `…BundleOwner`（每次激活一个 token），
    disposer **只在 owner 仍是自己时**清理（同一 ID 可能对应不同实例；rc.5 的 HMR 顺序是
    `tearDownEntryFiber → import → refresh`，但宿主侧重启用路径不保证，故用 token 让行为与顺序无关）
  - **只在激活路径写**：顶层写入只能证明字节被解析，不能证明插件被激活
- `scripts/bundle-id.mjs`：默认只读。校验源码指纹、`--write`（拒绝缺失/重复标记）、
  `--runtime`、`--served`（回环强校验 + 显式端口 + 超时 + 读首个 graph 帧后 `reader.cancel()`）
- `test/bundle-id.test.mjs`：9 例（指纹一致/标记唯一/换行归一/`--write` 幂等/
  缺标记与重复标记拒绝/陈旧报错不改文件/运行时值比对/非法 ID 拒绝）

实测（本工作区，未提交）：`npm test` **55/55**（924ms，含 10 例 Bundle ID）；
`npm run test:l2` **22/22**（24.3s，`ao=null`）；`npm run smoke` **21 项通过**；
`bundle-id --json` 一致（`dshm-67b0677998e1`）；
`bundle-id --served --url http://127.0.0.1:55844` 通过（artifact rev `bf6085bd2344` 与 Host 一致、
served 126 965 字节内容相同、served id 相同、host release `0.2.1-rc.5 / d4db512`）。

复审（提交前）：加实例所有权 token（同一 ID ≠ 同一实例）；脚本去掉动态 import、重复的 ID 正则、
双次解析与死分支，`--timeout` 增加取值校验；新增一条以真实 Host rev 为期望值的回归用例。

**Phase 0B-3 没有做 / 未验证**

- 运行时 ID 已在两次真实重启后观测（`dshm-67b0677998e1`、`dshm-ab394dbf0ec0`）
- 未验证：owner 保护在真实卸载路径下的行为（rc.5 的 HMR 顺序不会触发）

**B1 修复（工作区未提交）**

- 复现（真实 DSH，HMR 之前）：点「音乐」→「播放队列」，标题与工具栏正常、内容区全白且无任何文字
- 根因两级：
  1. `QueuePanel` 用 `track: null` 调 `Cover`（只给 id），`Cover` 在此路径读 `track.hasCover`
     → 首行抛 `TypeError: Cannot read properties of null (reading 'hasCover')`
  2. `ErrorBoundary` 只读 `props.fallback`，两处调用点传的是 `makeFallback` → 渲染 `null`
     → 崩溃表现为"纯白"，而不是红字
- 修复：`Cover` 改为 `track?.hasCover !== false`（只给 id 是它支持的用法）；
  `ErrorBoundary` 同时接受 `fallback` 与 `makeFallback(message)`，并把 `error.message` 交给降级文案
- 诊断过程留证：仅修降级契约后，界面出现
  `播放队列: Cannot read properties of null (reading 'hasCover')` —— 异常路径由此确证
- 新增 `test/client-source.test.mjs`（3 例静态守卫：`Cover` 不得解引用可空 `track`；
  `ErrorBoundary` 必须支持两种 fallback；所有调用点必须使用其中之一）
- 实测：`npm test` **58/58**；`test:l2` **22/22**；`smoke` 21 项；`bundle-id` = `dshm-ab394dbf0ec0`
- **L3（2026-11-02 重启后）通过**：F12 `dshm-ab394dbf0ec0`、`--served` rev `0d9847268425`
  内容一致、队列 6 行可见、迷你行与「全部歌曲」无回归
- 未做：空队列状态验收（需清空真实队列）、B10–B14、R06/R08、任何 API/状态机改动
- 编辑 `client.js` 会让 `client-hmr` 在 ≤500 ms 内热替换运行中模块（本轮发生了，rev 已变），
  但这**不算** L3 验证——热替换不是重启，也不代表四个 slot 重新注册成功
- 未改四个 slot 的 register/inject、未动 `immediately`、未改 `ErrorBoundary`、未修 B1、
  未加每 slot 的 mounted effect、未改状态机/队列/API/持久化、未做 HMR 故障注入

**B10 修复（工作区未提交，Host 侧）**

- 复现（隔离 L1，假 engine，四模式逐一跑）：playing A → 「下一首播放」d → 点下一首
  - `sequence` / `all` / `one`：下一首播 `d`（本来就正确）
  - `shuffle`：下一页播 **`b`**，且 `queue` 变成 `[a,b,c,d]`（`d` 落到队尾）
- 根因：`cursor` 索引的是 `plays`（shuffle 的排列），而 `enqueue('next')` 用
  `cursor + 1` 去切 `queue`。两个下标空间混用 → 插入位置错；紧接的 `rebuildPlays`
  又把整个队列重洗一遍 → 即使插对也会被洗走
- 修复（`lib/host/player.js` 的 `enqueue`，+9 / −12）：
  - `queue` 的插入位置按模式分开：非 shuffle 保持 `cursor + 1`（`plays` 是 `queue` 的镜像，
    下标精确，重复曲目也对）；shuffle 用「当前曲在 `queue` 里的下一位」
  - shuffle 下**直接 splice `plays`**（`cursor + 1`），不再 rebuild —— "下一首"是明确的顺序指令，
    重洗会把它抹掉；其余轮次顺序保持不动
- 非 shuffle 路径仍是原来的 `rebuildPlays + indexOf(keep)`，行为不变
- Red → Green：新回归测试先在旧代码上失败（`shuffle: the entry sits right after the current one`），
  修复后四模式全过；L2 用隔离 mpv 复验"下一个打开的文件就是刚插入的那首"
- 复核发现并修掉的自身回归：初版把两种模式都改成 `queue.indexOf(keep) + 1`，
  在 `[a,b,a]` 且播放第三项时会把新项插到第一个 `a` 之后（`[a,x,b,a]`）。
  同一用例在 `b02ec77` 基线上通过、在初版上失败，确认是本轮引入；已改回按模式分支。
  重复曲目的**游标**问题（重建后 `indexOf` 回到第一份）属 B13，未动
- 未改动：mpv 镜像计划、`queueEntryId`、API 契约、shuffle 策略、客户端
- 与 B14 的关系：**不同根因**（B14 是 `setQueue` 丢掉当前曲时传了 `restart: false`），
  两者可以独立修；本次未触碰 B14
- 尚未 L3：这是 Host 侧改动，需要重启 DSH 才在真实实例生效（客户端未改，Bundle ID 不变）
