# 实时活动（Live activities）

[English](README.en.md) · 简体中文

参考 iOS 实时活动（Live Activities）设计的 DSH 插件：agent 为长时间运行的任务创建一张悬浮状态卡片，卡片浮在 DSH 窗口之上，回复结束后继续显示，任务阶段、进度和预计完成倒计时实时更新。

## 安装

DSH 插件以「bundle」形式安装，本仓库目录本身就是一个 bundle：

```sh
git clone https://github.com/Tippye/dsh-live-activity.git
```

然后在 DSH 里打开 **插件** 面板，用 **添加插件** 选择刚克隆的目录，装好后启用 `@local/dsh-live-activity`。依赖（`zod`）由安装过程自动解析，不需要手动 `npm install`。启用后不需要任何配置。

卸载或停用时，已创建的卡片记录仍留在 profile 的存储里，重新启用后会继续显示。

## 为什么是「app 内悬浮」

iOS 实时活动由系统托管，App 进后台甚至被挂起后卡片仍由 iOS 呈现和刷新。DSH 桌面端是 Electron 应用，但 Host 插件运行在 `dsh-desktop-host` 子进程里（`ELECTRON_RUN_AS_NODE=1`），拿不到 `electron` 模块，也就**不能**直接创建原生置顶窗口；主进程回给插件的 IPC 只有 `quit-inspection`、`update-tasks`、`platform-session`、`plugin-operation`，没有建窗请求。因此本插件把卡片渲染在 DSH 自己的窗口里——即 `shell.overlay` 这个「帧级浮层」slot，它位于所有列之上、滚动容器之外，所以卡片看起来就是一个贴着窗口的悬浮窗，切换会话也不会消失。

真正做成系统桌面级置顶窗有两条后续路线（本版本未实现）：Client 半边用 Chromium 的 `documentPictureInPicture.requestWindow()`（需要用户手势，生命周期绑页面），或 Host 用 `ctx.subprocess` 拉起一个独立的 Swift/SwiftUI `NSPanel` helper（DSH 的 macOS 桌面控制插件就是这么做的）。

## 什么任务才配一张卡片

卡片只给「跑起来之后有一个持续变化的量」的任务。创建时必须给出三者之一，否则直接被拒：

| 允许 | 例子 |
|---|---|
| 确定进度（分数） | `progress: 0.42` |
| tqdm 式计数 | `completed: 120, total: 500`（自动换算成 0.24） |
| 数值序列（图表） | `metrics: [{ "name": "loss", "value": 0.42 }]`，每次更新再补一个点，卡片画成折线 |

拒绝的情况：只有阶段描述的「状态卡片」、已经完成的步骤、只有一个 ETA 的任务、一次性工具调用、纯决策或确认。这些内容写在回复里就够；需要长期保存的清单用 `dsh_board`。卡片已存在后，`update` 也不能把进度和序列一起清掉（想收尾就 `end`），这样卡片不会退化成一块只显示文字的状态牌。

## 外观

