// Builds a standalone preview of the floating board using the REAL stylesheet
// from src/client/styles.ts, with realistic theme-token values, so the look can
// be judged (and iterated on) without a browser reload of the app.
//
// Usage: node .preview-build.mjs   ->  writes .preview.html
import { readFileSync, writeFileSync } from 'node:fs'

const stylesSource = readFileSync('src/client/styles.ts', 'utf8')
const match = /export const PANEL_CSS = String\.raw`([\s\S]*?)`\s*$/m.exec(stylesSource)
if (match === null) throw new Error('PANEL_CSS not found')
const panelCss = match[1]

// Harness light/dark token values, approximated from the shipped theme.
const tokens = `
:root{
  --dsw-alias-bg-base:#ffffff;
  --dsw-alias-bg-layer-1:#ffffff;
  --dsw-alias-bg-layer-2:#f2f4f7;
  --dsw-alias-bg-overlay:#ffffff;
  --dsw-alias-border-l1:#e4e8ee;
  --dsw-alias-border-l2:#d3dae3;
  --dsw-alias-brand-primary:#4f46e5;
  --dsw-alias-label-primary:#14171a;
  --dsw-alias-label-secondary:#6b7684;
  --dsw-alias-state-error-primary:#dc2626;
  --dsw-alias-state-idle-primary:#9aa4b1;
  --dsw-alias-state-success-primary:#16a34a;
  --dsw-alias-state-warn-primary:#d97706;
  --dsw-specific-sidebar-fill:#f7f8fa;
}
@media (prefers-color-scheme:dark){
  :root{
    --dsw-alias-bg-base:#0e1116;
    --dsw-alias-bg-layer-1:#151a21;
    --dsw-alias-bg-layer-2:#1e242c;
    --dsw-alias-bg-overlay:#1a2029;
    --dsw-alias-border-l1:#242c36;
    --dsw-alias-border-l2:#303a46;
    --dsw-alias-brand-primary:#818cf8;
    --dsw-alias-label-primary:#eef2f6;
    --dsw-alias-label-secondary:#96a2b1;
    --dsw-alias-state-error-primary:#f87171;
    --dsw-alias-state-idle-primary:#64707e;
    --dsw-alias-state-success-primary:#4ade80;
    --dsw-alias-state-warn-primary:#fbbf24;
    --dsw-specific-sidebar-fill:#11151b;
  }
}
`

const rows = (items) =>
  items
    .map(
      ([title, meta]) => `
      <li>
        <button type="button" class="status-board__row" data-state="recent" title="${title}">
          <span class="status-board__dot" data-state="recent" aria-hidden="true"></span>
          <span class="status-board__row-title">${title}</span>
          <span class="status-board__row-meta" id="m">${meta}</span>
        </button>
      </li>`,
    )
    .join('')

const section = (bucket, name, count, hint, collapsed, items, empty) => `
  <section class="status-board__card" data-bucket="${bucket}">
    <h2 class="status-board__heading">
      <button type="button" class="status-board__toggle" aria-expanded="${!collapsed}" title="${hint}">
        <svg class="status-board__chevron" data-collapsed="${collapsed}" viewBox="0 0 12 12" aria-hidden="true" style="width:10px;height:10px;display:block">
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span class="status-board__name">${name}</span>
        <span class="status-board__count" aria-hidden="true">${count}</span>
      </button>
    </h2>
    <div role="group" aria-label="${name}"${collapsed ? ' hidden' : ''}>
      ${count === 0 ? `<p class="status-board__empty">${empty}</p>` : `<ul class="status-board__rows">${rows(items)}</ul>`}
    </div>
  </section>`

