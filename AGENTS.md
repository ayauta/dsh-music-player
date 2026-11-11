# AGENTS.md — dsh-music 协作规则

本文件是任何 AI / 人类接手本仓库时的**第一入口**。规则优先于聊天记录、临时交接文件与历史摘要。
进度与当前状态看 `docs/CURRENT.md`；术语看 `GLOSSARY.md`；产品规范看 `docs/DESIGN.md`；测试方法看 `docs/TESTING.md`；
技术架构看 `ARCHITECTURE.md`；已知限制看 `LIMITATIONS.md`；决策史看 `docs/DECISIONS.md`。


---

## 0. 项目是什么

DeepSeek Harness（DSH）的本地 Hi-Res 音乐播放器插件：

- **Host**：Node 侧，独立 mpv 进程 + 命名管道 JSON IPC + SQLite 音乐库，对外一个 `POST` API 端点；
- **Client**：单文件 `client.js`，零依赖、无构建，通过 slot 挂进宿主 UI（侧栏迷你播放器、音乐库面板、设置分区）；
- **数据**：索引与用户覆盖只写 `$DSH_HOME/plugin-data/dsh-music/`，从不写回音频文件。
- **前提（D-21）**：单人自用，宿主只对齐最新版 DSH；不做向后兼容、不写数据迁移。
- **设计与动效（D-22）**：先在 DSH 里不突兀，再以 emilkowalski/skills 为准绳；规范见 `docs/DESIGN.md` §6。


---

## 1. 每轮开始前必须做的六件事

1. 读 `AGENTS.md`（本文件）。
2. 读 `docs/CURRENT.md`：**最近验证基线**（版本 / commit）、进行中任务、阻塞、未验证项。
3. 术语先看 `GLOSSARY.md`；再读与任务相关的规范：`docs/DESIGN.md`（产品/视觉）、`ARCHITECTURE.md`（技术）、
   `docs/TESTING.md`（怎么验）、`docs/DECISIONS.md`（为什么是现在这样）。
4. 用 Git 命令确认真实 HEAD 与工作区：`git status` + `git log --oneline -5`。
   `CURRENT.md` 里记的是"最近一次验证所对应的版本"，**不要求与当前 HEAD 相同**——
   文档提交本身就会让 HEAD 前进，不必为此反复改文档。
5. 动手前陈述：**目标、影响范围、验证计划、回退方式**。
6. 不得只依赖聊天记录或临时交接文件——它们不是需求来源。

> 已授权的普通任务不需要逐行请求许可；第 4 节的**高风险改动**才必须先做影响分析并等待确认。


---

## 2. 三种"事实"的权威边界

| 来源 | 它是什么 | 冲突时怎么办 |
|---|---|---|
| **代码**（`client.js`、`lib/host/*`） | 当前**实现事实**的证据 | 说明"代码现在是这样" |
| **`docs/DESIGN.md` 中 Design = Approved 的条目** | **目标产品行为**的权威 | 代码与之不符 = 缺陷，记录差异，**不得擅自改规范去迁就代码** |
| **`docs/TESTING.md` 的验证记录** | **验证方法与结果**的证据 | 没有验证记录 = 未验证，不得写成"已修复" |

冲突处理流程：

1. 先判断**差异类型**，不要一律叫"缺陷"：

   | 类型 | 含义 | 处理 |
   |---|---|---|
   | **Implementation Gap** | 已批准，但代码还没做 | 登记为待实现，不改规范 |
   | **Regression / Defect** | 曾经可用，现在坏了 | 登记为 bug，按缺陷流程修 |
   | **Spec Drift** | 代码做了，但规范里没有或相反 | 报告用户，二选一：补规范或改代码 |

2. 按类型登记到职责方：**实现缺口 → `docs/DESIGN.md` §2**；**缺陷 → `LIMITATIONS.md` §一**；
   **当前阻塞 → `docs/CURRENT.md` §3**。登记规范条目 ID、代码现状、差异类型、证据；
3. 报告给用户，给出选项（改代码 / 改规范 / 暂缓）；
4. 用户裁定后，**才**修改 `DESIGN.md` 并标注 `Superseded` 或 `Approved`。

绝不采用"文档与代码冲突一律以代码为准"。

### 2.1 单一事实来源

- 每个事实只在**职责对应**的那份文档里维护，其它文件只做**引用**，不复制内容：

| 事实类型 | 唯一来源 |
|---|---|
| 产品 / 视觉 / 交互规范 | `docs/DESIGN.md` |
| 技术架构、数据流、宿主约束 | `ARCHITECTURE.md` |
| 测试方法、副作用、验证结果 | `docs/TESTING.md` |
| 决策与替代方案 | `docs/DECISIONS.md` |
| 当前进度、未验证项、阻塞 | `docs/CURRENT.md` |
| 版本变化流水 | `CHANGELOG.md` |
| 已知限制与缺陷 | `LIMITATIONS.md` |

