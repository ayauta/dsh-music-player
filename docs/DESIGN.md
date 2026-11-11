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

最后更新：2026-11-11（文档重构：R07 / R13 / R14 的版本列改为已提交 commit，状态按证据校正）

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
| **R07** | 队列支持拖动排序、移除、下一首播放、添加到队列 | Approved | Partial | **Not tested** | v1.7 `/ b8dc624`（当次 Failed） | 见子项：R07.a / R07.b / R07.c 均为 Not tested；v1.7 的渲染空白（B1）已修，2026-11-02 复验队列可见 |
| **R08** | 播放模式用**一个按钮**循环四态：列表播放 → 列表循环 → 单曲循环 → 随机播放 | Approved | **Implemented** | **Not tested** | —（待重启 L3） | `client.js` 的 `ModeButton`：`MODE_CYCLE = [sequence, all, one, shuffle]`，图标与可访问名称取自 Host 的 `mode`；切换只改写后续顺序，不重载当前曲 |
| **R09** | 切换播放模式不能打断当前音乐 | Approved | Implemented | **Passed** | v1.2 时期自动化（commit 未记录） | 自动化断言见 `docs/TESTING.md` §8；**结论仅覆盖 v1.2**，该脚本现已列入禁用清单，v1.7 未复跑 |
| **R10** | 不做波形、视频缩略图等非必要功能 | Approved | Implemented | **Passed** | v1.7 `/ b8dc624` | 负面约束（验证方式见 §1.2）；**静态检索**限定范围内未发现实现（范围见 `docs/TESTING.md` §8）；**未做完整 UI 走查** |
| **R11** | 优先支持 Windows 系统多媒体键 | Approved | **Not implemented** | **Not tested** | —（未实测） | 运行路径未验证，**不是确认不可实现**；见子项与 `docs/DECISIONS.md` D-07 |
| **R12** | 动效审查以 emilkowalski/skills 的实际文件与章节为依据（高频克制、直接操控、可中断、性能） | Approved | **Implemented** | **Passed**（2026-11-12） | emilkowalski/skills @ `715c180` | 规范落到 §6，测试落到 `TESTING.md` §2.4，首次审查记录 `docs/audits/2026-11-12-motion.md`；审出 7 项缺陷（B22–B28）；已按 §6 修复（工作区，待重启 L3） |
| **R13** | 播放队列 = 唯一 trackId 的**单一可见播放顺序**：同一曲目不重复；「下一首播放」移动已有条目；随机只重排当前之后；「停止并清空队列」是唯一破坏性队列操作 | Approved | Implemented | Not tested | 已提交 `977a62d`（文档 `88d5551`） | L1 21 例 + L2 真实 mpv 通过；**L3 未验证**（需重启 DSH）。见 `docs/DECISIONS.md` D-14 / D-15 / D-16 |
| **R14** | 曲目身份：路径用于自动识别已有记录，`trackId` 是持久身份；自动扫描不依据指纹推断文件移动。同一路径重扫沿用原 id；同一路径换内容沿用 id 只更新元数据；不同路径就是不同曲目（内容相同也不合并）；**扫描不推断改名**——旧路径的行标 `missing` 并保留收藏/歌单/覆盖/队列引用；移除来源只停止扫描，不删曲目行，重新添加同一路径恢复原 id 与关联；扫描根不得互相包含（历史重叠只报告）；目录不可读时扫描报错且不把整根曲目标 missing | Approved | Partial | Not tested | 已提交 `cdd60aa`（文档 `59a1e9b`） | 已实现：身份/缺失/来源生命周期/根重叠/扫描安全（L2 19 例）。**未实现**：`track.relocate`（单曲重新定位）、`roots.relocate`（整文件夹搬家）、缺失项的界面呈现与"定位文件"入口——见 `docs/DESIGN.md` §2 与 `docs/CURRENT.md` §5。规则见 `ARCHITECTURE.md` §3、`docs/DECISIONS.md` D-19 / D-20 |

### 1.1 子项

