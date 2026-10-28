# DSH Music · 本地 Hi-Res 音乐播放器（DeepSeek Harness 插件）

把 DSH 的左侧边栏底部变成一台安静的本地音乐播放器：常驻迷你播放器、`shell.overlay` 里的 Now Playing、`main` 面板里的完整音乐库。播放走**独立 mpv 进程**（Windows 命名管道 JSON IPC），音乐库走 **host 侧 SQLite 索引**，全程只读本地文件。

```
侧边栏底部（迷你播放器）→ Now Playing（浮层）→ 音乐库（主面板）→ 设置
        UI  ──同源 fetch──▶  Host（索引 / 队列 / 引擎监督）──IPC──▶  mpv ──▶ WASAPI
```

## 一、安装

插件已以「链接目录」方式安装进 `desktop` profile（`include:dsh-music` → `D:\code\playground\dsh_music_player`）。

- 关闭：设置 → 插件，或插件管理里禁用 `@local/dsh-music` 这一行
- 卸载：插件管理 → `@local/dsh-music` → 卸载（源码目录保留）
- 重装：对本目录执行 `plugin_manager install_bundle`

**运行依赖**（均在你的机器上实测可用）：

| 依赖 | 用途 | 位置 |
|---|---|---|
| mpv 0.41.0 | 独立音频进程（解码 / 缓冲 / 输出 / 无缝续播） | `C:\Users\andy\scoop\apps\mpv\current\mpv.exe` |
| ffprobe 8.1.2 | 扫描时读取真实规格与内嵌封面 | winget Gyan.FFmpeg |
| ffmpeg 8.1.2 | 抽取内嵌封面 | 同上 |

二进制解析顺序写在 `lib/host/binaries.js`：插件自带 `bin/mpv/`、scoop、winget、Program Files、chocolatey、最后才是 PATH。**找不到 mpv 时不会失败**，自动降级为浏览器 `<audio>`（见 LIMITATIONS）。

## 二、使用

1. 左侧栏底部出现迷你播放器（卡片：封面 / 曲名 / 艺术家或「待识别」/ 上一曲 / 播放暂停 / 下一曲 / 极细进度线）。
2. 点封面或文字打开 **Now Playing**：大封面、进度、传输、音量、三种模式（单曲 / 列表 / 随机）、队列、歌词、文件与规格。`Esc` 关闭，关闭不会停止播放。
3. 左侧栏「音乐」进入**音乐库**：全部歌曲 / 文件夹 / 专辑 / 艺术家 / 播放列表 / 收藏 / 最近添加；搜索框支持歌名、原始文件名、专辑、文件夹、年份的模糊匹配（标题命中优先）。
4. 行内双击播放；右键（或行尾 `⋯`）打开九项菜单：立即播放 / 下一首播放 / 添加到队列末尾 / 添加到播放列表 / 收藏 / 显示文件位置 / 编辑显示信息 / 设置封面 / 从音乐库移除（**只删索引，不动文件**）。
5. 队列支持拖拽排序、逐条移除、清空待播放；模式切换即时生效。
6. 设置 →「音乐」：扫描目录、重新扫描、默认音量、启动恢复队列、引擎状态、独占输出开关、列表密度、迷你播放器进度线、诊断日志、数据库备份、清理缓存。

**键盘**：`空格` 播放/暂停，`Shift+←/→` 上/下一曲，`Esc` 关闭浮层；所有按钮可 Tab 聚焦并带 `aria-label`；进度条与音量条可聚焦后方向键调整。

## 三、已实测通过的验收项

