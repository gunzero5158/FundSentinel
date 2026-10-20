# 净值哨兵 FundSentinel

公募基金双轨策略监控工具，版本 **0.1.0**。以披露后的实际净值核算，不使用盘中估值，不提供交易建议。

## 本地使用

要求 Node.js 22+。在 PowerShell 执行：

```powershell
cd D:\projects\FundSentinel
npm ci
npm run build
npm start
```

打开 http://127.0.0.1:3000（或 http://localhost:3000），或运行 `start.ps1`。默认工作区为空，可添加真实基金，也可以加载清楚标记的合成演示数据。数据写入项目 `data/workspace.json`；更新代码时保留 `data` 和 `.env.local`。

本地模式没有登录，只允许本机浏览器访问。**不要**用 nginx、frp、Cloudflare Tunnel 等把本地版暴露到公网：程序会拦截带转发头或公网来源的请求，但无法识别所有代理配置。需要手机或公网访问时请按下文配置 Supabase。

开发：`npm run dev`。验证：`npm test`、`npm run typecheck`、`npm run build`。

## 已实现的功能

- 响应式监控看板：持仓/自选、搜索、4 种排序、触发/临近筛选、数据导出、提醒记录。
- 单位净值持仓核算与复权净值基金风险核算分离；详情用上下两张对齐图，避免将分红前成本线误叠到复权净值。
- 3 种移动回撤、收益/亏损百分比或金额、组合回撤、阶段回撤、历史极值比、单日复权异动、连续下跌天数。
- 全局规则、单基金同类型覆盖、多条金额/比例阶梯、暂停、激活门槛、每个基金独立的触发/阶梯升级/缓冲复位状态。
- 持仓编辑、分红校准、近 60 个净值交易日/建仓日期/最新净值/手动最高净值初始化。
- 截图单张请求、两路并发、浏览器压缩到宽不超过 1280 且小于 500 KB、严格缺项校验、预览核对和补全；每用户每日最多 40 张识别请求（`OCR_DAILY_LIMIT` 可调）。
- 公开 CDN 确认净值、安全 JSON 解析（不执行源站脚本）、重试、Python AKShare 与新浪备用源；分红/拆分异常保守暂停个人轨道直至校准。
- Supabase 建表与 RLS、邮件登录、按已验证用户身份读写、事务与版本冲突保护、通知配置加密。
- Python 云端任务、每日三次 Actions 调度、节假日心跳、晚点 FOF/QDII 补抓、逐净值日期幂等、失败告警退出。
- Bark/企业微信/飞书/钉钉/PushPlus/Server酱分发器、按通道汇总、持久化待发送队列、失败重试；微信小程序登录、一次订阅和模板分发代码。
- PWA 清单、图标、私密数据不缓存的 Service Worker；`miniapp/` 包含 uni-app Vue 3 微信端源码。

## 计算和行为约定

百分率均以 `5` 表示 5%。收益回落百分点与净值相对回撤使用不同规则。固定亏损规则使用正的亏损幅度/金额，避免符号歧义。界面红涨绿跌。

`shares × unit NAV` 用于个人市值。普通交易日按精确单位净值比率连续复利，除权日使用数据源披露的含分红每日收益率重建复权曲线（除权日收益率取源站精度）；不以累计净值冒充复权净值。缺失除权/复权元数据时不推算历史风险，也不发送未经校准的个人回撤提醒。备用源会显式标识并要求校准。

基金历史最大回撤基准排除最新净值日，防止当天创新低时分母同步变大而掩盖突破。默认历史基准为数据源完整可用历史；阶段窗口以净值交易日数计数。历史序列保留在数据库，发往前端的图形最多约 400 点，风险指标始终在完整序列上计算。

组合份额/成本改变时重建组合高水位，避免将出入金误算为回撤；QDII/FOF 净值通常晚一天以上，组合按各基金最新确认净值计算，并在全部持仓都更新到新净值后评估一次组合提醒（以最晚到齐的净值日期去重）。混合日期的最近一日盈亏在界面明确标记，不能冒充同一个交易日的组合收益。

分红后 `needsCalibration` 持续有效，不只豁免一天。请核对现金分红/红利再投后的实际成本与份额，再编辑保存。重置最高水位会重新开始本轮监控，界面要求确认。

截图中只有金额没有份额时，Web 预览仅可使用同一截图金额、盈亏与成本的会计恒等式给出待核对份额；绝不调用跨日净值反推。缺少任一核心类别时显示失败，用户手工补全后才能保存。

## 配置 OCR

复制 `.env.example` 为 `.env.local`，设置 `VISION_BASE_URL`、`VISION_API_KEY`、`VISION_MODEL`。默认兼容通义千问接口。密钥仅在服务端使用。图片先在设备压缩，再发送到你配置的 Vision 服务；程序不在数据库保存原图。第三方服务可能收费，费用由所选服务决定。

## Supabase + Vercel 部署

1. 用自己的账号新建 Supabase 项目，在 SQL Editor 对新库执行 `supabase/schema.sql`。脚本创建 `funds`、`user_positions`、`alert_rules`、工作区元数据、心跳和微信身份映射表。
2. 在本地或 Vercel 设置 `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`。服务角色密钥不应出现在 `NEXT_PUBLIC_*`、浏览器或小程序中。
3. Supabase Authentication 配置站点 URL 和允许的重定向 URL，开启邮件登录。仅自用时建议设置 `ALLOWED_EMAILS` 为你的邮箱，或在 Supabase 关闭新用户注册，避免他人注册后消耗你的识图额度。Next.js API 验证 Supabase bearer 用户身份，不接收客户端指定的用户 ID。数据库 RLS 也只允许用户读取自己的记录；写入通过受保护的服务端接口和事务 RPC。
4. 生成独立的 `MONITOR_SECRET`（至少 32 字符）与 `CHANNEL_ENCRYPTION_KEY`（64 位 hex）：

   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

   执行两次，分别使用不同随机值。加密密钥变更前必须迁移已加密通知配置。
