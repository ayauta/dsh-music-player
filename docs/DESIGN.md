# DESIGN.md — 产品、视觉与交互规范

本文件是**目标产品行为**的权威来源。代码是实现事实，不是规范。

状态分三个**独立**维度：

| 维度 | 允许取值 | 含义 |
|---|---|---|
| **Design Status** | `Proposed` / `Approved` / `Rejected` / `Superseded` | 这条需求是否被用户批准 |
| **Implementation Status** | `Not implemented` / `Partial` / `Implemented` | 代码做到什么程度 |
| **Verification Status** | `Not tested` / `Passed` / `Failed` / `Blocked` | 是否在真实环境验证过 |

## 0. 三条记录规则

**规则 1 — `Partial` 只属于 Implementation 轴。** Verification 轴不得使用 `Partial`；没跑过就是
`Not tested`，有明确的失败现象才是 `Failed`。

**规则 2 — 父子是摘要与细节，不是机械取最差。** 子项（`R03.a` 等）记录精确状态；
父项只是摘要，**只有在全部必要验收条件都满足时才能标 `Passed`**，否则写 `Not tested`
并在备注里指向子项。父项不需要为了"看起来一致"而复制子项的值。

**规则 3 — 每条验证结论必须绑定版本。**
每个 Verification 结论都要写清它对应的版本/commit。**历史 `Failed` 与当前版本
`Not tested` 是两件事**：某个早期版本失败，不能推断最新代码必然失败；反之，
早期通过也不代表当前版本通过。

其余约定：

- `Approved` 只代表设计意图被批准，**不代表已实现或已验证**。
- 具体数值（尺寸、时长、曲线）在未经用户确认前一律 `Proposed`。
- **稳定 ID**：`R01–R12`、`P01–P13`、`S01–S06`、`D-01–D-12` 一经分配**不得复用、不得重新编号**；
  被替代的条目保留，Design Status 改为 `Superseded` 并写明继任者。
- **单一事实来源**：本文件只写产品/视觉/交互规范；实现细节看 `ARCHITECTURE.md`，
  验证方法与结果看 `docs/TESTING.md`，决策原因看 `docs/DECISIONS.md`，进度看 `docs/CURRENT.md`。

最后更新：2026-11-02（R08 实现状态更新为 Implemented；R06 仍为缺口）

---

## 1. 已批准需求（Design = Approved）

