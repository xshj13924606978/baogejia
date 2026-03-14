'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ImportLogsViewer } from '@/components/admin/import-logs-viewer';
import { FileText } from 'lucide-react';

export default function ImportLogsPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6" />
            导入日志
          </h1>
          <p className="text-muted-foreground mt-1">
            查看产品导入的历史记录和详细信息
          </p>
        </div>

        <ImportLogsViewer limit={50} />

        <Card>
          <CardHeader>
            <CardTitle>使用说明</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>• <strong>状态筛选</strong>：可以按"全部"、"完成"、"失败"筛选日志</p>
              <p>• <strong>成功数</strong>：成功导入的产品数量</p>
              <p>• <strong>跳过数</strong>：因重复被跳过的产品数量</p>
              <p>• <strong>失败数</strong>：导入失败的产品数量</p>
              <p>• <strong>成功率</strong>：成功导入的产品占总数的百分比</p>
              <p>• <strong>耗时</strong>：导入过程所花费的时间</p>
              <p>• <strong>导入时间</strong>：导入操作发生的时间</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
