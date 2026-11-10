import {test} from 'node:test';
import assert from 'node:assert/strict';
import {positionSchema,ruleSchema} from '../lib/validation';
import {manualPeak} from '../lib/fetcher';
import {RULE_DEFAULTS} from '../lib/rule-defaults';
import {RULE_TYPES,defaultRules,Fund} from '../lib/domain';
test('manual NAV and peak return are equivalent, required, exclusive and bounded by latest NAV',()=>{
 const p={code:'000001',holding:true,cost:1.2,shares:100,peakMode:'manual',manualBasis:'return'};
 assert.equal(positionSchema.safeParse(p).success,false);
 assert.equal(positionSchema.safeParse({...p,peakReturn:25,manual:1.5}).success,false);
 assert.equal(positionSchema.safeParse({...p,peakReturn:-1}).success,false);
 assert.ok(positionSchema.safeParse({...p,peakReturn:25}).success);
 const f={history:[{nav:1.4,date:'2026-11-10'}]} as Fund;
 assert.deepEqual(manualPeak(f,'nav',1.2,1.5),manualPeak(f,'return',1.2,undefined,25));
 assert.throws(()=>manualPeak(f,'return',1.2,undefined,10),/不得低于/);
 assert.equal(positionSchema.parse({code:'000001',holding:true,shares:100,cost:1}).peakMode,'today');
});
test('all metric presets satisfy engine constraints and unit-sensitive defaults differ',()=>{
 for(const type of RULE_TYPES)assert.ok(ruleSchema.safeParse({...defaultRules()[0],type,...RULE_DEFAULTS[type]}).success,type);
 assert.equal(RULE_DEFAULTS.TRAILING_STOP_PROFIT.threshold,30);
 assert.equal(RULE_DEFAULTS.FUND_HIST_MDD.step,10);
 assert.equal(RULE_DEFAULTS.FUND_DOWN_DAYS.buffer,0);
});
