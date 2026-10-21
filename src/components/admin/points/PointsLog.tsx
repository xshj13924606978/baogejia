'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Search,
  CalendarIcon,
  MoreHorizontal,
  Eye,
  RotateCcw,
  Pencil,
  Trash2,
  Loader2,
  ArrowDownLeft,
  ArrowUpRight,
  Activity,
  Coins,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
} from '@/components/ui/pagination';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatDate, formatDateTime } from '@/lib/date-utils';
import type { DateRange } from 'react-day-picker';

// ============================================================
// 类型定义
// ============================================================
interface PointLogTypeConfig {
  type_code: string;
  type_name: string;
  category: 'reward' | 'consume' | 'system';
  badge_class: string;
  icon_name: string;
  display_order: number;
  is_active: boolean;
  is_reversible: boolean;
  is_editable: boolean;
  is_deletable: boolean;
  description: string;
}

interface PointLog {
  id: string;
  userId: string;
  username: string;
  /** 来自 users.full_name/username */
  userName?: string;
  userEmail?: string;
  userPhone?: string;
  points: number;
  balanceAfter?: number;
  type: string;
  /** 来自 point_log_types.type_name，兜底为原始 type 值 */
  typeName?: string;
  /** 来自 point_log_types.badge_class */
  badgeClass?: string;
  description?: string;
  referenceId?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  reversedAt?: string;
  reversedBy?: string;
}

interface PointStats {
  totalCount: number;
  totalIn: number;
  totalOut: number;
  netFlow: number;
  typeStats: Record<string, number>;
}

interface ApiResponse {
  success: boolean;
  data?: PointLog[];
  total?: number;
  page?: number;
  limit?: number;
  types?: PointLogTypeConfig[];
  stats?: PointStats;
  error?: string;
  message?: string;
}

const DEFAULT_LIMIT = 20;

// ============================================================
// 工具函数
// ============================================================
function getTypeConfig(typeCode: string, typeMap: Map<string, PointLogTypeConfig>): PointLogTypeConfig {
  return (
    typeMap.get(typeCode) || {
      type_code: typeCode,
      type_name: typeCode,
      category: 'system',
      badge_class: 'bg-slate-100 text-slate-700',
      icon_name: 'coins',
      display_order: 999,
      is_active: true,
      is_reversible: false,
      is_editable: false,
      is_deletable: false,
      description: '',
    }
  );
}

function getCategoryLabel(category: string) {
  switch (category) {
    case 'reward':
      return '获取';
    case 'consume':
      return '消费';
    default:
      return '系统';
  }
}

function buildPageList(currentPage: number, totalPages: number): (number | 'ellipsis')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages: (number | 'ellipsis')[] = [1];

  if (currentPage > 3) {
    pages.push('ellipsis');
  }

  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (currentPage < totalPages - 2) {
    pages.push('ellipsis');
  }

  pages.push(totalPages);
  return pages;
}