- 发现同一事实出现在两处：保留职责方那份，另一处改为链接；不要"两边都改一遍"。
- 引用格式：`见 docs/DESIGN.md R04`，不要抄写条目正文。

### 2.2 稳定需求 ID

- `R01–R12`、`P01–P13`、`S01–S06`、`D-01–D-12` 等已分配的标识**不得复用、不得重新编号**。
- 需求被替代：保留原条目，Design Status 改为 `Superseded`，并注明继任者（"被替代为 …"）。
- 需求被拆分：新增子项 ID（如 `R04.a`），父项保留并注明"见子项"。
- 引用历史决策时用 ID（如 `D-03`），不要用"之前那个方案"这种描述。


---

## 3. 一个任务只做一件事

- 一个任务 = 一个可验证目标。不顺手重构、不顺手改风格、不顺手升版本号。
- 发现相邻问题时，写进 `docs/CURRENT.md` 的"待办"，不在本轮改。
- 提交信息格式：`<范围>: <做了什么>`，一次提交只含一类改动。
- 版本号、纯格式化、纯重命名各自单独提交。
- 文档治理、测试改造、状态机改造、视觉改造**分别提交**。


---

## 4. 高风险改动：先影响分析，再动手

涉及以下**实际技术边界**的改动，必须先给出**影响面 + 回退方案**并得到确认：

- 播放状态机：模式、游标、`plays` / `baseCursor`、淡入淡出（`lib/host/player.js`）
- 持久化：SQLite schema、`app_state` 里的数据形状、迁移
- API 契约：`lib/host/api.js` 的 op 名称、参数、返回结构
- Host ↔ Client 接口：HTTP 路由、op 集合、状态快照字段
- 宿主生命周期：slot 的注册/卸载、面板挂载方式、bundle 重载

**只更新文档不构成高风险**，不需要为此走影响分析流程；文档与代码同批修改时，
风险按其中的代码改动判定（例如"改 API + 同步文档"按 API 变更处理）。

影响分析模板：

```
目标：<一句话>
影响面：<文件/函数/契约/数据形状，逐条列>
回退：<git revert / 备份路径 / 兼容分支>
验证：<可自动化的部分 + 必须人工的部分>
```


---

## 5. 每个任务都要有验收标准

开工前**在回复里**写下（不必入库）：

```
目标：<一句话>
验收：<可观测判定，优先自动化；否则写清人工步骤与判据>
回归：<本次可能影响的既有行为，及如何确认没坏>
回退：<revert / 开关 / 备份>
```

没有验收标准的任务不开工。


---

## 6. 提交 ≠ 已验证

- 提交前跑 `npm run check`（语法 + L1）；`.githooks/pre-commit` 已强制，`core.hooksPath=.githooks`。
- 提交只代表"写完了"。
- 只要没有跑过，就必须登记进 `docs/CURRENT.md` 的"未验证"表。
- 验证记录写进 `docs/TESTING.md` 的"验证记录"：日期、commit、命令、结论、执行者（自动/人工）。


---

## 7. Client 改动必须确认 bundle 已加载

`client.js` 的改动**不会**随页面刷新生效。判定顺序：

1. 重启 DSH 后观察界面变化是否与本次 diff 对应；
2. 或临时加一个**可见标记**（DOM 文本、颜色、元素），确认标记出现后再评价行为；
3. 拿不到证据 → 结论只能写"未验证"，不能写"已修复"。

禁止用"刷新页面"作为 client 改动生效的依据。


---

## 8. 自动化与人工验收分开记录

**人工验收可以判 `Passed`**，但必须标清楚它是人工的，并且带齐元数据：

| 字段 | 要求 |
|---|---|
| 类型 | `Manual`（人工）/ `Automated`（自动）——不得混用 |
| 执行者 | 人（用户 / Agent） |
| 日期 | 具体到天 |
| 版本 | 对应版本或 commit（见 `docs/DESIGN.md` 规则 3） |
| 环境 | 窗口尺寸、主题、操作系统相关项 |
| 步骤 | 复现路径 |
| 结果 | Passed / Failed / Blocked + 观察到的现象 |

| 类型 | 自动化记录内容 |
|---|---|
| `Automated` | 命令、退出码、关键输出摘要、执行时间、对应 commit |

**禁止**：把人工观察直接写成"测试通过"；把 `Manual` 结果混进自动化汇总；用一次人工观察代替回归测试。


