# CURRENT.md — 当前状态

> 只回答"此刻在哪"：基线、能用的、阻塞、未验证、下一步。
> 证据看 `docs/TESTING.md` §8；缺陷看 `LIMITATIONS.md`；历史看 `CHANGELOG.md` 与 git。

最后更新：2026-11-15（D-36 落地；修掉"整个插件不加载"的 CSS 注释反引号，并加加载守卫；**待 L3**）

---

## 1. 基线

| 项 | 值 |
|---|---|
| 分支 | `master`，无其它分支 |
| HEAD | 以 `git log -1` 为准。本轮提交链：`28d57c4` chore → `c67ba6c` 文档合并 → `d936ead` 设计规范 → `3a2ed7a` 客户端 → 之后的都是文档提交 |
| 版本 | `1.7.0`。`b8dc624` 之后的全部工作未发版，见 `CHANGELOG.md` → `[Unreleased]` |
| 最近验证基线 | **`dshm-847e9b43df0b`（Manual L3，2026-11-15，用户："验证完成了，正常"）**：R15 / D-35、D-32、D-33、B35 一并验收；上一基线为 `dshm-c517ae41e53e`（2026-11-12） |
| 已证加载的 bundle | `dshm-847e9b43df0b`：2026-11-15 用户重启后 L3 通过（Manual）；宿主 artifact rev 与 served 一致见 TESTING §8 |
| 当前源码 bundle（**未验证**） | `dshm-b250ad1e8c34`：修掉"CSS 注释反引号"后的指纹；需重启 DSH 并在 served 字节上核对 |
| 更早的真实宿主基线 | `59a1e9b`：真实库 v2、85 首 / 4 来源、WASAPI 试听通过 |
| 标签 | 无 |
| 数据库 | `user_version = 2`；真实库 85 首 / 0 missing / 4 来源（2026-11-11 只读核对） |
| 宿主 | `0.2.2-rc.3 / 6b729fe`（2026-11-14 重启后实测）；只对齐最新版（D-21） |

## 2. 现在能用的

- mpv 独立进程播放、淡入淡出、四态模式（sequence / all / one / shuffle）
- 迷你播放器、播放面板、音乐库七类视图、设置双挂载（库内嵌 + `settings.section`）
- 队列：一条可见顺序、镜像由 Engine 确认、点击行按 trackId 播放
- 曲库身份：同一路径沿用原 id；改名＝新曲目 + 旧行 `missing`；移除来源保留行与引用，重加恢复原 id
- 扫描台账：每根 `done/partial/error` + `failed` 计数，异常不留 `running`
- Host API：`queue.*` / `player.*` / `library.*` / `prefs.*`
- 验证网：L1 160（`npm run check` = 全量语法检查 + L1）、L2 51、Smoke 21、bundle-id 三方比对（方法见 TESTING §2）
- 播放头算术单一份实现：`lib/shared/playhead.js` → 生成进 `client.js` 标记区，守卫逐字符比对（D-24）；
  补间锚在单调时钟上、按采样身份复用锚点、定位等待按采样时刻判新旧（D-27）
- 键盘：插件**不绑任何键**（D-28）——全局接管、进度/音量方向键、行内 Enter/Space 全部移除；
  两条滑条是原生 range 且**不在 Tab 序列**（`tabIndex={-1}`，D-36）：点过之后方向键仍有效，那是平台行为
- **未实现**：`track.relocate`、`roots.relocate`、缺失项界面、解码失败上限

## 3. 当前阻塞 / 待裁定

- **B11** 单曲循环不裁镜像尾：未验证的技术风险，缺真实 mpv 队尾证据（LIMITATIONS B11）
- **R06 / R11**：面板内队列、Windows 媒体键仍是实现缺口（DESIGN §2）
- 扫描与来源生命周期的**破坏性分支**（改名 / 移除来源 / 重新添加）只有隔离 L2 覆盖，真实库未执行

## 4. 未验证清单