| # | 验收 | 实测证据 |
|---|---|---|
| 1 | 导入并播放无封面 WAV | 41 个真实文件全部入库；`01.《形神合一》` 播放成功，mpv 上报 `wasapi / 48kHz / 2ch` |
| 2 | 解析中文书名号 / 序号 / 音质后缀 | `parseFileName` 表驱动测试全绿；`形神合一 / 01 / 2024`；`【解锁奖励1】兰音无后期干音with.和声` 原样保留 |
| 3 | 显示真实规格 | `1. 梦倾天下.wav` 文件名无 bit 信息，实测 24bit/48kHz；详情页把「文件名标注」与「实测」并排比对 |
| 4 | 无封面也精致 | 中性占位（bg-layer-2 + 1px 描边 + 42% 音符字形），不生成伪艺术；本机库因有 `cover.jpg` 走文件夹封面 |
| 5 | 迷你播放器直控 | 三个按钮各自 `stopPropagation`，点击只执行不展开 |
| 6 | 完整面板：进度/音量/队列/模式 | 见截图 `artifacts/shot-14-nowplaying.png`、`artifacts/shot-18-menu.png` |
| 7 | 文件夹 / 播放列表 / 搜索 | 5 个文件夹、41 首；搜索「形神」「梦倾」命中 |
| 8 | 高负载下仍连续播放 | 4 线程 × 40s CPU 饱和期间，播放头 40.1s 内推进 39.26s（97.9%），最长无推进窗口 914ms（≈一个采样间隔），host API 延迟 ≤3ms |
| 9 | 切会话 / 关面板不断播 | 播放中切换面板、关闭 Now Playing、切换会话，mpv 进程持续运行 |
| 10 | 不擅自改动本地音乐 | 所有写操作只落在 `$DSH_HOME/plugin-data/dsh-music/`；专辑目录零写入 |
| 11 | 禁用/卸载释放资源 | 禁用插件后 `Get-Process mpv` 计数 0 |
| 12 | 明暗主题 / 尺寸 / 折叠态 | 只用 `--dsw-*` 语义 token（明暗自适应），迷你播放器以 `wide` 适配展开/折叠；见 LIMITATIONS 的两点限制 |

## 四、数据与隐私

- 索引：`C:\Users\andy\.dsh\plugin-data\dsh-music\library.db`（SQLite，WAL）
- 封面缓存：同级 `cache/covers/`；日志 `logs/music.log`（2 MB 封顶滚动）
- 备份：设置 →「备份数据库」写到 `backups/`
- 用户覆盖信息（歌名/艺术家/专辑/年份/封面）只写数据库，不写回音频文件
- 不联网、不上传、不生成 AI 内容

## 五、开发

```powershell
node --test "test/*.test.mjs"        # 解析器 / LRC / 自然排序
node scripts/service-smoke.mjs       # 无 DSH 直跑 host 全链路（真 mpv + 真文件）
node scripts/loadtest.mjs 20 40      # 播放 + CPU 压测
pwsh -File scripts/capture-window.ps1 -Out artifacts/shot.png   # 抓 DSH 窗口
```

改动生效方式（实测）：

- **host 侧**（`index.js`、`lib/host/*`）：`plugin_manager set_plugin` 先禁用再启用该行即可重新加载
- **client 侧**（`client.js`）：在窗口里 `Ctrl+R` 重新载入页面（文件改动不会自动热更）

## 六、目录

```
index.js               host 入口：同步注册 /music 路由 + 生命周期
client.js              客户端单文件模块：五个 slot 的组件与样式
lib/host/plugin.js     装配与拆除
lib/host/engine.js     mpv 监督器（命名管道 JSON IPC）
lib/host/player.js     队列 / 模式 / 位置 / 持久化状态机
lib/host/library.js    扫描、索引、派生视图、LRC、搜索排序
lib/host/db.js         node:sqlite 存储层
lib/host/parser.js     保守的文件名解析（绝不虚构艺术家）
lib/host/probe.js      ffprobe 封装（规格唯一真相）
lib/host/covers.js     封面优先级与缓存
lib/host/api.js        HTTP 面（一个 POST 端点 + 封面 + 降级流）
lib/host/process.js    子进程抽象（Harness subprocess 服务 / 本地）
scripts/               冒烟、压测、窗口抓图、点击、UIA
test/                  node:test 单测
```

---

## 七、v1.1 改版记录（按你的 8 条意见）

