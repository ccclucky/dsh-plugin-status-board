<div align="center">

# 会话状态看板 · Session Status Board

**DSH 会话状态分类看板插件 — 一屏看清每个会话到底卡在哪一步。**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/dsh-plugin-status-board.svg)](https://www.npmjs.com/package/dsh-plugin-status-board)
[![npm downloads](https://img.shields.io/npm/dm/dsh-plugin-status-board.svg)](https://www.npmjs.com/package/dsh-plugin-status-board)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6.svg)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node-%E2%89%A520-339933.svg)](https://nodejs.org/)
[![DSH Plugin](https://img.shields.io/badge/DSH-Plugin-247bbf.svg)](https://github.com/deepseek-ai/deepseek-harness)

[简体中文](README.md) · [English](README.en.md)

</div>

---

## 这是什么

`dsh-plugin-status-board` 是 DeepSeek Harness（DSH）的 Web UI 插件。它把 Harness 里散落在侧栏的会话，按**当前真实状态**重新归入三块可折叠看板：

| 看板 | 判定规则 | 它回答的问题 |
| :--- | :--- | :--- |
| **待我决策** | 会话的 `userQuestions` 投影里有仍待回答的 `ask_user_question`（含计划审阅） | 「我现在必须处理什么？」 |
| **正在执行** | 会话的 Agent 正在干活，且不需要用户介入 | 「后台在跑什么？」 |
| **近期记录** | 其余会话中，在时间窗口内有活动的 | 「最近动过什么？」 |

判定顺序是**排他的**：一个会话只会出现在一块看板里。这也正是它相对原生侧栏列表的价值——原生列表按工作区/时间排列，看不出「谁在等我」；看板按**行动优先级**排列。

> **演示占位**
> 截图/GIF 待补充：`docs/demo/demo-light.png`（浅色主题）、`docs/demo/demo-dark.png`（深色主题）、`docs/demo/demo-collapse.gif`（折叠交互）。
> 侧栏树是单列嵌套目录；浮窗看板固定单列，宽屏下约 380px。

---

## 功能

- **两个入口，各司其职**：侧栏「会话状态看板」行向下展开 **3 个状态目录**（像 3 个项目分组），点会话直接打开；右下角悬浮胶囊弹出 **完整看板**。
- **侧栏树是纯导航**：目录下是会话行，点击行为与工作区一致；不在树里放批准/回答按钮。
- **状态标记有形态与动效**：目录静止（待决策实心琥珀点、进行中蓝色弧线、近期灰点）；会话行动态（待决策空心琥珀环缓慢呼吸、进行中蓝色弧线脉冲、近期静止）。不旋转，减少动态偏好下自动关闭。
- **浮窗里的就地题卡**：浮窗的决策行可展开题目；`continued` 题直接提交，`open` 题仍指向会话里的官方题卡。
- **三块可折叠看板**：`待我决策` / `正在执行` / `近期记录`；默认只折叠「近期记录」，让前两块——真正需要你注意的——始终展开。
- **状态优先级正确**：等待用户决策的会话即使 Agent 仍在执行，也归入「待我决策」，不会被「正在执行」淹没。
- **实时跟随**：直接订阅 Harness 已有的会话列表快照，不轮询、不重复扫描会话日志。
- **折叠状态记忆**：侧栏 3 个目录与浮窗 3 块看板共用同一份展开/收起状态，按用户偏好持久化（`localStorage`）。
- **中英双语**：界面文案与插件管理页标题/描述均随 Harness 语言设置切换。
- **主题自适应**：配色全部取自 Harness 主题令牌，浅色/深色主题自动跟随。
- **键盘与读屏可用**：每块看板的标题是真实 `<h2>`，内部是展开/收起按钮（WAI-ARIA accordion 模式），带 `aria-expanded` 与始终可解析的 `aria-controls`；标签同时播报看板名、动作与数量。面板标题用 `aria-labelledby` 关联，DOM id 由 `useId` 生成，多开面板不冲突。
- **空状态与截断提示**：空看板、被数量上限截断的「近期记录」都有明确说明，不静默丢弃数据。

---

## 一键安装

### 方式一：Plugin Manager（推荐）

1. 打开 DSH Web UI → **Settings → Plugins**。
2. 选择 **Install bundle**，填入本包的**绝对路径**（本地目录安装）或包名（已发布到 npm 时）。
3. 安装完成后刷新页面，侧栏导航区会出现**会话状态看板**一行。点击该行会向下展开 3 个状态目录，点目录里的会话即可打开；右下角的悬浮胶囊按钮则会弹出完整看板。看板按 `Esc`、点面板外或点面板右上角 × 均可收起。

### 方式二：命令行（从 npm 安装，推荐脚本化场景）

包已发布到 npm，无需克隆或构建，`lib/` 产物随包分发：

```bash
npm install -g dsh-plugin-status-board        # 或 npm i dsh-plugin-status-board
dsh plugin --profile <profile> add dsh-plugin-status-board
```

### 方式三：从本地目录安装

```bash
# 目录中必须已有 lib/ 产物（npm 安装的副本已自带）
dsh plugin --profile <profile> add /absolute/path/to/dsh-plugin-status-board
```

### 方式四：从源码构建（Git 安装必须先构建）

`lib/` 是构建产物，不进入版本库。从 Git 克隆后请先构建，再安装：

```bash
git clone https://github.com/ccclucky/dsh-plugin-status-board.git
cd dsh-plugin-status-board
pnpm install
pnpm build      # 产出 lib/index.js（Host）与 lib/client.js（Client）
pnpm test       # 运行全部单元测试

# 构建完成后再交给 CLI 安装
dsh plugin --profile <profile> add .
```

构建产物结构：

```
lib/
├── index.js              # Host 半部（ESM，Cordis Loader 加载）
├── client.js             # Client 半部（__ModuleLoader__ 信封）
└── types/**/*.d.ts       # 类型声明
```

---

## 配置项

配置写在 `cordis.patch.yml` 的插件行里，也可在 **Settings → Plugins → 本插件** 页面修改（由 `Config` schema 生成表单，带范围校验）。

```yaml
- insert:
    - id: status-board
      name: 'dsh-plugin-status-board'
      config:
        recentWindowHours: 168
        maxRecent: 20
        defaultCollapsed: recent
        showEmptyBuckets: true
```

| 配置项 | 类型 | 默认值 | 取值范围 | 说明 |
| :--- | :--- | :--- | :--- | :--- |
| `recentWindowHours` | number | `168` | 1 – 720 | 「近期记录」看板的时间窗口（小时），默认 7 天；超出窗口的会话不进入该看板。 |
| `maxRecent` | number | `20` | 1 – 200 | 「近期记录」看板最多显示的行数；超出部分在看板底部提示「另有 N 个较早会话未显示」。 |
| `defaultCollapsed` | string | `recent` | `decision` / `executing` / `recent` / `none` / `all` | 初次加载时哪块看板处于折叠状态。用户一旦手动折叠过，以用户选择为准。 |
| `showEmptyBuckets` | boolean | `true` | `true` / `false` | 空看板是否仍渲染标题栏。设为 `false` 时，没有会话的看板整体隐藏。 |

> 越界值会被**钳制**到合法范围，类型错误会**回退**到默认值，而不是让插件加载失败——手工编辑的配置写错一个数字，不应让整个面板白屏。

---

## 工作原理

```
┌─────────────────────────────┐        ┌──────────────────────────────┐
│ Host 半部 (Node)            │        │ Client 半部 (Browser)        │
│                             │        │                              │
│ Config schema 校验/钳制     │───────▶│ GET /status-board/config     │
│                             │  JSON  │   ↓ 失败则用文档默认值        │
│ 只读配置路由                │        │ 会话列表快照 ──┐              │
└─────────────────────────────┘        │   (Harness 已发布)            │
                                       │                ▼              │
                                       │      分类 / 排序 / 截断        │
                                       │                ▼              │
                                       │   sidebar.panellist → 行点击   │
                                       │     └─ portal 内联树（纯导航） │
                                       │   shell.overlay    → 右下角胶囊│
                                       │     └─ 浮窗看板 + L2 题卡      │
                                       └──────────────────────────────┘
```

三个设计取舍：

1. **看板由 Client 半部计算**。Harness 已经把会话列表推送到浏览器，插件订阅即可；把分类放到 Client 侧可以做到零延迟、零额外请求，也让 Host 半部保持极薄。
2. **Host 半部只发布配置**。唯一的跨进程需求是「操作者在 `cordis.patch.yml` 里配了什么」，所以只有一条只读、不缓存的 JSON 路由。
3. **会话快照的形状只在一个文件里出现**。`src/client/session-source.ts` 是唯一适配运行时快照的地方；Harness 升级改字段时，只需改这一个文件，分类器、视图和全部测试都不受影响。

---

## 开发

```bash
pnpm install
pnpm typecheck   # tsc --noEmit，strict + exactOptionalPropertyTypes
pnpm test        # vitest，187 个用例
pnpm build       # 清理 → 声明文件 → 两半部打包 → Client 信封包装 → 产物自检
pnpm verify      # 只跑构建产物自检（需先 build）
pnpm test:watch  # 监听模式
```

### 项目结构

```
dsh-plugin-status-board/
├── src/
│   ├── index.ts                 # Host 半部：Config schema + 只读配置路由
│   ├── shared/                  # 两半部共用的纯逻辑（无 Harness 依赖）
│   │   ├── board.ts             #   分类 / 排序 / 时间窗口 / 截断 / 折叠状态
│   │   ├── config.ts            #   配置默认值与边界钳制
│   │   ├── i18n.ts              #   双语字典、插值、相对时间
│   │   ├── route.ts             #   跨进程常量（路由路径、marker）
│   │   └── types.ts             #   共享类型契约
│   └── client/
│       ├── index.tsx            # 插槽注册（侧栏行 + 浮动按钮 + 字典）
│       ├── overlay.tsx          # 行拦截 + 真内联树 portal + 浮动按钮/看板容器
│       ├── Tree.tsx             # 侧栏 3 个状态目录 + 会话行（纯导航）
│       ├── Panel.tsx            # 浮窗看板 + 决策行题卡入口
│       ├── QuestionCard.tsx     # L2 题卡（continued 就地提交 / open 跳会话）
│       ├── store.ts             # 外部 store（useSyncExternalStore）
│       ├── session-source.ts    # 运行时快照 + userQuestions → 分类/题卡输入
│       └── styles.ts            # 主题令牌驱动的样式
├── locale/{zh,en}.json          # 界面文案 + 插件管理页元数据
├── tests/                       # 187 个单元测试
├── scripts/                     # 清理与 Client 信封包装
├── cordis.patch.yml             # bundle 补丁（含默认配置）
└── tsdown.config.mjs            # 两半部独立构建（纯 ESM，见文件头注释）
```

### 测试覆盖

| 测试文件 | 覆盖内容 |
| :--- | :--- |
| `board.test.ts` | 分类优先级、排序稳定性、时间窗口、截断计数、折叠状态 |
| `config.test.ts` | 默认值、上下界钳制、非法类型回退 |
| `i18n.test.ts` | 中英键对齐、必需键校验、单遍占位符插值、相对时间 |
| `session-source.test.ts` | 运行时快照适配、子会话/空白会话过滤、决策投影读取、题目负载裁剪、异常行容错 |
| `store.test.ts` | 订阅通知、变更检测、折叠持久化、配置晚到不覆盖用户选择、卸载语义 |
| `panel.test.tsx` | 服务端渲染：三看板、折叠、aria 关系可解析、加载/空/错误态、主题令牌、题卡展开/提交 |
| `overlay.test.tsx` | 浮动按钮开关、Esc/外部点击收起、焦点进入/返回、决策徽标、控制器通知语义 |
| `nav-entry.test.tsx` | 行点击拦截、portal 内联树、纯导航会话行、56px 轨道隐藏、无 nav 降级、卸载清理 |
| `host.test.ts` | 配置路由 GET/HEAD/405、Allow 头、effect 清理、webServer 延迟挂载 |
| `manifest.test.ts` | 清单/补丁/locale/图标/MIT/LICENSE 一致性 |
| `artifacts.test.ts` | 构建产物：Host 真实导出、Client 信封、React 外置、字典内联、样式未被改写 |

---

## 常见问题

**面板里看不到我的会话？**
看板只列出**顶层**会话：子 Agent 派生的会话（`origin: 'subagent'` 或带父会话 id 的行）已体现在父会话上；从未交换过消息的空白会话也没有状态可报，且其默认标题就是工作区名，容易读成幽灵行。这样列出的才是「你真正在对话的会话」。

**为什么某会话在「待我决策」里但它其实还在跑？**
这是刻意设计。「Agent 仍在跑」和「它在等你拍板才能继续」可以同时成立，后者更重要——它才是阻塞点。判定只读取运行时的 `userQuestions.active` 投影（`ask_user_question` 工具正等待人工回答，含计划审阅）。

团队任务的 `pending` 状态**不参与判定**：实测持久化日志里一条明确记录只有 `id/revision/subject/status`，没有 `ready` 字段，而工单结束后其任务行会永远停留在 `pending`。早先版本按它判定，结果把六天前就完成的会话钉在了「待我决策」上。

**点击会话行会怎样？**
侧栏树和浮窗看板都通过 Harness 的 `uiWorkspace.openSession` 跳到该会话。若当前配置未提供该服务，行会渲染成静态文本而不是可点按钮——界面不会给出点不动的假按钮。

**折叠状态存在哪里？**
浏览器 `localStorage`，键名 `dsh-plugin-status-board.collapse.v1`。侧栏树的 3 个目录和浮窗的 3 块看板共用这份折叠状态；清除该项即恢复配置里的默认折叠方式。隐私模式下写入失败会自动降级为仅本次页面有效。

**卸载插件后残留什么？**
不残留。样式是面板组件内的 `<style>` 元素，随组件卸载一并移除；侧栏树的 portal 容器、行上的点击捕获和 `MutationObserver` 都在清理函数里释放；所有插槽注册和订阅都包在 `ctx.effect` 里。

---

## 发布流程（维护者）

> 由 agent 执行发布时，先读仓库根的 [`AGENTS.md`](AGENTS.md)：那里有完整命令序列、各关卡的失败含义，以及几条「改了就会让 CI 红但本机绿」的构建不变量。

发布由 GitHub Actions 完成，**不在本机 `npm publish`**。唯一的闸门是「发布一个 Release」这个人工动作：

1. 升版本号并同步 `CHANGELOG.md`，提交、推 `main`、等 CI 绿。
2. 打 tag 并推送：`git tag -a v0.2.2 -m "..." && git push origin v0.2.2`。
3. 建**草稿** Release 写说明：`gh release create v0.2.2 --draft --title ... --notes-file ...`。
4. 确认无误后点 **Publish release** → `release.yml` 接管，此后无人值守。

草稿阶段可随时改可撤，这是「发 Release 才发布」相对「推 tag 即发布」多出的那一次反悔机会。

`release.yml` 在真正发布前逐条把关：

| 关卡 | 不满足时 |
| :--- | :--- |
| tag 形如 `v*`，且去掉 `v` 后与 `package.json` 完全一致 | 失败，并提示「tag 是事实源，改清单而不是挪 tag」 |
| 该版本尚未存在于 npm | 失败，提示先升版本（npm 禁止覆盖已发布版本） |
| 版本号带预发布标识（`-rc.1` 等） | 自动改用 `--tag next`，不污染 `latest` |
| typecheck / build / 单元与产物测试 / pack | 任一步红即不发布 |

通过后执行 `npm publish --provenance`，凭据是仓库 secret **`NPM_TOKEN`**（经 `NODE_AUTH_TOKEN` 传入）。`--provenance` 需要的 Sigstore 证书由 runner 的 OIDC 身份换取，也就是 `id-token: write` 权限——**两者都要，它不是另一套登录方式**：去掉 `id-token` 发布照样成功，只是会静默丢掉溯源。发布后还会在一个与本次 checkout 毫无关系的干净目录里 `npm install` 回来并 `import()` 一次——这是唯一能发现「打包清单漏了文件、`exports` 写错」这类问题的步骤。

> ⚠️ `setup-node` 必须同时配 `registry-url`，否则 `NODE_AUTH_TOKEN` 会被**静默忽略**，错误要到几步之后才以 `ENEEDAUTH` 出现。

想在不发布的前提下验证整条链路，可在 **Actions → Release → Run workflow** 里勾上 dry run（默认勾选）：它会跑完全部关卡与构建，只跳过发布与装回。

### 一次性配置

只需要一个仓库 secret（本仓库已配好）：

```bash
# 从本机 .npmrc 取 token；经 stdin 传入，避免出现在命令行里被同机用户看到
$tok = (Select-String -Path .npmrc -Pattern '_authToken=(\S+)').Matches[0].Groups[1].Value
$tok | gh secret set NPM_TOKEN
```

建议在 npm 上另建一个 **Automation** 类型的 token（不能登录网页、不能改账户设置）替换现在这个——当前 token 可绕过 2FA，权限比发布所需的更宽。

---

## 许可

[MIT](LICENSE) © 2026 CCLUCKY

---

<div align="center">

**会话状态看板** — 不用翻列表，一眼看出谁在等你。

</div>