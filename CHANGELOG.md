# CHANGELOG

本文件记录**版本变化流水**（新→旧）。它是"每个版本改了什么"的唯一来源；
产品规范看 `docs/DESIGN.md`，验证结果看 `docs/TESTING.md`，决策原因看 `docs/DECISIONS.md`。

约定：

- 版本号取自 `package.json`；一次版本可能对应多个提交（功能提交 + 版本号提交）。
- 只有带 commit 的条目才可追溯；无 commit 的历史只保留事实描述。
- **`Fixed` 只表示"该版本做了修复改动"**，不代表已验证；验证状态以 `docs/TESTING.md` §8 为准。
- **"已提交"不等于"已验证"**：验证状态以 `docs/TESTING.md` §8 为准。

---

## [Unreleased] — `b8dc624` 之后（未发版）

`package.json` 仍是 `1.7.0`；下列改动都在 `b8dc624` 之后提交，尚未发版。

**Added**
- 四层验证网与授权门：L1 状态机与客户端守卫、L2 隔离 Host、Smoke、Bundle ID 取证（`18e8cf5`、`208023c`、`34defc6`、`38f4faa`、`3363e2e`、`1253091`）
- 扫描台账：每个 root 一份 `done/partial/error` + `failed` 计数，异常不留 `running`（`7a72093`）

- `scripts/syntax-check.mjs`（全树 46 个文件）与 `scripts/test-repeat.mjs`（量红率）；`npm run check` 现在是"全量语法检查 + L1"

**Changed**
- 队列改为单一可见顺序，镜像由 Engine 读回确认（`977a62d`）；「下一首播放」在 shuffle 下按当前曲位置插入（`ff053fb`）
- 曲库身份按路径沿用：改名＝新曲目 + 旧行 `missing`；移除来源保留行与引用，重新添加恢复原 id（`cdd60aa`）

**Fixed**
- B1 队列视图渲染空白（`73315dc`）、B10（`ff053fb`）、B15（`3ca1ea9`）、B17（`977a62d`）、B19（`8e9c6c7`）、B20 暂停回包滞后（`feef92a`）
- 动效规范（DESIGN §6）、B22–B28：面板补退出动画、曲线与时长分工、去掉 height / box-shadow 过渡、删死代码、hover 门控（工作区，待重启 L3）；同批修掉实机暴露的 React #310（hooks 顺序）；退出 160ms、按按下/松开拆分、播放图标乐观翻转
- 播放面板版式（DESIGN §7）：删除可见「正在播放」、传输行回归三键、模式移入 header、统一 16px 边距、封面圆角 10、音量按 HIG Sliders 还原为标准滑块；模式键去掉状态背景；进度滑块改为常显；传输三键统一 44×44 圆角矩形（层级只靠字形 18/20/18），悬停底色为 8% 圆角矩形（工作区，bundle `dshm-c517ae41e53e`）
- 交互可靠性 CUI-01 / CUI-02：空格先看 `defaultPrevented`，再让位于获得焦点的控件（`button` / `input` / `[role=option]` / `[role=slider]` 等），音乐表面外只在没有焦点时接管；队列面板拆成 `pending / ready / failed` 读取状态，重读保留旧行、失败给只读重试（只重发 `queue.list`），清空/移除不会因读取失败被自动触发（bundle `dshm-2a24b8d96206`，待重启 L3）
- 播放头算术抽出为纯函数模块 `lib/shared/playhead.js`（`estimatePositionMs` / `progressFraction` / `remainingMs`），由 `scripts/inline-playhead.mjs` 生成进 `client.js` 标记区；**修掉负位置缺陷**（原 `estimateMs` 只夹上界，采样时刻晚于当前时钟时位置会变成负数）；`RemainingText` 与进度分数改用同一实现（bundle `dshm-df11aeedaff9`，待重启 L3）
- 定位（seek）的"防回弹"改为按**采样时刻**判新旧（`resolveSeek`），替掉 `1600ms / 900ms` 两个阈值——旧规则会在它本该遮住的那张旧快照上提前放行；补间锚点从 `Date.now()` 换成 `performance.now()`（`anchorOf`，按快照对象身份缓存），NTP 对时/休眠恢复不再让进度条跃动；`isAdvancing` 收紧为两个标志齐备（bundle `dshm-e03542edadba`，待重启 L3）
- **B30 重启后第一次点播放没反应**：`player.toggle()` 只读 mpv 的 `pause`，而新进程默认 `no` 且没有文件打开，第一按被解析成"暂停空气"；改为"没有文件打开就一律 `resume()`"（D-29）。L1 用恢复态紧闭环复现并守住"已加载时的暂停不受影响"
- **B31 大播放器进度条一卡一卡**：补间锚点按读到的对象身份缓存，`status` 每次读回都是新对象（1 Hz 轮询 + 每条命令后补读），同一张采样被重复读到就重置锚点 → 显示位置回退再爬；改为 `nextAnchor` 按**采样身份**复用锚点（D-27 补记）
- **D-28 撤掉插件全部键盘绑定**：删除 D-23 遗留的 `attachKeyboard` / `KEY_OWNERS` / `controlOwnsKey` / `inMusicSurface` 与 `ctx.effect` 注册，以及进度条 `←/→/Home/End`、音量条 `←/→`、队列行 `Enter/Space`、库行 `Enter` 与 `ContextMenu / Shift+F10`、搜索框 `Esc`；`role="slider"` 降级为 `progressbar` / `meter`、行元素去掉 `tabIndex`。保留浏览器原生控件行为与"Esc 关闭已打开表面"（bundle `dshm-fe6cba61dd8e`，待重启 L3）
- **B32 暂停后进度条仍抖动**：`paint()` 每帧无条件写 `--p` 与气泡文本（120 次/秒），`--p` 驱动的 `left: calc()` / `scaleX()` 每次失效都重新取整，静止时表现为约 1px 微动；改为 `nextPaint` 变化判定（分数按 1e-5 量化），并删掉 hover 时对气泡的第二次写入（D-30；bundle `dshm-cc5effbf6882`，待重启 L3）
- **B33 暂停后进度条回缩一次**：`pause()` 没有在暂停确认后重新盖章，`positionMs` 仍是上一次 1 Hz 轮询的旧值；客户端已经插值画到真实位置，却被这张旧快照按回去，下一次轮询再前跳。改为暂停确认后读一次 `time-pos` 写回 `positionMs` / `positionSampledAt`（D-31；**宿主侧改动，需重启 DSH**）

