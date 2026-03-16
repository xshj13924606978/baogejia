'use client';

import React, { useState } from 'react';
import { Package2, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { DuplicateCheckConfig } from '@/components/admin/duplicate-check-config';
import { ImportLogsViewer } from '@/components/admin/import-logs-viewer';
import { ProductList } from '@/components/admin/product-list';

export default function ProductsPage() {
  const [configOpen, setConfigOpen] = useState(false);

  return (
    <div className="space-y-6">
      {/* 页面标题区 - 优化视觉层次 */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Package2 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">产品库管理</h1>
            <p className="text-sm text-muted-foreground mt-1">管理产品信息、配置判重规则、查看导入记录</p>
          </div>
        </div>

        {/* 判重字段配置按钮 */}
        <Dialog open={configOpen} onOpenChange={setConfigOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="gap-2">
              <Settings className="h-4 w-4" />
              配置判重字段
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>判重字段配置</DialogTitle>
            </DialogHeader>
            <DuplicateCheckConfig />
          </DialogContent>
        </Dialog>
      </div>

      {/* 单列布局 - 导入日志 + 产品列表 */}
      <div className="flex flex-col gap-6">
        {/* 导入日志 */}
        <div>
          <ImportLogsViewer />
        </div>

        {/* 产品列表区域 */}
        <div>
          <ProductList className="shadow-sm border-muted/50 h-full flex flex-col" />
        </div>
      </div>
    </div>
  );
}
