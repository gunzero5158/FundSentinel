'use client';
import {useState, useEffect} from 'react';
import {Rule, RuleType, RULE_TYPES, RULE_NAMES, ruleName, ruleDescription} from '@/lib/domain';

export interface RuleTypeMeta {
  name: string;
  badge: string;
  defaultRuleName: string;
  summary: string;
  scenario: string;
  example: string;
  formula: string;
  requiresHolding: boolean;
}

export const RULE_META: Record<RuleType, RuleTypeMeta> = {
  TRAILING_STOP_NAV: {
    name: '最高净值相对回撤（经典推荐）',
    badge: '移动止盈 · 保住利润',
    defaultRuleName: '移动止盈防守线',
    summary: '最经典的动态止盈策略。当基金净值从买入以来的「历史最高点」掉下来达到指定幅度时报警，防止利润坐过山车。',
    scenario: '适用于绝大多数偏股、混合型、指数型基金的获利保护与动态落袋为安。',
    example: '例：基金最高涨到 1.500 元，设回跌 5% 预警，当净值跌破 1.425 元（自高点回撤 5%）时触发提醒。',
    formula: '回撤幅度 =（历史最高净值 − 当前净值）÷ 历史最高净值 × 100%',
    requiresHolding: true
  },
  TRAILING_STOP_RET: {
    name: '持仓收益率回退点数',
    badge: '收益率直减 · 直观明了',
    defaultRuleName: '持仓收益率回退线',
    summary: '直接对比持仓收益率百分点。如果最高浮盈曾达到 +20%，回退超过 5 个百分点（即降到 +15%）立即报警。',
    scenario: '适合习惯直接根据理财 App 显示的持仓收益率百分比进行风控决策的投资者。',
    example: '例：最高收益率曾到 25%，设回退 5 个百分点，当收益率跌回 20% 时触发预警。',
    formula: '回退点数 = 最高持仓收益率（%） − 当前持仓收益率（%）',
    requiresHolding: true
  },
  TRAILING_STOP_PROFIT: {
    name: '已赚浮盈回吐比例',
    badge: '利润缩水 · 敏感防守',
    defaultRuleName: '已赚利润回吐防守线',
    summary: '专门盯住「已经赚到的利润缩水了多少」。浮盈回吐达到指定比例时报警，绝不让到手的利润全部蒸发。',
    scenario: '浮盈丰厚、极度厌恶利润回吐的保本型或阶段性落袋为安投资者。',
    example: '例：本金 10 万，最高赚到 2 万元浮盈。设回吐 30% 预警，当利润缩水 6000 元（仅剩 1.4 万）时报警。',
    formula: '回吐比例 =（最高浮盈金额 − 当前浮盈金额）÷ 最高浮盈金额 × 100%',
    requiresHolding: true
  },
  FIXED_TAKE_PROFIT: {
    name: '目标止盈线（达到就收）',
    badge: '目标兑现 · 绝对收益',
    defaultRuleName: '阶段目标止盈线',
    summary: '当累计持仓收益达到预设的目标（如赚 15% 或赚 5000 元）时提醒卖出止盈。',
    scenario: '定投达到预期年化目标、做波段止盈或有明确止盈目标的纪律性投资者。',
    example: '例：设目标 15%，持仓收益率一旦达到或超过 15%，立即发通知提醒止盈。',
    formula: '持仓收益率 ≥ 目标百分比，或累计收益额 ≥ 目标金额',
    requiresHolding: true
  },
  FIXED_STOP_LOSS: {
    name: '本金止损线（严控亏损）',
    badge: '底线防御 · 截断亏损',
    defaultRuleName: '本金硬止损线',
    summary: '当持仓亏损达到设定底线（如亏 8% 或亏 3000 元）时报警，提醒纪律性止损减仓，避免本金深度套牢。',
    scenario: '控制最大单笔损失，防止单只高风险赛道基金大幅下跌带来无法承受的损失。',
    example: '例：设止损 8%，当持仓浮亏达到 −8% 时立即报警提醒。',
    formula: '持仓亏损率 ≥ 止损百分比，或累计亏损额 ≥ 止损金额',
    requiresHolding: true
  },
  PORTFOLIO_DD: {
    name: '组合总资产高点回撤',
    badge: '账户全局 · 系统性风控',
    defaultRuleName: '账户总资产风控线',
    summary: '从整个账户全部持仓基金的「总市值历史最高峰」监控回撤，防范全盘系统性大跌风险。',
    scenario: '管理多只基金的整体组合仓位，需要控制账户总资产回撤的投资者。',
    example: '例：全部持仓总市值最高达到 20 万元，设组合回撤 5%，总市值跌至 19 万元时触发全盘预警。',
    formula: '组合回撤 =（历史最高总市值 − 当前总市值）÷ 历史最高总市值 × 100%',
    requiresHolding: true
  },
  FUND_STAGE_DD: {
    name: '阶段窗口最高点回撤（客观）',
    badge: '自选观察 · 阶段抗跌',
    defaultRuleName: '近1年阶段高点回撤监控',
    summary: '纯看基金自身净值走势（不要求个人持仓）。监控基金在近 N 个交易日内自阶段最高点的跌幅。',
    scenario: '用于自选基金跟踪、等待回调买入机会或评估近期调整深度。',
    example: '例：观察窗口 252 交易日（近1年），基金近 1 年最高净值跌落 10% 时提醒关注。',
    formula: '阶段回撤 =（窗口期最高复权净值 − 当前复权净值）÷ 窗口期最高复权净值 × 100%',
    requiresHolding: false
  },
  FUND_HIST_MDD: {
    name: '历史最大回撤占比（客观）',
    badge: '深度回测 · 极值预警',
    defaultRuleName: '历史极端回撤预警',
    summary: '评估当前跌幅在基金历史上属于什么水平。当回撤达到历史最惨跌幅的 90% 时报警，提醒可能遭遇极端行情。',
    scenario: '排查基金经理是否遭遇历史上最严重的逆风期，辅助判断是否属于罕见极端低估或风格漂移。',
    example: '例：基金历史最深跌幅是 20%，设比例 90%，当本轮跌幅达到 18% 时触发警报。',
    formula: '占比 = 当前历史高点回撤 ÷ 基金历史最大回撤 (MDD) × 100%',
    requiresHolding: false
  },
  FUND_DAILY_VOL: {
    name: '单日异动涨跌幅（客观）',
    badge: '单日异动 · 暴涨暴跌',
    defaultRuleName: '单日净值异动预警',
    summary: '单日净值剧烈波动预警。当一天内净值涨跌幅绝对值超过阈值时提醒。',
    scenario: '监控重仓股暴雷、突发黑天鹅事件或指数巨幅波动。',
    example: '例：设阈值 3%，若单日净值大涨 +3.5% 或大跌 −3.2%，均触发异动提醒。',
    formula: '| 单日复权净值涨跌幅 | ≥ 阈值 %',
    requiresHolding: false
  },
  FUND_DOWN_DAYS: {
    name: '连续下跌天数（客观）',
    badge: '阴跌预警 · 情绪冰点',
    defaultRuleName: '连续阴跌情绪预警',
    summary: '连续阴跌天数监控。当基金连续 N 个交易日净值收绿下跌时报警提醒。',
    scenario: '防范深不见底的持续阴跌行情，或者用于网格定投在连续阴跌后寻找补仓契机。',
    example: '例：设连续 4 天，基金连续 4 个净值日收跌时触发提醒。',
    formula: '连续每日涨跌幅 < 0 的交易日天数 ≥ 设定值',
    requiresHolding: false
  }
};

