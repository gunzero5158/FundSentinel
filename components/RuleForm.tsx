'use client';
import {RULE_DEFAULTS} from '@/lib/rule-defaults';
import {useState} from 'react';
import {Rule, RuleType, RULE_TYPES, RULE_NAMES, ruleName, ruleDescription, stopLossOf, DEFAULT_STOP_LOSS} from '@/lib/domain';

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
    badge: '基金走势 · 阶段抗跌',
    defaultRuleName: '近1年阶段高点回撤监控',
    summary: '纯看基金自身净值走势（不要求个人持仓）。监控基金在近 N 个交易日内自阶段最高点的跌幅。',
    scenario: '用于持仓基金跟踪、等待回调买入机会或评估近期调整深度。',
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
  const [saveMode,setSaveMode]=useState<'replace'|'create_new'>(rule?.id?'replace':'create_new');
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
    rule ? (rule.id ? ruleName(rule) : (ruleName(rule).slice(0,32)+' 副本')) : RULE_META[type].defaultRuleName
  );
  const [description, setDescription] = useState<string>(
    rule ? ruleDescription(rule) : RULE_META[type].summary
  );

  const [basis, setBasis] = useState(rule?.basis ?? 'pct');
  const [globalCodeChoice, setGlobalCodeChoice] = useState<string>(rule?.code ?? '');


  const trailing = type.startsWith('TRAILING_'),
    fixed = type.startsWith('FIXED_'),
    unit = ruleUnit(type, basis),
    days = type === 'FUND_DOWN_DAYS',
    daily = type === 'FUND_DAILY_VOL';
  const initial = rule?.type === type && rule.basis === basis ? rule : undefined;
  const currentMeta = RULE_META[type];
  const defaults = RULE_DEFAULTS[type];

  // 当切换规则类型时，如果是新建或者用户未特别定制名字，智能建议默认名称和简介
  const handleTypeChange = (newType: RuleType) => {
    setType(newType);
    setBasis('pct');
    if (!rule && name === RULE_META[type].defaultRuleName) {
      setName(RULE_META[newType].defaultRuleName);
      setDescription(RULE_META[newType].summary);
    }
  };

  const isEditingOwnSpecificRule = isSingleFund && Boolean(rule?.id && rule.code === scopeCode);
  const isCustomizingFromGlobal = isSingleFund && Boolean(rule?.id && rule.code !== scopeCode);

  const getFormData = (form: HTMLFormElement, mode: 'replace' | 'create_new') => {
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
        effectiveId = rule?.id || undefined;
      }
    }

    return {
      id: effectiveId,
      name: name.trim() || RULE_META[type].defaultRuleName,
      description: description.trim(),
      type,
      code: assignedCode,
      threshold: Number(d.get('threshold')),
      step: daily ? defaults.step : Number(d.get('step')),
      buffer: daily ? defaults.buffer : Number(d.get('buffer')),
      activation: trailing ? Number(d.get('activation')) : 0,
      stopLoss: trailing ? Number(d.get('stopLoss')) : undefined,
      window: type === 'FUND_STAGE_DD' ? Number(d.get('window')) : 252,
      historyYears: type === 'FUND_HIST_MDD' ? (Number(d.get('historyYears')) as 0 | 3 | 5) : 0,
      basis: fixed ? basis : 'pct',
      label: rule?.label ?? '',
      paused: mode==='create_new'?false:rule?.paused ?? false
    };
  };


  return (
    <>
      <span className="eyebrow">STRATEGY ENGINE</span>
      <h2>
        {isSingleFund
          ? (rule ? `调整「${targetFund?.name ?? scopeCode}」策略` : `为「${targetFund?.name ?? scopeCode}」配置专属策略`)
          : (rule?.id ? '编辑规则' : '创建新规则')}
      </h2>
      <p>
        {isSingleFund
          ? (isEditingOwnSpecificRule
              ? '当前正在修改此基金的专属规则。保存后将仅替换该基金的专属参数，完全不影响其他基金。'
              : isCustomizingFromGlobal
                ? '当前参考的是全局默认规则。保存后将为该基金生成独立的专属覆盖规则，原规则保持不变。'
                : '将为此基金创建专属规则。专属规则会优先于同类型的全局默认规则生效。')
          : (rule
              ? (rule.code ? `当前编辑的是专属规则（标的：${funds.find(f => f.code === rule.code)?.name ?? rule.code}）。` : '当前编辑的是全局默认规则。修改后将对所有继承该规则的基金统一生效。')
              : '选择应用范围与预警条件。')}
      </p>

      <form
        onSubmit={async e => {
          e.preventDefault();
          const r = getFormData(e.currentTarget, saveMode);
          await onSave(r, saveMode);
        }}
      >
        {/* 1. 规则名称与规则类型彻底独立 */}
        <label>
          {saveMode==='create_new'?'新规则名称':'规则名称'}
          <input
            name="name"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="例如：牛市冲高止盈线 / 稳健底仓保本线"
            maxLength={35}
            required
          />
        </label>

        <label>
          备注（选填）
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
        </label>

        {/* 2. 底层规则模型选择 */}
        <label>
          规则类型
          <select value={type} onChange={e => handleTypeChange(e.target.value as RuleType)}>
            {availableTypes.map(t => (
              <option key={t} value={t}>
                {RULE_NAMES[t]}
              </option>
            ))}
          </select>
        </label>

        <details className="compact-help" key={type}><summary>指标说明</summary>
          <strong>{RULE_NAMES[type]}</strong><p>{currentMeta.summary}</p><p>{currentMeta.formula}</p><p>{currentMeta.example}</p>
          <p>预填值仅为配置起点，未针对你的基金回测；债券与权益基金请分别设置。金额模式需自行填写阈值、步长及缓冲。</p><strong>触发与解除</strong>
          {trailing&&<p>最高浮盈达到开启门槛后才监控，且最高净值须高于成本。开启前若一路下跌，由「本金止损线」兜底：持仓亏损达到该比例即提醒；基金已另有「累计亏损阈值」规则时以那条规则为准。</p>}
          {daily?<p>每个净值日独立判断：当日涨跌幅绝对值达到阈值就提醒，连续多日大涨大跌会逐日提醒。</p>:<p>指标达到阈值时首次预警；此后每增加一个步长追加提醒；严格低于「阈值 − 缓冲」时复位。</p>}
        </details>

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
            预警触发阈值
            <div className="input-with-affix">
              <span className="input-prefix">指标 ≥</span>
              <input
                name="threshold"
                type="number"
                min={days ? 1 : 0.01}
                step={days ? 1 : 'any'}
                defaultValue={initial?.threshold ?? (basis==='amount'?undefined:defaults.threshold)}
                required
              />
              <span className="input-suffix">{unit}</span>
            </div>
            <small className="form-hint">
              {type === 'FUND_DOWN_DAYS'
                ? '连续下跌达到该交易日天数时触发预警'
                : type === 'FUND_HIST_MDD'
                  ? '达到历史最大回撤该比例时触发预警（如 90 表示九成历史最大跌幅）'
                  : fixed ? '累计收益或亏损达到阈值时预警' : type==='FUND_DAILY_VOL' ? '单日涨跌幅绝对值达到阈值时预警' : '所选指标达到阈值时预警'}
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
                  defaultValue={initial?.activation ?? defaults.activation}
                  required
                />
                <span className="input-suffix">%</span>
              </div>
              <small className="form-hint">持仓最高浮盈曾达到该比例才启动监控；未达标前保持静默（不赚不扰）</small>
            </label>
          )}

          {trailing && (
            <label>
              本金止损线
              <div className="input-with-affix">
                <span className="input-prefix">持仓亏损 ≥</span>
                <input
                  name="stopLoss"
                  type="number"
                  min="0"
                  max="100"
                  step="any"
                  defaultValue={rule ? stopLossOf({...rule, type}) : DEFAULT_STOP_LOSS}
                  required
                />
                <span className="input-suffix">%</span>
              </div>
              <small className="form-hint">买入后一路下跌、移动止盈尚未开启时的兜底提醒；填 0 关闭</small>
            </label>
          )}

          {!daily && <label>
            加深升级提醒步长
            <div className="input-with-affix">
              <span className="input-prefix">指标每增加 ≥</span>
              <input
                name="step"
                type="number"
                min={days ? 1 : 0.01}
                step={days ? 1 : 'any'}
                defaultValue={initial?.step ?? (basis==='amount'?undefined:defaults.step)}
                required
              />
              <span className="input-suffix">{unit}</span>
            </div>
            <small className="form-hint">首次预警后，指标每增加该数值追加提醒</small>
          </label>}

          {!daily && <label>
            防反复横跳复位缓冲
            <div className="input-with-affix">
              <span className="input-prefix">复位缓冲</span>
              <input
                name="buffer"
                type="number"
                min="0"
                step={days ? 1 : 'any'}
                defaultValue={initial?.buffer ?? (basis==='amount'?undefined:defaults.buffer)}
                required
              />
              <span className="input-suffix">{unit}</span>
            </div>
            <small className="form-hint">指标降至「阈值 − 缓冲」以下时才解除警报复位；缓冲须小于阈值</small>
          </label>}

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
              <small className="form-hint">股市一年约 252 个交易日；填 0 为自加入持仓日起</small>
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

        {Boolean(rule?.id)&&<label>保存方式<select value={saveMode} onChange={e=>{const mode=e.target.value as 'replace'|'create_new';setSaveMode(mode);if(mode==='create_new'&&name===ruleName(rule!))setName(name.slice(0,32)+' 副本');}}><option value="replace">{isCustomizingFromGlobal?'保存为单基金专属':'修改当前规则'}</option><option value="create_new">另存为新规则</option></select></label>}
        <button type="submit" className="primary full" disabled={busy}>{busy?'保存中…':saveMode==='create_new'?'创建新规则':'保存修改'}</button>
      </form>
    </>
  );
}
