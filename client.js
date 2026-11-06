/**
 * Client half of dsh-session-batch.
 *
 * A sidebar panel that lists conversations with an honest status — running
 * versus merely in host memory — and deletes their *chat records* individually
 * or in bulk. Workspace files are out of scope by design: dsh-session-artifacts
 * owns artifact attribution and removal.
 */
window.__ModuleLoader__.load({
  id: 'dsh-session-batch',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const PANEL_ID = 'session-batch'
    const NS = 'session-batch'

    const DICT = {
      zh: {
        entry: '批量清理',
        title: '批量清理聊天记录',
        subtitle: '按工作区列出对话,可多选一次删除;勾选后连该对话(含子代理)产出的文件一起删。产物归因由 dsh-session-artifacts 提供。',
        refresh: '刷新',
        searchPlaceholder: '搜索标题、路径或会话 ID',
        noResults: '没有匹配的对话',
        searchResults: '搜索结果',
        emptyTitle: '没有可清理的对话',
        emptyBody: '打开过对话后,它们会出现在这里。',
        loading: '正在读取对话列表...',
        loadFailed: '读取对话列表失败',
        retry: '重试',
        groupOther: '未归类对话',
        groupOrphans: '孤立子代理会话',
        liveBadge: '内存中',
        liveHint: '这个对话在本次运行里被打开过,宿主仍把它留在内存中。刷新页面不会改变它,重启应用后才会消失;它不代表正在运行,也不影响删除。',
        runningBadge: '运行中',
        runningHint: '该对话此刻确实在工作(回合、任务、子代理或定时提醒在跑)。删除时会先请求停止它。',
        subagentBadge: '子代理',
        delete: '删除记录',
        totalSessions: '共 {count} 个对话 · {size}',
        pendingNote: '{count} 个删除任务将在下次启动时继续清理',
        awaitingRestart: '{count} 个已删除的对话仍留在宿主内存中,重启应用后才会从侧栏消失。',
        selectMode: '多选',
        exitSelect: '退出多选',
        selectedCount: '已选 {count} 个',
        selectAll: '全选',
        selectNone: '全不选',
        batchDelete: '删除选中的 {count} 个聊天记录',
        dialogTitle: '删除聊天记录',
        dialogDesc: '只删除对话与聊天记录:会话日志、子代理记录、工作区归属、置顶与归档标记。工作区里的文件不会被碰。',
        dialogList: '将删除以下 {count} 个对话的聊天记录',
        artifactToggle: '同时删除这些对话产出的文件({count} 个 · {size})',
        artifactEmpty: '这些对话没有可删除的产物文件',
        artifactUnavailable: '未安装 dsh-session-artifacts,只能删除聊天记录',
        artifactLoading: '正在分析产物…',
        artifactListTitle: '将一并删除的文件',
        artifactMore: '还有 {count} 个',
        artifactNote: '归因由 dsh-session-artifacts 提供:只认它创建的文件,你自己原有的文件不会列入。',
        toastArtifacts: ',并删除 {count} 个文件({size})',
        warning: '删除后无法恢复,也无法从回收站找回。',
        cancel: '取消',
        confirmOne: '永久删除聊天记录',
        confirmMany: '永久删除 {count} 个对话的聊天记录',
        confirmOneWithFiles: '永久删除聊天记录与 {files} 个文件',
        confirmManyWithFiles: '永久删除 {count} 个对话(含 {files} 个文件)',
        deleting: '正在删除...',
        toastDeleted: '已删除 {count} 个对话的聊天记录',
        toastFailed: '失败 {count} 个',
        toastPending: ',{count} 项将在下次启动时继续清理',
      },
      en: {
        entry: 'Batch purge',
        title: 'Purge chat records in bulk',
        subtitle: 'Conversations grouped by workspace; delete chat records one by one or many at once. Workspace files belong to the session menu.',
        refresh: 'Refresh',
        searchPlaceholder: 'Search title, path or session id',
        noResults: 'No matching conversations',
        searchResults: 'Search results',
        emptyTitle: 'Nothing to purge yet',
        emptyBody: 'Conversations appear here after they have been opened.',
        loading: 'Loading conversations...',
        loadFailed: 'Failed to load conversations',
        retry: 'Retry',
        groupOther: 'Unassigned conversations',
        groupOrphans: 'Orphaned subagent sessions',
        liveBadge: 'In memory',
        liveHint: 'This conversation was opened during this run, so the host keeps it in memory. Refreshing does not change that; restarting the app does. It is not running and does not block deletion.',
        runningBadge: 'Running',
        runningHint: 'This conversation is doing work right now. Deletion asks it to stop first.',
        subagentBadge: 'Subagent',
        delete: 'Delete records',
        totalSessions: '{count} conversations · {size}',
        pendingNote: '{count} deletion tasks will finish on the next start',
        awaitingRestart: '{count} deleted conversations are still in host memory; they leave the sidebar after a restart.',
        selectMode: 'Select',
        exitSelect: 'Exit selection',
        selectedCount: '{count} selected',
        selectAll: 'Select all',
        selectNone: 'Select none',
        batchDelete: 'Delete records of {count} selected',
        dialogTitle: 'Delete chat records',
        dialogDesc: 'Removes the conversations and their chat records only: session logs, subagent records, workspace membership, pin and archive markers. Files in the workspace are never touched.',
        dialogList: 'Chat records of these {count} conversations will be deleted',
        artifactToggle: 'Also delete the files these conversations produced ({count} · {size})',
        artifactEmpty: 'These conversations produced no deletable files',
        artifactUnavailable: 'dsh-session-artifacts is not installed, so only chat records can be deleted',
        artifactLoading: 'Analyzing artifacts…',
        artifactListTitle: 'Files that will be deleted too',
        artifactMore: 'and {count} more',
        artifactNote: 'Attribution comes from dsh-session-artifacts: only files it created count, files you already owned are never listed.',
        toastArtifacts: ', {count} files removed ({size})',
        warning: 'Deleted data cannot be recovered.',
        cancel: 'Cancel',
        confirmOne: 'Delete chat records',
        confirmMany: 'Delete records of {count} conversations',
        confirmOneWithFiles: 'Delete chat records and {files} files',
        confirmManyWithFiles: 'Delete {count} conversations and {files} files',
        deleting: 'Deleting...',
        toastDeleted: 'Deleted the chat records of {count} conversations',
        toastFailed: '{count} failed',
        toastPending: ', {count} items will finish on the next start',
      },
    }

    const CSS = `
.sb-page { height: 100%; overflow: auto; box-sizing: border-box; padding: 28px 32px 56px; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-base); }
.sb-shell { max-width: 900px; margin: 0 auto; }
.sb-head { display: flex; align-items: flex-start; gap: 16px; justify-content: space-between; }
.sb-title { margin: 0; font-size: 20px; font-weight: 600; line-height: 28px; }
.sb-sub { margin: 6px 0 0; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary); max-width: 680px; }
.sb-actions { display: flex; gap: 8px; flex: none; }
.sb-btn { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px; cursor: pointer; }
.sb-btn:disabled { opacity: .55; cursor: default; }
.sb-toolbar { display: flex; align-items: center; gap: 12px; margin: 22px 0 18px; }
.sb-search { flex: 1; height: 36px; box-sizing: border-box; padding: 0 12px; border-radius: 9px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px; outline: none; }
.sb-total { font-size: 12px; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
.sb-group { margin: 0 0 22px; }
.sb-group-head { display: flex; align-items: baseline; gap: 10px; padding: 0 4px 8px; }
.sb-group-title { font-size: 13px; font-weight: 600; }
.sb-group-path { min-width: 0; font-size: 12px; color: var(--dsw-alias-label-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sb-group-count { margin-left: auto; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.sb-list { display: flex; flex-direction: column; gap: 2px; }
.sb-row { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 10px; border: 1px solid transparent; }
.sb-row:hover { background: var(--dsw-alias-bg-layer-1); border-color: var(--dsw-alias-border-l1); }
.sb-row-selected { background: var(--dsw-alias-bg-layer-1); border-color: var(--dsw-alias-border-l2); }
.sb-row-pick input { margin: 0; accent-color: var(--dsw-alias-brand-primary); }
.sb-row-main { min-width: 0; flex: 1; }
.sb-row-title-line { display: flex; align-items: center; gap: 8px; min-width: 0; }
.sb-row-title { min-width: 0; font-size: 14px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sb-row-meta { display: flex; align-items: center; gap: 12px; margin-top: 3px; font-size: 12px; color: var(--dsw-alias-label-secondary); min-width: 0; }
.sb-row-meta > span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sb-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.sb-badge { flex: none; display: inline-flex; align-items: center; height: 18px; padding: 0 6px; border-radius: 5px; font-size: 11px; line-height: 1; border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary); }
.sb-badge-run { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); }
.sb-del { flex: none; display: inline-flex; align-items: center; gap: 5px; height: 30px; padding: 0 10px; border-radius: 8px; border: 1px solid transparent; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px; cursor: pointer; }
.sb-del:hover { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); }
.sb-empty { padding: 56px 24px; text-align: center; border: 1px dashed var(--dsw-alias-border-l1); border-radius: 12px; }
.sb-empty-title { font-size: 14px; font-weight: 500; }
.sb-empty-body { margin-top: 6px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.sb-error { margin-top: 18px; padding: 12px 14px; border-radius: 10px; font-size: 13px; border: 1px solid var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); }
.sb-loading { display: flex; align-items: center; gap: 10px; padding: 40px 4px; color: var(--dsw-alias-label-secondary); font-size: 13px; }
.sb-spinner { width: 16px; height: 16px; border-radius: 50%; flex: none; border: 2px solid var(--dsw-alias-border-l1); border-top-color: var(--dsw-alias-brand-primary); animation: sb-spin .8s linear infinite; }
@keyframes sb-spin { to { transform: rotate(360deg); } }
.sb-bar { position: sticky; bottom: 12px; z-index: 5; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 16px 0 0; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-overlay); }
.sb-bar-count { font-size: 13px; font-weight: 500; margin-right: auto; }
.sb-link { border: none; background: none; padding: 0 4px; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px; cursor: pointer; }
.sb-hint { margin: 6px 2px 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.sb-overlay { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(0, 0, 0, .45); }
.sb-dialog { width: min(620px, 100%); max-height: min(84vh, 720px); display: flex; flex-direction: column; background: var(--dsw-alias-bg-overlay); border: 1px solid var(--dsw-alias-border-l1); border-radius: 14px; outline: none; }
.sb-dialog-head { padding: 20px 22px 0; }
.sb-dialog-title { margin: 0; font-size: 16px; font-weight: 600; }
.sb-dialog-desc { margin: 6px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.sb-dialog-body { padding: 18px 22px; overflow: auto; flex: 1; }
.sb-dialog-foot { display: flex; align-items: center; gap: 10px; padding: 14px 22px; border-top: 1px solid var(--dsw-alias-border-l1); }
.sb-warning { margin-right: auto; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.sb-batch-list { max-height: 260px; overflow: auto; margin: 8px 0 0; padding: 10px 12px; border-radius: 9px; background: var(--dsw-alias-bg-layer-1); font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.sb-batch-list-title { color: var(--dsw-alias-label-primary); }
.sb-artifacts { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--dsw-alias-border-l1); }
.sb-check { display: flex; align-items: flex-start; gap: 9px; font-size: 13px; line-height: 20px; cursor: pointer; }
.sb-check input { margin: 3px 0 0; accent-color: var(--dsw-alias-brand-primary); flex: none; }
.sb-btn-danger { height: 34px; padding: 0 14px; border-radius: 8px; font: inherit; font-size: 13px; cursor: pointer; border: 1px solid var(--dsw-alias-state-error-primary); background: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-bg-base); }
.sb-btn-danger:disabled { opacity: .55; cursor: default; }
.sb-toast { position: fixed; left: 50%; bottom: 26px; transform: translateX(-50%); z-index: 1100; max-width: min(640px, calc(100vw - 48px)); padding: 10px 16px; border-radius: 10px; font-size: 13px; line-height: 20px; background: var(--dsw-alias-bg-overlay); border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-primary); }
`

    function fill(text, params) {
      return String(text).replace(/\{(\w+)\}/g, (match, key) =>
        Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match,
      )
    }

    function formatBytes(bytes) {
      if (!bytes || bytes < 0) return '0 B'
      const units = ['B', 'KB', 'MB', 'GB', 'TB']
      let value = bytes
      let unit = 0
      while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1 }
      return `${unit === 0 ? Math.round(value) : value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`
    }

    function formatDate(ms) {
      if (!ms) return '—'
      const date = new Date(ms)
      const pad = (value) => String(value).padStart(2, '0')
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
    }

    async function call(url, body) {
      const init = body === undefined
        ? { cache: 'no-store' }
        : { method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
      const response = await fetch(url, init)
      const text = await response.text()
      let data
      try {
        data = text ? JSON.parse(text) : {}
      } catch {
        throw new Error(text.slice(0, 300) || `HTTP ${response.status}`)
      }
      // 207 carries per-session results; only a body-level error is a failure.
      if (data.ok === false && (!data.deleted || data.deleted.length === 0)) {
        throw new Error(data.error || `HTTP ${response.status}`)
      }
      return data
    }

    const ICON_TRASH = [
      h('path', { key: 'a', d: 'M4 7h16' }),
      h('path', { key: 'b', d: 'M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7' }),
      h('path', { key: 'c', d: 'M6.5 7l.8 11.2A2 2 0 0 0 9.3 20h5.4a2 2 0 0 0 2-1.8L17.5 7' }),
      h('path', { key: 'd', d: 'M10.5 11v5M13.5 11v5' }),
    ]

    function TrashIcon(props) {
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: props.size || 16,
          height: props.size || 16,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          style: { display: 'block', flex: 'none' },
        },
        ICON_TRASH,
      )
    }

    function RefreshIcon() {
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: 16,
          height: 16,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          style: { display: 'block', flex: 'none' },
        },
        h('path', { d: 'M20 12a8 8 0 1 1-2.34-5.66' }),
        h('path', { d: 'M20 4v5h-5' }),
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, 'zh', DICT.zh), 'session-batch: zh dictionary')
        ctx.effect(() => ctx.locale.register(NS, 'en', DICT.en), 'session-batch: en dictionary')
        const t = ctx.locale.bind(NS)

        function useLocaleTick() {
          const [, bump] = React.useState(0)
          React.useEffect(() => {
            const unsubscribe = ctx.locale.subscribe(() => bump((value) => value + 1))
            return typeof unsubscribe === 'function' ? unsubscribe : () => {}
          }, [])
        }

        function SidebarEntry(props) {
          useLocaleTick()
          const size = props && props.size ? props.size : 20
          return h(
            'svg',
            {
              viewBox: '0 0 24 24',
              width: size,
              height: size,
              fill: 'none',
              stroke: 'currentColor',
              strokeWidth: 1.7,
              strokeLinecap: 'round',
              strokeLinejoin: 'round',
              'aria-hidden': true,
              style: { display: 'block' },
            },
            ICON_TRASH,
          )
        }

        function SessionRow(props) {
          const row = props.row
          const selecting = Boolean(props.selecting)
          const selected = Boolean(props.selected && selecting)
          return h(
            'div',
            {
              className: 'sb-row' + (selected ? ' sb-row-selected' : ''),
              onClick: selecting
                ? (event) => {
                    if (event.target && event.target.tagName === 'INPUT') return
                    props.onToggle(row)
                  }
                : undefined,
              style: selecting ? { cursor: 'pointer' } : undefined,
            },
            selecting
              ? h(
                  'span',
                  { className: 'sb-row-pick' },
                  h('input', {
                    type: 'checkbox',
                    checked: selected,
                    'aria-label': `${t('selectMode')} ${row.title}`,
                    onChange: () => props.onToggle(row),
                  }),
                )
              : null,
            h(
              'div',
              { className: 'sb-row-main' },
              h(
                'div',
                { className: 'sb-row-title-line' },
                h('span', { className: 'sb-row-title', title: row.title }, row.title),
                row.running
                  ? h('span', { className: 'sb-badge sb-badge-run', title: t('runningHint') }, t('runningBadge'))
                  : row.live
                    ? h('span', { className: 'sb-badge', title: t('liveHint') }, t('liveBadge'))
                    : null,
                row.kind === 'subagent' ? h('span', { className: 'sb-badge' }, t('subagentBadge')) : null,
              ),
              h(
                'div',
                { className: 'sb-row-meta' },
                h('span', null, formatDate(row.createdAt)),
                row.sizeBytes > 0 ? h('span', null, formatBytes(row.sizeBytes)) : null,
                row.cwd ? h('span', { className: 'sb-mono', title: row.cwd }, row.cwd) : null,
              ),
            ),
            selecting
              ? null
              : h(
                  'button',
                  {
                    type: 'button',
                    className: 'sb-del',
                    onClick: () => props.onDelete(row),
                    'aria-label': `${t('delete')} ${row.title}`,
                  },
                  h(TrashIcon, { size: 14 }),
                  h('span', null, t('delete')),
                ),
          )
        }

        function Group(props) {
          const group = props.group
          return h(
            'section',
            { className: 'sb-group' },
            h(
              'div',
              { className: 'sb-group-head' },
              h('span', { className: 'sb-group-title' }, group.title),
              group.path ? h('span', { className: 'sb-group-path', title: group.path }, group.path) : null,
              h('span', { className: 'sb-group-count' }, String(group.sessions.length)),
            ),
            h(
              'div',
              { className: 'sb-list' },
              group.sessions.map((row) =>
                h(SessionRow, {
                  key: row.id,
                  row,
                  onDelete: props.onDelete,
                  selecting: props.selecting,
                  selected: Boolean(props.selected && props.selected.has(row.id)),
                  onToggle: props.onToggle,
                }),
              ),
            ),
          )
        }


        function BatchDialog(props) {
          useLocaleTick()
          const rows = props.rows
          const [busy, setBusy] = React.useState(false)
          const [failure, setFailure] = React.useState('')
          const [includeArtifacts, setIncludeArtifacts] = React.useState(false)
          const [artifacts, setArtifacts] = React.useState(null)
          const dialogRef = React.useRef(null)

          // Ask the host what these conversations produced. The list is what the
          // user is shown before anything is removed.
          React.useEffect(() => {
            let cancelled = false
            call('api/session-batch.preview-artifacts', { sessionIds: rows.map((row) => row.id) })
              .then((payload) => {
                if (!cancelled) setArtifacts(payload)
              })
              .catch(() => {
                if (!cancelled) setArtifacts({ ok: true, available: false, sessions: [], totals: { files: 0, bytes: 0 } })
              })
            return () => {
              cancelled = true
            }
          }, [rows])

          React.useEffect(() => {
            const onKey = (event) => {
              if (event.key === 'Escape' && !busy) props.onClose()
            }
            document.addEventListener('keydown', onKey)
            const previousOverflow = document.body.style.overflow
            document.body.style.overflow = 'hidden'
            if (dialogRef.current && typeof dialogRef.current.focus === 'function') dialogRef.current.focus()
            return () => {
              document.removeEventListener('keydown', onKey)
              document.body.style.overflow = previousOverflow
            }
          }, [busy])

          const run = async () => {
            if (busy || rows.length === 0) return
            setBusy(true)
            setFailure('')
            try {
              const result = await call('api/session-batch.delete', {
                sessionIds: rows.map((row) => row.id),
                includeArtifacts,
              })
              props.onDone(result)
            } catch (error) {
              setFailure(error.message)
              setBusy(false)
            }
          }

          const artifactFiles = []
          if (artifacts && artifacts.available && Array.isArray(artifacts.sessions)) {
            for (const session of artifacts.sessions) {
              for (const file of session.files || []) artifactFiles.push(file)
            }
          }
          const artifactTotals = artifacts && artifacts.totals ? artifacts.totals : { files: 0, bytes: 0 }
          const artifactState = !artifacts
            ? 'loading'
            : artifacts.available === false
              ? 'unavailable'
              : artifactTotals.files === 0
                ? 'empty'
                : 'ready'
          const shownFiles = artifactFiles.slice(0, 8)

          return h(
            'div',
            {
              className: 'sb-overlay',
              onMouseDown: (event) => {
                if (event.target === event.currentTarget && !busy) props.onClose()
              },
            },
            h(
              'div',
              { className: 'sb-dialog', role: 'dialog', 'aria-modal': 'true', tabIndex: -1, ref: dialogRef },
              h(
                'div',
                { className: 'sb-dialog-head' },
                h('h2', { className: 'sb-dialog-title' }, t('dialogTitle')),
                h('p', { className: 'sb-dialog-desc' }, t('dialogDesc')),
              ),
              h(
                'div',
                { className: 'sb-dialog-body' },
                h(
                  'div',
                  { className: 'sb-batch-list' },
                  h('div', { className: 'sb-batch-list-title' }, fill(t('dialogList'), { count: rows.length })),
                  rows.map((row) => h('div', { key: row.id }, row.title)),
                ),
                artifactState === 'unavailable'
                  ? h('p', { className: 'sb-hint' }, t('artifactUnavailable'))
                  : artifactState === 'loading'
                    ? h('p', { className: 'sb-hint' }, t('artifactLoading'))
                    : h(
                        'div',
                        { className: 'sb-artifacts' },
                        artifactState === 'empty'
                          ? h('p', { className: 'sb-hint' }, t('artifactEmpty'))
                          : h(
                              'label',
                              { className: 'sb-check' },
                              h('input', {
                                type: 'checkbox',
                                checked: includeArtifacts,
                                disabled: busy,
                                onChange: () => setIncludeArtifacts((value) => !value),
                              }),
                              h(
                                'span',
                                null,
                                fill(t('artifactToggle'), {
                                  count: artifactTotals.files,
                                  size: formatBytes(artifactTotals.bytes),
                                }),
                              ),
                            ),
                        artifactState === 'ready'
                          ? h(
                              React.Fragment,
                              null,
                              h('p', { className: 'sb-hint' }, t('artifactNote')),
                              h(
                                'div',
                                { className: 'sb-batch-list' },
                                h('div', { className: 'sb-batch-list-title' }, t('artifactListTitle')),
                                shownFiles.map((file) => h('div', { key: file.path, title: file.path }, file.display)),
                                artifactFiles.length > shownFiles.length
                                  ? h('div', null, fill(t('artifactMore'), { count: artifactFiles.length - shownFiles.length }))
                                  : null,
                              ),
                            )
                          : null,
                      ),
                failure ? h('div', { className: 'sb-error' }, failure) : null,
              ),
              h(
                'div',
                { className: 'sb-dialog-foot' },
                h('span', { className: 'sb-warning' }, t('warning')),
                h(
                  'button',
                  { type: 'button', className: 'sb-btn', onClick: () => { if (!busy) props.onClose() }, disabled: busy },
                  t('cancel'),
                ),
                h(
                  'button',
                  { type: 'button', className: 'sb-btn-danger', onClick: run, disabled: busy },
                  busy
                    ? t('deleting')
                    : includeArtifacts && artifactTotals.files > 0
                      ? rows.length === 1
                        ? fill(t('confirmOneWithFiles'), { files: artifactTotals.files })
                        : fill(t('confirmManyWithFiles'), { count: rows.length, files: artifactTotals.files })
                      : rows.length === 1
                        ? t('confirmOne')
                        : fill(t('confirmMany'), { count: rows.length }),
                ),
              ),
            ),
          )
        }

        function BatchPanel() {
          useLocaleTick()
          const [status, setStatus] = React.useState('loading')
          const [data, setData] = React.useState(null)
          const [error, setError] = React.useState('')
          const [reloadKey, setReloadKey] = React.useState(0)
          const [query, setQuery] = React.useState('')
          const [selecting, setSelecting] = React.useState(false)
          const [selected, setSelected] = React.useState(new Set())
          const [batchRows, setBatchRows] = React.useState(null)
          const [toast, setToast] = React.useState('')

          React.useEffect(() => {
            let cancelled = false
            setStatus((current) => (data ? 'refreshing' : current === 'error' ? 'loading' : current))
            setError('')
            call('api/session-batch.list')
              .then((payload) => {
                if (cancelled) return
                setData(payload)
                setStatus('ready')
              })
              .catch((reason) => {
                if (cancelled) return
                setError(reason.message)
                setStatus('error')
              })
            return () => {
              cancelled = true
            }
          }, [reloadKey])

          React.useEffect(() => {
            if (!toast) return undefined
            const timer = setTimeout(() => setToast(''), 9000)
            return () => clearTimeout(timer)
          }, [toast])

          const toggleRow = (row) => {
            setSelected((current) => {
              const next = new Set(current)
              if (next.has(row.id)) next.delete(row.id)
              else next.add(row.id)
              return next
            })
          }

          const onDone = (result) => {
            setBatchRows(null)
            setSelecting(false)
            setSelected(new Set())
            const deleted = Array.isArray(result.deleted) ? result.deleted.length : 0
            const failed = Array.isArray(result.failed) ? result.failed.length : 0
            let text = fill(t('toastDeleted'), { count: deleted })
            if (failed > 0) text += `,${fill(t('toastFailed'), { count: failed })}`
            const pendingCount = (result.deleted || []).reduce((total, item) => total + (item.pending || 0), 0)
            if (pendingCount > 0) text += fill(t('toastPending'), { count: pendingCount })
            const filesRemoved = result.artifacts && typeof result.artifacts.removed === 'number' ? result.artifacts.removed : 0
            if (filesRemoved > 0) {
              text += fill(t('toastArtifacts'), {
                count: filesRemoved,
                size: formatBytes(result.artifacts.bytes || 0),
              })
            }
            if (failed > 0 && result.failed[0] && result.failed[0].error) text += ` · ${result.failed[0].error}`
            setToast(text)
            setReloadKey((value) => value + 1)
          }

          const queryText = query.trim().toLowerCase()
          const matches = (row) =>
            !queryText ||
            row.title.toLowerCase().includes(queryText) ||
            row.id.toLowerCase().includes(queryText) ||
            (row.cwd || '').toLowerCase().includes(queryText)

          let groups = data ? data.groups : []
          let other = data ? data.orphans : []
          let orphanSubagents = data ? data.orphanSubagents : []
          if (queryText) {
            const flat = []
            for (const group of groups) for (const row of group.sessions) if (matches(row)) flat.push(row)
            for (const row of other) if (matches(row)) flat.push(row)
            for (const row of orphanSubagents) if (matches(row)) flat.push(row)
            groups = flat.length ? [{ id: 'search', title: t('searchResults'), sessions: flat }] : []
            other = []
            orphanSubagents = []
          }

          const visibleRows = []
          for (const group of groups) for (const row of group.sessions) visibleRows.push(row)
          for (const row of other) visibleRows.push(row)
          for (const row of orphanSubagents) visibleRows.push(row)
          const selectedRows = visibleRows.filter((row) => selected.has(row.id))
          const totalGroups = groups.length + (other.length ? 1 : 0) + (orphanSubagents.length ? 1 : 0)
          const groupProps = { onDelete: (row) => setBatchRows([row]), selecting, selected, onToggle: toggleRow }

          const body = status === 'loading'
            ? h('div', { className: 'sb-loading' }, h('span', { className: 'sb-spinner', 'aria-hidden': true }), t('loading'))
            : status === 'error'
              ? h(
                  'div',
                  { className: 'sb-error' },
                  `${t('loadFailed')}: ${error} `,
                  h('button', { type: 'button', className: 'sb-link', onClick: () => setReloadKey((value) => value + 1) }, t('retry')),
                )
              : totalGroups === 0
                ? h(
                    'div',
                    { className: 'sb-empty' },
                    h('div', { className: 'sb-empty-title' }, queryText ? t('noResults') : t('emptyTitle')),
                    h('div', { className: 'sb-empty-body' }, queryText ? '' : t('emptyBody')),
                  )
                : h(
                    React.Fragment,
                    null,
                    groups.map((group) => h(Group, { key: group.id, group, ...groupProps })),
                    other.length
                      ? h(Group, {
                          key: 'sb-other',
                          group: { id: 'sb-other', title: t('groupOther'), path: '', sessions: other },
                          ...groupProps,
                        })
                      : null,
                    orphanSubagents.length
                      ? h(Group, {
                          key: 'sb-orphan',
                          group: { id: 'sb-orphan', title: t('groupOrphans'), path: '', sessions: orphanSubagents },
                          ...groupProps,
                        })
                      : null,
                  )

          return h(
            'div',
            { className: 'sb-page' },
            h('style', { key: 'session-batch-css' }, CSS),
            h(
              'div',
              { className: 'sb-shell' },
              h(
                'header',
                { className: 'sb-head' },
                h(
                  'div',
                  null,
                  h('h1', { className: 'sb-title' }, t('title')),
                  h('p', { className: 'sb-sub' }, t('subtitle')),
                ),
                h(
                  'div',
                  { className: 'sb-actions' },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'sb-btn',
                      onClick: () => {
                        setSelecting((current) => !current)
                        setSelected(new Set())
                      },
                      disabled: status === 'loading' || (data ? data.totals.sessions === 0 : true),
                    },
                    selecting ? t('exitSelect') : t('selectMode'),
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'sb-btn',
                      onClick: () => setReloadKey((value) => value + 1),
                      disabled: status === 'loading',
                    },
                    h(RefreshIcon),
                    t('refresh'),
                  ),
                ),
              ),
              h(
                'div',
                { className: 'sb-toolbar' },
                h('input', {
                  className: 'sb-search',
                  type: 'search',
                  value: query,
                  placeholder: t('searchPlaceholder'),
                  'aria-label': t('searchPlaceholder'),
                  onChange: (event) => setQuery(event.target.value),
                }),
                data
                  ? h(
                      'span',
                      { className: 'sb-total' },
                      fill(t('totalSessions'), { count: data.totals.sessions, size: formatBytes(data.totals.bytes) }),
                    )
                  : null,
              ),
              body,
              selecting && visibleRows.length > 0
                ? h(
                    'div',
                    { className: 'sb-bar' },
                    h('span', { className: 'sb-bar-count' }, fill(t('selectedCount'), { count: selectedRows.length })),
                    h(
                      'button',
                      { type: 'button', className: 'sb-link', onClick: () => setSelected(new Set(visibleRows.map((row) => row.id))) },
                      t('selectAll'),
                    ),
                    h('button', { type: 'button', className: 'sb-link', onClick: () => setSelected(new Set()) }, t('selectNone')),
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'sb-btn',
                        onClick: () => {
                          setSelecting(false)
                          setSelected(new Set())
                        },
                      },
                      t('exitSelect'),
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'sb-btn-danger',
                        disabled: selectedRows.length === 0,
                        onClick: () => setBatchRows(selectedRows),
                      },
                      fill(t('batchDelete'), { count: selectedRows.length }),
                    ),
                  )
                : null,
              data && data.totals.awaitingRestart > 0
                ? h('p', { className: 'sb-hint' }, fill(t('awaitingRestart'), { count: data.totals.awaitingRestart }))
                : null,
              data && data.totals.pending > 0
                ? h('p', { className: 'sb-hint' }, fill(t('pendingNote'), { count: data.totals.pending }))
                : null,
            ),
            batchRows ? h(BatchDialog, { rows: batchRows, onClose: () => setBatchRows(null), onDone }) : null,
            toast ? h('div', { className: 'sb-toast', role: 'status' }, toast) : null,
          )
        }


        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            { name: 'sidebar.panellist', id: PANEL_ID, order: 20, label: () => t('entry') },
            SidebarEntry,
          ),
        )

        ctx.slots.inject('main', () =>
          ctx.slots.register({ name: 'main', key: PANEL_ID }, BatchPanel),
        )
      },
    }
  },
})
