'use client';
import {useState} from 'react';
import {Rule,ruleName,RULE_NAMES,Position,Fund} from '@/lib/domain';
export default function BatchRules({rules,positions,funds,busy,onApply}:{rules:Rule[];positions:Position[];funds:Record<string,Fund>;busy:boolean;onApply:(id:string,codes:string[])=>Promise<boolean>}){
 const [chosen,setChosen]=useState<string[]>([]),[id,setId]=useState('');
 return <details className="compact-help"><summary>批量应用规则</summary><p>所选规则替代同一监控维度的原规则；以后修改该规则，所有引用它的基金一起更新。</p><label>选择规则<select value={id} onChange={e=>setId(e.target.value)}><option value="">请选择</option>{rules.filter(r=>r.type!=='PORTFOLIO_DD').map(r=><option key={r.id} value={r.id}>{ruleName(r)} · {RULE_NAMES[r.type]}{r.paused?'（已暂停）':''}</option>)}</select></label><button type="button" onClick={()=>setChosen(chosen.length===positions.length?[]:positions.map(p=>p.code))}>{chosen.length===positions.length?'取消全选':'全选持仓'}</button><div className="batch-funds">{positions.map(p=><label key={p.code}><input type="checkbox" checked={chosen.includes(p.code)} onChange={e=>setChosen(e.target.checked?[...chosen,p.code]:chosen.filter(c=>c!==p.code))}/>{funds[p.code]?.name??p.code}</label>)}</div><button className="primary" disabled={busy||!id||!chosen.length} onClick={async()=>{if(await onApply(id,chosen))setChosen([]);}}>应用到 {chosen.length} 只基金</button></details>;
}