| ID | 需求 | Design | Implementation | Verification | 验证对象版本 | 证据 / 备注 |
|---|---|---|---|---|---|---|
| **R01** | 播放器融入 DSH 原生风格，参考 Apple Music 的精致与实用 | Approved | Partial | **Failed** | v1.7 `/ b8dc624` | 见子项 R01.a / R01.b；暗色主题从未验证 |
| **R02** | 使用 DSH 主题变量与 `brand-primary`，不另建突出于宿主的配色 | Approved | Partial | Not tested | —（未正式验收） | 组件普遍使用 `--dsw-alias-*`；仍有写死字号（面板标题 17px）、硬编码阴影 `rgba(0,0,0,.26)` |
| **R03** | 迷你播放器保持宿主侧栏一行的几何结构，不加外溢卡片与阴影 | Approved | Implemented | **Failed** | v1.7 `/ b8dc624` | 见子项：几何已确认（R03.a），悬停阴影未复验（R03.b） |
| **R04** | 迷你播放器进度条必须支持点击定位与拖动 | Approved | Implemented | **Not tested** | v1.7 `/ b8dc624` | 见子项 R04.a / R04.b；点击可用仅作观察证据，不构成 `Passed` |
| **R05** | 正在播放面板以封面优先 | Approved | Implemented | **Passed** | v1.7 `/ b8dc624` | 面板封面满宽（`aspect-ratio: 1/1`）；证据 `artifacts/v12-crop-pop.png`（人工） |
| **R06** | **播放面板内切换封面与队列**；首次展开默认封面，之后重新展开**保留上次视图** | Approved | **Not implemented** | Not tested | v1.7 `/ b8dc624` | 当前代码把队列入口指向音乐库，属**实现缺口**，不是需求变更；见 §2 与 §5 |
| **R07** | 队列支持拖动排序、移除、下一首播放、添加到队列 | Approved | Partial | **Failed** | v1.7 `/ b8dc624` | 见子项：Host API 齐全（R07.a），UI 因渲染空白不可用（R07.b） |
| **R08** | 播放模式用**一个按钮**循环四态：列表播放 → 列表循环 → 单曲循环 → 随机播放 | Approved | **Implemented** | **Not tested** | —（待重启 L3） | `client.js` 的 `ModeButton`：`MODE_CYCLE = [sequence, all, one, shuffle]`，图标与可访问名称取自 Host 的 `mode`；切换只改写后续顺序，不重载当前曲 |
| **R09** | 切换播放模式不能打断当前音乐 | Approved | Implemented | **Passed** | v1.2 时期自动化（commit 未记录） | 自动化断言见 `docs/TESTING.md` §8；**结论仅覆盖 v1.2**，该脚本现已列入禁用清单，v1.7 未复跑 |
| **R10** | 不做波形、视频缩略图等非必要功能 | Approved | Implemented | **Passed** | v1.7 `/ b8dc624` | 负面约束（验证方式见 §1.2）；**静态检索**限定范围内未发现实现（范围见 `docs/TESTING.md` §8）；**未做完整 UI 走查** |
| **R11** | 优先支持 Windows 系统多媒体键 | Approved | **Not implemented** | **Not tested** | —（未实测） | 运行路径未验证，**不是确认不可实现**；见子项与 `docs/DECISIONS.md` D-07 |
| **R12** | 动效审查以 emilkowalski/skills 的实际文件与章节为依据（高频克制、直接操控、可中断、性能） | Approved | Partial | Not tested | —（尚无审查记录） | 仅一个全局缓动 `--dshm-ease = cubic-bezier(.32,.72,0,1)` 用于所有场景；时长散落 90–180ms，无 token |
| **R13** | 播放队列 = 唯一 trackId 的**单一可见播放顺序**：同一曲目不重复；「下一首播放」移动已有条目；随机只重排当前之后；「停止并清空队列」是唯一破坏性队列操作 | Approved | Implemented | Not tested | 工作区（未提交） | L1 21 例 + L2 真实 mpv 通过；**L3 未验证**（需重启 DSH）。见 `docs/DECISIONS.md` D-14 / D-15 / D-16 |

### 1.1 子项

| 子项 ID | 父项 | 内容 | Implementation | Verification | 验证对象版本 | 证据 |
|---|---|---|---|---|---|---|
| **R01.a** | R01 | 悬停观感与宿主同族 | Partial | **Failed** | v1.7 `/ b8dc624` | 用户确认"悬停阴影显示不对"（该次判断基于 v1.7 之前的版本，v1.7 的修正未复验） |
| **R01.b** | R01 | 暗色主题下的观感 | Partial | **Not tested** | — | 从未在暗色主题下截图或验收 |
| **R03.a** | R03 | 行几何：无卡片、与侧栏同宽、7px 圆角 | Implemented | **Passed** | v1.7 `/ b8dc624` | 用户确认"迷你播放器尺寸对了"（人工） |
| **R03.b** | R03 | 悬停无外溢阴影 | Implemented | **Not tested** | v1.7 `/ b8dc624` | 历史反馈（v1.7 之前）为不对；v1.7 已改为无阴影，**未复验**——按规则 3，不能沿用历史 Failed |
| **R04.a** | R04 | 点击定位可 seek | Implemented | **Not tested** | v1.7 `/ b8dc624` | 交互观察可用，但无自动化断言、未在改动后复验；仅作证据 |
| **R04.b** | R04 | 拖动全链路（按下→拖动→松手提交） | Implemented | **Not tested** | v1.7 `/ b8dc624` | 代码路径为"松手才提交一次 seek"，未在真实环境验证手感与结果 |
| **R07.a** | R07 | Host 侧四项队列操作 API | Implemented | **Not tested** | v1.7 `/ b8dc624` | `queue.move` / `queue.remove` / `queue.enqueue{next}` / `queue.enqueue{end}` 存在，未逐项验收 |
| **R07.b** | R07 | 队列 UI 可用（渲染 + 交互） | Partial | **Failed** | v1.7 `/ b8dc624` | 音乐库「播放队列」一栏渲染空白（见 `docs/CURRENT.md` B1） |
| **R11.a** | R11 | mpv 的 SMTC 会话是否被 Windows 识别 | Not implemented | **Not tested** | — | 能力由 mpv 默认提供（`--media-controls` 默认 yes），会话存在性未实测 |
| **R11.b** | R11 | 物理媒体键能否驱动播放 | Not implemented | **Not tested** | — | 当前参数下物理键路径被无 VO 窗口 + 无默认绑定阻断，未实测 |