卡片参考 [shadcn charts](https://ui.shadcn.com/charts/area) 的视觉语言：平面卡片（1px 边框 + 极浅投影，不用毛玻璃）；标题 `13px/500`、阶段说明 `12px` 次要色；进度用大号百分比（`24px/600`、等宽数字）配 6px 圆角进度条；每条数值序列是一张面积图——2px 描边、自上而下衰减的渐变填充、三条虚线水平网格；时间与状态是描边 badge，而不是彩色药丸。所有颜色都取自 `--dsw-alias-*` 主题变量，随深浅色主题切换。

## 对照 ActivityKit

| ActivityKit | 本插件 |
|---|---|
| `ActivityAttributes`（创建时固定） | `attributes`：`title`、`subtitle`、`symbol`、`accent`，创建后不可改 |
| `ContentState`（可更新） | `state`：`phase`、`detail`、`progress`、`etaEpochSeconds`，每次 `update` 局部合并 |
| `Activity.request` | `live_activity` 的 `action: "create"` |
| `activity.update` | `action: "update"` |
| `activity.end` + `dismissalPolicy` | `action: "end"` + `dismissalPolicy` |
| `staleDate` / `isStale` | `staleAfterSeconds`，超过后卡片进入「待更新」并变黄 |
| `Text(timerInterval:)` 倒计时 | `etaEpochSeconds` 由浏览器本地每秒递减，不需要持续更新 |
| `ProgressView(value:)` 进度条 | `progress`，或 `completed`/`total` 折算的 tqdm 式进度 |
| 卡片上的实时图表 | `metrics` 命名的数值序列，卡片为每条序列画一条折线（最多 3 条，各保留最近 60 点） |
| 8 小时上限、结束后最多保留 4 小时 | 同样的上限与保留窗口 |
| `Activity.activities`（重启后找回） | 记录存在 profile 的 storageDomain 里，DSH 重启后卡片仍在 |

## 使用

安装并启用后不需要任何配置。让 agent 做一件有进度可看的事，它就会自己开卡片：

- 「把 web 包构建发布，用 `completed`/`total` 实时更新进度。」
- 「跑完整的测试套件，用卡片显示通过数。」
- 「训练这个模型 200 个 epoch，把 loss 画在卡片上。」
- 「部署到预发环境，完成后把卡片结束掉。」

纯状态类任务（「帮我确认下版本」「检查报告来源」）不会开卡片——它会被拒绝，agent 只能写在回复里。这条限制对已经创建的卡片同样有效：新版本上线时如果还挂着旧的状态卡片，它不能再被 `update`，但可以正常 `end`。

卡片默认出现在窗口右上角（`top: 72px; right: 20px`）。拖动卡片标题栏可以移动整叠卡片，标题栏获得焦点后也可以用方向键移动（`Shift` + 方向键为 4 像素微调），位置和折叠状态记在浏览器本地；点击卡片右上角 × 移除一张卡片，点击底部向上箭头把卡片收成一个胶囊，点胶囊再展开。超过 3 张时折叠成「还有 N 个」。如果卡片接口连续 3 次不可达，右上角会出现一次可关闭的「实时活动暂不可用」提示，而不是每张卡片自己报错。

## Agent API

`live_activity` 是唯一入口，和悬浮卡片共用同一个 store。下面三种创建方式都合法（至少要有一种），第四种会被拒：

```json
{"action":"create","title":"构建发布","subtitle":"prod","phase":"编译中","completed":120,"total":500,"etaEpochSeconds":1763650000,"staleAfterSeconds":300,"symbol":"build"}
```

```json
{"action":"create","title":"训练 YOLO","phase":"Epoch 1","metrics":[{"name":"loss","value":0.92}]}
```

```json
{"action":"update","id":"<id>","phase":"Epoch 2","metrics":[{"name":"loss","value":0.71},{"name":"lr","value":0.0003}]}
```

```json
{"action":"end","id":"<id>","phase":"已发布","dismissalPolicy":{"afterSeconds":120}}
```

```json
{"action":"list","status":"active"}
```

- `create` 需要 `title`、`phase`，以及 `progress`、`completed`+`total`、`metrics` 三者之一；`symbol` 取 `task`/`run`/`build`/`deploy`/`download`/`search`/`sync`/`alert`，`accent` 取 `brand`/`success`/`warn`/`error`/`idle`。
- `update`/`end` 里 `phase`、`detail`、`progress`、`etaEpochSeconds` 是局部合并：不传就保留，传 `null` 就清除（`progress: null` 会连 `completed`/`total` 一起清）。
- `completed`/`total`：`total` 必须是正整数，`completed` 会被夹到 `[0, total]`；只传 `completed` 时沿用上次的 `total`，适合 tqdm 那种总量固定、计数递增的循环。
- `metrics`：每次调用为每条序列追加一个点，同名续写、新名新建（最多 3 条，每条保留最近 60 点），`metrics: null` 清空全部序列。
- `dismissalPolicy`：`"default"` 结束后保留 10 分钟，`"immediate"` 立刻消失，`{"afterSeconds":n}` 自定义（1–14400 秒）。
- 同一时刻最多 8 张活动卡片，超过时先 `end` 旧卡片。

## 实现位置

- `index.js`：工具注册、`/api/dsh-live-activity` 只读路由（页面只能 list/get/dismiss）、系统提示词、每 15 秒的过期清理。
- `model.js`：校验、状态合并、生命周期推导（`stale`、`expiresAt`、`dismissAt`）、store。
- `client.js`：`shell.overlay` 里的悬浮卡片栈，2 秒轮询、1 秒本地倒计时。
- 数据存在 profile 的 `dsh_live_activity` domain 里；损坏的记录会被备份并跳过，不会让插件整体加载失败。

## 已知限制

- 卡片只在 DSH 窗口可见范围内显示，窗口最小化时看不到；这不是系统级桌面挂件。
- 卡片内容只由 agent 写，界面里不能编辑阶段或进度（只能移除）。
- 轮询间隔 2 秒，agent 更新到卡片刷新最多有约 2 秒延迟；倒计时不依赖轮询。
- 卡片必须由 agent 调用工具创建；界面里没有「手动新建卡片」入口。
- 卡片上的曲线是自带的小折线图（sparkline），不是完整图表；需要坐标轴、图例、多序列交互的图请用 `dsh_board` 的 ECharts 图表。

## 隐私

卡片内容存在本机 profile 的存储里，不发送到任何第三方服务。界面与 Host 之间的通信只有同源的 `POST /api/dsh-live-activity`，且只允许 `list`、`get`、`dismiss`，agent 侧才能写入。

## 开发

```sh
npm test          # 运行 model.js 的状态机与生命周期断言
```

修改后重新加载：改 Host 代码需要在 **插件** 面板点刷新；改 `client.js` 后刷新一次窗口即可。

## 许可

[MIT](LICENSE) © 2026 Tippye