- **B34 暂停后"有概率"回缩一下再前进**：客户端两条 `status` 请求源没有定序，命令在宿主侧 await 淡出约 200ms，点击前发出的轮询可以后到并把旧快照盖在暂停快照上——锚点回到旧位置、`advancing` 重新为真。改为请求**发出时编号**、更旧的答案一律丢弃（`acceptResponse`，D-32；bundle `dshm-016c9bffbb5c`，待重启 L3）

- **B35 暂停后回缩（真凶）**：1 Hz 轮询的 `time-pos` 读取会跨过一次暂停/seek，返回跨越**之前**的位置却被打上**之后**的时间戳；客户端只能读成"条退回去了"。改为 `state.positionMs` 访问器 + 写入代数，轮询读回来若代数已变则丢弃（D-33；**宿主侧改动，需重启 DSH**）

**Docs**
- 「上一首」3 秒规则升为 `docs/DESIGN.md` **R15**（Approved：播放与暂停同一套规则；取证 `docs/research/2026-11-14-prev-button-convention.md`）；`AGENTS.md` §15 移出为 `docs/agents/skills.md`（AGENTS 333 → 281 行）
- 文档治理与验证记录（`16bcd45`、`94ece94`、`59a1e9b`、`2473b79` 等）
- `AGENTS.md` **352 → 303 行**：§16 / §16.1 正文移入 `docs/agents/design-process.md`（含 HIG `…/<page>.md` 的固定取用写法与"引用必带平台章节"），AGENTS 只留 4 行指针；§14 由 13 条复述压成"一句话 + 章节指针"，只保留没有上文归属的一条
- 播放头架构调研笔记 `docs/research/2026-11-13-playhead-architecture.md`（五个媒体 UI 库 + 四套内核 + 服务端观察端的取证），以及据此立的 D-24（抽纯函数模块）/ D-25（抄架构不抄代码）/ D-26（依赖引入按"谁拥有这块逻辑"判，不按行数判）

---
## [1.7.0] — 2026-10-30 · `b8dc624`

