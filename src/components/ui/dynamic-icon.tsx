'use client';

import { LucideProps } from 'lucide-react';
import {
  User,
  Lock,
  CreditCard,
  Gift,
  Bell,
  Building2,
  Users,
  FileText,
  TrendingUp,
  BarChart3,
  History,
  LayoutDashboard,
  Settings,
  HelpCircle,
  Briefcase,
  Star,
  Shield,
  Home,
  ChevronDown,
  Library,
  PlusCircle,
} from 'lucide-react';

// 图标映射表（静态导入，避免 Next.js 动态 chunk 加载失败）
const iconMap: Record<string, React.ComponentType<LucideProps>> = {
  User,
  Lock,
  CreditCard,
  Gift,
  Bell,
  Building2,
  Users,
  FileText,
  TrendingUp,
  BarChart3,
  History,
  LayoutDashboard,
  Settings,
  HelpCircle,
  Briefcase,
  Star,
  Shield,
  Home,
  ChevronDown,
  Library,
  PlusCircle,
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
