# Project G-VS

浏览器机甲动作原型。支持离线训练，以及独立权威服务器驱动的房间码 **1v1 在线对战**。React / Three.js 前端仍可部署到 GitHub Pages；Node.js 服务器单独运行，不需要数据库。

## 快速开始

建议使用 Node.js 24 LTS；现有 Node 18.19 开发环境也已测试，但该旧版本不建议用于生产。

```sh
npm ci
```

### 本机开发

分别在两个终端运行：

```sh
npm run dev:server
npm run dev
```

打开 `http://localhost:3000`，用两个独立浏览器窗口创建 / 加入同一房间。默认前端和后端只监听本机，不自动开放网络。

### 电脑 + 手机局域网联机

两台设备连接同一个可信局域网，在电脑运行：

```sh
npm run dev:lan
```

命令会同时启动网页（3000）和战斗服务（2567），并打印电脑可用的 IPv4 地址，例如 `http://192.168.1.100:3000`。手机与电脑都打开打印的网页地址；电脑创建房间，手机填入六位房间码，双方准备。

- 多张网卡可能打印多个地址，选择 Wi-Fi / 有线局域网对应的地址。
- Windows 防火墙如提示，允许 Node.js 访问 **专用网络**。不要为方便测试开放公用网络或设置路由器端口转发。
- 手机使用触屏按钮，横屏更合适。HTTP 局域网页面在部分浏览器上不能使用手柄 API / 自动复制，触屏操作和手动输入房间码不受影响。
- 不要打开 GitHub Pages 的 HTTPS 地址来连局域网 `ws://`：浏览器会阻止混合内容。局域网测试直接打开电脑的 HTTP 地址。
- 如果页面能打开但不能进房间，检查 2567 端口、服务器终端输出、Wi-Fi 访客网络 / AP 隔离，以及设备是否启用了 VPN。
- 如已有 `.env.local` 中的 `VITE_WS_URL`，确认它没有将手机连接指向错误的 `localhost` 或另一台服务器；删除该覆盖设置或改为电脑的 LAN 地址后重启。
- Ctrl+C 停止两个服务。电脑必须保持开机；切后台/锁屏可能造成网络断开。本版掉线判负，不支持无缝恢复对局。
- `dev:lan` 会把开发服务绑定到全部网卡，只用于可信局域网测试，不是生产部署方式。

## 操作与规则

| 操作 | 键盘 |
| --- | --- |
| 移动 | WASD |
| Step / 虹 Step | 双击方向键 |
| 短跳 / 升空 / 冲刺 | L 短按 / 长按 / 双击 |
| 射击 | J |
| 格斗 / 连段 | K，攻击中再次按 K 接下一段 |
| 切换锁定 | Space |

手柄与触屏保留原有设置面板。训练模式默认暂停 AI，可在“显示设置”开启。主菜单保留姿势/动画编辑器、模型工厂，按需加载。

在线对局双方 600 HP，180 秒。击破对手获胜；超时比较剩余 HP，相同则平局。双方重新准备后再战。伤害、资源和结果由服务器计算，浏览器不能直接上报命中/血量。

这是首版，不包含账号、匹配、2v2、排名、观战、持久记录、历史命中回溯或整局回滚。高延迟/抖动仍会影响命中反馈；推荐服务器靠近参赛玩家。

## 验证

```sh
npm run typecheck
npm test
npm run build
npm run build:server
npm run test:browser
```

- `npm test`：纯模拟、协议校验、真实 WebSocket 双客户端、输入超时、掉线与再开局、预测/插值测试。
- 浏览器验收默认使用本机 Chrome。若已安装 Edge，可设置 `BROWSER_CHANNEL=msedge`；或安装 Playwright Chromium 并设置 `BROWSER_CHANNEL=chromium`。Windows PowerShell 示例：`$env:BROWSER_CHANNEL='msedge'; npm run test:browser`。
- 浏览器测试自启本机 3000/2567 服务，请先停掉占用这两个端口的开发服务。
- 截图和失败资料存于 `.artifacts/`，不提交 Git。
- 手柄硬件、真实手机兼容性、公网 TLS/跨网体验仍需要在对应设备与部署环境验证，桌面自动化不等于真机验收。

## GitHub Pages 前端

1. 保留当前 Pages 自定义域名；`public/CNAME` 在前端构建时复制进 `dist`。
2. 当前已部署的服务端地址为 `wss://battle.gvslike.xyz:8443/ws`。
3. GitHub 仓库 → Settings → Secrets and variables → Actions → **Variables**，设置 `VITE_WS_URL=wss://battle.gvslike.xyz:8443/ws`。
4. 正常发布 main 分支。工作流会进行类型检查、逻辑/网络测试和构建，然后只发布前端 `dist`。

`VITE_WS_URL` 是公开连接地址，不是秘密；不要把任何凭据放在 `VITE_` 变量中。它在构建时写入前端，修改后需要重新构建发布。未配置时仍可单机训练，在线菜单会说明未配置，生产页面不会回退连接访问者的 localhost。

## 独立服务器部署

### 当前线上部署（2026-09-30）

