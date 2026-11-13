# Agent skills（本地安装，两个来源）

> 从 `AGENTS.md` §15 移出。AGENTS 只保留指针；本文件是操作手册，需要更新技能时读这一份。
> 技能包放在项目级 `.dsh/skills/`（DSH 项目根 = 本仓库，rank 高于 `$DSH_HOME/skills` 的用户级副本）。
> 两个本地来源，都不要手改。

| 来源 | 装了什么 | 用途 |
|---|---|---|
| <https://github.com/mattpocock/skills> | `skills/engineering` + `skills/productivity`（27 个） | 工程流程：grill / spec / tickets / tdd / review |
| <https://github.com/emilkowalski/skills> | `skills/*`（17 个；`prototype` 与 matt 重名，跳过） | UI/UX 与动效：`apple-design`、`emil-design-eng`、`review-animations` |

## 更新

重跑通用同步脚本（`-Slug` 区分来源，manifest 记录上游 commit）：

```powershell
pwsh -File "$env:DSH_HOME\tools\sync-skill-repo.ps1" -Slug mattpocock -RepoUrl https://github.com/mattpocock/skills -SkillPaths skills/engineering,skills/productivity -Workspace .
pwsh -File "$env:DSH_HOME\tools\sync-skill-repo.ps1" -Slug emilkowalski -RepoUrl https://github.com/emilkowalski/skills -SkillPaths skills -Skip prototype -Workspace .
```

`sync-mattpocock-skills.ps1` 保留为兼容包装；`.dsh/skills/.<slug>-skills.json` 是 manifest；`.dsh/` 不入库。

## 两条容易踩的

- emil 的 `apple-design` 会**遮蔽** `~/.dsh/skills/apple-design`（另一份 HIG 技能）——本项目以 emil 那份为准（D-22）。
- 带 `disable-model-invocation: true` 的技能（`triage`、`grill-me`、`grill-with-docs`、`to-spec`、`to-tickets`、
  `implement`、`handoff`、`retro`、`improve-codebase-architecture` 等）只能由人触发；其余（`tdd`、`code-review`、
  `grilling`、`codebase-design`、`domain-modeling`、`research`、`prototype` …）可被模型按需加载。
  技能之间的协作沿用上游写法（用 `skill` 工具调用对方），未做改写。

## Issue tracker / triage / domain docs

- Issue tracker：本地 Markdown，文件放在 `.scratch/`。见 [`issue-tracker.md`](issue-tracker.md)。
- Triage labels：五个规范角色，标签串与角色同名，写在 issue 文件的 `Status:` 行。见 [`triage-labels.md`](triage-labels.md)。
- Domain docs：单上下文——`GLOSSARY.md`（已建立）+ 决策记录沿用 `docs/DECISIONS.md`。见 [`domain.md`](domain.md)。
