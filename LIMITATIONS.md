# 已知限制与已知缺陷

本文件只记录**当前的限制与缺陷**。

- 已批准的**目标行为**看 [`docs/DESIGN.md`](docs/DESIGN.md)（R01–R12，含实现/验证状态）。
- **验证记录**看 [`docs/TESTING.md`](docs/TESTING.md) §8。
- **版本变化**看 [`CHANGELOG.md`](CHANGELOG.md)。
- 本文件不再维护"已完成功能清单"——那种清单最容易过期。

最后更新：2026-11-05（C1 队列稳定化：B12/B13/B14/B15/B16/B18 结案，B17 收进 mirror）

---

## 一、缺陷登记（含候选与待裁定项）

> 表里的"影响"列写的是**分类结论**，不要一律读成"已确认缺陷"：
> 缺陷候选、未验证风险、待产品裁定的行为都登记在同一张表里，但语义不同。
> 与测试的对应关系见 [`docs/TESTING.md`](docs/TESTING.md) §2.1。

| ID | 缺陷 | 影响 | 证据 | 状态 |
|---|---|---|---|---|
| **B1** | 音乐库「播放队列」一栏渲染空白（标题显示曲目数，内容区纯白） | 队列的拖排 / 移除 / 下一首播放 / 入队在 UI 上不可用 | 探针确认分支执行、收到 41 条队列数据、纯 div 可渲染；容器改为 `.dshm-list` 后**尚未验证** | **未解决**，见 `docs/CURRENT.md` |
| **B3** | 播放模式曾是"随机开关 + 循环三态"两个按钮 | 与已批准的单按钮四态不一致 | 已按 R08 合并为 `ModeButton` | **已修（工作区）**，待 L3 |
| **B4** | 播放面板内没有封面 ⇄ 队列切换 | 与已批准的 R06 不一致 | 队列按钮打开音乐库 | 实现缺口，见 `docs/DESIGN.md` R06 |
| **B5** | Windows 媒体键未实现 | 用户要求的"优先支持"未兑现 | `docs/DECISIONS.md` D-07 | 路径未验证，见 `docs/DESIGN.md` R11 |
| **B6** | 删除播放列表没有二次确认 | 误删可重建，但不符合破坏性操作惯例 | 代码走查 | 低优先级 |
| **B7** | 队列拖拽用原生 HTML5 DnD，长列表没有自动滚动 | 大量条目时排序不便 | 代码走查 | 低优先级 |
| **B8** | 新建播放列表用 `window.prompt` | 与自绘对话框风格不一致 | 代码走查 | 低优先级 |
| **B9** | 搜索无历史与联想，只有即时过滤 | 大库检索效率受限 | 代码走查 | 低优先级 |
| **B10** | 「下一首播放」在 shuffle 下不生效：`cursor + 1` 是 `plays` 的下标，却被用来切 `queue`；插入之后 `rebuildPlays` 又把该项洗走 | **已修**。仅 shuffle 受影响，sequence / all / one 本来就正确 | 修复前 L1 探针（四模式）：只有 shuffle 点下一首播的是 `b` 而不是刚插入的 `d`；修复后 L1 四模式 + L2 真实 mpv 都打开了 `d` 的文件 | 已修：L1 四模式、L2 真实 mpv、2026-11-02 重启后用户手动验收（口述，未记录曲目名） |
| **B11** | 播放中切到单曲循环不裁 mpv 镜像尾，旧队列尾部仍被持有 | **未验证的技术风险**：没有真实 mpv 证据前，不宣称这是用户可见缺陷 | `test/player-transport.test.mjs`「DIAGNOSTIC (known behaviour, B11)」 | 待独立任务的真实 mpv 验证 |
| **B12** | 删除正在播放的条目会回到队首，而不是顺延到下一首 | **已按决策 8 修正**；原为待裁定的交互行为 | 现在顺延到后继；删的是最后一首则停止并保留其余队列 | `test/player-queue.test.mjs`「removing the playing entry advances…」「removing the last playing entry stops…」 | 已修（L1） |
| **B13** | 重复曲目时 `indexOf` 命中第一条：编辑队列后游标跳到第一份拷贝 | **已消除（结构性）**：活动队列不允许同一 trackId 出现两次，`indexOf` 在唯一数组上精确 | 条目身份 = trackId，不再需要 entryId | `test/player-queue.test.mjs`「playQueue keeps one entry per track…」「a repeated track never enters the queue twice」 | 已消除；D-09 待标 Superseded |
| **B14** | `queue.set` 丢掉当前曲时不重载：`trackId` 指向新队首，mpv 仍在播旧文件，同一份 snapshot 自相矛盾 | **已修**：当前曲被替换时重载，mpv 与 Host 同步 | 公开 op 不再能制造自相矛盾的快照 | L1「setQueue makes mpv follow when the current track is dropped」；L2 真实 mpv 同断言 | 已修（L1 + L2） |
| **B15** | 队列视图标题把整库曲目数当成队列长度（`view='queue'` 也发给 `library.list`，Host 走 default 分支返回整库） | **已修（客户端）**：队列视图不再请求 `library.list`，标题取 `player.queue.length` | 同一分支让 `tracks` 恒为空，`playFrom` 结构上不可能把整库塞进队列 | `test/client-source.test.mjs`「the queue view never asks the library for a track list」 | 已修，待 L3 |
| **B16** | 队列视图高亮行与实际播放曲目不一致：客户端把 `snapshot().cursor`（`plays` 的下标）当作 `queue` 的下标 | **已修**：`cursor` 现在索引的就是可见队列；客户端按 `trackId` 定位，两者一致 | 随机播放时不再错行 | 实机 `status`：`mode=shuffle`、`cursor=2`、`trackId` 在 `queue` 的位置是 4；改为按 `trackId` 定位后高亮正确。C1 之后两个下标空间合并 | 已修（L1 守卫） |
| **B18** | 「清空待播放」用 `ids.slice(0, cursor + 1)`，同样是拿 `plays` 的下标切 `queue` | **已退役（不是修复）**：按决策 4 删除该功能，按钮改为「停止并清空队列」（`queue.clear`） | 随功能消失；`queue.set` 的裁剪调用点不复存在 | `test/client-source.test.mjs`「the queue panel clears the whole queue and never clips it by cursor」 | 已退役 |
| **B17** | 顺序被重建后自然 EOF 失步：`baseCursor` 没有随顺序重排重新锚定，`pos` 事件映射到错误曲目 | **已修（工作区，待重启 L3）**：锚定现在只写在 `mirror()` 里，没有第二个写者 | 播放中 `move` 后自然播完，音频已换曲而 `trackId`／迷你行停在旧曲 | L1「a reordered queue keeps the auto-advance mapping anchored」；L2 真实 mpv「B17: a natural EOF after an order change…」 | 已修，待 L3 |
| **B19** | 顺序播放播到最后一首后按「播放」，会立刻再次结束 | **本轮范围外的新发现**：`handleEndOfTrack` 用 `positionMs = durationMs` 表达"已播完"，`resume()` 又拿它当 `startMs` 去 seek | 用户点播放没有声音，像是卡住 | 隔离探针：sequence 播完 b 后 `resume()` → `load(paths, 0, 3000)`，而 b 的时长就是 3000ms（`docs/CURRENT.md` §6 待办） | 待修（不属 C1） |