- 对战入口：`wss://battle.gvslike.xyz:8443/ws`。
- 健康检查：`https://battle.gvslike.xyz:8443/healthz`。
- 服务目录：`/opt/gvs-server`；`current` 指向 `releases/20260930-01`。
- 独立运行时：Node.js 24.21.0；代理：Caddy 2.11.4。未安装 Docker，未替换系统运行时。
- systemd 服务：`gvs-server.service` 与 `gvs-proxy.service`，均已启用开机自启和故障重启，使用独立动态用户而非 root 运行。
- 后端配置：`/etc/gvs-server.env`，仅监听 `127.0.0.1:2567`，当前允许网页 Origin 为 `https://gvslike.xyz`，房间保护上限为 12。
- 代理配置：`/etc/gvs-proxy/Caddyfile`，公网监听 TCP 8443；Let’s Encrypt 证书由 Caddy 自动续期。TCP 80 用于 HTTP-01 签发/续期验证，需要保持网络可达；已有 TCP 443 服务不受影响。
- 证书及 ACME 状态保存在 `/var/lib/gvs-proxy`，不要删除或加入代码仓库。
- 已从外部验证 HTTPS、正常证书校验的 WSS、双连接开房、准备与射击结算；这不等于真机性能或公网延迟已验收。

服务器运维命令：

```sh
systemctl status gvs-server gvs-proxy
journalctl -u gvs-server -u gvs-proxy -n 50 --no-pager
# 重启后端会中断当前对局；仅在需要时执行。
systemctl restart gvs-server
# 停止本项目的两个服务，不影响原有 443 服务。
systemctl stop gvs-server gvs-proxy
```

GitHub Actions 当前只发布 Pages 前端，不会自动更新此服务器。后续修改 `src/server` 或 `src/shared` 时，需要同时更新服务端发布包，避免前后端规则不一致。下面的 Docker 方案仅供其他环境参考，不要在当前实例重复启动同一后端。

### Docker + Caddy 示例

需要一台能运行 Docker 的 Linux 服务器，一个解析到该服务器的域名，以及对外的 TCP 80/443。前端 Pages 域名不必迁移。

```sh
docker build -t gvs-server .
# 根据 deploy/server.env.example 创建本机 server.env，按实际前端域名设置 ALLOWED_ORIGINS。
docker run -d --name gvs-server --restart unless-stopped \
  --env-file ./server.env \
  -p 127.0.0.1:2567:2567 gvs-server
```

将 `deploy/Caddyfile.example` 的示例主机名改成你的战斗服务域名，安装并运行 Caddy。Caddy 负责 TLS 证书和 WebSocket 反向代理；后端 2567 仅绑定服务器回环地址，**不需要公网开放 2567**。不要把 Vite 开发服务器用于公网托管。

服务端参数：

| 变量 | 默认值 | 含义 |
| --- | --- | --- |
| `HOST` | `127.0.0.1`；Docker 内为 `0.0.0.0` | 监听网卡 |
| `PORT` | `2567` | HTTP/WS 端口 |
| `ALLOWED_ORIGINS` | 本机开发地址 | 允许的网页 Origin，逗号分隔，无尾斜线 |
| `MAX_ROOMS` | `80` | 房间数量保护上限，不是承诺容量 |

示例 `ALLOWED_ORIGINS=https://gvslike.xyz`；若使用 `https://用户名.github.io` 等其他前端域名，也要准确加入允许列表。Origin 校验不是账号认证，房间码也不是强安全凭据；公开服务需自行监控访问和资源使用。

- `/healthz`：健康检查。
- `/ws` 或 `/`：WebSocket。
- 房间保存在内存；服务重启会中断所有对局。
- 慢连接、超大消息、输入洪泛、无输入超时均有基础限制，不替代生产网关保护。
- 不使用 Docker 时：`npm ci && npm run build:server && npm run start:server`，通过进程管理器和 TLS 反向代理运行。环境变量由部署平台/进程管理器提供，服务端不会自动读取任意 `.env` 文件。

## 目录与依赖边界

```text
src/client/app/        页面模式与入口
src/client/game/       本地运行、AI、输入、音效
src/client/network/    WS 会话、预测、快照插值
src/client/render/     场景、共用机体、动画、视觉特效
src/client/ui/         房间、HUD、手柄/触屏
src/client/editors/    姿势和模型工具
src/client/assets/     原有动画、音效、编辑器模型数据
src/client/state/      显示设置
src/shared/game/       60 Hz 共享战斗模拟与配置
src/shared/protocol.ts 数据协议与客户端消息校验
src/server/            房间、连接、权威世界调度
public/                head.glb、CNAME
tests/                 单元与网络测试；browser/ 为浏览器验收
```

单机和服务器使用同一个 `stepWorld`；客户端预测调用同一机体步进，渲染不决定碰撞或生成可信伤害。网络快照为纯数据，带 matchId、tick、输入确认序号；对手采用插值，自身校正后重放未确认输入。

美术表现与原型共用模型/动画数据，但逻辑拆分和固定步长会影响部分原型细节。应继续根据实机反馈调整动作、镜头和移动手感，不将首版视为与旧原型逐帧完全一致的复刻。