export const descriptions: Record<RuleType, string> = Object.fromEntries(
  Object.entries(RULE_META).map(([k, v]) => [k, `${v.summary} ${v.example}`])
) as Record<RuleType, string>;

export function ruleUnit(type: RuleType, basis: string) {
  return type === 'FUND_DOWN_DAYS'
    ? '个交易日'
    : type === 'TRAILING_STOP_RET'
      ? '个百分点'
      : type.startsWith('FIXED_') && basis === 'amount'
        ? '元'
        : '%';
}

export default function RuleForm({
  rule,
  scopeCode,
  funds,
  existingRules = [],
  busy,
  onSave
}: {
  rule?: Rule;
  scopeCode?: string | null;
  funds: {code: string; name: string}[];
  existingRules?: Rule[];
  busy: boolean;
  onSave: (r: Omit<Rule, 'id'> & {id?: string}, mode: 'replace' | 'create_new') => Promise<void>;
}) {
  const isSingleFund = Boolean(scopeCode);
  const targetFund = isSingleFund ? funds.find(f => f.code === scopeCode) : undefined;

  const availableTypes: readonly RuleType[] = isSingleFund
    ? (RULE_TYPES.filter(t => t !== 'PORTFOLIO_DD') as RuleType[])
    : RULE_TYPES;

  const [type, setType] = useState<RuleType>(
    rule?.type && (availableTypes as readonly string[]).includes(rule.type)
      ? rule.type
      : isSingleFund
        ? 'TRAILING_STOP_NAV'
        : (rule?.type ?? 'TRAILING_STOP_NAV')
  );

  // 独立的规则名称与规则简介状态
  const [name, setName] = useState<string>(
    rule ? ruleName(rule) : RULE_META[type].defaultRuleName
  );
  const [description, setDescription] = useState<string>(
    rule ? ruleDescription(rule) : RULE_META[type].summary
  );

  const [basis, setBasis] = useState(rule?.basis ?? 'pct');
  const [globalCodeChoice, setGlobalCodeChoice] = useState<string>(rule?.code ?? '');

  // 替换目标规则选择（支持把当前修改替换进已有规则）
  const [replaceTargetId, setReplaceTargetId] = useState<string>(rule?.id ?? '');

  const trailing = type.startsWith('TRAILING_'),
    fixed = type.startsWith('FIXED_'),
    unit = ruleUnit(type, basis),
    days = type === 'FUND_DOWN_DAYS';
  const initial = rule?.type === type ? rule : undefined;
  const currentMeta = RULE_META[type];

  // 当切换规则类型时，如果是新建或者用户未特别定制名字，智能建议默认名称和简介
  const handleTypeChange = (newType: RuleType) => {
    setType(newType);
    setBasis('pct');
    if (!rule) {
      setName(RULE_META[newType].defaultRuleName);
      setDescription(RULE_META[newType].summary);
    }
  };

  const isEditingOwnSpecificRule = isSingleFund && Boolean(rule?.id && rule.code === scopeCode);
  const isCustomizingFromGlobal = isSingleFund && Boolean(rule?.id && rule.code === null);

  const getFormData = (form: HTMLFormElement, mode: 'replace' | 'create_new', targetId?: string) => {
    const d = new FormData(form);
    const assignedCode: string | null = isSingleFund
      ? (scopeCode ?? null)
      : type === 'PORTFOLIO_DD'
        ? null
        : (globalCodeChoice || null);

    let effectiveId: string | undefined = undefined;
    if (mode === 'replace') {
      if (isSingleFund && isCustomizingFromGlobal) {
        // 自定义全局规则为单基金专属时，不污染原全局规则 ID，而是新建专属规则
        effectiveId = undefined;
      } else {
        effectiveId = targetId || replaceTargetId || rule?.id || undefined;
      }
    }

    return {
      id: effectiveId,
      name: name.trim() || RULE_META[type].defaultRuleName,
      description: description.trim() || currentMeta.summary,
      type,
      code: assignedCode,
      threshold: Number(d.get('threshold')),
      step: Number(d.get('step')),
      buffer: Number(d.get('buffer')),
      activation: trailing ? Number(d.get('activation')) : 0,
      window: type === 'FUND_STAGE_DD' ? Number(d.get('window')) : 252,
      historyYears: type === 'FUND_HIST_MDD' ? (Number(d.get('historyYears')) as 0 | 3 | 5) : 0,
      basis: fixed ? basis : 'pct',
      label: String(d.get('label') || ''),
      paused: rule?.paused ?? false
    };
  };

  // 可供替换的目标候选规则列表（根据上下文筛选）
  const replaceableRules = isSingleFund
    ? existingRules.filter(r => r.code === scopeCode)
    : existingRules;

  return (
    <>
      <span className="eyebrow">STRATEGY ENGINE</span>
      <h2>
        {isSingleFund
          ? (rule ? `调整「${targetFund?.name ?? scopeCode}」策略` : `为「${targetFund?.name ?? scopeCode}」配置专属策略`)
          : (rule ? '修改监控规则 / 替换现有规则' : '创建新监控规则')}
      </h2>
      <p>
        {isSingleFund
          ? (isEditingOwnSpecificRule
              ? '当前正在修改此基金的专属规则。保存后将仅替换该基金的专属参数，完全不影响其他基金。'
              : isCustomizingFromGlobal
                ? '当前参考的是全局默认规则。保存后将为该基金生成独立的专属覆盖规则，原本全局规则保持不变。'
                : '将为此基金创建专属规则。专属规则会优先于同类型的全局默认规则生效。')
          : (rule
              ? (rule.code ? `当前编辑的是专属规则（标的：${funds.find(f => f.code === rule.code)?.name ?? rule.code}）。` : '当前编辑的是全局默认规则。修改后将对所有继承该规则的基金统一生效。')
              : '可自由命名规则、编写适用简介，并选择底层模型和阈值参数。')}
      </p>

      {/* 规则工作全流程逻辑导读卡片 */}
      <div className="strategy-guide-box">
        <strong>💡 策略工作全流程逻辑（通俗大白话）：</strong>
        <p>
          ① <b>开启门槛</b>：基金浮盈曾达到门槛后哨兵才正式上线（未赚钱不打扰）；<br/>
          ② <b>回撤预警</b>：从高位回跌达到阈值触发首次报警；<br/>
          ③ <b>防骚扰追报</b>：跌势加深时每多跌一个步长才升级提醒；<br/>
          ④ <b>反弹解除</b>：回撤收窄至（阈值 − 缓冲）以下自动复位重新警戒。
        </p>
      </div>

      <form
        onSubmit={async e => {
          e.preventDefault();
          const r = getFormData(e.currentTarget, 'replace');
          await onSave(r, 'replace');
        }}
      >
        {/* 1. 规则名称与规则类型彻底独立 */}
        <label>
          规则名称（可自定义）
          <input
            name="name"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="例如：牛市冲高止盈线 / 稳健底仓保本线"
            maxLength={35}
            required
          />
          <small className="form-hint">给策略起一个便于记忆的名字，区分不同标的或不同行情下的风控意图</small>
        </label>

        <label>
          规则简介与适用说明（可自定义）
          <textarea
            name="description"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="例如：适用于高波动偏股基金，当收益达到预期后严防高位回吐，及时锁定利润落袋为安。"
            rows={2}
            style={{
              width: '100%',
              border: '1px solid #dce5d3',
              borderRadius: '5px',
              padding: '8px 10px',
              font: 'inherit',
              fontSize: '13px',
              color: '#385536'
            }}
          />
          <small className="form-hint">写下这个规则的特点与适用情况，方便日后随时查看与复盘</small>
        </label>

        {/* 2. 底层规则模型选择 */}
        <label>
          底层计算模型
          <select value={type} onChange={e => handleTypeChange(e.target.value as RuleType)}>
            {availableTypes.map(t => (
              <option key={t} value={t}>
                {RULE_NAMES[t]} · {RULE_META[t].badge}
              </option>
            ))}
          </select>
        </label>

        {/* 选中的具体规则的详尽解释卡片 */}
        <div className="rule-detail-explainer-card">
          <div className="rule-explainer-header">
            <span className="rule-explainer-badge">{currentMeta.badge}</span>
            <strong>{currentMeta.name}</strong>
          </div>
          <p className="rule-explainer-summary">📌 <b>模型定义</b>：{currentMeta.summary}</p>
          <p className="rule-explainer-scenario">🎯 <b>适用场景</b>：{currentMeta.scenario}</p>
          <p className="rule-explainer-example">🌰 <b>通俗举例</b>：{currentMeta.example}</p>
          <div className="rule-explainer-formula">
            <small>📐 <b>计算原理</b>：{currentMeta.formula}</small>
          </div>
        </div>

        {/* 3. 应用范围 */}
        {isSingleFund ? (
          <div className="scope-indicator-card">
            <div className="scope-indicator-header">
              <span className="scope-indicator-badge">🎯 专属目标标的</span>
              <strong>{targetFund ? `${targetFund.name} (${scopeCode})` : scopeCode}</strong>
            </div>
            <p className="scope-indicator-desc">
              ✅ 本次配置严格锁定在当前基金，绝不会影响其他基金或覆盖全局默认规则。
            </p>
          </div>
        ) : (
          <label>
            应用范围
            <select
              value={type === 'PORTFOLIO_DD' ? '' : globalCodeChoice}
              onChange={e => setGlobalCodeChoice(e.target.value)}
              disabled={type === 'PORTFOLIO_DD'}
            >
              <option value="">
                {type === 'PORTFOLIO_DD' ? '整个持仓组合（组合级）' : '🌐 全局默认 · 所有未单独设置专属规则的基金'}
              </option>
              {funds.map(f => (
                <option key={f.code} value={f.code}>
                  🎯 仅单基金专属：{f.name} ({f.code})
                </option>
              ))}
            </select>
            <small className="form-hint">
              {type === 'PORTFOLIO_DD'
                ? '组合规则按账户全部持仓总市值动态监控。'
                : globalCodeChoice
                  ? '仅对所选单只基金生效，并优先覆盖同类型的全局规则。'
                  : '全局规则将自动应用于所有没有配置此类专属规则的基金。'}
            </small>
          </label>
        )}

        {fixed && (
          <label>
            阈值计算口径
            <select value={basis} onChange={e => setBasis(e.target.value as 'pct' | 'amount')}>
              <option value="pct">按百分比（%）</option>
              <option value="amount">按金额（元）</option>
            </select>
            <small className="form-hint">可按收益/亏损百分比，或按实际盈利/亏损金额（元）触发</small>
          </label>
        )}

        {/* 4. 具体参数输入 */}
        <div className="form-grid" key={type + basis}>
          <label>
            回撤预警触发阈值
            <div className="input-with-affix">
              <span className="input-prefix">从最高点回跌 ≥</span>
              <input
                name="threshold"
                type="number"
                min={days ? 1 : 0.01}
                step={days ? 1 : 'any'}
                defaultValue={initial?.threshold ?? (type === 'FUND_HIST_MDD' ? 90 : days ? 3 : 5)}
                required
              />
              <span className="input-suffix">{unit}</span>
            </div>
            <small className="form-hint">
              {type === 'FUND_DOWN_DAYS'
                ? '连续下跌达到该交易日天数时触发预警'
                : type === 'FUND_HIST_MDD'
                  ? '达到历史最大回撤该比例时触发预警（如 90 表示九成历史最大跌幅）'
                  : '自最高点回跌达到此数值时触发首次预警'}
            </small>
          </label>

          {trailing && (
            <label>
              回撤监控开启门槛
              <div className="input-with-affix">
                <span className="input-prefix">最高盈利曾 ≥</span>
                <input
                  name="activation"
                  type="number"
                  min="0"
                  step="any"
                  defaultValue={initial?.activation ?? 5}
                  required
                />
                <span className="input-suffix">%</span>
              </div>
              <small className="form-hint">持仓最高浮盈曾达到该比例才启动监控；未达标前保持静默（不赚不扰）</small>
            </label>
          )}

          <label>
            加深升级提醒步长
            <div className="input-with-affix">
              <span className="input-prefix">恶化每多跌 ≥</span>
              <input
                name="step"
                type="number"
                min={days ? 1 : 0.01}
                step={days ? 1 : 'any'}
                defaultValue={initial?.step ?? (days ? 1 : 2)}
                required
              />
              <span className="input-suffix">{unit}</span>
            </div>
            <small className="form-hint">首次报警后，每进一步深跌该幅度才追加提醒，区间震荡不骚扰</small>
          </label>

          <label>
            防反复横跳复位缓冲
            <div className="input-with-affix">
              <span className="input-prefix">反弹收复缓冲</span>
              <input
                name="buffer"
                type="number"
                min="0"
                step={days ? 1 : 'any'}
                defaultValue={initial?.buffer ?? (days ? 0 : 1)}
                required
              />
              <span className="input-suffix">{unit}</span>
            </div>
            <small className="form-hint">反弹收窄至「阈值 − 缓冲」以下时才解除警报复位；缓冲须小于阈值</small>
          </label>

          {type === 'FUND_STAGE_DD' && (
            <label>
              历史观察周期窗口
              <div className="input-with-affix">
                <span className="input-prefix">近</span>
                <input
                  name="window"
                  type="number"
                  min="0"
                  max="10000"
                  defaultValue={initial?.window ?? 252}
                  required
                />
                <span className="input-suffix">个交易日</span>
              </div>
              <small className="form-hint">股市一年约 252 个交易日；填 0 为自加入自选日起</small>
            </label>
          )}

          {type === 'FUND_HIST_MDD' && (
            <label>
              历史极值统计范围
              <select name="historyYears" defaultValue={initial?.historyYears ?? 0}>
                <option value="0">数据源全部可用历史</option>
                <option value="3">近 3 年</option>
                <option value="5">近 5 年</option>
              </select>
              <small className="form-hint">计算历史最大跌幅极值时回溯的时间跨度</small>
            </label>
          )}
        </div>

        {/* 5. 替换已有规则选择器（当系统有可替换规则时展示） */}
        {replaceableRules.length > 0 && (
          <div style={{background: '#fafcf9', border: '1px solid #e2ebd8', borderRadius: '7px', padding: '12px', margin: '10px 0'}}>
            <label style={{fontSize: '12px', fontWeight: 600, color: '#315438'}}>
              🔄 替换已有规则（若勾选替换目标，将用当前配置覆写替换该规则）
              <select
                value={replaceTargetId}
                onChange={e => setReplaceTargetId(e.target.value)}
                style={{marginTop: '6px'}}
              >
                <option value="">-- 不替换已有规则（另存为全新规则） --</option>
                {replaceableRules.map(r => (
                  <option key={r.id} value={r.id}>
                    替换现有：{ruleName(r)}（{RULE_NAMES[r.type]} · {r.code ? '专属' : '全局'}）
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <label>
          备忘便签标签（最多 15 字）
          <input
            name="label"
            maxLength={15}
            defaultValue={rule?.label}
            placeholder="例如：牛市锁利 / 熊市防守"
          />
        </label>

        {/* 6. 双通道操作按钮：新建 vs 替换 */}
        <div className="modal-actions-row">
          {/* 替换按钮 */}
          {(rule || replaceTargetId) && (
            <button
              type="submit"
              className="primary flex-1"
              disabled={busy}
              title="保存并替换指定规则"
            >
              {isSingleFund
                ? (isEditingOwnSpecificRule
                    ? '保存并替换专属规则'
                    : '覆盖为此基金专属规则')
                : '保存并替换目标规则'}
            </button>
          )}

          {/* 新建/另存为按钮 */}
          <button
            type="button"
            className={rule || replaceTargetId ? 'secondary' : 'primary flex-1'}
            disabled={busy}
            onClick={async e => {
              const form = e.currentTarget.form;
              if (!form) return;
              if (!form.checkValidity()) {
                form.reportValidity();
                return;
              }
              const r = getFormData(form, 'create_new');
              await onSave(r, 'create_new');
            }}
            title="将当前配置另存为一条新的独立监控规则"
          >
            {isSingleFund ? '➕ 另存为此基金新规则' : '➕ 保存为全新规则'}
          </button>
        </div>
      </form>
    </>
  );
}
