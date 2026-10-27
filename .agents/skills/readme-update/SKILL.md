---
name: readme-update
description: 更新本项目的 README 文字与截图（发版后、UI 改版后、docs/demo 占位过期时）。以代码/CHANGELOG 校准事实，截取真实 DSH UI，脱敏并以 raw URL 发布，最后验证 CI 与 npm 可见性。
---

# README 更新（本项目）

用于：功能/界面改完，`README.md`、`README.en.md` 或 `docs/demo/` 还是旧描述或空占位。

---

## 0. 输入与范围

- 读 `package.json`、`CHANGELOG.md` 本版本段、`README.md`、`README.en.md`、`docs/demo/README.md`。
- 列出本版本**用户可见**变化：入口、交互、默认值、配置、修复。
- 只改相关段落；中英 README 同步（功能表、安装、默认值、截图）。
- 纯文档改动不触发 npm 发布；包内 README 在发版时冻结，要同步 npm 页面需 patch 版本，先遵守 `AGENTS.md` 的发布门禁。

---

## 1. 先校准文字（以代码为准）

按顺序更新：

1. 开头：它是什么、解决什么问题。
2. 状态表：待我决策 / 正在执行 / 近期记录 的判定规则。
3. 功能：两个入口（侧栏目录树、右下角胶囊）、纯导航、状态动效、浮窗题卡、实时/折叠/双语/主题/无障碍。
4. 安装：Plugin Manager、CLI、本地目录、源码构建。
5. 配置：默认值必须核对 `src/shared/config.ts` 与 `cordis.patch.yml`。当前默认是 `recentWindowHours: 168`（7 天）、`maxRecent: 20`、`defaultCollapsed: recent`、`showEmptyBuckets: true`——仍要现场核对，不照抄旧 README。
6. FAQ 与边界：点击会话、折叠记忆、7 天窗口、数量上限、卸载残留。

自检：

- [ ] 没有「待补充 / 截图占位 / 多列网格」等过期文案。
- [ ] 默认值、安装命令、包名与代码一致。
- [ ] 中英文信息量一致。
- [ ] 不把「近期记录 7 天」写成「24 小时」。

---

## 2. 规划截图：真实 UI 优先

最小集合：

| 文件 | 内容 | 规格 |
| :--- | :--- | :--- |
| `docs/demo/light-tree.png` | 浅色：目录树展开 + 右下角胶囊 | 1440×900 |
| `docs/demo/light-board.png` | 浅色：目录树 + 浮窗看板 | 1440×900 |
| `docs/demo/dark-board.png` | 深色：同一视图 | 1440×900 |
| `docs/demo/light-card.png` | 决策题卡（演示数据） | 1280×800 |
| `docs/demo/demo-collapse.gif` | 展开 → 打开 → 收起 | 960×600，≤3 MB |

原则：

- **UI 用真实产品截图**；生图只用于社交预览/OG，不用于功能证明。
- 当前没有待决策会话时，用真实组件 + 演示数据渲染题卡，并在 README 与 `docs/demo/README.md` 标注「演示数据」。
- 自己不能截图时，给用户精确清单：分辨率、浅/深色、展开状态、要包含的入口、文件名；不要只说「发几张图」。
- 用户提供生图时，给 prompt 但不要把它当产品截图。

---

## 3. 截取 DSH 本地 UI

前置：当前构建已安装并在运行；client-only 变化新开页面即可，Host 配置变化需重启桌面端。

### 3.1 取认证 cookie（macOS）

端口取当前 GUI URL：

```bash
PORT=51918  # 换成当前端口
sqlite3 ~/Library/Application\ Support/@deepseek-ai/dsh-desktop/Cookies \
  "select name||'='||value from cookies where host_key='127.0.0.1' and name like 'dsh-auth-%' and value like '%'||$PORT||'%' limit 1;"
```

