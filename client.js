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
 *  - Every icon-only control carries an aria-label. The two sliders are native
 *    ranges deliberately left out of the tab order (D-36): the plugin adds no
 *    focus stops to the host's UI, and no key handlers of its own (D-28).
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-music',
  factory(require) {
    // Identity of this file's content: SHA-256 over this source with the line
    // below removed, so stamping is a fixed point. Refresh it with
    // `node scripts/bundle-id.mjs --write`; `npm test` fails while it is stale.
    // Module scope on purpose: bundles are concatenated into one classic script,
    // where a top-level `const` would collide with another module's.
    const BUNDLE_ID = 'dshm-b47547df6ed0' // dsh-music-bundle-id
const POP_EXIT_MS = 160 // keep in sync with --dshm-dur-pop-out (guarded by motion-source test)

    const React = require('react')
    const { useState, useEffect, useLayoutEffect, useRef, useCallback, useSyncExternalStore } = React
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
      'queue.failed': '队列读取失败',
      'queue.failedHint': '队列本身没有变化，可以重试读取',
      'queue.retry': '重试',
      'queue.clear': '停止并清空队列',
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
      'queue.failed': 'Could not read the queue',
      'queue.failedHint': 'The queue itself is unchanged; retry the read',
      'queue.retry': 'Try again',
      'queue.clear': 'Stop and clear queue',
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
  --dshm-ease-out: cubic-bezier(.23,1,.32,1); --dshm-ease-in-out: cubic-bezier(.77,0,.175,1);
  --dshm-dur-press: 160ms; --dshm-dur-press-in: 110ms; --dshm-dur-hover: 130ms;
  --dshm-dur-pop-in: 200ms; --dshm-dur-pop-out: 160ms;
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
  transition: background-color var(--dshm-dur-hover) ease, color var(--dshm-dur-hover) ease,
    transform var(--dshm-dur-press) var(--dshm-ease-out); }
.dshm-ib:hover { color: var(--dsw-alias-label-primary);
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent); }
.dshm-ib:active { transform: scale(.94); transition-duration: var(--dshm-dur-press-in); }
.dshm-ib[data-active="true"] { color: var(--dsw-alias-brand-primary);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 13%, transparent); }
.dshm-ib[data-size="lg"] { width: 44px; height: 44px; border-radius: 12px; }
.dshm-ib:disabled { opacity: .35; cursor: default; }
.dshm-ib:focus-visible, .dshm-focusable:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
/* Press: a brief, small scale plus a tint — never a bounce. */
.dshm-btn, .dshm-nav, .dshm-card { transition: background-color var(--dshm-dur-hover) ease,
  color var(--dshm-dur-hover) ease, transform var(--dshm-dur-press) var(--dshm-ease-out); }
.dshm-btn:active { transform: scale(.97); transition-duration: var(--dshm-dur-press-in); }
.dshm-nav:active { transform: scale(.985); transition-duration: var(--dshm-dur-press-in); }
.dshm-mini:active { background: color-mix(in srgb, var(--dsw-alias-label-primary) 10%, transparent); }
.dshm-mini-cover:active, .dshm-mini-info:active { transform: none; }
.dshm-ib:active { background: color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent); }
@media (prefers-reduced-motion: reduce) {
  .dshm-ib:active, .dshm-btn:active, .dshm-nav:active { transform: none; }
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
  transition: background-color var(--dshm-dur-hover) ease; }
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

/* progress — one native input[type=range] per bar (D-36). The wrapper keeps
   the hit area and owns --p; the control owns the value, the pointer and the
   focus. Painted through ::-webkit-slider-* because that is the only hook
   Chromium gives us for a range's track and thumb. */
.dshm-progress { position: relative; width: 100%; --dshm-track: 4px; --dshm-thumb: 12px;
  --dshm-slot: color-mix(in srgb, var(--dsw-alias-label-primary) 14%, transparent);
  --dshm-fill: var(--dsw-alias-label-primary); }
.dshm-progress[data-variant="sheet"] { height: 20px; }
.dshm-progress[data-variant="volume"] { height: 18px; --dshm-track: 3px;
  --dshm-slot: color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent); }
.dshm-progress[data-variant="mini"] { height: 10px; --dshm-track: 3px; --dshm-thumb: 10px; }
.dshm-progress[data-variant="sheet"]:hover,
.dshm-progress[data-variant="sheet"][data-dragging="true"] { --dshm-track: 6px; }
.dshm-progress[data-variant="mini"]:hover,
.dshm-progress[data-variant="mini"][data-dragging="true"] { --dshm-track: 5px; }
/* The control fills the wrapper, so its box *is* the hit area (DESIGN §7: 20px in
   the panel, 10px in the mini row) — the pointer target never shrinks to the
   visible 3–4px track. */
.dshm-range { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; padding: 0;
  background: transparent; cursor: pointer; -webkit-appearance: none; appearance: none; }
/* D-36: the control is not a tab stop, so a pointer click must not draw a ring. */
.dshm-range:focus:not(:focus-visible) { outline: none; }
/* The fill stops at the thumb's centre: the UA's travel is
   [thumb/2, width - thumb/2], so painting the container's full width would leave
   the fill half a thumb ahead of the thumb at either end of the track. */
.dshm-range::-webkit-slider-runnable-track { height: var(--dshm-track); border-radius: 999px;
  background: linear-gradient(to right,
    var(--dshm-fill) 0 calc(var(--p, 0) * (100% - var(--dshm-thumb)) + var(--dshm-thumb) / 2),
    var(--dshm-slot) calc(var(--p, 0) * (100% - var(--dshm-thumb)) + var(--dshm-thumb) / 2) 100%); }
.dshm-range::-webkit-slider-thumb { -webkit-appearance: none; appearance: none;
  width: var(--dshm-thumb); height: var(--dshm-thumb); border-radius: 50%;
  background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-border-l2);
  box-shadow: 0 1px 4px rgba(0,0,0,.28);
  margin-top: calc((var(--dshm-track) - var(--dshm-thumb)) / 2);
  opacity: 0; transition: opacity 120ms var(--dshm-ease-out); }
/* When the thumb shows (DESIGN §7): panel progress and volume keep it always, the
   mini row reveals it on hover or while dragging, the settings row has none — a
   0px thumb is what makes that fill run the full width. */
