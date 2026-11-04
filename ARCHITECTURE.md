# 架构说明

## 1. 为什么是「独立进程」

DSH 的主进程是 Electron 里的 Node Host，网页侧是 Chromium。把音频塞进网页 `<audio>` 虽然也能出声（Chromium 自带音频服务进程），但：

- 无法选择独占输出，Windows 混音器一定会把 24bit 整型转成 float 再重采样到设备混音格式；
- 无法读取「设备实际输出规格」，只能猜；
- 页面生命周期、页面级降频、Electron 的渲染进程优先级都会影响音频线程的调度余量。

因此默认路径是 **一个独立 mpv 进程**：

```
DSH Client UI  ──(HTTP，同源)──▶  Host 插件  ──(named pipe JSON IPC)──▶  mpv.exe  ──▶  WASAPI
```

mpv 负责文件读取、解码、缓冲、播放列表推进与音频输出；Host 只下命令、读属性；客户端只显示。**Harness 的事件循环从不接触 PCM 数据。**

### IPC 细节

- 通道：`--input-ipc-server=\\.\pipe\dsh-music-<pid>-<rand>`，Node 侧用 `node:net` 连接。
- 协议：换行分隔 JSON，`{command, request_id}` → `{request_id, error, data}`，事件为 `{event, name, data}`。
- 观察属性：`pause`、`playlist-pos`、`playlist-count`、`audio-out-params`、`audio-params`、`audio-codec-name`、`current-ao`、`audio-device`、`eof-reached`、`idle-active`、`duration`。
- **不观察 `time-pos`**（高频），改为每秒一次 `get_property time-pos`，UI 侧用 rAF 插值。
- 播放列表：mpv 镜像「当前曲 + 之后的队列」，因此 `--gapless-audio=weak` 生效，切歌无空隙。
  队列变化只改「当前之后的条目」：Engine 的 `rewriteTail({expectCurrent, tail})` 负责裁剪 + 追加，
  **逐个读回 `playlist/N/filename` 与期望列表核对**之后才返回 `ok`——条目数相等不算成功。
  它同时返回 `at`（这次写入依据的 mpv 下标）与 `seen`（那一刻 mpv 在该下标上的文件），
  Player 据此把 cursor 从 mpv 的答案里重新推导，而不是相信自己发出的那个。
  三种不一致都有明确出口：mpv 已换曲 → `current-moved`（**不写入**）；写后条目内容不符 →
  `playlist-mismatch`（不回报成功、不动锚点）；`seen` 不在调用方的顺序里 → 不采纳、不设锚点。
- 进程卫生：`quit` → 2.5s 宽限 → `terminate`；反复崩溃有 3 次退避重启预算；`ctx.subprocess` 服务释放时托管子进程一并终止。

### 规格的三层口径

| 层 | 来源 | 例子 |
|---|---|---|
| 源文件 | ffprobe（扫描时入库） | `pcm_s24le / 48000 / 2ch / 2304 kbps` |
| 解码后 PCM | mpv `audio-params` | `s32 / 48000 / stereo` |
| 设备输出 | mpv `audio-out-params` | `float / 48000 / stereo`（共享模式被转 float） |

UI 三层并排显示，不会因为「源文件是 24bit」就宣称 bit-perfect。独占模式（设置 → 音频）会让设备按源格式打开；失败自动回落并显示原因。

## 2. 数据模型（`node:sqlite`，WAL）

`roots / tracks / track_overrides / album_overrides / favorites / playlists / playlist_items / app_state / scan_runs`，`user_version` 记录模式版本。

要点：

- **曲目 ID** = `sha1(rootId \0 规范化相对路径)`，路径变更不影响已有引用。
- **指纹** = `size:mtime:duration:codec:rate`，扫描时用来识别「改名 / 移动」，命中则原地更新路径，不算重复导入。
- **移除 ≠ 删除**：`removed_at` 软删；文件永不移动、重命名、删除、上传。
- **覆盖信息**独立表，播放与显示都先读覆盖再读标签最后读文件名。
- 队列 / 音量 / 模式 / 位置存在 `app_state`，重启恢复但**停在暂停**。

## 3. 扫描

- 单队列 + 并发 4 个 ffprobe；每 8 个文件回报一次进度；可用 `AbortSignal` 取消。
- 命中 `(size, mtime)` 且未标 missing 的文件直接跳过探测。
- 一个 root 全部失败时 `scan_runs.status = error` 并带首个错误原因，而不是假装成功。
- 树内跳过符号链接与隐藏目录，深度上限 32，避免自引用环。

## 4. 派生视图与搜索

