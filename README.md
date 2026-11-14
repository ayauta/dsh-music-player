# DSH Music · 本地 Hi-Res 音乐播放器（DeepSeek Harness 插件）

把 DSH 的左侧边栏底部变成一台安静的本地播放器：常驻的迷你播放器一行、锚定在它上方的
播放面板、主面板里的完整音乐库。播放走**独立 mpv 进程**（Windows 命名管道 JSON IPC），
音乐库走 **Host 侧 SQLite 索引**，全程只读本地文件。

```
侧边栏底部（迷你行）──点击──▶ 播放面板（固定定位，锚在行上方）
        │                              │
        └──────── 同源 fetch ──────────┴─▶ Host（索引 / 队列 / 引擎监督）──IPC──▶ mpv ──▶ WASAPI
```

## 文档导航

| 文档 | 内容 |
|---|---|
| [`AGENTS.md`](AGENTS.md) | 协作规则、阅读顺序、禁止事项（**接手先读这个**） |
| [`docs/CURRENT.md`](docs/CURRENT.md) | 当前状态、未验证项、阻塞、下一步 |
| [`docs/DESIGN.md`](docs/DESIGN.md) | 产品 / 视觉 / 交互规范（含 R01–R12 的三轴状态） |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | 技术架构与宿主约束 |
| [`docs/TESTING.md`](docs/TESTING.md) | 四层测试、副作用矩阵、验证记录 |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | 重要决策与被否方案 |
| [`CHANGELOG.md`](CHANGELOG.md) | 版本变化流水 |
| [`LIMITATIONS.md`](LIMITATIONS.md) | 已知限制与已知缺陷 |
| [`NOTICE.md`](NOTICE.md) | 第三方图标与许可 |

## 安装

这是一个 **DSH bundle**（`package.json` 声明 `dsh.bundle.patch`）：安装由 DSH 自己完成，不需要手改 profile。

**从 npm 装**（发版之后，一行）：

```text
plugin_manager install_bundle → target: @ayauta/dsh-music-player
```

或在 **设置 → 插件 → 添加插件** 里填 `@ayauta/dsh-music-player`。

> **目前还没发布到 npm**（作者还没有 npm 账号）。发布配置已经就位——`publishConfig` 指向
> registry.npmjs.org，推 `v*` tag 会跑 `.github/workflows/release.yml`（`npm run check` → `npm publish`）——
> 所以现在请用下面的源码目录方式安装。

**从源码目录装**（不用等发版）：

```powershell
git clone https://github.com/ayauta/dsh-music-player
```

然后在 **设置 → 插件 → 添加插件** 里选中克隆下来的目录 —— 本地目录是**链接**安装，
改完代码重新装一次就生效；也可以用 `plugin_manager install_bundle`，`target` 传这个目录的绝对路径。

装好后 **设置 → 插件** 里出现「音乐」一行（行 id `dsh-music`）；关掉这一行等于同时禁用 UI 与 Host 路由。

- 关闭 / 卸载：插件管理 → `@ayauta/dsh-music-player` → 禁用或卸载（源码目录保留）
- **库索引与设置与包名无关**，写在 `$DSH_HOME/plugin-data/dsh-music/`：换包名、重装、换分支都不会丢库；
  删掉这个目录等于清空索引（重新扫描即可）

**运行依赖**

| 依赖 | 用途 |
|---|---|
| mpv 0.41+ | 独立音频进程（解码 / 缓冲 / 输出 / 无缝续播） |
| ffprobe / ffmpeg | 扫描时读取真实规格与内嵌封面 |

二进制按 `lib/host/binaries.js` 的顺序解析（插件自带 `bin/mpv/` → scoop → winget →
Program Files → chocolatey → PATH）。**找不到 mpv 不会失败**，自动降级为浏览器 `<audio>`
（能力差异见 [`LIMITATIONS.md`](LIMITATIONS.md)）。

## 使用（当前实现）

1. 侧边栏底部是**迷你播放器一行**：封面、曲名、艺术家、上一曲 / 播放暂停 / 下一曲、极细进度线。
   点任意位置展开播放面板；进度线可直接点击或拖动定位，不会误触展开。
2. **播放面板**：封面、标题与艺术家、进度与剩余时间、五键传输行
   （随机 · 上一首 · 播放 · 下一首 · 循环）、音量滑杆。点外部或 `Esc` 关闭，关闭不停止播放。
3. 左侧栏「音乐」进入**音乐库**：全部歌曲 / 文件夹 / 专辑 / 艺术家 / 播放列表 / 收藏 /
   最近添加 / 播放队列；搜索支持歌名、原始文件名、专辑、文件夹、年份的模糊匹配（标题优先）。
4. 行内双击播放；右键（或行尾 `⋯`）打开菜单：立即播放 / 下一首播放 / 添加到队列末尾 /
   添加到播放列表 / 收藏 / 显示文件位置 / 编辑显示信息 / 设置封面 / 从音乐库移除
   （**只删索引，不动文件**）。
5. 设置 →「音乐」：扫描目录、重新扫描、默认音量、启动恢复队列、引擎状态、独占输出、
   列表密度、迷你播放器进度线、诊断日志、数据库备份、清理缓存。

**已知差距**：面板内的封面 ⇄ 队列切换是已批准但尚未实现的目标（[`docs/DESIGN.md`](docs/DESIGN.md) R06）；
其余限制与缺陷见 [`LIMITATIONS.md`](LIMITATIONS.md)。

**键盘**：`空格` 播放/暂停，`Shift+←/→` 上/下一曲，`Esc` 关闭面板；按钮可 Tab 聚焦并带 `aria-label`；
进度条与音量条可聚焦后用方向键调整。

## 数据与隐私

- 索引：`$DSH_HOME/plugin-data/dsh-music/library.db`（SQLite，WAL）
- 封面缓存：同级 `cache/covers/`；日志 `logs/music.log`（2 MB 封顶滚动）
- 备份：设置 →「备份数据库」写到 `backups/`
- 用户覆盖信息（歌名 / 艺术家 / 专辑 / 年份 / 封面）只写数据库，**不写回音频文件**
- 不联网、不上传、不生成 AI 内容

## 开发

```bash
node --test test/*.test.mjs          # L1：解析器 / LRC（安全，无副作用）
node scripts/service-smoke.mjs       # L2：进程内起 Host（隔离 DSH_HOME，但会出声）
```

⚠️ `scripts/playback-test.mjs` 与 `scripts/loadtest.mjs` 会覆盖真实队列、改用户设置、
改变当前播放，**在完成隔离改造前禁止自动执行**。安全边界与副作用矩阵见
[`docs/TESTING.md`](docs/TESTING.md) §3–§4。

**改动生效方式**

- **Host 侧**（`index.js`、`lib/host/*`）：插件管理里禁用再启用即可重新加载。
- **Client 侧**（`client.js`）：**只有重启 DSH 才会加载新 bundle**；刷新页面、禁用启用在实测中
  均不可靠。验证前必须先确认新代码已生效，方法见 [`docs/TESTING.md`](docs/TESTING.md) §6。

## 目录

```
AGENTS.md              AI / 人类协作规则（入口）
CHANGELOG.md           版本变化流水
docs/                  规范 / 测试 / 决策 / 当前状态
index.js               Host 入口：同步注册 /music 路由 + 生命周期
client.js              客户端单文件模块：slot 组件与样式
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
scripts/               冒烟、压测、窗口抓图、点击
test/                  node:test 单测
```
