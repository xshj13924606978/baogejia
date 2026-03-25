'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Upload, X, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

interface AdminUploadDialogProps {
  open: boolean;
  onClose: () => void;
  type: string;
  onSuccess: () => void;
}

export function AdminUploadDialog({ open, onClose, type, onSuccess }: AdminUploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
    }
  };

  const handleSubmit = async () => {
    if (!file) { toast.error('请选择文件'); return; }
    if (!title.trim()) { toast.error('请输入标题'); return; }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', type);
      formData.append('title', title.trim());
      formData.append('description', description);

      const res = await fetch('/api/knowledge/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok && (data.success || data.data)) {
        toast.success('上传成功');
        resetForm();
        onClose();
        onSuccess();
      } else {
        toast.error(data.error || '上传失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setUploading(false);
    }
  };

  const resetForm = () => {
    setFile(null);
    setTitle('');
    setDescription('');
  };

  const handleClose = () => {
    if (uploading) return;
    resetForm();
    onClose();
  };

  const sizeMB = file ? (file.size / 1024 / 1024).toFixed(2) : '0';
  const overLimit = file && file.size > 50 * 1024 * 1024;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>上传文件</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* 文件选择 */}
          <div className="grid gap-2">
            <Label>选择文件</Label>
            <div className="border-2 border-dashed rounded-lg p-4 text-center hover:border-primary/50 transition-colors">
              {file ? (
                <div className="flex items-center gap-3">
                  <FileText className="h-8 w-8 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{sizeMB} MB</p>
                  </div>
                  <button onClick={() => setFile(null)} className="p-1 hover:bg-muted rounded">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <label className="cursor-pointer block">
                  <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">点击选择文件</p>
                  <p className="text-xs text-muted-foreground mt-1">支持 PDF/Word/Excel/图片/压缩包，最大 50MB</p>
                  <input type="file" className="hidden" onChange={handleFileChange}
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.jpg,.jpeg,.png,.gif,.webp,.zip,.rar" />
                </label>
              )}
            </div>
            {overLimit && <p className="text-xs text-destructive">文件大小超过 50MB 限制</p>}
          </div>

          {/* 标题 */}
          <div className="grid gap-2">
            <Label>标题 <span className="text-destructive">*</span></Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="输入文件标题" />
          </div>

          {/* 描述 */}
          <div className="grid gap-2">
            <Label>描述</Label>
            <textarea
              className="w-full min-h-[60px] rounded-md border border-input bg-transparent px-3 py-2 text-sm resize-y"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="可选描述"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={uploading}>取消</Button>
          <Button onClick={handleSubmit} disabled={uploading || !file || !title.trim() || !!overLimit}>
            {uploading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {uploading ? '上传中...' : '上传'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
