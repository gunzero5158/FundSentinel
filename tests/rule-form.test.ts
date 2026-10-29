import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ruleSchema} from '../lib/validation';
import {defaultRules} from '../lib/domain';
test('rule parameters reject unreachable reset and fractional trading days',()=>{
 const rule=defaultRules()[0];
 assert.equal(ruleSchema.safeParse({...rule,buffer:rule.threshold}).success,false);
 assert.equal(ruleSchema.safeParse({...rule,type:'FUND_DOWN_DAYS',threshold:2.5}).success,false);
 assert.equal(ruleSchema.safeParse({...rule,type:'FUND_DOWN_DAYS',threshold:3,step:1,buffer:0}).success,true);
});