| 子项 ID | 父项 | 内容 | Implementation | Verification | 验证对象版本 | 证据 |
|---|---|---|---|---|---|---|
| **R01.a** | R01 | 悬停观感与宿主同族 | Partial | **Failed** | v1.7 `/ b8dc624` | 用户确认"悬停阴影显示不对"（该次判断基于 v1.7 之前的版本，v1.7 的修正未复验） |
| **R01.b** | R01 | 暗色主题下的观感 | Partial | **Not tested** | — | 2026-11-07 观察到深色设置 / 队列 / 浮层 / 艺术家 / 文件夹 / 播放列表未见白色整页失配（`docs/audits/2026-11-07-ui.md`），但审计自述**非整套视觉验收**，故不改判 |
| **R03.a** | R03 | 行几何：无卡片、与侧栏同宽、7px 圆角 | Implemented | **Passed** | v1.7 `/ b8dc624` | 用户确认"迷你播放器尺寸对了"（人工） |
| **R03.b** | R03 | 悬停无外溢阴影 | Implemented | **Not tested** | v1.7 `/ b8dc624` | 历史反馈（v1.7 之前）为不对；v1.7 已改为无阴影，**未复验**——按规则 3，不能沿用历史 Failed |
| **R04.a** | R04 | 点击定位可 seek | Implemented | **Not tested** | v1.7 `/ b8dc624` | 交互观察可用，但无自动化断言、未在改动后复验；仅作证据 |
| **R04.b** | R04 | 拖动全链路（按下→拖动→松手提交） | Implemented | **Passed**（Manual，2026-11-07） | v1.7 工作区 + `2473b79` | 暂停态从尾部拖到中段：`position 146986 → 72918 ms`、保持 paused、面板与迷你行随后同步（TESTING §8.2）。**范围**：单次拖动、约 799×601；未测播放中拖动、拖动中断、慢放判读 |
| **R07.a** | R07 | Host 侧四项队列操作 API | Implemented | **Not tested** | v1.7 `/ b8dc624` | `queue.move` / `queue.remove` / `queue.enqueue{next}` / `queue.enqueue{end}` 存在，未逐项验收 |
| **R07.b** | R07 | 队列 UI 可用（渲染 + 交互） | Partial | **Not tested** | v1.7 `/ b8dc624`；渲染于 2026-11-02 复验 | B1 已修（`73315dc`）：完整重启后队列 6 行可见（TESTING §8）。交互（拖排 / 移除 / 入队）未逐项验收 |
| **R07.c** | R07 | 点击队列中的某一行，播放**该歌曲**（按 trackId 解析，不按快照里的下标）；曲目已移出队列则拒绝；队列的集合与顺序以 Host 的 `player.queue` 为准，不得替换成整库；行可用键盘（Enter / Space）触发 | Implemented | **Not tested** | 已提交 `3ca1ea9`（B15） | `player.jump{trackId}` + `jumpToTrack()`；L1 两例、L2 一例、客户端静态守卫四条；**未做 L3** |
| **R11.a** | R11 | mpv 的 SMTC 会话是否被 Windows 识别 | Not implemented | **Not tested** | — | 能力由 mpv 默认提供（`--media-controls` 默认 yes），会话存在性未实测 |
| **R11.b** | R11 | 物理媒体键能否驱动播放 | Not implemented | **Not tested** | — | 当前参数下物理键路径被无 VO 窗口 + 无默认绑定阻断，未实测 |

### 1.2 负面约束的验证方式

`R10`（不做波形/缩略图）这类"不许有"的需求，验证方式为：

1. **每次发版**：代码检索 `client.js` / `lib/host/*`，不得出现波形、缩略图、整库预分析的实现
   （可脚本化，进 `npm test` 的静态守卫）；
2. **仅在新增入口或新增表面时**：界面走查播放面板与音乐库，确认没有相关入口；
3. 记录方式：在 `docs/TESTING.md` 的验证记录里记一条 `Manual`，写明检索范围、是否做了 UI 走查及理由。

---

## 2. 实现缺口（Implementation Gap）

这些是**已批准目标与当前代码的差距**，不是待重新裁定的需求。

| 规范 | 代码现状 | 分类 | 后续 |
|---|---|---|---|
| R06 面板内 封面 ⇄ 队列 | 队列入口指向音乐库；面板没有第二视图，也没有"记住上次视图" | **Implementation Gap** | 队列渲染空白（B1）已修；按 R06 在面板内实现切换，旧入口的处置单列（见 §5） |
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
| **P04** | 面板内封面圆角 | `10px`（与卡片同族） | **Approved**（2026-11-12，§7） |
| **P05** | 面板标题字号 | `17px / 600`（未走 type token） | Proposed |
| **P06** | 进度条厚度 | 迷你 3px（hover/拖动 5px）、面板 4px（hover 6px） | Proposed |
| **P07** | 进度滑块尺寸 | 面板 12px；迷你行 10px，平时隐藏、hover/拖动显示 | Proposed |
| **P08** | 图标按钮尺寸 | 28 / 40 / 52px 三档（sm / lg / xl） | Proposed |
| **P09** | 按压反馈 | `.94` 图标 / `.96` 大播放键 / `.97` 文字按钮 / `.985` 导航；按下 110ms、松开 160ms `ease-out` | **Approved**（2026-11-12，D-22；同日按 Apple「pointer-down 即反馈」调整） |
| **P10** | 动效时长 | 110 按下 · 160 松开（按压）/ 130（悬停、颜色）/ 200 进 · 160 出（浮层）/ 120（菜单、淡入）/ 200–240（模态）；全部 <300ms | **Approved**（2026-11-12；晚间按 NN/G「出现 200–300、消失更短」与退出可感知度调整） |
| **P11** | 动效曲线 | `--dshm-ease-out` `cubic-bezier(.23,1,.32,1)`（进入/退出）；`--dshm-ease-in-out` `cubic-bezier(.77,0,.175,1)`（屏内移动）；悬停/颜色用 `ease`；drawer 曲线只留给边缘滑入 | **Approved**（2026-11-12） |
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

