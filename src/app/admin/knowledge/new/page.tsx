'use client';

import React, { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Upload, FileText, Loader2, X, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

const TYPE_OPTIONS = [
  { value: 'price', label: '价格库' },
  { value: 'document', label: '文档库' },
  { value: 'case', label: '案例库' },
  { value: 'standard', label: '标准库' },
  { value: 'drawing', label: '图纸库' },
  { value: 'quota', label: '定额库' },
  { value: 'other', label: '其他' },
];

export default function KnowledgeNewPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [type, setType] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  const handleSubmit = async () => {
    if (!type) { toast.error('请选择资料类型'); return; }
    if (!title.trim()) { toast.error('请输入标题'); return; }
    if (!file) { toast.error('请选择文件'); return; }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', type);
      formData.append('title', title.trim());
      if (description.trim()) formData.append('description', description.trim());

      const res = await fetch('/api/knowledge/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) {
        toast.success('上传成功，等待审核');
        router.push('/admin/audit');
      } else {
        toast.error(data.error || '上传失败');
      }
    } catch { toast.error('网络错误'); }
    finally { setSubmitting(false); }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">新增资料</h1>
          <p className="text-gray-500">上传文件到资料中心</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* 表单 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">资料信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>资料类型 *</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue placeholder="选择类型" /></SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>标题 *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="如：某产品价格表2026" />
            </div>
            <div>
              <Label>描述</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="简要描述资料内容..." rows={3} />
            </div>
          </CardContent>
        </Card>

        {/* 文件上传 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">上传文件</CardTitle>
            <CardDescription>支持 PDF、Word、Excel、图片、压缩包，最大 50MB</CardDescription>
          </CardHeader>
          <CardContent>
            {file ? (
              <div className="border-2 border-dashed rounded-lg p-6">
                <div className="flex items-start gap-4">
                  <FileText className="h-10 w-10 text-blue-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{file.name}</p>
                    <p className="text-sm text-gray-500">{formatSize(file.size)}</p>
                  </div>
                  <Button variant="ghost" size="icon" className="shrink-0" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ''; }}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <div
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50/50 transition-colors"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500">点击或拖拽文件到此处</p>
                <p className="text-xs text-gray-400 mt-1">PDF / Word / Excel / 图片 / 压缩包</p>
              </div>
            )}
            <input ref={fileRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.jpg,.jpeg,.png,.gif,.webp,.zip,.rar" onChange={handleFileChange} />
          </CardContent>
        </Card>
      </div>

      {/* 操作 */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()} disabled={submitting}>取消</Button>
        <Button onClick={handleSubmit} disabled={submitting || !type || !title.trim() || !file}>
          {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
          上传并提交审核
        </Button>
      </div>
    </div>
  );
}
