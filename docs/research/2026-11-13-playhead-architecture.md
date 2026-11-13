# 播放头架构调研（2026-11-13）

> 目的：为决策「进度插值要不要抽成纯函数 module、抽到哪一层」取证。
> 所有链接访问日期 **2026-11-13**。找不到的先例一律写「未找到」，不推测。

## 0. 一句话结论

**插值一律在客户端，而且已经有官方把它写成导出纯函数**（Home Assistant 前端 `getCurrentProgress`）。
内核与服务端只负责给「值 + 采样时刻」；谁都没有用「服务端每秒推位置」换平滑。

---

## 1. Web 媒体 UI 库：谁算显示时间

| 库 | 谁算显示时间 | 刷新机制 | seek latch | 时钟源 | 规则位置 | 测试 |
|---|---|---|---|---|---|---|
| **video.js 8.23**（`TimeDisplay`/`SeekBar`） | `player.currentTime()`；`scrubbing` 时读缓存值 | `timeupdate`/`ended`/`seeking` + 播放期 `setInterval`，渲染走 `requestNamedAnimationFrame` | `pendingSeekTime_`（钳 0..duration，`seeked` 后清空） | 浏览器 | 散在组件 | 有单测目录 |
| **video.js 10（main，重写）** | `media.currentTime` 原值，**不插值** | 播放期 rAF；页面隐藏/暂停退回 `timeupdate` | 状态层写乐观 `currentTime` + `seeking`，seek 期间**丢弃** `timeupdate`/`progress`，`seeked` 收口，**无超时** | 无 | 抽成 store feature `timeFeature` + 纯类 `TimeCore` / `TimeSliderCore` | 有，28 例 |
| **media-chrome 4.19** | **插值**：`start + elapsed/duration*playbackRate` | 60fps rAF（`RangeAnimation`），`mediacurrenttime` 变化时重同步 | `dragging` 门禁 + `#seekRequest` 停动画；无超时；单调守卫（只接受 >0.5s 的倒退） | **`performance.now()`** | 独立类 `src/js/utils/range-animation.ts` | 有 `range-animation.spec.ts` |
| **Vidstack 1.15** | `media.currentTime` 原值 | rAF（`RAFLoop`），`playing` 起、`pause/ended` 停 | `seeking` 信号 + 拖动时不写 slider；无超时 | 无 | provider 采样 + `player-state.ts` getter 夹取 | 部分 |
| **Plyr 3.8.5**（反例） | `Number(media.currentTime)` | 仅事件 | `if (timeupdate && media.seeking) return` —— 但文本在读该判断**之前**已更新 | `Date.now()`（仅控件隐藏计时） | 全在 `controls` 单例的 `timeUpdate()` | **无测试** |

来源：
- media-chrome `range-animation.ts` <https://github.com/muxinc/media-chrome/blob/main/src/js/utils/range-animation.ts>、单测 <https://github.com/muxinc/media-chrome/blob/main/test/unit/utils/range-animation.spec.ts>
- video.js 10 `store/features/time.ts` <https://github.com/videojs/video.js/blob/main/packages/core/src/core/store/features/time.ts>、测试「timeupdate during seek does not overwrite optimistic currentTime」<https://github.com/videojs/video.js/blob/main/packages/core/src/dom/store/features/tests/time.test.ts>
- video.js 10 `media/src/core/predicate.ts`（时长解析）<https://github.com/videojs/video.js/blob/main/packages/media/src/core/predicate.ts>
- Vidstack `providers/html/html–media-events.ts`、`core/api/player-state.ts` <https://github.com/vidstack/player/blob/main/packages/vidstack/src/providers/html/html%E2%80%93media-events.ts>
- Plyr `src/js/controls.js` <https://github.com/sampotts/plyr/blob/v3.8.5/src/js/controls.js>

未找到：react-player 与 hls.js demo UI 的对应实现（未取证，不推测）。