## 6. 动效规范（2026-11-12，依据 D-22）

**权威**：`.dsh/skills` 的 `apple-design` / `emil-design-eng` / `review-animations`
（emilkowalski/skills @ `715c180`）。**第一判据是在 DSH 里不突兀**；与技能条文冲突时砍动效，不砍一致性。
本项目 CSS-only、无动画库，所以依赖弹簧与手势速度的条文一律 N/A——可中断性用 transition 达成。

### 6.1 什么时候动

| 频率 | 决策 |
|---|---|
| 100+ 次/天（键盘触发、传输键连点、命令式操作） | **不动效** |
| 数十次/天（悬停、行切换、按钮底色） | 只保留颜色/背景，≤130ms，不加位移 |
| 偶发（面板、菜单、对话框） | 位移 + 缩放，125–200ms |
| 首次 / 罕见 | 可加细节，仍 <300ms |

### 6.2 曲线（P11）

| 用途 | 令牌 | 值 |
|---|---|---|
| 进入 / 退出 | `--dshm-ease-out` | `cubic-bezier(.23, 1, .32, 1)` |
| 屏内移动 | `--dshm-ease-in-out` | `cubic-bezier(.77, 0, .175, 1)` |
| 悬停 / 颜色 | `ease` 关键字 | — |

**禁止 `ease-in`**：它在用户最关注的时刻最慢。drawer 曲线（`.32,.72,0,1`）只保留给从边缘滑入的容器，
不得再用于颜色、按压与尺寸变化。

### 6.3 时长（P10）

| 场景 | 目标值 |
|---|---|
| 按压反馈 | 按下 110ms / 松开 160ms |
| 悬停 / 颜色 | 130ms |
| 小浮层进入 / 退出 | 200 / 160ms |
| 菜单、淡入 | 120ms |
| 模态 | 200–240ms |

全部 <300ms；**退出不得慢于进入**。

### 6.4 属性

- 允许：`opacity`、`transform`、`color`、`background-color`。
- **禁止**对 `height` / `width` / `top` / `left` / `margin` / `padding` / `box-shadow` 做 transition。
  需要"变高/变大"时用 `transform: scaleY / scale`，或者干脆不过渡。
- 禁止过渡 `background` 简写：它会带上不该动的位置/重复等子属性，一律写 `background-color`。

### 6.5 物理与空间

- 进入从 `scale(.96–.98)` + `opacity: 0`；**禁止 `scale(0)`**。
- `transform-origin` 锚在触发器；进入与退出走同一条路径；退出曲线取进入曲线的镜像。
- 可逆 UI（面板、开关、抽屉）用 **transition**，不用 keyframes——keyframes 被打断会从零重播。
  keyframes 只允许一次性装饰入场，且 ≤120ms。
- 动效期间不得锁输入；`pointer-events: none` 只用于真正不可交互的状态。

### 6.6 无障碍

- `prefers-reduced-motion: reduce`：去掉位移与缩放，保留 ≤200ms 的 `opacity` / `color`。
- `prefers-contrast: more`：进度轨加粗保留。
- 悬停位移必须包在 `@media (hover: hover) and (pointer: fine)` 内。

### 6.7 维护

- 未被引用的 `@keyframes`、从未被写入的 `data-*` 状态 = 缺陷，删掉。
- 新增动效必须同时：进本节表格、进 `docs/TESTING.md` §2.4 的白名单与静态守卫。

---
## 7. 播放面板版式（2026-11-12，Approved）

依据 D-22 与 `AGENTS.md` §16；采用「A · 苹果式」：封面优先、三键传输、工具进 header。
竞品调研见 [`docs/audits/2026-11-12-panel.md`](audits/2026-11-12-panel.md)。

