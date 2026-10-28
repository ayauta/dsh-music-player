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