.dshm-progress[data-variant="sheet"] .dshm-range::-webkit-slider-thumb,
.dshm-progress[data-variant="volume"] .dshm-range::-webkit-slider-thumb,
.dshm-progress[data-variant="mini"] .dshm-range:hover::-webkit-slider-thumb,
.dshm-progress[data-dragging="true"] .dshm-range::-webkit-slider-thumb { opacity: 1; }
.dshm-progress-bubble { position: absolute; bottom: calc(100% + 6px);
  left: calc(var(--p, 0) * (100% - var(--dshm-thumb)) + var(--dshm-thumb) / 2);
  transform: translateX(-50%); padding: 2px 7px; border-radius: 6px; white-space: nowrap;
  background: var(--dsw-alias-bg-overlay); border: 1px solid var(--dsw-alias-border-l1);
  font-size: var(--dshm-fs-caption); font-weight: 600; letter-spacing: .01em;
  color: var(--dsw-alias-label-primary); box-shadow: 0 6px 16px rgba(0,0,0,.18);
  opacity: 0; transition: opacity 110ms var(--dshm-ease-out); pointer-events: none; }
.dshm-progress[data-dragging="true"] .dshm-progress-bubble { opacity: 1; }

/* now playing popover — Apple Music density: art, name, progress, one control row */
.dshm-pop-error { margin: 4px 12px 8px; padding: 4px 8px; border-radius: 6px; font-size: 11px;
  border: 1px solid var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); }
.dshm-mini-wrap { position: relative; flex: 1 1 auto; min-width: 0; align-self: stretch; }
.dshm-pop { position: fixed; z-index: 80; display: flex; flex-direction: column;
  background: var(--dsw-alias-bg-overlay); border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 14px; box-shadow: 0 20px 48px rgba(0,0,0,.26); overflow: hidden;
  transform-origin: bottom left; pointer-events: auto; opacity: 1; transform: none;
  transition: opacity var(--dshm-dur-pop-in) var(--dshm-ease-out),
    transform var(--dshm-dur-pop-in) var(--dshm-ease-out); }
@starting-style { .dshm-pop { opacity: 0; transform: translateY(10px) scale(.96); } }
.dshm-pop[data-closing="true"] { opacity: 0; transform: translateY(12px) scale(.94);
  transition-duration: var(--dshm-dur-pop-out); pointer-events: none; }
.dshm-pop-head { display: flex; align-items: center; gap: 2px; padding: 6px 12px 0; flex: none; }
.dshm-pop-body { padding: 0 16px 16px; overflow: auto; }
.dshm-pop-art { width: 100%; aspect-ratio: 1 / 1; max-height: 46vh; margin: 6px auto 0; border-radius: 10px;
  overflow: hidden; box-shadow: 0 10px 28px rgba(0,0,0,.20); }
.dshm-pop-meta { padding: 14px 0 0; min-width: 0; }
.dshm-pop-name { font-size: 17px; font-weight: 600; letter-spacing: -.01em; line-height: 1.25;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dshm-pop-sub { font-size: 13px; color: var(--dsw-alias-label-secondary); margin-top: 2px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dshm-pop-progress { margin-top: 14px; }
.dshm-pop-times { display: flex; justify-content: space-between; align-items: baseline; margin-top: 4px;
  font-size: var(--dshm-fs-caption); color: var(--dsw-alias-label-secondary); }
.dshm-pop-transport { display: flex; align-items: center; justify-content: center; gap: 18px; padding: 14px 0 0; }
/* Desktop icon buttons keep the system-style hover plate (HIG · Toolbars). */
.dshm-pop-volume { display: flex; align-items: center; gap: 8px; padding: 9px 0 0; }
.dshm-rowline { display: flex; align-items: center; gap: 6px; padding-top: 6px; }
.dshm-grow { flex: 1 1 auto; }
.dshm-vol { display: flex; align-items: center; gap: 8px; width: 124px; flex: none; }
/* Settings is the one bar without a thumb: the row already prints the number on the
   right, so the thumb would only repeat it. The row's own class, .dshm-vol, carried
   these rules long before anything used it — dead CSS until 2026-11-15, which is how
   the settings bar ended up wearing the panel volume's always-on thumb instead. */
.dshm-vol .dshm-progress { --dshm-thumb: 0px; --dshm-fill: var(--dsw-alias-label-secondary); }
.dshm-vol .dshm-progress[data-variant="volume"] .dshm-range::-webkit-slider-thumb { opacity: 0; }
.dshm-chip { font-size: 10.5px; font-weight: 500; letter-spacing: .02em; padding: 1.5px 6px; border-radius: 5px;
  border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary); white-space: nowrap; }
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
  transition: background-color 120ms ease; }
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
@media (hover: hover) and (pointer: fine) {
  .dshm-card:hover .dshm-card-art { transform: translateY(-1px); }
}
.dshm-card-art { width: 100%; aspect-ratio: 1/1; border-radius: 10px; overflow: hidden;
  transition: transform var(--dshm-dur-hover) var(--dshm-ease-out); }
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
  box-shadow: 0 16px 44px rgba(0,0,0,.26); animation: dshm-fade 120ms var(--dshm-ease-out); }
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
  cursor: pointer; flex: none; transition: background-color var(--dshm-dur-hover) ease; }
.dshm-toggle::after { content: ""; position: absolute; top: 2px; left: 2px; width: 17px; height: 17px;
  border-radius: 50%; background: var(--dsw-alias-bg-base); box-shadow: 0 1px 2px rgba(0,0,0,.22);
  transition: transform 160ms var(--dshm-ease-out); }
