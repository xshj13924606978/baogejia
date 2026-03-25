'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, BarChart3, FileText, BookOpen, Briefcase, Ruler, Image, Archive, Eye } from 'lucide-react';
import { toast } from 'sonner';

const CATEGORIES = [
  { type: 'price', label: '产品价格库', icon: BarChart3, color: 'bg-blue-100 text-blue-600', badgeColor: 'bg-blue-100 text-blue-700', href: '/admin/knowledge-center/price-library' },
  { type: 'document', label: '技术文档库', icon: FileText, color: 'bg-green-100 text-green-600', badgeColor: 'bg-green-100 text-green-700', href: '/admin/knowledge-center/document-library' },
  { type: 'case', label: '案例库', icon: Briefcase, color: 'bg-purple-100 text-purple-600', badgeColor: 'bg-purple-100 text-purple-700', href: '/admin/knowledge-center/case-library' },
  { type: 'standard', label: '标准规范库', icon: BookOpen, color: 'bg-orange-100 text-orange-600', badgeColor: 'bg-orange-100 text-orange-700', href: '/admin/knowledge-center/standard-library' },
  { type: 'drawing', label: '图纸图片库', icon: Image, color: 'bg-cyan-100 text-cyan-600', badgeColor: 'bg-cyan-100 text-cyan-700', href: '/admin/knowledge-center/drawing-library' },
  { type: 'quota', label: '定额库', icon: Ruler, color: 'bg-pink-100 text-pink-600', badgeColor: 'bg-pink-100 text-pink-700', href: '/admin/knowledge-center/quota-library' },
];

interface CategoryCount {
  type: string;
  total: number;
  pending: number;
  approved: number;
  rejected: number;
}

export default function KnowledgeCategoryPage() {
  const [counts, setCounts] = useState<CategoryCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // 并行查询所有分类的统计
        const statuses = ['pending', 'approved', 'rejected'];
        const results = await Promise.all(
          CATEGORIES.map(async (cat) => {
            const [totalRes, ...statusRes] = await Promise.all([
              fetch(`/api/admin/knowledge?type=${cat.type}&limit=1`),
              ...statuses.map(s => fetch(`/api/admin/knowledge?type=${cat.type}&status=${s}&limit=1`)),
            ]);
            const totalData = await totalRes.json();
            const statusDataArr = await Promise.all(statusRes.map(r => r.json()));
            return {
              type: cat.type,
              total: totalData.total || 0,
              pending: statusDataArr[0]?.total || 0,
              approved: statusDataArr[1]?.total || 0,
              rejected: statusDataArr[2]?.total || 0,
            };
          })
        );
        setCounts(results);
      } catch {
        toast.error('加载分类统计失败');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">加载分类数据...</span>
      </div>
    );
  }

  const totalCount = counts.reduce((s, c) => s + c.total, 0);
  const totalPending = counts.reduce((s, c) => s + c.pending, 0);
  const getCat = (type: string) => counts.find(c => c.type === type);

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div>
        <h1 className="text-2xl font-bold">资料分类管理</h1>
        <p className="text-gray-500">查看和管理资料中心的 6 个分类库</p>
      </div>

      {/* 总览 */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="bg-blue-100 p-2.5 rounded-lg">
              <Archive className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">资料总数</p>
              <p className="text-xl font-bold">{totalCount.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="bg-green-100 p-2.5 rounded-lg">
              <BarChart3 className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">已发布</p>
              <p className="text-xl font-bold text-green-600">{counts.reduce((s, c) => s + c.approved, 0).toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="bg-yellow-100 p-2.5 rounded-lg">
              <FileText className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">待审核</p>
              <p className="text-xl font-bold text-yellow-600">{totalPending.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 分类卡片网格 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {CATEGORIES.map((cat) => {
          const count = getCat(cat.type);
          const Icon = cat.icon;
          return (
            <Card key={cat.type} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${cat.color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <CardTitle className="text-base">{cat.label}</CardTitle>
                  </div>
                  <Badge variant="outline" className={cat.badgeColor}>
                    {cat.type}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-2 text-center mb-3">
                  <div className="p-2 rounded bg-gray-50">
                    <p className="text-lg font-bold">{count?.total || 0}</p>
                    <p className="text-xs text-gray-500">全部</p>
                  </div>
                  <div className="p-2 rounded bg-green-50">
                    <p className="text-lg font-bold text-green-600">{count?.approved || 0}</p>
                    <p className="text-xs text-gray-500">已通过</p>
                  </div>
                  <div className="p-2 rounded bg-yellow-50">
                    <p className="text-lg font-bold text-yellow-600">{count?.pending || 0}</p>
                    <p className="text-xs text-gray-500">待审核</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-400">
                    占比 {totalCount > 0 ? ((count?.total || 0) / totalCount * 100).toFixed(1) : 0}%
                  </p>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => { setSelectedType(cat.type); setDetailOpen(true); }}>
                      <Eye className="h-3.5 w-3.5 mr-1" />
                      详情
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 分类汇总表 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">分类汇总</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>分类</TableHead>
                  <TableHead>类型标识</TableHead>
                  <TableHead className="text-right">全部</TableHead>
                  <TableHead className="text-right">已通过</TableHead>
                  <TableHead className="text-right">待审核</TableHead>
                  <TableHead className="text-right">已拒绝</TableHead>
                  <TableHead className="text-right">占比</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {CATEGORIES.map((cat) => {
                  const count = getCat(cat.type);
                  return (
                    <TableRow key={cat.type}>
                      <TableCell className="font-medium">{cat.label}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{cat.type}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">{count?.total || 0}</TableCell>
                      <TableCell className="text-right text-green-600">{count?.approved || 0}</TableCell>
                      <TableCell className="text-right text-yellow-600">{count?.pending || 0}</TableCell>
                      <TableCell className="text-right text-red-600">{count?.rejected || 0}</TableCell>
                      <TableCell className="text-right text-gray-500">
                        {totalCount > 0 ? ((count?.total || 0) / totalCount * 100).toFixed(1) : 0}%
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 详情弹窗 - 跳转到对应资料库 */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>查看资料库</DialogTitle>
            <DialogDescription>跳转到对应的资料库管理页面</DialogDescription>
          </DialogHeader>
          {selectedType && (
            <div className="space-y-2">
              {CATEGORIES.filter(c => c.type === selectedType).map(cat => (
                <Button key={cat.type} variant="outline" className="w-full justify-start gap-3 h-12" onClick={() => window.location.href = cat.href}>
                  <div className={`p-1.5 rounded ${cat.color}`}>
                    <cat.icon className="h-4 w-4" />
                  </div>
                  <span>{cat.label}</span>
                  <span className="ml-auto text-sm text-gray-400">{getCat(cat.type)?.total || 0} 条</span>
                </Button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
