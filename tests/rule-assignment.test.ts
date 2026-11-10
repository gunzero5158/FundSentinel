import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyWorkspace,defaultRules,effectiveRules,applyRule,Rule,Position,ruleDimension} from '../lib/domain';
import {positionSchema} from '../lib/validation';
const pos=(code:string):Position=>({id:code,code,holding:true,shares:100,cost:1,hwm:1.2,hwmDate:'2026-01-01',addedAt:'2026-01-01',needsCalibration:false});
test('single dimension selection wins across global, specific and explicit shared bindings',()=>{
 const w=emptyWorkspace(),base=defaultRules()[0];w.positions=[pos('000001'),pos('000002')];
 w.rules=[{...base,id:'global'},{...base,id:'specific',code:'000001',type:'TRAILING_STOP_RET'},{...base,id:'profit',code:'000001',type:'TRAILING_STOP_PROFIT',priority:3}];
 assert.deepEqual(effectiveRules(w,'000001').map(r=>r.id),['profit']);
 applyRule(w,'specific',['000001','000002']);
 for(const code of ['000001','000002'])assert.deepEqual(effectiveRules(w,code).map(r=>r.id),['specific']);
 w.rules[1].threshold=12;assert.equal(effectiveRules(w,'000002')[0].threshold,12);
 w.rules[1].paused=true;assert.equal(effectiveRules(w,'000002')[0].paused,true);
 assert.equal(new Set(effectiveRules(w,'000001').map(r=>ruleDimension(r.type))).size,1);
 const restored=JSON.parse(JSON.stringify(w));assert.equal(effectiveRules(restored,'000002')[0].id,'specific');
 assert.throws(()=>applyRule(w,'specific',['000003']));
 w.rules=w.rules.filter(r=>r.id!=='specific');assert.equal(effectiveRules(w,'000002')[0].id,'global');
});
test('watermark modes enforce their required inputs and real dates',()=>{
 const p={code:'000001',holding:true,shares:100,cost:1};
 for(const peakMode of ['auto','cost','60','today'])assert.ok(positionSchema.safeParse({...p,peakMode}).success);
 for(const input of [{peakMode:'date'},{peakMode:'date',start:'2026-02-30'},{peakMode:'date',start:'2999-01-01'},{peakMode:'manual'},{peakMode:'manual',manual:0},{peakMode:'keep'}])assert.equal(positionSchema.safeParse({...p,...input}).success,false);
 assert.ok(positionSchema.safeParse({...p,peakMode:'date',start:'2026-01-01'}).success);
 assert.ok(positionSchema.safeParse({...p,peakMode:'manual',manual:1.4}).success);
 assert.ok(positionSchema.safeParse({...p,id:'existing',peakMode:'keep'}).success);
});
