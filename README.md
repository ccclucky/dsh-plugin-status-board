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
| **待我决策** | 会话正在等你回话：工具用 `ask_user_question` 停在那里等你回答（含计划审阅），或 Lead 会话里有「已就绪且待认领」的团队任务 | 「我现在必须处理什么？」 |
| **正在执行** | 会话的 Agent 正在干活，且不需要用户介入 | 「后台在跑什么？」 |
| **近期记录** | 其余会话中，在时间窗口内有活动的 | 「最近动过什么？」 |

判定顺序是**排他的**：一个会话只会出现在一块看板里。这也正是它相对原生侧栏列表的价值——原生列表按工作区/时间排列，看不出「谁在等我」；看板按**行动优先级**排列。

> **演示占位**
> 截图/GIF 待补充：`docs/demo/demo-light.png`（浅色主题）、`docs/demo/demo-dark.png`（深色主题）、`docs/demo/demo-collapse.gif`（折叠交互）。
> 三块看板在宽屏下为多列网格，窄屏（≤720px）自动堆叠为单列。

---

## 功能

- **三块响应式折叠看板**：`待我决策` / `正在执行` / `近期记录`；默认只折叠「近期记录」，让前两块——真正需要你注意的——始终展开。
- **状态优先级正确**：等待用户决策的会话即使 Agent 仍在执行，也归入「待我决策」，不会被「正在执行」淹没。
- **实时跟随**：直接订阅 Harness 已有的会话列表快照，不轮询、不重复扫描会话日志。
- **折叠状态记忆**：三块看板的展开/收起状态按用户偏好持久化（`localStorage`）。
- **中英双语**：界面文案与插件管理页标题/描述均随 Harness 语言设置切换。
- **主题自适应**：配色全部取自 Harness 主题令牌，浅色/深色主题自动跟随。
- **键盘与读屏可用**：每块看板的标题是真实 `<h2>`，内部是展开/收起按钮（WAI-ARIA accordion 模式），带 `aria-expanded` 与始终可解析的 `aria-controls`；标签同时播报看板名、动作与数量。面板标题用 `aria-labelledby` 关联，DOM id 由 `useId` 生成，多开面板不冲突。
- **空状态与截断提示**：空看板、被数量上限截断的「近期记录」都有明确说明，不静默丢弃数据。

---

## 一键安装

### 方式一：Plugin Manager（推荐）

1. 打开 DSH Web UI → **Settings → Plugins**。
2. 选择 **Install bundle**，填入本包的**绝对路径**（本地目录安装）或包名（已发布到 npm 时）。
3. 安装完成后刷新页面，侧栏导航区（「自动化任务」下方）会出现**会话状态看板**一行，后面跟着三个计数（待决策 · 执行中 · 近期）。点击该行即在侧栏右侧弹出看板；按 `Esc`、点面板外或点面板右上角 × 均可收起。

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
        recentWindowHours: 24
        maxRecent: 20
        defaultCollapsed: recent
        showEmptyBuckets: true
```

| 配置项 | 类型 | 默认值 | 取值范围 | 说明 |
| :--- | :--- | :--- | :--- | :--- |
| `recentWindowHours` | number | `24` | 1 – 720 | 「近期记录」看板的时间窗口（小时）。超出窗口的会话不进入该看板。 |
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
                                       │   sidebar.panellist → 导航行   │
                                       │   shell.overlay    → 浮层看板  │
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
pnpm test        # vitest，182 个用例
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
│       ├── index.tsx            # 插槽注册（导航行 + 浮层 + 字典）
│       ├── overlay.tsx          # 导航行入口 + 浮层容器（含点击拦截、定位、收起）
│       ├── Panel.tsx            # 三看板视图
│       ├── store.ts             # 外部 store（useSyncExternalStore）
│       ├── session-source.ts    # 运行时快照 → 分类输入的唯一适配点
│       └── styles.ts            # 主题令牌驱动的样式
├── locale/{zh,en}.json          # 界面文案 + 插件管理页元数据
├── tests/                       # 182 个单元测试
├── scripts/                     # 清理与 Client 信封包装
├── cordis.patch.yml             # bundle 补丁（含默认配置）
└── tsdown.config.ts             # 两半部独立构建
```

### 测试覆盖

| 测试文件 | 覆盖内容 |
| :--- | :--- |
| `board.test.ts` | 分类优先级、排序稳定性、时间窗口、截断计数、折叠状态 |
| `config.test.ts` | 默认值、上下界钳制、非法类型回退 |
| `i18n.test.ts` | 中英键对齐、必需键校验、单遍占位符插值、相对时间 |
| `session-source.test.ts` | 运行时快照适配、子会话/空白会话过滤、决策投影读取、异常行容错 |
| `store.test.ts` | 订阅通知、变更检测、折叠持久化、配置晚到不覆盖用户选择、卸载语义 |
| `panel.test.tsx` | 服务端渲染：三看板、折叠、aria 关系可解析、加载/空/错误态、主题令牌 |
| `overlay.test.tsx` | 浮层开关、Esc/外部点击收起、焦点进入面板、控制器通知语义 |
| `nav-entry.test.tsx` | 导航行拦截点击（不触发跳转）、计数描述、卸载后还原框架行为 |
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
通过 Harness 的 `uiWorkspace.openSession` 跳到该会话。若当前配置未提供该服务，行会渲染成静态文本而不是可点按钮——界面不会给出点不动的假按钮。

**折叠状态存在哪里？**
浏览器 `localStorage`，键名 `dsh-plugin-status-board.collapse.v1`。清除该项即恢复配置里的默认折叠方式。隐私模式下写入失败会自动降级为仅本次页面有效。

**卸载插件后残留什么？**
不残留。样式是面板组件内的 `<style>` 元素，随组件卸载一并移除；所有插槽注册和订阅都包在 `ctx.effect` 里，卸载即释放。

---

## 许可

[MIT](LICENSE) © 2026 CCLUCKY

---

<div align="center">

**会话状态看板** — 不用翻列表，一眼看出谁在等你。

</div>