.dshm-toggle[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
.dshm-toggle[aria-checked="true"]::after { transform: translateX(15px); }

/* lyrics */
.dshm-lyrics { padding: 8px 2px 10px; max-height: 220px; overflow: auto; }
.dshm-lyric-line { font-size: var(--dshm-fs-body); line-height: 1.95; color: var(--dsw-alias-label-secondary);
  transition: color var(--dshm-dur-hover) ease; }
.dshm-lyric-line[data-active="true"] { color: var(--dsw-alias-label-primary); font-weight: 600; }

@keyframes dshm-fade { from { opacity: 0 } to { opacity: 1 } }
@media (prefers-reduced-motion: reduce) {
  .dshm-pop, .dshm-menu { animation: none !important; }
  .dshm-pop { transition: none !important; }
  .dshm-ib, .dshm-lyric-line, .dshm-toggle, .dshm-toggle::after, .dshm-card-art,
  .dshm-range, .dshm-mini { transition: none !important; }
}
@media (prefers-contrast: more) {
  .dshm-progress { --dshm-slot: color-mix(in srgb, var(--dsw-alias-label-primary) 26%, transparent); }
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

    /**
     * Status answers arrive out of order: the 1 Hz poll and the refresh that
     * follows every command run concurrently, and a command sits on the host for
     * a couple of hundred milliseconds (fade, mpv confirmation), so a poll issued
     * before the click can come back after the answer that carries the result.
     * Applying that older answer re-anchors the playhead on a stale position and
     * turns "advancing" back on — the bar rips backwards, then forward on the
     * next poll. That is why a pause looked *sometimes* broken.
     *
     * Requests are numbered when they are issued, so no clock is involved and a
     * host restart cannot invert the order. See `docs/DECISIONS.md` D-32.
     */
    let statusSeq = 0
    let lastAppliedStatusId = 0

    /**
     * Apply an answer only if no fresher request has been answered already.
     *
     * Both outcomes of `refreshStatus` go through here — success and failure —
     * because the gate is about *which request* the answer belongs to, not about
     * what it says (D-32): a slow failure must not paint "error" over an answer
     * that already landed, and an applied failure still advances the number so
     * an older success cannot revive afterwards.
     */
    function commitAnswer(requestId, apply) {
      if (!acceptResponse(lastAppliedStatusId, requestId)) return false
      lastAppliedStatusId = requestId
      apply()
      return true
    }

    async function refreshStatus() {
      const requestId = statusSeq += 1
      try {
        const status = await call('status', {})
        if (!commitAnswer(requestId, () => session.setStatus(status))) return null
        return status
      } catch (error) {
        commitAnswer(requestId, () => session.set({ phase: 'error', error: String(error?.message ?? error) }))
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

    /* ── BEGIN inlined lib/shared/playhead.js ── generated by `node scripts/inline-playhead.mjs --write`; edit the module, never this copy ── */
    /**
     * Playhead arithmetic — pure, dependency-free, and the only place that reads
     * "a position the host sampled once per second" as "where the playhead is now".
     *
     * `client.js` carries a copy between its `BEGIN inlined lib/shared/playhead.js` /
     * `END …` markers, written by `node scripts/inline-playhead.mjs --write` and
     * checked by `test/inline-playhead.test.mjs`. Edit here; never edit the copy.
     *
     * Two clocks, two questions — the split is the point of this file:
     *
     *  - **How much time has passed?** The caller's *monotonic* clock
     *    (`performance.now()`), anchored when the snapshot landed. Wall readings jump
     *    on NTP steps and suspend/resume, and a jumped clock used for interpolation
     *    shows up as the bar leaping. Neither function here reads a clock; both take
     *    the reading as a parameter, which is also how the tests fix time.
     *  - **Did the host see my seek yet?** The *wall* clock. The host stamps
     *    `positionSampledAt` with `Date.now()`, so comparing it against the wall
     *    reading taken when the seek was requested is the only cross-process
     *    comparison available. A snapshot stamped *before* the request is the 1 Hz
     *    one already in flight — stale, and painting it is what made the bar snap
     *    back after a seek.
     *
     * Both ends of the position are clamped. Upper: never past the duration. Lower:
     * never below zero — an anchor later than `now` is clock skew, not a rewind
     * (Home Assistant's `getCurrentProgress` clamps it for the same reason).
     *
     * Precedent: media-chrome `range-animation.ts` (interpolation in its own unit,
     * monotonic clock), video.js 10 `TimeCore` (seek state owned by the state layer,
     * no duration threshold), Home Assistant's exported `getCurrentProgress`.
     * See `docs/research/2026-11-13-playhead-architecture.md`.
     */

    /**
     * Is the host's position advancing right now?
     *
     * Both flags must be present: the host always publishes `paused` as a real
     * boolean, so an absent flag means a malformed snapshot, and inventing motion
     * from one is worse than holding still.
     */
    function isAdvancing(player) {
      return player !== null && player !== undefined && player.playing === true && player.paused === false
    }

    /**
     * Freeze a host snapshot onto the caller's monotonic clock.
     *
     * The host's own `positionSampledAt` is deliberately dropped here: it is a wall
     * reading, and using it to interpolate is what makes the playhead jump when the
     * wall clock does. It is still needed — for the seek latch, which is why
     * `resolveSeek` takes it separately.
     *
     * @param {object|null|undefined} player host snapshot: `positionMs`, `durationMs`, `playing`, `paused`
     * @param {number} receivedAtMs monotonic reading taken when this snapshot landed
     * @returns {{ positionMs: number, anchorMs: number, durationMs: number, advancing: boolean }|null}
     */
    function anchorOf(player, receivedAtMs) {
      if (player === null || player === undefined) return null
      return {
        positionMs: finiteOr(player.positionMs, 0),
        anchorMs: finiteOr(receivedAtMs, 0),
        durationMs: finiteOr(player.durationMs, 0),
        advancing: isAdvancing(player),
        // The host's own stamp, kept only as the sample's identity: two reads with
        // the same `sampleMs` and position are the same sample, and re-anchoring one
        // of them is what makes the bar rewind. See `nextAnchor`.
        sampleMs: finiteOr(player.positionSampledAt, 0),
      }
    }

    /**
     * Decide the anchor to keep after another read of the player.
     *
     * The client re-reads `status` far more often than the host samples: once a
     * second by poll, and again after every command. Those extra reads carry the
     * sample it already has, and re-dating them restarts interpolation from the same
     * position — the bar jumps back and creeps forward again. So the anchor is
     * reused while the sample is unchanged, and replaced when a genuinely new sample
     * (or a transport change) arrives.
     *
     * @param {object|null|undefined} previous the anchor in use
     * @param {object|null|undefined} player the player as just read
     * @param {number} receivedAtMs monotonic reading taken now
     * @returns {object|null} the anchor to use, possibly `previous` itself
     */
    function nextAnchor(previous, player, receivedAtMs) {
      const fresh = anchorOf(player, receivedAtMs)
      if (fresh === null) return null
      if (previous === null || previous === undefined) return fresh
      const sameSample = previous.sampleMs === fresh.sampleMs
        && previous.positionMs === fresh.positionMs
        && previous.durationMs === fresh.durationMs
        && previous.advancing === fresh.advancing
      return sameSample ? previous : fresh
    }

    /**
     * Where the playhead is at `nowMs`.
     * @param {object|null} anchor from `anchorOf`
     * @param {number} nowMs monotonic reading
     * @returns {number} milliseconds, within `0 .. durationMs` when the duration is known
     */
    function positionOf(anchor, nowMs) {
      if (anchor === null || anchor === undefined) return 0
      const base = finiteOr(anchor.positionMs, 0)
      const anchorMs = finiteOr(anchor.anchorMs, 0)
      // No anchor reading means no way to date the sample: advancing from 0 would
      // invent a position.
      const advance = anchor.advancing === true && anchorMs > 0 && Number.isFinite(nowMs)
        ? Math.max(0, nowMs - anchorMs)
        : 0
      const value = Math.max(0, base + advance)
      const duration = finiteOr(anchor.durationMs, 0)
      return duration > 0 ? Math.min(value, duration) : value
    }

    /**
     * The playhead as a 0..1 fraction, for progress bars and `aria-valuenow`.
     */
    function fractionOf(anchor, nowMs) {
      const duration = finiteOr(anchor?.durationMs, 0)
      if (!(duration > 0)) return 0
      return clamp01(positionOf(anchor, nowMs) / duration)
    }

    /**
     * Time left in the track, for the `−3:21` readout. Zero when the duration is unknown.
     */
    function remainingOf(anchor, nowMs) {
      const duration = finiteOr(anchor?.durationMs, 0)
      if (!(duration > 0)) return 0
      return Math.max(0, duration - positionOf(anchor, nowMs))
    }

    /**
     * What this frame should write to the DOM — and whether it should write at all.
     *
     * A paused playhead does not move, but the paint loop still runs sixty times a
     * second. Assigning the fill's `--p` and the bubble's text unconditionally
     * invalidates style and layout on every one of those frames, and the two things
     * `--p` drives (`left: calc(...)` on the thumb, `scaleX(...)` on the fill)
     * re-round each time: at rest that is a visible ~1 px shimmer. The two time
     * readouts never had this problem because they already skip unchanged values.
     *
     * The fraction is rounded to 1e-5 — roughly a hundredth of a pixel on a wide
     * bar — so sub-pixel noise can never be mistaken for movement.
     *
     * @param {{ fraction: number, label: string }|null|undefined} previous the values last written
     * @param {{ fraction: number, label: string }} next this frame's values
     * @returns {{ write: boolean, fraction: number, label: string }}
     */
    function nextPaint(previous, next) {
      const raw = finiteOr(next?.fraction, 0)
      const fraction = Math.round(clamp01(raw) * 1e5) / 1e5
      const label = typeof next?.label === 'string' ? next.label : ''
      const unchanged = previous !== null && previous !== undefined
        && previous.fraction === fraction
        && previous.label === label
      return { write: !unchanged, fraction, label }
    }

    /**
     * The seek latch: which position should the bar paint right now?
     *
     * Replaces the old "1600ms and at least 900ms away" pair. Both were proxies for
     * the real question — *is this snapshot older than my request?* — and the 900ms
     * one could release the latch early on the very snapshot it was meant to hide.
     *
     * @param {{ ms: number, atMs: number }|null|undefined} pending the request: target position and the wall reading taken when it was made
     * @param {object|null|undefined} player the newest host snapshot (`positionSampledAt`, wall clock; 0 when never sampled)
     * @param {number} wallNowMs the wall reading taken now
     * @returns {{ pending: object|null, ms: number|null }} `ms` is the position to paint while latched, `null` to trust the host
     */
    function resolveSeek(pending, player, wallNowMs) {
      if (pending === null || pending === undefined) return { pending: null, ms: null }
      const requestedAt = finiteOr(pending.atMs, 0)
      const sampledAt = finiteOr(player?.positionSampledAt, 0)
      // An undatable request cannot be argued for: do not latch on a timestamp we
      // do not have.
      if (requestedAt <= 0) return { pending: null, ms: null }
      // The host stamps when it *applies* the seek, so a stamp at or after our
      // request proves it has seen it. Anything earlier is the in-flight snapshot,
      // and a snapshot that does not exist yet (0) proves nothing at all.
      if (sampledAt >= requestedAt) return { pending: null, ms: null }
      // The wall clock ran backwards (suspend/resume, NTP): the request can no longer
      // be dated against the host's stamps. Freezing the bar is worse than one frame
      // of stale position, so let go.
      if (requestedAt > finiteOr(wallNowMs, 0)) return { pending: null, ms: null }
      return { pending, ms: Math.max(0, finiteOr(pending.ms, 0)) }
    }

    /**
     * The seek queue: one request in flight at a time.
     *
     * `resolveSeek` decides the latch by comparing wall stamps, and the host stamps
     * `positionSampledAt` **when it applies** a seek. That works for one request;
     * with two in flight it breaks in a way that looks like a different bug: press
     * `→` twice, and the *first* seek's stamp is newer than the *second* request, so
     * the second latch lets go on the older position and the bar steps back for one
     * poll. (Measured in the prototype: three fast presses moved the bar by two
     * steps, and one of the three was swallowed.)
     *
     * The fix is ordering, not thresholds: keep at most one request in flight, and
     * let the newest target overwrite whatever is queued behind it. Then "a stamp at
     * or after my request" is true again for every request that is actually in
     * flight, which is the only assumption `resolveSeek` ever made.
     *
     * @param {{ inFlight: boolean, queued: number|null }|null|undefined} state
     * @param {number} requestMs target position for this request
     * @returns {{ send: number|null, state: { inFlight: boolean, queued: number|null } }}
     */
    function planSeek(state, requestMs) {
      const target = Math.max(0, finiteOr(requestMs, 0))
      if (state !== null && state !== undefined && state.inFlight === true) {
        return { send: null, state: { inFlight: true, queued: target } }
      }
      return { send: target, state: { inFlight: true, queued: null } }
    }

    /**
     * The in-flight request landed: send the newest queued target, or go idle.
     * @param {{ inFlight: boolean, queued: number|null }|null|undefined} state
     * @returns {{ send: number|null, state: { inFlight: boolean, queued: number|null } }}
     */
    function settleSeek(state) {
      const queued = state !== null && state !== undefined && Number.isFinite(state.queued)
        ? Math.max(0, state.queued)
        : null
      if (queued === null) return { send: null, state: idleSeek() }
      return { send: queued, state: { inFlight: true, queued: null } }
    }

    /** A queue with nothing in flight and nothing waiting. */
    function idleSeek() {
      return { inFlight: false, queued: null }
    }

    /**
     * Should this status answer be applied at all?
     *
     * The client asks for `status` from two places — the 1 Hz poll and the refresh
     * after every command — and nothing orders the answers. A command sits on an
     * `await` for a couple of hundred milliseconds (fade, mpv confirmation), so a
     * poll issued before the click can be served and returned after the refresh that
     * carries the result. Applying it re-anchors the playhead on an older position
     * *and* flips `advancing` back on: the bar rips backwards, then forward again on
     * the next poll.
     *
     * Requests are numbered when they are **issued**, so ordering needs no clock and
     * cannot be inverted by a wall-clock jump or a host restart — unlike the host's
     * `uptimeMs`, which resets whenever the process does.
     *
     * @param {number} lastAppliedId request number of the answer already on screen (0 for none)
     * @param {number} responseId request number this answer belongs to
     * @returns {boolean} whether to apply it
     */
    function acceptResponse(lastAppliedId, responseId) {
      if (!Number.isFinite(responseId)) return false
      return responseId > finiteOr(lastAppliedId, 0)
    }

    /** A non-number (missing field, `NaN` from a half-written snapshot) falls back. */
    function finiteOr(value, fallback) {
      return Number.isFinite(value) ? value : fallback
    }

    function clamp01(value) {
      if (value < 0) return 0
      return value > 1 ? 1 : value
    }
    /* ── END inlined lib/shared/playhead.js ── */

    /**
     * The playhead sample: the host's position frozen onto this page's monotonic
     * clock. Two layers, for two different reasons:
     *  - object identity is the cheap per-frame guard (the rAF loops ask 60×/s);
     *  - `nextAnchor` is the correct one: it keeps the existing anchor while the
     *    sample is unchanged, so re-reading `status` (every poll, and again after
     *    each command) does not restart interpolation and rewind the bar.
     */
    let anchorCache = null
    let anchorCacheFor = null
    function anchorFor(player) {
      if (player !== anchorCacheFor) {
        anchorCacheFor = player
        anchorCache = nextAnchor(anchorCache, player, performance.now())
      }
      return anchorCache
    }

    /**
     * Where the playhead is *now*. The arithmetic lives in the inlined block above
     * (source: `lib/shared/playhead.js`, tested by `test/playhead.test.mjs`); the
     * clock reading is passed in there, and this is the only place in the file
     * that reads one.
     */
    function estimateMs(player) {
      return positionOf(anchorFor(player), performance.now())
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
        this.state = { failed: false, message: '' }
      }

      // Keep the message: the fallbacks in this file render text, and an empty
      // box is indistinguishable from "nothing was supposed to be here".
      static getDerivedStateFromError(error) {
        return { failed: true, message: String(error?.message ?? error ?? 'render failed') }
      }

      componentDidCatch(error) {
        try { console.error('[dsh-music] render failed', error) } catch { /* no console */ }
      }

      render() {
        if (!this.state.failed) return this.props.children
        // Two call shapes exist in this file: `fallback` (an element) and
        // `makeFallback(message)` (a function). Both are honoured; reading only
        // `fallback` silently rendered null and made a crash look like empty space.
        const fallback = this.props.fallback ?? this.props.makeFallback
        return typeof fallback === 'function' ? fallback(this.state.message) : (fallback ?? null)
      }
    }

    const guardedCell = (Component, fallback) => function GuardedCell(props) {
      return h(ErrorBoundary, { fallback }, h(Component, props))
    }

    function IconButton({ name, label, onClick, disabled, active, size = 'sm', glyph, pressed, autoFocus }) {
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
      }, h(Icon, { name, size: glyph ?? (size === 'lg' ? 18 : 16) }))
    }

    function Cover({ track, albumKey, size, radius = 8, trackId }) {
      const [failed, setFailed] = useState(false)
      const id = track?.id ?? trackId ?? null
      // `track` may legitimately be null when the caller only knows an id (the
      // queue rows do exactly that). Only an explicit `hasCover: false` means
      // "no cover"; absent information still points at the cover route.
      const source = id !== null && track?.hasCover !== false
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
     * One progress bar for both surfaces, as a native `<input type="range">`
     * (D-36). The platform owns the control — pointer drags that leave the bar,
     * touch, high contrast, and the arrow keys if anything ever focuses it. This
     * file owns three things only: the fill's `--p`, the drag bubble, and the
     * control's `value`, the one write that moves the thumb.
     *
     * It is deliberately **not a tab stop**: the plugin never inserts itself into
     * the host's focus order, which is what D-28 was really protecting. The
     * implicit `role=slider` is still honest — unlike the `progressbar` this
     * replaces, which ARIA defines as always read-only while we let people drag it.
     */
    /**
     * Where a pointer sits on a range, as a 0..1 fraction of its **travel**.
     *
     * The thumb's centre runs from `thumb/2` to `width - thumb/2`, not from 0 to
     * width, so this is the formula the gradient fill and the drag bubble already
     * use. The thumb size is read back from the CSS (`--dshm-thumb`), so the
     * drawing, the bubble and the hit test cannot disagree.
     */
    function fractionAtClientX(node, clientX, thumbPx) {
      if (node === null) return 0
      const rect = node.getBoundingClientRect()
      const travel = rect.width - thumbPx
      if (!(travel > 0)) return 0
      return Math.min(1, Math.max(0, (clientX - rect.left - thumbPx / 2) / travel))
    }

    function thumbPxOf(node) {
      if (node === null) return 0
      const px = Number.parseFloat(getComputedStyle(node).getPropertyValue('--dshm-thumb'))
      return Number.isFinite(px) ? px : 0
    }

    const SEEK_STEP_MS = 1000

    function ProgressBar({ getPlayer, onSeek, variant = 'sheet' }) {
      const rootRef = useRef(null)
      const inputRef = useRef(null)
      const bubbleRef = useRef(null)
      const dragRef = useRef(null)
      const pendingRef = useRef(null)
      const paintedRef = useRef(null)
      const writtenRef = useRef(-1)
      const seekRef = useRef(idleSeek())
      const [dragging, setDragging] = useState(false)

      const durationOf = () => getPlayer()?.durationMs ?? 0

      /**
       * A range cannot hold a value off its step grid, and its largest valid value
       * is `floor(max / step) * step` — under a second short of the track's end.
       * Nothing audible lives in that last step, so the value is clamped rather
       * than the maximum being rounded up.
       */
      const quantise = (ms, duration) => {
        const last = Math.max(0, Math.floor(duration / SEEK_STEP_MS) * SEEK_STEP_MS)
        return Math.min(last, Math.max(0, Math.round(ms / SEEK_STEP_MS) * SEEK_STEP_MS))
      }

      /**
       * Paint at most once per change. The rAF loop asks sixty times a second;
       * while paused the answer is identical every frame, and writing it anyway
       * invalidates style and layout each time — which is how a still bar
       * shimmered by about a pixel (B32).
       *
       * Two writers, two guards. `--p` follows the *host* position, which is what
       * makes the fill glide; the value follows the step grid and is never written
       * while a drag is in progress, because then the control already holds the
       * truth. The bubble's text is written only while the bubble is visible:
       * writing it while it is hidden is invisible work, the same mistake B32
       * found in a different costume.
       */
      const paint = (ms) => {
        const node = rootRef.current
        const input = inputRef.current
        if (node === null || input === null) return
        const duration = durationOf()
        const max = String(Math.round(Math.max(0, duration)))
        if (input.max !== max) {
          input.max = max
          writtenRef.current = -1
        }
        const value = quantise(ms, duration)
        if (writtenRef.current !== value) {
          writtenRef.current = value
          input.value = String(value)
          input.setAttribute('aria-valuetext', formatTime(value))
        }
        const fraction = duration > 0 ? Math.min(1, Math.max(0, ms / duration)) : 0
        const next = nextPaint(paintedRef.current, {
          fraction,
          label: dragRef.current === null ? '' : formatTime(ms),
        })
        if (next.write === false) return
        paintedRef.current = { fraction: next.fraction, label: next.label }
        node.style.setProperty('--p', String(next.fraction))
        if (bubbleRef.current !== null && dragRef.current !== null) {
          bubbleRef.current.textContent = next.label
        }
      }

      /**
       * What the bar should show: the seat of a request still in flight, otherwise
       * the interpolated host position. The latch is the module's job (D-27); this
       * only asks it.
       */
      const currentMs = () => {
        const player = getPlayer()
        const latched = resolveSeek(pendingRef.current, player, Date.now())
        pendingRef.current = latched.pending
        return latched.ms === null ? estimateMs(player) : latched.ms
      }

      /**
       * One seek in flight at a time (D-36). Two overlapping requests break the
       * latch: the first one's stamp is newer than the second request, so the bar
       * lets go on the older position and steps back for a poll. The queue keeps
       * only the newest target — which is also what holding a key means.
       */
      const dispatch = (ms) => {
        const plan = planSeek(seekRef.current, ms)
        seekRef.current = plan.state
        if (plan.send === null) return
        Promise.resolve()
          .then(() => onSeek(plan.send))
          .then(() => null, () => null)
          .finally(() => {
            const settled = settleSeek(seekRef.current)
            seekRef.current = settled.state
            if (settled.send !== null) dispatch(settled.send)
          })
      }

      /**
       * Move the bar to the pointer without asking the host yet. The request waits
       * for the release, exactly like this component always did.
       */
      const seekFromPointer = (event) => {
        const duration = durationOf()
        if (!(duration > 0)) return null
        const thumb = dragRef.current?.thumb ?? thumbPxOf(rootRef.current)
        const ms = Math.round(fractionAtClientX(rootRef.current, event.clientX, thumb) * duration)
        pendingRef.current = { ms, atMs: Date.now() }
        paint(ms)
        return ms
      }

      // Before the first browser paint: a bar that starts at zero and jumps to the
      // real position one frame later is a flash, not a load.
      useLayoutEffect(() => { paint(currentMs()) }, [])

      useEffect(() => {
        let frame = 0
        const tick = () => {
          if (dragRef.current === null) paint(currentMs())
          frame = requestAnimationFrame(tick)
        }
        frame = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(frame)
      }, [getPlayer])

      return h('div', {
        ref: rootRef,
        className: 'dshm-progress',
        'data-variant': variant,
        'data-dragging': dragging ? 'true' : undefined,
      },
      h('input', {
        ref: inputRef,
        className: 'dshm-range',
        type: 'range',
        min: 0,
        max: 0,
        step: SEEK_STEP_MS,
        // D-36: the plugin adds no tab stop to the host's UI.
        tabIndex: -1,
        'aria-label': t('np.seek'),
        onInput: (event) => {
          // Keyboard only (or a native drag, in a host that does not cancel the
          // pointerdown): paint immediately, ask the host on `change`.
          const ms = Number(event.currentTarget.value)
          pendingRef.current = { ms, atMs: Date.now() }
          paint(ms)
        },
        onChange: (event) => {
          const ms = Number(event.currentTarget.value)
          pendingRef.current = { ms, atMs: Date.now() }
          paint(ms)
          dispatch(ms)
        },
        // The control's own drag is not reliable here: a host that calls
        // `preventDefault()` on pointerdown (the DSH shell does) cancels the
        // default action, and the thumb then stops following the pointer — that is
        // exactly the "slider is dead" report of 2026-11-15. So this file owns the
        // pointer math, while the control keeps its value, its `role=slider`, its
        // ARIA and (for whatever focuses it) the arrow keys.
        onPointerDown: (event) => {
          if (event.button !== 0 && event.pointerType === 'mouse') return
          event.preventDefault()
          dragRef.current = { pointerId: event.pointerId, thumb: thumbPxOf(rootRef.current) }
          setDragging(true)
          try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* unsupported */ }
          seekFromPointer(event)
        },
        onPointerMove: (event) => {
          if (dragRef.current === null) return
          seekFromPointer(event)
        },
        onPointerUp: (event) => {
          if (dragRef.current === null) return
          const ms = seekFromPointer(event)
          try { event.currentTarget.releasePointerCapture(event.pointerId) } catch { /* unsupported */ }
          dragRef.current = null
          setDragging(false)
          if (ms !== null) dispatch(ms)
        },
        onPointerCancel: () => { dragRef.current = null; setDragging(false) },
      }),
      variant === 'sheet' ? h('div', { className: 'dshm-progress-bubble', ref: bubbleRef }, '0:00') : null)
    }

    /**
     * Volume, as the same native control. Volume commits on every `input` (it
     * always did: it is local, has no round trip to lose, and there is no latch to
     * fight), while the thumb is only written back from the host when the user is
     * not the one holding it.
     */
    function VolumeBar({ value, onChange }) {
      const rootRef = useRef(null)
      const inputRef = useRef(null)
      const paintedRef = useRef(null)
      const dragging = useRef(false)

      const paint = (percent) => {
        const node = rootRef.current
        const input = inputRef.current
        if (node === null || input === null) return
        const next = nextPaint(paintedRef.current, { fraction: percent / 100, label: `${percent}%` })
        if (next.write === true) {
          paintedRef.current = { fraction: next.fraction, label: next.label }
          node.style.setProperty('--p', String(next.fraction))
          input.setAttribute('aria-valuetext', next.label)
        }
        // The host echoes the volume back after every command; writing that echo
        // over a drag in progress would fight the finger.
        if (dragging.current === false && Number(input.value) !== percent) input.value = String(percent)
      }

      /** Same pointer contract as the progress bar: we own the math, the host may cancel the default. */
      const percentFromPointer = (event) => {
        const fraction = fractionAtClientX(rootRef.current, event.clientX, thumbPxOf(rootRef.current))
        return Math.max(0, Math.min(100, Math.round(fraction * 100)))
      }
      const applyPointer = (event) => {
        const percent = percentFromPointer(event)
        paint(percent)
        onChange(percent)
        return percent
      }

      useLayoutEffect(() => { paint(Math.round(value)) }, [])
      useEffect(() => {
        if (dragging.current === false) paint(Math.round(value))
      }, [value])

      return h('div', {
        ref: rootRef,
        className: 'dshm-progress',
        'data-variant': 'volume',
      },
      h('input', {
        ref: inputRef,
        className: 'dshm-range',
        type: 'range',
        min: 0,
        max: 100,
        step: 1,
        tabIndex: -1,
        'aria-label': t('np.volume'),
        onInput: (event) => {
          // Keyboard, or a native drag in a host that leaves the default action alone.
          const percent = Math.max(0, Math.min(100, Math.round(Number(event.currentTarget.value))))
          paint(percent)
          onChange(percent)
        },
        onPointerDown: (event) => {
          if (event.button !== 0 && event.pointerType === 'mouse') return
          event.preventDefault()
          dragging.current = true
          try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* unsupported */ }
          applyPointer(event)
        },
        onPointerMove: (event) => { if (dragging.current) applyPointer(event) },
        onPointerUp: (event) => {
          if (!dragging.current) return
          applyPointer(event)
          try { event.currentTarget.releasePointerCapture(event.pointerId) } catch { /* unsupported */ }
          dragging.current = false
        },
        onPointerCancel: () => { dragging.current = false },
      }))
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
      const [closing, setClosing] = useState(false)
      const closeTimer = useRef(null)
      const wrapRef = useRef(null)
      const latest = useRef(player)
      latest.current = player
      const getPlayer = useCallback(() => latest.current, [])
      // Closing keeps the panel mounted for one short exit transition; pressing
      // again mid-exit reopens it from its current position instead of restarting.
      // Hooks stay above the empty-state return: a track arriving must not add
      // hooks mid-lifecycle (React #310).
      const close = useCallback(() => {
        clearTimeout(closeTimer.current)
        setClosing(true)
        closeTimer.current = setTimeout(() => { setClosing(false); setOpen(false) }, POP_EXIT_MS)
      }, [])
      useEffect(() => () => clearTimeout(closeTimer.current), [])

      // Optimistic transport: the icon flips on press instead of after the host
      // round-trip. Cleared when the snapshot agrees, or after a short timeout.
      const [pendingPlay, setPendingPlay] = useState(null)
      const actualPlaying = player?.playing === true && player?.paused !== true
      useEffect(() => {
        if (pendingPlay === null) return
        if (pendingPlay === actualPlaying) setPendingPlay(null)
      }, [pendingPlay, actualPlaying])
      useEffect(() => {
        if (pendingPlay === null) return undefined
        const id = setTimeout(() => setPendingPlay(null), 1500)
        return () => clearTimeout(id)
      }, [pendingPlay])

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

      const playing = pendingPlay ?? actualPlaying
      const togglePlayback = () => {
        setPendingPlay(!actualPlaying)
        guarded(command('player.toggle'), t('mini.play')).then((result) => {
          if (result === null) setPendingPlay(null)
        })
      }
      const showProgress = wide && (status?.prefs?.miniProgress !== false)
      const stop = (event) => event.stopPropagation()
      const toggle = () => {
        clearTimeout(closeTimer.current)
        if (open && !closing) { close(); return }
        setClosing(false)
        setOpen(true)
      }

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
              onClick: togglePlayback,
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
            closing,
            playing,
            onToggle: togglePlayback,
            wrapRef,
            track,
            player,
            status,
            getPlayer,
            onClose: close,
          })))
    }

    /* ────────────────────────── now playing ────────────────────────────── */

    /** The approved four modes, in the order the single button cycles them (R08). */
    const MODE_CYCLE = ['sequence', 'all', 'one', 'shuffle']
    const MODE_ICON = { sequence: 'sequence', all: 'repeat', one: 'repeatOne', shuffle: 'shuffle' }
    const MODE_LABEL = {
      sequence: 'np.mode.sequence',
      all: 'np.mode.all',
      one: 'np.mode.one',
      shuffle: 'np.mode.shuffle',
    }

    /**
     * R08: one control for the four modes. Each press advances
     * 顺序 → 列表 → 单曲 → 随机. The icon and the accessible name always come from
     * the mode the Host reports, so the button cannot drift from the real state;
     * switching modes only rewrites the upcoming order, never the current track.
     */
    function ModeButton({ mode }) {
      const current = MODE_CYCLE.includes(mode) ? mode : 'all'
      const next = MODE_CYCLE[(MODE_CYCLE.indexOf(current) + 1) % MODE_CYCLE.length]
      const label = t(MODE_LABEL[current])
      return h('button', {
        type: 'button',
        className: 'dshm-ib dshm-focusable',
        'data-mode': current,
        'aria-label': label,
        title: label,
        onClick: (event) => {
          event.stopPropagation()
          guarded(command('player.mode', { mode: next }), label)
        },
      }, h(Icon, { name: MODE_ICON[current], size: 17 }))
    }

    /** Right-hand time: remaining, like Apple Music's miniplayer. */
    function RemainingText({ getPlayer }) {
      const ref = useRef(null)
      useEffect(() => {
        let frame = 0
        let last = -1
        const tick = () => {
          const player = getPlayer()
          const remaining = remainingOf(anchorFor(player), performance.now())
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

    function MiniPopover({ open, closing, playing, onToggle, wrapRef, track, player, status, getPlayer, onClose }) {
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

      const mode = player?.mode ?? 'all'

      return h('div', {
        ref: panelRef,
        className: 'dshm dshm-pop',
        'data-closing': closing ? 'true' : undefined,
        role: 'dialog',
        'aria-modal': 'false',
        'aria-label': t('np.title'),
        style: { left, width, bottom, maxHeight },
        onClick: (event) => event.stopPropagation(),
      },
      h('div', { className: 'dshm-pop-head' },
        h(IconButton, { name: 'chevronDown', label: t('np.collapse'), onClick: onClose, autoFocus: true }),
        h('div', { className: 'dshm-grow' }),
        h(ModeButton, { mode }),
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
          h(IconButton, {
            name: 'prev', label: t('mini.prev'), size: 'lg',
            onClick: () => guarded(command('player.prev'), t('mini.prev')),
          }),
          h(IconButton, {
            name: playing ? 'pause' : 'play',
            label: playing ? t('mini.pause') : t('mini.play'),
            size: 'lg',
            glyph: 20,
            onClick: onToggle,
          }),
          h(IconButton, {
            name: 'next', label: t('mini.next'), size: 'lg',
            onClick: () => guarded(command('player.next'), t('mini.next')),
          })),

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
      // `cursor` indexes the same array this panel renders, so the playing row
      // is the entry whose id is the current track. Deriving it from the id
      // keeps the highlight correct even when a snapshot arrives mid-advance.
      const currentId = player?.trackId ?? null
      const currentIndex = currentId === null ? -1 : ids.indexOf(currentId)
      const [rows, setRows] = useState([])
      // Three states, not two (CUI-02): a failed read leaves `rows` empty, and an
      // empty list used to render as "loading…" forever. Keeping the states apart
      // is what lets a failure offer a read-only retry instead of pretending the
      // queue is still on its way.
      const [readState, setReadState] = useState('pending')
      const [attempt, setAttempt] = useState(0)
      const [drag, setDrag] = useState(null)
      const lastDragAt = useRef(0)

      // Play by track id, never by the index this render happens to hold: the
      // snapshot can be a poll old, and a track that moved must still play.
      const playRow = (id) => {
        // A drag that just ended must not also be read as a click.
        if (Date.now() - lastDragAt.current < 200) return
        guarded(command('player.jump', { trackId: id }), t('np.queue'))
      }

      useEffect(() => {
        let cancelled = false
        // Pending means "nothing to show yet", never "a write just landed": a
        // re-read after remove / drag / enqueue keeps the rows on screen, so a
        // normal queue edit is not dressed up as loading (CUI-02).
        setReadState((prev) => (prev === 'ready' ? 'ready' : 'pending'))
        call('queue.list', {}).then((list) => {
          if (cancelled) return
          setRows(Array.isArray(list) ? list : [])
          setReadState('ready')
        }).catch(() => {
          if (cancelled) return
          // A failed read changes nothing on the host: the ids in the snapshot
          // still describe the queue, only the titles are unknown.
          setRows([])
          setReadState('failed')
        })
        return () => { cancelled = true }
      }, [ids.join('|'), tracksVersion, attempt])

      if (ids.length === 0) {
        return h('div', { className: 'dshm-list' },
          h('div', { className: 'dshm-empty' }, h('div', { className: 'dshm-empty-title' }, t('queue.empty'))))
      }

      if (readState === 'failed') {
        return h('div', { className: 'dshm-list' },
          h('div', { className: 'dshm-empty' },
            h('div', { className: 'dshm-empty-title' }, t('queue.failed')),
            h('div', { className: 'dshm-empty-body' }, t('queue.failedHint')),
            h('button', {
              type: 'button',
              className: 'dshm-btn dshm-focusable',
              // The retry re-issues the read (`queue.list`) and nothing else:
              // no queue op replays on its own, and a failed read never clears
              // the host queue (CUI-02).
              onClick: () => setAttempt((count) => count + 1),
            }, t('queue.retry'))))
      }

      if (readState === 'pending') {
        return h('div', { className: 'dshm-list' },
          h('div', { className: 'dshm-empty' }, h('div', { className: 'dshm-empty-title' }, t('queue.loading'))))
      }

      return h('div', { className: 'dshm-list', style: { paddingTop: 8 } },
        h('div', { className: 'dshm-rowline', style: { paddingTop: 0, paddingBottom: 6 } },
          h('span', { className: 'dshm-count' }, String(ids.length)),
          h('span', { className: 'dshm-grow' }),
          h('button', {
            type: 'button', className: 'dshm-btn dshm-focusable', 'data-destructive': 'true',
            onClick: () => guarded(command('queue.clear', {}), t('queue.clear')),
          }, t('queue.clear'))),
        ids.map((id, index) => {
          const row = rows[index] ?? {}
          const active = index === currentIndex
          return h('div', {
            key: id,
            draggable: true,
            onDragStart: () => { lastDragAt.current = Date.now(); setDrag(index) },
            onDragEnd: () => { lastDragAt.current = Date.now() },
            onDragOver: (event) => event.preventDefault(),
            onDrop: (event) => {
              event.preventDefault()
              const from = drag
              setDrag(null)
              if (from === null || from === index) return
              guarded(command('queue.move', { from, to: index }), t('np.queue'))
            },
            // No keyboard binding: D-28 removes every custom key handler from the
            // plugin. The row keeps `role="option"`/`aria-selected` so a screen
            // reader still announces which entry is playing.
            role: 'option',
            'aria-selected': active ? 'true' : 'false',
            onClick: () => playRow(id),
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
            onClick: (event) => {
              event.stopPropagation()
              guarded(command('queue.remove', { index }), t('queue.remove'))
            },
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
          if (view === 'queue') {
            // The queue view renders the player's queue, not a library list.
            // Asking the library for it returned the whole collection, which
            // also made the toolbar count meaningless (B15) and would have let
            // `playFrom` treat the entire library as the queue's source.
            setTracks([])
            setGroups([])
            setGroupTitle(null)
          } else if (kind !== null && groupKey === null) {
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
              : showQueue ? `${status?.player?.queue?.length ?? 0} ${t('lib.tracks')}`
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
        role: 'option',
        'aria-selected': active ? 'true' : 'false',
        onDoubleClick: onPlay,
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
            h('div', { className: 'dshm-vol', style: { width: 160 } }, h(VolumeBar, {
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

    // No keyboard plumbing lives here any more (D-28): the plugin binds no keys
    // of its own — not globally, not on its own rows or sliders. What remains is
    // the platform's own behaviour on real controls (`<button>`, `<input>`,
    // `<select>` keep Tab/Enter/Space from the browser) and Escape closing an
    // open surface, which is the dialog convention the host uses too.
    // The one thing this file used to own — a document-level Space /
    // Shift+←/→ takeover — was deleted with D-23 and its remnants with D-28.

    return {
      inject: ['slots', 'locale', 'layout', 'uiWorkspace'],
      apply(ctx) {
        /**
         * Bundle identity, written on the activation path and removed with this
         * fiber. It declares exactly one thing: this module's `apply()` ran —
         * i.e. the page executed the bundle carrying this id. It does NOT mean
         * the slots are registered, mounted, or rendering; those are separate
         * facts (see docs/TESTING.md §2.2).
         */
        ctx.effect(() => {
          const root = document.documentElement
          // Ownership is a per-activation token, not the id: an HMR re-apply
          // reuses the same id, and a later activation may already hold the
          // marker when an older disposer runs. Only the current owner clears it.
          const owner = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
          root.dataset.dshMusicBundle = BUNDLE_ID
          root.dataset.dshMusicBundlePhase = 'plugin-active'
          root.dataset.dshMusicBundleOwner = owner
          return () => {
            if (root.dataset.dshMusicBundleOwner !== owner) return
            delete root.dataset.dshMusicBundle
            delete root.dataset.dshMusicBundlePhase
            delete root.dataset.dshMusicBundleOwner
          }
        }, 'dsh-music bundle identity')

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
