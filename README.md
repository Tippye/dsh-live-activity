# 实时活动（Live activities）

[English](README.en.md) · 简体中文

参考 iOS 实时活动（Live Activities）设计的 DSH 插件：agent 为长时间运行的任务创建一张悬浮状态卡片，卡片浮在 DSH 窗口之上，回复结束后继续显示，任务阶段、进度和预计完成倒计时实时更新。

![运行中的实时活动卡片：一张只有计数进度条，一张带进度和两条面积图](docs/cards.png)

上图是在运行中的 DSH 窗口里截的：上方一张只有 `9 / 12` 计数进度条，下方一张带进度条和 loss / mAP 两条渐变面积图，标题右侧是每张卡片各自的折叠与关闭按钮。卡片内容由 agent 写入，界面文字跟随应用语言（截图是浅色主题 + 中文界面）。

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

卡片默认出现在窗口右上角（`top: 72px; right: 20px`），多张时依次向下排。**每张卡片独立控制**：

| 操作 | 方式 |
|---|---|
| 拖拽 | 拖卡片标题栏（或折叠后的胶囊）只移动这一张；卡片获得焦点后也可用方向键移动，`Shift` + 方向键为 4 像素微调 |
| 折叠 | 标题栏上的「⌃」把它单独收成一颗胶囊（圆点 + 标题 + 阶段 + 数值），点胶囊或按 Enter 展开；胶囊上仍可拖拽、可关闭 |
| 关闭 | 标题栏或胶囊上的 × 移除这一张（等价于 `live_activity` 的 `dismiss`） |

每张卡片的位置与折叠状态按卡片 id 分别记在浏览器本地，重启后保持；已被移除的卡片，其布局记录会在下一次轮询时清掉。如果卡片接口连续 3 次不可达，右上角会出现一次可关闭的「实时活动暂不可用」提示，而不是每张卡片自己报错。

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

## 程序驱动进度（HTTP 接口）

进度不必经 agent 中转：插件在 `127.0.0.1:41363` 起了一个本机 HTTP 接口，`action: "endpoint"` 会告诉你地址和令牌文件，同一套操作与门禁都适用（状态类卡片照样 422）。

```sh
# 令牌文件（0600，首次启动自动生成，重启不变）
cat ~/.dsh/plugin-data/dsh-live-activity/token

# 用仓库自带的 CLI，令牌自动读取
node bin/live-activity.mjs '{"action":"create","title":"训练","phase":"Epoch 1","completed":1,"total":16}'
node bin/live-activity.mjs '{"action":"update","id":"<id>","completed":7,"metrics":[{"name":"loss","value":0.42}]}'

# 或者直接用 curl
curl -s http://127.0.0.1:41363 \
  -H "Authorization: Bearer $(cat ~/.dsh/plugin-data/dsh-live-activity/token)" \
  -H 'Content-Type: application/json' \
  -d '{"action":"update","id":"<id>","completed":9,"total":16}'
```

Python 标准库就够（不用装依赖）：

```python
import json, pathlib, urllib.request
token = pathlib.Path('~/.dsh/plugin-data/dsh-live-activity/token').expanduser().read_text().strip()
def call(payload):
    req = urllib.request.Request('http://127.0.0.1:41363', data=json.dumps(payload).encode(),
        headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'})
    return json.loads(urllib.request.urlopen(req, timeout=5).read())['value']

card = call({'action': 'create', 'title': '训练', 'phase': 'Epoch 1', 'completed': 0, 'total': 16})
for epoch in range(16):
    call({'action': 'update', 'id': card['id'], 'completed': epoch + 1, 'metrics': [{'name': 'loss', 'value': 2.0 / (epoch + 1)}]})
call({'action': 'end', 'id': card['id'], 'phase': '训练完成'})
```

接口只接受 `POST`，未带令牌返回 401，超过 64 KiB 返回 413，未知 action 返回 400。

### 局域网访问开关（默认关闭）

插件设置里有「局域网访问」开关：**插件** 面板 → `@local/dsh-live-activity` 的页面 → 开关。它对应 profile `cordis.patch.yml` 里这一行的 `config`：

```yaml
- id: dsh-live-activity
  name: '@local/dsh-live-activity'
  config:
    lanAccess: false   # 默认只监听 127.0.0.1
    port: 41363
```

打开后监听 `0.0.0.0:41363`，本机的所有网卡都可达，`settings` 会返回可直接填进脚本的地址：

```json
{"lanAccess":true,"host":"0.0.0.0","port":41363,"url":"http://192.168.100.176:41363","urls":["http://192.168.100.176:41363"]}
```

切换是即时生效的（保存 config 后 Loader 会重新加载该行，监听地址随之改变），不需要重启 DSH。关掉后立刻回到只监听回环。agent 也能改：`live_activity` 的 `set-lan-access`（`enabled: true/false`）。