| 项 | 值 |
|---|---|
| 面板宽 | 300px（视口过窄时 256px 兜底） |
| 内容边距 | 左右 **16px**；header `6px 12px 0`，body `0 16px 16px` |
| 封面 | 内容宽（当前 268px），1:1，圆角 **10**，`max-height: 46vh` |
| 垂直节奏 | 内容块 **14px**；控制组：传输行上 **10px**、音量行上 **6px**（按 52/28 按钮的内边距折算，视觉间隔约 27–29px） |
| 标题 | 17px / 600；艺术家 13px 次级色 |
| 时间 | 11px 等宽数字，两端对齐，剩余带负号 |
| 传输行 | **三键居中、同尺寸 44×44（圆角 12）**，间距 18；层级只靠字形（18 / 20 / 18），**不靠尺寸、不加强调填充**；悬停给 8% 中性**圆角矩形**底色 + 图标提亮，按下缩放；**不加阴影** |
| 模式 | header 右侧 28px；**四种状态都无背景、无着色**，状态由图标形状 + `aria-label` 表达 |
| 队列 | header 右侧 28px |
| 进度条 | 轨 4px（悬停/拖动 6px）；**滑块 12px 常显**；命中区 20px |
| 音量 | 标准滑块形态：轨 3px（槽 12%）、填充主色、**滑块常显 12px**；左侧扬声器图标兼作最小值图标，点击静音 |
| 可见标题 | **无**；`aria-label="正在播放"` 保留，位置留给 R06 的分段控件 |

不做：封面与文字不同缩进、第四条传输键、第二条同重滑轨。

### 7.1 每条参数的来源（对应 §16.1）

| 参数 | 来源 |
|---|---|
| 删除可见标题 | 竞品：Apple Music Now Playing 无标题栏；HIG · Simplicity（每个元素都要挣得位置） |
| 三键传输 | 竞品：Apple Music Now Playing 仅 上一首/播放/下一首；模式属于设置语义 |
| 传输三键同尺寸 | HIG · Buttons：「Use style — not size — to visually distinguish… placing two buttons of different sizes near each other can make the interface look confusing and inconsistent」；44px 取自同页 44×44 pt 命中区下限 |
| 传输键悬停底色 | HIG · Toolbars：无边框符号按钮「the system defines hover and selection state appearances automatically」；形状取 **macOS 语境的圆角矩形**（不引用 visionOS 圆钮）；emil：hover 绑 `(hover: hover) and (pointer: fine)` |
| 模式键无背景 | HIG · Buttons：只有强调按钮才用背景色（`prominent button style` → accent background），且「keep the number of prominent buttons to one or two per view」；模式是工具键，不是主操作 |
| 进度滑块常显 | HIG · Sliders：thumb 是控件本体，用来指示与拖动当前值 |
| 16px 边距 | HIG · Layout「视觉层级」+ 本项目卡片栅格既有 16px |
| 封面圆角 10 | 本项目卡片同族（P04）；非 Apple 规范数字 |
| 音量滑块形态（轨 + 常显 thumb + 填充） | HIG · Sliders：「A slider is a horizontal track with a control, called a thumb」+「the portion of track between the minimum value and the thumb fills with color」 |
| 音量填充主色 | HIG · Sliders 的 macOS 章节：thumb 左侧轨道「filled with color」；竞品 Apple Music：音量与进度同为 label 色，靠粗细/位置分层 |
| 音量轨 3px、槽 12% | HIG · Sliders：允许自定义 track 颜色与粗细；数值为**假设**，判据是"可见但不抢进度条" |
| 扬声器图标在左 | HIG · Sliders：「optionally display left and right icons that illustrate the meaning of the minimum and maximum values」 |
| **未实现**：输出设备切换 | HIG · Playing audio：音量视图应包含 level slider + 输出设备控制；本插件没有该 Host API → 登记为已知限制 §三 23 |
| 传输 10 / 音量 6 内侧距 | 视觉目标 28px（与 Apple Music 进度→传输的间距同量级）；数值为**假设**，经实机截图校正 |


---
## 8. 变更记录

| 日期 | 变更 | 依据 |
|---|---|---|
| 2026-11-01 | 初稿：整理 R01–R12、P01–P13、S01–S06 | Phase 0 文档治理 |
| 2026-11-01 | 修订一：R01/R03/R07 拆子项；R04/R11 改 Not tested；新增 `Partial` 仅属 Implementation、稳定 ID、单一事实来源 | 用户审阅意见（一） |
| 2026-11-01 | 修订二：R06/R08 确立为已批准目标并移出"待裁定"；引入版本绑定、父子摘要规则、负面约束验证方式；S02/D-04 明确为历史实现变化 | 用户审阅意见（Phase 0A 最终） |
| 2026-11-12 | 新增 §6 动效规范；P09–P11 转 Approved；R10 验证方式改为"静态每版 + 新增入口时走查"；R12 按首次审查转 Passed | D-22、`docs/audits/2026-11-12-motion.md` |
| 2026-11-12 | 新增 §7 播放面板版式：去可见标题、三键传输、模式进 header、16px 边距、封面圆角 10、音量降权 | 竞品调研 + 用户裁定（A 方案） |
