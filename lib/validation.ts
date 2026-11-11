import {z} from 'zod';
import {RULE_TYPES} from './domain';
export const ruleSchema=z.object({id:z.string().max(80).optional(),name:z.string().max(40).optional(),description:z.string().max(300).optional(),code:z.string().regex(/^\d{6}$/).nullable(),type:z.enum(RULE_TYPES),threshold:z.number().positive().max(1e10),activation:z.number().min(0).max(10000),stopLoss:z.number().min(0).max(100).optional(),step:z.number().positive().max(1e10),buffer:z.number().min(0).max(10000),window:z.number().int().min(0).max(10000),historyYears:z.union([z.literal(0),z.literal(3),z.literal(5)]).default(0),basis:z.enum(['pct','amount']),label:z.string().max(15).optional().default(''),paused:z.boolean()}).superRefine((r,ctx)=>{if(r.buffer>=r.threshold)ctx.addIssue({code:'custom',message:'复位缓冲必须小于触发阈值'});if(r.type==='FUND_DOWN_DAYS'&&![r.threshold,r.step,r.buffer].every(Number.isInteger))ctx.addIssue({code:'custom',message:'连续下跌规则的参数必须为整数交易日'});});
export const positionSchema=z.object({id:z.string().max(80).optional(),code:z.string().regex(/^\d{6}$/),ruleId:z.string().max(80).optional(),holding:z.boolean(),shares:z.number().positive().max(1e12).optional(),cost:z.number().positive().max(1e8).optional(),peakMode:z.enum(['auto','cost','60','today','manual','date','keep']).default('today'),start:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),manualBasis:z.enum(['nav','return']).default('nav'),manual:z.number().positive().optional(),currentReturn:z.number().optional(),currentProfit:z.number().optional(),peakReturn:z.number().max(100000).optional()}).superRefine((v,ctx)=>{if(v.holding&&(!v.shares||!v.cost))ctx.addIssue({code:'custom',message:'持仓必须填写正数份额与成本单价'});if(v.peakMode==='date'){
 if(!v.start)ctx.addIssue({code:'custom',message:'请选择建仓日期'});
 else {const date=new Date(v.start+'T00:00:00Z');if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==v.start||v.start>new Date(Date.now()+8*3600000).toISOString().slice(0,10))ctx.addIssue({code:'custom',message:'建仓日期必须为真实且不晚于今天的日期'});}
 }if(v.peakMode==='manual'){if(v.manualBasis==='nav'&&v.manual===undefined)ctx.addIssue({code:'custom',message:'请输入历史最高净值'});if(v.manualBasis==='return'&&(v.peakReturn===undefined||!v.cost))ctx.addIssue({code:'custom',message:'请输入最高浮盈率及正数成本单价'});if(v.manual!==undefined&&v.peakReturn!==undefined)ctx.addIssue({code:'custom',message:'最高净值和最高浮盈率只能选择一种输入'});}
 if(v.peakMode==='keep'&&!v.id)ctx.addIssue({code:'custom',message:'新持仓不能保持旧水位线'});
 if(v.peakReturn!==undefined&&v.peakReturn<0)ctx.addIssue({code:'custom',message:'最高浮盈率不能为负数'});});
export const OCR_ERROR='未识别到完整有效持仓信息（缺少成本价、持仓份额/金额或盈亏数据），请上传包含完整持仓明细的截图';
export type OcrRecord={fund_code:string|null;fund_name:string|null;cost_unit:number|null;holding_shares:number|null;holding_amount:number|null;holding_profit:number|null;holding_return_pct:number|null;total_cost:number|null;is_valid:boolean;error_message:string|null};
export function validateOcr(value:unknown):OcrRecord[] {
  if(!Array.isArray(value)||!value.length||value.length>60)throw new Error('未识别到有效基金持仓记录');
  return value.map(raw=>{
    const r=(raw && typeof raw==='object'?raw:{}) as Record<string,unknown>;
    const number=(key:string)=>{const v=r[key];return typeof v==='number'&&Number.isFinite(v)?v:null;};
    const code=typeof r.fund_code==='string'&&/^\d{6}$/.test(r.fund_code)?r.fund_code:null;
    const name=typeof r.fund_name==='string'&&r.fund_name.trim()?r.fund_name.slice(0,100):null;
    const cost=number('cost_unit'),shares=number('holding_shares'),amount=number('holding_amount'),profit=number('holding_profit'),ret=number('holding_return_pct'),total=number('total_cost');
    const valid=!!(code||name) && cost!==null&&cost>0 && ((shares!==null&&shares>0)||(amount!==null&&amount>0)||(total!==null&&total>0)) && (profit!==null||ret!==null);
    return {fund_code:code,fund_name:name,cost_unit:cost,holding_shares:shares,holding_amount:amount,holding_profit:profit,holding_return_pct:ret,total_cost:total,is_valid:valid,error_message:valid?null:OCR_ERROR};
  });
}
