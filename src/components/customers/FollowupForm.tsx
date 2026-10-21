'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  FOLLOWUP_TYPES,
  FOLLOWUP_STATUSES,
  type Followup,
  type FollowupType,
  type FollowupStatus,
} from './types';

interface FollowupFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: number;
  mode: 'admin' | 'user';
  initialData?: Followup | null;
  onSuccess?: () => void;
}

const trim = (s: string) => s.trim();

/** ISO 时间戳 → datetime-local 输入框字符串 */
function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return '';
  }
}

/** datetime-local 输入框字符串 → ISO 时间戳（空值返回 null） */
function fromDatetimeLocal(s: string): string | null {
  if (!s) return null;
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

export function FollowupForm({
  open,
  onOpenChange,
  customerId,
  mode,
  initialData,
  onSuccess,
}: FollowupFormProps) {
  const isEdit = !!initialData;
  const [content, setContent] = useState('');
  const [followupType, setFollowupType] = useState<FollowupType>('call');
  const [status, setStatus] = useState<FollowupStatus>('pending');
  const [nextDate, setNextDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setContent(initialData?.content || '');
      setFollowupType((initialData?.followup_type as FollowupType) || 'call');
      setStatus((initialData?.status as FollowupStatus) || 'pending');
      setNextDate(toDatetimeLocal(initialData?.next_followup_date));
    }
  }, [open, initialData]);

  const handleSubmit = async () => {
    if (!content.trim()) {
      toast.error('跟进内容不能为空');
      return;
    }

    setSubmitting(true);
    try {
      const baseUrl =
        mode === 'admin'
          ? `/api/admin/customers/${customerId}/followups`
          : `/api/customers/${customerId}/followups`;
      const url = isEdit ? `${baseUrl}/${initialData!.id}` : baseUrl;
      const method = isEdit ? 'PUT' : 'POST';

      const payload: Record<string, unknown> = {
        followupType,
        content: trim(content),
        status,
        nextFollowupDate: fromDatetimeLocal(nextDate),
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(isEdit ? '跟进已更新' : '跟进已添加');
        onOpenChange(false);
        onSuccess?.();
      } else {
        toast.error(json.error || '保存失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? '编辑跟进' : '新增跟进'}</DialogTitle>
          <DialogDescription>
            {isEdit ? '修改跟进内容与状态' : '记录与该客户的跟进沟通'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>跟进方式</Label>
              <Select
                value={followupType}
                onValueChange={(v) => setFollowupType(v as FollowupType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FOLLOWUP_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>状态</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as FollowupStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FOLLOWUP_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>
              跟进内容 <span className="text-destructive">*</span>
            </Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="请输入本次跟进的具体内容..."
              rows={4}
            />
          </div>
          <div className="space-y-2">
            <Label>下次跟进时间</Label>
            <Input
              type="datetime-local"
              value={nextDate}
              onChange={(e) => setNextDate(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? '保存修改' : '添加跟进'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
