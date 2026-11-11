# Domain docs

工程技能在探索本仓库时如何消费领域文档。

## 探索前先读这些

- **`GLOSSARY.md`**（仓库根）：**已建立**（2026-11-11，首批词条 30 条）。新增或改写术语走
  `/domain-modeling`，不要临时发明同义词。
- **`GLOSSARY-MAP.md`**（仓库根）：不存在。存在时表示多上下文，按它指向的每份 `GLOSSARY.md` 读。
- **架构决策**：本仓库的决策记录是 [`docs/DECISIONS.md`](../DECISIONS.md)（编号 `D-01` 起），
  不是 `docs/adr/`；若将来出现 `docs/adr/`，两者都要读。改到哪个子系统，就读该子系统的既有决策。
- 产品/技术/测试规范分别见 `docs/DESIGN.md`、`ARCHITECTURE.md`、`docs/TESTING.md`，
  本文件不复述它们的内容（见根目录 `AGENTS.md` §2.1）。

## 文件结构

单上下文（single-context）仓库：

```
/
├── GLOSSARY.md          ← 术语表（已建立）
├── docs/DECISIONS.md    ← 决策记录（本仓库现状）
├── docs/adr/            ← 暂无；若引入则与 DECISIONS.md 分工见上
└── lib/ client.js ...
```

## 使用词汇表里的词

输出里出现领域概念时（issue 标题、重构提案、假设、测试名），用 `GLOSSARY.md` 定义的词，
不要漂移到它明确避开的同义词。概念不在表里，说明要么在发明项目不用的语言，要么是真的缺口
（记下来交给 `/domain-modeling`）。

## 冲突要显式提出

输出与既有决策矛盾时，明确指出来，不要静默覆盖：

> _与 D-07 冲突，但值得重开因为……_
