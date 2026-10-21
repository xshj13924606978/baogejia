'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, FileUp, CheckCircle2 } from 'lucide-react';
import type { KnowledgeType } from '@/types/knowledge';

/**
 * 资料统一上传组件（指令 2/3）
 *
 * 与 UserUploadDialog 接口兼容，增强能力：
 * - 上传进度条（0-100%）
 * - 上传完成后的「服务端解析中」阶段提示
 * - 上传成功后展示解析摘要（页数/字数/尺寸等，来自 upload API 的 parse 字段）
 * - 按模块类型过滤文件类型
 */
export interface KnowledgeUploaderField {
  key: string;
  label: string;
  type: 'select' | 'text' | 'date' | 'number';
  options?: string[];
  placeholder?: string;
}

interface KnowledgeUploaderProps {
  type: KnowledgeType;
  metadataFields: KnowledgeUploaderField[];
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
  /** 最大文件大小（MB），默认 500 */
  maxSizeMB?: number;
  /** 允许的文件扩展名（默认按类型自动） */
  accept?: string;
}

const TYPE_NAMES: Record<string, string> = {
  document: '技术文档',
  case: '案例',
  standard: '标准规范',
  drawing: '图纸图片',
  quota: '定额',
  price: '产品价格',
  other: '资料',
};

const DEFAULT_ACCEPT =
  '.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.jpg,.jpeg,.png,.gif,.webp,.zip,.rar';

/** 按模块类型生成默认 accept */
function acceptForType(type: KnowledgeType): string {
  switch (type) {
    case 'drawing':
      return '.jpg,.jpeg,.png,.gif,.webp,.bmp,.pdf,.dwg,.dxf';
    case 'quota':
      return '.xls,.xlsx,.xlsm,.csv,.pdf,.doc,.docx';
    default:
      return '.pdf,.doc,.docx,.txt,.csv,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp,.zip,.rar';
  }
}

/** 将上传响应的 parse 摘要格式化为展示文案 */
export function formatParseSummary(parse: any): string | null {
  if (!parse || typeof parse !== 'object') return null;
  const parts: string[] = [];
  if (parse.pages) parts.push(`${parse.pages} 页`);
  if (parse.characters) parts.push(`${parse.characters} 字`);
  if (parse.width && parse.height) parts.push(`${parse.width}×${parse.height}px`);
  if (parse.sheets) parts.push(`${parse.sheets} 个工作表`);
  if (parse.entities) parts.push(`${parse.entities} 个文本实体`);
  if (parts.length > 0) return `解析完成：${parts.join('，')}`;
  if (parse.error) return `解析完成（${parse.error}）`;
  return '解析完成';
}

export default function KnowledgeUploader({
  type,
  metadataFields,
  onClose,
  onSubmit,
  uploading,
  uploadProgress: externalProgress,
  maxSizeMB = 500,
  accept,
}: KnowledgeUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [metadata, setMetadata] = useState<Record<string, any>>({});
  const [tagInput, setTagInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  /** 阶段：idle | uploading | parsing（上传完成，服务端解析中） */
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'parsing'>('idle');
  const [parseSummary, setParseSummary] = useState<string | null>(null);

  const isSubmitting = submitting || uploading;
  const shownProgress = externalProgress ?? progress;
  const effectiveAccept = accept || acceptForType(type);

  const handleSubmit = async () => {
    if (!file || !title.trim()) return;
    setSubmitting(true);
    setPhase('uploading');
    setProgress(0);
    setParseSummary(null);
    try {
      const tags = tagInput.split(/[,，]/).map(t => t.trim()).filter(Boolean);
      const result = await onSubmit({
        file,
        title: title.trim(),
        description: description.trim(),
        metadata,
        tags,
        onProgress: (p) => {
          setProgress(p);
          // 上传到达 100% 但响应未返回 → 进入「服务端解析中」阶段
          if (p >= 100) setPhase('parsing');
        },
      });
      setPhase('parsing');
      // 解析摘要在 upload API 响应的 parse 字段
      const parse = result?.parse ?? result?.data?.parse ?? result?.data?.metadata?.parse;
      const summary = formatParseSummary(parse);
      setParseSummary(summary);
      toast.success(summary ? `上传成功，${summary}` : '上传成功，等待管理员审核');
      onClose();
    } catch (err: any) {
      toast.error(err.message || '上传失败');
      setPhase('idle');
      setProgress(0);
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    if (f && f.size > maxSizeMB * 1024 * 1024) {
      toast.error(`文件不能超过 ${maxSizeMB}MB`);
      e.target.value = '';
      return;
    }
    setFile(f);
    if (f && !title.trim()) {
      setTitle(f.name.replace(/\.[^.]+$/, ''));
    }
  };

  const statusText = () => {
    if (phase === 'parsing' || (isSubmitting && shownProgress >= 100)) {
      return '上传完成，服务端解析文件中…';
    }
    if (isSubmitting) return `正在上传 ${shownProgress}%`;
    return `正在上传 ${file?.name ?? ''}...`;
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b flex items-center gap-2">
          <FileUp className="h-5 w-5 text-blue-500" />
          <h3 className="font-bold text-lg">上传{TYPE_NAMES[type] ?? '资料'}</h3>
        </div>
        <div className="p-4 space-y-4">
          {/* 文件选择 */}
          <div>
            <label className="block text-sm font-medium mb-1">文件 *</label>
            <input
              type="file"
              accept={effectiveAccept}
              onChange={handleFileChange}
              disabled={isSubmitting}
              className="w-full border rounded p-2 text-sm disabled:bg-gray-100"
            />
            {file && (
              <p className="text-xs text-gray-500 mt-1">
                {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)
                <span className="text-gray-400 ml-2">最大 {maxSizeMB}MB</span>
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

          {/* 动态 metadata 字段（字段映射） */}
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

          {/* 上传进度 + 解析阶段 */}
          {isSubmitting && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-blue-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {statusText()}
                </span>
                {phase !== 'parsing' && shownProgress < 100 && (
                  <span className="text-gray-500">{shownProgress}%</span>
                )}
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={phase === 'parsing' ? 'bg-emerald-500 h-2 rounded-full transition-all duration-300' : 'bg-blue-500 h-2 rounded-full transition-all duration-300'}
                  style={{ width: `${phase === 'parsing' ? 100 : shownProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* 解析结果摘要 */}
          {parseSummary && !isSubmitting && (
            <div className="flex items-start gap-2 text-sm text-emerald-600 bg-emerald-50 border border-emerald-200 rounded p-2.5">
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{parseSummary}，已提交管理员审核</span>
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
            {isSubmitting
              ? (phase === 'parsing' ? '解析中…' : `上传中 ${shownProgress}%`)
              : '上传并解析'}
          </button>
        </div>
      </div>
    </div>
  );
}
