# 演示资源

README 中引用的界面截图与交互 GIF。全部取自真实 DSH Web UI
（headless Chrome + 认证 cookie 加载 `127.0.0.1` 的 GUI 服务，1440×900 视口）。

| 文件 | 内容 | 说明 |
| :--- | :--- | :--- |
| `light-tree.png` | 浅色：侧栏四状态目录树 + 环形分段悬浮按钮 | 1440×900 |
| `light-board.png` | 浅色：目录树 + 浮窗看板打开 | 1440×900 |
| `dark-tree.png` / `dark-board.png` | 深色：同一视图 | 1440×900，`prefers-color-scheme: dark` |
| `light-card.png` | 浮窗决策题卡（演示数据） | 真实构建产物渲染，1280×800 |
| `demo-collapse.gif` | 悬浮明细卡 → 展开树 → 打开看板 → 收起 | 960×600，≤3 MB |

## 数据与脱敏

- 截图前在页面 DOM 内做文本级脱敏：个人昵称/头像抹除，真实会话名替换为演示名。
- 「待我决策 / 正在执行 / 完成未看」三栏的演示行由**克隆真实行组件**注入
  （截图时 LLM 账户欠费，无法产生真实的 agent 状态）；「近期记录」为真实
  （已脱敏）会话。各栏标题计数与画面中可见的行数一致。
- 悬浮按钮的四段圆环弧与中心数字按同一演示计数改写。
- `light-card.png` 的题卡由 `harness/` 里的真实构建产物渲染（演示数据）。

## 复现

截图与注入脚本不在仓库内；入口形态或状态数量变化时按
[`.agents/skills/readme-update/SKILL.md`](../../.agents/skills/readme-update/SKILL.md)
第 3 节重拍（取认证 cookie → headless Chrome → CDP 驱动交互与截图）。
`harness/` 是本地演示宿主页（加载 `lib/client.js` 真实产物 + 演示会话快照），
用于题卡特写与本地预览：

```bash
npx esbuild page.tsx --bundle --format=iife --outfile=page.js "--define:process.env.NODE_ENV=\"production\""
python3 -m http.server 4173   # 仓库根起服务
# 打开 http://127.0.0.1:4173/docs/demo/harness/index.html（#theme=dark 切深色）
```
