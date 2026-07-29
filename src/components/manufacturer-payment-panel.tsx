'use client';

import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertCircle,
  TrendingUp,
  DollarSign,
  ShoppingCart,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ManufacturerPayment, ManufacturerPaymentResponse } from '@/types/manufacturer-payment';

interface ManufacturerPaymentPanelProps {
  compact?: boolean;
}

export default function ManufacturerPaymentPanel({
  compact = false,
}: ManufacturerPaymentPanelProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ManufacturerPaymentResponse['data'] | null>(null);
  const [category, setCategory] = useState<string>('all');
  const [expanded, setExpanded] = useState(!compact);
  const [showFullScreen, setShowFullScreen] = useState(false);

  const loadRankings = async () => {
    try {
      setLoading(true);
      setError(null);

      const url = new URL('/api/manufacturer/payment', window.location.origin);
      if (category && category !== 'all') {
        url.searchParams.set('category', category);
      }


      const response = await fetch(url.toString());
      const result: ManufacturerPaymentResponse = await response.json();

      if (!response.ok) {
        throw new Error(result.message || '加载失败');
      }

      if (result.success && result.data) {
        setData(result.data);
      } else {
        throw new Error(result.error || '数据格式错误');
      }
    } catch (err) {
      console.error('[Manufacturer] 加载失败:', err);
      setError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRankings();
  }, [category]);

  const _formatAmount = (amount: number) => {
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: 'CNY',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatCompactAmount = (amount: number) => {
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: 'CNY',
      minimumFractionDigits: 0,
      notation: 'compact',
      compactDisplay: 'short',
    }).format(amount);
  };

  const _getStatusBadge = (status?: string) => {
    switch (status) {
      case 'completed':
        return (
          <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/20 border-0 text-xs">
            已完成
          </Badge>
        );
      case 'processing':
        return (
          <Badge className="bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 border-0 text-xs">
            处理中
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="outline" className="border-yellow-500 text-yellow-600 text-xs">
            待处理
          </Badge>
        );
      case 'failed':
        return (
          <Badge
            variant="destructive"
            className="bg-red-500/10 text-red-600 hover:bg-red-500/20 border-0 text-xs"
          >
            失败
          </Badge>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <Card className={compact ? 'border-0 shadow-none' : ''}>
        <CardHeader className={compact ? 'px-2 py-3' : ''}>
          <CardTitle className="text-sm">厂商支付排行</CardTitle>
          <CardDescription className="text-xs">加载中...</CardDescription>
        </CardHeader>
        <CardContent className={compact ? 'px-2' : ''}>
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={compact ? 'border-0 shadow-none' : ''}>
        <CardHeader className={compact ? 'px-2 py-3' : ''}>
          <CardTitle className="text-sm">厂商支付排行</CardTitle>
        </CardHeader>
        <CardContent className={compact ? 'px-2' : ''}>
          <Alert variant="destructive" className="py-2">
            <AlertCircle className="h-3 w-3" />
            <AlertTitle className="text-xs">加载失败</AlertTitle>
            <AlertDescription className="text-xs">
              {error}
              <button onClick={loadRankings} className="ml-2 text-blue-500 hover:underline text-xs">
                重试
              </button>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return null;
  }

  // 紧凑模式
  if (compact) {
    return (
      <div className="space-y-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
        >
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">厂商支付排行</span>
            <Badge variant="secondary" className="text-xs">
              {data.rankings.length}家厂商
            </Badge>
          </div>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {expanded && (
          <div className="pl-6 space-y-2 animate-in slide-in-from-top-2">
            <div className="grid grid-cols-3 gap-1">
              <div className="bg-primary/5 rounded p-1.5 text-center">
                <p className="text-[10px] text-muted-foreground">总支付</p>
                <p className="text-xs font-bold">
                  {formatCompactAmount(data.summary.total_amount)}
                </p>
              </div>
              <div className="bg-primary/5 rounded p-1.5 text-center">
                <p className="text-[10px] text-muted-foreground">总订单</p>
                <p className="text-xs font-bold">{data.summary.total_orders}</p>
              </div>
              <div className="bg-primary/5 rounded p-1.5 text-center">
                <p className="text-[10px] text-muted-foreground">平均</p>
                <p className="text-xs font-bold">{formatCompactAmount(data.summary.avg_amount)}</p>
              </div>
            </div>

            <div className="space-y-1 max-h-[200px] overflow-y-auto">
              {data.rankings.slice(0, 5).map((item, index) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between text-xs py-1 border-b border-gray-100 dark:border-gray-800 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${
                        index === 0
                          ? 'bg-yellow-100 text-yellow-700'
                          : index === 1
                            ? 'bg-gray-100 text-gray-700'
                            : index === 2
                              ? 'bg-orange-100 text-orange-700'
                              : 'bg-gray-50 text-gray-600'
                      }`}
                    >
                      {index + 1}
                    </span>
                    <span className="truncate max-w-[80px]">{item.manufacturer_name}</span>
                  </div>
                  <span className="font-medium">{formatCompactAmount(item.total_amount)}</span>
                </div>
              ))}
            </div>

            {data.rankings.length > 5 && (
              <button
                onClick={() => setShowFullScreen(true)}
                className="w-full text-center text-xs text-primary hover:underline py-1"
              >
                查看全部 {data.rankings.length} 家厂商
              </button>
            )}
          </div>
        )}

        {/* 全屏弹窗 - 修复重叠 */}
        {showFullScreen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <Card className="w-full max-w-4xl max-h-[80vh] overflow-auto relative">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>厂商支付排行</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setShowFullScreen(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <CardDescription>按支付金额排序的厂商排行榜</CardDescription>
              </CardHeader>
              <CardContent>
                <ManufacturerPaymentFullTable
                  data={data}
                  category={category}
                  setCategory={setCategory}
                />
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    );
  }

  // 完整模式
  return <ManufacturerPaymentFullTable data={data} category={category} setCategory={setCategory} />;
}

// 完整表格组件
function ManufacturerPaymentFullTable({ data, category, setCategory }: any) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>厂商支付排行</CardTitle>
            <CardDescription>按支付金额排序的厂商排行榜</CardDescription>
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="选择类别" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部类别</SelectItem>
              <SelectItem value="搅拌设备">搅拌设备</SelectItem>
              <SelectItem value="泵类">泵类</SelectItem>
              <SelectItem value="阀门">阀门</SelectItem>
              <SelectItem value="电机">电机</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">总支付金额</p>
                  <p className="text-lg font-bold">
                    {new Intl.NumberFormat('zh-CN', {
                      style: 'currency',
                      currency: 'CNY',
                      minimumFractionDigits: 0,
                      notation: 'compact',
                    }).format(data.summary.total_amount)}
                  </p>
                </div>
                <DollarSign className="h-5 w-5 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">总订单数</p>
                  <p className="text-lg font-bold">{data.summary.total_orders}</p>
                </div>
                <ShoppingCart className="h-5 w-5 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">平均支付金额</p>
                  <p className="text-lg font-bold">
                    {new Intl.NumberFormat('zh-CN', {
                      style: 'currency',
                      currency: 'CNY',
                      minimumFractionDigits: 0,
                      notation: 'compact',
                    }).format(data.summary.avg_amount)}
                  </p>
                </div>
                <TrendingUp className="h-5 w-5 text-purple-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 text-xs">排名</TableHead>
                <TableHead className="text-xs">厂商名称</TableHead>
                <TableHead className="text-xs w-20">类别</TableHead>
                <TableHead className="text-right text-xs">支付金额</TableHead>
                <TableHead className="text-right text-xs">订单数</TableHead>
                <TableHead className="text-right text-xs">平均金额</TableHead>
                <TableHead className="text-xs w-16">状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rankings.map((item: ManufacturerPayment, index: number) => {
                const getStatusBadge = (status?: string) => {
                  switch (status) {
                    case 'completed':
                      return (
                        <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/20 border-0 text-xs">
                          已完成
                        </Badge>
                      );
                    case 'processing':
                      return (
                        <Badge className="bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 border-0 text-xs">
                          处理中
                        </Badge>
                      );
                    case 'pending':
                      return (
                        <Badge
                          variant="outline"
                          className="border-yellow-500 text-yellow-600 text-xs"
                        >
                          待处理
                        </Badge>
                      );
                    case 'failed':
                      return (
                        <Badge
                          variant="destructive"
                          className="bg-red-500/10 text-red-600 hover:bg-red-500/20 border-0 text-xs"
                        >
                          失败
                        </Badge>
                      );
                    default:
                      return null;
                  }
                };

                return (
                  <TableRow key={item.id}>
                    <TableCell className="text-xs">
                      <span
                        className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs ${
                          index === 0
                            ? 'bg-yellow-100 text-yellow-700'
                            : index === 1
                              ? 'bg-gray-100 text-gray-700'
                              : index === 2
                                ? 'bg-orange-100 text-orange-700'
                                : 'bg-gray-50 text-gray-600'
                        }`}
                      >
                        {index + 1}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs font-medium">{item.manufacturer_name}</TableCell>
                    <TableCell className="text-xs">{item.category || '-'}</TableCell>
                    <TableCell className="text-right text-xs font-medium">
                      {new Intl.NumberFormat('zh-CN', {
                        style: 'currency',
                        currency: 'CNY',
                        minimumFractionDigits: 0,
                        notation: 'compact',
                      }).format(item.total_amount)}
                    </TableCell>
                    <TableCell className="text-right text-xs">{item.order_count}</TableCell>
                    <TableCell className="text-right text-xs">
                      {item.avg_amount
                        ? new Intl.NumberFormat('zh-CN', {
                            style: 'currency',
                            currency: 'CNY',
                            minimumFractionDigits: 0,
                            notation: 'compact',
                          }).format(item.avg_amount)
                        : '-'}
                    </TableCell>
                    <TableCell className="text-xs">{getStatusBadge(item.status)}</TableCell>
                  </TableRow>
                );
              })}

              {data.rankings.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-6 text-xs text-muted-foreground">
                    暂无数据
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      <CardFooter className="text-xs text-muted-foreground border-t pt-3">
        数据更新于 {new Date().toLocaleString('zh-CN')}
      </CardFooter>
    </Card>
  );
}