音量回归、按压反馈、悬停对齐、队列容器调整。

**Added**
- 播放面板新增音量行：扬声器图标（可切静音，图标随状态切换）+ 4px 滑杆（滑块常显），
  对接 `player.volume` / `player.mute`。

- `scripts/syntax-check.mjs`（全树 46 个文件）与 `scripts/test-repeat.mjs`（量红率）；`npm run check` 现在是"全量语法检查 + L1"

**Changed**
- 按压反馈改为"按下即缩、松开即回"：图标键 `scale(.94)`（90ms 进 / 130ms 出 + 12% tint）、
  大播放键 `scale(.96)`、文字按钮 `scale(.97)`；`prefers-reduced-motion` 下取消缩放。
- 迷你行去掉 `margin: 0 -12px` 的出血做法，回到与「插件」「自动化任务」「账号行」
  一致的几何：同样内缩、7px 圆角、7% 中性 tint、**无 box-shadow**。

**Attempted fix（未经复验，不代表已修复）**
- 音乐库「播放队列」空白：容器由 `overflow:auto` 的 `.dshm-sheet-body` 换成与歌曲表格
  同一个 `.dshm-list`，并给 `.dshm-main` 补 `min-height: 0`；新增"正在载入队列…"中间态。

**Known issues**
- 队列是否真的渲染出来**未在屏幕上验证**；音量行与按压反馈的观感未复验。
- 验证状态见 `docs/TESTING.md` §8。

---

## [1.6.0] — 2026-10-30 · `0c9a626`

把队列从播放面板移出，并去掉面板的第二个"屏"。

- `scripts/syntax-check.mjs`（全树 46 个文件）与 `scripts/test-repeat.mjs`（量红率）；`npm run check` 现在是"全量语法检查 + L1"

**Changed**
- 音乐库新增「播放队列」一栏（`lib.queue`），数据来自一次 `queue.list`；
  支持列表、清空待播放、拖动排序、逐条移除。
- 播放面板右上角队列按钮改为打开音乐库的播放队列（`openLibraryPanel('queue')`）。
- 删除面板的关闭动画状态机（`closing` / `wasOpen` / 计时器）：`open` 为真即渲染，为假即 `null`。
- 面板缓冲用的 ErrorBoundary 加 `key={open}`，每次打开重新武装；兜底改为行内小字。
- 队列区单独套一层 ErrorBoundary，崩了只影响那一栏。

**Fixed**
- 迷你行改为 `flex: 1 1 auto; min-width: 0; align-self: stretch`，footer 单元真正撑满侧栏宽度
  （此前按内容宽度收缩，右侧短约 70px）。
- 迷你封面 32 → 40，进度条起点移到 `left: 61px`。

---

## [1.5.0] — 2026-10-24 · `60b67e9`

- `scripts/syntax-check.mjs`（全树 46 个文件）与 `scripts/test-repeat.mjs`（量红率）；`npm run check` 现在是"全量语法检查 + L1"

**Changed**
- 队列改为面板内的独立一屏（`screen: 'now' | 'queue'`），点右上队列按钮整块切换。
- 顺序播放图标改为自绘「三行 + 向下箭头」，与「播放队列」的列表音符图标区分。

**Notes**
- 为排查点击链路，`open` 为真时在迷你行画 8px 红点（后被移除）。

**Regression**
- 该版本出现"点队列后面板消失、之后打不开"；v1.6 回退了这一形态（见 `docs/DECISIONS.md` D-04）。

---

## [1.4.0] — 2026-10-23 · `f400af8`

- `scripts/syntax-check.mjs`（全树 46 个文件）与 `scripts/test-repeat.mjs`（量红率）；`npm run check` 现在是"全量语法检查 + L1"

**Changed**
- 迷你行改 full-bleed（`margin: 0 -12px`、圆角 0）——后被 v1.7 撤销。
- 文字与封面禁止选中、禁止拖拽（`user-select: none`、`-webkit-user-drag: none`）。
- 顺序播放图标改为箭头；移除歌名/艺术家/封面上的 `title`，提示只留在图标按钮。
- 面板右上「更多」菜单删除，改为直接在 head 放队列按钮；「文件与规格」移入音乐库行右键菜单。

