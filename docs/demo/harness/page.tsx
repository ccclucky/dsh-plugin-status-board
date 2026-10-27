/**
 * Demo harness: a fake DSH host page that mounts the real built client bundle
 * (`lib/client.js`) so the README screenshots show the shipped UI, not a mock.
 *
 * The bundle is a classic script that calls `window.__ModuleLoader__.load()`
 * and `require()`s `react`, `react-dom` and `react/jsx-runtime` from the host
 * module table. This page provides that table from the real packages, then
 * drives the plugin's `apply(ctx)` with a hand-rolled context: a static
 * session snapshot, a `useSessionStatus` slot prop (one completion-unread
 * session), an answer remote, and two slot containers that mirror where DSH
 * would mount the sidebar row and the floating overlay.
 *
 * Rebuild with:
 *   npx esbuild page.tsx --bundle --format=iife --outfile=page.js \
 *     --define:process.env.NODE_ENV='"production"'
 * Serve the repository root (so /lib/client.js resolves) and open
 * /docs/demo/harness/index.html; `#theme=dark` switches the host tokens.
 */
import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as ReactDOMClient from 'react-dom/client'
import { jsx, jsxs, Fragment } from 'react/jsx-runtime'

;(window as any).__dswVendor = { React, ReactDOM, ReactDOMClient, jsx, jsxs, Fragment }

;(window as any).__ModuleLoader__ = {
  load({ id, factory }: { id: string; factory: (require: (name: string) => unknown) => unknown }): void {
    const table: Record<string, unknown> = {
      'react': { ...React, default: React },
      'react-dom': { ...ReactDOM, default: ReactDOM },
      'react-dom/client': { createRoot: ReactDOMClient.createRoot, hydrateRoot: ReactDOMClient.hydrateRoot },
      'react/jsx-runtime': { jsx, jsxs, Fragment },
    }
    ;(window as any).__statusBoardModule = { id, module: factory(name => table[name]) }
  },
}

// ── Demo data ────────────────────────────────────────────────────────────────
// Five top-level sessions covering every board: two running (one of them also
// blocked on an open question), one finished-but-unopened, two recent.

const HOUR = 3_600_000
const now = Date.now()

const snapshot = {
  phase: 'ready' as const,
  byId: {
    s1: { id: 's1', displayTitle: '重构认证中间件', cwd: '~/work/auth-service', running: true, updatedAt: now - 2 * HOUR },
    s2: { id: 's2', displayTitle: '修复登录重定向循环', cwd: '~/work/web-app', running: true, updatedAt: now - 1 * HOUR },
    s3: { id: 's3', displayTitle: '生成 API 接口文档', cwd: '~/work/docs-site', running: false, updatedAt: now - 3 * HOUR },
    s4: { id: 's4', displayTitle: '升级 pnpm 工作区依赖', cwd: '~/work/infra', running: false, updatedAt: now - 26 * HOUR },
    s5: { id: 's5', displayTitle: '清理废弃构建脚本', cwd: '~/work/infra', running: false, updatedAt: now - 50 * HOUR },
  },
  projectionsBySession: {
    s1: {
      values: {
        userQuestions: {
          active: [
            {
              callId: 'call-1',
              state: 'open',
              questions: [
                {
                  id: 'q1',
                  header: '方案确认',
                  question: '会话存储采用哪种方案？',
                  detail: '当前内存会话在重启后全部失效，需要先选定持久化方案再继续迁移。',
                  options: [
                    { label: 'Redis 集群', description: '会话持久化，支持水平扩展' },
                    { label: '内存 LRU', description: '零外部依赖，重启即失效' },
                  ],
                  multiSelect: false,
                },
              ],
            },
          ],
        },
      },
    },
  },
}

const statusMap = new Map([['s3', { completionUnread: true }]])

// ── Fake Cordis client context ───────────────────────────────────────────────

const themeFromHash = new URLSearchParams(location.hash.slice(1))
const theme = themeFromHash.get('theme') === 'dark' ? 'dark' : 'light'
document.documentElement.dataset.theme = theme

const openedSessions: string[] = []

function boot(): void {
  const { module: plugin } = (window as any).__statusBoardModule

  const ctx = {
    locale: {
      getSnapshot: () => ({ active: 'zh' }),
      subscribe: () => () => undefined,
      register: () => () => undefined,
    },
    sessions: {
      list: {
        getSnapshot: () => snapshot,
        subscribe: () => () => undefined,
      },
    },
    get(name: string): unknown {
      if (name === 'uiWorkspace') {
        return {
          openSession(sessionId: string): void {
            openedSessions.push(sessionId)
            const row = document.querySelector<HTMLElement>('#main-title')
            if (row !== null) row.textContent = `已打开会话：${(snapshot.byId as any)[sessionId]?.displayTitle ?? sessionId}`
          },
        }
      }
      return undefined
    },
    effect(callback: () => unknown): unknown {
      return callback()
    },
    inject(keys: readonly string[], callback: (answerCtx: { get(name: string): unknown }) => void): void {
      if (keys.includes('remote.userQuestions')) {
        callback({
          get: () => ({
            answer: async () => ({ ok: true as const, value: true }),
          }),
        })
      }
    },
    slots: {
      register(options: Record<string, unknown>, component: unknown): () => void {
        const standardProps = {
          // A real hook (stable snapshot): rules of hooks require every render
          // to call it the same way, and useSyncExternalStore gives that.
          useSessionStatus: (selector: (map: typeof statusMap) => typeof statusMap) =>
            (React as any).useSyncExternalStore(
              () => () => undefined,
              () => selector(statusMap),
              () => selector(statusMap),
            ),
        }
        const target =
          options.name === 'sidebar.panellist'
            ? document.getElementById('slot-panellist')
            : document.getElementById('slot-overlay')
        if (target === null) throw new Error(`no mount point for slot ${String(options.name)}`)
        const root = (ReactDOMClient as any).createRoot(target)
        root.render((React as any).createElement(component, standardProps))
        return () => root.unmount()
      },
      inject(key: string, callback: () => () => void): () => void {
        callback()
        return () => undefined
      },
    },
  }

  plugin.apply(ctx)
  ;(window as any).__demoReady = true
}

// The plugin bundle must run after the loader exists; the page script loads it
// deliberately late and boots once its module table is populated.
const script = document.createElement('script')
script.src = '/lib/client.js'
script.onload = () => boot()
document.head.append(script)
