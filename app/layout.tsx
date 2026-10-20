import type {Metadata,Viewport} from 'next';
import './globals.css';
export const metadata:Metadata={title:'净值哨兵 FundSentinel',description:'公募基金双轨策略监控 · 用数据记录波动，用规则守住纪律',manifest:'/manifest.webmanifest',icons:{icon:'/icon-192.png',apple:'/icon-192.png'},appleWebApp:{capable:true,statusBarStyle:'default',title:'净值哨兵'}};
export const viewport:Viewport={width:'device-width',initialScale:1,themeColor:'#14251e'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="zh-CN"><body>{children}</body></html>;}
