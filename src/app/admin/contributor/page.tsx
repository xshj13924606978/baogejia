'use client';

import { useEffect, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, RefreshCw, QrCode, CheckCircle2, XCircle, Users, FileText, Gift } from 'lucide-react';
import {
  CONTRIBUTOR_TYPE_LABELS,
  CONTRIBUTOR_POINTS_RULES,
  UPLOAD_STATUS_LABELS,
  ContributorType,
  UploadStatus,
} from '@/lib/contributor/types';

interface Contributor {
  id: string;
  user_id: string | null;
  phone: string | null;
  email: string | null;
  name: string | null;
  created_at: string;
  last_active_at: string | null;
}

interface Upload {
  id: string;
  contributor_id: string;
  type: string;
  data: Record<string, unknown>;
  files: string[];
  status: string;
  reviewer_id: string | null;
  review_comment: string | null;
  reviewed_at: string | null;
  points_awarded: number;
  created_at: string;
  contributors?: { name: string | null; email: string | null; phone: string | null } | null;
}

export default function AdminContributorPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('pending');
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [loadingContributors, setLoadingContributors] = useState(false);
  const [loadingUploads, setLoadingUploads] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<Upload | null>(null);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [qrUrl, setQrUrl] = useState('');
  const [qrLoading, setQrLoading] = useState(false);

  const loadContributors = async () => {
    setLoadingContributors(true);
    try {
      const res = await fetch('/api/admin/contributor/list');
      const data = await res.json();
      if (data.success) setContributors(data.contributors || []);
      else toast({ title: '加载失败', description: data.error || '获取贡献者列表失败', variant: 'destructive' });
    } catch {
      toast({ title: '加载失败', description: '网络错误', variant: 'destructive' });
    } finally {
      setLoadingContributors(false);
    }
  };

  const loadUploads = async (status = activeTab) => {
    setLoadingUploads(true);
    try {
      const res = await fetch(`/api/admin/uploads/pending?status=${status}`);
      const data = await res.json();
      if (data.success) setUploads(data.uploads || []);
      else toast({ title: '加载失败', description: data.error || '获取资料列表失败', variant: 'destructive' });
    } catch {
      toast({ title: '加载失败', description: '网络错误', variant: 'destructive' });
    } finally {
      setLoadingUploads(false);
    }
  };

  useEffect(() => {
    loadUploads();
  }, []);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    if (value === 'contributors') loadContributors();
    else if (value === 'qrcode') generateQr();
    else loadUploads(value);
  };

  const generateQr = async () => {
    setQrLoading(true);
    try {
      const res = await fetch('/api/admin/qrcode/generate');
      const data = await res.json();
      if (data.success) setQrUrl(data.url);
      else toast({ title: '生成失败', description: data.error || '生成二维码失败', variant: 'destructive' });
    } catch {
      toast({ title: '生成失败', description: '网络错误', variant: 'destructive' });
    } finally {
      setQrLoading(false);
    }
  };

  const submitReview = async (status: UploadStatus) => {
    if (!reviewTarget) return;
    setReviewing(true);
    try {
      const res = await fetch(`/api/admin/uploads/${reviewTarget.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, comment: reviewComment }),
      });
      const data = await res.json();
      if (data.success) {
        toast({
          title: status === 'approved' ? '已通过' : '已拒绝',
          description:
            status === 'approved'
              ? `审核通过，已发放 ${reviewTarget.points_awarded || getPoints(reviewTarget.type)} 积分奖励`
              : '资料已拒绝',
        });
        setReviewTarget(null);
        setReviewComment('');
        loadUploads(activeTab);
      } else {
        toast({ title: '操作失败', description: data.error || '审核失败', variant: 'destructive' });
      }
    } catch {
      toast({ title: '操作失败', description: '网络错误', variant: 'destructive' });
    } finally {
      setReviewing(false);
    }
  };

  const getPoints = (type: string): number => {
    const rule = CONTRIBUTOR_POINTS_RULES[type as ContributorType];
    return rule ? rule.points : 0;
  };

  const renderUploadData = (upload: Upload) => {
    const data = upload.data || {};
    return (
      <div className="space-y-1 text-sm">
        {Object.entries(data).map(([key, value]) => {
          if (value === null || value === undefined || value === '') return null;
          return (
            <div key={key} className="flex gap-2">
              <span className="text-gray-500 shrink-0 w-24">{key}:</span>
              <span className="text-gray-700 break-all">{String(value)}</span>
            </div>
          );
        })}
        {upload.files && upload.files.length > 0 && (
          <div className="flex gap-2">
            <span className="text-gray-500 shrink-0 w-24">附件:</span>
            <span className="text-sky-600">{upload.files.length} 个文件已上传</span>
          </div>
        )}
      </div>
    );
  };

  const downloadQr = () => {
    const canvas = document.querySelector('#contributor-qr canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'contributor-upload-qr.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">资料贡献管理</h1>
          <p className="text-sm text-gray-500 mt-1">管理资料贡献者、审核上传资料、生成上传入口二维码</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="pending">
            <FileText className="w-4 h-4 mr-1" />待审核
          </TabsTrigger>
          <TabsTrigger value="approved">
            <CheckCircle2 className="w-4 h-4 mr-1" />已通过
          </TabsTrigger>
          <TabsTrigger value="rejected">
            <XCircle className="w-4 h-4 mr-1" />已拒绝
          </TabsTrigger>
          <TabsTrigger value="contributors">
            <Users className="w-4 h-4 mr-1" />贡献者
          </TabsTrigger>
          <TabsTrigger value="qrcode">
            <QrCode className="w-4 h-4 mr-1" />二维码
          </TabsTrigger>
        </TabsList>

        {/* 待审核/已通过/已拒绝 */}
        {['pending', 'approved', 'rejected'].includes(activeTab) && (
          <TabsContent value={activeTab} className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">{UPLOAD_STATUS_LABELS[activeTab as UploadStatus]}资料</p>
              <Button variant="outline" size="sm" onClick={() => loadUploads(activeTab)}>
                <RefreshCw className="w-4 h-4 mr-1" />刷新
              </Button>
            </div>
            {loadingUploads ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : uploads.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-gray-400">暂无资料</CardContent>
              </Card>
            ) : (
              uploads.map((upload) => (
                <Card key={upload.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge>{CONTRIBUTOR_TYPE_LABELS[upload.type as ContributorType] || upload.type}</Badge>
                        <Badge variant={upload.status === 'approved' ? 'default' : upload.status === 'rejected' ? 'destructive' : 'outline'}>
                          {UPLOAD_STATUS_LABELS[upload.status as UploadStatus]}
                        </Badge>
                      </div>
                      <span className="text-xs text-gray-400">
                        {new Date(upload.created_at).toLocaleString()}
                      </span>
                    </div>
                    <CardDescription className="flex items-center gap-3">
                      <span>贡献者：{upload.contributors?.name || upload.contributors?.email || upload.contributors?.phone || '未知'}</span>
                      {upload.points_awarded > 0 && (
                        <span className="text-green-600 flex items-center gap-1">
                          <Gift className="w-3 h-3" />已发放 {upload.points_awarded} 积分
                        </span>
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pb-4">
                    {renderUploadData(upload)}
                    {upload.review_comment && (
                      <p className="mt-2 text-sm text-gray-500">
                        <span className="font-medium">审核意见：</span>
                        {upload.review_comment}
                      </p>
                    )}
                  </CardContent>
                  {upload.status === 'pending' && (
                    <CardContent className="pb-4">
                      <div className="flex items-center gap-2 pt-3 border-t">
                        <Button size="sm" onClick={() => setReviewTarget(upload)}>
                          <CheckCircle2 className="w-4 h-4 mr-1" />审核
                        </Button>
                        <span className="text-xs text-gray-400 ml-2">
                          审核通过奖励 {getPoints(upload.type)} 积分
                        </span>
                      </div>
                    </CardContent>
                  )}
                </Card>
              ))
            )}
          </TabsContent>
        )}

        {/* 贡献者列表 */}
        <TabsContent value="contributors" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">全部贡献者</p>
            <Button variant="outline" size="sm" onClick={loadContributors}>
              <RefreshCw className="w-4 h-4 mr-1" />刷新
            </Button>
          </div>
          {loadingContributors ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : contributors.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-gray-400">暂无贡献者</CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {contributors.map((c) => (
                    <div key={c.id} className="border rounded-lg p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{c.name || '匿名贡献者'}</span>
                        <Badge variant="outline">贡献者</Badge>
                      </div>
                      <p className="text-sm text-gray-500">{c.email || c.phone || '-'}</p>
                      <p className="text-xs text-gray-400">
                        注册时间：{new Date(c.created_at).toLocaleString()}
                      </p>
                      {c.last_active_at && (
                        <p className="text-xs text-gray-400">
                          最近活跃：{new Date(c.last_active_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* 二维码 */}
        <TabsContent value="qrcode">
          <Card className="max-w-md mx-auto">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <QrCode className="w-5 h-5 text-sky-600" />
                上传入口二维码
              </CardTitle>
              <CardDescription>扫描二维码即可打开公开上传页面</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4">
              {qrLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                </div>
              ) : qrUrl ? (
                <>
                  <div id="contributor-qr" className="bg-white p-4 rounded-lg border">
                    <QRCodeCanvas value={qrUrl} size={200} includeMargin />
                  </div>
                  <p className="text-sm text-gray-500 break-all text-center">{qrUrl}</p>
                </>
              ) : (
                <p className="text-gray-400 text-sm py-8">点击下方按钮生成二维码</p>
              )}
            </CardContent>
            <CardContent className="pb-6 flex flex-col gap-2">
              <Button onClick={generateQr} disabled={qrLoading}>
                <QrCode className="w-4 h-4 mr-2" />
                生成二维码
              </Button>
              {qrUrl && (
                <Button variant="outline" onClick={downloadQr}>
                  下载二维码图片
                </Button>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 审核对话框 */}
      <Dialog open={!!reviewTarget} onOpenChange={(open) => !open && setReviewTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>审核资料</DialogTitle>
            <DialogDescription>
              {reviewTarget
                ? `${CONTRIBUTOR_TYPE_LABELS[reviewTarget.type as ContributorType] || '资料'} · 审核通过将发放 ${getPoints(reviewTarget.type)} 积分`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {reviewTarget && renderUploadData(reviewTarget)}
            <div className="space-y-2">
              <Label>审核意见</Label>
              <Textarea
                value={reviewComment}
                placeholder="请输入审核意见（拒绝时必填）"
                onChange={(e) => setReviewComment(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button
              variant="destructive"
              disabled={reviewing}
              onClick={() => submitReview('rejected')}
            >
              <XCircle className="w-4 h-4 mr-1" />
              拒绝
            </Button>
            <Button
              disabled={reviewing}
              onClick={() => submitReview('approved')}
            >
              {reviewing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
              通过并发放积分
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
