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
| 工作区 | 提交后应为 clean。Phase 0B-2 的代码与测试已入库：`208023c` / `34defc6` / `38f4faa`；文档随第 4 个提交入库 |

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

---

## 3. 已知未解决

| # | 问题 | 差异类型 | 影响 | 证据 | 状态 |
|---|---|---|---|---|---|
| **B1** | 音乐库「播放队列」一栏**渲染空白**（标题显示曲目数，内容区纯白） | Regression / Defect | 队列不可用；R07 无法验收 | 探针确认：分支执行、收到 41 条、纯 div 可渲染，`overflow:auto` 容器不可；改用 `.dshm-list` 后**未验证** | **未解决** |
| **B3** | 播放模式仍是两个按钮（随机 + 循环三态） | Implementation Gap | 与 R08 不符 | `client.js` 传输行 | 待排期 |
| **B4** | 面板内没有队列视图 | Implementation Gap | 与 R06 不符 | 队列按钮打开音乐库 | 待排期 |
| **B5** | Windows 媒体键未实现、路径未验证 | Implementation Gap | R11 `Not tested` | 见 `DECISIONS.md` D-07 | 待调查 |
| **B10** | 随机播放下调 `enqueue{next}` 时插入位置错误（`cursor` 索引 `plays`，`queue` 被 `splice`；随后又被重新洗牌） | **高优先级缺陷候选**（与 R07「下一首播放」冲突；随机模式的完整顺序规则待定） | "下一首播放"在 shuffle 下不生效 | 见 `LIMITATIONS.md` §一 B10 | 待裁定 |
| **B11** | 播放中切到单曲循环不裁 mpv 镜像尾，旧队列尾部仍被持有 | **未验证的技术风险**（无真实 mpv 证据前不宣称用户可见缺陷） | 队尾 EOF 时的实际表现未在真实 mpv 下复验 | 见 `LIMITATIONS.md` §一 B11 | 待 L2/L3 复验 |
| **B12** | 删除正在播放的队列条目会回到队首（而不是顺延到下一首） | **待产品裁定的交互行为**（不是已确认缺陷） | 与用户直觉不符，但无 Approved 条目 | 见 `LIMITATIONS.md` §一 B12 | 待裁定 |
| **B13** | 重复曲目时 `indexOf` 命中第一条，编辑队列后游标跳到第一份拷贝 | **已复现缺陷**：队列条目身份 / 游标一致性 | 队列高亮与"清空后续"可能作用在错误条目 | 见 `LIMITATIONS.md` §一 B13 | 已复现，修法未定 |
| **B14** | `queue.set` 丢掉当前曲时不重载：`trackId` 指向新队首，mpv 仍在播旧文件（同一份 snapshot 自相矛盾） | **已复现缺陷（高优先级）**：播放状态一致性，L1 + L2 双证据 | 现有 UI 只在含当前曲时调用，故未在界面暴露；`queue.set` 是公开 op | 见 `LIMITATIONS.md` §一 B14 | 已复现，待影响分析 |

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
| 队列容器改用 `.dshm-list` | `b8dc624` | 生效需要重启 DSH；至今未在屏幕上确认 |
| 自适应窗口尺寸下的面板钳制 | 历代 | 只做过一次失败尝试（窗口最大化时 `SetWindowPos` 无效） |

Phase 0B-2 新增的**部分验证**项：

| 项 | 已覆盖 | 缺什么 |
|---|---|---|
| B11 单曲循环镜像尾（**未验证的技术风险**） | L1（假 engine 断言未裁尾/未追加） | 真实 mpv 下的队尾 EOF 表现；拿到证据前不宣称用户可见缺陷 |
| B12 删除当前曲回到队首（**待产品裁定**） | L1 行为已锁定 | 产品意图（`DESIGN.md` 无对应条目）；测试通过不能代替裁定 |
| B14 `queue.set` 失步（**已复现的高优先级缺陷**） | L1 + L2（真实 mpv 确认 `trackId` 与 `engineFile` 矛盾） | 未修；修复需影响分析 |

---

## 5. 验证记录摘要

完整表在 `docs/TESTING.md` §8。最近三条（Phase 0B-2 工作区，未提交）：

- 2026-11-02 / 工作区（内容 = `34defc6`）/ L1 / `npm test` → **Passed** 45（40 回归 + 5 诊断）
- 2026-11-02 / 工作区（内容 = `38f4faa`）/ L2 / `npm run test:l2` → **Passed** 22（21 回归 + 1 诊断）
- 2026-11-02 / 工作区（内容 = `38f4faa`）/ L2 / `npm run smoke` → **Passed** 21 checks

历史基线：

- 2026-10-30 / `b8dc624` / L3 / 打开音乐库「播放队列」 → **Failed**（内容区空白）
- 2026-10-30 / `b8dc624` / L3 / 面板音量行与五键行 → **Passed**（截图）

---

## 6. 下一步（按顺序）

1. **审核 Phase 0B-2**（本轮）：按 §8 的四个提交边界提交 → 打 `baseline-v1.7.0`（指向 `b8dc624`）仍待定
2. **候选 A 单独审查**：镜像计划深模块，属状态机高风险改动，需影响分析；前置条件（快速回归网）已具备
3. **B1 队列空白**：先用"探针把容器高度/行数画到界面上"确认真因，再修
4. **缺陷裁定**：B10 / B12 / B13 / B14 逐个给结论（修 / 不修 / 改规范）；B11 先补 L2 复验
5. **R06 / R08**：面板内队列视图 + 单按钮四态（纯客户端）
6. **R11**：确认 SMTC 会话可见性，决定媒体键路径
7. **动效**：按 `review-animations` / `emil-design-eng` 出第一份审查，先把参数从 Proposed 变 Approved

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
  `setQueue` 的当前曲保持、shuffle 起点与可达性；诊断项 = B10 / B12 / B13 / B14
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
