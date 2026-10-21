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

// 各类型的 metadata 字段配置
export const METADATA_FIELDS: Record<string, Array<{
  key: string;
  label: string;
  kind: 'select' | 'text' | 'date' | 'number';
  options?: string[];
  placeholder?: string;
}>> = {
  document: [
    { key: 'category', label: '分类', kind: 'select', options: ['产品说明书', '技术文档', '操作手册', '维护指南', '其他'] },
  ],
  case: [
    { key: 'project_type', label: '项目类型', kind: 'select', options: ['污水处理', '供水工程', '设备安装', '工业废水', '给排水', '其他'] },
    { key: 'industry', label: '行业', kind: 'text', placeholder: '如：环保工程' },
    { key: 'scale', label: '规模', kind: 'text', placeholder: '如：5000m³/d' },
    { key: 'budget', label: '预算', kind: 'text', placeholder: '如：1200万元' },
    { key: 'completion_date', label: '完成日期', kind: 'date' },
  ],
  standard: [
    { key: 'standard_code', label: '标准编号', kind: 'text', placeholder: '如：GB 50014-2021' },
    { key: 'standard_type', label: '标准类型', kind: 'select', options: ['国标', '行标', '地标', '企标'] },
    { key: 'industry', label: '行业', kind: 'text', placeholder: '如：建筑给排水' },
    { key: 'publish_date', label: '发布日期', kind: 'date' },
    { key: 'effective_status', label: '实施状态', kind: 'select', options: ['现行', '废止', '修订中'] },
  ],
  drawing: [
    { key: 'drawing_type', label: '图纸类型', kind: 'select', options: ['CAD', '工艺流程图', '布置图', '安装图', '其他'] },
    { key: 'project', label: '所属项目', kind: 'text', placeholder: '项目名称' },
    { key: 'version', label: '版本号', kind: 'text', placeholder: '如：V1.0' },
  ],
  quota: [
    { key: 'quota_type', label: '定额类型', kind: 'select', options: ['全国', '地方', '行业', '企业'] },
    { key: 'region', label: '地区', kind: 'text', placeholder: '如：全国、广东' },
    { key: 'quota_code', label: '定额编号', kind: 'text', placeholder: '如：D1-001' },
    { key: 'unit', label: '单位', kind: 'text', placeholder: '如：m³、台' },
    { key: 'base_price', label: '基价', kind: 'number' },
    { key: 'labor_cost', label: '人工费', kind: 'number' },
    { key: 'material_cost', label: '材料费', kind: 'number' },
    { key: 'machine_cost', label: '机械费', kind: 'number' },
  ],
};

export function AdminUploadDialog({ open, onClose, type, onSuccess }: AdminUploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [metadata, setMetadata] = useState<Record<string, string>>({});
  const [tagInput, setTagInput] = useState('');
  const [uploading, setUploading] = useState(false);

  const fields = METADATA_FIELDS[type] || [];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
    }
  };

  const handleMetadataChange = (key: string, value: string) => {
    setMetadata((prev) => ({ ...prev, [key]: value }));
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
      if (Object.keys(metadata).length > 0) {
        formData.append('metadata', JSON.stringify(metadata));
      }
      const tags = tagInput.split(/[,，]/).map((t: string) => t.trim()).filter(Boolean);
      if (tags.length > 0) {
        formData.append('tags', tags.join(','));
      }

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
    setMetadata({});
    setTagInput('');
  };

  const handleClose = () => {
    if (uploading) return;
    resetForm();
    onClose();
  };

  const sizeMB = file ? (file.size / 1024 / 1024).toFixed(2) : '0';
  const overLimit = file && file.size > 500 * 1024 * 1024; // #20260823-1900 由 50MB 调大

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
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
                  <p className="text-xs text-muted-foreground mt-1">支持 PDF/Word/Excel/图片/压缩包，最大 500MB</p>
                  <input type="file" className="hidden" onChange={handleFileChange}
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.jpg,.jpeg,.png,.gif,.webp,.bmp,.dwg,.dxf,.zip,.rar" />
                </label>
              )}
            </div>
            {overLimit && <p className="text-xs text-destructive">文件大小超过 500MB 限制</p>}
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

          {/* 动态 metadata 字段 */}
          {fields.length > 0 && (
            <div className="space-y-3 border-t pt-3">
              <p className="text-sm font-medium">分类信息</p>
              {fields.map((field) => (
                <div key={field.key} className="grid gap-1">
                  <Label className="text-xs text-muted-foreground">{field.label}</Label>
                  {field.kind === 'select' && field.options ? (
                    <select
                      value={metadata[field.key] || ''}
                      onChange={(e) => handleMetadataChange(field.key, e.target.value)}
                      className="w-full rounded-md border border-input bg-transparent px-3 py-1.5 text-sm"
                    >
                      <option value="">请选择</option>
                      {field.options.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : field.kind === 'date' ? (
                    <input
                      type="date"
                      value={metadata[field.key] || ''}
                      onChange={(e) => handleMetadataChange(field.key, e.target.value)}
                      className="w-full rounded-md border border-input bg-transparent px-3 py-1.5 text-sm"
                    />
                  ) : (
                    <Input
                      type={field.kind === 'number' ? 'number' : 'text'}
                      value={metadata[field.key] || ''}
                      onChange={(e) => handleMetadataChange(field.key, e.target.value)}
                      placeholder={field.placeholder}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 标签 */}
          <div className="grid gap-2">
            <Label>标签（逗号分隔）</Label>
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="标签1, 标签2, 标签3"
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