| 项 | 已有证据 | 缺什么 |
|---|---|---|
| B15 / B17 / B19 / B20 的界面表现 | L1 + L2（含真实 mpv） | 真实宿主上的逐项人工核对 |
| **D-36 原生 range 的 L3 四条**（Tab 不进 / 点过之后能改 / 拖动 / 视觉同族） | L1 **165/165**；`test:repeat` 0/5 red；真实 CSS 用 headless Edge 单独渲染核对（亮/暗 × 五处 surface） | 真宿主重启后的人工四条；served 字节一致性 |
| B3 / R08 四态按钮 | 代码 + L1 守卫 | 重启后的 L3 验收 |
| 空队列状态（B1 修复后） | 无 | 清空真实队列会丢待播列表，未做 |
| 面板在自适应窗口尺寸下的钳制 | 无 | 只做过一次失败尝试（最大化时 `SetWindowPos` 无效） |
| Windows 媒体键 / SMTC | 无 | 会话可见性未确认 |
| 客户端运行时 DOM Bundle ID | served 字节一致 | 本轮没有 F12 通道，未读 DOM |
| 扫描/来源的破坏性分支 | 隔离 L2 | 真实库上执行一次（需授权） |
| 动效二轮 B22–B29（bundle `dshm-cb0ea9ec60e8`） | L1 104/104；用户 HMR 预览满意 | ~~重启复验~~ 已被 `dshm-c517ae41e53e` 的 Manual L3 覆盖（见下） |
| **CUI-02**（CUI-01 已被 D-28 取代：插件不再绑任何键，见 LIMITATIONS） | L1 158/158 + 守卫（队列读取状态与重读规则） | 重启后 L3：① 断连时队列显示"读取失败 + 重试"；② 移除/拖动后列表不闪"正在载入" |
| ~~B30–B35 / D-28 / D-32 / D-33 / R15~~ | **Manual L3（2026-11-15，用户）：Passed**——"验证完成了，正常" | 已验收；**后续任何触及播放头或状态门控的改动都要重新验** |
| ~~`prev` 3 秒规则~~ | 已裁定（2026-11-14）：**维持现状**，并升为规范 `docs/DESIGN.md` **R15**（"播放与暂停同一套规则"） | 取证见 `docs/research/2026-11-14-prev-button-convention.md`；暂停时的行为无一手来源，已在 R15 备注中标明 |
| ~~播放面板版式~~ | L1 106/106 + 版式守卫 + **Manual L3（2026-11-12）** | 已验收：用户确认功能符合预期 |

## 5. 下一步

1. **D-36 的 L3 验收**（真宿主，四条见 `docs/handoffs/2026-11-15.md` §5）：Tab 不进 / 点过之后能改 /
   拖动仍可用 / 视觉同族（亮暗各一次）。**落地已完，未验**：`npm run check` 165/165、
   `test:repeat -- test/player-transport.test.mjs 5` 0/5 red
2. **键盘 seek 的等待**：随 D-36 一并接上——`planSeek`/`settleSeek` 让一次只有一个 seek 在途，
   `resolveSeek` 的闩锁在键盘路径上同样生效（连按不再被前一次的盖章提前放行）
3. UI 审计 P1 批：CUI-11 静音标签 → CUI-04 零首空态 → CUI-07 文件与规格 → CUI-03 窄宽列隐藏
4. R06 面板内 封面 ⇄ 队列：先出 2–3 个方案（新视图，不是排版）
5. Phase 2a `track.relocate`：`{op:'track.relocate', id, path}`，事务内可整合已入库目标，冲突整体回退
6. Phase 2b `roots.relocate`：`{op:'roots.relocate', rootId, path}`，按原相对路径批量恢复
7. Phase 3 缺失项的 UI：低调呈现、`定位文件` 入口、冲突提示
9. Player 解码失败上限：`mode=all` 队尾回绕时避免无限重试
10. R11 媒体键 / B11 真实 mpv 队尾证据：都是"先取证再动手"的类型

**待办（审查提出、本轮按 §3 不改）**：队列面板三段 `dshm-empty` 空态壳抽成一个组件；`KEY_OWNERS` 与 `ownsKey` 的命名再做一轮（现为 `controlOwnsKey`）。

## 6. 本轮做了什么

