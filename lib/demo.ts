import {emptyWorkspace,evaluate,Fund,Workspace} from './domain';
export function demoWorkspace():Workspace {
  const w=emptyWorkspace();w.demo=true;
  const items=[['900001','成长精选 · 演示','混合型',1.04,1.19],['900002','沪深宽基 · 演示','指数型',1,1.32],['900003','稳健纯债 · 演示','债券型',1.08,1.17],['900004','全球科技 · 演示','QDII',1.12,1.25],['900005','红利价值 · 演示','指数型',1.04,1.26],['900006','医药创新 · 演示','股票型',1.3,1.21],['900007','黄金主题 · 演示','商品型',1.08,1.39],['900008','均衡配置 · 演示','FOF',1.1,1.22]] as const;
  items.forEach(([code,name,type,cost,peak],i)=>{
    const history:Fund['history']=[];const end=new Date('2026-10-19T00:00:00Z');
    for(let n=0;n<140;n++){
      const d=new Date(end.getTime()-(139-n)*86400_000);if([0,6].includes(d.getUTCDay()))continue;
      const nav=Number((n<95?cost*.85+(peak-cost*.85)*n/95+Math.sin(n*.3+i)*.014:peak-(n-95)*(.0006+i*.00018)).toFixed(4));
      const prev=history.at(-1);history.push({date:d.toISOString().slice(0,10),nav,acc:nav,adj:nav,daily:prev?(nav/prev.nav-1)*100:0,dividend:''});
    }
    w.funds[code]={code,name,type,source:'合成演示数据 · 非真实行情',history,adjustmentReliable:true,fetchedAt:new Date().toISOString()};
    w.positions.push({id:`demo-${i}`,code,holding:i!==7,shares:i===7?0:6000+i*1100,cost:i===7?0:cost,hwm:peak,hwmDate:'2026-09-04',addedAt:'2026-06-01',needsCalibration:false});
  });
  evaluate(w);return w;
}
