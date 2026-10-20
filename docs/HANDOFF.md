# FundSentinel 开发与验收交接

目标：完成用户 `D:\Downloads\code_artifact.md` 中的公募基金双轨监控产品，项目名称由用户要求改为“净值哨兵 / FundSentinel”，最终目录 `D:\projects\FundSentinel`。

已完成 0.1.0 的 Next.js/PWA、规则引擎、持久化、Supabase SQL/RLS、Vision 接口、通知分发、Python/Actions 与 uni-app 微信端代码。项目最初名为 DesignForge；现已更名，不应重新创建旧目录。

验证：21 项自动化测试（含 PostgreSQL/PGlite 事务、回滚、RLS 与权限），Next.js 生产构建，uni-app mp-weixin 生产构建，Python 语法与配置 dry-run，000001 真实 CDN 6025 条净值解析，新浪备用 JSON 实测。浏览器验证搜索、规则保存、详情 ECharts、提醒、设置、刷新持久化、390px 双轨卡片、参数错误/跨域写入/任务密钥拦截，无页面脚本错误。

重要边界：个人单位净值与基金复权净值分离；除权元数据缺失时保守暂停；分红后校准锁持续到人工修正；HWM 回溯跨过除权时要求选择今日或校准后的手动水位。规则状态按规则+基金分离，按净值日期幂等。组合入出金后重建水位，混合净值日期不触发组合提醒。完整历史在服务端计算，前端曲线抽样约 400 点。通知提供持久队列、投递租约和至少一次投递，无法保证第三方端到端 exactly-once。

无真实用户数据或 API 密钥。D 盘项目应保持空工作区；浏览器测试的合成演示只位于 C 盘 work/FundSentinel/data。本交接记录生成于首次推送前，当时未远程推送、部署、注册云端资源、实际发通知或发布微信小程序；后续源码发布不代表云端已部署。

剩余验收：用户配置 Supabase/Vercel/GitHub Secrets、Vision 与通知平台、微信 AppID/模板/域名；真实账户双用户隔离与真机联调；实际持仓/截图回放；关机后定时通知；微信审核。`README.md` 与 `docs/ACCEPTANCE.md` 列明配置。不得将源码具备或本地测试通过声称为云端已上线或微信已过审。

后续推荐：先由用户审阅当前本地版本，再在用户提供并授权的云端账号中执行部署和联调。自动 SemVer 按后续变更用户影响选择；当前 coherent batch 统一为 0.1.0。不要发布密钥，不要覆盖 `data/`、`.env.local` 或用户新增文件。