安全代价要说清楚：开启后同网段的任何设备都能访问这个端口，令牌是唯一防线，且是明文 HTTP。只在可信内网打开，用完就关。

### 跨网机器：由插件自己开一条隧道

远端机器不在同一网段时，不用打开局域网访问，也不用自己敲隧道命令。插件有第二个开关「SSH 隧道」（默认关闭），打开后 agent 可以直接用工具建隧道：

```json
{"action":"tunnel","operation":"start","host":"183.147.142.103","user":"qujiwang","sshPort":63286,"identityFile":"~/.ssh/PathX","remotePort":41410}
```

它等价于在**远端**开一个只对它自己可见的端口：

```sh
ssh -N -o BatchMode=yes -o ExitOnForwardFailure=yes \
    -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30 \
    -p 63286 -i ~/.ssh/PathX \
    -R 127.0.0.1:41410:127.0.0.1:41363 qujiwang@183.147.142.103
```

远端脚本随后请求 `http://127.0.0.1:41410` 即可（令牌同本机那个文件）。返回里会带上 `remoteUrl` 与用法说明；`operation: "list"` 看当前隧道，`operation: "stop"` 配 `tunnelId` 关掉一条。

要点：

- **只有远端主机能连**：绑定地址显式写成 `127.0.0.1`，所以远端上也只有本机能用这个端口，不会对远端所在网络暴露。
- **随窗口/DSH 一起关闭**：隧道归当前插件实例所有，行被重新加载（关闭窗口、停用插件、改配置）或进程正常退出时会一起终止。实测：关掉开关后，远端 `41410` 的监听立即消失、再次请求被拒。
- **强制退出是例外**：如果 DSH 被 `kill -9` / 强制退出，进程来不及清理，ssh 可能残留。手动收尾：`pkill -f "ssh -N -R"`。
- 绑定的远端地址必须写死为 IPv4 回环：远端 sshd 默认会把 `-R` 的端口绑到 `[::1]`，此时从 `127.0.0.1` 连过去像是"隧道没起来"（我在测试里就踩到了这个坑，所以参数里显式带上了 `127.0.0.1:` 前缀）。

## 实现位置

- `index.js`：工具注册、`/api/dsh-live-activity` 只读路由（页面只能 list/get/dismiss）、系统提示词、每 15 秒的过期清理。
- `model.js`：校验、状态合并、生命周期推导（`stale`、`expiresAt`、`dismissAt`）、store。
- `client.js`：`shell.overlay` 里的独立悬浮卡片，2 秒轮询、1 秒本地倒计时。
- `endpoint.js`：程序侧 HTTP 接口（令牌校验、请求体上限、端口占用回落、监听地址选择）。
- `tunnel.js`：反向 SSH 隧道的 argv 构造与进程管理（经 `ctx.subprocess` 托管，随实例销毁）。
- `bin/live-activity.mjs`：读令牌文件、发一次请求的命令行小工具。
- 数据存在 profile 的 `dsh_live_activity` domain 里；损坏的记录会被备份并跳过，不会让插件整体加载失败。

## 已知限制

- 卡片只在 DSH 窗口可见范围内显示，窗口最小化时看不到；这不是系统级桌面挂件。
- 卡片内容只由 agent 写，界面里不能编辑阶段或进度（只能移除）。
- 轮询间隔 2 秒，agent 更新到卡片刷新最多有约 2 秒延迟；倒计时不依赖轮询。
- 卡片必须由 agent（通过工具）或程序（通过 HTTP 接口）创建；界面里没有「手动新建卡片」入口。
- HTTP 接口默认只在回环地址上监听，跨设备需要 SSH 隧道或显式改配置；接口是明文 HTTP，没有 TLS。
- 隧道需要远端允许 SSH 端口转发（默认允许）且本机 ssh 客户端可用；DSH 被强制退出时残留的 ssh 进程要手动清理。
- 隧道参数不接受任意命令字符串，`host`/`user` 有白名单字符限制，私钥路径必须是绝对路径或 `~/` 开头——避免 agent 拼出可执行的 shell。
- 卡片上的曲线是自带的小折线图（sparkline），不是完整图表；需要坐标轴、图例、多序列交互的图请用 `dsh_board` 的 ECharts 图表。

## 隐私

卡片内容存在本机 profile 的存储里，插件本身不向任何外部服务发起请求。页面与 Host 之间只有同源的 `POST /api/dsh-live-activity`，且只允许 `list`、`get`、`dismiss`；写入有两条合法路径——agent 的工具，以及本机那个需要令牌的 HTTP 接口（`endpoint.js`）。令牌保存在 `~/.dsh/plugin-data/dsh-live-activity/token`（0600）。

## 开发

```sh
npm test          # 运行 model.js 的状态机与生命周期断言
```

修改后重新加载：改 Host 代码需要在 **插件** 面板点刷新；改 `client.js` 后刷新一次窗口即可。

## 许可

[MIT](LICENSE) © 2026 Tippye
