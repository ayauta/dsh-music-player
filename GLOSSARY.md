# GLOSSARY.md — 领域术语

本文件定义本项目的**领域语言**：一个词只有一个意思。写代码、写 issue、写测试名、写文档时用这里的词。
需要新词时走 `/domain-modeling`，不要临时发明同义词。

格式：**术语** — 定义。「不要用」列出容易混进来的说法。

## 曲库

**曲目（track）** — 库里的一条记录，身份是 `trackId`；不是文件名，也不是数组下标。
　不要用：歌曲、文件（指代记录时）。

**trackId** — 曲目的持久身份，由路径派生：同一路径永远是同一 id。
　见 `docs/DECISIONS.md` D-19。

**曲库（library）** — `tracks` 全集及其派生视图（专辑 / 艺术家 / 文件夹 / 最近添加）。

**来源（root）** — 一个被注册扫描的文件夹，身份 `rootId`。
　不要用：音乐目录、库目录（指代来源时）。

**扫描 run / 台账** — 一次 `scan()` 的生命周期记录：每个来源一条，结局 `done` / `partial` / `error`，
　带 `total` / `scanned` / `skipped` / `failed`。见 D-18。

**missing** — 曲目行仍在库里，但当前磁盘上没有该文件；不等于删除。

**覆盖（override）** — 用户对元数据的显式改写（`track_overrides` / `album_overrides`），优先于解析结果。

**收藏 / 播放列表** — 用户集合，只引用 `trackId`，不复制曲目。

## 队列与播放

**队列（queue）** — 当前活动播放列表，`player.queue`；同一 `trackId` 最多出现一次。

**播放顺序（plays）** — **已退役**。D-14 之前 `queue` 与 `plays` 两套顺序并存，现在只有一条。
　新代码与新文档不要再使用这个词。

**cursor** — 当前曲目在 `queue` 里的下标；唯一写者是 `commit()`。

**baseCursor** — 镜像锚点：mpv 的 `playlist-pos` 与 `cursor` 之间的偏移。
　不要用：偏移量（单独出现时指代不明）。

**镜像（mirror）** — "mpv 的播放列表等于 `queue.slice(cursor)`" 这件事。
　写入由 Engine 带确认完成（`rewriteTail`），Player 只从返回的事实施导 cursor。见 D-17。

**快照（snapshot）** — Host 对外的一次状态读取结果；写操作返回的快照必须是**已确认**状态。

**传输操作（transport）** — 会启动音频的操作：播放 / 下一首 / 上一首 / 点选。队列编辑不属于。

**模式（mode）** — 四态：`sequence` / `all` / `one` / `shuffle`。

**淡变（fade）** — 音量斜坡式淡入淡出；不是交叉淡化。见 D-06。

**播放头（playhead）** — 时间轴上"此刻在哪"的那个值，由**采样值 + 补间**算出，不等于宿主上报值本身。
　只有一份实现：`lib/shared/playhead.js`（生成进 `client.js` 的标记区）。见 D-24。
　不要用：进度（进度是条状控件）、currentTime（那是 `<audio>` 的字段，我们没有媒体元素）。

**采样时刻（sample time）** — 宿主写位置时打的时间戳（`positionSampledAt`，宿主墙钟）。
　它回答"这张快照是什么时候取的"，因此用来判断宿主**是否已经看见**某次定位（D-27）；
　**不**用来算流逝——那是单调时钟的事（见「补间」）。
　不要用：时间基准、时间戳（单独出现时指代不明）。

**补间（interpolation）** — 两次采样之间按**单调时钟**推进显示值的做法；只在客户端做
　（内核与服务端都只给跳变值）。锚点是快照**到达页面**的那一刻，不是宿主打的时间戳。见 D-24 / D-27。
　不要用：插值算法、平滑（说的是观感，不是机制）。

**定位回弹（snap-back）** — 定位之后界面先跳到目标，随后被一张更旧的一秒快照拉回去的现象。
　抑制它的等待机制见 D-27；不要把它叫成"抖动"（抖动是另一件事：值在原地小幅变化）。

**队列读取状态（queue read state）** — 队列面板对 `queue.list` 的三种结论：`pending`（还没有可显示的行程）、
`ready`（行已到手）、`failed`（读取失败，只给只读重试）。重读期间保持 `ready`，不回落 `pending`。
　不要用：三态（与「三轴状态」等既有说法相撞）、loading / error（它们是控件状态，不是读取结论）。

## 客户端与宿主

**bundle** — 宿主加载的 `client.js` 字节；只在宿主启动时加载。

**bundle ID** — 源码指纹 `dshm-<12hex>`，同时出现在源码、served 字节与运行时 DOM 三处，
　用于证明"跑的是这份代码"。见 TESTING §2.2。

**slot** — 宿主 UI 的挂载点（`sidebar.footer.action` / `sidebar.panellist` / `main` / `settings.section`）。

**面板（panel）/ 浮层（popover）** — 播放面板；展开后的形态叫浮层。不要用"窗口"指代二者。

**行内激活（in-row activation）** — **已退役**（D-28 取代 D-23）：插件不再绑任何键，行内也不再处理 Enter / Space。
　历史定义保留在 `docs/DECISIONS.md` D-23（Superseded）；现在只剩浏览器原生控件行为与 Esc 关闭已打开表面。
　不要用：空格快捷键（会与"全局接管"混为一谈）。

## 验证与状态

**L1–L4** — 四层测试：L1 进程内单元（假 engine）、L2 隔离 Host（真实 mpv、`ao=null`）、
　L3 真实宿主、L4 人工验收。

**Manual / Automated** — 验证记录的类型，不得混用；人工结论必须带执行者、环境与步骤。

**三轴状态** — `Design`（是否批准）/ `Implementation`（做到什么程度）/ `Verification`（是否在真实环境验证过）。
　`Partial` 只属于 Implementation 轴。见 DESIGN 规则 1。

**Implementation Gap** — 已批准、代码还没做。登记在 `docs/DESIGN.md` §2。

**Regression / Defect** — 曾经可用、现在坏了。登记在 `LIMITATIONS.md` §一。

**Spec Drift** — 代码做了，但规范里没有或相反。先报告，再决定改代码还是改规范。

**Superseded** — 被后续条目替代；保留原文并注明继任者，ID 不复用。

**证据（evidence）** — 可复现的命令、退出码、截图路径、日志。观点不是证据。

**最近验证基线** — 最后一次真实验证对应的版本或 commit；**不要求等于 HEAD**。