**从这一层得到的四条**：
- **1 Hz 采样必须插值**：video.js 10 与 Vidstack 的"原值直读"依赖 ≥60Hz rAF 采样；照抄会看到跳跃。我们的场景对应 media-chrome 路线。
- **插值 + 单调守卫放在独立 module**（media-chrome `range-animation.ts`），组件只负责"喂参数 + 写值"。
- **latch 属于状态层，且不用超时**（video.js 10：seek 期间丢弃旧事件，`seeked` 收口）。用时长阈值兜底的是老版 video.js 8。
- **反例是 Plyr**：判断写在 600 行的 `controls.timeUpdate()` 里、文本更新在门禁之前、无测试——正是我们 `client.js` 今天的形状。

---

## 2. 播放内核：时间由谁算

| 项目 | 时间接口 | 更新粒度 | 谁插值 | seek 语义 | 已知坑 |
|---|---|---|---|---|---|
| **mpv** | `time-pos`（double 秒，别名 `playback-time`）/ `percent-pos` / `time-remaining`；毫秒格式只走 `time-pos/full` | 每轮 playloop 用「最后写入 PTS − `ao_get_delay()`」重算；纯音频 tick 间隔 ≥50ms | 内核不插值；OSC 监听 `playback-time` + `tick_delay=1/60` 节流重绘 | `playback_pts` 无效时 `get_current_time()` 返回 `last_seek_pts`；`mp_seek()` 后立即发 TICK → **立刻读到目标值**，不是旧值 | 同一 playloop 迭代内重复读得同值；`duration` 未知时 `percent-pos` 不可用，PRINT 还会取整 |
| **VLC / libvlc** | `libvlc_media_player_get_time()` → int64 ms，无 input 线程返回 −1 | `MainLoopStatistics()` 被 `i_intf_update` 限流到 **4 Hz**（250ms），值取 `DEMUX_GET_TIME` | 客户端；`TimeChanged`/`PositionChanged` 在同一 tick 连发 | `set_time` 只写变量，真正 seek 由输入线程执行，缓冲期最多推迟 125ms | set 后立即 get 仍是旧值，只能以事件为准 |
| **MPD** | `status` 的 `elapsed`（`{:1.3f}` 秒）/ `duration` / `time`（整数秒） | **按需**：每次 `status` 同步 REFRESH 现算（含 AO 延迟），无定时缓存 | 客户端；ncmpcpp 1 Hz 取、截断到秒、不插值 | `SeekDecoder()` 里 `elapsed_time=seek_time` 立刻置目标 | 每次 status 一次线程往返（阻塞），高频轮询有成本 |
| **foobar2000** | `play_callback::on_playback_time(double)`；`playback_get_position()` | 文档原文 "Called every second, for time display" → 1 s | 应用层自己 | `on_playback_seek(double)` 单独通知 | 秒级回调 + 无插值 = 进度条按秒跳 |

来源：
- mpv `player/command.c`（`time-pos`=`get_playback_time()`，`percent-pos`=`get_current_pos_ratio()*100`）<https://raw.githubusercontent.com/mpv-player/mpv/master/player/command.c>
- mpv `player/playloop.c`（`get_current_time` / `last_seek_pts` / `handle_dummy_ticks`）<https://raw.githubusercontent.com/mpv-player/mpv/master/player/playloop.c>
- mpv `player/audio.c`（`playing_audio_pts`）<https://raw.githubusercontent.com/mpv-player/mpv/master/player/audio.c>
- mpv `player/lua/osc.lua`（OSC 的 1/60 节流重绘）<https://raw.githubusercontent.com/mpv-player/mpv/master/player/lua/osc.lua>
- VLC `lib/media_player.c`、`src/input/input.c`（250 000 µs 限流）、`lib/libvlc_internal.h` <https://raw.githubusercontent.com/videolan/vlc/3.0.x/lib/media_player.c>
- MPD `src/command/PlayerCommands.cxx`、`src/player/Control.cxx`、`src/player/Thread.cxx` <https://raw.githubusercontent.com/MusicPlayerDaemon/MPD/master/src/player/Thread.cxx>
- ncmpcpp `src/status.cpp` <https://raw.githubusercontent.com/ncmpcpp/ncmpcpp/master/src/status.cpp>
- foobar2000 SDK `play_callback.h` <https://chocobo1.github.io/fb2k_doc/SDK-2015-08-03/doxygen/d2/d97/play__callback_8h_source.html>

