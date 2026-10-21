import Link from 'next/link';
import { ArrowLeft, BookOpen, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import SystemPermissionsHelp from '@/components/help/SystemPermissionsHelp';

/**
 * 独立帮助页面：/help/permissions
 * 系统权限体系说明（会员等级 / 积分体系 / 模块与字段权限矩阵 / FAQ）
 * 对话窗: [#202608311300-权限体系帮助文档生成]
 */
export const metadata = {
  title: '权限体系说明',
  description:
    '智能报价系统权限体系说明：会员等级、积分体系、模块权限矩阵、字段权限矩阵与常见问题',
};

export default function PermissionsHelpPage() {
  return (
    <div className="h-screen overflow-y-auto bg-gray-50">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/help">
            <span className="inline-flex items-center text-sm font-medium text-gray-700 hover:text-gray-900">
              <ArrowLeft className="h-4 w-4 mr-1" />
              返回帮助中心
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-blue-500" />
            <h1 className="text-lg font-semibold">权限体系说明</h1>
          </div>
        </div>
        <Badge variant="outline" className="gap-1 text-muted-foreground">
          <BookOpen className="h-3.5 w-3.5" />
          会员与积分
        </Badge>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        <SystemPermissionsHelp />
      </div>
    </div>
  );
}
