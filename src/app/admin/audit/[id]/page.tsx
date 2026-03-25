'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  ArrowLeft, CheckCircle, XCircle, Loader2, Download,
  FileText, User, Calendar, Clock, Eye,
} from 'lucide-react';
import { toast } from 'sonner';

interface AuditDetail {
  id: string;
  type: string;
  title: string;
  description: string;
  fileName: string;
  fileKey: string;
  fileUrl: string;
  fileSize: number;
  fileType: string;
  status: string;
  uploaderName: string;
  createdAt: string;
}

const TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  price: { label: '价格库', color: 'bg-blue-100 text-blue-800' },
  document: { label: '文档库', color: 'bg-green-100 text-green-800' },
  case: { label: '案例库', color: 'bg-purple-100 text-purple-800' },
  standard: { label: '标准库', color: 'bg-orange-100 text-orange-800' },
  drawing: { label: '图纸库', color: 'bg-cyan-100 text-cyan-800' },
  quota: { label: '定额库', color: 'bg-pink-100 text-pink-800' },
  other: { label: '其他', color: 'bg-gray-100 text-gray-800' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: '待审核', color: 'bg-yellow-100 text-yellow-800', icon: <Clock className="h-3.5 w-3.5" /> },
  approved: { label: '已通过', color: 'bg-green-100 text-green-800', icon: <CheckCircle className="h-3.5 w-3.5" /> },
  rejected: { label: '已拒绝', color: 'bg-red-100 text-red-800', icon: <XCircle className="h-3.5 w-3.5" /> },
};

function formatFileSize(bytes: number): string {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AuditDetailPage() {
  const params = useParams();
  const router = useRouter();
  const auditId = params.id;

  const [detail, setDetail] = useState<AuditDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const loadDetail = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/knowledge/${auditId}`);
      const data = await res.json();
      if (data.success) setDetail(data.data);
      else { toast.error('记录不存在'); router.push('/admin/audit'); }
    } catch { toast.error('网络错误'); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (auditId) loadDetail(); }, [auditId]);

  const handleApprove = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/knowledge/${auditId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      });
      const data = await res.json();
      if (data.success) { toast.success('审核通过'); loadDetail(); }
      else toast.error(data.error || '操作失败');
    } catch { toast.error('网络错误'); }
    finally { setSaving(false); }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) { toast.error('请填写拒绝原因'); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/knowledge/${auditId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'rejected', reject_reason: rejectReason.trim() }),
      });
      const data = await res.json();
      if (data.success) { toast.success('已拒绝'); setRejectOpen(false); setRejectReason(''); loadDetail(); }
      else toast.error(data.error || '操作失败');
    } catch { toast.error('网络错误'); }
    finally { setSaving(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">加载审核详情...</span>
      </div>
    );
  }

  if (!detail) return null;

  const st = STATUS_CONFIG[detail.status] || STATUS_CONFIG.pending;
  const tc = TYPE_CONFIG[detail.type] || TYPE_CONFIG.other;

  return (
    <div className="space-y-6">
      {/* 标题栏 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{detail.title}</h1>
              <Badge className={`${st.color} flex items-center gap-1`}>{st.icon}{st.label}</Badge>
            </div>
            <p className="text-gray-500 text-sm">ID: {detail.id?.slice(0, 8)}...</p>
          </div>
        </div>
        {detail.status === 'pending' && (
          <div className="flex gap-2">
            <Button onClick={handleApprove} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
              通过
            </Button>
            <Button variant="outline" className="text-red-600" onClick={() => setRejectOpen(true)} disabled={saving}>
              <XCircle className="h-4 w-4 mr-2" />
              拒绝
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* 基本信息 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">基本信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <span className="text-gray-500 w-20 shrink-0">类型</span>
              <Badge variant="outline" className={tc.color}>{tc.label}</Badge>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-gray-500 w-20 shrink-0">状态</span>
              <Badge variant="outline" className={st.color}>{st.label}</Badge>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <User className="h-4 w-4 text-gray-400" />
              <span className="text-gray-500 w-16 shrink-0">上传者</span>
              <span className="font-medium">{detail.uploaderName || '-'}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Calendar className="h-4 w-4 text-gray-400" />
              <span className="text-gray-500 w-16 shrink-0">提交时间</span>
              <span>{detail.createdAt ? new Date(detail.createdAt).toLocaleString('zh-CN') : '-'}</span>
            </div>
            {detail.description && (
              <div className="pt-2 border-t">
                <p className="text-xs text-gray-500 mb-1">描述</p>
                <p className="text-sm">{detail.description}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 文件信息 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">文件信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {detail.fileName ? (
              <>
                <div className="flex items-center gap-3 text-sm">
                  <FileText className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-500 w-20 shrink-0">文件名</span>
                  <span className="font-medium">{detail.fileName}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-gray-500 w-20 shrink-0">文件大小</span>
                  <span>{formatFileSize(detail.fileSize)}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-gray-500 w-20 shrink-0">文件类型</span>
                  <span>{detail.fileType || '-'}</span>
                </div>
                {detail.fileUrl && (
                  <Button variant="outline" size="sm" asChild className="mt-2">
                    <a href={detail.fileUrl} target="_blank" rel="noopener noreferrer">
                      <Download className="h-4 w-4 mr-2" />
                      下载文件
                    </a>
                  </Button>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">无附件文件</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 拒绝对话框 */}
      <Dialog open={rejectOpen} onOpenChange={(o) => !saving && setRejectOpen(o)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>拒绝审核</DialogTitle>
            <DialogDescription>请填写拒绝原因，将通知上传者</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label>拒绝原因 *</Label>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="请说明拒绝原因..."
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={saving}>取消</Button>
            <Button variant="destructive" onClick={handleReject} disabled={saving || !rejectReason.trim()}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              确认拒绝
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