### 3.2 headless Chrome + CDP

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --hide-scrollbars \
  --remote-debugging-port=9222 --user-data-dir=/tmp/dsh-chrome-profile about:blank &
```

Node 脚本用 `fetch` 建 target、内置 `WebSocket` 发 CDP：

```js
const target = await (await fetch('http://127.0.0.1:9222/json/new?about:blank', { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
// Page.enable / Network.enable
// Network.setCookie({ name, value, domain:'127.0.0.1', path:'/', url: GUI_URL })
// Emulation.setDeviceMetricsOverride({ width:1440, height:900, deviceScaleFactor:1, mobile:false })
// Page.navigate(GUI_URL); 等 load + 6s
// 点掉「继续」弹窗
// 点 [data-status-board-entry] 展开树
// 点 .status-board__fab 打开看板
// Page.captureScreenshot({ format:'png' })
```

- 深色：`Emulation.setEmulatedMedia({ features:[{ name:'prefers-color-scheme', value:'dark' }] })`，确认 `getComputedStyle(document.body).backgroundColor` 已变暗。
- GIF：初始 → 展开树 → 打开看板 → 收看板 → 收树；每步 400–700ms 截图。
- 检查 console error；固定 1440×900。
- 入口选择器以当前 DOM 为准；改版后先查 `[data-status-board-entry]`、`.status-board__fab` 是否还在。

---

## 4. 脱敏与素材

- 截图前处理个人头像/昵称/真实会话名/私密路径。
- **不要纯色矩形硬盖**：按行采样侧栏空白背景色逐行填充，保留渐变；深色同理。
- 逐帧处理 GIF；处理后原尺寸检查边缘。
- `docs/demo/README.md` 写清文件、内容、来源/规格，并注明「头像/昵称已抹除」「题卡为演示数据」。

---

## 5. README 放图：raw URL

npm 只打包 `files` 白名单，`docs/` 通常不在包内，相对图片在 npm 会 broken。用：

```md
https://raw.githubusercontent.com/ccclucky/dsh-plugin-status-board/main/docs/demo/light-board.png
```

结构：

```md
## 界面

<p align="center">
  <img src="<raw>/light-board.png" alt="侧栏目录树与浮窗看板" width="820">
</p>

| 目录树 + 胶囊 | 浮窗决策题卡（演示数据） |
| :---: | :---: |
| ![目录树](<raw>/light-tree.png) | ![决策题卡](<raw>/light-card.png) |

| 深色主题 | 展开 / 打开 / 收起 |
| :---: | :---: |
| ![深色](<raw>/dark-board.png) | ![交互](<raw>/demo-collapse.gif) |
```

- 首图选能说明「两个入口」的 `light-board.png`。
- 每张图写 alt + caption；英文用 `## Screenshots` 同步翻译。
- 图片推送到 main 后再写 README，避免链接 404。

---

## 6. 验证

- [ ] `curl -s -o /dev/null -w '%{http_code}\n' <raw>` 返回 200。
- [ ] GIF ≤3 MB，帧序能读懂。
- [ ] 无头像/昵称/私密信息；题卡标注演示数据。
- [ ] README 默认值、命令、功能与代码一致；中英同步。
- [ ] 新页面无 console error；浅色/深色都看。
- [ ] 提交、推送、CI 绿；纯文档不改版本、不擅自发布。
- [ ] 若要 npm 页面同步，说明需要 patch 版本。

---

## 7. 反模式

- 用生图模型生成产品 UI，或把生成图当真实界面。
- 保留个人头像/昵称；纯色块硬盖。
- README 用相对图片路径。
- 只改中文或只改文字。
- 把「CI 绿」当成 npm README 已更新。
- 为更新 README 擅自发版。

---

## 8. 交付话术

- 截图哪几张、路径、尺寸、是否脱敏、是否演示数据。
- README/README.en 改了哪些章节。
- 图片 raw URL 验证结果、CI 结果。
- 明确 npm 包内 README 是否同步；未同步就说需要 patch 版本。
