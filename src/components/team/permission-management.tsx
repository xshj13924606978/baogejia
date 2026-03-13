'use client';

import { useState, useEffect } from 'react';
import { Shield, Check, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TeamPermissions, TeamRole } from '@/types/team';

interface PermissionManagementProps {
  teamId: string;
}

const roleLabels: Record<TeamRole, string> = {
  [TeamRole.ADMIN]: '管理员',
  [TeamRole.MEMBER]: '成员',
  [TeamRole.GUEST]: '访客',
};

export function PermissionManagement({ teamId }: PermissionManagementProps) {
  const [permissions, setPermissions] = useState<Record<TeamRole, TeamPermissions> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPermissions();
  }, [teamId]);

  const fetchPermissions = async () => {
    try {
      // 模拟获取所有角色的权限
      const mockPermissions: Record<TeamRole, TeamPermissions> = {
        [TeamRole.ADMIN]: {
          canCreateQuotes: true,
          canEditQuotes: true,
          canDeleteQuotes: true,
          canInviteMembers: true,
          canManageMembers: true,
          canManageSettings: true,
          canComment: true,
          canExport: true,
        },
        [TeamRole.MEMBER]: {
          canCreateQuotes: true,
          canEditQuotes: true,
          canDeleteQuotes: false,
          canInviteMembers: false,
          canManageMembers: false,
          canManageSettings: false,
          canComment: true,
          canExport: true,
        },
        [TeamRole.GUEST]: {
          canCreateQuotes: false,
          canEditQuotes: false,
          canDeleteQuotes: false,
          canInviteMembers: false,
          canManageMembers: false,
          canManageSettings: false,
          canComment: false,
          canExport: false,
        },
      };

      setPermissions(mockPermissions);
    } catch (error) {
      console.error('获取权限失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const permissionsList = [
    { key: 'canCreateQuotes' as keyof TeamPermissions, label: '创建报价单' },
    { key: 'canEditQuotes' as keyof TeamPermissions, label: '编辑报价单' },
    { key: 'canDeleteQuotes' as keyof TeamPermissions, label: '删除报价单' },
    { key: 'canInviteMembers' as keyof TeamPermissions, label: '邀请成员' },
    { key: 'canManageMembers' as keyof TeamPermissions, label: '管理成员' },
    { key: 'canManageSettings' as keyof TeamPermissions, label: '管理团队设置' },
    { key: 'canComment' as keyof TeamPermissions, label: '发表评论' },
    { key: 'canExport' as keyof TeamPermissions, label: '导出报价单' },
  ];

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center">加载中...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Shield className="h-5 w-5 mr-2" />
            权限配置
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="text-sm text-gray-600 mb-4">不同角色在团队中的权限配置如下：</div>

            {/* 表头 */}
            <div className="grid grid-cols-4 gap-4 text-sm font-medium text-gray-700 border-b pb-2">
              <div className="col-span-1">权限项目</div>
              <div className="col-span-1 text-center">管理员</div>
              <div className="col-span-1 text-center">成员</div>
              <div className="col-span-1 text-center">访客</div>
            </div>

            {/* 权限列表 */}
            {permissionsList.map((permission) => (
              <div
                key={permission.key}
                className="grid grid-cols-4 gap-4 items-center py-3 border-b last:border-0 hover:bg-gray-50 transition-colors"
              >
                <div className="col-span-1 text-sm">{permission.label}</div>

                <div className="col-span-1 flex justify-center">
                  {permissions?.[TeamRole.ADMIN][permission.key] ? (
                    <Check className="h-5 w-5 text-green-600" />
                  ) : (
                    <X className="h-5 w-5 text-gray-400" />
                  )}
                </div>

                <div className="col-span-1 flex justify-center">
                  {permissions?.[TeamRole.MEMBER][permission.key] ? (
                    <Check className="h-5 w-5 text-green-600" />
                  ) : (
                    <X className="h-5 w-5 text-gray-400" />
                  )}
                </div>

                <div className="col-span-1 flex justify-center">
                  {permissions?.[TeamRole.GUEST][permission.key] ? (
                    <Check className="h-5 w-5 text-green-600" />
                  ) : (
                    <X className="h-5 w-5 text-gray-400" />
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* 角色说明 */}
          <div className="mt-6 pt-4 border-t">
            <h4 className="text-sm font-medium text-gray-700 mb-3">角色说明</h4>
            <div className="space-y-2 text-sm">
              <div className="flex items-start space-x-2">
                <Badge variant="destructive">管理员</Badge>
                <span className="text-gray-600">拥有所有权限，可以管理团队设置和成员</span>
              </div>
              <div className="flex items-start space-x-2">
                <Badge variant="default">成员</Badge>
                <span className="text-gray-600">可以创建、编辑报价单，发表评论和导出</span>
              </div>
              <div className="flex items-start space-x-2">
                <Badge variant="secondary">访客</Badge>
                <span className="text-gray-600">仅能查看内容，无法进行任何编辑操作</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
