'use client';

import { useState, useCallback } from 'react';
import type { KnowledgeType } from '@/types/knowledge';

/**
 * 通用知识库上传 hook
 * 调用 /api/knowledge/upload 上传文件
 */
export function useKnowledgeUpload(type: KnowledgeType) {
  const [uploading, setUploading] = useState(false);

  const uploadFile = useCallback(async (params: {
    file: File;
    title: string;
    description?: string;
    metadata?: Record<string, any>;
    tags?: string[];
  }) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', params.file);
      formData.append('type', type);
      formData.append('title', params.title);
      formData.append('description', params.description || '');
      if (params.metadata) {
        formData.append('metadata', JSON.stringify(params.metadata));
      }
      if (params.tags && params.tags.length > 0) {
        formData.append('tags', params.tags.join(','));
      }

      const res = await fetch('/api/knowledge/upload', {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || '上传失败');
      }
      return json;
    } catch (err) {
      console.error('[useKnowledgeUpload] 上传失败:', err);
      throw err;
    } finally {
      setUploading(false);
    }
  }, [type]);

  return { uploadFile, uploading };
}
