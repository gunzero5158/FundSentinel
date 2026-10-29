'use client';
import {useState} from 'react';
import {Rule,RuleType,RULE_TYPES,RULE_NAMES} from '@/lib/domain';

export const descriptions: Record<RuleType, string> = {
  TRAILING_STOP_NAV: '（持仓最高净值 − 当前净值）÷ 最高净值 × 100%。需要真实持仓及有效成本。',
  TRAILING_STOP_RET: '最高持仓收益率 − 当前收益率，单位为百分点。需要真实持仓及有效成本。',
  TRAILING_STOP_PROFIT: '（最高净值 − 当前净值）÷（最高净值 − 成本价）× 100%，衡量已赚浮盈回吐多少。',
  FIXED_TAKE_PROFIT: '累计持仓收益达到阈值；可按收益率或盈利金额计算。',
  FIXED_STOP_LOSS: '累计持仓亏损达到阈值；输入正数，可按亏损率或亏损金额计算。',
  PORTFOLIO_DD: '全部持仓总市值相对组合最高市值的回撤；份额或成本变化后重建高点。',
  FUND_STAGE_DD: '当前复权净值相对观察窗口最高点的回撤，不要求持仓。',
  FUND_HIST_MDD: '当前历史高点回撤 ÷ 历史最大回撤 × 100%。例如 90 表示达到历史最大回撤的九成；基准排除当前日。',
  FUND_DAILY_VOL: '单日复权涨跌幅的绝对值，上涨和下跌均可触发，不要求持仓。',
  FUND_DOWN_DAYS: '连续下跌的净值交易日数，持平或上涨中断连续计数，不要求持仓。'
};

export function ruleUnit(type: RuleType, basis: string) {
  return type === 'FUND_DOWN_DAYS' ? '个交易日' : type === 'TRAILING_STOP_RET' ? '个百分点' : type.startsWith('FIXED_') && basis === 'amount' ? '元' : '%';
}

