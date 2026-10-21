# GitHub Actions 工作流报错排查与分析报告

## 1. 现象描述

GitHub Actions 工作流 `FundSentinel confirmed NAV monitor`（对应文件 `.github/workflows/daily_fund_monitor.yml`）在定时触发时运行失败，报错标题为：
`[gunzero5158/FundSentinel] FundSentinel confirmed NAV monitor workflow run`

最新失败运行记录（Run ID: `39549162548` 等）的执行日志如下：

```text
Run python run_daily_monitor.py
Traceback (most recent call last):
  File "/home/runner/work/FundSentinel/FundSentinel/run_daily_monitor.py", line 64, in <module>
    main()
  File "/home/runner/work/FundSentinel/FundSentinel/run_daily_monitor.py", line 28, in main
    raise RuntimeError("Missing configuration: " + ", ".join(missing))
RuntimeError: Missing configuration: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_URL, MONITOR_SECRET
##[error]Process completed with exit code 1.
```

---

## 2. 根因分析（Root Cause Analysis）

1. **定时调度机制**：
   `.github/workflows/daily_fund_monitor.yml` 设置了每天 3 次定时调度（北京时间 21:17、22:47、08:47），用于自动抓取公募基金披露净值、更新云端数据库并评估用户策略：
   ```yaml
   on:
     schedule:
       - cron: '17 13 * * *'
       - cron: '47 14 * * *'
       - cron: '47 0 * * *'
   ```

2. **环境变量依赖**：
   工作流在执行 `run_daily_monitor.py` 时，需要注入以下 4 个 GitHub Actions Secrets：
   ```yaml
   env:
     NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
     SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
     APP_URL: ${{ secrets.APP_URL }}
     MONITOR_SECRET: ${{ secrets.MONITOR_SECRET }}
   ```

3. **密钥缺失检测**：
   `run_daily_monitor.py` 在 `main()` 中对必须的配置项进行了断言：
   ```python
   required = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "APP_URL", "MONITOR_SECRET"]
   missing = [key for key in required if not os.getenv(key)]
   if missing:
       raise RuntimeError("Missing configuration: " + ", ".join(missing))
   ```
   经使用 GitHub CLI (`gh secret list`) 检查，当前 GitHub 仓库 `gunzero5158/FundSentinel` 中**尚未配置任何 Secrets**。
   因此，CI Runner 中这 4 个环境变量全为空，导致 Python 脚本直接抛出 `RuntimeError: Missing configuration...` 并以非 0 状态码退出，GitHub 发送工作流失败提醒邮件。

---

## 3. 应对方案

### 方案 1：若需要使用云端自动监控与多端通知（完整云端版）
如果计划按官方文档部署 Supabase 与 Vercel：
1. 部署 Supabase 数据库并获得 API 凭证。
2. 部署 Next.js 到 Vercel。
3. 在 GitHub 仓库设置页面（`Settings -> Secrets and variables -> Actions`）中添加以下 4 个 Repository Secrets：
   - `NEXT_PUBLIC_SUPABASE_URL`：Supabase 项目 URL
   - `SUPABASE_SERVICE_ROLE_KEY`：Supabase 服务角色密钥
   - `APP_URL`：部署的 Web HTTPS 地址（如 `https://your-app.vercel.app`）
   - `MONITOR_SECRET`：Next.js 后端与监控脚本约定的受保护端点调用密钥

### 方案 2：若当前仅使用本地测试/单机版（无需云端监控）
如果当前项目只在个人电脑本地单机运行（使用本地 `data/workspace.json` 持久化）：
- 可在 GitHub Actions 页面将 `FundSentinel confirmed NAV monitor` 工作流点击 **Disable workflow**，停止定时执行；或者
- 在本地将 `.github/workflows/daily_fund_monitor.yml` 的 `schedule` 触发器注释掉并推送。
