# Issue tracker: 本地 Markdown

本仓库的 issue / spec 以文件形式存放在 `.scratch/` 下。**不使用** GitHub / GitLab issue（本仓库没有 git remote）。

## 约定

- 一个功能一个目录：`.scratch/<feature-slug>/`
- 规格：`.scratch/<feature-slug>/spec.md`
- 实现 issue：`.scratch/<feature-slug>/issues/<NN>-<slug>.md`，从 `01` 起，**一个文件一张票**，
  不要写成单个合并的 tickets 文件
- 分诊状态写在文件靠上的 `Status:` 行，角色串见 [triage-labels.md](triage-labels.md)
- 评论与对话历史追加到文件底部的 `## Comments` 标题下

## 当技能说"发布到 issue tracker"

在 `.scratch/<feature-slug>/` 下新建文件（目录不存在就建）。

## 当技能说"取回相关 ticket"

直接读被引用的文件路径。用户通常会给路径或编号。

## wayfinder 操作

由 `/wayfinder` 使用。**map** 一个文件 + 每张 child ticket 一个文件。

- **map**：`.scratch/<effort>/map.md`（Notes / Decisions-so-far / Fog 正文）
- **child ticket**：`.scratch/<effort>/issues/NN-<slug>.md`，从 `01` 起，问题写在正文；
  `Type:` 行记 `research` / `prototype` / `grilling` / `task`；`Status:` 行记 `claimed` / `resolved`
- **阻塞**：文件靠上有 `Blocked by: NN, NN`；所列文件全部 `resolved` 才算解除
- **frontier**：扫 `.scratch/<effort>/issues/`，取未关闭、未被阻塞、未被认领的文件，编号最小者优先
- **认领**：先写 `Status: claimed` 再动手
- **解决**：在 `## Answer` 下写答案，置 `Status: resolved`，并把结论指针追加到 map 的 Decisions-so-far
