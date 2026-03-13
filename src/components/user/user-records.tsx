'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface UserRecordProps {
  userId: number;
}

interface UploadRecord {
  id: number;
  type: string;
  title: string;
  status: string;
  points_awarded: number;
  created_at: string;
}

export default function UserRecord({ userId }: UserRecordProps) {
  const [records, setRecords] = useState<UploadRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRecords();
  }, [userId]);

  const loadRecords = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/user/uploads?user_id=${userId}`);
      const data = await res.json();

      if (data.success) {
        setRecords(data.records || []);
      }
    } catch (error) {
      console.error('[UserRecord] 加载失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTypeLabel = (type: string) => {
    const map: Record<string, string> = {
      upload_price: '产品价格',
      upload_doc: '技术文档',
      upload_case: '成功案例',
      upload_drawing: '工程图纸',
    };
    return map[type] || type;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-500">已通过</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-500">待审核</Badge>;
      case 'rejected':
        return <Badge className="bg-red-500">已拒绝</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-gray-500">加载中...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>上传记录</CardTitle>
      </CardHeader>
      <CardContent>
        {records.length === 0 ? (
          <div className="text-center py-8 text-gray-500">暂无上传记录</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>类型</TableHead>
                <TableHead>标题</TableHead>
                <TableHead>积分奖励</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((record) => (
                <TableRow key={record.id}>
                  <TableCell>{getTypeLabel(record.type)}</TableCell>
                  <TableCell className="max-w-xs truncate">{record.title}</TableCell>
                  <TableCell>
                    {record.points_awarded > 0 ? (
                      <span className="text-green-600 font-bold">+{record.points_awarded}</span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </TableCell>
                  <TableCell>{getStatusBadge(record.status)}</TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {new Date(record.created_at).toLocaleDateString('zh-CN')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
