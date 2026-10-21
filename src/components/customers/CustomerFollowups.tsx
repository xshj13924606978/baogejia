'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FollowupForm } from './FollowupForm';
import { FOLLOWUP_TYPES, FOLLOWUP_STATUSES, type Followup } from './types';
import {
  Phone,
  MapPin,
  Mail,
  MessageCircle,
  Users,
  MoreHorizontal,
  Plus,
  Pencil,
  Trash2,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDateTime } from '@/lib/date-utils';

interface CustomerFollowupsProps {
  customerId: number;
  mode: 'admin' | 'user';
  /** 是否允许编辑/删除（默认 admin 模式允许，user 模式不允许） */
  canEdit?: boolean;
}

const typeIcons: Record<string, ReactNode> = {
  call: <Phone className="h-4 w-4" />,
  visit: <MapPin className="h-4 w-4" />,
  email: <Mail className="h-4 w-4" />,
  wechat: <MessageCircle className="h-4 w-4" />,
  meeting: <Users className="h-4 w-4" />,
  other: <MoreHorizontal className="h-4 w-4" />,
};

function typeLabel(value: string): string {
  return FOLLOWUP_TYPES.find((t) => t.value === value)?.label || value;
}

function statusLabel(value: string): string {
  return FOLLOWUP_STATUSES.find((s) => s.value === value)?.label || value;
}

function statusClass(value: string): string {
  if (value === 'completed') return 'bg-green-100 text-green-700 hover:bg-green-100';
  if (value === 'cancelled') return 'bg-gray-100 text-gray-700 hover:bg-gray-100';
  return 'bg-blue-100 text-blue-700 hover:bg-blue-100';
}


function getUserName(f: Followup): string {
  if (!f.user) return '';
  return f.user.full_name || f.user.username || f.user.email || '';
}

export function CustomerFollowups({ customerId, mode, canEdit }: CustomerFollowupsProps) {
  const allowEdit = canEdit ?? mode === 'admin';
  const [list, setList] = useState<Followup[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Followup | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Followup | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url =
        mode === 'admin'
          ? `/api/admin/customers/${customerId}/followups`
          : `/api/customers/${customerId}/followups`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) {
        setList(json.data || []);
      } else {
        toast.error(json.error || '加载跟进记录失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setLoading(false);
    }
  }, [customerId, mode]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const handleEdit = (f: Followup) => {
    setEditing(f);
    setFormOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const baseUrl =
        mode === 'admin'
          ? `/api/admin/customers/${customerId}/followups`
          : `/api/customers/${customerId}/followups`;
      const res = await fetch(`${baseUrl}/${deleteTarget.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        toast.success('跟进已删除');
        setDeleteTarget(null);
        load();
      } else {
        toast.error(json.error || '删除失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>跟进记录</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">共 {list.length} 条记录</p>
        </div>
        <Button size="sm" onClick={handleAdd}>
          <Plus className="mr-1 h-4 w-4" />
          新增跟进
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            加载中...
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <MessageCircle className="mb-2 h-10 w-10 opacity-30" />
            <p>暂无跟进记录，点击「新增跟进」开始记录</p>
          </div>
        ) : (
          <ol className="relative space-y-4 border-s border-border ps-6">
            {list.map((f) => (
              <li key={f.id} className="relative">
                <span className="absolute -start-[33px] flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary ring-4 ring-background">
                  {typeIcons[f.followup_type] || typeIcons.other}
                </span>
                <div className="rounded-lg border bg-card p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{typeLabel(f.followup_type)}</Badge>
                      <Badge className={statusClass(f.status)}>
                        {statusLabel(f.status)}
                      </Badge>
                      {getUserName(f) && (
                        <span className="text-xs text-muted-foreground">
                          {getUserName(f)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(f.created_at)}
                      </span>
                      {allowEdit && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(f)}
                            aria-label="编辑"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(f)}
                            aria-label="删除"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm">{f.content}</p>
                  {f.next_followup_date && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      下次跟进：{formatDateTime(f.next_followup_date)}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>

      <FollowupForm
        open={formOpen}
        onOpenChange={setFormOpen}
        customerId={customerId}
        mode={mode}
        initialData={editing}
        onSuccess={load}
      />

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除跟进</DialogTitle>
            <DialogDescription>
              确定要删除该条跟进记录吗？此操作不可恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              取消
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
