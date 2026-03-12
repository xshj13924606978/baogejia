'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Edit, History } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { LevelEditor } from './LevelEditor';

interface LevelConfig {
  level: number;
  name: string;
  requiredPoints: number;
  role: string;
  fieldPermissions: {
    can_view_cost_price: boolean;
    can_view_min_price: boolean;
    can_view_manufacturer: boolean;
    can_view_contact: boolean;
    can_view_phone: boolean;
  };
  modulePermissions: string[];
  quotas: {
    daily_quota: number;
    max_files: number;
    max_chat_messages: number;
  };
}

export const LevelList: React.FC = () => {
  const [levels, setLevels] = useState<LevelConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingLevel, setEditingLevel] = useState<number | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchLevels();
  }, []);

  const fetchLevels = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/levels');
      const data = await res.json();
      if (data.success) {
        setLevels(data.levels);
      } else {
        toast({
          variant: 'destructive',
          title: '获取等级列表失败',
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: '获取等级列表失败',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateLevel = async (level: number, changes: any, reason: string) => {
    try {
      const res = await fetch(`/api/admin/levels/${level}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes, reason })
      });

      const data = await res.json();

      if (data.success) {
        toast({
          title: '更新成功',
        });
        fetchLevels();
        setEditingLevel(null);
      } else {
        toast({
          variant: 'destructive',
          title: '更新失败',
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: '更新失败',
      });
    }
  };

  const showHistory = async (level: number) => {
    try {
      const res = await fetch(`/api/admin/levels/${level}/history`);
      const data = await res.json();

      if (data.success && data.history && data.history.length > 0) {
        const historyText = data.history
          .map((h: any) => `时间: ${new Date(h.createdAt).toLocaleString()} | 管理员: ${h.adminName || '未知'} | 原因: ${h.reason}`)
          .join('\n');

        toast({
          title: `等级 ${level} 修改历史`,
          description: (
            <div className="whitespace-pre-wrap text-sm max-h-64 overflow-y-auto">
              {historyText}
            </div>
          ),
        });
      } else {
        toast({
          title: `等级 ${level}`,
          description: '暂无修改历史',
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: '获取历史失败',
      });
    }
  };

  const getLevelColor = (level: number) => {
    if (level === 1) return 'bg-blue-500';
    if (level === 5) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">等级权限配置</h2>
        <Button>批量更新</Button>
      </div>

      {loading ? (
        <div className="text-center py-8">加载中...</div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>等级</TableHead>
                <TableHead>名称</TableHead>
                <TableHead>所需积分</TableHead>
                <TableHead>字段权限</TableHead>
                <TableHead>模块权限</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {levels.map((record) => (
                <TableRow key={record.level}>
                  <TableCell>
                    <Badge className={getLevelColor(record.level)}>
                      Lv.{record.level}
                    </Badge>
                  </TableCell>
                  <TableCell>{record.name}</TableCell>
                  <TableCell>{record.requiredPoints}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {record.fieldPermissions.can_view_cost_price && (
                        <Badge variant="secondary">成本价</Badge>
                      )}
                      {record.fieldPermissions.can_view_min_price && (
                        <Badge variant="secondary">最低价</Badge>
                      )}
                      {record.fieldPermissions.can_view_manufacturer && (
                        <Badge variant="outline">厂家</Badge>
                      )}
                      {record.fieldPermissions.can_view_contact && (
                        <Badge variant="outline">联系人</Badge>
                      )}
                      {record.fieldPermissions.can_view_phone && (
                        <Badge variant="outline">电话</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {record.modulePermissions.slice(0, 3).map((code) => (
                        <Badge key={code} variant="outline" className="bg-purple-50">
                          {code}
                        </Badge>
                      ))}
                      {record.modulePermissions.length > 3 && (
                        <Badge variant="outline">
                          +{record.modulePermissions.length - 3}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingLevel(record.level)}
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        编辑
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => showHistory(record.level)}
                      >
                        <History className="h-4 w-4 mr-1" />
                        历史
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!editingLevel} onOpenChange={() => setEditingLevel(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>编辑等级 Lv.{editingLevel} 权限</DialogTitle>
          </DialogHeader>
          {editingLevel && (
            <LevelEditor
              level={editingLevel}
              onSave={handleUpdateLevel}
              onCancel={() => setEditingLevel(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
};
