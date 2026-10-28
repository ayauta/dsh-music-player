/**
 * DSH Music — Client half.
 *
 * Renders inside the Harness Web UI through official slots only:
 *   sidebar.footer.action → MiniPlayer
 *   sidebar.panellist     → PanelGlyph (opens the `music` main panel)
 *   main (key `music`)    → LibraryPage
 *   shell.overlay         → NowPlaying (modal sheet, opens above everything)
 *   settings.section      → SettingsPage
 *
 * Rules this file follows:
 *  - Only `--dsw-alias-*` / `--dsw-specific-*` theme tokens for surfaces and text.
 *  - Progress animates through `requestAnimationFrame` writing a CSS variable, so a
 *    moving playhead never re-renders the tree.
 *  - Every icon-only control carries an aria-label; every control is keyboard reachable.
 *  - Nothing is appended to document.body except the package stylesheet, which is
 *    removed when the plugin unloads.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-music',
  factory(require) {
    const React = require('react')
    const {
      useState, useEffect, useRef, useMemo, useCallback, useSyncExternalStore,
    } = React
    const h = React.createElement

    /* ────────────────────────────── 1. text ────────────────────────────── */

    const NS = 'dsh-music'
    const zh = {
      'panel.label': '音乐',
      'mini.empty': '音乐库',
      'mini.open': '打开正在播放',
      'mini.play': '播放',
      'mini.pause': '暂停',
      'mini.prev': '上一首',
      'mini.next': '下一首',
      'np.title': '正在播放',
      'np.close': '关闭',
      'np.queue': '播放队列',
      'np.library': '音乐库',
      'np.lyrics': '歌词',
      'np.details': '文件与规格',
      'np.noLyrics': '没有歌词文件',
      'np.untimed': '未同步歌词（无时间码）',
      'np.mode.one': '单曲循环',
      'np.mode.all': '列表循环',
      'np.mode.shuffle': '随机播放',
      'np.volume': '音量',
      'np.mute': '静音',
      'np.unmute': '取消静音',
      'np.seek': '播放进度',
      'lib.all': '全部歌曲',
      'lib.folders': '文件夹',
      'lib.albums': '专辑',
      'lib.artists': '艺术家',
      'lib.playlists': '播放列表',
      'lib.favorites': '收藏',
      'lib.recent': '最近添加',
      'lib.search': '搜索歌曲、文件名、专辑、文件夹',
      'lib.sort': '排序',
      'lib.sort.default': '默认',
      'lib.sort.title': '标题',
      'lib.sort.artist': '艺术家',
      'lib.sort.album': '专辑',
      'lib.sort.duration': '时长',
      'lib.sort.added': '添加时间',
      'lib.density.compact': '紧凑',
      'lib.density.comfortable': '舒适',
      'lib.addFolder': '添加文件夹',
      'lib.rescan': '重新扫描',
      'lib.empty.title': '音乐库是空的',
      'lib.empty.body': '添加一个本地音乐文件夹，文件只读取，不会被移动或改名。',
      'lib.empty.search': '没有匹配的歌曲',
      'lib.loading': '正在载入…',
      'lib.tracks': '首',
      'lib.unknownArtist': '未识别艺术家',
      'lib.playAll': '播放全部',
      'lib.shuffleAll': '随机播放全部',
      'lib.back': '返回',
      'ctx.playNow': '立即播放',
      'ctx.playNext': '下一首播放',
      'ctx.enqueue': '添加到队列末尾',
      'ctx.addToPlaylist': '添加到播放列表',
      'ctx.favorite': '收藏',
      'ctx.unfavorite': '取消收藏',
      'ctx.reveal': '显示文件位置',
      'ctx.edit': '编辑显示信息',
      'ctx.cover': '设置封面',
      'ctx.remove': '从音乐库移除',
      'ctx.removeHint': '只从索引移除，不会删除硬盘文件',
      'ctx.noPlaylists': '还没有播放列表',
      'edit.title': '编辑显示信息',
      'edit.name': '歌曲名',
      'edit.artist': '艺术家',
      'edit.album': '专辑',
      'edit.year': '年份',
      'edit.save': '保存',
      'edit.clear': '清除覆盖',
      'edit.cancel': '取消',
      'edit.hint': '只写入音乐库数据库，不改动音频文件。',
      'set.title': '设置',
      'set.library': '音乐库',
      'set.playback': '播放',
      'set.audio': '音频',
      'set.appearance': '外观',
      'set.advanced': '高级',
      'set.roots': '扫描目录',
      'set.noRoots': '还没有添加目录',
      'set.remove': '移除目录',
      'set.rescan': '扫描',
      'set.defaultVolume': '默认音量',
      'set.restore': '启动时恢复上次队列',
      'set.restoreHint': '恢复队列但保持暂停，不会自动出声。',
      'set.engine': '播放引擎',
      'set.engineMpv': '独立 mpv 进程',
      'set.engineBrowser': '浏览器音频（降级）',
      'set.exclusive': '独占输出（实验）',
      'set.exclusiveHint': '失败会自动回落到共享输出。共享模式下系统混音器会转换格式。',
      'set.output': '当前输出',
      'set.specs': '规格',
      'set.density': '列表密度',
      'set.miniProgress': '迷你播放器显示进度线',
      'set.diag': '引擎状态与日志',
      'set.backup': '备份数据库',
      'set.clearCache': '清理缓存',
      'set.reload': '重新载入',
      'spec.source': '源文件',
      'spec.decoded': '解码后的 PCM',
      'spec.device': '设备输出',
      'spec.deviceUnknown': '由系统混音器决定',
      'spec.container': '容器',
      'spec.codec': '编码',
      'spec.claim': '文件名标注',
      'spec.measured': '实测',
      'spec.match': '与实测一致',
      'spec.mismatch': '与实测不一致',
      'spec.artist': '艺术家',
      'spec.todo': '待识别',
      'queue.empty': '队列是空的',
      'queue.clear': '清空待播放',
      'queue.remove': '从队列移除',
      'state.engineDown': '音频引擎未运行',
      'state.noTrack': '未在播放',
      'common.save': '保存',
      'common.cancel': '取消',
      'common.close': '关闭',
      'common.confirm': '确定',
      'common.retry': '重试',
      'common.playlists': '播放列表',
      'common.newPlaylist': '新建播放列表',
      'common.name': '名称',
      'common.more': '更多操作',
    }
    const en = {
      'panel.label': 'Music',
      'mini.empty': 'Music library',
      'mini.open': 'Open Now Playing',
      'mini.play': 'Play',
      'mini.pause': 'Pause',
      'mini.prev': 'Previous',
      'mini.next': 'Next',
      'np.title': 'Now Playing',
      'np.close': 'Close',
      'np.queue': 'Play queue',
      'np.library': 'Library',
      'np.lyrics': 'Lyrics',
      'np.details': 'File & format',
      'np.noLyrics': 'No lyric file',
      'np.untimed': 'Untimed lyrics',
      'np.mode.one': 'Repeat one',
      'np.mode.all': 'Repeat all',
      'np.mode.shuffle': 'Shuffle',
      'np.volume': 'Volume',
      'np.mute': 'Mute',
      'np.unmute': 'Unmute',
      'np.seek': 'Playback position',
      'lib.all': 'Songs',
      'lib.folders': 'Folders',
      'lib.albums': 'Albums',
      'lib.artists': 'Artists',
      'lib.playlists': 'Playlists',
      'lib.favorites': 'Favorites',
      'lib.recent': 'Recently added',
      'lib.search': 'Search songs, filenames, albums, folders',
      'lib.sort': 'Sort',
      'lib.sort.default': 'Default',
      'lib.sort.title': 'Title',
      'lib.sort.artist': 'Artist',
      'lib.sort.album': 'Album',
      'lib.sort.duration': 'Duration',
      'lib.sort.added': 'Date added',
      'lib.density.compact': 'Compact',
      'lib.density.comfortable': 'Comfortable',
      'lib.addFolder': 'Add folder',
      'lib.rescan': 'Rescan',
      'lib.empty.title': 'Your library is empty',
      'lib.empty.body': 'Add a local music folder. Files are read only — never moved or renamed.',
      'lib.empty.search': 'No matching songs',
      'lib.loading': 'Loading…',
      'lib.tracks': 'tracks',
      'lib.unknownArtist': 'Unknown artist',
      'lib.playAll': 'Play all',
      'lib.shuffleAll': 'Shuffle all',
      'lib.back': 'Back',
      'ctx.playNow': 'Play now',
      'ctx.playNext': 'Play next',
      'ctx.enqueue': 'Add to queue',
      'ctx.addToPlaylist': 'Add to playlist',
      'ctx.favorite': 'Favorite',
      'ctx.unfavorite': 'Remove favorite',
      'ctx.reveal': 'Show file location',
      'ctx.edit': 'Edit details',
      'ctx.cover': 'Set cover',
      'ctx.remove': 'Remove from library',
      'ctx.removeHint': 'Index only — the file stays on disk',
      'ctx.noPlaylists': 'No playlists yet',
      'edit.title': 'Edit details',
      'edit.name': 'Title',
      'edit.artist': 'Artist',
      'edit.album': 'Album',
      'edit.year': 'Year',
      'edit.save': 'Save',
      'edit.clear': 'Clear override',
      'edit.cancel': 'Cancel',
      'edit.hint': 'Stored in the library database only; audio files are untouched.',
      'set.title': 'Music settings',
      'set.library': 'Library',
      'set.playback': 'Playback',
      'set.audio': 'Audio',
      'set.appearance': 'Appearance',
      'set.advanced': 'Advanced',
      'set.roots': 'Scan folders',
      'set.noRoots': 'No folder added yet',
      'set.remove': 'Remove folder',
      'set.rescan': 'Scan',
      'set.defaultVolume': 'Default volume',
      'set.restore': 'Restore last queue on launch',
      'set.restoreHint': 'Restores the queue paused — never starts playback by itself.',
      'set.engine': 'Engine',
      'set.engineMpv': 'Isolated mpv process',
      'set.engineBrowser': 'Browser audio (fallback)',
      'set.exclusive': 'Exclusive output (experimental)',
      'set.exclusiveHint': 'Falls back to shared output on failure. Shared mode converts through the system mixer.',
      'set.output': 'Current output',
      'set.specs': 'Format',
      'set.density': 'List density',
      'set.miniProgress': 'Show progress line in the mini player',
      'set.diag': 'Engine state & logs',
      'set.backup': 'Back up database',
      'set.clearCache': 'Clear cache',
      'set.reload': 'Reload',
      'spec.source': 'Source file',
      'spec.decoded': 'Decoded PCM',
      'spec.device': 'Device output',
      'spec.deviceUnknown': 'Decided by the system mixer',
      'spec.container': 'Container',
      'spec.codec': 'Codec',
      'spec.claim': 'Filename claim',
      'spec.measured': 'Measured',
      'spec.match': 'matches measurement',
      'spec.mismatch': 'does not match measurement',
      'spec.artist': 'Artist',
      'spec.todo': 'Unidentified',
      'queue.empty': 'The queue is empty',
      'queue.clear': 'Clear upcoming',
      'queue.remove': 'Remove from queue',
      'state.engineDown': 'Audio engine is not running',
      'state.noTrack': 'Nothing playing',
      'common.save': 'Save',
      'common.cancel': 'Cancel',
      'common.close': 'Close',
      'common.confirm': 'Confirm',
      'common.retry': 'Retry',
      'common.playlists': 'Playlists',
      'common.newPlaylist': 'New playlist',
      'common.name': 'Name',
      'common.more': 'More actions',
    }

    let translate = (key) => key
    const t = (key) => {
      const value = translate(key)
      return typeof value === 'string' && value !== '' ? value : key
    }

    /* ────────────────────────────── 2. styles ───────────────────────────── */

    const CSS = `
.dshm { color: var(--dsw-alias-label-primary); font-family: inherit; }
.dshm *, .dshm *::before, .dshm *::after { box-sizing: border-box; }
.dshm button { font: inherit; color: inherit; }

/* mini player */
.dshm-mini { display: flex; align-items: center; gap: 8px; width: 100%; min-width: 0;
  padding: 4px 6px 5px; border-radius: 8px; background: transparent; border: 0; text-align: left; }
.dshm-mini[data-interactive="true"] { cursor: default; }
.dshm-mini:hover { background: color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent); }
.dshm-mini-info { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1 1 auto;
  background: transparent; border: 0; padding: 0; text-align: left; cursor: pointer; }
.dshm-mini-title { font-size: 12.5px; font-weight: 600; line-height: 1.25; letter-spacing: .005em;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.dshm-mini-sub { font-size: 11.5px; line-height: 1.25; color: var(--dsw-alias-label-secondary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dshm-mini-cover { border: 0; padding: 0; background: transparent; border-radius: 6px; cursor: pointer; flex: none; }
.dshm-mini-controls { display: flex; align-items: center; gap: 1px; flex: none; }
.dshm-mini-progress { position: absolute; left: 6px; right: 6px; bottom: 0; height: 2px; border-radius: 1px;
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 10%, transparent); overflow: hidden; }
.dshm-mini-progress > i { display: block; height: 100%; width: 100%; transform-origin: left center;
  transform: scaleX(var(--p, 0)); background: var(--dsw-alias-label-secondary); }
.dshm-mini-wrap { position: relative; padding-bottom: 3px; }
.dshm-mini-rail { display: flex; flex-direction: column; align-items: center; gap: 4px; }

/* icon buttons */
.dshm-ib { display: inline-grid; place-items: center; width: 26px; height: 26px; border-radius: 7px;
  border: 0; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; flex: none;
  transition: background 120ms ease, color 120ms ease; }
.dshm-ib:hover { color: var(--dsw-alias-label-primary);
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent); }
.dshm-ib[data-active="true"] { color: var(--dsw-alias-brand-primary);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); }
.dshm-ib[data-variant="primary"] { color: var(--dsw-alias-label-primary); }
.dshm-ib[data-size="lg"] { width: 40px; height: 40px; border-radius: 10px; }
.dshm-ib[data-size="xl"] { width: 48px; height: 48px; border-radius: 50%; color: var(--dsw-alias-label-primary); }
.dshm-ib[data-size="xl"]:hover { background: color-mix(in srgb, var(--dsw-alias-label-primary) 10%, transparent); }
.dshm-ib:disabled { opacity: .38; cursor: default; }
.dshm-ib:focus-visible, .dshm-focusable:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }

/* cover */
.dshm-cover { position: relative; overflow: hidden; background: var(--dsw-alias-bg-layer-2);
  display: grid; place-items: center; flex: none; }
.dshm-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
.dshm-cover-ph { width: 100%; height: 100%; display: grid; place-items: center;
  color: var(--dsw-alias-label-secondary); opacity: .42;
  background: linear-gradient(180deg, color-mix(in srgb, var(--dsw-alias-label-primary) 5%, var(--dsw-alias-bg-layer-2)) 0%,
    var(--dsw-alias-bg-layer-2) 100%); }

/* now playing sheet */
.dshm-backdrop { position: fixed; inset: 0; z-index: 70; display: flex; align-items: center; justify-content: center;
  background: color-mix(in srgb, #000 34%, transparent); animation: dshm-fade 160ms ease-out; }
.dshm-sheet { width: min(420px, 92vw); max-height: min(680px, 88vh); display: flex; flex-direction: column;
  background: var(--dsw-alias-bg-overlay); border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 18px; box-shadow: 0 24px 64px rgba(0,0,0,.30); overflow: hidden;
  animation: dshm-rise 180ms cubic-bezier(.2,.8,.3,1); }
.dshm-sheet-head { display: flex; align-items: center; gap: 8px; padding: 10px 12px 6px; flex: none; }
.dshm-sheet-title { font-size: 12px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase;
  color: var(--dsw-alias-label-secondary); flex: 1 1 auto; text-align: center; }
.dshm-sheet-body { overflow: auto; padding: 4px 20px 18px; }
.dshm-np-art { width: min(100%, 300px); max-height: 38vh; aspect-ratio: 1 / 1; margin: 0 auto;
  border-radius: 12px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,.18); }
.dshm-np-meta { padding: 14px 2px 2px; min-width: 0; }
.dshm-np-title { font-size: 17px; font-weight: 600; line-height: 1.3; letter-spacing: -.005em;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dshm-np-sub { font-size: 12.5px; color: var(--dsw-alias-label-secondary); margin-top: 2px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dshm-times { display: flex; justify-content: space-between; font-size: 11px; font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-secondary); margin-top: 6px; }
.dshm-track { position: relative; height: 20px; display: flex; align-items: center; cursor: pointer; }
.dshm-track-rail { position: relative; width: 100%; height: 3px; border-radius: 2px;
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 14%, transparent); overflow: hidden; }
.dshm-track-rail > i { display: block; height: 100%; width: 100%; transform-origin: left center;
  transform: scaleX(var(--p, 0)); background: var(--dsw-alias-label-primary); }
.dshm-track:hover .dshm-track-rail { height: 4px; }
.dshm-transport { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 6px 0 2px; }
.dshm-extras { display: flex; align-items: center; gap: 4px; padding-top: 6px; }
.dshm-extras-spacer { flex: 1 1 auto; }
.dshm-vol { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; width: 148px; min-width: 0; }
.dshm-vol .dshm-track { flex: 1 1 auto; height: 18px; }
.dshm-vol .dshm-track-rail { height: 3px; }
.dshm-vol .dshm-track-rail > i { background: var(--dsw-alias-label-secondary); }
.dshm-foot { display: flex; align-items: center; gap: 4px; padding: 4px 12px 10px; flex: none;
  border-top: 1px solid var(--dsw-alias-border-l1); }
.dshm-foot-spacer { flex: 1 1 auto; }
.dshm-disclose { border: 0; background: transparent; color: var(--dsw-alias-label-secondary);
  font-size: 12px; padding: 6px 8px; border-radius: 7px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; }
.dshm-disclose:hover { color: var(--dsw-alias-label-primary);
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent); }

/* spec list */
.dshm-kv { display: grid; grid-template-columns: 88px 1fr; gap: 4px 10px; font-size: 12px; padding: 8px 2px 2px; }
.dshm-kv dt { color: var(--dsw-alias-label-secondary); }
.dshm-kv dd { margin: 0; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.dshm-note { font-size: 11.5px; color: var(--dsw-alias-label-secondary); line-height: 1.5; padding: 6px 2px 0; }

/* library page */
.dshm-page { display: flex; height: 100%; min-height: 0; background: var(--dsw-alias-bg-base); }
.dshm-rail { width: 196px; flex: none; padding: 14px 10px; border-right: 1px solid var(--dsw-alias-border-l1);
  overflow: auto; display: flex; flex-direction: column; gap: 2px; }
.dshm-rail-head { font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase;
  color: var(--dsw-alias-label-secondary); padding: 10px 8px 6px; }
.dshm-nav { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 8px; border-radius: 7px;
  border: 0; background: transparent; cursor: pointer; font-size: 13px; color: var(--dsw-alias-label-primary);
  text-align: left; }
.dshm-nav:hover { background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent); }
.dshm-nav[data-active="true"] { background: color-mix(in srgb, var(--dsw-alias-label-primary) 10%, transparent); font-weight: 600; }
.dshm-nav-count { margin-left: auto; font-size: 11px; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
.dshm-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
.dshm-toolbar { display: flex; align-items: center; gap: 8px; padding: 12px 16px; flex-wrap: wrap; flex: none; }
.dshm-h1 { font-size: 17px; font-weight: 600; letter-spacing: -.01em; margin-right: 2px; }
.dshm-count { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dshm-spacer { flex: 1 1 auto; }
.dshm-field { display: flex; align-items: center; gap: 6px; height: 28px; padding: 0 8px; border-radius: 7px;
  border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); min-width: 180px; }
.dshm-field input { border: 0; background: transparent; color: inherit; font-size: 13px; outline: none; width: 100%; }
.dshm-field:focus-within { border-color: var(--dsw-alias-border-l2); }
.dshm-select { height: 28px; border-radius: 7px; border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font-size: 12.5px; padding: 0 6px; }
.dshm-btn { height: 28px; padding: 0 10px; border-radius: 7px; border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font-size: 12.5px;
  cursor: pointer; display: inline-flex; align-items: center; gap: 5px; }
.dshm-btn:hover { background: var(--dsw-alias-bg-layer-2); }
.dshm-btn[data-primary="true"] { background: var(--dsw-alias-brand-primary); border-color: transparent;
  color: var(--dsw-alias-bg-base); }
.dshm-btn[data-destructive="true"] { color: var(--dsw-alias-state-error-primary); }
.dshm-list { flex: 1 1 auto; overflow: auto; padding: 0 8px 24px; }
.dshm-list-head { display: grid; grid-template-columns: 40px minmax(0, 1fr) 132px 132px 60px 84px; gap: 10px; align-items: center;  padding: 4px 10px 6px; font-size: 11px; letter-spacing: .05em; text-transform: uppercase;
  color: var(--dsw-alias-label-secondary); position: sticky; top: 0; z-index: 1;
  background: linear-gradient(var(--dsw-alias-bg-base) 70%, transparent); }
.dshm-colhead { display: inline-flex; align-items: center; gap: 3px; border: 0; background: transparent;
  padding: 2px 3px; margin: -2px -3px; border-radius: 5px; cursor: pointer; font: inherit;
  font-size: 11px; letter-spacing: .05em; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.dshm-colhead:hover { color: var(--dsw-alias-label-primary);
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent); }
.dshm-colhead[aria-sort="ascending"] { color: var(--dsw-alias-label-primary); }
.dshm-colhead.dshm-num { justify-content: flex-end; }
.dshm-row { display: grid; grid-template-columns: 40px minmax(0, 1fr) 132px 132px 60px 84px; gap: 10px; align-items: center;
  padding: 3px 10px; border-radius: 8px; cursor: default; }
.dshm-row[data-density="comfortable"] { padding: 7px 10px; }
.dshm-row:hover { background: color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent); }
.dshm-row[data-active="true"] { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); }
.dshm-row-title { font-size: 13px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dshm-row[data-active="true"] .dshm-row-title { font-weight: 600; }
.dshm-row-sub { font-size: 11.5px; color: var(--dsw-alias-label-secondary); overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; }
.dshm-row-col { font-size: 12px; color: var(--dsw-alias-label-secondary); overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; }
.dshm-num { font-variant-numeric: tabular-nums; text-align: right; }
.dshm-chip { font-size: 10.5px; letter-spacing: .02em; padding: 1px 5px; border-radius: 4px;
  border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary); white-space: nowrap; }
.dshm-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(148px, 1fr)); gap: 14px; padding: 4px 16px 24px; overflow: auto; }
.dshm-card { border: 0; background: transparent; padding: 0; text-align: left; cursor: default; border-radius: 10px; }
.dshm-card:hover .dshm-card-art { filter: brightness(1.03); }
.dshm-card-art { width: 100%; aspect-ratio: 1/1; border-radius: 10px; overflow: hidden; }
.dshm-card-title { font-size: 12.5px; font-weight: 600; margin-top: 8px; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; }
.dshm-card-sub { font-size: 11.5px; color: var(--dsw-alias-label-secondary); overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; }
.dshm-empty { display: grid; place-items: center; gap: 8px; padding: 56px 24px; text-align: center; }
.dshm-empty-title { font-size: 14px; font-weight: 600; }
.dshm-empty-body { font-size: 12.5px; color: var(--dsw-alias-label-secondary); max-width: 42ch; line-height: 1.6; }

/* context menu */
.dshm-menu { position: fixed; z-index: 90; min-width: 208px; padding: 4px; border-radius: 10px;
  background: var(--dsw-alias-bg-overlay); border: 1px solid var(--dsw-alias-border-l1);
  box-shadow: 0 14px 40px rgba(0,0,0,.24); animation: dshm-fade 120ms ease-out; }
.dshm-menu-item { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 8px; border: 0;
  border-radius: 6px; background: transparent; font-size: 12.5px; color: var(--dsw-alias-label-primary);
  cursor: pointer; text-align: left; }
.dshm-menu-item:hover { background: color-mix(in srgb, var(--dsw-alias-label-primary) 9%, transparent); }
.dshm-menu-item[data-destructive="true"] { color: var(--dsw-alias-state-error-primary); }
.dshm-menu-sep { height: 1px; margin: 4px 6px; background: var(--dsw-alias-border-l1); }
.dshm-menu-label { font-size: 10.5px; letter-spacing: .05em; text-transform: uppercase; color: var(--dsw-alias-label-secondary); padding: 6px 8px 3px; }
.dshm-menu-note { font-size: 10.5px; color: var(--dsw-alias-label-secondary); padding: 0 8px 4px; }

/* modal form */
.dshm-modal { position: fixed; inset: 0; z-index: 80; display: grid; place-items: center;
  background: color-mix(in srgb, #000 32%, transparent); }
.dshm-dialog { width: min(360px, 92vw); border-radius: 14px; background: var(--dsw-alias-bg-overlay);
  border: 1px solid var(--dsw-alias-border-l1); box-shadow: 0 24px 60px rgba(0,0,0,.28); padding: 16px; }
.dshm-dialog h2 { font-size: 14px; font-weight: 600; margin: 0 0 12px; }
.dshm-form { display: grid; gap: 10px; }
.dshm-form label { display: grid; gap: 4px; font-size: 11.5px; color: var(--dsw-alias-label-secondary); }
.dshm-form input { height: 28px; border-radius: 7px; border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); padding: 0 8px; font-size: 13px; }
.dshm-dialog-foot { display: flex; gap: 8px; justify-content: flex-end; margin-top: 14px; }

/* settings */
.dshm-settings { padding: 4px 2px 28px; max-width: 720px; }
.dshm-set-group { padding: 14px 0; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.dshm-set-group:last-child { border-bottom: 0; }
.dshm-set-title { font-size: 13px; font-weight: 600; margin: 0 0 8px; }
.dshm-set-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; font-size: 13px; }
.dshm-set-row-label { min-width: 0; flex: 1 1 auto; }
.dshm-set-row-hint { font-size: 11.5px; color: var(--dsw-alias-label-secondary); line-height: 1.5; }
.dshm-root { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 7px;
  background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1); margin-bottom: 6px; }
.dshm-root-path { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; direction: ltr; }
.dshm-logs { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; line-height: 1.55;
  background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px;
  padding: 8px 10px; max-height: 180px; overflow: auto; white-space: pre-wrap; color: var(--dsw-alias-label-secondary); }
.dshm-toggle { appearance: none; width: 34px; height: 20px; border-radius: 10px; border: 0; padding: 0;
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 22%, transparent); position: relative; cursor: pointer; flex: none; }
.dshm-toggle::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px;
  border-radius: 50%; background: var(--dsw-alias-bg-base); transition: transform 140ms ease; }
.dshm-toggle[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
.dshm-toggle[aria-checked="true"]::after { transform: translateX(14px); }

/* lyrics */
.dshm-lyrics { padding: 8px 2px 12px; max-height: 220px; overflow: auto; }
.dshm-lyric-line { font-size: 13px; line-height: 1.9; color: var(--dsw-alias-label-secondary);
  transition: color 160ms ease; }
.dshm-lyric-line[data-active="true"] { color: var(--dsw-alias-label-primary); font-weight: 600; }

@keyframes dshm-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes dshm-rise { from { opacity: 0; transform: translateY(10px) scale(.995) } to { opacity: 1; transform: none } }
@media (prefers-reduced-motion: reduce) {
  .dshm-backdrop, .dshm-sheet, .dshm-menu { animation: none !important; }
  .dshm-ib, .dshm-lyric-line, .dshm-toggle::after { transition: none !important; }
}
`

    /* ────────────────────────────── 3. host calls ───────────────────────── */

    const ENDPOINT = '/music/api'

    async function call(op, payload) {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ op, ...(payload ?? {}) }),
      })
      if (!response.ok) throw new Error(`music host returned ${response.status}`)
      const body = await response.json()
      if (body.ok !== true) throw new Error(body.error ?? 'music host rejected the request')
      return body.data
    }

    /* ────────────────────────────── 4. session ──────────────────────────── */

    const session = (() => {
      let snapshot = { phase: 'loading', status: null, error: null, toast: null }
      const listeners = new Set()
      const emit = () => { for (const listener of listeners) listener() }
      let toastTimer = null
      return {
        get: () => snapshot,
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
        set(patch) {
          snapshot = { ...snapshot, ...patch }
          emit()
        },
        setStatus(status) {
          const previousPlayer = snapshot.status?.player ?? null
          const nextPlayer = status?.player ?? null
          const same = previousPlayer !== null && nextPlayer !== null
            && previousPlayer.trackId === nextPlayer.trackId
            && previousPlayer.playing === nextPlayer.playing
            && previousPlayer.paused === nextPlayer.paused
            && previousPlayer.volume === nextPlayer.volume
            && previousPlayer.muted === nextPlayer.muted
            && previousPlayer.mode === nextPlayer.mode
            && previousPlayer.cursor === nextPlayer.cursor
            && previousPlayer.queue.length === nextPlayer.queue.length
            && Math.abs((previousPlayer.positionMs ?? 0) - (nextPlayer.positionMs ?? 0)) < 900
            && snapshot.status?.engine?.status === status?.engine?.status
            && snapshot.status?.engine?.audioOut?.format === status?.engine?.audioOut?.format
            && snapshot.status?.library?.tracks === status?.library?.tracks
            && snapshot.status?.library?.scanning === status?.library?.scanning
            && snapshot.status?.library?.roots === status?.library?.roots
          if (same) { snapshot = { ...snapshot, status, phase: 'ready', error: null }; return }
          snapshot = { ...snapshot, status, phase: 'ready', error: null }
          emit()
        },
        toast(message) {
          snapshot = { ...snapshot, toast: message }
          emit()
          if (toastTimer !== null) clearTimeout(toastTimer)
          toastTimer = setTimeout(() => {
            snapshot = { ...snapshot, toast: null }
            emit()
          }, 2200)
        },
      }
    })()

    function useSession() {
      return useSyncExternalStore(session.subscribe, session.get, session.get)
    }

    async function refreshStatus() {
      try {
        const status = await call('status', {})
        session.setStatus(status)
        return status
      } catch (error) {
        session.set({ phase: 'error', error: String(error?.message ?? error) })
        return null
      }
    }

    /** Run a host command, then refresh; surfaces the failure instead of swallowing it. */
    async function command(op, payload) {
      const result = await call(op, payload)
      await refreshStatus()
      return result
    }

    async function guarded(promise, label) {
      try { return await promise } catch (error) {
        session.toast(`${label}: ${error?.message ?? error}`)
        return null
      }
    }

    /* ────────────────────────────── 5. helpers ─────────────────────────── */

    function estimateMs(player) {
      if (player === null || player === undefined) return 0
      const base = player.positionMs ?? 0
      const playing = player.playing === true && player.paused !== true
      const sampled = player.positionSampledAt ?? 0
      const advance = playing && sampled > 0 ? Date.now() - sampled : 0
      const value = base + advance
      const duration = player.durationMs ?? 0
      return duration > 0 ? Math.min(value, duration) : Math.max(0, value)
    }

    function formatTime(ms) {
      if (!Number.isFinite(ms) || ms < 0) return '0:00'
      const total = Math.floor(ms / 1000)
      const seconds = total % 60
      const minutes = Math.floor(total / 60) % 60
      const hours = Math.floor(total / 3600)
      const pad = (n) => String(n).padStart(2, '0')
      return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
    }

    function cx(...values) {
      return values.filter((value) => typeof value === 'string' && value !== '').join(' ')
    }

    /* ────────────────────────────── 6. icons ───────────────────────────── */

    const PATHS = {
      play: 'M8 5.5v13l11-6.5z',
      pause: 'M8 5h3v14H8zM13 5h3v14h-3z',
      prev: 'M7 5v14M19 5.5v13l-9-6.5z',
      next: 'M17 5v14M5 5.5v13l9-6.5z',
      volume: 'M4 9.5h3L12 5v14L7 14.5H4z',
      mute: 'M4 9.5h3L12 5v14L7 14.5H4zM16 9l5 6M21 9l-5 6',
      repeat: 'M6 8h11a3 3 0 0 1 3 3v1M18 16H7a3 3 0 0 1-3-3v-1M15.5 5.5 18.5 8l-3 2.5M8.5 18.5 5.5 16l3-2.5',
      repeatOne: 'M6 8h11a3 3 0 0 1 3 3v1M18 16H7a3 3 0 0 1-3-3v-1M15.5 5.5 18.5 8l-3 2.5M8.5 18.5 5.5 16l3-2.5M11 11h1.5v3',
      shuffle: 'M4 7h3.5l3 5M4 17h3.5l9-10H20M15 7h5v5M4 17h3l3-4',
      queue: 'M5 7h11M5 12h11M5 17h7M18 14.5v4',
      library: 'M5 5h5v14H5zM12 5h3v14h-3zM17 6.5l3 12.5',
      search: 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM16.5 16.5 21 21',
      close: 'M6 6l12 12M18 6 6 18',
      chevronDown: 'M6 9.5 12 15l6-5.5',
      chevronRight: 'M9.5 6 15 12l-5.5 6',
      chevronLeft: 'M14.5 6 9 12l5.5 6',
      heart: 'M12 20s-7-4.6-7-9.2A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7 2.8C19 15.4 12 20 12 20z',
      folder: 'M4 7h6l2 2h8v9H4z',
      disc: 'M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16zM12 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4z',
      note: 'M9 17V6l9-2v3.5L12 9v8a2.5 2.5 0 1 1-3 0z',
      clock: 'M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16zM12 8v4.5l3 2',
      more: 'M6 12h.01M12 12h.01M18 12h.01',
      settings: 'M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM4.5 12c0-.6.1-1.1.2-1.6l-1.4-1 1.6-2.8 1.6.7c.8-.7 1.6-1.2 2.6-1.5l.2-1.7h3.4l.2 1.7c1 .3 1.9.8 2.6 1.5l1.6-.7L19 9.4l-1.4 1c.1.5.2 1 .2 1.6s-.1 1.1-.2 1.6l1.4 1-1.6 2.8-1.6-.7c-.8.7-1.6 1.2-2.6 1.5l-.2 1.7h-3.4l-.2-1.7c-1-.3-1.9-.8-2.6-1.5l-1.6.7L3.3 15.6l1.4-1c-.1-.5-.2-1-.2-1.6z',
      minus: 'M6 12h12',
    }

    function Icon({ name, size = 16, filled = false }) {
      const path = PATHS[name] ?? PATHS.note
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        'aria-hidden': 'true',
        focusable: 'false',
        style: { display: 'block' },
      }, h('path', {
        d: path,
        fill: filled ? 'currentColor' : 'none',
        stroke: 'currentColor',
        strokeWidth: 1.7,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      }))
    }

    /* ────────────────────────────── 7. primitives ──────────────────────── */

    function IconButton({ name, label, onClick, disabled, active, size = 'sm', variant, pressed }) {
      return h('button', {
        type: 'button',
        className: 'dshm-ib',
        'data-size': size,
        'data-active': active ? 'true' : undefined,
        'data-variant': variant,
        'aria-label': label,
        'aria-pressed': pressed === undefined ? undefined : pressed,
        title: label,
        disabled: disabled === true,
        onClick: (event) => { event.stopPropagation(); onClick?.(event) },
        onMouseDown: (event) => event.stopPropagation(),
      }, h(Icon, { name, size: size === 'xl' ? 22 : size === 'lg' ? 18 : 16, filled: name === 'play' || name === 'pause' }))
    }

    function Cover({ track, albumKey, size, radius = 8, trackId }) {
      const [failed, setFailed] = useState(false)
      const id = track?.id ?? trackId ?? null
      const source = id !== null && (track === undefined || track.hasCover !== false)
        ? `/music/cover?id=${encodeURIComponent(id)}&v=${track?.mtimeMs ?? 0}`
        : albumKey !== null && albumKey !== undefined
          ? `/music/cover?album=${encodeURIComponent(albumKey)}`
          : null
      useEffect(() => { setFailed(false) }, [source])
      const showImage = source !== null && !failed
      return h('div', {
        className: 'dshm-cover',
        style: { width: size, height: size, borderRadius: radius },
        'data-placeholder': showImage ? undefined : 'true',
      }, showImage
        ? h('img', {
          src: source,
          alt: '',
          loading: 'lazy',
          decoding: 'async',
          onError: () => setFailed(true),
        })
        : h('div', { className: 'dshm-cover-ph' }, h(Icon, { name: 'note', size: Math.max(12, Math.round(size * 0.34)) })))
    }

    /** Progress rail driven by rAF; never re-renders while the playhead moves. */
    function ProgressRail({ getPlayer, onSeek, label, compact = false }) {
      const railRef = useRef(null)
      const draggingRef = useRef(false)
      const [dragging, setDragging] = useState(false)

      useEffect(() => {
        let frame = 0
        const tick = () => {
          const node = railRef.current
          if (node !== null && !draggingRef.current) {
            const player = getPlayer()
            const duration = player?.durationMs ?? 0
            const value = duration > 0 ? Math.min(1, estimateMs(player) / duration) : 0
            node.style.setProperty('--p', String(value))
          }
          frame = requestAnimationFrame(tick)
        }
        frame = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(frame)
      }, [getPlayer])

      const seekFromEvent = (event, node) => {
        const rect = node.getBoundingClientRect()
        const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width)
        const fraction = rect.width === 0 ? 0 : x / rect.width
        const player = getPlayer()
        const duration = player?.durationMs ?? 0
        if (duration > 0) onSeek(Math.round(fraction * duration))
      }

      return h('div', {
        className: 'dshm-track dshm-focusable',
        role: 'slider',
        tabIndex: 0,
        'aria-label': label,
        'aria-valuemin': 0,
        'aria-valuemax': Math.round(getPlayer()?.durationMs ?? 0),
        'aria-valuenow': Math.round(estimateMs(getPlayer())),
        'aria-valuetext': formatTime(estimateMs(getPlayer())),
        onPointerDown: (event) => {
          draggingRef.current = true
          setDragging(true)
          event.currentTarget.setPointerCapture?.(event.pointerId)
          seekFromEvent(event, event.currentTarget)
        },
        onPointerMove: (event) => {
          if (!draggingRef.current) return
          seekFromEvent(event, event.currentTarget)
        },
        onPointerUp: (event) => {
          draggingRef.current = false
          setDragging(false)
          event.currentTarget.releasePointerCapture?.(event.pointerId)
        },
        onKeyDown: (event) => {
          const player = getPlayer()
          const step = event.shiftKey ? 15000 : 5000
          if (event.key === 'ArrowLeft') { event.preventDefault(); onSeek(Math.max(0, estimateMs(player) - step)) }
          if (event.key === 'ArrowRight') { event.preventDefault(); onSeek(estimateMs(player) + step) }
          if (event.key === 'Home') { event.preventDefault(); onSeek(0) }
        },
        'data-dragging': dragging ? 'true' : undefined,
      }, h('div', { className: 'dshm-track-rail', ref: railRef }, h('i')))
    }

    /** Ref-driven time label (updates are text writes, not renders). */
    function TimeLabel({ getPlayer, format = formatTime }) {
      const ref = useRef(null)
      useEffect(() => {
        let frame = 0
        let last = -1
        const tick = () => {
          const value = Math.floor(estimateMs(getPlayer()) / 500)
          if (ref.current !== null && value !== last) {
            last = value
            ref.current.textContent = format(value * 500)
          }
          frame = requestAnimationFrame(tick)
        }
        frame = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(frame)
      }, [getPlayer])
      return h('span', { ref })
    }

    /* ────────────────────────────── 8. mini player ─────────────────────── */

    const uiState = {
      nowPlaying: false,
      panel: 'all',
      listeners: new Set(),
    }

    function useUi() {
      const [value, setValue] = useState({ nowPlaying: uiState.nowPlaying, panel: uiState.panel })
      useEffect(() => {
        const listener = () => setValue({ nowPlaying: uiState.nowPlaying, panel: uiState.panel })
        uiState.listeners.add(listener)
        return () => uiState.listeners.delete(listener)
      }, [])
      return value
    }

    function setUi(patch) {
      Object.assign(uiState, patch)
      for (const listener of uiState.listeners) listener()
    }

    function MiniPlayer(props) {
      const snap = useSession()
      const status = snap.status
      const player = status?.player ?? null
      const wide = props?.wide !== false
      const track = useTrack(player?.trackId ?? null, status)
      const openNowPlaying = () => setUi({ nowPlaying: true })
      const latest = useRef(player)
      latest.current = player
      const getPlayer = useCallback(() => latest.current, [])
      const showProgress = wide && player !== null && track !== null && (player.playing === true || (player.positionMs ?? 0) > 0)

      if (track === null) {
        return h('div', { className: 'dshm dshm-mini-wrap' },
          h('button', {
            type: 'button',
            className: 'dshm-mini',
            'aria-label': t('mini.empty'),
            title: t('mini.empty'),
            onClick: () => openLibrary(),
            style: { justifyContent: wide ? 'flex-start' : 'center', padding: wide ? '4px 6px' : '4px' },
          },
          h('span', { style: { display: 'grid', placeItems: 'center', width: 26, height: 26, color: 'var(--dsw-alias-label-secondary)' } },
            h(Icon, { name: 'library', size: 16 })),
          wide ? h('span', { className: 'dshm-mini-sub', style: { color: 'var(--dsw-alias-label-secondary)' } }, t('mini.empty')) : null))
      }

      return h('div', { className: 'dshm dshm-mini-wrap' },
        h('div', { className: cx('dshm-mini', wide ? '' : 'dshm-mini-rail'), 'data-interactive': 'true' },
          h('button', {
            type: 'button',
            className: 'dshm-mini-cover dshm-focusable',
            'aria-label': t('mini.open'),
            title: t('mini.open'),
            onClick: openNowPlaying,
          }, h(Cover, { track, size: wide ? 34 : 28, radius: 6 })),
          wide ? h('button', {
            type: 'button',
            className: 'dshm-mini-info dshm-focusable',
            onClick: openNowPlaying,
            'aria-label': `${track.title} — ${t('mini.open')}`,
          },
          h('span', { className: 'dshm-mini-title' }, track.title),
          h('span', { className: 'dshm-mini-sub' },
            [track.artist ?? t('spec.todo'), track.year ? String(track.year) : null].filter(Boolean).join(' · '))) : null,
          wide ? h('div', { className: 'dshm-mini-controls' },
            h(IconButton, { name: 'prev', label: t('mini.prev'), onClick: () => guarded(command('player.prev'), t('mini.prev')) }),
            h(IconButton, {
              name: player.playing && !player.paused ? 'pause' : 'play',
              label: player.playing && !player.paused ? t('mini.pause') : t('mini.play'),
              variant: 'primary',
              onClick: () => guarded(command('player.toggle'), t('mini.play')),
            }),
            h(IconButton, { name: 'next', label: t('mini.next'), onClick: () => guarded(command('player.next'), t('mini.next')) })) : null),
        showProgress ? h('div', { className: 'dshm-mini-progress', 'aria-hidden': 'true' },
          h(ProgressRail, { getPlayer, onSeek: (ms) => guarded(command('player.seek', { ms }), t('np.seek')), label: t('np.seek') })) : null)
    }

    /* ────────────────────────────── 9. track cache ─────────────────────── */

    const trackCache = new Map()

    function useTrack(trackId, status) {
      const [track, setTrack] = useState(() => (trackId === null ? null : trackCache.get(trackId) ?? null))
      useEffect(() => {
        let cancelled = false
        if (trackId === null) { setTrack(null); return () => { cancelled = true } }
        const cached = trackCache.get(trackId)
        if (cached !== undefined) setTrack(cached)
        call('library.detail', { id: trackId }).then((detail) => {
          if (cancelled || detail === null) return
          trackCache.set(trackId, detail)
          setTrack(detail)
        }).catch(() => { /* track may have been removed */ })
        return () => { cancelled = true }
      }, [trackId, status?.library?.tracks])
      return track
    }

    function openLibrary() {
      setUi({ nowPlaying: false })
      window.dispatchEvent(new CustomEvent('dsh-music:open-library'))
    }

    /* ────────────────────────────── 10. now playing ────────────────────── */

    function NowPlayingOverlay() {
      const ui = useUi()
      const snap = useSession()
      const status = snap.status
      const player = status?.player ?? null
      const track = useTrack(player?.trackId ?? null, status)
      const [view, setView] = useState('now')
      const [showLyrics, setShowLyrics] = useState(false)
      const [showSpec, setShowSpec] = useState(false)
      const sheetRef = useRef(null)
      const latest = useRef(player)
      latest.current = player
      const getPlayer = useCallback(() => latest.current, [])

      useEffect(() => {
        if (!ui.nowPlaying) return undefined
        const onKey = (event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            if (view !== 'now') setView('now')
            else setUi({ nowPlaying: false })
          }
        }
        document.addEventListener('keydown', onKey, true)
        const previous = document.activeElement
        const focusTarget = sheetRef.current?.querySelector('[data-autofocus="true"]')
        focusTarget?.focus?.()
        return () => {
          document.removeEventListener('keydown', onKey, true)
          previous?.focus?.()
        }
      }, [ui.nowPlaying, view])

      useEffect(() => { if (!ui.nowPlaying) { setView('now'); setShowLyrics(false); setShowSpec(false) } }, [ui.nowPlaying])

      if (!ui.nowPlaying) return null

      const close = () => setUi({ nowPlaying: false })
      const playing = player !== null && player.playing === true && player.paused !== true

      return h('div', {
        className: 'dshm dshm-backdrop',
        onMouseDown: (event) => { if (event.target === event.currentTarget) close() },
        role: 'presentation',
      }, h('div', {
        className: 'dshm-sheet',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': t('np.title'),
        ref: sheetRef,
      },
      h('div', { className: 'dshm-sheet-head' },
        view === 'queue'
          ? h(IconButton, { name: 'chevronLeft', label: t('lib.back'), onClick: () => setView('now') })
          : h('span', { style: { width: 26 } }),
        h('div', { className: 'dshm-sheet-title' }, view === 'queue' ? t('np.queue') : t('np.title')),
        h(IconButton, { name: 'close', label: t('np.close'), onClick: close })),

      view === 'queue'
        ? h(QueuePanel, { player, tracksVersion: status?.library?.tracks })
        : h('div', { className: 'dshm-sheet-body' },
          track === null
            ? h('div', { className: 'dshm-empty' }, h('div', { className: 'dshm-empty-title' }, t('state.noTrack')))
            : h(React.Fragment, null,
              h('div', { className: 'dshm-np-art' }, h(Cover, { track, size: '100%', radius: 12 })),
              h('div', { className: 'dshm-np-meta' },
                h('div', { className: 'dshm-np-title', title: track.title }, track.title),
                h('div', { className: 'dshm-np-sub', title: track.album },
                  [track.artist ?? t('spec.todo'), track.albumShort ?? track.album].filter(Boolean).join(' · '))),
              h('div', { style: { marginTop: 10 } },
                h(ProgressRail, { getPlayer, onSeek: (ms) => guarded(command('player.seek', { ms }), t('np.seek')), label: t('np.seek') }),
                h('div', { className: 'dshm-times' },
                  h(TimeLabel, { getPlayer }),
                  h('span', null, formatTime(player?.durationMs ?? 0)))),
              h('div', { className: 'dshm-transport' },
                h(IconButton, { name: 'prev', label: t('mini.prev'), size: 'lg', onClick: () => guarded(command('player.prev'), t('mini.prev')) }),
                h(IconButton, {
                  name: playing ? 'pause' : 'play',
                  label: playing ? t('mini.pause') : t('mini.play'),
                  size: 'xl',
                  variant: 'primary',
                  onClick: () => guarded(command('player.toggle'), t('mini.play')),
                }),
                h(IconButton, { name: 'next', label: t('mini.next'), size: 'lg', onClick: () => guarded(command('player.next'), t('mini.next')) })),
              h('div', { className: 'dshm-extras' },
                h('div', { style: { display: 'flex', gap: 2 } },
                  h(IconButton, {
                    name: 'repeatOne', label: t('np.mode.one'), active: player?.mode === 'one', pressed: player?.mode === 'one',
                    onClick: () => guarded(command('player.mode', { mode: 'one' }), t('np.mode.one')),
                  }),
                  h(IconButton, {
                    name: 'repeat', label: t('np.mode.all'), active: player?.mode === 'all', pressed: player?.mode === 'all',
                    onClick: () => guarded(command('player.mode', { mode: 'all' }), t('np.mode.all')),
                  }),
                  h(IconButton, {
                    name: 'shuffle', label: t('np.mode.shuffle'), active: player?.mode === 'shuffle', pressed: player?.mode === 'shuffle',
                    onClick: () => guarded(command('player.mode', { mode: 'shuffle' }), t('np.mode.shuffle')),
                  })),
                h('span', { className: 'dshm-extras-spacer' }),
                h('div', { className: 'dshm-vol' },
                  h(IconButton, {
                    name: player?.muted ? 'mute' : 'volume',
                    label: player?.muted ? t('np.unmute') : t('np.mute'),
                    onClick: () => guarded(command('player.mute', { value: !player?.muted }), t('np.mute')),
                  }),
                  h(VolumeRail, {
                    value: player?.volume ?? 100,
                    onChange: (value) => guarded(command('player.volume', { value }), t('np.volume')),
                  }))),
              h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4 } },
                h('span', { className: 'dshm-chip' }, track.measuredSpec || track.ext.replace('.', '').toUpperCase()),
                h('span', { className: 'dshm-extras-spacer' }),
                h('span', { className: 'dshm-count' }, track.container ? String(track.container).toUpperCase() : '')),

              showLyrics ? h(LyricsPanel, { trackId: track.id, getPlayer }) : null,
              showSpec ? h(SpecPanel, { track, engine: status?.engine ?? null }) : null)),

      h('div', { className: 'dshm-foot' },
        h('button', {
          type: 'button', className: 'dshm-disclose dshm-focusable',
          'aria-expanded': showLyrics, onClick: () => setShowLyrics((value) => !value),
        }, h(Icon, { name: 'note', size: 14 }), t('np.lyrics')),
        h('button', {
          type: 'button', className: 'dshm-disclose dshm-focusable',
          'aria-expanded': showSpec, onClick: () => setShowSpec((value) => !value),
        }, h(Icon, { name: 'disc', size: 14 }), t('np.details')),
        h('span', { className: 'dshm-foot-spacer' }),
        h(IconButton, { name: 'queue', label: t('np.queue'), onClick: () => setView('queue') }),
        h(IconButton, { name: 'library', label: t('np.library'), onClick: () => { setUi({ nowPlaying: false }); openLibrary() } }))))
    }

    function VolumeRail({ value, onChange }) {
      const ref = useRef(null)
      useEffect(() => {
        if (ref.current !== null) ref.current.style.setProperty('--p', String(Math.max(0, Math.min(1, value / 100))))
      }, [value])
      const apply = (event) => {
        const node = event.currentTarget
        const rect = node.getBoundingClientRect()
        const fraction = rect.width === 0 ? 0 : Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1)
        onChange(Math.round(fraction * 100))
      }
      return h('div', {
        className: 'dshm-track dshm-focusable',
        role: 'slider',
        tabIndex: 0,
        'aria-label': t('np.volume'),
        'aria-valuemin': 0,
        'aria-valuemax': 100,
        'aria-valuenow': Math.round(value),
        onPointerDown: (event) => { event.currentTarget.setPointerCapture?.(event.pointerId); apply(event) },
        onPointerMove: (event) => { if (event.buttons === 1) apply(event) },
        onKeyDown: (event) => {
          if (event.key === 'ArrowLeft') { event.preventDefault(); onChange(Math.max(0, value - 5)) }
          if (event.key === 'ArrowRight') { event.preventDefault(); onChange(Math.min(100, value + 5)) }
        },
      }, h('div', { className: 'dshm-track-rail', ref }, h('i')))
    }

    function QueuePanel({ player }) {
      const ids = player?.queue ?? []
      const [tracks, setTracks] = useState([])
      const [drag, setDrag] = useState(null)
      useEffect(() => {
        let cancelled = false
        if (ids.length === 0) { setTracks([]); return () => { cancelled = true } }
        Promise.all(ids.map((id) => {
          const cached = trackCache.get(id)
          if (cached !== undefined) return Promise.resolve(cached)
          return call('library.detail', { id }).then((detail) => {
            if (detail !== null) trackCache.set(id, detail)
            return detail
          }).catch(() => null)
        })).then((list) => { if (!cancelled) setTracks(list) })
        return () => { cancelled = true }
      }, [ids.join('|')])

      if (ids.length === 0) {
        return h('div', { className: 'dshm-sheet-body' }, h('div', { className: 'dshm-empty' },
          h('div', { className: 'dshm-empty-title' }, t('queue.empty'))))
      }

      return h('div', { className: 'dshm-sheet-body', style: { paddingTop: 8 } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, padding: '0 2px 8px' } },
          h('span', { className: 'dshm-count' }, `${ids.length}`),
          h('span', { className: 'dshm-spacer' }),
          h('button', {
            type: 'button', className: 'dshm-btn dshm-focusable',
            onClick: () => guarded((async () => {
              const keep = ids.slice(0, (player?.cursor ?? 0) + 1)
              await command('queue.set', { ids: keep })
            })(), t('queue.clear')),
          }, t('queue.clear'))),
        ids.map((id, index) => {
          const track = tracks[index] ?? trackCache.get(id) ?? null
          const active = index === player?.cursor
          return h('div', {
            key: `${id}-${index}`,
            draggable: true,
            onDragStart: () => setDrag(index),
            onDragOver: (event) => event.preventDefault(),
            onDrop: (event) => {
              event.preventDefault()
              if (drag === null || drag === index) return
              guarded(command('queue.move', { from: drag, to: index }), t('np.queue'))
              setDrag(null)
            },
            className: 'dshm-row',
            'data-active': active ? 'true' : undefined,
            style: { gridTemplateColumns: '34px 1fr 48px', cursor: 'grab' },
          },
          h(Cover, { track, trackId: id, size: 30, radius: 5 }),
          h('div', { style: { minWidth: 0 } },
            h('div', { className: 'dshm-row-title' }, track?.title ?? id),
            h('div', { className: 'dshm-row-sub' }, track?.artist ?? track?.album ?? '')),
          h('button', {
            type: 'button', className: 'dshm-ib dshm-focusable', 'aria-label': t('queue.remove'),
            onClick: () => guarded(command('queue.remove', { index }), t('queue.remove')),
          }, h(Icon, { name: 'minus', size: 14 })))
        }))
    }

    function LyricsPanel({ trackId, getPlayer }) {
      const [lyrics, setLyrics] = useState(null)
      const [active, setActive] = useState(-1)
      const containerRef = useRef(null)
      useEffect(() => {
        let cancelled = false
        setLyrics(null)
        call('library.lrc', { id: trackId }).then((value) => { if (!cancelled) setLyrics(value) }).catch(() => { if (!cancelled) setLyrics(null) })
        return () => { cancelled = true }
      }, [trackId])

      useEffect(() => {
        if (lyrics === null || lyrics.kind !== 'synced') return undefined
        let frame = 0
        let last = -2
        const tick = () => {
          const player = getPlayer()
          const ms = estimateMs(player)
          let index = -1
          for (let i = 0; i < lyrics.lines.length; i++) {
            const time = lyrics.lines[i].timeMs
            if (time !== null && time <= ms) index = i
            else if (time !== null && time > ms) break
          }
          if (index !== last) {
            last = index
            setActive(index)
            const node = containerRef.current?.querySelector(`[data-index="${index}"]`)
            node?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
          }
          frame = requestAnimationFrame(tick)
        }
        frame = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(frame)
      }, [lyrics, getPlayer])

      if (lyrics === null) {
        return h('div', { className: 'dshm-lyrics' }, h('div', { className: 'dshm-note' }, t('np.noLyrics')))
      }
      return h('div', { className: 'dshm-lyrics', ref: containerRef },
        lyrics.kind === 'untimed' ? h('div', { className: 'dshm-note' }, t('np.untimed')) : null,
        lyrics.lines.map((line, index) => h('div', {
          key: index,
          'data-index': index,
          'data-active': index === active ? 'true' : undefined,
          className: 'dshm-lyric-line',
        }, line.text)))
    }

    function SpecPanel({ track, engine }) {
      const rows = [
        [t('spec.container'), track.container ?? '—'],
        [t('spec.codec'), track.spec?.codecLabel ?? track.codec ?? '—'],
        [t('spec.source'), [track.bitsPerSample ? `${track.bitsPerSample}bit` : null, track.sampleRate ? `${track.sampleRate / 1000}kHz` : null, track.channels ? `${track.channels}ch` : null].filter(Boolean).join(' / ') || '—'],
        [t('spec.decoded'), describePcm(engine?.audioDecoded)],
        [t('spec.device'), describePcm(engine?.audioOut) || t('spec.deviceUnknown')],
        [t('spec.claim'), track.filenameClaim
          ? `${track.filenameClaim} · ${track.claimMatchesMeasurement === true ? t('spec.match') : track.claimMatchesMeasurement === false ? t('spec.mismatch') : '—'}`
          : '—'],
        [t('spec.artist'), track.artist ?? t('spec.todo')],
      ]
      if (track.unknownTokens?.length > 0) rows.push([t('spec.todo'), track.unknownTokens.join('、')])
      return h('dl', { className: 'dshm-kv' },
        rows.map(([key, value]) => h(React.Fragment, { key },
          h('dt', null, key), h('dd', null, String(value)))))
    }

    function describePcm(params) {
      if (!params) return ''
      const sample = params.samplerate ? `${params.samplerate / 1000}kHz` : null
      const channels = params['channel-count'] ?? params.channels ?? null
      const format = params.format ? String(params.format).toUpperCase() : null
      return [sample, channels ? `${channels}ch` : null, format].filter(Boolean).join(' / ')
    }
    /* ────────────────────────────── 11. library page ───────────────────── */

    const VIEWS = [
      { id: 'all', label: 'lib.all', icon: 'note' },
      { id: 'folders', label: 'lib.folders', icon: 'folder' },
      { id: 'albums', label: 'lib.albums', icon: 'disc' },
      { id: 'artists', label: 'lib.artists', icon: 'heart' },
      { id: 'playlists', label: 'lib.playlists', icon: 'queue' },
      { id: 'favorites', label: 'lib.favorites', icon: 'heart' },
      { id: 'recent', label: 'lib.recent', icon: 'clock' },
    ]

    const SORTS = [
      ['default', 'lib.sort.default'],
      ['title', 'lib.sort.title'],
      ['artist', 'lib.sort.artist'],
      ['album', 'lib.sort.album'],
      ['duration', 'lib.sort.duration'],
      ['added', 'lib.sort.added'],
    ]

    function LibraryPage() {
      const snap = useSession()
      const status = snap.status
      const [view, setView] = useState('all')
      const [groupKey, setGroupKey] = useState(null)
      const [playlistId, setPlaylistId] = useState(null)
      const [queryInput, setQueryInput] = useState('')
      const [query, setQuery] = useState('')
      const [sort, setSort] = useState('default')
      const [density, setDensity] = useState('compact')
      const [tracks, setTracks] = useState([])
      const [groups, setGroups] = useState([])
      const [playlists, setPlaylists] = useState([])
      const [loading, setLoading] = useState(true)
      const [error, setError] = useState(null)
      const [menu, setMenu] = useState(null)
      const [editing, setEditing] = useState(null)
      const [groupTitle, setGroupTitle] = useState(null)
      const coverInput = useRef(null)
      const coverTarget = useRef(null)

      useEffect(() => {
        const handle = setTimeout(() => setQuery(queryInput.trim()), 180)
        return () => clearTimeout(handle)
      }, [queryInput])

      const libraryVersion = status?.library?.tracks ?? 0

      const reload = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
          const kind = view === 'folders' ? 'folder' : view === 'albums' ? 'album' : view === 'artists' ? 'artist' : null
          if (kind !== null && groupKey === null) {
            const result = await call('library.groups', { kind })
            setGroups(result ?? [])
            setTracks([])
            setGroupTitle(null)
          } else if (view === 'playlists' && playlistId === null) {
            const result = await call('playlists.list', {})
            setPlaylists(result ?? [])
            setGroups([])
            setTracks([])
            setGroupTitle(null)
          } else {
            const payload = {
              view: kind !== null ? kind : view,
              key: kind !== null ? groupKey : undefined,
              playlistId: playlistId ?? undefined,
              query,
              sort,
            }
            const result = await call('library.list', payload)
            setTracks(result ?? [])
            if (kind !== null && groupKey !== null) setGroupTitle(result?.[0]?.folderLabel ?? result?.[0]?.album ?? result?.[0]?.artist ?? null)
            setGroups([])
          }
        } catch (failure) {
          setError(String(failure?.message ?? failure))
        } finally {
          setLoading(false)
        }
      }, [view, groupKey, playlistId, query, sort])

      useEffect(() => { reload() }, [reload, libraryVersion])

      useEffect(() => {
        const onKey = (event) => {
          if (event.key === 'Escape') { setMenu(null); setEditing(null) }
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
      }, [])

      const currentIds = tracks.map((track) => track.id)

      const playFrom = (index) => {
        if (currentIds.length === 0) return
        guarded(command('queue.play', { ids: currentIds, startIndex: Math.max(0, index) }), t('lib.playAll'))
      }

      const openMenu = (event, track) => {
        event.preventDefault()
        const width = 224
        const height = 340
        setMenu({
          track,
          x: Math.min(event.clientX, window.innerWidth - width - 8),
          y: Math.min(event.clientY, window.innerHeight - height - 8),
        })
      }

      const pickCover = (track) => {
        coverTarget.current = track
        coverInput.current?.click()
      }

      const onCoverChosen = async (event) => {
        const file = event.target.files?.[0]
        event.target.value = ''
        const track = coverTarget.current
        if (!file || track === null) return
        if (file.size > 8 * 1024 * 1024) { session.toast('8 MB max'); return }
        const dataUrl = await new Promise((resolve) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result))
          reader.onerror = () => resolve(null)
          reader.readAsDataURL(file)
        })
        if (dataUrl === null) return
        await guarded(command('track.coverFromDataUrl', { id: track.id, dataUrl }), t('ctx.cover'))
        trackCache.delete(track.id)
        reload()
      }

      const addFolder = async () => {
        try {
          const directory = await pickDirectory()
          if (directory === null) return
          await command('roots.add', { path: directory })
          session.toast(directory)
        } catch (failure) {
          session.toast(String(failure?.message ?? failure))
        }
      }

      const title = (() => {
        if (view === 'playlists') {
          if (playlistId !== null) return playlists.find((p) => p.id === playlistId)?.name ?? t('lib.playlists')
          return t('lib.playlists')
        }
        if (groupKey !== null && groupTitle !== null) return groupTitle
        const found = VIEWS.find((entry) => entry.id === view)
        return found ? t(found.label) : t('lib.all')
      })()

      const showGroups = (view === 'folders' || view === 'albums' || view === 'artists') && groupKey === null
      const showPlaylists = view === 'playlists' && playlistId === null
      const rowHeight = density === 'compact' ? 34 : 46

      return h('div', { className: 'dshm dshm-page' },
        h('nav', { className: 'dshm-rail', 'aria-label': t('panel.label') },
          h('div', { className: 'dshm-rail-head' }, t('panel.label')),
          VIEWS.map((entry) => h('button', {
            key: entry.id,
            type: 'button',
            className: 'dshm-nav dshm-focusable',
            'data-active': view === entry.id && groupKey === null ? 'true' : undefined,
            'aria-current': view === entry.id ? 'page' : undefined,
            onClick: () => { setView(entry.id); setGroupKey(null); setPlaylistId(null) },
          }, h(Icon, { name: entry.icon, size: 15 }), t(entry.label))),
          h('div', { className: 'dshm-rail-head' }, t('common.playlists')),
          (playlists.length === 0 ? [] : playlists).map((playlist) => h('button', {
            key: playlist.id,
            type: 'button',
            className: 'dshm-nav dshm-focusable',
            'data-active': playlistId === playlist.id ? 'true' : undefined,
            onClick: () => { setView('playlists'); setPlaylistId(playlist.id); setGroupKey(null) },
          }, h(Icon, { name: 'queue', size: 15 }), playlist.name,
          h('span', { className: 'dshm-nav-count' }, String(playlist.trackIds.length)))),
          h('button', {
            type: 'button', className: 'dshm-nav dshm-focusable',
            onClick: () => guarded((async () => {
              const name = window.prompt(t('common.newPlaylist'), t('common.newPlaylist'))
              if (name === null) return
              await command('playlists.create', { name })
              reload()
            })(), t('common.newPlaylist')),
          }, h(Icon, { name: 'more', size: 15 }), t('common.newPlaylist'))),

        h('section', { className: 'dshm-main' },
          h('header', { className: 'dshm-toolbar' },
            groupKey !== null || playlistId !== null
              ? h(IconButton, {
                name: 'chevronLeft', label: t('lib.back'),
                onClick: () => { if (playlistId !== null) setPlaylistId(null); else setGroupKey(null) },
              })
              : null,
            h('h1', { className: 'dshm-h1' }, title),
            h('span', { className: 'dshm-count' }, loading ? t('lib.loading')
              : showGroups ? `${groups.length}`
              : showPlaylists ? `${playlists.length}`
                : `${tracks.length} ${t('lib.tracks')}`),
            h('span', { className: 'dshm-spacer' }),
            h('label', { className: 'dshm-field dshm-focusable' },
              h(Icon, { name: 'search', size: 14 }),
              h('input', {
                type: 'search',
                value: queryInput,
                placeholder: t('lib.search'),
                'aria-label': t('lib.search'),
                onChange: (event) => setQueryInput(event.target.value),
                onKeyDown: (event) => { if (event.key === 'Escape') setQueryInput('') },
              })),
            h('select', {
              className: 'dshm-select dshm-focusable', value: sort, 'aria-label': t('lib.sort'),
              onChange: (event) => setSort(event.target.value),
            }, SORTS.map(([value, label]) => h('option', { key: value, value }, t(label)))),
            h('button', {
              type: 'button', className: 'dshm-btn dshm-focusable',
              onClick: () => setDensity(density === 'compact' ? 'comfortable' : 'compact'),
              title: t('set.density'),
            }, density === 'compact' ? t('lib.density.compact') : t('lib.density.comfortable')),
            h('button', {
              type: 'button', className: 'dshm-btn dshm-focusable', onClick: addFolder,
            }, h(Icon, { name: 'folder', size: 14 }), t('lib.addFolder')),
            h('button', {
              type: 'button', className: 'dshm-btn dshm-focusable',
              onClick: () => guarded(command('library.scan', {}), t('lib.rescan')),
            }, t('lib.rescan'))),

          error !== null ? h('div', { className: 'dshm-empty' }, h('div', { className: 'dshm-empty-body' }, error)) : null,

          !loading && tracks.length === 0 && !showGroups && !showPlaylists
            ? h('div', { className: 'dshm-empty' },
              h('div', { className: 'dshm-empty-title' }, query !== '' ? t('lib.empty.search') : t('lib.empty.title')),
              query !== '' ? null : h('div', { className: 'dshm-empty-body' }, t('lib.empty.body')),
              query !== '' ? null : h('button', { type: 'button', className: 'dshm-btn dshm-focusable', onClick: addFolder }, t('lib.addFolder')))
            : null,

          showGroups
            ? h('div', { className: 'dshm-cards' }, groups.map((group) => h('button', {
              key: group.key,
              type: 'button',
              className: 'dshm-card dshm-focusable',
              onClick: () => { setGroupKey(group.key); setGroupTitle(group.title) },
              onDoubleClick: () => { setGroupKey(group.key); setGroupTitle(group.title) },
            },
            h('div', { className: 'dshm-card-art' }, h(Cover, {
              track: { id: group.trackId, hasCover: true, mtimeMs: 0 },
              albumKey: view === 'albums' ? group.key : null,
              size: '100%',
              radius: 10,
            })),
            h('div', { className: 'dshm-card-title', title: group.title }, group.title),
            h('div', { className: 'dshm-card-sub' },
              [view === 'folders' ? group.parentTitle : group.subtitle, `${group.trackCount} ${t('lib.tracks')}`].filter(Boolean).join(' · ')))))
            : null,

          showPlaylists
            ? h('div', { className: 'dshm-cards' }, playlists.length === 0
              ? h('div', { className: 'dshm-empty' }, h('div', { className: 'dshm-empty-body' }, t('ctx.noPlaylists')))
              : playlists.map((playlist) => h('button', {
                key: playlist.id,
                type: 'button',
                className: 'dshm-card dshm-focusable',
                onClick: () => setPlaylistId(playlist.id),
              },
              h('div', { className: 'dshm-card-art' }, h(Cover, { track: null, albumKey: null, size: '100%', radius: 10 })),
              h('div', { className: 'dshm-card-title' }, playlist.name),
              h('div', { className: 'dshm-card-sub' }, `${playlist.trackIds.length} ${t('lib.tracks')}`))))
            : null,

          !showGroups && !showPlaylists && tracks.length > 0
            ? h(React.Fragment, null,
              h('div', { className: 'dshm-list-head', role: 'row' },
                h('span', null, ''),
                h(ColumnHeading, { label: t('lib.sort.title'), active: sort === 'title', onClick: () => setSort(sort === 'title' ? 'default' : 'title') }),
                h(ColumnHeading, { label: t('lib.sort.artist'), active: sort === 'artist', onClick: () => setSort(sort === 'artist' ? 'default' : 'artist') }),
                h(ColumnHeading, { label: t('lib.sort.album'), active: sort === 'album', onClick: () => setSort(sort === 'album' ? 'default' : 'album') }),
                h(ColumnHeading, { label: t('lib.sort.duration'), align: 'end', active: sort === 'duration', onClick: () => setSort(sort === 'duration' ? 'default' : 'duration') }),
                h('span', { className: 'dshm-num' }, '')),
              h(VirtualList, {
                items: tracks,
                rowHeight,
                renderRow: (track, index) => h(TrackRow, {
                  key: track.id,
                  track,
                  index,
                  density,
                  active: status?.player?.trackId === track.id,
                  onPlay: () => playFrom(index),
                  onMenu: (event) => openMenu(event, track),
                }),
              }))
            : null),

        menu !== null ? h(ContextMenu, {
          menu,
          playlists,
          onClose: () => setMenu(null),
          onAction: async (action) => {
            const track = menu.track
            setMenu(null)
            if (action === 'playNow') {
              const index = currentIds.indexOf(track.id)
              playFrom(index >= 0 ? index : 0)
            } else if (action === 'playNext') {
              await guarded(command('queue.enqueue', { ids: [track.id], position: 'next' }), t('ctx.playNext'))
            } else if (action === 'enqueue') {
              await guarded(command('queue.enqueue', { ids: [track.id], position: 'end' }), t('ctx.enqueue'))
            } else if (action === 'favorite') {
              await guarded(command('favorite.set', { id: track.id, on: !track.favorited }), t('ctx.favorite'))
              reload()
            } else if (action === 'reveal') {
              await guarded(command('track.reveal', { id: track.id }), t('ctx.reveal'))
            } else if (action === 'edit') {
              setEditing(track)
            } else if (action === 'cover') {
              pickCover(track)
            } else if (action === 'remove') {
              await guarded(command('library.remove', { id: track.id }), t('ctx.remove'))
              trackCache.delete(track.id)
              reload()
            } else if (action.startsWith('playlist:')) {
              await guarded(command('playlists.add', { id: action.slice(9), trackIds: [track.id] }), t('ctx.addToPlaylist'))
              reload()
            }
          },
        }) : null,

        editing !== null ? h(EditDialog, {
          track: editing,
          onClose: () => setEditing(null),
          onSaved: () => { trackCache.delete(editing.id); setEditing(null); reload() },
        }) : null,

        h('input', {
          type: 'file',
          accept: 'image/*',
          ref: coverInput,
          style: { display: 'none' },
          onChange: onCoverChosen,
        }))
    }

    /** A column heading that sorts, per `lists-and-tables.md › Desktop (macOS)`. */
    function ColumnHeading({ label, active, onClick, align }) {
      return h('button', {
        type: 'button',
        className: cx('dshm-colhead', align === 'end' ? 'dshm-num' : ''),
        'aria-sort': active ? 'ascending' : 'none',
        onClick,
      }, h('span', null, label), active ? h(Icon, { name: 'chevronDown', size: 10 }) : null)
    }

    function VirtualList({ items, rowHeight, renderRow }) {
      const ref = useRef(null)
      const [scrollTop, setScrollTop] = useState(0)
      const [height, setHeight] = useState(480)
      useEffect(() => {
        const node = ref.current
        if (node === null) return undefined
        const measure = () => setHeight(node.clientHeight || 480)
        measure()
        let observer = null
        if (typeof ResizeObserver !== 'undefined') {
          observer = new ResizeObserver(measure)
          observer.observe(node)
        }
        return () => observer?.disconnect()
      }, [])
      const overscan = 8
      const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
      const end = Math.min(items.length, Math.ceil((scrollTop + height) / rowHeight) + overscan)
      return h('div', {
        ref,
        className: 'dshm-list',
        onScroll: (event) => setScrollTop(event.currentTarget.scrollTop),
      }, h('div', { style: { height: items.length * rowHeight, position: 'relative' } },
        items.slice(start, end).map((item, offset) => h('div', {
          key: item.id,
          style: { position: 'absolute', top: (start + offset) * rowHeight, left: 0, right: 0, height: rowHeight },
        }, renderRow(item, start + offset)))))
    }

    function TrackRow({ track, index, density, active, onPlay, onMenu }) {
      return h('div', {
        className: 'dshm-row',
        'data-density': density,
        'data-active': active ? 'true' : undefined,
        tabIndex: 0,
        role: 'option',
        'aria-selected': active ? 'true' : 'false',
        onDoubleClick: onPlay,
        onKeyDown: (event) => {
          if (event.key === 'Enter') { event.preventDefault(); onPlay() }
          if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) onMenu(event)
        },
        onContextMenu: onMenu,
      },
      h(Cover, { track, size: density === 'compact' ? 26 : 34, radius: 5 }),
      h('div', { style: { minWidth: 0 } },
        h('div', { className: 'dshm-row-title', title: track.title }, track.title),
        density === 'comfortable'
          ? h('div', { className: 'dshm-row-sub' }, track.albumShort ?? track.album)
          : null),
      h('div', { className: 'dshm-row-col' }, track.artist ?? t('spec.todo')),
      h('div', { className: 'dshm-row-col', title: track.album }, track.albumShort ?? track.album),
      h('div', { className: 'dshm-row-col dshm-num' }, formatTime(track.durationMs)),
      h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 2, alignItems: 'center' } },
        track.favorited ? h('span', { style: { color: 'var(--dsw-alias-brand-primary)', display: 'grid', placeItems: 'center', width: 14 } }, h(Icon, { name: 'heart', size: 12, filled: true })) : null,
        h('span', { className: 'dshm-chip' }, track.ext.replace('.', '').toUpperCase()),
        h(IconButton, { name: 'more', label: t('common.more'), onClick: onMenu })))
    }

    function ContextMenu({ menu, playlists, onClose, onAction }) {
      const ref = useRef(null)
      useEffect(() => {
        const onDown = (event) => { if (!ref.current?.contains(event.target)) onClose() }
        const onKey = (event) => { if (event.key === 'Escape') onClose() }
        document.addEventListener('mousedown', onDown, true)
        document.addEventListener('keydown', onKey)
        ref.current?.querySelector('button')?.focus?.()
        return () => {
          document.removeEventListener('mousedown', onDown, true)
          document.removeEventListener('keydown', onKey)
        }
      }, [onClose])

      const item = (label, action, options = {}) => h('button', {
        key: action + label,
        type: 'button',
        className: 'dshm-menu-item',
        'data-destructive': options.destructive ? 'true' : undefined,
        onClick: () => onAction(action),
      }, options.icon ? h(Icon, { name: options.icon, size: 14 }) : null, label)

      return h('div', {
        ref,
        className: 'dshm dshm-menu',
        role: 'menu',
        style: { left: menu.x, top: menu.y },
        onContextMenu: (event) => event.preventDefault(),
      },
      item(t('ctx.playNow'), 'playNow', { icon: 'play' }),
      item(t('ctx.playNext'), 'playNext', { icon: 'next' }),
      item(t('ctx.enqueue'), 'enqueue', { icon: 'queue' }),
      h('div', { className: 'dshm-menu-sep' }),
      h('div', { className: 'dshm-menu-label' }, t('ctx.addToPlaylist')),
      playlists.length === 0
        ? h('div', { className: 'dshm-menu-note' }, t('ctx.noPlaylists'))
        : playlists.slice(0, 6).map((playlist) => item(playlist.name, `playlist:${playlist.id}`, { icon: 'queue' })),
      h('div', { className: 'dshm-menu-sep' }),
      item(menu.track.favorited ? t('ctx.unfavorite') : t('ctx.favorite'), 'favorite', { icon: 'heart' }),
      item(t('ctx.reveal'), 'reveal', { icon: 'folder' }),
      item(t('ctx.edit'), 'edit', { icon: 'note' }),
      item(t('ctx.cover'), 'cover', { icon: 'disc' }),
      h('div', { className: 'dshm-menu-sep' }),
      item(t('ctx.remove'), 'remove', { destructive: true }),
      h('div', { className: 'dshm-menu-note' }, t('ctx.removeHint')))
    }

    function EditDialog({ track, onClose, onSaved }) {
      const [title, setTitle] = useState(track.title ?? '')
      const [artist, setArtist] = useState(track.artist ?? '')
      const [album, setAlbum] = useState(track.album ?? '')
      const [year, setYear] = useState(track.year === null || track.year === undefined ? '' : String(track.year))
      const save = async () => {
        await guarded((async () => {
          await command('track.override', {
            id: track.id,
            patch: {
              title: title.trim() || null,
              artist: artist.trim() || null,
              album: album.trim() || null,
              year: year.trim() === '' ? null : Number(year.trim()),
            },
          })
        })(), t('edit.save'))
        onSaved()
      }
      const clear = async () => {
        await guarded((async () => { await command('track.override.clear', { id: track.id }) })(), t('edit.clear'))
        onSaved()
      }
      return h('div', { className: 'dshm dshm-modal', onMouseDown: (event) => { if (event.target === event.currentTarget) onClose() } },
        h('div', { className: 'dshm-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('edit.title') },
          h('h2', null, t('edit.title')),
          h('div', { className: 'dshm-form' },
            h('label', null, t('edit.name'), h('input', { value: title, onChange: (event) => setTitle(event.target.value), autoFocus: true })),
            h('label', null, t('edit.artist'), h('input', { value: artist, onChange: (event) => setArtist(event.target.value) })),
            h('label', null, t('edit.album'), h('input', { value: album, onChange: (event) => setAlbum(event.target.value) })),
            h('label', null, t('edit.year'), h('input', { value: year, inputMode: 'numeric', onChange: (event) => setYear(event.target.value) }))),
          h('div', { className: 'dshm-note' }, t('edit.hint')),
          h('div', { className: 'dshm-dialog-foot' },
            h('button', { type: 'button', className: 'dshm-btn dshm-focusable', onClick: clear }, t('edit.clear')),
            h('button', { type: 'button', className: 'dshm-btn dshm-focusable', onClick: onClose }, t('edit.cancel')),
            h('button', { type: 'button', className: 'dshm-btn dshm-focusable', 'data-primary': 'true', onClick: save }, t('edit.save')))))
    }

    /* ────────────────────────────── 12. settings ───────────────────────── */

    function SettingsPage() {
      const snap = useSession()
      const status = snap.status
      const prefs = status?.prefs ?? {}
      const engine = status?.engine ?? null
      const [logs, setLogs] = useState([])
      const [roots, setRoots] = useState([])
      const [busy, setBusy] = useState(false)

      const reloadRoots = useCallback(async () => {
        try { setRoots(await call('roots.list', {}) ?? []) } catch { setRoots([]) }
      }, [])

      useEffect(() => { reloadRoots() }, [reloadRoots, status?.library?.roots])

      const setPref = async (patch) => {
        await guarded(command('prefs.set', { patch }), t('set.title'))
      }

      const addFolder = async () => {
        const directory = await pickDirectory()
        if (directory === null) return
        setBusy(true)
        try {
          await command('roots.add', { path: directory })
          await reloadRoots()
        } catch (failure) {
          session.toast(String(failure?.message ?? failure))
        } finally { setBusy(false) }
      }

      const loadLogs = async () => {
        try { setLogs(await call('diag.logs', {}) ?? []) } catch { setLogs([]) }
      }

      const engineLabel = status?.engineMode === 'mpv' ? t('set.engineMpv') : t('set.engineBrowser')
      const outLabel = describePcm(engine?.audioOut) || t('spec.deviceUnknown')

      const toggle = (label, checked, onChange, hint) => h('div', { className: 'dshm-set-row' },
        h('div', { className: 'dshm-set-row-label' }, label, hint ? h('div', { className: 'dshm-set-row-hint' }, hint) : null),
        h('button', {
          type: 'button',
          className: 'dshm-toggle',
          role: 'switch',
          'aria-checked': checked ? 'true' : 'false',
          'aria-label': label,
          onClick: () => onChange(!checked),
        }))

      return h('div', { className: 'dshm dshm-settings' },
        h('section', { className: 'dshm-set-group' },
          h('h3', { className: 'dshm-set-title' }, t('set.library')),
          roots.length === 0
            ? h('div', { className: 'dshm-set-row-hint' }, t('set.noRoots'))
            : roots.map((root) => h('div', { key: root.id, className: 'dshm-root' },
              h(Icon, { name: 'folder', size: 14 }),
              h('div', { className: 'dshm-root-path', style: { flex: '1 1 auto', minWidth: 0 }, title: root.path }, root.path),
              h('button', {
                type: 'button', className: 'dshm-btn dshm-focusable',
                onClick: () => guarded((async () => { await command('library.scan', { rootId: root.id }); await reloadRoots() })(), t('set.rescan')),
              }, t('set.rescan')),
              h('button', {
                type: 'button', className: 'dshm-btn dshm-focusable', 'data-destructive': 'true',
                onClick: () => guarded((async () => { await command('roots.remove', { id: root.id }); await reloadRoots() })(), t('set.remove')),
              }, t('set.remove')))),
          h('div', { className: 'dshm-set-row' },
            h('button', { type: 'button', className: 'dshm-btn dshm-focusable', disabled: busy, onClick: addFolder },
              h(Icon, { name: 'folder', size: 14 }), t('lib.addFolder')),
            h('button', {
              type: 'button', className: 'dshm-btn dshm-focusable',
              onClick: () => guarded(command('library.scan', {}), t('set.rescan')),
            }, t('lib.rescan')),
            h('span', { className: 'dshm-set-row-hint' },
              `${status?.library?.tracks ?? 0} ${t('lib.tracks')}${status?.library?.scanning ? ' · scanning…' : ''}`))),

        h('section', { className: 'dshm-set-group' },
          h('h3', { className: 'dshm-set-title' }, t('set.playback')),
          h('div', { className: 'dshm-set-row' },
            h('div', { className: 'dshm-set-row-label' }, t('set.defaultVolume')),
            h(VolumeRail, { value: prefs.defaultVolume ?? 100, onChange: (value) => setPref({ defaultVolume: value }) }),
            h('span', { className: 'dshm-count' }, String(prefs.defaultVolume ?? 100))),
          toggle(t('set.restore'), prefs.restoreQueue !== false, (value) => setPref({ restoreQueue: value }), t('set.restoreHint'))),

        h('section', { className: 'dshm-set-group' },
          h('h3', { className: 'dshm-set-title' }, t('set.audio')),
          h('div', { className: 'dshm-set-row' },
            h('div', { className: 'dshm-set-row-label' }, t('set.engine')),
            h('span', { className: 'dshm-chip' }, engineLabel)),
          h('div', { className: 'dshm-set-row' },
            h('div', { className: 'dshm-set-row-label' }, t('set.output')),
            h('span', { className: 'dshm-set-row-hint' }, outLabel)),
          h('div', { className: 'dshm-set-row' },
            h('div', { className: 'dshm-set-row-label' }, t('set.specs')),
            h('span', { className: 'dshm-set-row-hint' },
              [describePcm(engine?.audioDecoded), engine?.ao].filter(Boolean).join(' · ') || '—')),
          toggle(t('set.exclusive'), Boolean(engine?.exclusive), (value) => guarded(command('engine.exclusive', { value }), t('set.exclusive')), t('set.exclusiveHint')),
          engine?.error ? h('div', { className: 'dshm-note' }, engine.error) : null),

        h('section', { className: 'dshm-set-group' },
          h('h3', { className: 'dshm-set-title' }, t('set.appearance')),
          h('div', { className: 'dshm-set-row' },
            h('div', { className: 'dshm-set-row-label' }, t('set.density')),
            h('button', {
              type: 'button', className: 'dshm-btn dshm-focusable',
              onClick: () => setPref({ density: prefs.density === 'comfortable' ? 'compact' : 'comfortable' }),
            }, prefs.density === 'comfortable' ? t('lib.density.comfortable') : t('lib.density.compact'))),
          toggle(t('set.miniProgress'), prefs.miniProgress !== false, (value) => setPref({ miniProgress: value }))),

        h('section', { className: 'dshm-set-group' },
          h('h3', { className: 'dshm-set-title' }, t('set.advanced')),
          h('div', { className: 'dshm-set-row' },
            h('button', { type: 'button', className: 'dshm-btn dshm-focusable', onClick: loadLogs }, t('set.diag')),
            h('button', {
              type: 'button', className: 'dshm-btn dshm-focusable',
              onClick: () => guarded(command('db.backup', {}).then((result) => { if (result?.file) session.toast(result.file) }), t('set.backup')),
            }, t('set.backup')),
            h('button', {
              type: 'button', className: 'dshm-btn dshm-focusable',
              onClick: () => guarded(command('cache.clear', {}), t('set.clearCache')),
            }, t('set.clearCache')),
            h('button', {
              type: 'button', className: 'dshm-btn dshm-focusable',
              onClick: () => guarded(command('diag.engineRestart', {}), t('set.reload')),
            }, t('set.reload'))),
          logs.length > 0 ? h('pre', { className: 'dshm-logs' }, logs.slice(-60).join('\n')) : null))
    }

    function PanelGlyph(props) {
      const size = props?.size ?? 16
      const active = props?.active === true
      return h('span', { className: 'dshm', style: { display: 'grid', placeItems: 'center' } },
        h('svg', { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' },
          h('g', { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' },
            h('path', { d: 'M5 5h5v14H5z', fill: active ? 'currentColor' : 'none' }),
            h('path', { d: 'M12 5h3v14h-3z' }),
            h('path', { d: 'M17.5 6.5 20.5 19' }))))
    }

    /* ────────────────────────────── 13. apply ─────────────────────────── */

    let pickDirectoryImpl = async () => null
    function pickDirectory() {
      return pickDirectoryImpl()
    }

    function attachKeyboard(getLayout) {
      const onKey = (event) => {
        const target = event.target
        const tag = String(target?.tagName ?? '').toLowerCase()
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable === true) return
        if (event.metaKey || event.ctrlKey || event.altKey) return
        const status = session.get().status
        if (status?.player === null || status?.player === undefined) return
        if (event.code === 'Space') {
          event.preventDefault()
          guarded(command('player.toggle'), t('mini.play'))
        } else if (event.key === 'ArrowRight' && event.shiftKey) {
          event.preventDefault(); guarded(command('player.next'), t('mini.next'))
        } else if (event.key === 'ArrowLeft' && event.shiftKey) {
          event.preventDefault(); guarded(command('player.prev'), t('mini.prev'))
        }
      }
      document.addEventListener('keydown', onKey)
      return () => document.removeEventListener('keydown', onKey)
    }

    return {
      inject: ['slots', 'locale', 'layout', 'uiWorkspace'],
      apply(ctx) {
        const bound = ctx.locale.bind(NS)
        translate = (key) => bound(key)

        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-music locale')

        ctx.effect(() => {
          const style = document.createElement('style')
          style.setAttribute('data-dsh-music', '1')
          style.textContent = CSS
          document.head.appendChild(style)
          return () => { try { style.remove() } catch { /* already gone */ } }
        }, 'dsh-music styles')

        ctx.effect(() => {
          let timer = null
          let stopped = false
          const loop = async () => {
            if (stopped) return
            await refreshStatus()
            const interval = typeof document !== 'undefined' && document.hidden ? 2500 : 1000
            timer = setTimeout(loop, interval)
          }
          void loop()
          return () => { stopped = true; if (timer !== null) clearTimeout(timer) }
        }, 'dsh-music status poll')

        ctx.effect(() => {
          const open = () => {
            try { ctx.layout.selectPanel('music') } catch { /* layout not ready */ }
          }
          window.addEventListener('dsh-music:open-library', open)
          return () => window.removeEventListener('dsh-music:open-library', open)
        }, 'dsh-music library opener')

        ctx.effect(() => attachKeyboard(), 'dsh-music keyboard')

        pickDirectoryImpl = async () => {
          try {
            const workspace = ctx.uiWorkspace
            if (workspace !== undefined && workspace !== null) return await workspace.pickDirectory()
          } catch { /* fall through */ }
          return null
        }

        ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action',
          id: 'dsh-music',
          order: 10,
          label: t('panel.label'),
          inject: () => ({ t }),
        }, MiniPlayer))

        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: 'music',
          order: 25,
          label: t('panel.label'),
          inject: () => ({ t }),
        }, PanelGlyph))

        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: 'music',
          inject: () => ({ t }),
        }, LibraryPage))

        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'dsh-music-nowplaying',
          order: 55,
          inject: () => ({ t }),
        }, NowPlayingOverlay))

        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'dsh-music',
          order: 70,
          label: t('panel.label'),
          inject: () => ({ t }),
        }, SettingsPage))
      },
    }
  },
})

