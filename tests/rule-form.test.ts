import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ruleSchema} from '../lib/validation';
import {defaultRules, ruleName, ruleDescription} from '../lib/domain';

test('rule parameters reject unreachable reset and fractional trading days', () => {
  const rule = defaultRules()[0];
  assert.equal(ruleSchema.safeParse({...rule, buffer: rule.threshold}).success, false);
  assert.equal(ruleSchema.safeParse({...rule, type: 'FUND_DOWN_DAYS', threshold: 2.5}).success, false);
  assert.equal(ruleSchema.safeParse({...rule, type: 'FUND_DOWN_DAYS', threshold: 3, step: 1, buffer: 0}).success, true);
});

test('defaultRules provides exactly one baseline global rule with independent name and description', () => {
  const rules = defaultRules();
  assert.equal(rules.length, 1);
  assert.equal(rules[0].code, null);
  assert.equal(rules[0].name, '全局默认移动止盈线');
  assert.ok(rules[0].description && rules[0].description.length > 10);
  assert.equal(ruleName(rules[0]), '全局默认移动止盈线');
  assert.equal(ruleDescription(rules[0]), rules[0].description);
});

test('ruleSchema accepts custom name and description and supports fallback', () => {
  const custom = {
    ...defaultRules()[0],
    name: '稳健牛市止盈策略',
    description: '专门针对高波动半导体股票型基金的防守线'
  };
  const parseResult = ruleSchema.safeParse(custom);
  assert.equal(parseResult.success, true);
  if (parseResult.success) {
    assert.equal(parseResult.data.name, '稳健牛市止盈策略');
    assert.equal(parseResult.data.description, '专门针对高波动半导体股票型基金的防守线');
  }
});
