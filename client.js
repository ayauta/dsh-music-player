/**
 * DSH Music — Client half.
 *
 * Renders inside the Harness Web UI through official slots only:
 *   sidebar.footer.action → MiniPlayer
 *   sidebar.panellist     → PanelGlyph (opens the `music` main panel)
 *   main (key `music`)    → LibraryPage (library + inline settings)
 *   shell.overlay         → NowPlaying (modal sheet)
 *   settings.section      → SettingsPage (same component, embedded)
 *
 * Rules this file follows:
 *  - Only `--dsw-alias-*` / `--dsw-specific-*` theme tokens for surfaces and text.
 *  - One type scale, declared once (`--dshm-fs-*`), applied everywhere.
 *  - Playheads animate through rAF writing `--p`; no per-frame React renders.
 *  - Transport glyphs are filled (Apple style); chrome glyphs are Lucide (ISC).
 *  - Every icon-only control carries an aria-label and is keyboard reachable.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-music',
  factory(require) {
    const React = require('react')
    const { useState, useEffect, useRef, useCallback, useSyncExternalStore } = React
    const h = React.createElement

    /* ────────────────────────────── text ────────────────────────────── */

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
      'np.collapse': '收起',
      'np.queue': '播放队列',
      'np.library': '音乐库',
      'np.lyrics': '歌词',
      'np.details': '文件与规格',
      'np.noLyrics': '没有歌词文件',
      'np.untimed': '歌词没有时间码，仅静态显示',
      'np.mode.sequence': '顺序播放',
      'np.mode.one': '单曲循环',
      'np.mode.all': '列表循环',
      'np.mode.shuffle': '随机播放',
      'np.volume': '音量',
      'np.mute': '静音',
      'np.unmute': '取消静音',
      'np.seek': '播放进度',
      'lib.all': '全部歌曲',
      'lib.queue': '播放队列',
      'lib.folders': '文件夹',
      'lib.albums': '专辑',
      'lib.artists': '艺术家',
      'lib.playlists': '播放列表',
      'lib.favorites': '收藏',
      'lib.recent': '最近添加',
      'lib.settings': '设置',
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
      'lib.playAll': '播放全部',
      'lib.shuffleAll': '随机播放',
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
      'ctx.editAlbum': '编辑专辑信息',
      'ctx.albumCover': '设置专辑封面',
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
      'album.title': '编辑专辑信息',
      'album.artist': '专辑艺术家',
      'album.hint': '这张专辑下所有没有单独设置艺术家的歌曲都会显示这个名字。',
      'set.title': '音乐设置',
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
      'set.fade': '淡入淡出',
      'set.fadeHint': '切歌时先降低音量再淡入，避免突兀的起播。关闭后完全无淡变。',
      'set.artistBulk': '为全部专辑设置艺术家',
      'set.artistBulkHint': '写进音乐库数据库，用于没有标签的本地文件。',
      'set.apply': '应用',
      'set.engine': '播放引擎',
      'set.engineMpv': '独立 mpv 进程',
      'set.engineBrowser': '浏览器音频（降级）',
      'set.exclusive': '独占输出（实验）',
      'set.exclusiveHint': '失败会自动回落到共享输出。共享模式下系统混音器会转换格式。',
      'set.output': '当前输出',
      'set.specs': '格式',
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
      'spec.todo': '未知艺术家',
      'spec.fade': '淡入淡出',
      'queue.empty': '队列是空的',
      'queue.loading': '正在载入队列…',
      'queue.clear': '清空待播放',
      'queue.remove': '从队列移除',
      'queue.drag': '拖动排序',
      'state.noTrack': '未在播放',
      'common.playlists': '播放列表',
      'common.newPlaylist': '新建播放列表',
      'common.name': '名称',
      'common.more': '更多操作',
      'common.save': '保存',
      'common.cancel': '取消',
      'common.confirm': '确定',
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
      'np.collapse': 'Collapse',
      'np.queue': 'Play queue',
      'np.library': 'Library',
      'np.lyrics': 'Lyrics',
      'np.details': 'File & format',
      'np.noLyrics': 'No lyric file',
      'np.untimed': 'Untimed lyrics',
      'np.mode.sequence': 'Play in order',
      'np.mode.one': 'Repeat one',
      'np.mode.all': 'Repeat all',
      'np.mode.shuffle': 'Shuffle',
      'np.volume': 'Volume',
      'np.mute': 'Mute',
      'np.unmute': 'Unmute',
      'np.seek': 'Playback position',
      'lib.all': 'Songs',
      'lib.queue': 'Play queue',
      'lib.folders': 'Folders',
      'lib.albums': 'Albums',
      'lib.artists': 'Artists',
      'lib.playlists': 'Playlists',
      'lib.favorites': 'Favorites',
      'lib.recent': 'Recently added',
      'lib.settings': 'Settings',
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
      'lib.playAll': 'Play all',
      'lib.shuffleAll': 'Shuffle',
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
      'ctx.editAlbum': 'Edit album',
      'ctx.albumCover': 'Set album cover',
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
      'album.title': 'Edit album',
      'album.artist': 'Album artist',
      'album.hint': 'Every song in this album without its own artist shows this name.',
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
      'set.fade': 'Fade in / out',
      'set.fadeHint': 'Dips the volume before a track change and ramps back in. Off means no fading at all.',
      'set.artistBulk': 'Set the artist for every album',
      'set.artistBulkHint': 'Written to the library database for files without tags.',
      'set.apply': 'Apply',
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
      'spec.todo': 'Unknown artist',
      'spec.fade': 'Fade',
      'queue.empty': 'The queue is empty',
      'queue.loading': 'Loading queue…',
      'queue.clear': 'Clear upcoming',
      'queue.remove': 'Remove from queue',
      'queue.drag': 'Drag to reorder',
      'state.noTrack': 'Nothing playing',
      'common.playlists': 'Playlists',
      'common.newPlaylist': 'New playlist',
      'common.name': 'Name',
      'common.more': 'More actions',
      'common.save': 'Save',
      'common.cancel': 'Cancel',
      'common.confirm': 'Confirm',
    }

    let translate = (key) => key
    const t = (key) => {
      const value = translate(key)
      return typeof value === 'string' && value !== '' ? value : key
    }

    /* ────────────────────────── icons (Lucide, ISC) ────────────────────── */

    const ICONS = {
      search: '<path d="m21 21-4.34-4.34" /> <circle cx="11" cy="11" r="8" />',
      folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />',
      heart: '<path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5" />',
      repeat: '<path d="m17 2 4 4-4 4" /> <path d="M3 11v-1a4 4 0 0 1 4-4h14" /> <path d="m7 22-4-4 4-4" /> <path d="M21 13v1a4 4 0 0 1-4 4H3" />',
      repeatOne: '<path d="m17 2 4 4-4 4" /> <path d="M3 11v-1a4 4 0 0 1 4-4h14" /> <path d="m7 22-4-4 4-4" /> <path d="M21 13v1a4 4 0 0 1-4 4H3" /> <path d="M11 10h1v4" />',
      shuffle: '<path d="m18 14 4 4-4 4" /> <path d="m18 2 4 4-4 4" /> <path d="M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22" /> <path d="M2 6h1.972a4 4 0 0 1 3.6 2.2" /> <path d="M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45" />',
      queue: '<path d="M16 5H3" /> <path d="M11 12H3" /> <path d="M11 19H3" /> <path d="M21 16V5" /> <circle cx="18" cy="16" r="3" />',
      disc: '<circle cx="12" cy="12" r="10" /> <path d="M6 12c0-1.7.7-3.2 1.8-4.2" /> <circle cx="12" cy="12" r="2" /> <path d="M18 12c0 1.7-.7 3.2-1.8 4.2" />',
      clock: '<circle cx="12" cy="12" r="10" /> <path d="M12 6v6l4 2" />',
      more: '<circle cx="12" cy="12" r="1" /> <circle cx="19" cy="12" r="1" /> <circle cx="5" cy="12" r="1" />',
      chevronDown: '<path d="m6 9 6 6 6-6" />',
      chevronLeft: '<path d="m15 18-6-6 6-6" />',
      chevronRight: '<path d="m9 18 6-6-6-6" />',
      arrowRight: '<path d="M5 12h14" /> <path d="m12 5 7 7-7 7" />',
      sequence: '<path d="M4 7h10" /> <path d="M4 12h10" /> <path d="M4 17h6" /> <path d="M18 5v12" /> <path d="m15 14 3 3 3-3" />',
      close: '<path d="M18 6 6 18" /> <path d="m6 6 12 12" />',
      minus: '<path d="M5 12h14" />',
      volumeOff: '<path d="M11 4.702a.7.7 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.7.7 0 0 0 11 19.298z" /> <path d="m16.5 14.5 5-5" /> <path d="m16.5 9.5 5 5" />',
      volume: '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" /> <path d="M16 9a5 5 0 0 1 0 6" /> <path d="M19.364 18.364a9 9 0 0 0 0-12.728" />',
      mute: '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" /> <path d="m16.5 14.5 5-5" /> <path d="m16.5 9.5 5 5" />',
      sliders: '<path d="M14 17H5" /> <path d="M19 7h-9" /> <circle cx="17" cy="17" r="3" /> <circle cx="7" cy="7" r="3" />',
      pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" /> <path d="m15 5 4 4" />',
      image: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2" /> <circle cx="9" cy="9" r="2" /> <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />',
      check: '<path d="M20 6 9 17l-5-5" />',
      plus: '<path d="M5 12h14" /> <path d="M12 5v14" />',
      trash: '<path d="M10 11v6" /> <path d="M14 11v6" /> <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /> <path d="M3 6h18" /> <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />',
      restart: '<path d="M21 5H3" /> <path d="M7 12H3" /> <path d="M7 19H3" /> <path d="M12 18a5 5 0 0 0 9-3 4.5 4.5 0 0 0-4.5-4.5c-1.33 0-2.54.54-3.41 1.41L11 14" /> <path d="M11 10v4h4" />',
      library: '<path d="m16 6 4 14" /> <path d="M12 6v14" /> <path d="M8 8v12" /> <path d="M4 4v16" />',
      gauge: '<path d="m12 14 4-4" /> <path d="M3.34 19a10 10 0 1 1 17.32 0" />',
      note: '<path d="M2 10v3" /> <path d="M6 6v11" /> <path d="M10 3v18" /> <path d="M14 8v7" /> <path d="M18 5v13" /> <path d="M22 10v3" />',
    }
    /** Filled transport glyphs — Apple draws these solid, not stroked. */
    const FILLED = {
      play: '<path d="M8.2 5.3a1.1 1.1 0 0 1 1.67-.94l9.6 6.7a1.1 1.1 0 0 1 0 1.88l-9.6 6.7A1.1 1.1 0 0 1 8.2 18.7z"/>',
      pause: '<rect x="6.6" y="4.8" width="3.9" height="14.4" rx="1.5"/><rect x="13.5" y="4.8" width="3.9" height="14.4" rx="1.5"/>',
      prev: '<path d="M11.4 6.5a.85.85 0 0 1 1.35.67v9.66a.85.85 0 0 1-1.35.67l-5.4-4.83a.85.85 0 0 1 0-1.34z"/><path d="M19.3 6.5a.85.85 0 0 1 1.35.67v9.66a.85.85 0 0 1-1.35.67l-5.4-4.83a.85.85 0 0 1 0-1.34z"/>',
      next: '<path d="M12.6 6.5a.85.85 0 0 0-1.35.67v9.66a.85.85 0 0 0 1.35.67l5.4-4.83a.85.85 0 0 0 0-1.34z"/><path d="M4.7 6.5a.85.85 0 0 0-1.35.67v9.66a.85.85 0 0 0 1.35.67l5.4-4.83a.85.85 0 0 0 0-1.34z"/>',
    }

    function Icon({ name, size = 16, strokeWidth = 1.75 }) {
      const filled = FILLED[name]
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        'aria-hidden': 'true',
        focusable: 'false',
        fill: filled === undefined ? 'none' : 'currentColor',
        stroke: filled === undefined ? 'currentColor' : 'none',
        strokeWidth: filled === undefined ? strokeWidth : undefined,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        dangerouslySetInnerHTML: { __html: filled ?? ICONS[name] ?? ICONS.disc },
      })
    }

    /* ─────────────────────────────┬ styles ┬───────────────────────────── */

    const CSS = `
.dshm {
  --dshm-font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI Variable Text", "Segoe UI",
    "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI", "Noto Sans SC", system-ui, sans-serif;
  --dshm-fs-display: 21px; --dshm-fs-title: 13.5px; --dshm-fs-row: 13px; --dshm-fs-body: 13px;
  --dshm-fs-sub: 12px; --dshm-fs-caption: 11px; --dshm-fs-num: 12px;
  --dshm-r-card: 10px; --dshm-r-sheet: 18px;
  --dshm-ease: cubic-bezier(.32,.72,0,1);
  font-family: var(--dshm-font);
  font-synthesis: none;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-primary);
}
.dshm *, .dshm *::before, .dshm *::after { box-sizing: border-box; }
.dshm-mini, .dshm-pop, .dshm-mini-title, .dshm-mini-sub, .dshm-pop-name, .dshm-pop-sub {
  -webkit-user-select: none; user-select: none; }
.dshm-cover img { -webkit-user-drag: none; user-drag: none; pointer-events: none; }
.dshm button { font: inherit; color: inherit; letter-spacing: inherit; }
.dshm svg { display: block; flex: none; }

/* controls */
.dshm-ib { display: inline-grid; place-items: center; width: 28px; height: 28px; border-radius: 8px;
  border: 0; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; flex: none;
  transition: background 130ms var(--dshm-ease), color 130ms var(--dshm-ease), transform 90ms var(--dshm-ease); }
.dshm-ib:hover { color: var(--dsw-alias-label-primary);
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent); }
.dshm-ib:active { transform: scale(.94); }
.dshm-ib[data-active="true"] { color: var(--dsw-alias-brand-primary);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 13%, transparent); }
.dshm-ib[data-size="lg"] { width: 40px; height: 40px; border-radius: 11px; }
.dshm-ib[data-size="xl"] { width: 52px; height: 52px; border-radius: 50%; color: var(--dsw-alias-label-primary); }
.dshm-ib[data-size="xl"]:hover { background: color-mix(in srgb, var(--dsw-alias-label-primary) 9%, transparent); }
.dshm-ib[data-size="xl"]:active { transform: scale(.96); }
.dshm-ib:disabled { opacity: .35; cursor: default; }
.dshm-ib:focus-visible, .dshm-focusable:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
/* Press: a brief, small scale plus a tint — never a bounce. */
.dshm-btn, .dshm-disclose, .dshm-nav, .dshm-card { transition: background 130ms var(--dshm-ease),
  color 130ms var(--dshm-ease), transform 90ms var(--dshm-ease); }
.dshm-btn:active, .dshm-disclose:active { transform: scale(.97); }
.dshm-nav:active { transform: scale(.985); }
.dshm-mini:active { background: color-mix(in srgb, var(--dsw-alias-label-primary) 10%, transparent); }
.dshm-mini-cover:active, .dshm-mini-info:active { transform: none; }
.dshm-ib:active { background: color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent); }
@media (prefers-reduced-motion: reduce) {
  .dshm-ib:active, .dshm-btn:active, .dshm-disclose:active, .dshm-nav:active { transform: none; }
}

/* cover */
.dshm-cover { position: relative; overflow: hidden; background: var(--dsw-alias-bg-layer-2);
  display: grid; place-items: center; flex: none; }
.dshm-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
.dshm-cover-ph { width: 100%; height: 100%; display: grid; place-items: center;
  color: var(--dsw-alias-label-secondary); opacity: .32;
  background: linear-gradient(180deg, color-mix(in srgb, var(--dsw-alias-label-primary) 5%, var(--dsw-alias-bg-layer-2)) 0%,
    var(--dsw-alias-bg-layer-2) 100%); }

/* mini player — one host sidebar row, no card */
.dshm-mini { position: relative; display: block; width: 100%; border: 0; background: transparent;
  border-radius: 7px; padding: 6px 8px 15px; text-align: left; cursor: pointer;
  transition: background 130ms var(--dshm-ease); }
.dshm-mini:hover { background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent); }
.dshm-mini:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -2px; }
.dshm-mini-row { display: flex; align-items: center; gap: 9px; min-width: 0; }
.dshm-mini-cover { border: 0; padding: 0; background: transparent; border-radius: 6px; cursor: pointer; flex: none; }
.dshm-mini-info { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1 1 auto;
  background: transparent; border: 0; padding: 0; text-align: left; cursor: pointer; }
.dshm-mini-title { font-size: var(--dshm-fs-title); font-weight: 600; letter-spacing: -.006em; line-height: 1.2;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.dshm-mini-sub { font-size: var(--dshm-fs-sub); line-height: 1.2; color: var(--dsw-alias-label-secondary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dshm-mini-controls { display: flex; align-items: center; gap: 0; flex: none; }
.dshm-mini[data-collapsed="true"] { padding: 6px; display: flex; justify-content: center; }
.dshm-mini-progress { position: absolute; left: 53px; right: 8px; bottom: 3px; }
.dshm-mini-progress .dshm-progress { height: 8px; }
.dshm-mini-progress .dshm-progress-thumb { display: none; width: 10px; height: 10px; margin: -5px 0 0 -5px; }
.dshm-mini-progress:hover .dshm-progress-thumb,
.dshm-mini-progress .dshm-progress[data-dragging="true"] .dshm-progress-thumb { display: block; }

/* progress */
.dshm-progress { position: relative; display: flex; align-items: center; width: 100%; touch-action: none;
  cursor: pointer; user-select: none; }
.dshm-progress[data-variant="mini"] { height: 10px; }
.dshm-progress[data-variant="sheet"] { height: 20px; }
.dshm-progress-track { position: relative; width: 100%; border-radius: 999px; overflow: hidden;
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 14%, transparent);
  transition: height 130ms var(--dshm-ease); }
.dshm-progress[data-variant="mini"] .dshm-progress-track { height: 3px; }
.dshm-progress[data-variant="sheet"] .dshm-progress-track { height: 4px; }
.dshm-progress[data-variant="mini"]:hover .dshm-progress-track,
.dshm-progress[data-variant="mini"][data-dragging="true"] .dshm-progress-track { height: 5px; }
.dshm-progress[data-variant="sheet"]:hover .dshm-progress-track,
.dshm-progress[data-variant="sheet"][data-dragging="true"] .dshm-progress-track { height: 6px; }
.dshm-progress-fill { height: 100%; width: 100%; transform-origin: left center;
  transform: scaleX(var(--p, 0)); background: var(--dsw-alias-label-primary); border-radius: 999px; }
.dshm-progress-thumb { position: absolute; top: 50%; left: calc(var(--p, 0) * 100%); width: 12px; height: 12px;
  margin: -6px 0 0 -6px; border-radius: 50%; background: var(--dsw-alias-bg-base);
  border: 1px solid var(--dsw-alias-border-l2); box-shadow: 0 1px 4px rgba(0,0,0,.28);
  opacity: 0; transition: opacity 120ms var(--dshm-ease); pointer-events: none; }
.dshm-progress[data-variant="sheet"]:hover .dshm-progress-thumb,
.dshm-progress[data-variant="mini"]:hover .dshm-progress-thumb,
.dshm-progress[data-dragging="true"] .dshm-progress-thumb { opacity: 1; }
.dshm-progress-bubble { position: absolute; bottom: calc(100% + 6px); left: calc(var(--p, 0) * 100%);
  transform: translateX(-50%); padding: 2px 7px; border-radius: 6px; white-space: nowrap;
  background: var(--dsw-alias-bg-overlay); border: 1px solid var(--dsw-alias-border-l1);
  font-size: var(--dshm-fs-caption); font-weight: 600; letter-spacing: .01em;
  color: var(--dsw-alias-label-primary); box-shadow: 0 6px 16px rgba(0,0,0,.18);
  opacity: 0; transition: opacity 110ms var(--dshm-ease); pointer-events: none; }
.dshm-progress[data-dragging="true"] .dshm-progress-bubble { opacity: 1; }

/* now playing popover — Apple Music density: art, name, progress, one control row */
.dshm-pop-error { margin: 4px 12px 8px; padding: 4px 8px; border-radius: 6px; font-size: 11px;
  border: 1px solid var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); }
.dshm-mini-wrap { position: relative; flex: 1 1 auto; min-width: 0; align-self: stretch; }
.dshm-pop { position: fixed; z-index: 80; display: flex; flex-direction: column;
  background: var(--dsw-alias-bg-overlay); border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 14px; box-shadow: 0 20px 48px rgba(0,0,0,.26); overflow: hidden;
  transform-origin: bottom left; animation: dshm-pop-in 160ms var(--dshm-ease); pointer-events: auto; }
.dshm-pop[data-closing="true"] { animation: dshm-pop-out 120ms var(--dshm-ease) forwards; }
.dshm-pop-head { display: flex; align-items: center; gap: 4px; padding: 8px 8px 0; flex: none; }
.dshm-pop-title { flex: 1 1 auto; text-align: center; font-size: var(--dshm-fs-caption); font-weight: 600;
  letter-spacing: .07em; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.dshm-pop-body { padding: 2px 18px 14px; overflow: auto; }
.dshm-pop-art { width: 100%; aspect-ratio: 1 / 1; max-height: 46vh; margin: 2px auto 0; border-radius: 12px;
  overflow: hidden; box-shadow: 0 10px 28px rgba(0,0,0,.20); }
.dshm-pop-meta { padding: 12px 2px 0; min-width: 0; }
.dshm-pop-name { font-size: 17px; font-weight: 600; letter-spacing: -.01em; line-height: 1.25;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dshm-pop-sub { font-size: 13px; color: var(--dsw-alias-label-secondary); margin-top: 2px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dshm-pop-progress { margin-top: 12px; }
.dshm-pop .dshm-progress-thumb { opacity: 1; }
.dshm-pop-times { display: flex; justify-content: space-between; align-items: baseline; margin-top: 4px;
  font-size: var(--dshm-fs-caption); color: var(--dsw-alias-label-secondary); }
.dshm-pop-transport { display: flex; align-items: center; justify-content: space-between; gap: 2px; padding: 10px 2px 2px; }
.dshm-pop-transport .dshm-ib[data-active="true"] { background: transparent; color: var(--dsw-alias-label-primary); }
.dshm-pop-volume { display: flex; align-items: center; gap: 8px; padding: 12px 2px 0; }
.dshm-pop-volume .dshm-progress { height: 18px; }
.dshm-pop-volume .dshm-progress-track { height: 4px; }
.dshm-pop-volume .dshm-progress-thumb { opacity: 1; }
.dshm-pop-more { display: flex; flex-direction: column; gap: 1px; padding-top: 10px; margin-top: 10px;
  border-top: 1px solid var(--dsw-alias-border-l1); }
.dshm-sheet-body { padding: 4px 0 0; overflow: auto; flex: 1 1 auto; min-height: 0; }
.dshm-rowline { display: flex; align-items: center; gap: 6px; padding-top: 6px; }
.dshm-grow { flex: 1 1 auto; }
.dshm-vol { display: flex; align-items: center; gap: 8px; width: 124px; flex: none; }
.dshm-vol .dshm-progress-track { height: 3px; }
.dshm-vol .dshm-progress-fill { background: var(--dsw-alias-label-secondary); }
.dshm-vol .dshm-progress-thumb { display: none; }
.dshm-chips { display: flex; align-items: center; gap: 6px; padding-top: 6px; }
.dshm-chip { font-size: 10.5px; font-weight: 500; letter-spacing: .02em; padding: 1.5px 6px; border-radius: 5px;
  border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary); white-space: nowrap; }
.dshm-disclose { border: 0; background: transparent; color: var(--dsw-alias-label-secondary);
  font-size: var(--dshm-fs-sub); font-weight: 500; padding: 6px 8px; border-radius: 7px; cursor: pointer;
  display: inline-flex; align-items: center; gap: 6px; text-align: left; }
.dshm-disclose:hover { color: var(--dsw-alias-label-primary);
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent); }
.dshm-kv { display: grid; grid-template-columns: 88px 1fr; gap: 5px 10px; font-size: var(--dshm-fs-sub); padding: 10px 2px 2px; }
.dshm-kv dt { color: var(--dsw-alias-label-secondary); }
.dshm-kv dd { margin: 0; overflow-wrap: anywhere; }
.dshm-note { font-size: var(--dshm-fs-sub); color: var(--dsw-alias-label-secondary); line-height: 1.6; padding: 6px 2px 0; }

/* library */
.dshm-page { display: flex; height: 100%; min-height: 0; background: var(--dsw-alias-bg-base); }
.dshm-rail { width: 196px; flex: none; padding: 12px 10px; border-right: 1px solid var(--dsw-alias-border-l1);
  overflow: auto; display: flex; flex-direction: column; gap: 1px; }
.dshm-rail-head { font-size: var(--dshm-fs-caption); font-weight: 600; letter-spacing: .07em; text-transform: uppercase;
  color: var(--dsw-alias-label-secondary); padding: 10px 8px 5px; }
.dshm-nav { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 8px; border-radius: 7px;
  border: 0; background: transparent; cursor: pointer; font-size: var(--dshm-fs-body); font-weight: 400;
  color: var(--dsw-alias-label-primary); text-align: left; }
.dshm-nav:hover { background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent); }
.dshm-nav[data-active="true"] { background: color-mix(in srgb, var(--dsw-alias-label-primary) 10%, transparent); font-weight: 600; }
.dshm-nav-count { margin-left: auto; font-size: var(--dshm-fs-caption); color: var(--dsw-alias-label-secondary); }
.dshm-main { flex: 1 1 auto; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
.dshm-toolbar { display: flex; align-items: center; gap: 8px; padding: 12px 16px; flex-wrap: wrap; flex: none; }
.dshm-h1 { font-size: 17px; font-weight: 600; letter-spacing: -.012em; }
.dshm-count { font-size: var(--dshm-fs-caption); color: var(--dsw-alias-label-secondary); }
.dshm-spacer { flex: 1 1 auto; }
.dshm-field { display: flex; align-items: center; gap: 6px; height: 28px; padding: 0 9px; border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); min-width: 190px;
  color: var(--dsw-alias-label-secondary); }
.dshm-field input { border: 0; background: transparent; color: var(--dsw-alias-label-primary);
  font-size: var(--dshm-fs-body); outline: none; width: 100%; }
.dshm-field:focus-within { border-color: var(--dsw-alias-border-l2); }
.dshm-select { height: 28px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary);
  font-size: var(--dshm-fs-sub); padding: 0 6px; }
.dshm-btn { height: 28px; padding: 0 11px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font-size: var(--dshm-fs-sub);
  font-weight: 500; cursor: pointer; display: inline-flex; align-items: center; gap: 5px;
  transition: background 120ms var(--dshm-ease); }
.dshm-btn:hover { background: var(--dsw-alias-bg-layer-2); }
.dshm-btn[data-primary="true"] { background: var(--dsw-alias-brand-primary); border-color: transparent;
  color: var(--dsw-alias-bg-base); }
.dshm-btn[data-destructive="true"] { color: var(--dsw-alias-state-error-primary); }
.dshm-list { flex: 1 1 auto; overflow: auto; padding: 0 8px 24px; }
.dshm-list-head { display: grid; grid-template-columns: 40px minmax(0, 1fr) 130px 130px 58px 84px; gap: 10px;
  align-items: center; padding: 2px 10px 6px; position: sticky; top: 0; z-index: 1;
  background: linear-gradient(var(--dsw-alias-bg-base) 72%, transparent); }
.dshm-colhead { display: inline-flex; align-items: center; gap: 3px; border: 0; background: transparent;
  padding: 2px 4px; margin: -2px -4px; border-radius: 5px; cursor: pointer;
  font-size: var(--dshm-fs-caption); font-weight: 600; letter-spacing: .07em; text-transform: uppercase;
  color: var(--dsw-alias-label-secondary); }
.dshm-colhead:hover { color: var(--dsw-alias-label-primary);
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent); }
.dshm-colhead[aria-sort="ascending"] { color: var(--dsw-alias-label-primary); }
.dshm-colhead.dshm-num { justify-content: flex-end; }
.dshm-row { display: grid; grid-template-columns: 40px minmax(0, 1fr) 130px 130px 58px 84px; gap: 10px;
  align-items: center; padding: 3px 10px; border-radius: 8px; cursor: default; }
.dshm-row[data-density="comfortable"] { padding: 7px 10px; }
.dshm-row:hover { background: color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent); }
.dshm-row[data-active="true"] { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); }
.dshm-row-title { font-size: var(--dshm-fs-row); font-weight: 500; letter-spacing: -.004em;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dshm-row[data-active="true"] .dshm-row-title { font-weight: 600; }
.dshm-row-sub { font-size: var(--dshm-fs-sub); color: var(--dsw-alias-label-secondary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dshm-row-col { font-size: var(--dshm-fs-sub); color: var(--dsw-alias-label-secondary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dshm-num { text-align: right; justify-content: flex-end; font-variant-numeric: tabular-nums; }
.dshm-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 16px 14px;
  padding: 4px 16px 24px; overflow: auto; }
.dshm-card { border: 0; background: transparent; padding: 0; text-align: left; cursor: default; border-radius: 10px; }
.dshm-card:hover .dshm-card-art { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(0,0,0,.14); }
.dshm-card-art { width: 100%; aspect-ratio: 1/1; border-radius: 10px; overflow: hidden;
  transition: transform 160ms var(--dshm-ease), box-shadow 160ms var(--dshm-ease); }
.dshm-card-title { font-size: var(--dshm-fs-title); font-weight: 600; letter-spacing: -.006em; margin-top: 8px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dshm-card-sub { font-size: var(--dshm-fs-sub); color: var(--dsw-alias-label-secondary); margin-top: 1px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dshm-empty { display: grid; place-items: center; gap: 8px; padding: 56px 24px; text-align: center; }
.dshm-empty-title { font-size: 14px; font-weight: 600; }
.dshm-empty-body { font-size: var(--dshm-fs-sub); color: var(--dsw-alias-label-secondary); max-width: 42ch; line-height: 1.65; }

/* menus & dialogs */
.dshm-menu { position: fixed; z-index: 90; min-width: 212px; padding: 4px; border-radius: 10px;
  background: var(--dsw-alias-bg-overlay); border: 1px solid var(--dsw-alias-border-l1);
  box-shadow: 0 16px 44px rgba(0,0,0,.26); animation: dshm-fade 120ms var(--dshm-ease); }
.dshm-menu-item { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 8px; border: 0;
  border-radius: 6px; background: transparent; font-size: 12.5px; color: var(--dsw-alias-label-primary);
  cursor: pointer; text-align: left; }
.dshm-menu-item:hover { background: color-mix(in srgb, var(--dsw-alias-label-primary) 9%, transparent); }
.dshm-menu-item[data-destructive="true"] { color: var(--dsw-alias-state-error-primary); }
.dshm-menu-sep { height: 1px; margin: 4px 6px; background: var(--dsw-alias-border-l1); }
.dshm-menu-label { font-size: 10.5px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase;
  color: var(--dsw-alias-label-secondary); padding: 6px 8px 3px; }
.dshm-menu-note { font-size: 10.5px; color: var(--dsw-alias-label-secondary); padding: 0 8px 4px; }
.dshm-modal { position: fixed; inset: 0; z-index: 80; display: grid; place-items: center;
  background: color-mix(in srgb, #000 32%, transparent); }
.dshm-dialog { width: min(372px, 92vw); border-radius: 14px; background: var(--dsw-alias-bg-overlay);
  border: 1px solid var(--dsw-alias-border-l1); box-shadow: 0 26px 64px rgba(0,0,0,.30); padding: 18px; }
.dshm-dialog h2 { font-size: 15px; font-weight: 600; letter-spacing: -.01em; margin: 0 0 4px; }
.dshm-dialog .dshm-note { padding: 0 0 12px; }
.dshm-form { display: grid; gap: 10px; }
.dshm-form label { display: grid; gap: 5px; font-size: var(--dshm-fs-caption); font-weight: 500;
  color: var(--dsw-alias-label-secondary); }
.dshm-form input { height: 30px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); padding: 0 9px;
  font-size: var(--dshm-fs-body); }
.dshm-dialog-foot { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }

/* settings */
.dshm-settings { padding: 6px 4px 28px; max-width: 700px; }
.dshm-set-group { padding: 16px 0; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.dshm-set-group:last-child { border-bottom: 0; }
.dshm-set-title { font-size: var(--dshm-fs-caption); font-weight: 600; letter-spacing: .07em;
  text-transform: uppercase; color: var(--dsw-alias-label-secondary); margin: 0 0 10px; }
.dshm-set-row { display: flex; align-items: center; gap: 12px; padding: 6px 0; font-size: var(--dshm-fs-body); }
.dshm-set-row-label { min-width: 0; flex: 1 1 auto; }
.dshm-set-row-hint { font-size: var(--dshm-fs-sub); color: var(--dsw-alias-label-secondary); line-height: 1.55; margin-top: 2px; }
.dshm-root { display: flex; align-items: center; gap: 8px; padding: 7px 9px; border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1); margin-bottom: 6px; }
.dshm-root-path { font-size: var(--dshm-fs-sub); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dshm-logs { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; line-height: 1.6;
  background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px;
  padding: 8px 10px; max-height: 190px; overflow: auto; white-space: pre-wrap; color: var(--dsw-alias-label-secondary); }
.dshm-toggle { appearance: none; width: 36px; height: 21px; border-radius: 11px; border: 0; padding: 0;
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 22%, transparent); position: relative;
  cursor: pointer; flex: none; transition: background 150ms var(--dshm-ease); }
.dshm-toggle::after { content: ""; position: absolute; top: 2px; left: 2px; width: 17px; height: 17px;
  border-radius: 50%; background: var(--dsw-alias-bg-base); box-shadow: 0 1px 2px rgba(0,0,0,.22);
  transition: transform 160ms var(--dshm-ease); }
.dshm-toggle[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
.dshm-toggle[aria-checked="true"]::after { transform: translateX(15px); }

/* lyrics */
.dshm-lyrics { padding: 8px 2px 10px; max-height: 220px; overflow: auto; }
.dshm-lyric-line { font-size: var(--dshm-fs-body); line-height: 1.95; color: var(--dsw-alias-label-secondary);
  transition: color 160ms var(--dshm-ease); }
.dshm-lyric-line[data-active="true"] { color: var(--dsw-alias-label-primary); font-weight: 600; }

@keyframes dshm-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes dshm-pop-in { from { opacity: 0; transform: translateY(8px) scale(.97) } to { opacity: 1; transform: none } }
@keyframes dshm-pop-out { from { opacity: 1; transform: none } to { opacity: 0; transform: translateY(6px) scale(.985) } }
@keyframes dshm-rise { from { opacity: 0; transform: translateY(10px) scale(.995) } to { opacity: 1; transform: none } }
@media (prefers-reduced-motion: reduce) {
  .dshm-pop, .dshm-menu { animation: none !important; }
  .dshm-ib, .dshm-lyric-line, .dshm-toggle, .dshm-toggle::after, .dshm-card-art,
  .dshm-progress-track, .dshm-progress-thumb, .dshm-mini { transition: none !important; }
}
@media (prefers-contrast: more) {
  .dshm-progress-track { background: color-mix(in srgb, var(--dsw-alias-label-primary) 26%, transparent); }
  .dshm-ib { color: var(--dsw-alias-label-primary); }
}
`

    /* ────────────────────────── host calls ─────────────────────────────── */

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

    /* ─────────────────────────── session ───────────────────────────────── */

    const session = (() => {
      let snapshot = { phase: 'loading', status: null, error: null, toast: null }
      const listeners = new Set()
      const emit = () => { for (const listener of listeners) listener() }
      let toastTimer = null
      return {
        get: () => snapshot,
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
        set(patch) { snapshot = { ...snapshot, ...patch }; emit() },
        setStatus(status) { snapshot = { ...snapshot, status, phase: 'ready', error: null }; emit() },
        toast(message) {
          snapshot = { ...snapshot, toast: message }
          emit()
          if (toastTimer !== null) clearTimeout(toastTimer)
          toastTimer = setTimeout(() => { snapshot = { ...snapshot, toast: null }; emit() }, 2400)
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

    /* ─────────────────────────── helpers ───────────────────────────────── */

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

    const cx = (...values) => values.filter((v) => typeof v === 'string' && v !== '').join(' ')

    /* ─────────────────────────── controls ──────────────────────────────── */

    /**
     * A throwing child must never blank a slot cell: the shell deactivates an
     * entry that fails to render and never mounts it again, which is how the
     * player became unopenable twice. The boundary keeps the cell alive and
     * leaves a usable fallback.
     */
    class ErrorBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { failed: false }
      }

      static getDerivedStateFromError() { return { failed: true } }

      componentDidCatch(error) {
        try { console.error('[dsh-music] render failed', error) } catch { /* no console */ }
      }

      render() {
        if (!this.state.failed) return this.props.children
        return this.props.fallback ?? null
      }
    }

    const guardedCell = (Component, fallback) => function GuardedCell(props) {
      return h(ErrorBoundary, { fallback }, h(Component, props))
    }

    function IconButton({ name, label, onClick, disabled, active, size = 'sm', pressed, autoFocus }) {
      return h('button', {
        type: 'button',
        className: 'dshm-ib',
        'data-size': size,
        'data-autofocus': autoFocus ? 'true' : undefined,
        'data-active': active ? 'true' : undefined,
        'aria-label': label,
        'aria-pressed': pressed === undefined ? undefined : (pressed ? 'true' : 'false'),
        title: label,
        disabled: disabled === true,
        onClick: (event) => { event.stopPropagation(); onClick?.(event) },
        onPointerDown: (event) => event.stopPropagation(),
      }, h(Icon, { name, size: size === 'xl' ? 20 : size === 'lg' ? 18 : 16 }))
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
      // `size` may be a percentage for fluid covers; the glyph needs a number.
      const glyph = typeof size === 'number' ? Math.max(12, Math.round(size * 0.28)) : 40
      return h('div', {
        className: 'dshm-cover',
        style: { width: size, height: size, borderRadius: radius },
      }, showImage
        ? h('img', { src: source, alt: '', loading: 'lazy', decoding: 'async', onError: () => setFailed(true) })
        : h('div', { className: 'dshm-cover-ph' }, h(Icon, { name: 'note', size: glyph })))
    }

    /**
     * One progress bar for both surfaces. Hover thickens the track, a thumb and
     * a time bubble appear, pointer-down seeks immediately and drags with the
     * finger, and the arrow keys move by 5s (Shift: 15s).
     */
    function ProgressBar({ getPlayer, onSeek, variant = 'sheet' }) {
      const rootRef = useRef(null)
      const dragRef = useRef(null)
      const pendingRef = useRef(null)
      const [dragging, setDragging] = useState(false)
      const bubbleRef = useRef(null)

      const durationOf = () => getPlayer()?.durationMs ?? 0

      const paint = (fraction) => {
        const node = rootRef.current
        if (node === null) return
        const clamped = Math.max(0, Math.min(1, fraction))
        node.style.setProperty('--p', String(clamped))
        if (bubbleRef.current !== null) {
          bubbleRef.current.textContent = formatTime(clamped * durationOf())
        }
      }

      /**
       * A seek must not visibly snap back. The host publishes the playhead once
       * per second, so right after a click the old value would win for up to a
       * second ("flicker"). Until the host catches up we keep painting the
       * requested position.
       */
      const currentFraction = () => {
        const duration = durationOf()
        if (duration <= 0) return 0
        const pending = pendingRef.current
        if (pending !== null) {
          const age = Date.now() - pending.at
          const host = estimateMs(getPlayer())
          if (age < 1600 && Math.abs(host - pending.ms) > 900) {
            return Math.min(1, pending.ms / duration)
          }
          pendingRef.current = null
        }
        return Math.min(1, estimateMs(getPlayer()) / duration)
      }

      useEffect(() => {
        let frame = 0
        const tick = () => {
          if (dragRef.current === null) paint(currentFraction())
          frame = requestAnimationFrame(tick)
        }
        frame = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(frame)
      }, [getPlayer])

      const fractionFromEvent = (event) => {
        const node = rootRef.current
        if (node === null) return 0
        const rect = node.getBoundingClientRect()
        if (rect.width === 0) return 0
        return Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
      }

      const seekTo = (fraction, commit) => {
        const duration = durationOf()
        if (duration <= 0) return
        const ms = Math.round(fraction * duration)
        pendingRef.current = { ms, at: Date.now() }
        paint(fraction)
        if (commit) onSeek(ms)
      }

      return h('div', {
        ref: rootRef,
        className: 'dshm-progress dshm-focusable',
        'data-variant': variant,
        'data-dragging': dragging ? 'true' : undefined,
        role: 'slider',
        tabIndex: 0,
        'aria-label': t('np.seek'),
        'aria-valuemin': 0,
        'aria-valuemax': Math.round(durationOf()),
        'aria-valuenow': Math.round(estimateMs(getPlayer())),
        'aria-valuetext': formatTime(estimateMs(getPlayer())),
        onPointerDown: (event) => {
          if (event.button !== 0 && event.pointerType === 'mouse') return
          event.stopPropagation()
          event.preventDefault()
          const fraction = fractionFromEvent(event)
          dragRef.current = fraction
          setDragging(true)
          try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* unsupported */ }
          seekTo(fraction, false)
        },
        onPointerMove: (event) => {
          const fraction = fractionFromEvent(event)
          if (dragRef.current === null) {
            if (variant === 'sheet' && bubbleRef.current !== null) bubbleRef.current.textContent = formatTime(fraction * durationOf())
            return
          }
          dragRef.current = fraction
          seekTo(fraction, false)
        },
        onPointerUp: (event) => {
          if (dragRef.current === null) return
          const fraction = fractionFromEvent(event)
          dragRef.current = null
          setDragging(false)
          try { event.currentTarget.releasePointerCapture(event.pointerId) } catch { /* unsupported */ }
          seekTo(fraction, true)
        },
        onPointerCancel: () => { dragRef.current = null; setDragging(false) },
        onKeyDown: (event) => {
          const step = event.shiftKey ? 15000 : 5000
          const current = estimateMs(getPlayer())
          const duration = durationOf()
          if (duration <= 0) return
          if (event.key === 'ArrowLeft') { event.preventDefault(); onSeek(Math.max(0, current - step)) }
          else if (event.key === 'ArrowRight') { event.preventDefault(); onSeek(Math.min(duration, current + step)) }
          else if (event.key === 'Home') { event.preventDefault(); onSeek(0) }
          else if (event.key === 'End') { event.preventDefault(); onSeek(duration) }
        },
      },
      h('div', { className: 'dshm-progress-track' }, h('div', { className: 'dshm-progress-fill' })),
      h('div', { className: 'dshm-progress-thumb' }),
      variant === 'sheet' ? h('div', { className: 'dshm-progress-bubble', ref: bubbleRef }, '0:00') : null)
    }

    function VolumeBar({ value, onChange }) {
      const rootRef = useRef(null)
      const dragging = useRef(false)
      useEffect(() => {
        if (rootRef.current !== null) rootRef.current.style.setProperty('--p', String(Math.max(0, Math.min(1, value / 100))))
      }, [value])
      const apply = (event) => {
        const node = rootRef.current
        if (node === null) return
        const rect = node.getBoundingClientRect()
        if (rect.width === 0) return
        const fraction = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
        node.style.setProperty('--p', String(fraction))
        onChange(Math.round(fraction * 100))
      }
      return h('div', {
        ref: rootRef,
        className: 'dshm-progress dshm-focusable',
        'data-variant': 'sheet',
        style: { height: 18 },
        role: 'slider',
        tabIndex: 0,
        'aria-label': t('np.volume'),
        'aria-valuemin': 0,
        'aria-valuemax': 100,
        'aria-valuenow': Math.round(value),
        onPointerDown: (event) => {
          event.stopPropagation()
          dragging.current = true
          try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* unsupported */ }
          apply(event)
        },
        onPointerMove: (event) => { if (dragging.current) apply(event) },
        onPointerUp: (event) => {
          dragging.current = false
          try { event.currentTarget.releasePointerCapture(event.pointerId) } catch { /* unsupported */ }
          apply(event)
        },
        onKeyDown: (event) => {
          if (event.key === 'ArrowLeft') { event.preventDefault(); onChange(Math.max(0, value - 5)) }
          if (event.key === 'ArrowRight') { event.preventDefault(); onChange(Math.min(100, value + 5)) }
        },
      }, h('div', { className: 'dshm-progress-track' }, h('div', { className: 'dshm-progress-fill' })))
    }

    function TimeText({ getPlayer, className }) {
      const ref = useRef(null)
      useEffect(() => {
        let frame = 0
        let last = -1
        const tick = () => {
          const value = Math.floor(estimateMs(getPlayer()) / 500)
          if (ref.current !== null && value !== last) {
            last = value
            ref.current.textContent = formatTime(value * 500)
          }
          frame = requestAnimationFrame(tick)
        }
        frame = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(frame)
      }, [getPlayer])
      return h('span', { ref, className })
    }

    /* ────────────────────────── ui state ───────────────────────────────── */

    const uiState = { nowPlaying: false, pendingView: 'all', listeners: new Set() }

    function useUi() {
      const [open, setOpen] = useState(uiState.nowPlaying)
      useEffect(() => {
        const listener = () => setOpen(uiState.nowPlaying)
        uiState.listeners.add(listener)
        return () => uiState.listeners.delete(listener)
      }, [])
      return open
    }

    function setNowPlaying(open) {
      uiState.nowPlaying = open
      for (const listener of uiState.listeners) listener()
    }

    /**
     * Open the music panel, optionally on a named view. The panel is a slot
     * entry we do not mount from here; a window event carries the request.
     */
    function openLibraryPanel(view) {
      uiState.pendingView = view ?? 'all'
      window.dispatchEvent(new CustomEvent('dsh-music:open-library', { detail: { view: uiState.pendingView } }))
    }

    /* ──────────────────────── track lookup cache ───────────────────────── */

    const trackCache = new Map()

    function useTrack(trackId, status) {
      const [track, setTrack] = useState(() => (trackId === null ? null : trackCache.get(trackId) ?? null))
      const revision = status?.library?.revision ?? 0
      useEffect(() => {
        let cancelled = false
        if (trackId === null) { setTrack(null); return () => { cancelled = true } }
        const cached = trackCache.get(trackId)
        if (cached !== undefined) setTrack(cached)
        call('library.detail', { id: trackId }).then((detail) => {
          if (cancelled || detail === null) return
          trackCache.set(trackId, detail)
          setTrack(detail)
        }).catch(() => { /* removed from library */ })
        return () => { cancelled = true }
      }, [trackId, revision])
      return track
    }

    /* ────────────────────────── mini player ────────────────────────────── */

    /**
     * The player surface lives inside the sidebar row itself, not in
     * `shell.overlay`: a slot entry that renders "nothing" gets deactivated by
     * the shell and never comes back, which is exactly the "can't open it any
     * more" failure we hit twice. A fixed-position child of the row cannot be
     * deactivated, cannot be clipped by slot collapse, and keeps its anchor by
     * construction.
     */
    function MiniPlayer(props) {
      const snap = useSession()
      const status = snap.status
      const player = status?.player ?? null
      const wide = props?.wide !== false
      const track = useTrack(player?.trackId ?? null, status)
      const [open, setOpen] = useState(false)
      const wrapRef = useRef(null)
      const latest = useRef(player)
      latest.current = player
      const getPlayer = useCallback(() => latest.current, [])

      if (track === null) {
        return h('button', {
          type: 'button',
          className: 'dshm dshm-mini dshm-focusable',
          'data-collapsed': wide ? undefined : 'true',
          'aria-label': t('mini.empty'),
          title: t('mini.empty'),
          onClick: openLibraryPanel,
          style: wide ? { display: 'flex', alignItems: 'center', gap: 9, paddingBottom: 8 } : undefined,
        },
        h(Icon, { name: 'library', size: wide ? 16 : 17 }),
        wide ? h('span', { className: 'dshm-mini-sub', style: { color: 'var(--dsw-alias-label-secondary)' } }, t('mini.empty')) : null)
      }

      const playing = player.playing === true && player.paused !== true
      const showProgress = wide && (status?.prefs?.miniProgress !== false)
      const stop = (event) => event.stopPropagation()
      const toggle = () => setOpen((value) => !value)

      return h('div', { ref: wrapRef, className: 'dshm dshm-mini-wrap' },
        h('div', {
          className: 'dshm-mini',
          'data-collapsed': wide ? undefined : 'true',
          role: 'group',
          'aria-label': `${track.title} — ${t('mini.open')}`,
          onClick: toggle,
        },
        h('div', { className: 'dshm-mini-row' },
          h('button', {
            type: 'button',
            className: 'dshm-mini-cover dshm-focusable',
            'aria-label': t('mini.open'),
            'aria-expanded': open ? 'true' : 'false',
            title: t('mini.open'),
            onClick: (event) => { event.stopPropagation(); toggle() },
          }, h(Cover, { track, size: wide ? 40 : 32, radius: 7 })),

          wide ? h('button', {
            type: 'button',
            className: 'dshm-mini-info dshm-focusable',
            onClick: (event) => { event.stopPropagation(); toggle() },
            'aria-label': `${track.title} — ${t('mini.open')}`,
          },
          h('span', { className: 'dshm-mini-title' }, track.title),
          h('span', { className: 'dshm-mini-sub' }, track.artist ?? t('spec.todo'))) : null,

          wide ? h('div', { className: 'dshm-mini-controls' },
            h(IconButton, { name: 'prev', label: t('mini.prev'), onClick: () => guarded(command('player.prev'), t('mini.prev')) }),
            h(IconButton, {
              name: playing ? 'pause' : 'play',
              label: playing ? t('mini.pause') : t('mini.play'),
              onClick: () => guarded(command('player.toggle'), t('mini.play')),
            }),
            h(IconButton, { name: 'next', label: t('mini.next'), onClick: () => guarded(command('player.next'), t('mini.next')) })) : null),

        showProgress ? h('div', { className: 'dshm-mini-progress', onClick: stop, onPointerDown: stop },
          h(ProgressBar, {
            getPlayer,
            variant: 'mini',
            onSeek: (ms) => guarded(command('player.seek', { ms }), t('np.seek')),
          })) : null),

        h(ErrorBoundary, {
          key: open ? 'open' : 'closed',
          makeFallback: (message) => h('div', {
            className: 'dshm dshm-pop-error',
            title: message,
          }, `${t('panel.label')}: ${message}`),
        },
          h(MiniPopover, {
            open,
            wrapRef,
            track,
            player,
            status,
            getPlayer,
            onClose: () => setOpen(false),
          })))
    }

    /* ────────────────────────── now playing ────────────────────────────── */

    const MODE_ORDER = ['sequence', 'all', 'one']
    const MODE_ICON = { sequence: 'sequence', all: 'repeat', one: 'repeatOne' }
    const MODE_LABEL = { sequence: 'np.mode.sequence', all: 'np.mode.all', one: 'np.mode.one' }

    /** Shuffle toggle — the left slot of Apple Music's transport row. */
    function ShuffleButton({ mode }) {
      const on = mode === 'shuffle'
      return h('button', {
        type: 'button',
        className: 'dshm-ib dshm-focusable',
        'data-active': on ? 'true' : undefined,
        'aria-pressed': on ? 'true' : 'false',
        'aria-label': t('np.mode.shuffle'),
        title: t('np.mode.shuffle'),
        onClick: (event) => {
          event.stopPropagation()
          guarded(command('player.mode', { mode: on ? 'all' : 'shuffle' }), t('np.mode.shuffle'))
        },
      }, h(Icon, { name: 'shuffle', size: 17 }))
    }

    /** Repeat cycles 顺序 → 列表 → 单曲; the right slot of the transport row. */
    function RepeatButton({ mode }) {
      const current = mode === 'shuffle' ? 'all' : mode
      const label = t(MODE_LABEL[current] ?? 'np.mode.all')
      return h('button', {
        type: 'button',
        className: 'dshm-ib dshm-focusable',
        'data-active': current === 'sequence' ? undefined : 'true',
        'aria-label': label,
        title: label,
        onClick: (event) => {
          event.stopPropagation()
          const index = MODE_ORDER.indexOf(current)
          const next = MODE_ORDER[(index + 1) % MODE_ORDER.length]
          guarded(command('player.mode', { mode: next }), label)
        },
      }, h(Icon, { name: MODE_ICON[current] ?? 'repeat', size: 17 }))
    }

    /** Right-hand time: remaining, like Apple Music's miniplayer. */
    function RemainingText({ getPlayer }) {
      const ref = useRef(null)
      useEffect(() => {
        let frame = 0
        let last = -1
        const tick = () => {
          const player = getPlayer()
          const duration = player?.durationMs ?? 0
          const remaining = Math.max(0, duration - estimateMs(player))
          const value = Math.floor(remaining / 500)
          if (ref.current !== null && value !== last) {
            last = value
            ref.current.textContent = `-${formatTime(value * 500)}`
          }
          frame = requestAnimationFrame(tick)
        }
        frame = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(frame)
      }, [getPlayer])
      return h('span', { ref }, '-0:00')
    }

    function MiniPopover({ open, wrapRef, track, player, status, getPlayer, onClose }) {
      const panelRef = useRef(null)

      // Dismiss on outside press, but not when the press is the mini row itself
      // (that click is the toggle).
      useEffect(() => {
        if (!open) return undefined
        const onPointerDown = (event) => {
          if (panelRef.current?.contains(event.target)) return
          if (wrapRef.current?.contains?.(event.target)) return
          onClose()
        }
        const onKey = (event) => {
          if (event.key !== 'Escape') return
          event.stopPropagation()
          onClose()
        }
        document.addEventListener('pointerdown', onPointerDown, true)
        document.addEventListener('keydown', onKey, true)
        return () => {
          document.removeEventListener('pointerdown', onPointerDown, true)
          document.removeEventListener('keydown', onKey, true)
        }
      }, [open, onClose, wrapRef])

      useEffect(() => {
        if (!open) return undefined
        const previous = document.activeElement
        panelRef.current?.querySelector('[data-autofocus="true"]')?.focus?.()
        return () => { try { previous?.focus?.() } catch { /* element gone */ } }
      }, [open])

      if (!open) return null
      // Nothing playing: the popover has nothing to say. The row keeps working.
      if (track === null) return null

      // Measured during render so the very first paint is already in place —
      // measuring in an effect made the panel jump on open (the "flicker").
      const rect = wrapRef.current?.getBoundingClientRect?.() ?? null
      const width = Math.min(300, Math.max(256, window.innerWidth - 24))
      const anchorRight = rect !== null ? rect.right : window.innerWidth - 260
      const anchorTop = rect !== null ? rect.top : window.innerHeight - 64
      const left = Math.max(8, Math.min(anchorRight - width, window.innerWidth - width - 8))
      const bottom = Math.max(8, window.innerHeight - (anchorTop - 8))
      const maxHeight = Math.max(240, window.innerHeight - bottom - 12)

      const playing = player?.playing === true && player?.paused !== true
      const mode = player?.mode ?? 'all'

      return h('div', {
        ref: panelRef,
        className: 'dshm dshm-pop',
        role: 'dialog',
        'aria-modal': 'false',
        'aria-label': t('np.title'),
        style: { left, width, bottom, maxHeight },
        onClick: (event) => event.stopPropagation(),
      },
      h('div', { className: 'dshm-pop-head' },
        h(IconButton, { name: 'chevronDown', label: t('np.collapse'), onClick: onClose, autoFocus: true }),
        h('div', { className: 'dshm-pop-title' }, t('np.title')),
        h(IconButton, {
          name: 'queue',
          label: t('np.queue'),
          onClick: () => { onClose(); openLibraryPanel('queue') },
        })),

      h('div', { className: 'dshm-pop-body', 'data-selectable': 'false' },
        h('div', { className: 'dshm-pop-art' },
          h(Cover, { track, size: '100%', radius: 12 })),
        h('div', { className: 'dshm-pop-meta' },
          h('div', { className: 'dshm-pop-name' }, track.title),
          h('div', { className: 'dshm-pop-sub' }, track.artist ?? t('spec.todo'))),

        h('div', { className: 'dshm-pop-progress' },
          h(ProgressBar, {
            getPlayer,
            variant: 'sheet',
            onSeek: (ms) => guarded(command('player.seek', { ms }), t('np.seek')),
          }),
          h('div', { className: 'dshm-pop-times' },
            h(TimeText, { getPlayer }),
            h(RemainingText, { getPlayer }))),

        h('div', { className: 'dshm-pop-transport' },
          h(ShuffleButton, { mode }),
          h(IconButton, {
            name: 'prev', label: t('mini.prev'), size: 'lg',
            onClick: () => guarded(command('player.prev'), t('mini.prev')),
          }),
          h(IconButton, {
            name: playing ? 'pause' : 'play',
            label: playing ? t('mini.pause') : t('mini.play'),
            size: 'xl',
            onClick: () => guarded(command('player.toggle'), t('mini.play')),
          }),
          h(IconButton, {
            name: 'next', label: t('mini.next'), size: 'lg',
            onClick: () => guarded(command('player.next'), t('mini.next')),
          }),
          h(RepeatButton, { mode })),

        h('div', { className: 'dshm-pop-volume' },
          h(IconButton, {
            name: player?.muted === true || (player?.volume ?? 100) === 0 ? 'volumeOff' : 'volume',
            label: t('np.mute'),
            onClick: () => guarded(command('player.mute', { value: player?.muted !== true }), t('np.mute')),
          }),
          h('div', { className: 'dshm-grow' },
            h(VolumeBar, {
              value: player?.muted === true ? 0 : (player?.volume ?? 100),
              onChange: (value) => guarded(command('player.volume', { value }), t('np.volume')),
            })))))
    }

    /**
     * Queue list. One request returns the whole queue with titles, so there is
     * no per-id render loop and no promise fan-out inside the popover.
     */
    function QueuePanel({ player, tracksVersion }) {
      const ids = player?.queue ?? []
      const cursor = player?.cursor ?? 0
      const [rows, setRows] = useState([])
      const [drag, setDrag] = useState(null)

      useEffect(() => {
        let cancelled = false
        call('queue.list', {}).then((list) => { if (!cancelled) setRows(Array.isArray(list) ? list : []) })
          .catch(() => { if (!cancelled) setRows([]) })
        return () => { cancelled = true }
      }, [ids.join('|'), tracksVersion])

      if (ids.length === 0) {
        return h('div', { className: 'dshm-list' },
          h('div', { className: 'dshm-empty' }, h('div', { className: 'dshm-empty-title' }, t('queue.empty'))))
      }

      if (rows.length === 0) {
        return h('div', { className: 'dshm-list' },
          h('div', { className: 'dshm-empty' }, h('div', { className: 'dshm-empty-title' }, t('queue.loading'))))
      }

      return h('div', { className: 'dshm-list', style: { paddingTop: 8 } },
        h('div', { className: 'dshm-rowline', style: { paddingTop: 0, paddingBottom: 6 } },
          h('span', { className: 'dshm-count' }, String(ids.length)),
          h('span', { className: 'dshm-grow' }),
          h('button', {
            type: 'button', className: 'dshm-btn dshm-focusable',
            onClick: () => guarded(command('queue.set', { ids: ids.slice(0, cursor + 1) }), t('queue.clear')),
          }, t('queue.clear'))),
        ids.map((id, index) => {
          const row = rows[index] ?? {}
          const active = index === cursor
          return h('div', {
            key: `${id}-${index}`,
            draggable: true,
            onDragStart: () => setDrag(index),
            onDragOver: (event) => event.preventDefault(),
            onDrop: (event) => {
              event.preventDefault()
              const from = drag
              setDrag(null)
              if (from === null || from === index) return
              guarded(command('queue.move', { from, to: index }), t('np.queue'))
            },
            className: 'dshm-row',
            'data-active': active ? 'true' : undefined,
            style: { gridTemplateColumns: '34px 1fr 34px', cursor: 'grab' },
          },
          h(Cover, { track: null, trackId: id, size: 30, radius: 5 }),
          h('div', { style: { minWidth: 0 } },
            h('div', { className: 'dshm-row-title' }, row.title ?? '…'),
            h('div', { className: 'dshm-row-sub' }, row.artist ?? '')),
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
        call('library.lrc', { id: trackId }).then((value) => { if (!cancelled) setLyrics(value) })
          .catch(() => { if (!cancelled) setLyrics(null) })
        return () => { cancelled = true }
      }, [trackId])

      useEffect(() => {
        if (lyrics === null || lyrics.kind !== 'synced') return undefined
        let frame = 0
        let last = -2
        const tick = () => {
          const ms = estimateMs(getPlayer())
          let index = -1
          for (let i = 0; i < lyrics.lines.length; i++) {
            const time = lyrics.lines[i].timeMs
            if (time !== null && time <= ms) index = i
            else if (time !== null && time > ms) break
          }
          if (index !== last) {
            last = index
            setActive(index)
            containerRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
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
        [t('spec.source'), [track.bitsPerSample ? `${track.bitsPerSample}bit` : null,
          track.sampleRate ? `${track.sampleRate / 1000}kHz` : null,
          track.channels ? `${track.channels}ch` : null].filter(Boolean).join(' / ') || '—'],
        [t('spec.decoded'), describePcm(engine?.audioDecoded) || '—'],
        [t('spec.device'), describePcm(engine?.audioOut) || t('spec.deviceUnknown')],
        [t('spec.claim'), track.filenameClaim
          ? `${track.filenameClaim} · ${track.claimMatchesMeasurement === true ? t('spec.match')
            : track.claimMatchesMeasurement === false ? t('spec.mismatch') : '—'}`
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

    /* ─────────────────────────── library ───────────────────────────────── */

    const VIEWS = [
      { id: 'all', label: 'lib.all', icon: 'note' },
      { id: 'queue', label: 'lib.queue', icon: 'queue' },
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
      const [view, setView] = useState(uiState.pendingView ?? 'all')
      const [groupKey, setGroupKey] = useState(null)
      const [groupTitle, setGroupTitle] = useState(null)
      const [playlistId, setPlaylistId] = useState(null)
      const [queryInput, setQueryInput] = useState('')
      const [query, setQuery] = useState('')
      const [sort, setSort] = useState('default')
      const [density, setDensity] = useState(snap.status?.prefs?.density ?? 'compact')
      const [tracks, setTracks] = useState([])
      const [groups, setGroups] = useState([])
      const [playlists, setPlaylists] = useState([])
      const [loading, setLoading] = useState(true)
      const [error, setError] = useState(null)
      const [menu, setMenu] = useState(null)
      const [editing, setEditing] = useState(null)
      const [albumEditing, setAlbumEditing] = useState(null)
      const [specTrack, setSpecTrack] = useState(null)
      const coverInput = useRef(null)
      const coverTarget = useRef(null)

      useEffect(() => {
        const handle = setTimeout(() => setQuery(queryInput.trim()), 180)
        return () => clearTimeout(handle)
      }, [queryInput])

      useEffect(() => {
        if (snap.status?.prefs?.density !== undefined) setDensity(snap.status.prefs.density)
      }, [snap.status?.prefs?.density])

      const libraryVersion = status?.library?.tracks ?? 0

      const reload = useCallback(async () => {
        if (view === 'settings') { setLoading(false); return }
        setLoading(true)
        setError(null)
        try {
          const kind = view === 'folders' ? 'folder' : view === 'albums' ? 'album' : view === 'artists' ? 'artist' : null
          if (kind !== null && groupKey === null) {
            setGroups((await call('library.groups', { kind })) ?? [])
            setTracks([])
            setGroupTitle(null)
          } else if (view === 'playlists' && playlistId === null) {
            setPlaylists((await call('playlists.list', {})) ?? [])
            setGroups([])
            setTracks([])
            setGroupTitle(null)
          } else {
            const result = await call('library.list', {
              view: kind !== null ? kind : view,
              key: kind !== null ? groupKey : undefined,
              playlistId: playlistId ?? undefined,
              query,
              sort,
            })
            setTracks(result ?? [])
            if (kind !== null && groupKey !== null) setGroupTitle(result?.[0]?.folderLabel ?? result?.[0]?.albumShort ?? null)
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
        const onOpen = (event) => {
          const next = event?.detail?.view ?? 'all'
          setView(next)
          setGroupKey(null)
          setPlaylistId(null)
        }
        window.addEventListener('dsh-music:open-library', onOpen)
        return () => window.removeEventListener('dsh-music:open-library', onOpen)
      }, [])

      useEffect(() => {
        const onKey = (event) => {
          if (event.key === 'Escape') { setMenu(null); setEditing(null); setAlbumEditing(null) }
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
      }, [])

      const currentIds = tracks.map((track) => track.id)

      const playFrom = (index) => {
        if (currentIds.length === 0) return
        guarded(command('queue.play', { ids: currentIds, startIndex: Math.max(0, index) }), t('lib.playAll'))
      }

      const playGroup = async (kind, key, shuffle) => {
        try {
          const list = await call('library.list', { view: kind, key })
          if (!list || list.length === 0) return
          const ids = list.map((track) => track.id)
          if (shuffle) {
            for (let i = ids.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1))
              const tmp = ids[i]; ids[i] = ids[j]; ids[j] = tmp
            }
          }
          await command('queue.play', { ids, startIndex: 0 })
          if (shuffle) await command('player.mode', { mode: 'shuffle' })
        } catch (error) { session.toast(String(error?.message ?? error)) }
      }

      const openMenu = (event, track) => {
        event.preventDefault()
        const width = 232
        const height = 348
        setMenu({
          kind: 'track',
          track,
          x: Math.min(event.clientX, window.innerWidth - width - 8),
          y: Math.min(event.clientY, window.innerHeight - height - 8),
        })
      }

      const openGroupMenu = (event, group) => {
        event.preventDefault()
        const width = 232
        const height = 220
        setMenu({
          kind: view === 'artists' ? 'artist' : view === 'albums' ? 'album' : 'folder',
          group,
          x: Math.min(event.clientX, window.innerWidth - width - 8),
          y: Math.min(event.clientY, window.innerHeight - height - 8),
        })
      }

      const pickCover = (track) => {
        coverTarget.current = { kind: 'track', track }
        coverInput.current?.click()
      }

      const pickAlbumCover = (group) => {
        coverTarget.current = { kind: 'album', group }
        coverInput.current?.click()
      }

      const onCoverChosen = async (event) => {
        const file = event.target.files?.[0]
        event.target.value = ''
        const target = coverTarget.current
        if (!file || !target) return
        if (file.size > 8 * 1024 * 1024) { session.toast('8 MB max'); return }
        const dataUrl = await new Promise((resolve) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result))
          reader.onerror = () => resolve(null)
          reader.readAsDataURL(file)
        })
        if (dataUrl === null) return
        if (target.kind === 'track') {
          await guarded(command('track.coverFromDataUrl', { id: target.track.id, dataUrl }), t('ctx.cover'))
          trackCache.delete(target.track.id)
        } else {
          await guarded(command('album.coverFromDataUrl', { albumKey: target.group.key, dataUrl }), t('ctx.albumCover'))
        }
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
        if (view === 'settings') return t('lib.settings')
        if (view === 'playlists') {
          if (playlistId !== null) return playlists.find((p) => p.id === playlistId)?.name ?? t('lib.playlists')
          return t('lib.playlists')
        }
        if (groupKey !== null && groupTitle !== null) return groupTitle
        const found = VIEWS.find((entry) => entry.id === view)
        return found ? t(found.label) : t('lib.all')
      })()

      const showGroups = (view === 'folders' || view === 'albums' || view === 'artists') && groupKey === null
      const showQueue = view === 'queue'
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
          playlists.map((playlist) => h('button', {
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
          }, h(Icon, { name: 'plus', size: 15 }), t('common.newPlaylist')),

          h('span', { className: 'dshm-spacer' }),
          h('button', {
            type: 'button',
            className: 'dshm-nav dshm-focusable',
            'data-active': view === 'settings' ? 'true' : undefined,
            onClick: () => { setView('settings'); setGroupKey(null); setPlaylistId(null) },
          }, h(Icon, { name: 'sliders', size: 15 }), t('lib.settings'))),

        h('section', { className: 'dshm-main' },
          h('header', { className: 'dshm-toolbar' },
            groupKey !== null || playlistId !== null
              ? h(IconButton, {
                name: 'chevronLeft', label: t('lib.back'),
                onClick: () => { if (playlistId !== null) setPlaylistId(null); else setGroupKey(null) },
              })
              : null,
            h('h1', { className: 'dshm-h1' }, title),
            view === 'settings' ? null : h('span', { className: 'dshm-count' }, loading ? t('lib.loading')
              : showGroups ? `${groups.length}`
              : showPlaylists ? `${playlists.length}`
                : `${tracks.length} ${t('lib.tracks')}`),
            h('span', { className: 'dshm-spacer' }),
            view === 'settings' ? null : h(React.Fragment, null,
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
              h('button', { type: 'button', className: 'dshm-btn dshm-focusable', onClick: addFolder },
                h(Icon, { name: 'folder', size: 14 }), t('lib.addFolder')),
              h('button', {
                type: 'button', className: 'dshm-btn dshm-focusable',
                onClick: () => guarded(command('library.scan', {}), t('lib.rescan')),
              }, t('lib.rescan')))),

          view === 'settings' ? h('div', { style: { overflow: 'auto', padding: '0 16px' } },
            h(SettingsPage, { embedded: true })) : null,

          error !== null ? h('div', { className: 'dshm-empty' },
            h('div', { className: 'dshm-empty-body' }, error)) : null,

          view !== 'settings' && !showQueue && !loading && tracks.length === 0 && !showGroups && !showPlaylists
            ? h('div', { className: 'dshm-empty' },
              h('div', { className: 'dshm-empty-title' }, query !== '' ? t('lib.empty.search') : t('lib.empty.title')),
              query !== '' ? null : h('div', { className: 'dshm-empty-body' }, t('lib.empty.body')),
              query !== '' ? null : h('button', {
                type: 'button', className: 'dshm-btn dshm-focusable', onClick: addFolder,
              }, t('lib.addFolder')))
            : null,

          showGroups
            ? h('div', { className: 'dshm-cards' }, groups.map((group) => h('button', {
              key: group.key,
              type: 'button',
              className: 'dshm-card dshm-focusable',
              onClick: () => { setGroupKey(group.key); setGroupTitle(group.title) },
              onContextMenu: (event) => openGroupMenu(event, group),
              onDoubleClick: () => playGroup(view === 'folders' ? 'folder' : 'album', group.key, false),
            },
            h('div', { className: 'dshm-card-art' }, h(Cover, {
              track: view === 'folders' ? { id: group.trackId, hasCover: true, mtimeMs: 0 } : null,
              albumKey: view === 'folders' ? null : group.key,
              size: '100%',
              radius: 10,
            })),
            h('div', { className: 'dshm-card-title', title: group.fullTitle ?? group.title }, group.title),
            h('div', { className: 'dshm-card-sub' },
              [view === 'folders' ? group.parentTitle : group.subtitle,
                `${group.trackCount} ${t('lib.tracks')}`].filter(Boolean).join(' · ')))))
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

          showQueue
            ? h(ErrorBoundary, {
              makeFallback: (message) => h('div', { className: 'dshm dshm-pop-error' }, t('lib.queue') + ': ' + message),
            }, h(QueuePanel, { player: status?.player ?? null, tracksVersion: status?.library?.tracks }))
            : null,

          view !== 'settings' && !showQueue && !showGroups && !showPlaylists && tracks.length > 0
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
            const current = menu
            setMenu(null)
            const track = current.track
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
            } else if (action === 'groupPlay') {
              await playGroup(current.kind, current.group.key, false)
            } else if (action === 'groupShuffle') {
              await playGroup(current.kind, current.group.key, true)
            } else if (action === 'groupEdit') {
              setAlbumEditing(current.group)
            } else if (action === 'groupCover') {
              pickAlbumCover(current.group)
            }
          },
        }) : null,

        specTrack !== null ? h(SpecDialog, {
          track: specTrack,
          engine: status?.engine ?? null,
          onClose: () => setSpecTrack(null),
        }) : null,

        editing !== null ? h(EditDialog, {
          track: editing,
          onClose: () => setEditing(null),
          onSaved: () => { trackCache.delete(editing.id); setEditing(null); reload() },
        }) : null,

        albumEditing !== null ? h(AlbumDialog, {
          group: albumEditing,
          onClose: () => setAlbumEditing(null),
          onSaved: () => { setAlbumEditing(null); trackCache.clear(); reload() },
        }) : null,

        h('input', {
          type: 'file',
          accept: 'image/*',
          ref: coverInput,
          style: { display: 'none' },
          onChange: onCoverChosen,
        }))
    }

    function ColumnHeading({ label, active, onClick, align }) {
      return h('button', {
        type: 'button',
        className: cx('dshm-colhead', align === 'end' ? 'dshm-num' : ''),
        'aria-sort': active ? 'ascending' : 'none',
        onClick,
      }, h('span', null, label), active ? h(Icon, { name: 'chevronDown', size: 11 }) : null)
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

    function TrackRow({ track, density, active, onPlay, onMenu }) {
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
      h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 3, alignItems: 'center' } },
        track.favorited
          ? h('span', { style: { color: 'var(--dsw-alias-brand-primary)', display: 'grid', placeItems: 'center', width: 12 } },
            h(Icon, { name: 'heart', size: 12 }))
          : null,
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
        key: action,
        type: 'button',
        className: 'dshm-menu-item',
        'data-destructive': options.destructive ? 'true' : undefined,
        onClick: () => onAction(action),
      }, options.icon ? h(Icon, { name: options.icon, size: 14 }) : null, label)

      if (menu.kind !== 'track') {
        return h('div', {
          ref,
          className: 'dshm dshm-menu',
          role: 'menu',
          style: { left: menu.x, top: menu.y },
          onContextMenu: (event) => event.preventDefault(),
        },
        h('div', { className: 'dshm-menu-label', title: menu.group.title }, menu.group.title),
        item(t('lib.playAll'), 'groupPlay', { icon: 'play' }),
        item(t('lib.shuffleAll'), 'groupShuffle', { icon: 'shuffle' }),
        menu.kind === 'artist' ? null : h('div', { className: 'dshm-menu-sep' }),
        menu.kind === 'artist' ? null : item(t('ctx.editAlbum'), 'groupEdit', { icon: 'pencil' }),
        menu.kind === 'artist' ? null : item(t('ctx.albumCover'), 'groupCover', { icon: 'image' }))
      }

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
      item(t('ctx.edit'), 'edit', { icon: 'pencil' }),
      item(t('ctx.cover'), 'cover', { icon: 'image' }),
      item(t('np.details'), 'spec', { icon: 'disc' }),
      h('div', { className: 'dshm-menu-sep' }),
      item(t('ctx.remove'), 'remove', { destructive: true, icon: 'trash' }),
      h('div', { className: 'dshm-menu-note' }, t('ctx.removeHint')))
    }

    function SpecDialog({ track, engine, onClose }) {
      return h('div', {
        className: 'dshm dshm-modal',
        onPointerDown: (event) => { if (event.target === event.currentTarget) onClose() },
      },
      h('div', { className: 'dshm-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('np.details') },
        h('h2', null, track.title),
        h('div', { className: 'dshm-note', style: { paddingBottom: 4 } }, track.artist ?? t('spec.todo')),
        h(SpecPanel, { track, engine }),
        h('div', { className: 'dshm-dialog-foot' },
          h('button', {
            type: 'button', className: 'dshm-btn dshm-focusable', 'data-primary': 'true', onClick: onClose,
          }, t('common.confirm')))))
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
      return h('div', {
        className: 'dshm dshm-modal',
        onPointerDown: (event) => { if (event.target === event.currentTarget) onClose() },
      },
      h('div', { className: 'dshm-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('edit.title') },
        h('h2', null, t('edit.title')),
        h('div', { className: 'dshm-note' }, t('edit.hint')),
        h('div', { className: 'dshm-form' },
          h('label', null, t('edit.name'), h('input', { value: title, onChange: (event) => setTitle(event.target.value), autoFocus: true })),
          h('label', null, t('edit.artist'), h('input', { value: artist, onChange: (event) => setArtist(event.target.value) })),
          h('label', null, t('edit.album'), h('input', { value: album, onChange: (event) => setAlbum(event.target.value) })),
          h('label', null, t('edit.year'), h('input', { value: year, inputMode: 'numeric', onChange: (event) => setYear(event.target.value) }))),
        h('div', { className: 'dshm-dialog-foot' },
          h('button', { type: 'button', className: 'dshm-btn dshm-focusable', onClick: clear }, t('edit.clear')),
          h('button', { type: 'button', className: 'dshm-btn dshm-focusable', onClick: onClose }, t('edit.cancel')),
          h('button', { type: 'button', className: 'dshm-btn dshm-focusable', 'data-primary': 'true', onClick: save }, t('edit.save')))))
    }

    function AlbumDialog({ group, onClose, onSaved }) {
      const [artist, setArtist] = useState(group.subtitle ?? '')
      const [title, setTitle] = useState(group.title ?? '')
      const [year, setYear] = useState(group.year === null || group.year === undefined ? '' : String(group.year))
      const save = async () => {
        await guarded((async () => {
          await command('album.override', {
            albumKey: group.key,
            patch: {
              title: title.trim() || null,
              artist: artist.trim() || null,
              year: year.trim() === '' ? null : Number(year.trim()),
            },
          })
        })(), t('edit.save'))
        onSaved()
      }
      return h('div', {
        className: 'dshm dshm-modal',
        onPointerDown: (event) => { if (event.target === event.currentTarget) onClose() },
      },
      h('div', { className: 'dshm-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('album.title') },
        h('h2', null, t('album.title')),
        h('div', { className: 'dshm-note' }, t('album.hint')),
        h('div', { className: 'dshm-form' },
          h('label', null, t('edit.album'), h('input', { value: title, onChange: (event) => setTitle(event.target.value), autoFocus: true })),
          h('label', null, t('album.artist'), h('input', { value: artist, onChange: (event) => setArtist(event.target.value) })),
          h('label', null, t('edit.year'), h('input', { value: year, inputMode: 'numeric', onChange: (event) => setYear(event.target.value) }))),
        h('div', { className: 'dshm-dialog-foot' },
          h('button', { type: 'button', className: 'dshm-btn dshm-focusable', onClick: onClose }, t('edit.cancel')),
          h('button', { type: 'button', className: 'dshm-btn dshm-focusable', 'data-primary': 'true', onClick: save }, t('edit.save')))))
    }

    /* ─────────────────────────── settings ──────────────────────────────── */

    function SettingsPage(props) {
      const snap = useSession()
      const status = snap.status
      const prefs = status?.prefs ?? {}
      const engine = status?.engine ?? null
      const [logs, setLogs] = useState([])
      const [roots, setRoots] = useState([])
      const [busy, setBusy] = useState(false)
      const [artistName, setArtistName] = useState('')

      const reloadRoots = useCallback(async () => {
        try { setRoots((await call('roots.list', {})) ?? []) } catch { setRoots([]) }
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

      const applyArtist = async () => {
        const name = artistName.trim()
        if (name === '') return
        await guarded((async () => {
          const albums = await call('library.groups', { kind: 'album' })
          const keys = (albums ?? []).map((album) => album.key)
          await command('album.setArtist', { albumKeys: keys, artist: name })
          session.toast(`${name} · ${keys.length}`)
        })(), t('set.artistBulk'))
      }

      const engineLabel = status?.engineMode === 'mpv' ? t('set.engineMpv') : t('set.engineBrowser')
      const outLabel = describePcm(engine?.audioOut) || t('spec.deviceUnknown')

      const toggle = (label, checked, onChange, hint) => h('div', { className: 'dshm-set-row' },
        h('div', { className: 'dshm-set-row-label' }, label, hint ? h('div', { className: 'dshm-set-row-hint' }, hint) : null),
        h('button', {
          type: 'button',
          className: 'dshm-toggle dshm-focusable',
          role: 'switch',
          'aria-checked': checked ? 'true' : 'false',
          'aria-label': label,
          onClick: () => onChange(!checked),
        }))

      return h('div', { className: cx('dshm', 'dshm-settings'), style: props?.embedded ? { maxWidth: 700 } : undefined },
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
            h('span', { className: 'dshm-set-row-hint', style: { flex: '1 1 auto' } },
              `${status?.library?.tracks ?? 0} ${t('lib.tracks')}${status?.library?.scanning ? ' · scanning…' : ''}`)),
          h('div', { className: 'dshm-set-row' },
            h('input', {
              value: artistName,
              placeholder: t('set.artistBulk'),
              'aria-label': t('set.artistBulk'),
              onChange: (event) => setArtistName(event.target.value),
              style: {
                height: 28, borderRadius: 8, border: '1px solid var(--dsw-alias-border-l1)',
                background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)',
                padding: '0 9px', fontSize: 'var(--dshm-fs-body)', flex: '1 1 auto', minWidth: 0,
              },
            }),
            h('button', { type: 'button', className: 'dshm-btn dshm-focusable', onClick: applyArtist }, t('set.apply'))),
          h('div', { className: 'dshm-set-row-hint' }, t('set.artistBulkHint'))),

        h('section', { className: 'dshm-set-group' },
          h('h3', { className: 'dshm-set-title' }, t('set.playback')),
          h('div', { className: 'dshm-set-row' },
            h('div', { className: 'dshm-set-row-label' }, t('set.defaultVolume')),
            h('div', { style: { width: 160 } }, h(VolumeBar, {
              value: prefs.defaultVolume ?? 100,
              onChange: (value) => setPref({ defaultVolume: value }),
            })),
            h('span', { className: 'dshm-count', style: { width: 34, textAlign: 'right' } }, String(prefs.defaultVolume ?? 100))),
          toggle(t('set.fade'), prefs.fade !== false, (value) => setPref({ fade: value }), t('set.fadeHint')),
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
          toggle(t('set.exclusive'), Boolean(engine?.exclusive),
            (value) => guarded(command('engine.exclusive', { value }), t('set.exclusive')), t('set.exclusiveHint')),
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
            h('button', {
              type: 'button', className: 'dshm-btn dshm-focusable',
              onClick: async () => {
                try { setLogs((await call('diag.logs', {})) ?? []) } catch { setLogs([]) }
              },
            }, t('set.diag')),
            h('button', {
              type: 'button', className: 'dshm-btn dshm-focusable',
              onClick: () => guarded(command('db.backup', {}).then((result) => {
                if (result?.file) session.toast(result.file)
              }), t('set.backup')),
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
      return h('span', { className: 'dshm', style: { display: 'grid', placeItems: 'center' } },
        h(Icon, { name: 'note', size, strokeWidth: props?.active === true ? 2.1 : 1.75 }))
    }

    /* ───────────────────────────── apply ───────────────────────────────── */

    let pickDirectoryImpl = async () => null
    const pickDirectory = () => pickDirectoryImpl()

    function attachKeyboard() {
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
            try {
              ctx.layout.selectPanel('music')
            } catch (error) {
              session.toast(`selectPanel: ${error?.message ?? String(error)}`)
            }
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
        }, guardedCell(MiniPlayer, (message) => h('button', {
          className: 'dshm dshm-btn',
          'data-destructive': 'true',
          title: message,
          onClick: openLibraryPanel,
        }, `${t('mini.empty')} · ${message}`))))

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
        }, guardedCell(LibraryPage, h('div', { className: 'dshm dshm-empty' }, h('div', { className: 'dshm-empty-body' }, 'dsh-music: library failed to render')))))

        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'dsh-music',
          order: 70,
          label: t('panel.label'),
          inject: () => ({ t }),
        }, guardedCell(SettingsPage, h('div', { className: 'dshm dshm-note' }, 'dsh-music: settings failed to render'))))
      },
    }
  },
})
