'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import type { KnowledgeType } from '@/types/knowledge';

interface UserUploadDialogProps {
  type: KnowledgeType;
  metadataFields: Array<{
    key: string;
    label: string;
    type: 'select' | 'text' | 'date' | 'number';
    options?: string[];
    placeholder?: string;
  }>;
  onClose: () => void;
  onSubmit: (params: {
    file: File;
    title: string;
    description: string;
    metadata: Record<string, any>;
    tags: string[];
    onProgress?: (percent: number) => void;
  }) => Promise<any>;
  uploading?: boolean;
  uploadProgress?: number;
}

export default function UserUploadDialog({ type, metadataFields, onClose, onSubmit, uploading, uploadProgress }: UserUploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [metadata, setMetadata] = useState<Record<string, any>>({});
  const [tagInput, setTagInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const typeNames: Record<string, string> = {
    document: '技术文档',
    case: '案例',
    standard: '标准规范',
    drawing: '图纸图片',
    quota: '定额',
  };

  const handleSubmit = async () => {
    if (!file || !title.trim()) return;
    setSubmitting(true);
    try {
      const tags = tagInput.split(/[,，]/).map(t => t.trim()).filter(Boolean);
      const result = await onSubmit({
        file, title: title.trim(), description: description.trim(), metadata, tags,
        onProgress: () => {},
      });
      if (result?.success !== false) {
        toast.success('上传成功，等待管理员审核');
        onClose();
      }
    } catch (err: any) {
      toast.error(err.message || '上传失败');
    } finally {
      setSubmitting(false);
    }
  };

  const isSubmitting = submitting || uploading;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b">
          <h3 className="font-bold text-lg">上传{typeNames[type]}</h3>
        </div>
        <div className="p-4 space-y-4">
          {/* 文件选择 */}
          <div>
            <label className="block text-sm font-medium mb-1">文件 *</label>
            <input
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.jpg,.jpeg,.png,.gif,.webp,.zip,.rar"
              onChange={e => {
                const f = e.target.files?.[0] || null;
                setFile(f);
                if (f && !title.trim()) {
                  setTitle(f.name.replace(/\.[^.]+$/, ''));
                }
              }}
              disabled={isSubmitting}
              className="w-full border rounded p-2 text-sm disabled:bg-gray-100"
            />
            {file && (
              <p className="text-xs text-gray-500 mt-1">
                {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)
                <span className="text-gray-400 ml-2">最大 50MB</span>
              </p>
            )}
          </div>

          {/* 标题 */}
          <div>
            <label className="block text-sm font-medium mb-1">标题 *</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={file?.name || '请输入标题'}
              disabled={isSubmitting}
              className="w-full border rounded p-2 text-sm disabled:bg-gray-100"
            />
          </div>

          {/* 描述 */}
          <div>
            <label className="block text-sm font-medium mb-1">描述</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              disabled={isSubmitting}
              className="w-full border rounded p-2 text-sm disabled:bg-gray-100"
              rows={2}
            />
          </div>

          {/* 动态 metadata 字段 */}
          {metadataFields.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700">分类信息</p>
              {metadataFields.map(field => (
                <div key={field.key}>
                  <label className="block text-xs text-gray-500 mb-1">{field.label}</label>
                  {field.type === 'select' && field.options ? (
                    <select
                      value={metadata[field.key] || ''}
                      onChange={e => setMetadata({ ...metadata, [field.key]: e.target.value })}
                      disabled={isSubmitting}
                      className="w-full border rounded p-2 text-sm disabled:bg-gray-100"
                    >
                      <option value="">请选择</option>
                      {field.options.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : field.type === 'date' ? (
                    <input
                      type="date"
                      value={metadata[field.key] || ''}
                      onChange={e => setMetadata({ ...metadata, [field.key]: e.target.value })}
                      disabled={isSubmitting}
                      className="w-full border rounded p-2 text-sm disabled:bg-gray-100"
                    />
                  ) : (
                    <input
                      type={field.type === 'number' ? 'number' : 'text'}
                      value={metadata[field.key] || ''}
                      onChange={e => setMetadata({ ...metadata, [field.key]: e.target.value })}
                      placeholder={field.placeholder}
                      disabled={isSubmitting}
                      className="w-full border rounded p-2 text-sm disabled:bg-gray-100"
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 标签 */}
          <div>
            <label className="block text-sm font-medium mb-1">标签（逗号分隔）</label>
            <input
              type="text"
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              placeholder="标签1, 标签2, 标签3"
              disabled={isSubmitting}
              className="w-full border rounded p-2 text-sm disabled:bg-gray-100"
            />
          </div>

          {/* 上传进度条 */}
          {isSubmitting && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-blue-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  正在上传 {file?.name}...
                </span>
                <span className="text-gray-500">{uploadProgress || 0}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress || 0}%` }}
                />
              </div>
            </div>
          )}
        </div>
        <div className="p-4 border-t flex justify-end gap-2">
          <button onClick={onClose} disabled={isSubmitting} className="px-4 py-2 border rounded text-sm disabled:opacity-50">取消</button>
          <button
            onClick={handleSubmit}
            disabled={!file || !title.trim() || isSubmitting}
            className="px-4 py-2 bg-blue-500 text-white rounded text-sm disabled:bg-gray-300"
          >
            {isSubmitting ? `上传中 ${uploadProgress || 0}%` : '上传'}
          </button>
        </div>
      </div>
    </div>
  );
}