const board = `
<div class="status-board">
  <div class="status-board__head">
    <h2 class="status-board__title">会话状态看板</h2>
    <span class="status-board__total">共 10 个会话</span>
  </div>
  <input class="status-board__filter" type="search" placeholder="筛选会话" value="" aria-label="筛选会话">
  <div class="status-board__scroll">
    ${section(
      'decision',
      '待我决策',
      1,
      '这些会话在等你拍板，才能继续',
      false,
      [['[pending] RAGFlow 图片通道实测选型', '25 分钟前']],
      '暂无会话',
    )}
    ${section(
      'executing',
      '正在执行',
      5,
      'Agent 正在处理',
      false,
      [
        ['[wip] 实现 #82 四切片', '25 分钟前'],
        ['advisor #58', '1 分钟前'],
        ['[done] 控制台交互与调型审阅', '26 分钟前'],
        ['[pending] RAGFlow 图片通道…', '25 分钟前'],
        ['DSH 看板插件开发与全链路发布', '刚刚'],
      ],
      '暂无会话',
    )}
    ${section('recent', '近期记录', 4, '最近 24 小时内有动静', true, [], '暂无会话')}
  </div>
</div>`

const page = `<!doctype html><html lang="zh"><meta charset="utf-8">
<title>浮层看板预览</title>
<style>
${tokens}
*{box-sizing:border-box}
body{
  margin:0;min-height:100vh;display:grid;grid-template-columns:280px 1fr;
  background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);
  font:16px/1.5 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;
}
.side{
  background:var(--dsw-specific-sidebar-fill);border-right:1px solid var(--dsw-alias-border-l1);
  padding:14px 10px;display:flex;flex-direction:column;gap:3px;font-size:12.5px;
}
.side .brand{font-weight:700;font-size:10px;letter-spacing:.08em;color:var(--dsw-alias-label-secondary);padding:2px 6px 8px}
.side .new{border:1px solid var(--dsw-alias-border-l1);border-radius:7px;padding:7px;text-align:center;color:var(--dsw-alias-label-secondary);margin-bottom:8px}
.side .nav{padding:6px 8px;border-radius:6px}
.side .sect{margin-top:10px;font-weight:600;font-size:10.5px;color:var(--dsw-alias-label-secondary);padding:2px 8px;display:flex;justify-content:space-between}
.side .r{padding:5px 8px;border-radius:6px;color:var(--dsw-alias-label-secondary);display:flex;gap:6px}
.side .foot{margin-top:auto;display:flex;gap:6px;align-items:center;justify-content:flex-end;border-top:1px solid var(--dsw-alias-border-l1);padding-top:10px}
.main{padding:26px 30px;color:var(--dsw-alias-label-secondary);font-size:13px}
.stage{position:relative;height:640px;margin-top:12px;border:1px dashed var(--dsw-alias-border-l2);border-radius:10px}
${panelCss}
/* preview-only: stand the overlay up in flow instead of fixed */
.status-board__overlay-root{position:absolute;padding:16px}
.status-board__overlay{box-shadow:0 12px 32px color-mix(in srgb, var(--dsw-alias-label-primary) 24%, transparent)}
</style>
<body>
<aside class="side">
  <div class="brand">deepseek HARNESS</div>
  <div class="new">＋ 新会话</div>
  <div class="nav">插件</div>
  <div class="nav">自动化任务</div>
  <div class="sect"><span>工作区</span><span>⌕ ⚙ ＋</span></div>
  <div class="r">eastroc_qa_assistant</div>
  <div class="r">[pending] RAGFlow</div>
  <div class="r">[wip] 实现 #82 四切片</div>
  <div class="foot"><span>⚙</span><span style="display:inline-flex;align-items:center;gap:4px;padding:0 6px;height:28px;border-radius:6px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-brand-primary);font-size:11px">▦<span style="background:var(--dsw-alias-state-warn-primary);color:#fff;border-radius:999px;padding:0 4px;font-size:10px;line-height:14px">1</span></span></div>
</aside>
<div class="main">
  会话区域（真实应用中这里是对话内容）
  <div class="stage">
    <div class="status-board__overlay-root">
      <div class="status-board__overlay" role="dialog" aria-label="会话状态看板" tabindex="-1">
        <div class="status-board__overlay-bar">
          <span class="status-board__overlay-title">会话状态看板</span>
          <span class="status-board__overlay-total">共 10 个会话</span>
          <button type="button" class="status-board__overlay-close" aria-label="收起看板">×</button>
        </div>
        <div class="status-board__overlay-body">${board}</div>
      </div>
    </div>
  </div>
</div>
</body></html>`

writeFileSync('.preview.html', page, 'utf8')
console.log('wrote .preview.html')