**Added**
- Host 新增 `queue.list`：一次返回整队（id / 标题 / 艺术家 / 时长 / 格式 / 封面标记）。
- 进度条"乐观定位"：点击后 1.6s 内不让宿主每秒的旧值回弹。

---

## [1.3.0] — 2026-10-22 · `c0c3663`

播放面板从 slot 里搬出来，并修复两次"点不开"。

**Fixed**
- 面板不再占用 `shell.overlay`：list 型 slot 会把"渲染空/抛错"的条目判 `active:false`
  且不再挂载，导致"点不开"。改为迷你行内部的 `position: fixed` 子组件。
- 播放器 / 音乐库 / 设置三个 slot cell 各加一层 ErrorBoundary。
- 打开面板时的抖动：位置从 `useEffect` 里测量改到 render 期间测量，首帧即到位。

- `scripts/syntax-check.mjs`（全树 46 个文件）与 `scripts/test-repeat.mjs`（量红率）；`npm run check` 现在是"全量语法检查 + L1"

**Changed**
- 面板按 Apple Music 重排：`[⌄] 正在播放 [⋯]` + 满宽封面 + 标题/艺术家 + 进度 + 五键传输行；
  面板宽 340 → 300，封面 176 → 满宽；去掉歌词入口、规格 chips、音量条与底部工具行；
  进度滑块常显、右侧显示剩余时间。

---

## [1.2.0] — 2026-10-20 · `87be04d`（版本号提交 `b3aa1f0`）

- `scripts/syntax-check.mjs`（全树 46 个文件）与 `scripts/test-repeat.mjs`（量红率）；`npm run check` 现在是"全量语法检查 + L1"

**Changed**
- 迷你播放器去掉卡片化，改为与侧栏行同参数的一行（无边框、无底色、7px 圆角、7% hover tint）。
- Now Playing 改为**锚定迷你播放器上方**的非模态 popover：宽 340、无遮罩、点外部/Esc 关闭、
  焦点进出、向上 8px + 缩放入场 160ms。
- 播放模式改为单键循环（顺序 → 列表循环 → 单曲循环 → 随机），切换**不重载当前曲**，
  只重排后续队列；新增 `sequence` 模式（播到队尾停止）。
- 迷你进度条从封面右缘起，距封面 8px、贴行底 3px；命中区收到 8px，不再抢走行点击。

**Fixed**
- 关闭时 `return null` 让 slot 条目失效导致"点不开"：改为永不返回 null。
- `baseCursor` 在加载前赋值；忽略加载中的 `playlist-pos` 与 `-1`（修复切歌后游标错位）。
- popover 位置抖动。

**Removed**
- 面板里的收藏按钮（按要求；右键菜单保留）。

---

## [1.1.0] — 2026-10-19 · `8517945`（版本号提交 `ee46ff0`）

**Added**
- 专辑艺术家覆盖（`album_overrides.artist`）：显示优先级 单曲覆盖 → 专辑覆盖 → 内嵌标签；
  设置页可一键为全部专辑写入。
- 淡入淡出（默认开启，可在设置关闭；手动调音量立即打断淡化）。
- 库内设置页（与 `settings.section` 同一组件，五个分区）。
- 统一声级表：Display 21/600、Title 13.5/600、Row 13/500、Sub 12/400、Caption 11/600；
  字体栈 SF → Segoe UI Variable → PingFang SC → 微软雅黑；数字 `tabular-nums`。

- `scripts/syntax-check.mjs`（全树 46 个文件）与 `scripts/test-repeat.mjs`（量红率）；`npm run check` 现在是"全量语法检查 + L1"

**Changed**
- 传输控件改为实心几何字形；其余图标整套换成 Lucide（ISC，见 `NOTICE.md`）。
- 副标题只显示艺术家。
- 迷你播放器改为整宽卡片（后被 v1.2 撤销）。
- 切歌改为**确定性重载**（不再依赖 mpv 播放列表下标）；自动切歌仍由 mpv 无缝接管。

**Fixed**
- 单曲循环在 EOF 后从末尾重新加载的死循环；`prefs` 变更不生效。

---

## [1.0.0] — 2026-10-18 · `29b495d`

首个可用版本：独立 mpv 进程 + 命名管道 JSON IPC、SQLite 音乐库（扫描/派生视图/搜索）、
迷你播放器、Now Playing 浮层、库内设置、封面优先级、规格三层显示。