> **关于 B2**：早期把"客户端 bundle 只在宿主启动时加载"记作缺陷 B2；它其实是**宿主约束**
> 而非本插件的缺陷，现已归入 [`ARCHITECTURE.md`](ARCHITECTURE.md) §8 约束 2。
> 为保持 ID 稳定，B2 不再复用（见 `AGENTS.md` §2.2）。

---

## 二、没做（明确不做，不是缺陷）

- AI DJ / 推荐 / 自动歌单 / 流媒体 / 在线歌词 / 音频指纹识别
- EQ、音效、音量归一化、变速（淡入淡出除外，且可关闭）
- **波形与视频缩略图**（`docs/DESIGN.md` R10）
- 交叉淡化（两首歌重叠）：只做「淡出 → 切换 → 淡入」，需要两条同时解码的音轨才能重叠
- 托盘常驻 / 关窗继续播放：关闭 DSH 即释放音频设备
- 文件标签写入与文件重命名整理
- DSD / APE / WMA 等额外格式（已覆盖 WAV / FLAC / MP3 / M4A / MP4 音轨）

---

## 三、已知限制（架构或环境决定，不是 bug）

1. **共享输出不是 bit-perfect。** 默认 WASAPI 共享，Windows 会把 24bit 转 float 并按设备混音格式
   重采样（实测 `s32 → float`）。独占模式可让设备按源格式打开，但切歌/切设备时可能失败并回落。