// ============================================================
// 主组件
// ============================================================
export default function PointsLog() {
  const { toast } = useToast();

  // 列表状态
  const [logs, setLogs] = useState<PointLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [total, setTotal] = useState(0);
  const [typeConfigs, setTypeConfigs] = useState<PointLogTypeConfig[]>([]);
  const [stats, setStats] = useState<PointStats | null>(null);

  // 筛选状态
  const [keyword, setKeyword] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>();

  // 操作弹窗状态
  const [detailLog, setDetailLog] = useState<PointLog | null>(null);
  const [editLog, setEditLog] = useState<PointLog | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const [reverseLog, setReverseLog] = useState<PointLog | null>(null);
  const [deleteLog, setDeleteLog] = useState<PointLog | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // 批量操作状态
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchEditOpen, setBatchEditOpen] = useState(false);
  const [batchDescription, setBatchDescription] = useState('');
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);

  const typeMap = useMemo(() => new Map(typeConfigs.map((t) => [t.type_code, t])), [typeConfigs]);
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total, limit]);

  // 加载数据
  const fetchLogs = useCallback(
    async (targetPage = page) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set('page', String(targetPage));
        params.set('limit', String(limit));
        if (keyword.trim()) params.set('keyword', keyword.trim());
        if (selectedType && selectedType !== 'all') params.set('type', selectedType);
        if (dateRange?.from) params.set('startDate', dateRange.from.toISOString());
        if (dateRange?.to) params.set('endDate', dateRange.to.toISOString());

        const response = await fetch(`/api/admin/points/logs?${params.toString()}`);
        const result: ApiResponse = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.error || '获取积分流水失败');
        }

        setLogs(result.data || []);
        setTotal(result.total || 0);
        setPage(result.page || targetPage);
        if (result.types) setTypeConfigs(result.types);
        if (result.stats) setStats(result.stats);
      } catch (error: any) {
        toast({
          variant: 'destructive',
          title: '获取积分流水失败',
          description: error.message || '请稍后重试',
        });
      } finally {
        setLoading(false);
      }
    },
    [page, limit, keyword, selectedType, dateRange, toast]
  );

  useEffect(() => {
    setSelectedIds(new Set());
    fetchLogs(1);
  }, [keyword, selectedType, dateRange, limit]);

  useEffect(() => {
    setSelectedIds(new Set());
    fetchLogs(page);
  }, [page]);

  // 操作：撤销
  const handleReverse = async () => {
    if (!reverseLog) return;
    setActionLoading(true);
    try {
      const response = await fetch('/api/admin/points/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reverse', logId: reverseLog.id }),
      });
      const result: ApiResponse = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || '撤销失败');
      }
      toast({ title: '撤销成功', description: result.message });
      setReverseLog(null);
      fetchLogs(page);
    } catch (error: any) {
      toast({ variant: 'destructive', title: '撤销失败', description: error.message });
    } finally {
      setActionLoading(false);
    }
  };

  // 操作：编辑说明
  const handleEditDescription = async () => {
    if (!editLog) return;
    setActionLoading(true);
    try {
      const response = await fetch(`/api/admin/points/logs/${editLog.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: editDescription }),
      });
      const result: ApiResponse = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || '更新失败');
      }
      toast({ title: '更新成功', description: result.message });
      setEditLog(null);
      fetchLogs(page);
    } catch (error: any) {
      toast({ variant: 'destructive', title: '更新失败', description: error.message });
    } finally {
      setActionLoading(false);
    }
  };

  // 操作：删除
  const handleDelete = async () => {
    if (!deleteLog) return;
    setActionLoading(true);
    try {
      const response = await fetch(`/api/admin/points/logs/${deleteLog.id}`, {
        method: 'DELETE',
      });
      const result: ApiResponse = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || '删除失败');
      }
      toast({ title: '删除成功', description: result.message });
      setDeleteLog(null);
      fetchLogs(page);
    } catch (error: any) {
      toast({ variant: 'destructive', title: '删除失败', description: error.message });
    } finally {
      setActionLoading(false);
    }
  };

  // 批量操作：编辑说明
  const handleBatchEdit = async () => {
    if (selectedIds.size === 0) return;
    setActionLoading(true);
    try {
      const response = await fetch('/api/admin/points/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'batch_edit_description',
          ids: [...selectedIds],
          description: batchDescription,
        }),
      });
      const result: ApiResponse = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || '批量编辑失败');
      }
      toast({ title: '批量编辑成功', description: result.message });
      setBatchEditOpen(false);
      setBatchDescription('');
      setSelectedIds(new Set());
      fetchLogs(page);
    } catch (error: any) {
      toast({ variant: 'destructive', title: '批量编辑失败', description: error.message });
    } finally {
      setActionLoading(false);
    }
  };

  // 批量操作：删除（二次确认）
  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    setActionLoading(true);
    try {
      const response = await fetch('/api/admin/points/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'batch_delete',
          ids: [...selectedIds],
        }),
      });
      const result: ApiResponse = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || '批量删除失败');
      }
      toast({ title: '批量删除成功', description: result.message });
      setBatchDeleteOpen(false);
      setSelectedIds(new Set());
      fetchLogs(page);
    } catch (error: any) {
      toast({ variant: 'destructive', title: '批量删除失败', description: error.message });
    } finally {
      setActionLoading(false);
    }
  };

  // 单选/全选切换
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(logs.map((log) => log.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  // 渲染：统计卡片
  const renderStatsCards = () => {
    const cards = [
      {
        title: '总记录',
        value: stats?.totalCount ?? logs.length,
        icon: Activity,
        className: 'text-blue-600',
        bgClass: 'bg-blue-50',
      },
      {
        title: '总获取',
        value: stats?.totalIn ?? 0,
        icon: ArrowDownLeft,
        className: 'text-emerald-600',
        bgClass: 'bg-emerald-50',
        prefix: '+',
      },
      {
        title: '总消费',
        value: stats?.totalOut ?? 0,
        icon: ArrowUpRight,
        className: 'text-rose-600',
        bgClass: 'bg-rose-50',
        prefix: '-',
      },
      {
        title: '净流入',
        value: stats?.netFlow ?? 0,
        icon: Coins,
        className: 'text-violet-600',
        bgClass: 'bg-violet-50',
        prefix: stats && stats.netFlow >= 0 ? '+' : '',
      },
    ];

    return (
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border bg-card px-4 py-2.5 shadow-sm">
        {cards.map((card) => (
          <div key={card.title} className="flex items-center gap-2">
            <card.icon className={cn('h-4 w-4', card.className)} />
            <span className="text-sm text-muted-foreground">{card.title}</span>
            <span className={cn('text-base font-bold', card.className)}>
              {card.prefix}
              {card.value.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    );
  };

  const pageList = buildPageList(page, totalPages);

  return (
    <TooltipProvider>
      <div className="space-y-6 p-1">
        {/* 页面标题 */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">积分流水记录</h1>
            <p className="text-sm text-muted-foreground">查看、筛选、撤销和管理用户积分变动记录</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => fetchLogs(page)} disabled={loading}>
            <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
            刷新
          </Button>
        </div>

        {/* 统计 + 筛选：同行紧凑布局 */}
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          {renderStatsCards()}

          {/* 筛选控件（紧凑一行，与统计信息同行） */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索说明、类型、用户..."
                className="h-9 w-56 pl-9"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>

            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger className="h-9 w-[160px]">
                <SelectValue placeholder="全部类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                {typeConfigs.map((t) => (
                  <SelectItem key={t.type_code} value={t.type_code}>
                    <span className="flex items-center gap-2">
                      <span className={cn('inline-block h-2 w-2 rounded-full', t.badge_class.split(' ')[0])} />
                      {t.type_name}
                      <span className="text-xs text-muted-foreground">({getCategoryLabel(t.category)})</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'h-9 w-[230px] justify-start text-left font-normal',
                    !dateRange && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRange?.from ? (
                    dateRange.to ? (
                      <>
                        {formatDate(dateRange.from)} - {formatDate(dateRange.to)}
                      </>
                    ) : (
                      formatDate(dateRange.from)
                    )
                  ) : (
                    '选择日期范围'
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={dateRange?.from}
                  selected={dateRange}
                  onSelect={setDateRange}
                  numberOfMonths={2}
                />
              </PopoverContent>
            </Popover>

            <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
              <SelectTrigger className="h-9 w-[110px]">
                <SelectValue placeholder="每页条数" />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 50, 100].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} 条/页
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="ghost"
              size="sm"
              className="h-9 px-2 text-muted-foreground"
              onClick={() => {
                setKeyword('');
                setSelectedType('all');
                setDateRange(undefined);
              }}
            >
              清除筛选
            </Button>
            <span className="whitespace-nowrap text-sm text-muted-foreground">
              共 <span className="font-medium text-foreground">{total.toLocaleString()}</span> 条
            </span>
          </div>
        </div>

        {/* 流水表格 */}
        <Card className="overflow-hidden border shadow-sm">
          {/* 批量操作工具栏：选中记录后显示 */}
          {selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-b bg-primary/5 px-4 py-2.5">
              <span className="text-sm font-medium">
                已选 {selectedIds.size} 条记录
              </span>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setBatchEditOpen(true);
                    setBatchDescription('');
                  }}
                  disabled={actionLoading}
                >
                  <Pencil className="mr-1.5 h-4 w-4" />
                  批量编辑说明
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setBatchDeleteOpen(true)}
                  disabled={actionLoading}
                >
                  <Trash2 className="mr-1.5 h-4 w-4" />
                  批量删除
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())} disabled={actionLoading}>
                  取消选择
                </Button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="w-[44px]">
                    <input
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer rounded border-gray-300"
                      checked={logs.length > 0 && logs.every((log) => selectedIds.has(log.id))}
                      onChange={(e) => toggleSelectAll(e.target.checked)}
                      aria-label="全选当前页"
                    />
                  </TableHead>
                  <TableHead className="w-[180px]">用户</TableHead>
                  <TableHead className="w-[120px]">积分变动</TableHead>
                  <TableHead className="w-[140px]">类型</TableHead>
                  <TableHead>说明</TableHead>
                  <TableHead className="w-[160px]">时间</TableHead>
                  <TableHead className="w-[100px] text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center">
                      <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                      <p className="mt-2 text-sm text-muted-foreground">加载中...</p>
                    </TableCell>
                  </TableRow>
                ) : logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center">
                      <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                        <Coins className="h-10 w-10 opacity-20" />
                        <p>暂无积分流水记录</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((log) => {
                    const config = getTypeConfig(log.type, typeMap);
                    const typeName = log.typeName || config.type_name;
                    const badgeClass = log.badgeClass || config.badge_class;
                    const isReversed = !!log.reversedAt;
                    return (
                      <TableRow key={log.id} className={cn('group', isReversed && 'opacity-60')}>
                        <TableCell>
                          <input
                            type="checkbox"
                            className="h-4 w-4 cursor-pointer rounded border-gray-300"
                            checked={selectedIds.has(log.id)}
                            onChange={() => toggleSelect(log.id)}
                            aria-label={`选择记录 ${log.id}`}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{log.userName || log.username || '未知用户'}</span>
                            {(log.userEmail || log.userPhone) && (
                              <span className="text-xs text-muted-foreground">
                                {log.userEmail || log.userPhone}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              'font-mono font-semibold',
                              log.points > 0
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border-rose-200 bg-rose-50 text-rose-700'
                            )}
                          >
                            {log.points > 0 ? '+' : ''}
                            {log.points}
                          </Badge>
                          {typeof log.balanceAfter === 'number' && (
                            <div className="mt-1 text-xs text-muted-foreground">
                              余额 {log.balanceAfter}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge className={cn('cursor-default border-0 font-medium', badgeClass)}>
                                {typeName}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <p className="font-medium">{typeName}</p>
                              <p className="text-xs text-muted-foreground">{config.description}</p>
                            </TooltipContent>
                          </Tooltip>
                          {isReversed && (
                            <Badge variant="secondary" className="mt-1 block w-fit text-xs">
                              已撤销
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <p className="max-w-md truncate text-sm">{log.description || '-'}</p>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDateTime(log.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">操作</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40">
                              <DropdownMenuItem onClick={() => setDetailLog(log)}>
                                <Eye className="mr-2 h-4 w-4" />
                                查看详情
                              </DropdownMenuItem>
                              {config.is_editable && !isReversed && (
                                <DropdownMenuItem
                                  onClick={() => {
                                    setEditLog(log);
                                    setEditDescription(log.description || '');
                                  }}
                                >
                                  <Pencil className="mr-2 h-4 w-4" />
                                  编辑说明
                                </DropdownMenuItem>
                              )}
                              {config.is_reversible && !isReversed && (
                                <DropdownMenuItem onClick={() => setReverseLog(log)}>
                                  <RotateCcw className="mr-2 h-4 w-4" />
                                  撤销
                                </DropdownMenuItem>
                              )}
                              {config.is_deletable && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => setDeleteLog(log)}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    删除
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t bg-muted/30 px-4 py-3">
              <p className="text-sm text-muted-foreground">
                第 <span className="font-medium">{page}</span> / {totalPages} 页，共 {total.toLocaleString()} 条
              </p>
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn('h-9 gap-1 px-2.5', page <= 1 && 'pointer-events-none opacity-50')}
                      onClick={() => setPage(page - 1)}
                      disabled={page <= 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      上一页
                    </Button>
                  </PaginationItem>

                  {pageList.map((item, idx) =>
                    item === 'ellipsis' ? (
                      <PaginationItem key={`ellipsis-${idx}`}>
                        <PaginationEllipsis />
                      </PaginationItem>
                    ) : (
                      <PaginationItem key={item}>
                        <PaginationLink
                          href="#"
                          isActive={item === page}
                          onClick={(e) => {
                            e.preventDefault();
                            setPage(item);
                          }}
                        >
                          {item}
                        </PaginationLink>
                      </PaginationItem>
                    )
                  )}

                  <PaginationItem>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn('h-9 gap-1 px-2.5', page >= totalPages && 'pointer-events-none opacity-50')}
                      onClick={() => setPage(page + 1)}
                      disabled={page >= totalPages}
                    >
                      下一页
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </Card>

        {/* 查看详情弹窗 */}
        <Dialog open={!!detailLog} onOpenChange={() => setDetailLog(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>流水详情</DialogTitle>
              <DialogDescription>查看积分流水记录的完整信息</DialogDescription>
            </DialogHeader>
            {detailLog && (
              <div className="space-y-3 py-2">
                <DetailRow label="记录 ID" value={detailLog.id} />
                <DetailRow label="用户" value={detailLog.username} />
                {detailLog.userEmail && <DetailRow label="邮箱" value={detailLog.userEmail} />}
                {detailLog.userPhone && <DetailRow label="手机号" value={detailLog.userPhone} />}
                <DetailRow
                  label="积分变动"
                  value={`${detailLog.points > 0 ? '+' : ''}${detailLog.points}`}
                  highlight
                />
                {typeof detailLog.balanceAfter === 'number' && (
                  <DetailRow label="变动后余额" value={String(detailLog.balanceAfter)} />
                )}
                <DetailRow
                  label="类型"
                  value={
                    detailLog.typeName ||
                    getTypeConfig(detailLog.type, typeMap).type_name
                  }
                />
                <DetailRow label="说明" value={detailLog.description || '-'} />
                {detailLog.referenceId && <DetailRow label="关联 ID" value={detailLog.referenceId} />}
                <DetailRow label="创建时间" value={formatDateTime(detailLog.createdAt)} />
                {detailLog.reversedAt && (
                  <DetailRow
                    label="撤销信息"
                    value={`${formatDateTime(detailLog.reversedAt)} 由 ${detailLog.reversedBy || '管理员'} 撤销`}
                  />
                )}
                {detailLog.metadata && Object.keys(detailLog.metadata).length > 0 && (
                  <DetailRow
                    label="元数据"
                    value={JSON.stringify(detailLog.metadata, null, 2)}
                    monospace
                  />
                )}
              </div>
            )}
            <DialogFooter>
              <Button onClick={() => setDetailLog(null)}>关闭</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 编辑说明弹窗 */}
        <Dialog open={!!editLog} onOpenChange={() => setEditLog(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>编辑说明</DialogTitle>
              <DialogDescription>修改该条积分流水的说明信息</DialogDescription>
            </DialogHeader>
            <Textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder="请输入说明"
              rows={4}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditLog(null)} disabled={actionLoading}>
                取消
              </Button>
              <Button onClick={handleEditDescription} disabled={actionLoading}>
                {actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                保存
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 批量编辑说明弹窗 */}
        <Dialog open={batchEditOpen} onOpenChange={setBatchEditOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>批量编辑说明</DialogTitle>
              <DialogDescription>
                将选中的 {selectedIds.size} 条记录统一更新说明
              </DialogDescription>
            </DialogHeader>
            <Textarea
              value={batchDescription}
              onChange={(e) => setBatchDescription(e.target.value)}
              placeholder="请输入新的说明内容"
              rows={4}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setBatchEditOpen(false)} disabled={actionLoading}>
                取消
              </Button>
              <Button onClick={handleBatchEdit} disabled={actionLoading || !batchDescription.trim()}>
                {actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                确认批量编辑
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 批量删除确认 */}
        <AlertDialog open={batchDeleteOpen} onOpenChange={setBatchDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认删除选中的 {selectedIds.size} 条记录？</AlertDialogTitle>
              <AlertDialogDescription>
                删除后这些流水记录将从列表中移除。已产生的积分余额不会自动回滚，如需调整请使用撤销功能。此操作不可恢复。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={actionLoading}>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleBatchDelete}
                disabled={actionLoading}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                确认删除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* 撤销确认 */}
        <AlertDialog open={!!reverseLog} onOpenChange={() => setReverseLog(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认撤销该笔流水？</AlertDialogTitle>
              <AlertDialogDescription>
                撤销将为用户 {reverseLog?.username} 反向调整 {Math.abs(reverseLog?.points || 0)} 积分，并生成一条新的反向流水记录。此操作不可恢复。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={actionLoading}>取消</AlertDialogCancel>
              <AlertDialogAction onClick={handleReverse} disabled={actionLoading}>
                {actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                确认撤销
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* 删除确认 */}
        <AlertDialog open={!!deleteLog} onOpenChange={() => setDeleteLog(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认删除该条记录？</AlertDialogTitle>
              <AlertDialogDescription>
                删除后该流水记录将从列表中移除。已产生的积分余额不会自动回滚，如需调整请使用撤销功能。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={actionLoading}>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={actionLoading}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                确认删除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}

// ============================================================
// 详情行组件
// ============================================================
function DetailRow({
  label,
  value,
  highlight = false,
  monospace = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  monospace?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:gap-3">
      <span className="min-w-[80px] text-sm text-muted-foreground">{label}</span>
      <span
        className={cn(
          'break-all text-sm',
          highlight && 'font-semibold text-primary',
          monospace && 'whitespace-pre-wrap font-mono text-xs'
        )}
      >
        {value}
      </span>
    </div>
  );
}
