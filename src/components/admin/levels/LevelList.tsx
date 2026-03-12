'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Edit, History, Upload } from 'lucide-react';
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
  const [batchUpdateOpen, setBatchUpdateOpen] = useState(false);
  const [batchUpdating, setBatchUpdating] = useState(false);
  const [batchUpdateReason, setBatchUpdateReason] = useState('');
  const [selectedLevelForBatch, setSelectedLevelForBatch] = useState<number | null>(null);
  const [batchUpdateField, setBatchUpdateField] = useState<string>('');
  const [batchUpdateValue, setBatchUpdateValue] = useState<string>('');
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

  const handleBatchUpdate = async () => {
    if (!selectedLevelForBatch || !batchUpdateField || !batchUpdateValue || !batchUpdateReason) {
      toast({
        variant: 'destructive',
        title: '请完整填写批量更新信息',
      });
      return;
    }

    try {
      setBatchUpdating(true);

      // 构建更新对象
      let updateData: any = {};

      switch (batchUpdateField) {
        case 'daily_quota':
        case 'max_files':
        case 'max_chat_messages':
          updateData = {
            level: selectedLevelForBatch,
            changes: {
              quotas: {
                [batchUpdateField]: parseInt(batchUpdateValue)
              }
            }
          };
          break;
        case 'can_view_cost_price':
        case 'can_view_min_price':
        case 'can_view_manufacturer':
        case 'can_view_contact':
        case 'can_view_phone':
          updateData = {
            level: selectedLevelForBatch,
            changes: {
              fieldPermissions: {
                [batchUpdateField]: batchUpdateValue === 'true'
              }
            }
          };
          break;
        default:
          toast({
            variant: 'destructive',
            title: '不支持的更新字段',
          });
          return;
      }

      const res = await fetch('/api/admin/levels/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: [
            {
              ...updateData,
              reason: batchUpdateReason
            }
          ]
        })
      });

      const data = await res.json();

      if (data.success) {
        toast({
          title: '批量更新成功',
        });
        setBatchUpdateOpen(false);
        fetchLevels();
        // 重置表单
        setBatchUpdateReason('');
        setSelectedLevelForBatch(null);
        setBatchUpdateField('');
        setBatchUpdateValue('');
      } else {
        toast({
          variant: 'destructive',
          title: '批量更新失败',
          description: data.error || '未知错误'
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: '批量更新失败',
      });
    } finally {
      setBatchUpdating(false);
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">等级权限配置</h2>
        <Button onClick={() => setBatchUpdateOpen(true)}>
          <Upload className="mr-2 h-4 w-4" />
          批量更新
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-8">加载中...</div>
      ) : (
        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">等级</TableHead>
                <TableHead className="whitespace-nowrap">名称</TableHead>
                <TableHead className="whitespace-nowrap">所需积分</TableHead>
                <TableHead className="whitespace-nowrap min-w-[200px]">字段权限</TableHead>
                <TableHead className="whitespace-nowrap min-w-[250px]">模块权限</TableHead>
                <TableHead className="whitespace-nowrap">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {levels.map((record) => (
                <TableRow key={record.level}>
                  <TableCell className="whitespace-nowrap">
                    <Badge className={getLevelColor(record.level)}>
                      Lv.{record.level}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{record.name}</TableCell>
                  <TableCell className="whitespace-nowrap">{record.requiredPoints}</TableCell>
                  <TableCell className="whitespace-nowrap">
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
                      {!record.fieldPermissions.can_view_cost_price &&
                       !record.fieldPermissions.can_view_min_price &&
                       !record.fieldPermissions.can_view_manufacturer &&
                       !record.fieldPermissions.can_view_contact &&
                       !record.fieldPermissions.can_view_phone && (
                        <span className="text-muted-foreground text-sm">无权限</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <div className="flex flex-wrap gap-1">
                      {record.modulePermissions.length > 0 ? (
                        <>
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
                        </>
                      ) : (
                        <span className="text-muted-foreground text-sm">无权限</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
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
              {levels.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    暂无等级数据
                  </TableCell>
                </TableRow>
              )}
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

      <Dialog open={batchUpdateOpen} onOpenChange={setBatchUpdateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>批量更新等级配置</DialogTitle>
            <DialogDescription>
              快速更新指定等级的单个配置项
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>选择等级 *</Label>
              <Select value={selectedLevelForBatch?.toString()} onValueChange={(value) => setSelectedLevelForBatch(parseInt(value))}>
                <SelectTrigger>
                  <SelectValue placeholder="请选择等级" />
                </SelectTrigger>
                <SelectContent>
                  {levels.map((level) => (
                    <SelectItem key={level.level} value={level.level.toString()}>
                      Lv.{level.level} - {level.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>更新字段 *</Label>
              <Select value={batchUpdateField} onValueChange={setBatchUpdateField}>
                <SelectTrigger>
                  <SelectValue placeholder="请选择要更新的字段" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily_quota">每日查询配额</SelectItem>
                  <SelectItem value="max_files">最大文件数量</SelectItem>
                  <SelectItem value="max_chat_messages">最大聊天消息数</SelectItem>
                  <SelectItem value="can_view_cost_price">查看成本价</SelectItem>
                  <SelectItem value="can_view_min_price">查看最低售价</SelectItem>
                  <SelectItem value="can_view_manufacturer">查看厂家信息</SelectItem>
                  <SelectItem value="can_view_contact">查看联系人</SelectItem>
                  <SelectItem value="can_view_phone">查看联系电话</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>新值 *</Label>
              <Input
                value={batchUpdateValue}
                onChange={(e) => setBatchUpdateValue(e.target.value)}
                placeholder={
                  batchUpdateField.includes('can_view')
                    ? 'true 或 false'
                    : '请输入数字值'
                }
              />
            </div>

            <div className="space-y-2">
              <Label>修改原因 *</Label>
              <Textarea
                value={batchUpdateReason}
                onChange={(e) => setBatchUpdateReason(e.target.value)}
                rows={3}
                placeholder="请输入修改原因..."
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setBatchUpdateOpen(false)}>
              取消
            </Button>
            <Button onClick={handleBatchUpdate} disabled={batchUpdating}>
              {batchUpdating && (
                <Upload className="mr-2 h-4 w-4 animate-spin" />
              )}
              确认更新
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