- 安装 mattpocock/skills（27 个包，项目级 `.dsh/skills`）并初始化 `docs/agents/*`、`AGENTS.md` §15
- 文档重构第一轮：CURRENT 从 639 行压到本文件；缺陷全部归并到 `LIMITATIONS.md`；新增 `CHANGELOG.md` → `[Unreleased]`；新增 D-21（单人自用、只兼容最新版）
- 第二轮：TESTING §10 并入 §8.2（验证记录只有一处）；UI 审计移入 `docs/audits/2026-11-07-ui.md` 并在 `LIMITATIONS.md` §四 登记 CUI-01–12；新建 `GLOSSARY.md`；AGENTS 阅读顺序加入术语表
- 第三轮：本地安装 emilkowalski/skills（17 个，`prototype` 冲突跳过）；动效审查 `docs/audits/2026-11-12-motion.md`；规范落到 DESIGN §6 与 TESTING §2.4；D-22；7 项缺陷 B22–B28
- 第四轮（代码）：按 §6 修复 B22–B28；新增 `test/motion-source.test.mjs`（7 条静态守卫）；`npm test` 102/102；bundle `dshm-3c68b1072173` → `dshm-cfd78a28fa9c`
- 第四轮修正：实机报 **React #310**（hooks 放到了空态 early return 之后）→ hooks 上移，并加静态守卫；`npm test` **103/103**；bundle → **`dshm-7031e31a7568`**；**仍待重启 L3**
- 第五轮：面板版式按 DESIGN §7 落地（去标题、三键传输、模式进 header、16px 边距、封面圆角 10、音量按 HIG 还原为标准滑块）；新增传输行静态守卫；`npm test` **105/105**；bundle → **`dshm-c517ae41e53e`**
- 第六轮：模式键去掉状态背景（HIG Buttons 的 prominent 样式不该给工具键）、进度滑块改常显（HIG Sliders）；`npm test` **106/106**；bundle → **`dshm-c517ae41e53e`**
- 交接：`docs/handoffs/2026-11-12.md`（状态快照、未验证项、下一步排序、可直接粘贴的开场）
- 第七轮：用户重启后 L3 通过，served artifact rev `07613eca9631` 与源码一致
- 第八轮：按四类改动提交（chore / 文档合并 / 设计规范 / 客户端实现），工作区 clean
- 第九轮（文档）：AGENTS **352 → 303 行**；§16 / §16.1 正文移到 `docs/agents/design-process.md`（AGENTS 只留 4 行指针，HIG 的 `…/<page>.md` 固定写法与"引用必带平台章节"一起移过去）；§14 由 13 条复述压成"一句话 + 章节指针"，只保留没有上文归属的一条（不提交调试探针）
- 第十轮（代码）：CUI-01 键盘边界（先尊重 `defaultPrevented`，再让获得焦点的控件拥有空格）；CUI-02 队列读取状态 + 只读重试；`test/client-source.test.mjs` 新增 2 条静态守卫；`npm run check` **108/108**；bundle → **`dshm-9810809acb98`**（**待重启 L3**）
- 第十一轮（`/code-review` 两轴审查后修正）：CUI-01 补上"限定音乐上下文"——音乐表面外只在没有焦点时接管；CUI-02 修掉"写操作后列表闪正在载入"的回归（重读保留旧行）；`ownsKey` → `controlOwnsKey`、`load` → `readState`；守卫补先后顺序断言；AGENTS 再收一次（HIG 细节只剩一处、§14 指针精确到 §2.1/§2.2/§11）；bundle → **`dshm-2a24b8d96206`**（**待重启 L3**）
- 第十二轮（决策 + 代码）：按 Q1–Q4 立 **D-24**（播放头抽纯函数模块 + 生成区 + 守卫）、**D-25**（抄架构不抄代码）、**D-26**（依赖引入按"谁拥有这块逻辑"判，**不设行数阈值**——用户否掉了 150 行代理指标）；D-26 同时定下"平台优先"为默认策略
- 第十二轮（代码，`/tdd` 一条竖切）：`test/playhead.test.mjs` 先红（`ERR_MODULE_NOT_FOUND`）→ `lib/shared/playhead.js` 转绿 10/10；`scripts/inline-playhead.mjs`（`--write` / 默认 verify）+ `test/inline-playhead.test.mjs` 两例守卫（生成区逐字符一致、`positionSampledAt` 只出现在生成区）；`client.js` 只剩 `estimateMs` 一行包装持有 `Date.now()`，`RemainingText` 与进度分数改用同一实现；**修掉时钟回拨产生负位置**的缺陷；两次临时变异各自 Red 后还原；`npm run check` **120/120**；bundle → **`dshm-df11aeedaff9`**（**待重启 L3**）
- 第十三轮（重启后取证 + 竖切 2）：宿主已从 `rc.1 / c59d10a` 升到 **`rc.3 / 6b729fe`**，`bundle-id --served` 确认 served 字节 = 工作区源码（`dshm-df11aeedaff9`）；据此把"最近验证基线"标注为**不能平移**，L3 判据整批重列
- 第十三轮（`/tdd` 竖切 2，`lib/shared/playhead.js` 第二次演进）：拆成**两种时钟、两个问题**——补间锚在 `performance.now()`（`anchorOf`，按快照对象身份缓存，一帧一次读到一次缓存），等待（seek latch）用墙钟判"宿主是否已看见这次 seek"；`resolveSeek` 替掉 `1600ms / 900ms`；`isAdvancing` 收紧为 `paused === false`；`test/playhead.test.mjs` 19 例、`client-source` 新增等待规则守卫；三次临时变异（`>=` 改 `>`、删时钟回退出口、组件里复现旧阈值）各自 Red 后还原；`npm run check` **130/130**；bundle → **`dshm-e03542edadba`**（**待重启 L3**）
- 第十四轮（用户报告的三个问题）：**B30** 首按不播——根因是 `toggle()` 只读 mpv 的 `pause`（新进程默认 `no` 且无文件），紧闭环 L1 复现后修掉（D-29）；**B31** 进度条一卡一卡——根因是补间锚点按对象身份缓存、重复读取把锚点重置导致回退，改为 `nextAnchor` 按采样身份复用（D-27 补记）；**D-28** 撤掉全部键绑定（全局接管残留 + 进度/音量方向键 + 行内 Enter/Space + 搜索框 Esc），守卫改为"客户端不得绑键"；五次临时变异各自 Red 后还原；`npm run check` **137/137**；bundle → **`dshm-fe6cba61dd8e`**（**待重启 L3**）
- 第十五轮（`/diagnosing-bugs`，B32）：先做只读取证——宿主在暂停状态下 10 Hz 采样 6 秒，`positionMs` **spread 0ms**、`playing:false / paused:true`，`status.player` 与 `player.state` 逐字段一致；CSS 对 fill 无 transition、无 keyframes。**排除了宿主与 CSS**，锁定"帧上写"：`paint()` 每帧无条件写 `--p` + 气泡文本（120 次/秒），而两个时间读数早就有 `value !== last` 守卫。修法：`nextPaint` 纯函数（1e-5 量化）+ 组件里 `write:false` 直接返回 + 删掉 hover 时对气泡的第二次写入；L1 32 例（新增 8）/ 全量 **146/146**；两次变异各自 Red 后还原；bundle → **`dshm-cc5effbf6882`**（**待重启 L3**）
- 第十六轮（`/diagnosing-bugs`，B33）：用户 L3 复验上一轮，只剩"暂停后还会动一下"。定位到**宿主**：`pause()` 在 `engine.pause(true)` 之后没有重新盖章，`positionMs` 还是上一次 1 Hz 轮询的值（最多落后 1 秒），客户端已插值画到真值却被旧快照按下，下一次轮询再前跳——一次回缩 + 一次前跳。修法：确认后读一次 `time-pos` 写回 `positionMs` / `positionSampledAt`（D-31）；顺带把夹具引擎改成跟随 `seek`/`load` 更新 `time-pos`（原来恒为 0，改完立刻让「resuming a paused track continues where it stopped」变红——这条旧例正好证明了盖章是承重的）；`npm run check` **147/147**；客户端 bundle **未变**（`dshm-cc5effbf6882`），**需重启 DSH** 才生效
- 第十七轮（`/diagnosing-bugs`，B34）：用户报告暂停后**有概率**回缩——按"概率"追到竞态：客户端两条 `status` 请求源（1 Hz 轮询 + 命令后补读）没有定序，命令在宿主侧 await 淡出约 200ms，点击前发出的轮询可以后到，把"还在播 + 旧位置"盖上去。修法：请求**发出时编号**，`acceptResponse` 丢弃更旧的答案（与任何时钟无关，宿主重启/NTP 跳变都不会反序，D-32）；L1 36 例（新增 4）/ 全量 **152/152**；两处变异各自 Red 后还原；bundle → **`dshm-016c9bffbb5c`**（**待重启 L3**）
- 第十八轮（`/diagnosing-bugs`，B35——**前三次修错了层**）：用 `/ask-matt` 复盘后先问"为什么闭环看不见它"，答案是夹具引擎的 `getProperty` 同步返回，"读在途"在测试里根本不存在。给夹具加上「挂起下一次读取、释放时返回读取开始那一刻的值」后，3 秒内复现：暂停盖章 42.5s，在途轮询读回来 41.6s 并盖上**更新**的时间戳 → 客户端读成回退。修法：`state.positionMs` 变访问器、**每次写入递增代数**，轮询读回来发现代数变了就丢弃（D-33）；先用时间戳比较，日志暴露 `issuedAt === stamp` 同毫秒并列仍会漏。变异 5/5 红、修复连跑 10 次绿；`npm run check` **153/153**；客户端 bundle **未变**，**需重启 DSH**
- 第十九轮（`/retro` 收尾 + 裁定）：把「上一首」3 秒规则升为 `DESIGN.md` **R15**（Approved，播放与暂停同一套规则，取证来源与"暂停行为无一手来源"一并写明，消除 Spec Drift）；`AGENTS.md` §15 技能表移到 [docs/agents/skills.md](docs/agents/skills.md)（AGENTS **333 → 281 行**，只留指针）；本轮起把 18 轮积压按 `shared / host / client / chore / docs` 五类落提交
- 第二十轮（`/code-review` 两轴之后的修正，第一批）：清掉 CHANGELOG 里被 PowerShell 全局替换写进 7 个历史版本的工具条目；修掉 TESTING / LIMITATIONS / CURRENT 三处「描述已删实现」的 CUI-01 文本；D-23 补标 Superseded（被 D-28 取代）、GLOSSARY 的「行内激活」同步退役；修掉 B33 用例里恒真的断言（`anchorOf(before, 0)` 让 `positionOf` 永不推进，且默认夹具 8 秒曲目使 `seek(41 600)` 被夹到 8 000——这条用例此前什么都没测到）；新增 `test/changelog.test.mjs` 两条守卫（跨版本不得重复 bullet、工具条目只能出现在 [Unreleased]）。npm run check 158/158
- 第二十一轮（复核后的第二批）：刷新状态的重复门控收进 `commitAnswer(requestId, apply)`——成功与失败两条路都只能从这一扇门进；守卫改为「两条都走 commitAnswer + session 写入只能是回调」，变异（失败路径绕过门）→ 红。`LIMITATIONS.md` 与 `TESTING.md` §2.4 的两套豁免话术合并为**一个登记处**（`LIMITATIONS` §一，状态列写到期条件），TESTING 只留指针。bundle 现为 `dshm-847e9b43df0b`（本轮宿主未改）
- 第二十二轮（R15 落地，D-35）：`prev()` 的 3 秒判据改用 `currentPositionMs()`——宿主内插值，复用客户端的 `positionOf()`；`isPlayingNow()` 成为快照与规则共用的唯一定义。L1 两例先红后绿、变异（换回采样值）红、连跑 `0/3 red`；全量 **160/160**。客户端未改，bundle 仍 `dshm-847e9b43df0b`
- 第二十三轮（L3 验收记录）：用户重启后确认「验证完成了，正常」，覆盖 R15 / D-35、D-32、D-33、B35；TESTING §8 加一条 Manual 记录，基线更新为 `dshm-847e9b43df0b`；§4 里七行待验合并为一行「已验收（后续改动需重验）」；§5 第一项（重启 L3）删除并重排：`prev()` 的 3 秒判据改用 `currentPositionMs()`——宿主内插值，复用客户端的 `positionOf()`；`isPlayingNow()` 成为快照与规则共用的唯一定义。L1 两例先红后绿、变异（换回采样值）红、连跑 `0/3 red`；全量 **160/160**。客户端未改，bundle 仍 `dshm-847e9b43df0b`；**需重启 DSH**
- 第二十四轮（D-36，原生 range 落地；`/grill-with-docs` 两轮裁定 + `/prototype` 先出方案）：用户否掉 D-34 里"键盘由 UA 提供"这半句，要求**插件没有任何键盘操作**。取证与原型把这句话拆成三件事（键位绑定 / Tab 停靠点 / 键盘路径），实测「不响应方向键」在表单控件上做不到，因此定为：换原生 range（`appearance:none` + `::-webkit-slider-*`，视觉参数不变）+ **`tabIndex={-1}` 摘掉 Tab 停靠点** + 仍不写任何键位判定。原型在 `prototype/2026-11-15-native-range/`（0 现状 / A 纯伪元素 / B accent-color / C 双层，实测写入 120→61/s、`step` 同时决定键盘步进与滑块量化）。顺带修掉两个原型撞出来的坑：一次只允许一个 seek 在途（`planSeek`/`settleSeek`，否则连按被前一次的盖章提前放行）、静止时不写气泡文本与拖动中不回写 `value`。守卫：`type: 'range'` 与 `tabIndex: -1` 成对且各两处、`role: 'progressbar'/'meter'` 禁止复现、无键 props（变异两处各自红）。`npm run check` **165/165**、`test:repeat -- test/player-transport.test.mjs 5` **0/5 red**；bundle → `dshm-d10c2f0d6f40`，**需重启 DSH**；L3 四条见 handoff §5（Tab 不进 / 点过之后能改 / 拖动 / 视觉同族）
- 第二十五轮（`/improve-codebase-architecture` + `/retro`，架构评审报告见 `%TEMP%/architecture-review-2026-11-15.html`）：子代理带新上下文走了一遍最近改动面，报 3 个候选 + 2 个被 deletion test 否掉的。**真缺陷一个**：`.dshm-vol` 的三条规则匹配不到任何元素（设置行用的是裸 `<div>`），于是"设置里没有滑块"这句意图只存在于 CSS 注释里，控件实际穿着面板音量的常显滑块 —— 给设置行补上 class 修正，并顺手删掉 4 段死规则（`dshm-disclose` / `dshm-pop-more` / `dshm-sheet-body` / `dshm-chips`）。**守卫两处**：新增 `test/docs.test.mjs`（表格必须有表头、列数与表头一致、`D-nn`/`Bnn` 唯一递增）与 `client-source` 的 CSS locality 用例（样式表里每个 `.dshm-*` 必须在源码别处被渲染）——落地当天抓出 3 张坏表 + 4 段死 CSS；另把两条"断言拼写"的守卫改成断言接缝（`resolveSeek\(` 的实参写法、`type:'range'` 各出现两次）。运行时候选（两条滑条共用管线 / seek 队列的驱动器 / 三处 rAF）**故意不做**：它们压在待验的 L3 基线上，先重启验完 D-36 再按 2→3→4→5 顺序做。`npm run check` **171/171**、`test:repeat` 0/5 red；bundle → `dshm-dbe3cc92a8be`
- 第二十六轮（回归：**整个插件不加载**，已修 + 加守卫）：用户重启后侧栏既无「音乐」也无迷你播放器。定位方式：用假 React + 假 ctx 在 `vm` 里真跑 `client.js`，factory 立刻抛 `ReferenceError: vol is not defined` —— 上午 D-36 那段说明性注释里写了用反引号包起来的 `.dshm-vol`，反引号提前结束了 CSS 模板字符串，余下 CSS 被当成 JS；那段"合法但语义错误"的代码让 `node --check` 照样通过，所以 175 个测试全绿、pre-commit 也过。修法：CSS 区注释不写反引号。**新增 `test/client-load.test.mjs`**（bundle 注册 / `inject` 清单 / `apply(ctx)` 注入四槽 / 四个 cell 浅渲染 / 样式表围栏恰好一对），并把"能跑就别只解析"写进 `docs/TESTING.md` §2.6 规则三。变异（把反引号放回去）→ 2 例红，复现今天的失败。`npm run check` **175/175**；bundle → `dshm-b250ad1e8c34`
- 工作区：三个提交已落 —— `ebbd119`（client）/ `7f9da02`（docs）/ `72b38a5`（chore）；原型在 `prototype/native-range` 分支（master 上不带）。下一步只剩重启后的 L3