export default function RuleForm({
  rule,
  scopeCode,
  funds,
  busy,
  onSave
}: {
  rule?: Rule;
  scopeCode?: string | null;
  funds: {code: string; name: string}[];
  busy: boolean;
  onSave: (r: Omit<Rule, 'id'> & {id?: string}, mode: 'replace' | 'create_new') => Promise<void>;
}) {
  const isSingleFund = Boolean(scopeCode);
  const targetFund = isSingleFund ? funds.find(f => f.code === scopeCode) : undefined;

  // Filter out PORTFOLIO_DD when configuring a single fund rule
  const availableTypes: readonly RuleType[] = isSingleFund
    ? (RULE_TYPES.filter(t => t !== 'PORTFOLIO_DD') as RuleType[])
    : RULE_TYPES;

  const [type, setType] = useState<RuleType>(
    rule?.type && (availableTypes as readonly string[]).includes(rule.type)
      ? rule.type
      : (isSingleFund ? 'TRAILING_STOP_NAV' : (rule?.type ?? 'TRAILING_STOP_NAV'))
  );
  const [basis, setBasis] = useState(rule?.basis ?? 'pct');
  const [globalCodeChoice, setGlobalCodeChoice] = useState<string>(rule?.code ?? '');

  const trailing = type.startsWith('TRAILING_'), fixed = type.startsWith('FIXED_'), unit = ruleUnit(type, basis), days = type === 'FUND_DOWN_DAYS';
  const initial = rule?.type === type ? rule : undefined;

  // Is this editing an existing rule that belongs specifically to this single fund?
  const isEditingOwnSpecificRule = isSingleFund && Boolean(rule?.id && rule.code === scopeCode);
  // Is this based on a global rule being customized for a single fund?
  const isCustomizingFromGlobal = isSingleFund && Boolean(rule?.id && rule.code === null);

  const getFormData = (form: HTMLFormElement, mode: 'replace' | 'create_new') => {
    const d = new FormData(form);
    const assignedCode: string | null = isSingleFund
      ? (scopeCode ?? null)
      : type === 'PORTFOLIO_DD'
        ? null
        : (globalCodeChoice || null);

    // If customizing from a global rule in single-fund mode, never overwrite the global rule id!
    const effectiveId = mode === 'create_new'
      ? undefined
      : isCustomizingFromGlobal
        ? undefined
        : rule?.id;

    return {
      id: effectiveId,
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

  return (
    <>
      <span className="eyebrow">STRATEGY ENGINE</span>
      <h2>
        {isSingleFund
          ? (rule ? `调整「${targetFund?.name ?? scopeCode}」策略` : `为「${targetFund?.name ?? scopeCode}」新建专属策略`)
          : (rule ? '编辑规则 / 切换类型' : '创建新规则')}
      </h2>
      <p>
        {isSingleFund
          ? (isEditingOwnSpecificRule
              ? '当前正在修改此基金的专属规则。保存后将仅替换该基金的专属参数，完全不影响其他基金。'
              : isCustomizingFromGlobal
                ? '当前参考的是全局默认规则。保存后将为该基金生成独立的专属覆盖规则，原本全局规则保持不变。'
                : '将为此基金创建一条独立的专属规则。专属规则会优先于同类型的全局默认规则生效。')
          : (rule
              ? (rule.code ? `当前编辑的是专属规则（标的：${funds.find(f => f.code === rule.code)?.name ?? rule.code}）。` : '当前编辑的是全局默认规则，修改后将对所有继承该规则的基金统一生效。')
              : '创建后将新增一条独立监控规则。多个规则可同时启用。')}
      </p>

      <form
        onSubmit={async e => {
          e.preventDefault();
          const r = getFormData(e.currentTarget, 'replace');
          await onSave(r, 'replace');
        }}
      >
        <label>
          规则类型
          <select
            value={type}
            onChange={e => {
              setType(e.target.value as RuleType);
              setBasis('pct');
            }}
          >
            {availableTypes.map(t => (
              <option key={t} value={t}>
                {RULE_NAMES[t]}
              </option>
            ))}
          </select>
        </label>

        <div className="strategy-guide-box">
          <strong>{RULE_NAMES[type]}</strong>
          <p>{descriptions[type]}</p>
        </div>

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
                {type === 'PORTFOLIO_DD' ? '整个持仓组合（组合级）' : '🌐 全局默认 · 所有未单独设置此规则的基金'}
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
            阈值口径
            <select value={basis} onChange={e => setBasis(e.target.value as 'pct' | 'amount')}>
              <option value="pct">百分比（%）</option>
              <option value="amount">金额（元）</option>
            </select>
          </label>
        )}

        <div className="form-grid" key={type + basis}>
          <label>
            触发阈值（{unit}）
            <input
              name="threshold"
              type="number"
              min={days ? 1 : 0.01}
              step={days ? 1 : 'any'}
              defaultValue={initial?.threshold ?? (type === 'FUND_HIST_MDD' ? 90 : days ? 3 : 5)}
              required
            />
            <small className="form-hint">达到此阈值时触发首次预警</small>
          </label>

          {trailing && (
            <label>
              最高浮盈开启门槛（%）
              <input
                name="activation"
                type="number"
                min="0"
                step="any"
                defaultValue={initial?.activation ?? 5}
                required
              />
              <small className="form-hint">最高盈利曾 ≥ 该比例才开启监控（不赚不扰）</small>
            </label>
          )}

          <label>
            指标每增加多少追报（{unit}）
            <input
              name="step"
              type="number"
              min={days ? 1 : 0.01}
              step={days ? 1 : 'any'}
              defaultValue={initial?.step ?? (days ? 1 : 2)}
              required
            />
            <small className="form-hint">恶化加深时每多跌该幅度追加提醒，区间震荡不骚扰</small>
          </label>

          <label>
            解除预警缓冲（{unit}）
            <input
              name="buffer"
              type="number"
              min="0"
              step={days ? 1 : 'any'}
              defaultValue={initial?.buffer ?? (days ? 0 : 1)}
              required
            />
            <small className="form-hint">反弹收复至「阈值 − 缓冲」以下复位；缓冲须小于阈值</small>
          </label>

          {type === 'FUND_STAGE_DD' && (
            <label>
              观察窗口（交易日）
              <input
                name="window"
                type="number"
                min="0"
                max="10000"
                defaultValue={initial?.window ?? 252}
                required
              />
              <small className="form-hint">股市一年约 252 个交易日；填 0 为自加入自选日起</small>
            </label>
          )}

          {type === 'FUND_HIST_MDD' && (
            <label>
              历史统计范围
              <select name="historyYears" defaultValue={initial?.historyYears ?? 0}>
                <option value="0">全部可用历史</option>
                <option value="3">近 3 年</option>
                <option value="5">近 5 年</option>
              </select>
              <small className="form-hint">计算历史最大回撤极值的历史跨度</small>
            </label>
          )}
        </div>

        <label>
          备忘标签（最多 15 字）
          <input
            name="label"
            maxLength={15}
            defaultValue={rule?.label}
            placeholder="例如：稳健底仓保本 / 动态止盈"
          />
        </label>

        <div className="modal-actions-row">
          <button type="submit" className="primary flex-1" disabled={busy}>
            {isSingleFund
              ? (isEditingOwnSpecificRule
                  ? '保存并替换专属规则'
                  : '覆盖为此基金专属规则')
              : (rule ? '保存修改' : '创建并启用规则')}
          </button>

          {/* Additional action: Create as a new rule based on current settings */}
          {rule && (
            <button
              type="button"
              className="secondary"
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
              title="保留原规则不变，另存为一条新的独立规则"
            >
              {isSingleFund ? '另存为追加新规则' : '基于此另存为新规则'}
            </button>
          )}
        </div>
      </form>
    </>
  );
}
