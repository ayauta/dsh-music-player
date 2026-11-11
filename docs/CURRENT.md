# CURRENT.md — 当前状态

> 只回答"此刻在哪"：基线、能用的、阻塞、未验证、下一步。
> 证据看 `docs/TESTING.md` §8；缺陷看 `LIMITATIONS.md`；历史看 `CHANGELOG.md` 与 git。

最后更新：2026-11-12（动效审查与规范落地；未改代码）

---

## 1. 基线

| 项 | 值 |
|---|---|
| 分支 | `master`，无其它分支 |
| HEAD | 以 `git log -1` 为准。本轮提交链：`28d57c4` chore → `c67ba6c` 文档合并 → `d936ead` 设计规范 → `3a2ed7a` 客户端 → 之后的都是文档提交 |
| 版本 | `1.7.0`。`b8dc624` 之后的全部工作未发版，见 `CHANGELOG.md` → `[Unreleased]` |
| 最近验证基线 | **`dshm-c517ae41e53e`（Manual L3，2026-11-12）**：用户重启后确认播放面板"功能符合预期"（模式四态、滑块常显、三键同尺寸、音量滑块）；同版本 L1 106/106。上一条 `2473b79` 见 TESTING §8.2 |
| 更早的真实宿主基线 | `59a1e9b`：真实库 v2、85 首 / 4 来源、WASAPI 试听通过 |
| 标签 | 无 |
| 数据库 | `user_version = 2`；真实库 85 首 / 0 missing / 4 来源（2026-11-11 只读核对） |
| 宿主 | `0.2.2-rc.1 / c59d10a`；只对齐最新版（D-21） |

## 2. 现在能用的

- mpv 独立进程播放、淡入淡出、四态模式（sequence / all / one / shuffle）
- 迷你播放器、播放面板、音乐库七类视图、设置双挂载（库内嵌 + `settings.section`）
- 队列：一条可见顺序、镜像由 Engine 确认、点击行按 trackId 播放
- 曲库身份：同一路径沿用原 id；改名＝新曲目 + 旧行 `missing`；移除来源保留行与引用，重加恢复原 id
- 扫描台账：每根 `done/partial/error` + `failed` 计数，异常不留 `running`
- Host API：`queue.*` / `player.*` / `library.*` / `prefs.*`
- 验证网：L1 95、L2 51、Smoke 21、bundle-id 三方比对（方法见 TESTING §2）
- **未实现**：`track.relocate`、`roots.relocate`、缺失项界面、解码失败上限

## 3. 当前阻塞 / 待裁定

- **B11** 单曲循环不裁镜像尾：未验证的技术风险，缺真实 mpv 队尾证据（LIMITATIONS B11）
- **R06 / R11**：面板内队列、Windows 媒体键仍是实现缺口（DESIGN §2）
- 扫描与来源生命周期的**破坏性分支**（改名 / 移除来源 / 重新添加）只有隔离 L2 覆盖，真实库未执行
- **动效 7 项缺陷未修**：B22–B28（无退出动画、曲线单一、按压时长、两处布局/绘制属性、死代码、不可中断）

## 4. 未验证清单

| 项 | 已有证据 | 缺什么 |
|---|---|---|
| B15 / B17 / B19 / B20 的界面表现 | L1 + L2（含真实 mpv） | 真实宿主上的逐项人工核对 |
| B3 / R08 四态按钮 | 代码 + L1 守卫 | 重启后的 L3 验收 |
| 空队列状态（B1 修复后） | 无 | 清空真实队列会丢待播列表，未做 |
| 面板在自适应窗口尺寸下的钳制 | 无 | 只做过一次失败尝试（最大化时 `SetWindowPos` 无效） |
| Windows 媒体键 / SMTC | 无 | 会话可见性未确认 |
| 客户端运行时 DOM Bundle ID | served 字节一致 | 本轮没有 F12 通道，未读 DOM |
| 扫描/来源的破坏性分支 | 隔离 L2 | 真实库上执行一次（需授权） |
| 动效二轮 B22–B29（bundle `dshm-cb0ea9ec60e8`） | L1 104/104；用户 HMR 预览满意 | 重启 DSH 后复验（HMR 不算 L3） |
| ~~播放面板版式~~ | L1 106/106 + 版式守卫 + **Manual L3（2026-11-12）** | 已验收：用户确认功能符合预期 |

## 5. 下一步

1. **文档重构**（进行中）：TESTING / AGENTS / DESIGN 已收口，`GLOSSARY.md` 与 UI 审计已就位；剩 R01–R14 状态复核与提交
2. **动效修复**（B22–B28）：M01+M07（可逆的进出）→ M02+M03（曲线与时长令牌）→ M04/M05（换属性）→ M06（删死代码）；修完补 TESTING §2.4 的静态守卫
3. Phase 2a `track.relocate`：`{op:'track.relocate', id, path}`，事务内可整合已入库目标，冲突整体回退
4. Phase 2b `roots.relocate`：`{op:'roots.relocate', rootId, path}`，按原相对路径批量恢复
5. Phase 3 缺失项的 UI：低调呈现、`定位文件` 入口、冲突提示
6. Player 解码失败上限：`mode=all` 队尾回绕时避免无限重试
7. UI 审计四步：交互可靠性（CUI-01/02）→ 可观察缺陷 → 响应式列宽 → R06

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