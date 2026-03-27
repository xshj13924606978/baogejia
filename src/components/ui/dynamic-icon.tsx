'use client';

import dynamic from 'next/dynamic';
import { LucideProps } from 'lucide-react';

// 动态图标映射表（按需加载，减少 bundle 体积）
const iconMap: Record<string, React.ComponentType<LucideProps>> = {
  User: dynamic(() => import('lucide-react').then(m => ({ default: m.User }))),
  Lock: dynamic(() => import('lucide-react').then(m => ({ default: m.Lock }))),
  CreditCard: dynamic(() => import('lucide-react').then(m => ({ default: m.CreditCard }))),
  Gift: dynamic(() => import('lucide-react').then(m => ({ default: m.Gift }))),
  Bell: dynamic(() => import('lucide-react').then(m => ({ default: m.Bell }))),
  Building2: dynamic(() => import('lucide-react').then(m => ({ default: m.Building2 }))),
  Users: dynamic(() => import('lucide-react').then(m => ({ default: m.Users }))),
  FileText: dynamic(() => import('lucide-react').then(m => ({ default: m.FileText }))),
  TrendingUp: dynamic(() => import('lucide-react').then(m => ({ default: m.TrendingUp }))),
  BarChart3: dynamic(() => import('lucide-react').then(m => ({ default: m.BarChart3 }))),
  History: dynamic(() => import('lucide-react').then(m => ({ default: m.History }))),
  LayoutDashboard: dynamic(() => import('lucide-react').then(m => ({ default: m.LayoutDashboard }))),
  Settings: dynamic(() => import('lucide-react').then(m => ({ default: m.Settings }))),
  HelpCircle: dynamic(() => import('lucide-react').then(m => ({ default: m.HelpCircle }))),
  Briefcase: dynamic(() => import('lucide-react').then(m => ({ default: m.Briefcase }))),
  Star: dynamic(() => import('lucide-react').then(m => ({ default: m.Star }))),
  Shield: dynamic(() => import('lucide-react').then(m => ({ default: m.Shield }))),
  Home: dynamic(() => import('lucide-react').then(m => ({ default: m.Home }))),
  ChevronDown: dynamic(() => import('lucide-react').then(m => ({ default: m.ChevronDown }))),
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
