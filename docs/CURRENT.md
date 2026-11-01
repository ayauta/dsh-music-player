# CURRENT.md — 当前状态

> 每轮任务开始时读这里，结束时更新这里。它是"项目此刻在哪"的唯一来源；
> 规范看 `docs/DESIGN.md`，验证证据看 `docs/TESTING.md`。

最后更新：2026-11-01（Phase 0 文档治理）

---

## 1. 基线

| 项 | 值 |
|---|---|
| 分支 | `master`（无其它分支） |
| 最近验证基线 | **`b8dc624`（v1.7.0）** —— 最后一次真实验证所对应的提交 |
| 当前 HEAD | 以 `git log -1` 为准；文档提交会让 HEAD 前进，不要求与上面相同 |
| 版本 | `package.json` → `1.7.0` |
| 标签 | **无**。计划中的 `baseline-v1.7.0` **必须指向 `b8dc624`**，不是文档治理后的新提交；打标签是单独的 Git 操作，尚未执行 |
| 工作区 | 文档治理产生的新文件（`AGENTS.md` + `docs/*.md` + `CHANGELOG.md`），**未提交** |

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

---

## 3. 已知未解决

| # | 问题 | 差异类型 | 影响 | 证据 | 状态 |
|---|---|---|---|---|---|
| **B1** | 音乐库「播放队列」一栏**渲染空白**（标题显示曲目数，内容区纯白） | Regression / Defect | 队列不可用；R07 无法验收 | 探针确认：分支执行、收到 41 条、纯 div 可渲染，`overflow:auto` 容器不可；改用 `.dshm-list` 后**未验证** | **未解决** |
| **B3** | 播放模式仍是两个按钮（随机 + 循环三态） | Implementation Gap | 与 R08 不符 | `client.js` 传输行 | 待排期 |
| **B4** | 面板内没有队列视图 | Implementation Gap | 与 R06 不符 | 队列按钮打开音乐库 | 待排期 |
| **B5** | Windows 媒体键未实现、路径未验证 | Implementation Gap | R11 `Not tested` | 见 `DECISIONS.md` D-07 | 待调查 |

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

---

## 5. 验证记录摘要

完整表在 `docs/TESTING.md` §8。最近两条：

- 2026-10-30 / `b8dc624` / L3 / 打开音乐库「播放队列」 → **Failed**（内容区空白）
- 2026-10-30 / `b8dc624` / L3 / 面板音量行与五键行 → **Passed**（截图）

---

## 6. 下一步（按顺序）

1. **Phase 0 文档治理**（本轮）：落地 5 份文档 → 用户审阅 → 收敛 README / LIMITATIONS / ARCHITECTURE → 独立文档提交 → 打 `baseline-v1.7.0` 标签（指向 `b8dc624`）
2. **测试安全化**：`playback-test` 主逻辑迁到隔离 L2；`package.json` 增加安全 `test` 脚本；补 L1 状态机测试
3. **B1 队列空白**：先用"探针把容器高度/行数画到界面上"确认真因，再修
4. **R06 / R08**：面板内队列视图 + 单按钮四态（纯客户端）
5. **R11**：确认 SMTC 会话可见性，决定媒体键路径
6. **动效**：按 `review-animations` / `emil-design-eng` 出第一份审查，先把参数从 Proposed 变 Approved

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

**Phase 0A 第二步（本轮完成，未提交）**

- 新建 `CHANGELOG.md`：迁入 v1.1–v1.7 的版本记录（README 的流水账已移出）
- 收敛 `README.md`：安装 / 使用 / 开发 / 文档导航；历史与验收表移出
- `ARCHITECTURE.md`：只新增 §8 两条已证实宿主约束，并修正 `shell.overlay` 的历史标注
- `LIMITATIONS.md`：删除过期的"已完成清单"，改为缺陷登记（B1、B3–B9）+ 限制 + 不做清单

**没有做的**

- 未改源码、测试脚本、API、数据库、Client UI、版本号
- 未提交、未打标签、未重启 DSH、未执行任何有副作用的测试、未删除 `artifacts/`