### 1.2 负面约束的验证方式

`R10`（不做波形/缩略图）这类"不许有"的需求，验证方式为：

1. 代码检索：`client.js` / `lib/host/*` 中不得出现波形、缩略图、整库预分析的实现；
2. 界面走查：播放面板与音乐库不得出现相关入口；
3. 记录方式：在 `docs/TESTING.md` 的验证记录里记一条 `Manual`，写明检索范围与结论。

---

## 2. 实现缺口（Implementation Gap）

这些是**已批准目标与当前代码的差距**，不是待重新裁定的需求。

| 规范 | 代码现状 | 分类 | 后续 |
|---|---|---|---|
| R06 面板内 封面 ⇄ 队列 | 队列入口指向音乐库；面板没有第二视图，也没有"记住上次视图" | **Implementation Gap** | 先查清音乐库队列空白（B1），再在面板内实现；旧入口的处置单列（见 §5） |
| R08 单按钮四态 | **已实现**：`ModeButton` 四态循环（`sequence → all → one → shuffle`） | — | 待重启 L3 验收：图标与 Host 一致、切换不打断当前曲 |
| R11 媒体键 | 未实现 | **Implementation Gap + 路径未验证** | 先确认 SMTC 会话可见性 |

> 区分口径：**Implementation Gap** = 已批准但还没做；**Regression/Defect** = 曾经能用、现在坏了
> （如 B1 队列空白）；**未验证** = 没跑过，不下结论。

---

## 3. 参数待定（Proposed）

以下是代码里已经采用的数值，但**从未被正式确认**，一律记为 `Proposed`。
**不得因为"代码里已经是这个值"而升级为 Approved。**

> 说明：这些参数不需要逐个向用户单独审批。后续在实现 R01/R12 时，按**已批准的设计原则**
> （DSH 原生、封面优先、克制动效）+ Emil 规范（`emil-design-eng` 的 easing/duration 表、
> `review-animations` 的十条标准）+ **真实视觉验收**综合确定，届时再改状态。

| ID | 项目 | 当前值（实现事实） | 状态 |
|---|---|---|---|
| **P01** | 播放面板宽度 | `min(300px, 视口-24)`，最小 256px | Proposed |
| **P02** | 面板与迷你行的间距 | 面板底边 = 迷你行顶边 − 8px | Proposed |
| **P03** | 面板圆角 / 阴影 | `14px` / `0 20px 48px rgba(0,0,0,.26)` | Proposed |
| **P04** | 面板内封面圆角 | `12px` | Proposed |
| **P05** | 面板标题字号 | `17px / 600`（未走 type token） | Proposed |
| **P06** | 进度条厚度 | 迷你 3px（hover/拖动 5px）、面板 4px（hover 6px） | Proposed |
| **P07** | 进度滑块尺寸 | 12px；迷你行内隐藏、hover/拖动显示 | Proposed |
| **P08** | 图标按钮尺寸 | 28 / 40 / 52px 三档（sm / lg / xl） | Proposed |
| **P09** | 按压反馈 | `scale(.94)` / `scale(.96)` / `scale(.97)` 三档 | Proposed |
| **P10** | 动效时长 | 90ms（按压）/ 130ms（hover、颜色）/ 160ms（面板入场）/ 120ms（淡入类） | Proposed |
| **P11** | 动效曲线 | 全局 `cubic-bezier(.32,.72,0,1)`（drawer 曲线） | Proposed |
| **P12** | 顺序播放图标 | 自绘「三行 + 向下箭头」 | Proposed |
| **P13** | 队列行高度 / 列宽 | 行内网格 `34px 1fr 34px` | Proposed |

