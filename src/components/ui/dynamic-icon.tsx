'use client';

import dynamic from 'next/dynamic';
import { LucideProps } from 'lucide-react';

// 动态图标映射表（按需加载，减少 bundle 体积）
const iconMap: Record<string, React.ComponentType<LucideProps>> = {
  User: dynamic(() => import('lucide-react').then(m => ({ default: m.User })), { ssr: false }),
  Lock: dynamic(() => import('lucide-react').then(m => ({ default: m.Lock })), { ssr: false }),
  CreditCard: dynamic(() => import('lucide-react').then(m => ({ default: m.CreditCard })), { ssr: false }),
  Gift: dynamic(() => import('lucide-react').then(m => ({ default: m.Gift })), { ssr: false }),
  Bell: dynamic(() => import('lucide-react').then(m => ({ default: m.Bell })), { ssr: false }),
  Building2: dynamic(() => import('lucide-react').then(m => ({ default: m.Building2 })), { ssr: false }),
  Users: dynamic(() => import('lucide-react').then(m => ({ default: m.Users })), { ssr: false }),
  FileText: dynamic(() => import('lucide-react').then(m => ({ default: m.FileText })), { ssr: false }),
  TrendingUp: dynamic(() => import('lucide-react').then(m => ({ default: m.TrendingUp })), { ssr: false }),
  BarChart3: dynamic(() => import('lucide-react').then(m => ({ default: m.BarChart3 })), { ssr: false }),
  History: dynamic(() => import('lucide-react').then(m => ({ default: m.History })), { ssr: false }),
  LayoutDashboard: dynamic(() => import('lucide-react').then(m => ({ default: m.LayoutDashboard })), { ssr: false }),
  Settings: dynamic(() => import('lucide-react').then(m => ({ default: m.Settings })), { ssr: false }),
  HelpCircle: dynamic(() => import('lucide-react').then(m => ({ default: m.HelpCircle })), { ssr: false }),
  Briefcase: dynamic(() => import('lucide-react').then(m => ({ default: m.Briefcase })), { ssr: false }),
  Star: dynamic(() => import('lucide-react').then(m => ({ default: m.Star })), { ssr: false }),
  Shield: dynamic(() => import('lucide-react').then(m => ({ default: m.Shield })), { ssr: false }),
  Home: dynamic(() => import('lucide-react').then(m => ({ default: m.Home })), { ssr: false }),
  ChevronDown: dynamic(() => import('lucide-react').then(m => ({ default: m.ChevronDown })), { ssr: false }),
};

// 默认占位图标
const PlaceholderIcon = ({ ...props }: LucideProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={props.size || 16} height={props.size || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/></svg>
);

/**
 * 根据图标名称动态渲染 lucide 图标
 */
export function DynamicIcon({ name, ...props }: { name: string } & LucideProps) {
  const IconComponent = iconMap[name] || PlaceholderIcon;
  return <IconComponent {...props} />;
}