---

## 9. 不许作弊

- 不删除测试、不跳过断言、不放宽基准来让结果变绿。
- 测试失败时：修代码，或标注"已知失败 + 原因 + 责任人/下一步"。
- 若断言本身写错，单独提交并说明理由。


---

## 10. 完成后同步状态文档

任务结束时更新 `docs/CURRENT.md`，写清三件事：

1. **最近验证基线**：最后一次真实验证对应的版本 / commit（可以是旧于 HEAD 的提交）；
2. **当前工作状态**：本轮做了什么、进行中/未开始的任务、阻塞；
3. **尚未验证什么**、下一步、遗留风险。

`CURRENT.md` 里的哈希**不要求等于当前 HEAD**——文档提交本身会让 HEAD 前进。
真实 HEAD 以 `git log -1` 为准。文档与代码不一致时记录差异（见第 2 节），不要静默改写。


---

## 11. 用户持久化状态必须可备份（不要求可迁移）

- 改 `app_state` / SQLite 形状前：先备份（设置页「备份数据库」或手工复制数据库文件）
- 按 D-21：**不写迁移**，不为旧形状保留读取路径；旧库可以直接删库重扫
- 备份位置与回退方式（还原备份 / 删库重扫）写进 `docs/CURRENT.md`


---

## 12. 真实音乐库与副作用测试

- 用户的音乐目录**只读**：不写标签、不改名、不移动、不删除。
- **默认只允许安全、隔离的自动化测试**：`node --test`（纯逻辑）与隔离 `DSH_HOME` 的 Host 集成测试。
- **恢复现场不能代替隔离**：事后把队列/设置改回去，不算安全——中途仍可能污染真实库、
  真实播放和用户状态。安全的前提是**从一开始就不碰真实状态**（独立 `DSH_HOME`、独立数据库、夹具音频）。
- `scripts/playback-test.mjs`、`scripts/loadtest.mjs` 在完成隔离改造前**禁止自动运行**。
- 真实宿主上的有副作用测试（会出声、会改队列、会改设置）必须**获得用户明确授权**，
  并在 `docs/TESTING.md` 记录副作用与执行条件。
- 会出声的测试必须提前告知用户。


---

## 13. 阅读顺序（新会话）

```
AGENTS.md
  → docs/CURRENT.md
    → GLOSSARY.md             （术语；写代码或写文档前先对齐）
      → docs/DESIGN.md        （产品/视觉相关）
        → ARCHITECTURE.md     （技术相关）
          → docs/TESTING.md   （要写/要跑测试）
            → docs/DECISIONS.md（要改既有设计）
```


---

## 14. 禁止事项（快速清单）

- ❌ 未读 `CURRENT.md` 就改代码
- ❌ 一轮里做多个不相关改动
- ❌ 擅自修改 `DESIGN.md` 中 Approved 的条目
- ❌ 声称"已验证"而没有可复现证据
- ❌ 用页面刷新代替宿主重启来验证 client 改动
- ❌ 让默认测试命令写真实库 / 播放队列 / 用户设置
- ❌ 自动执行 `scripts/playback-test.mjs`、`scripts/loadtest.mjs`（见 TESTING 的禁用清单）
- ❌ 提交调试探针（`*probe*.mjs`、临时脚本）到仓库
- ❌ 删除测试或放宽断言来"修复"失败
- ❌ 在没有备份时改持久化数据形状（迁移不再要求，见 D-21）
- ❌ 复用或重排已分配的需求 / 决策 ID（见 §2.2）
- ❌ 把同一事实在五份文档里各写一遍（见 §2.1）
- ❌ 给出没有来源的设计结论（见 §16.1）；给不出就写 `假设（无来源）`



---

## 15. Agent skills（本地安装，两个来源）

技能包放在项目级 `.dsh/skills/`（DSH 项目根 = 本仓库，rank 高于 `$DSH_HOME/skills` 的用户级副本）。
两个本地来源，都不要手改：

| 来源 | 装了什么 | 用途 |
|---|---|---|
| <https://github.com/mattpocock/skills> | `skills/engineering` + `skills/productivity`（27 个） | 工程流程：grill / spec / tickets / tdd / review |
| <https://github.com/emilkowalski/skills> | `skills/*`（17 个；`prototype` 与 matt 重名，跳过） | UI/UX 与动效：`apple-design`、`emil-design-eng`、`review-animations` |

更新：重跑通用同步脚本（`-Slug` 区分来源，manifest 记录上游 commit）。