5. Vercel 导入源码项目，Framework Preset 选择 Next.js，Build Command `npm run build`。设置 `APP_URL` 为最终 HTTPS origin（不带末尾斜杠），其余变量与 `.env.example` 一致。公网缺少 Supabase 配置时 API 会拒绝本地工作区访问。
6. 源码仓库发布与生产部署分开进行。创建云端资源、真实通知联调和微信发布仍需要你的账号配置与发布授权。

平台套餐、配额和地区访问条件可能变化，不保证永久免费或分钟级定时到达。心跳只产生持续请求，不保证托管服务绝不暂停。源站为公开第三方披露数据，仍需遵守提供方使用条件。

## GitHub Actions 自动监控

将项目放入你自己的 GitHub 仓库后，设置仓库 Secrets：

| Secret | 值 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase origin |
| `SUPABASE_SERVICE_ROLE_KEY` | 服务角色密钥 |
| `APP_URL` | Vercel HTTPS origin |
| `MONITOR_SECRET` | 与 Next.js 后端完全相同的独立任务密钥 |

工作流每天 UTC 13:17、14:47、00:47 运行，对应北京时间 21:17、22:47、08:47。包括周末与节假日，确保心跳和晚点 QDII/FOF 确认净值不被境内日历遗漏。扫描重复日期不会重发规则提醒。单只基金失败不会阻塞其他基金，但本次 Actions 会显示失败，方便排查。

Python 任务全局去重获取基金、写入共享净值后调用受密钥保护的逐用户评估接口。手动同步按 4 只一批请求，避免 30 只串行抓取占满单次 Serverless 时长。

通知地址在看板“连接与设置”中填写。保存不会立即试发消息。只有后续监控任务才会发送配置的通知。本地手动同步也会按已保存通道发送，操作前核对你的配置。

新增或重新启用通知通道时，只推送此后产生的提醒，不补发历史记录；单条消息超过平台长度上限时只发送能容纳的部分并提示打开看板。连续 8 次发送失败的批次停止重试并在投递记录中标记失败。提醒记录保留最近 300 条。

工作流每次运行会调用 GitHub API 重新启用自身，避免仓库 60 天无提交时定时任务被 GitHub 自动停用。

通知采用可重试的持久化 outbox，提供至少一次投递：第三方已收到但保存回执前进程崩溃时，可能重复一次。每日策略评估本身严格按净值日期幂等，第三方推送不承诺无法实现的端到端 exactly-once。

PushPlus 填写 `https://www.pushplus.plus/send?token=你的token`；Bark 为 `https://api.day.app/你的key`；其余使用相应平台官方 webhook。平台地址白名单限制外发目标，不支持任意自托管地址。

## 微信小程序

`miniapp/` 是 HBuilderX 可导入的 uni-app Vue 3 项目（也可在该目录执行 `npm ci; npm run build`，产物为 `dist/build/mp-weixin`），复用同一后端和核心计算模块。包含持仓看板、手动/截图导入、规则、提醒、双轨折线图、校准和订阅授权。

1. 在 `miniapp/manifest.json` 填入自己的 uni-app AppID 和微信 AppID，在 `miniapp/config.js` 填入最终 HTTPS origin。
2. 后端配置 `WECHAT_APP_ID`、`WECHAT_APP_SECRET`、`WECHAT_TEMPLATE_ID` 和通知加密密钥。
3. `WECHAT_TEMPLATE_FIELDS` 的 key 必须与你账号中获批的模板字段完全一致；value 可为 `title`、`date`、`notice`。本地测试用 `WECHAT_MINIPROGRAM_STATE=developer`，正式版改为 `formal`。
4. 微信公众平台填写 request 合法域名并按账号要求完成主体、隐私协议、类目和审核。上传截图前告知用户图像会交给已配置的识图服务处理。
5. 用 HBuilderX 的“运行到微信开发者工具”编译，在真实手机检查登录、识别、订阅、模板投递与后台权限。微信账户和模板缺失时，不能声称上述链路已验收。

微信会话只在服务端交换，`openid` 哈希映射到独立 Supabase Auth 用户。通知用 openid 与通道配置一并加密；客户端不接触 AppSecret。小程序 token 失效时重新微信登录，不使用公开的固定用户 ID。

小程序订阅为一次授权一次提醒；本地计数只用于减少无效发送，实际可发次数以微信平台为准。长效微信触达可通过已接入的 Server酱/PushPlus 使用自己的服务号；原生认证服务号也已提供独立 OAuth 绑定与模板代码：配置 `WECHAT_OFFICIAL_APP_ID`、`WECHAT_OFFICIAL_APP_SECRET`、`WECHAT_OFFICIAL_TEMPLATE_ID`、字段映射和网页授权域名后，在连接设置中生成绑定链接并在微信内打开。实际可用模板、关注状态、接口权限和推送限制以账号获批能力为准，尚未完成真实账号联调。

## 当前验收边界

请查看 `docs/ACCEPTANCE.md`。云端服务、真实 OCR、各通知平台和微信发布必须在配置你自己的账号后联调；本地测试通过不能替代这些验收。源码推送不包含云端部署、账户注册、实际通知发送或微信小程序发布。

本工具仅基于公开历史净值及用户自行录入的数据提供客观指标计算与阈值通知，不构成任何投资建议。