未找到：foobar2000 `playback_get_position()` 的返回值精度（SDK 头无注释）。

---

## 3. 服务端持有状态、浏览器显示的播放器

| 项目 | 获取方式 | 时间戳语义 | 谁插值 | seek | 依据 |
|---|---|---|---|---|---|
| **Navidrome + Feishin / Sonixd / substreamer** | 音频在客户端本地；Feishin 每 500ms 读本地钟 | `getNowPlaying` 只有 `minutesAgo`；OpenSubsonic `playbackReport` 扩展才加 `positionMs`，**无采样时刻** | 客户端（本地钟） | 乐观，本地即权威 | [OS getNowPlaying](https://opensubsonic.github.io/docs/endpoints/getnowplaying/)、[playbackReport](https://opensubsonic.github.io/docs/extensions/playbackreport/)、[timestamp.store.ts](https://github.com/jeffvli/feishin/blob/development/src/renderer/store/timestamp.store.ts) |
| **Jellyfin web** | 播放端每 **10s** POST `/Sessions/Playing/Progress`；观察端走 WS 推送 | 只有 `PositionTicks`，无采样时刻 | 不插值，10s 一跳 | 立即上报 | [playbackmanager.js](https://github.com/jellyfin/jellyfin-web/blob/master/src/components/playback/playbackmanager.js)、[remotecontrol.js](https://github.com/jellyfin/jellyfin-web/blob/master/src/components/remotecontrol/remotecontrol.js) |
| **Plex** | 客户端 POST `/:/timeline`（`state` + `time`/ms）；观察端读 `/status/sessions` | 位置快照，无采样时刻 | 播放端原生时钟；观察端粗粒度 | 立即上报 | [developer.plex.tv/pms](https://developer.plex.tv/pms/) |
| **Spotify Web Playback SDK** | `player_state_changed` + `getCurrentState()` | **`position` 与 `timestamp` 在同一对象** | 客户端 | `seek(ms)` 后等新 state | [WPS reference](https://developer.spotify.com/documentation/web-playback-sdk/reference)、[@types 定义](https://unpkg.com/@types/spotify-web-playback-sdk/index.d.ts) |
| **YouTube IFrame API** | `getCurrentTime()` 主动拉 | 只有秒数，无时间戳 | 客户端轮询 | `seekTo()` | [iframe_api_reference](https://developers.google.com/youtube/iframe_api_reference) |
| **Home Assistant（前端）** | 实体属性 `media_position` + `media_position_updated_at` | **位置 + 采样时刻** | 客户端，**导出纯函数** `getCurrentProgress(stateObj)` | 等新属性 | [media-player.ts:238](https://github.com/home-assistant/frontend/blob/dev/src/data/media-player.ts) |

Home Assistant 的实现原文（2026-11-13 拉取）：

```ts
export const getCurrentProgress = (stateObj: MediaPlayerEntity): number => {
  let progress = stateObj.attributes.media_position!;
  if (stateObj.state !== "playing") return progress;
  progress +=
    (Date.now() - new Date(stateObj.attributes.media_position_updated_at!).getTime()) / 1000.0;
  // Prevent negative values, so we do not go back to 59:59 at the start
  // for example if there are slight clock sync deltas between backend and frontend and
  // therefore media_position_updated_at might be slightly larger than Date.now().
  return progress < 0 ? 0 : progress;
};
```

---

## 4. 跨三层的模式

1. **权威位置永远来自一端，平滑永远来自另一端。** 内核（mpv/VLC/MPD/fb2k）和协议（Jellyfin/Plex/Subsonic）都只给跳变值，补间在 UI。
2. **「值 + 采样时刻」是少数派但更严谨的一档**：Spotify（`position` + `timestamp`）、Home Assistant（`media_position_updated_at`）。OpenSubsonic / Jellyfin / Plex 连采样时刻都没有，订阅端只能把"收到时刻"当采样时刻，或者干脆不补间。
3. **没有一家用推送换平滑**：Jellyfin 10s、fb2k 1s、VLC 4Hz、mpv ≥50ms tick —— 平滑是客户端的责任。
4. **插值规则确实会被抽成纯函数**：Home Assistant 前端就是导出函数，输入「属性 + 当前时刻」，非 `playing` 直接返回原值，负值夹 0。这不是我们发明的洁癖。
5. **负值夹取不是可选装饰**：HA 的注释写明它防的是"前后端时钟小偏差导致从 59:59 倒退"，是真实踩过的坑。
6. **latch 属于状态层，不用时长阈值兜底**：video.js 10 在 seek 期间丢弃旧事件、`seeked` 收口；老版 video.js 8 才用 `pendingSeekTime` + 事件清空。用 `1600ms/900ms` 这种时长阈值判新旧，是 8 时代的形状。
7. **反例的形状就是我们今天的形状**：Plyr 把规则写在 600 行 `controls.timeUpdate()` 里、无测试；`client.js` 今天也是把 `estimateMs`、夹取、seek latch 散在渲染函数里。

---

## 5. 对本项目的推论

1. **架构方向对**：1 Hz 拉快照 + 客户端补间，与 VLC 4 Hz / fb2k 1 s / Jellyfin 10 s 同类；不需要改传输层。mpv 的 `time-pos` 是 double 秒且每次现算，1 Hz 采样不丢精度，只丢 ≤50ms 的时点对齐。
2. **必须换单调时钟**：mpv 的值由「写入 PTS − AO 延迟」推算，暂停/欠载会抖。客户端应用 `performance.now()` 建锚点，禁用 `Date.now()`（我们目前 `Date.now()` ×7、`performance.now()` ×0）。media-chrome 用的正是 `performance.now()`。
3. **我们已知一个会出错的规则**：`estimateMs` 在 `duration > 0` 时只夹上界，时钟往回跳就产出负位置——正是 HA 注释里那个场景。**没有测试，所以一直没被抓到。**
4. **seek 的"防回弹"应改判新旧，不该判时长**：mpv 在 seek 后立即返回目标值，真正的旧数据来自我们自己 1 Hz 轮询里已经在途的那个快照。用「快照的采样时刻 ≥ seek 回报的采样时刻」取代 `1600ms / 900ms` 两个魔法数字。
5. **不要传 `percent-pos`**：`duration` 未知时不可用，且打印会取整。
6. **换引擎的契约只需「值 + 采样时刻」**：VLC 4 Hz、fb2k 1 s 说明平滑必须留在客户端。
7. **落点按业界共识**：插值规则进独立 module（media-chrome `range-animation.ts`）或状态层（video.js `timeFeature`），**不留在渲染组件里**。这是本仓库 Q2 的问题，也是唯一一处需要为"无构建"付代价的地方。

---

## 6. 结论

**"插值抽成纯函数"在本项目成立，理由不是审美，是三条独立先例 + 一个已知缺陷**：
media-chrome `range-animation.ts`（独立类 + 单测）、video.js 10 `timeFeature/TimeCore`（状态层 + 28 例）、
Home Assistant `getCurrentProgress`（导出函数 + 注释解释夹取原因）；而我们自己的 `estimateMs` 缺下界夹取、0 测试。

**落点三选一**（用户裁定，见 D-02）：

| 选项 | 形状 | 代价 | 判断 |
|---|---|---|---|
| (a) | `lib/shared/playhead.mjs` + 脚本内联进 `client.js` + 内容一致性守卫 | 一段勿手改区、一个脚本、`check` 多一步、D-02 改措辞 | **推荐**：模块作用域由语言保证，取不到闭包变量 |
| (b) | `client.js` 内划"纯源码区"，测试用 `node:vm` 执行该区 | 无生成步骤；但隔离靠守卫的正则，不是语言 | 次选：省事，但"标记即 interface" |
| (c) | 不抽，只补测试 | 零工具链增量 | 不成立：没有 seam 就没有地方放测试 |