内存索引（`byId` / `byPath` / `ordered`）在 refresh 时重建，列表过滤排序都在 JS 里做，SQL 只做存储 —— 没有用户输入进入 SQL。

搜索打分：标题完全匹配 4 / 前缀 3.5 / 包含 3 / 专辑·艺术家·年份 2 / 文件名·文件夹 1.5 / 路径 1 / 子序列 0.8-0.6。这样搜「形神」时歌曲本体排在整张专辑前面。

## 5. 客户端

单文件 `client.js`（无构建链、零 npm 依赖），通过 `window.__ModuleLoader__.load` 注册为懒工厂，`apply(ctx)` 里做五件事：

| slot | 组件 | 说明 |
|---|---|---|
| `sidebar.footer.action` | `MiniPlayer` | 用 `wide` 区分展开/折叠；三个控制键 `stopPropagation`，不触发面板 |
| `sidebar.panellist` | `PanelGlyph` | 与 `main(key='music')` 同 id，点击即切面板 |
| `main` | `LibraryPage` | 侧栏 + 工具栏 + 虚拟化行（rAF 之外的常规渲染） |
| `shell.overlay` | `NowPlayingOverlay` | 模态浮层：Esc、点背景关闭、初始聚焦、关闭还原焦点 |
| `settings.section` | `SettingsPage` | 与宿主设置页同一套排版 |

> 注：`shell.overlay` 一行是 v1.3 之前的历史形态，**当前不再使用**——播放面板改为迷你行内部的
> 固定定位子组件，原因见 §8 宿主约束 1 与 `docs/DECISIONS.md` D-03。

性能纪律：

- 播放头动画走 `requestAnimationFrame` 直接写 CSS 变量（`--p`），**不 setState**，因此进度不会驱动 React 重渲染。
- 状态轮询 1 Hz（页面隐藏时 2.5s），只有「曲目 / 播放态 / 音量 / 模式 / 队列长度 / 引擎状态 / 库计数」变化才通知订阅者。
- 封面通过 `<img src="/music/cover?id=…">`，ETag + 内存缓存；不出图片 base64。
- 样式全部用 `--dsw-alias-*` / `--dsw-specific-*` token，唯一硬编码颜色是无封面占位的中性渐变。

## 6. HTTP 面

只有一个前缀路由 `/music`：

- `POST /music/api`：`{op, ...}` → `{ok, data|error}`，50 余个 op（库、根目录、队列、传输、播放列表、覆盖、偏好、诊断）。
- `GET /music/cover?id=|album=`：封面字节，ETag、304、内存缓存。
- `GET /music/stream?id=`：Range 支持，仅供浏览器降级引擎。

同源校验：回环地址 + 本机 Host 直接放行，其余要求 Origin 与 Host 一致；只接受库内 id，**永不接受客户端传来的文件路径**。

## 7. 生命周期

- `apply` 同步注册路由（客户端一渲染就能调用），重活（SQLite、ffprobe、mpv）在 `ready` Promise 后面。
- `ctx.effect` 注册路由与拆除；禁用/卸载时：停播 → mpv `quit` → 等退出 → 兜底 kill → 关库。
- 页面卸载时移除 `<style>`（`ctx.effect` 返回清理函数）。

## 8. 已证实的宿主约束

以下两条均在本机运行时验证过，属于**外部约束**，不是本插件可以自行改变的行为。

### 约束 1：slot 条目"渲染空"或抛错会被停用，并且不再挂载

- 现象：list 型 slot（如 `shell.overlay`）会把渲染为 `null` 或抛出异常的条目判为 `active:false`，
  之后即使重新渲染也不再显示。
- 证据：运行时查询 slot occupant 得到 `active:false`；两次"点不开"均由此产生
  （`docs/DECISIONS.md` D-03）。
- 对架构的影响：
  - 播放面板**不作为 slot 条目**，而是迷你行内部的 `position: fixed` 子组件；
  - 三个 slot cell（播放器 / 音乐库 / 设置）各包一层 `ErrorBoundary`，异常时降级而不是整格失活；
  - 任何 slot 条目都必须"永远渲染出非空内容"。

### 约束 2：客户端 bundle 只在宿主启动时加载

- 现象：`client.js` 改动后，刷新页面、`Ctrl+R`、`F5`、插件禁用→启用在实测中都**不可靠**；
  连续三次改动后截图哈希完全相同。
- 唯一的可靠路径：**重启 DSH**，之后新 bundle 才会生效。
- 证据与验证步骤：`docs/TESTING.md` §6；`AGENTS.md` §7。
- 对架构的影响：客户端改动必须成批交付；任何"已验证"的客户端结论都必须先证明 bundle 已更新。
