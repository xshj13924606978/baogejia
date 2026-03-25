'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { History, Loader2, FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

const API = '/api/admin/config/logs';

const TYPE_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline'; className: string }> = {
  module:        { label: '模块',   variant: 'default',  className: 'bg-purple-100 text-purple-700' },
  page:          { label: '页面',   variant: 'default',  className: 'bg-blue-100 text-blue-700' },
  field:         { label: '字段',   variant: 'secondary', className: 'bg-green-100 text-green-700' },
  action:        { label: '按钮',   variant: 'secondary', className: 'bg-orange-100 text-orange-700' },
  user_override: { label: '用户覆盖', variant: 'outline', className: 'bg-gray-100 text-gray-600' },
};

interface LogItem {
  id: string;
  target_type: string;
  target_id: string;
  old_value: unknown;
  new_value: unknown;
  change_description: string | null;
  created_at: string;
  admin_email: string | null;
  admin_name: string | null;
}

function formatTime(dateStr: string): string {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleString('zh-CN', {
      month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch { return dateStr; }
}

function DiffView({ oldVal, newVal }: { oldVal: unknown; newVal: unknown }) {
  const oldStr = typeof oldVal === 'string' ? oldVal : JSON.stringify(oldVal, null, 2);
  const newStr = typeof newVal === 'string' ? newVal : JSON.stringify(newVal, null, 2);
  return (
    <div className="grid grid-cols-2 gap-3 text-xs font-mono max-h-[300px] overflow-auto">
      <div>
        <div className="text-muted-foreground mb-1 font-sans font-medium text-xs">变更前</div>
        <pre className="bg-red-50 dark:bg-red-950/30 p-2 rounded text-red-800 dark:text-red-300 whitespace-pre-wrap break-all">{oldStr || '(空)'}</pre>
      </div>
      <div>
        <div className="text-muted-foreground mb-1 font-sans font-medium text-xs">变更后</div>
        <pre className="bg-green-50 dark:bg-green-950/30 p-2 rounded text-green-800 dark:text-green-300 whitespace-pre-wrap break-all">{newStr || '(空)'}</pre>
      </div>
    </div>
  );
}

export default function ConfigChangeLogs() {
  const [items, setItems] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(30);
  const [targetType, setTargetType] = useState('');
  const [keyword, setKeyword] = useState('');

  const [detailItem, setDetailItem] = useState<LogItem | null>(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
      });
      if (targetType) params.set('target_type', targetType);
      // keyword 用于前端过滤（API 视图暂不支持全文搜索）

      const res = await fetch(`${API}?${params}`);
      const data = await res.json();
      if (data.success) {
        let result = data.data || [];
        if (keyword) {
          const kw = keyword.toLowerCase();
          result = result.filter((r: LogItem) =>
            (r.change_description || '').toLowerCase().includes(kw) ||
            (r.admin_name || '').toLowerCase().includes(kw) ||
            (r.admin_email || '').toLowerCase().includes(kw) ||
            (r.target_id || '').toLowerCase().includes(kw)
          );
        }
        setItems(result);
        setTotal(data.total || 0);
      } else {
        toast.error(data.error || '加载失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, targetType, keyword]);

  useEffect(() => { loadItems(); }, [loadItems]);
  useEffect(() => { setPage(1); }, [targetType, keyword]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-4">
      {/* 筛选栏 */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <History className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索描述、操作人、目标ID..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <Button
            variant={targetType === '' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTargetType('')}
          >全部</Button>
          {Object.entries(TYPE_LABELS).map(([key, cfg]) => (
            <Button
              key={key}
              variant={targetType === key ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTargetType(key)}
            >{cfg.label}</Button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={loadItems}>刷新</Button>
      </div>

      {/* 列表 */}
      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            <FileText className="h-10 w-10 mb-2 opacity-30" />
            <p className="text-lg font-medium">暂无变更记录</p>
            <p className="text-sm">对模块/页面/字段/按钮的修改会自动记录在此</p>
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-md overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">#</TableHead>
                <TableHead className="w-[160px]">时间</TableHead>
                <TableHead className="w-[80px]">类型</TableHead>
                <TableHead>目标ID</TableHead>
                <TableHead>变更说明</TableHead>
                <TableHead className="w-[100px]">操作人</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, idx) => {
                const typeCfg = TYPE_LABELS[item.target_type] || TYPE_LABELS.module;
                return (
                  <TableRow key={item.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setDetailItem(item)}>
                    <TableCell className="text-muted-foreground text-xs">{(page - 1) * pageSize + idx + 1}</TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{formatTime(item.created_at)}</TableCell>
                    <TableCell><Badge variant={typeCfg.variant} className={`text-xs ${typeCfg.className}`}>{typeCfg.label}</Badge></TableCell>
                    <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded max-w-[120px] inline-block truncate">{item.target_id}</code></TableCell>
                    <TableCell className="text-sm max-w-[300px] truncate">{item.change_description || '-'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{item.admin_name || item.admin_email || '-'}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">共 {total} 条</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-3">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* 详情弹窗 */}
      <Dialog open={!!detailItem} onOpenChange={(open) => !open && setDetailItem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>变更详情</DialogTitle></DialogHeader>
          {detailItem && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">类型：</span>
                  <Badge variant={TYPE_LABELS[detailItem.target_type]?.variant || 'outline'} className={`text-xs ${TYPE_LABELS[detailItem.target_type]?.className || ''}`}>
                    {TYPE_LABELS[detailItem.target_type]?.label || detailItem.target_type}
                  </Badge>
                </div>
                <div><span className="text-muted-foreground">目标ID：</span><code className="text-xs bg-muted px-1 py-0.5 rounded">{detailItem.target_id}</code></div>
                <div><span className="text-muted-foreground">操作人：</span>{detailItem.admin_name || detailItem.admin_email || '-'}</div>
                <div><span className="text-muted-foreground">时间：</span>{formatTime(detailItem.created_at)}</div>
              </div>
              {detailItem.change_description && (
                <div className="text-sm"><span className="text-muted-foreground">说明：</span>{detailItem.change_description}</div>
              )}
              <DiffView oldVal={detailItem.old_value} newVal={detailItem.new_value} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
