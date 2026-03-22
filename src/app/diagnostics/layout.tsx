// 诊断工具页面不需要静态预渲染（依赖浏览器环境的 localStorage 等 API）
export const dynamic = 'force-dynamic';

export default function DiagnosticsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