参考区间（不等于批准值）：`emil-design-eng` duration 表为按压 100–160ms、小浮层 125–200ms；
`review-animations` 第 4 条要求 UI 动画 <300ms。

---

## 4. 已废弃 / 被替代（Superseded / Rejected）

**这一节是历史，不构成对当前批准目标的否定。**

| ID | 曾经的方案 | 状态 | 与当前目标的关系 | 原因 |
|---|---|---|---|---|
| S01 | 播放面板放在 `shell.overlay` slot | Superseded | R06 现在的实现载体是"迷你行内部子组件" | slot 条目渲染空/抛错会被判 `active:false` 且不再挂载，导致"点不开"（D-03） |
| S02 | 队列作为面板内**第二屏**、`screen: 'now' \| 'queue'` 整块替换 | Superseded | **不否定 R06**：R06 仍要求面板内切换；S02 被放弃的是"整块替换 + 无记忆"这一具体实现 | v1.5 出现"点队列后面板消失且打不开"；防崩溃的改造（D-04） |
| S03 | 顺序播放用"右箭头 →"图标 | Superseded | — | 用户选定「列表 + 向下箭头」 |
| S04 | 迷你行 full-bleed（负 margin 贴侧栏两边） | Superseded | — | 圆角与阴影在整条边上观感错误 |
| S05 | 面板内提供歌词与规格 chips | Rejected（当前阶段） | — | 信息过载；解析能力保留 |
| S06 | 生成式 / 程序化封面 | Rejected | — | 用户要求中性占位 |

---

## 5. 未决问题（只列真正未定的事）

1. **R06 的实现方法**：目标已定（面板内切换 + 记住上次视图），未定的是——
   两个视图共用一层滚动还是各自滚动、切换用什么动效、视图状态存在内存还是持久化。
2. **B1 队列空白的根因**：探针已排除"没数据/没执行"，剩下容器高度与行结构两类可能，未定论。
3. **旧音乐库「播放队列」入口的处置**：R06 落地后，这一栏是保留（作为队列的完整视图）
   还是移除，未定。
4. ~~队列条目身份~~ **已决**：条目身份 = 唯一 `trackId`，不引入 `entryId`（R13 / D-15）。
5. **随机模式顺序稳定性**：当前每次队列编辑都重新洗牌；是否需要"一轮不重复"（D-10）。
6. **Windows 媒体键落地路径**：依赖 mpv 的 SMTC，还是由 DSH 侧接管（D-07）。

---

## 6. 变更记录

| 日期 | 变更 | 依据 |
|---|---|---|
| 2026-11-01 | 初稿：整理 R01–R12、P01–P13、S01–S06 | Phase 0 文档治理 |
| 2026-11-01 | 修订一：R01/R03/R07 拆子项；R04/R11 改 Not tested；新增 `Partial` 仅属 Implementation、稳定 ID、单一事实来源 | 用户审阅意见（一） |
| 2026-11-01 | 修订二：R06/R08 确立为已批准目标并移出"待裁定"；引入版本绑定、父子摘要规则、负面约束验证方式；S02/D-04 明确为历史实现变化 | 用户审阅意见（Phase 0A 最终） |
