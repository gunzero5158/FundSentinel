'use client';
import {useEffect,useRef} from 'react';
import {Fund,Position,Rule,fundMetrics,positionMetrics} from '@/lib/domain';
import * as echarts from 'echarts/core';
import {LineChart} from 'echarts/charts';
import {GridComponent,TooltipComponent,LegendComponent,DataZoomComponent,MarkLineComponent} from 'echarts/components';
import {CanvasRenderer} from 'echarts/renderers';
echarts.use([LineChart,GridComponent,TooltipComponent,LegendComponent,DataZoomComponent,MarkLineComponent,CanvasRenderer]);
export default function NavChart({fund,position,rule}:{fund:Fund;position:Position;rule?:Rule}){
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const chart=echarts.init(ref.current!),m=positionMetrics(position,fund),fm=fundMetrics(fund),points=fund.history;
    // Two distinct NAV bases are rendered on separate aligned axes. Never overlay raw-cost on adjusted NAV.
    const personal=[{name:'持仓成本',value:position.cost,color:'#4d80c8'},{name:'持仓最高水位',value:position.hwm,color:'#229773'},
      {name:'相对回撤触发线',value:position.hwm*(1-(rule?.threshold??5)/100),color:'#dc9c35'}];
    chart.setOption({animation:false,color:['#278366','#769dcb'],tooltip:{trigger:'axis',valueFormatter:(v:unknown)=>Number(v).toFixed(4)},legend:{top:4,textStyle:{color:'#6c7772',fontSize:11},data:['单位净值 · 持仓口径','复权净值 · 基金口径']},grid:[{left:58,right:24,top:45,height:'33%'},{left:58,right:24,top:'57%',height:'27%'}],xAxis:[{type:'category',data:points.map(p=>p.date),gridIndex:0,axisLabel:{show:false}},{type:'category',data:points.map(p=>p.date),gridIndex:1,axisLabel:{color:'#8b9690',fontSize:11}}],yAxis:[{type:'value',scale:true,gridIndex:0,splitLine:{lineStyle:{color:'#edf1ed'}},axisLabel:{color:'#8b9690'}},{type:'value',scale:true,gridIndex:1,splitLine:{lineStyle:{color:'#edf1ed'}},axisLabel:{color:'#8b9690'}}],dataZoom:[{type:'inside',xAxisIndex:[0,1]},{type:'slider',xAxisIndex:[0,1],bottom:0,height:16,borderColor:'transparent'}],series:[{name:'单位净值 · 持仓口径',type:'line',data:points.map(p=>p.nav),showSymbol:false,xAxisIndex:0,yAxisIndex:0,lineStyle:{width:2.5},areaStyle:{color:'rgba(39,131,102,.06)'},markLine:{symbol:'none',label:{position:'insideEndTop',fontSize:11,formatter:'{b}'},data:position.holding?personal.map(v=>({name:v.name,yAxis:v.value,lineStyle:{color:v.color,type:'dashed'}})):[]}},{name:'复权净值 · 基金口径',type:'line',data:points.map(p=>p.adj),showSymbol:false,xAxisIndex:1,yAxisIndex:1,lineStyle:{width:2},markLine:{symbol:'none',label:{fontSize:11,formatter:'历史回撤参照线'},data:fm.reliable&&fm.mdd>0?[{yAxis:fm.peak*(1-fm.mdd/100),lineStyle:{color:'#9574bd',type:'dashed'}}]:[]}}]});
    const observer=new ResizeObserver(()=>chart.resize());observer.observe(ref.current!);return()=>{observer.disconnect();chart.dispose();};
  },[fund,position,rule]);
  return <div ref={ref} className="nav-chart" role="img" aria-label="上图为单位净值与成本水位线，下图为复权净值与历史回撤参照线"/>;
}