```powershell
pwsh -File "$env:DSH_HOME\tools\sync-skill-repo.ps1" -Slug mattpocock -RepoUrl https://github.com/mattpocock/skills -SkillPaths skills/engineering,skills/productivity -Workspace .
pwsh -File "$env:DSH_HOME\tools\sync-skill-repo.ps1" -Slug emilkowalski -RepoUrl https://github.com/emilkowalski/skills -SkillPaths skills -Skip prototype -Workspace .
```

`sync-mattpocock-skills.ps1` 保留为兼容包装；`.dsh/skills/.<slug>-skills.json` 是 manifest；`.dsh/` 不入库。
emil 的 `apple-design` 会**遮蔽** `~/.dsh/skills/apple-design`（另一份 HIG 技能）——本项目以 emil 那份为准（D-22）。

带 `disable-model-invocation: true` 的技能（`tdd`、`triage`、`grill-me` 等）只能由人触发；
其余可被模型按需加载。技能之间的协作沿用上游写法（用 `skill` 工具调用对方），未做改写。

### Issue tracker

本地 Markdown，文件放在 `.scratch/`。见 [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md)。

### Triage labels

五个规范角色，标签串与角色同名，写在 issue 文件的 `Status:` 行。见 [`docs/agents/triage-labels.md`](docs/agents/triage-labels.md)。

### Domain docs

单上下文：`GLOSSARY.md`（已建立）+ 决策记录沿用 `docs/DECISIONS.md`。见 [`docs/agents/domain.md`](docs/agents/domain.md)。


---

## 16. UI/UX 改动的做法（设计取证，强制）

任何视觉或交互改动按五步走，缺一步不算完成。这条流程是 2026-11-12 的三次返工换来的：
退出动画"感知不到"、按压"像卡住"，都不是调数值能解决的——**先取证，再改**。

1. **量化现状.** 先拿事实：行号、计算样式、截图、录屏、耗时。禁止用"感觉有点…"开题。
2. **查一手规范 + 竞品.** 至少两个**独立**来源，记链接与日期：
   - 一手：Apple HIG（用 `developer.apple.com/design/human-interface-guidelines/<page>.md` 的 Markdown 版）、
     NN/G、平台规范；
   - 技能：`.dsh/skills` 的 `apple-design`、`emil-design-eng`、`review-animations`（`715c180`）；
   - 竞品：Apple Music / Spotify / 系统播放器，写清"它在同一位置怎么取舍、我们的场景哪里不同"。
3. **先给 2–3 个方案.** 每个方案写：层级、控件位置、动效、代价；给出推荐，并写**反例**
   （什么情况下不选它）。方案没摆出来之前不动代码。
4. **按 `docs/DESIGN.md` §6 落地.** 数值进 P 表；交互模式变化 → 新增 D 条目；
   需求变化 → 新增/改 R 条目并等批准。三条线不能混。
5. **证据.** L1 静态守卫 + L3 人工（截图或 0.25× 录屏）。没有记录 = 未验证。

三条红线：

- **不凭手感调数值**；调了就必须同步 P 表，否则规范与实现脱节。
- **不为"看起来高级"堆动效**：高频交互默认不加动效（HIG 明说），悬停/键盘路径优先做减法。
- **不整段照搬竞品**：写清适用条件。竞品解决的是它的问题，不是我们的。

引用格式：结论后面跟来源链接与日期，评审时能点开。设计结论与代码同级，**都要可追溯**。

### 16.1 每条设计结论都必须有来源（强制）

推荐、参数、否决理由，每一个都要至少挂一个来源，并写在结论后面：

| 来源类型 | 写法（必须能点开或能查到） |
|---|---|
| 技能 | `emil-design-eng · Buttons must feel responsive` |
| Apple 规范 | `HIG · Color："Avoid using the same color to mean different things."` |
| 竞品 | `Apple Music · Now Playing：音量条弱于进度条` |

规则：

- **找不到来源的**标注 `假设（无来源）`，只能作为待验证提案，**不得直接实施**。
- 给不出来源的"我觉得更好看"不是理由；给得出来源但与本项目冲突（D-21 / D-22）时，以项目约束为准并写明。
- 来源冲突时的优先级：**Apple 规范 > 技能 > 竞品**；仍冲突就停下来问用户。
- 引用要具体到条目/章节/原句，**不许写"最佳实践"**这种无法核对的来源。
- 偏离规范时，必须写成「偏离 + 补偿」：例如"滑块悬停才出现，偏离 HIG「thumb 指示数值」，由填充轨道补偿"。
- **引用 HIG 必须写明平台章节**：iPadOS / tvOS 的交互结论不能直接套到桌面。反例：用 iPadOS 的「content effects」推出"桌面按钮不该有 hover 底色"，而 HIG · Toolbars 明确写着系统会为工具栏符号按钮提供 hover 外观。