| 意见 | 处理 |
|---|---|
| 1. 艺术家都应是兰音Reine | 新增**专辑艺术家覆盖**（`album_overrides.artist`）：显示优先级 单曲覆盖 → 专辑覆盖 → 内嵌标签。设置页有「为全部专辑设置艺术家」一键写入；本机 5 个专辑已写入，41 首全部显示 兰音Reine。**不是文件名推断**，是按你的数据写入数据库。 |
| 2. 迷你播放器太小、左右要对齐侧栏 | 改为整宽的边框卡片（`bg-layer-1` + `border-l1`，与「新会话」按钮同一语言），封面 34→40，标题 13.5/600，控制键 28px 命中区，卡片左右与侧栏内容区完全对齐；折叠态只留封面按钮。 |
| 3. 传输图标难看 | 传输控件改为**实心几何字形**（双三角上一曲/下一曲、实心三角播放、双竖条暂停），其余界面图标整套换成 **Lucide 1.63（ISC）**，见 `NOTICE.md`。统一 1.75 描边、圆角端点。 |
| 4. 副标题只要作者名 | 迷你播放器与 Now Playing 的副标题现在只显示艺术家（没有则显示「未知艺术家」），年份/专辑移到列表列与详情。 |
| 5. 字体重新设计 | 建立单一声级表：Display 21/600、Title 13.5/600、Row 13/500、Sub 12/400、Caption 11/600（大写 +0.07em），字体栈 SF → Segoe UI Variable → PingFang SC → 微软雅黑；全部数字用 tabular-nums。最小字号 11px，高于 macOS 的 10pt 下限，无 Light/Thin 字重。 |
| 6. 进度条可点但看不到进度 | 重写为共享 `ProgressBar`：填充始终可见（3px，悬停 5px，按下 6px + 圆形滑块 + 时间气泡），pointerdown 立即跳转、可拖动、方向键 ±5s（Shift ±15s）、Home/End；迷你与浮层同一套行为，迷你条不会误触展开面板。 |
| 7. 切歌有问题 | 手动上一曲/下一曲改为**确定性重载**（不再依赖 mpv 播放列表下标），自动切歌仍由 mpv 无缝接管；修复了单曲循环在 EOF 后从末尾重新加载的死循环、以及 `prefs` 变更不生效。新增 `scripts/playback-test.mjs`，同时校验「插件游标」与「mpv 实际打开的文件」，8 组断言全绿。 |
| 8. 淡入淡出 + 设置最佳实践 | 淡入淡出默认开启、设置可关（关闭后完全没有淡变），手动调音量会立刻打断淡化；设置页重做为五个分区并同时挂到 `settings.section` 与音乐库侧栏「设置」，两处同一组件。 |

新增命令：

```powershell
node scripts/playback-test.mjs     # 切歌/循环/自动推进/淡入淡出开关 端到端断言
```

---

## 八、v1.2 改版记录（按你的四条意见）

| 意见 | 处理 |
|---|---|
| 1. 迷你播放器没融入 | 去掉卡片化：无边框、无底色、圆角 7px、内边距 6/8，与侧栏「插件」「自动化任务」行**同参数**；hover 用同一 `color-mix(label-primary 7%)`；封面 40→32，控制键 28→24。 |
| 2. 弹窗点不开 | 根因：关闭时 `return null` 让 list 型 slot 把条目置为 `active:false` 并不再挂载（运行时查询 `shell.overlay` 证实）。改为**永不返回 null**，关闭时渲染零尺寸锚点。已实测「收起→重开」「进音乐库→重开」两条路径。 |
| 3. 改成上方弹出 + 精简 | `shell.overlay` 里的作品改为**锚定在迷你播放器上方的非模态 popover**（宽 340、无遮罩、点外部/Esc 关闭、焦点进出、向上 8px 缩放入场 160ms）。内容按 Apple Music 卡的密度重排：封面 176 → 标题/艺术家 → 进度（右侧**剩余时间**）→ 传输 → 一行（模式按钮 + 音量）→ 规格 chips → 底部「歌词 / 队列 / 规格 / 音乐库」。左上角 chevron-down 收起。 |
| 4. 进度条位置与语言 | 迷你条改为从**封面右缘**起（`left:49`）、距封面 8px、贴行底 3px；命中区 8px（不再抢走行点击）。popover 内 4px→hover 6px、12px 滑块、拖动时间气泡。**不做**缩略图/波形预览（需整库预分析）。 |
| 播放模式 | 一个按钮循环 **顺序 → 列表循环 → 单曲循环 → 随机**（QQ 音乐式循环，Apple 式图标）。切换**不再重载当前曲**：host 只重排后续队列；`jumpTo` 的 `baseCursor` 改为加载前置位，并忽略加载中的 `playlist-pos`（修复切歌后游标错位）。新增 `sequence` 模式，播到队尾停止。 |
| 收藏 | popover 里不放收藏（按要求），右键菜单保留。 |

新增/更新的验证：

```powershell
node scripts/playback-test.mjs   # 现为 11 组：含「模式切换不动当前文件/位置」「sequence 到底停止」
```

实测结果：`ALL PLAYBACK CHECKS PASSED`。
