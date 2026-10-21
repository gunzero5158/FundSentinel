# 基金持仓修改功能上线与 GitHub 定时调度关闭记录

## 1. 任务背景

用户在使用 FundSentinel 监控公募基金时提出两项需求：
1. **关闭 GitHub Actions 的定时调度**：避免因尚未配置云端 Secrets 而导致每天定时触发报错邮件；
2. **支持基金持仓修改功能**：此前在录入持仓信息后，若填错了代码、份额或成本，没有直观的修改入口，或者修改后最高水位线会被强制重置，导致用户只能删掉重来。

---

## 2. 实施细节与解决方案

### 2.1 关闭 GitHub Actions 定时调度
1. **线上停用**：使用 GitHub CLI 执行了 `gh workflow disable daily_fund_monitor.yml`，线上工作流状态已变为 `disabled_manually`，GitHub 不会再定时触发。
2. **代码防呆**：
   - 在 [.github/workflows/daily_fund_monitor.yml](file:///D:/projects/FundSentinel/.github/workflows/daily_fund_monitor.yml) 中将 `schedule` 调度器以及自动重启用逻辑进行了注释保留，并添加了说明；
   - 增加前置 Secrets 检查机制：即使后续手动点击 `workflow_dispatch`，若 Secrets 为空也会输出友好警告并安全退出，不再抛异常红叉。

### 2.2 基金持仓修改与更正功能（v0.2.0）
1. **UI 交互增强**：
   - **直观操作入口**：在全景监控与自选观察池列表每行右侧，新增直观的 **【修改】** 按钮（带编辑图标），用户一眼可见，一键直达编辑弹窗，无需先打开详情抽屉到处寻找；
   - **详情抽屉按钮清晰化**：将详情抽屉内的按钮由模糊的“编辑持仓 / 分红校准”优化为“修改持仓信息”；
   - **表单状态重置隔离**：给编辑表单加上 `key={editing?.id ?? 'new'}`，确保切换不同基金或新建时表单状态即时刷新，不会残留脏数据。
2. **最高水位线（HWM）智能保留**：
   - 之前在编辑已有持仓时，后端强制按 60 天最高点重新计算，会抹掉原有的监控最高点和规则状态；
   - 本次引入 `peakMode: 'keep'` 模式。编辑已有持仓时，默认**保持当前最高水位线（推荐，不重置监控基准）**；
   - 用户也可主动切换为“重新回溯近 60 日最高点”、“使用最新确认净值”、“指定建仓日期回溯”或“手动指定历史最高净值”。
3. **支持更正基金代码与自动数据迁移**：
   - 用户若填错基金 6 位代码，可在编辑弹窗中直接更正；
   - 后端会自动检测代码变更，拉取新基金最新披露净值，安全清理无其他持仓引用的旧基金缓存，并自动迁移关联的专属策略规则。
4. **一站式删除选项**：
   - 编辑弹窗底部新增“删除此持仓”按钮（带二次确认），方便用户在弹窗内直接修正或放弃。
5. **小程序端同步更新**：
   - [miniapp/pages/index/index.vue](file:///D:/projects/FundSentinel/miniapp/pages/index/index.vue) 同步支持 `keep` 模式与“修改持仓信息”。

---

## 3. 版本号规范

依据 SemVer 规范，本次属于**功能新增与体验增强**，版本号由 `0.1.0` 升级为 **`0.2.0`**。
相关文件（[package.json](file:///D:/projects/FundSentinel/package.json)、[lib/domain.ts](file:///D:/projects/FundSentinel/lib/domain.ts)、[start.ps1](file:///D:/projects/FundSentinel/start.ps1)、[run_daily_monitor.py](file:///D:/projects/FundSentinel/run_daily_monitor.py)、[README.md](file:///D:/projects/FundSentinel/README.md)）均已同步更新。

---

## 4. 验证结果

1. **自动化测试**：`npm test` 33 项单元与集成测试全部通过。
2. **类型检查**：`npm run typecheck` 0 错误。
3. **生产构建**：`npm run build` 成功。
4. **端到端集成验证**：运行 [verify_edit.mjs](file:///D:/projects/FundSentinel/tests/verify_edit.mjs)，实测持仓创建 -> 份额成本修改 -> 水位线保留 -> 清理，全流程 100% 成功。
5. **本地服务状态**：已以 v0.2.0 重启本地服务并在 `http://127.0.0.1:3000` 稳定运行。
