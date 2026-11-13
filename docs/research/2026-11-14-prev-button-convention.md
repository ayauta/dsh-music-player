# 「上一首」按钮的行业约定（2026-11-14）

> 目的：回答"暂停时点上一首，iOS / Spotify 到底做什么"，以及"我们现在的行为是否与 iOS 一致"。
> 结论分两栏：**有来源支持的** 与 **查不到、只能标未验证的**。所有链接访问日期 2026-11-14。

## 0. 一句话

**有来源支持的部分**：Apple Music 与 Spotify 的「上一首」是**点一次重播当前曲、再点一次回上一曲**，
"刚播放几秒内"才直接回上一曲（阈值被分别报告为 3 秒与 5 秒）。
**查不到的部分**：**两者在"暂停状态"下的行为没有任何一手来源**——本节不做推测。

## 1. 有来源支持的

| 来源 | 它说了什么 | 层级 |
|---|---|---|
| [优设：同一个按钮设计，为什么网易云音乐和 Apple Music 大相径庭](https://www.uisdc.com/button-design-2)（2020-03-09） | 「国外的产品中，点击「后退/上一首」按钮即从头播放当前歌曲，再点击一次才会回到上一首，**例如 Apple Music，Spotify**」；并给出原因：磁带时代每首歌有"锚点"，回退按钮的语义是**回到本曲起点** | 二手（设计评论），但对"两家都如此"是明确陈述 |
| [ION HowTo：How to Skip Songs in Apple Music on iPhone](https://www.ionhowto.com/how-to-skip-songs-in-apple-music-on-iphone/)（2026-11-11） | 「Tap the Backward arrow button … **once to replay the current track from the beginning**」「**Double-tap** … twice to jump back to the preceding track」 | 二手（教程），与上一条一致 |
| [r/AppleMusic：Why is the "previous track button" designed to rewind the song…](https://www.reddit.com/r/AppleMusic/comments/134m6b7/)（2023-05-01） | iOS Apple Music「usually only jumps to the beginning of the current song (**unless it's been played for less than 3 seconds**)」 | 用户报告（3 秒阈值的依据） |
| [V2EX：听歌时点"上一首"左箭头后是同一首歌从头开始](https://www.v2ex.com/t/1013045)（2024-01-31） | 「原生音乐程序改不了，硬件按钮从 iPod 时代就是这样，**除非这首歌刚播放了五秒以内**，点击就是上一首」；另有回复指出 AirPods 的三击=上一曲按钮、Apple Music 需要六击（即连点两次） | 用户报告（5 秒阈值的依据；与上一条冲突） |
| [r/truespotify](https://www.reddit.com/r/truespotify/comments/1hnbxdy/)（2024-12-27） | Spotify 用户：「a million times I've had to **double tap**」——重播/回退要靠连点两次 | 用户报告 |
| [r/CarPlay：Spotify "Previous Track" Button](https://www.reddit.com/r/CarPlay/comments/djstit/)（2019-10-18） | **反例**：Spotify 在 CarPlay 上「does not restart the track … but instead goes to the previous track no matter how much time has」 | 用户报告 → **Spotify 的行为是分平台的，不存在"全平台统一"** |

**阈值不一致**：3 秒（r/AppleMusic）vs 5 秒（V2EX，含硬件键）。两者都是用户体感，没有官方文档；本项目取 3000ms。

## 2. 查不到的（不推测）

- **苹果在"暂停"时点上一首**：是否仍重播？**没有任何来源**。Apple 官方页
  [Use the music player controls on iPhone](https://support.apple.com/guide/iphone/use-the-music-player-controls-iph676daac9b/ios)
  只描述播放/暂停与 MiniPlayer 用法，不描述上一首的规则。
- **Spotify 在"暂停"时点上一首**：同样无来源（且它分平台，CarPlay 与 App 已不同）。
- [Apple Community「Apple Music Restarting After Pause」](https://discussions.apple.com/thread/253644181) 与
  Reddit 原帖正文均被"验证你是人类"拦截，**未能读到正文**——不以标题推断内容。

## 3. 对我们（dsh-music）的含义

清单元事实：`prev()` 的规则是 `if (state.positionMs > 3000) → seek(0)`（`lib/host/player.js`）。

| 维度 | Apple Music（有来源部分） | 我们 | 一致？ |
|---|---|---|---|
| 播放中、>阈值 | 点一次重播本曲 | 点一次 `seek(0)` | **一致（结果）** |
| 播放中、<阈值 | 点一次直接上一曲 | `positionMs ≤ 3000` → `jumpTo(prev)` | **一致（结果）** |
| 机制 | **连续点击计数**（双击窗口） | **位置阈值**（无点击窗口） | 机制不同，结果相同 |
| 暂停时 | **无来源** | 仍按位置阈值重播 | **未验证** |
| 阈值 | 3s / 5s（两种用户报告） | 3s | 取值在两者之间，无官方依据 |
| 分平台一致性 | Spotify 在 CarPlay 上**不**重播 | 我们只有一个平台 | 参考价值有限 |

**因此**：上一轮那句"iOS/Spotify 都这样，包括暂停时"是**过度概括**——第二半句没有证据。
能站住的表述是：*"点一次重播、再点一次回上一曲"这一约定有来源支持（Apple Music、Spotify 皆然，
Spotify 有平台例外）；暂停时的行为查不到，未验证。*

## 4. 若要偏离，就要写明是偏离

- 保持现状 = 与"有来源支持的那部分"一致；暂停时的观感（进度条跳回 0、没有声音解释）是**约定的副作用**，
  不是缺陷。
- 改成"暂停时直接上一曲" = **有意的偏离**，理由是"重播的意义是听觉上的重置，静音时不存在"。
  这条理由是设计判断，**不能引用 iOS 做背书**。
- 复刻 iOS 的机制（双击窗口）= 更接近原约定，但会重新引入手势/连击判定（D-28 刚把所有键位删掉，
  鼠标双击窗口属于新增交互模式，需走 `AGENTS.md` §16 五步）。