2. **淡入淡出是音量斜坡，不是采样级淡变。** 步进约 16ms，听感平滑但严格来说不是逐样本包络。
3. **自动切歌时无法先淡出。** mpv 的无缝推进不允许提前降低音量，所以自动切换只有淡入；
   手动切换才是完整的淡出 + 淡入。
4. **渲染进程仍是 Chromium。** 页面级降频（最小化）时 UI 刷新变慢；播放本身不受影响。
5. **浏览器降级路径有损体验。** 找不到 mpv 时自动用 `<audio>`：无独占、无设备规格、
   无无缝续播、无淡入淡出。
6. **Windows 标题栏模式下侧边栏折叠会隐藏整个 footer**（宿主行为），折叠态迷你播放器不可见；
   展开或悬停展开恢复。
7. **封面优先级与最初需求原文不同（有意为之）**：用户设置 > 内嵌 > 文件夹 > 占位，
   否则手动设置永远不生效。
8. **专辑显示名做了缩短**：分组键仍是文件夹路径，显示时若带 `《…》` 取书名号内的标题，
   原始文件夹名保留在详情与 tooltip。
9. **艺术家来自覆盖而不是推断**：`兰音Reine` 是写进数据库的专辑艺术家覆盖，不是从文件名猜出来的；
   换一台机器、换一个库不会自动出现（`docs/DECISIONS.md` D-08）。
10. **单文件客户端**：`client.js` 约 2.4k 行，无构建链、零 npm 依赖，代价是没有类型检查。
11. **设置页在 DSH 设置里仍无法用键盘/鼠标路径直达**（本版本 DSH 设置入口未暴露给插件测试），
    但同一组件已挂到音乐库侧栏「设置」，可用性有保障。
12. **音乐库规模假设** ~1 万首以内；十万级需要改成分页 SQL 查询。
13. **`伴奏/` 不特殊归组**（按需求：不作为插件特性）。
14. **客户端 bundle 只在宿主启动时加载**：改完 `client.js` 必须重启 DSH 才能验证。
    这是宿主约束，详见 [`ARCHITECTURE.md`](ARCHITECTURE.md) §8 约束 2。
15. **队列条目唯一**：同一 trackId 在活动队列中最多出现一次。「下一首播放」移动已有条目，
    「添加到队列」对已存在的条目是空操作。要连续播同一首歌，用单曲循环，或播完再入队。
16. **随机只重排"当前之后"的条目**：进入随机与一轮结束时洗牌；退出随机保留当前可见顺序，
    没有隐藏的原始顺序。手动「下一首播放」不会被后续洗牌覆盖。
17. **队列编辑不会开始播放**：暂停保持暂停、停止保持停止；只有传输操作（播放 / 下一首 /
    上一首 / 点选）才会启动音频。「停止并清空队列」是唯一的破坏性队列操作。

---

## 四、测试相关的风险（临时状态）

- `scripts/playback-test.mjs` 与 `scripts/loadtest.mjs` **会改真实队列、真实设置与当前播放**，
  在隔离改造完成前禁止自动执行（[`docs/TESTING.md`](docs/TESTING.md) §3）。
- 默认安全命令：`npm test`（L1，含状态机测试）、`npm run test:l2`（隔离 host、无声）、
  `npm run smoke`（夹具库）。L1 的授权门用例会自起一个临时**回环** HTTP 服务，
  因此不宜概括为"完全不碰网络"——它不访问任何外部服务或真实宿主。
- **B12 / B13 / B14** 由**诊断用例**（前缀 `DIAGNOSTIC (…)`）锁定现状，**不是"已修复"**；全绿只代表
  "仍然可复现"。**B10 已修复**，对应用例已改写为正确行为的回归断言（四模式 + 真实 mpv）。
  "仍然可复现"。测试全绿与"需求已满足"是两件事，区分规则见
  [`docs/TESTING.md`](docs/TESTING.md) §2.1。诊断用例失败时先看
  [`docs/CURRENT.md`](docs/CURRENT.md) §3 的分类，不要直接改断言让它变绿。
