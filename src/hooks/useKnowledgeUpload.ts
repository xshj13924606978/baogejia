'use client';

import { useState, useCallback } from 'react';
import type { KnowledgeType, KnowledgeEntry } from '@/types/knowledge';

export interface UploadResult {
  success: boolean;
  data?: any;
  error?: string;
  message?: string;
}

/**
 * 通用知识库上传 hook
 * 使用 XMLHttpRequest 实现上传进度跟踪
 */
export function useKnowledgeUpload(type: KnowledgeType) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [lastResult, setLastResult] = useState<UploadResult | null>(null);

  const uploadFile = useCallback((params: {
    file: File;
    title: string;
    description?: string;
    metadata?: Record<string, any>;
    tags?: string[];
    onProgress?: (percent: number) => void;
  }): Promise<UploadResult> => {
    setUploading(true);
    setProgress(0);
    setLastResult(null);

    return new Promise((resolve, reject) => {
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

      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          setProgress(percent);
          params.onProgress?.(percent);
        }
      });

      xhr.addEventListener('load', () => {
        try {
          const json = JSON.parse(xhr.responseText);
          const result: UploadResult = {
            success: xhr.status >= 200 && xhr.status < 300 && json.success,
            data: json.data,
            error: json.error,
            message: json.message,
          };
          setLastResult(result);
          if (result.success) {
            resolve(result);
          } else {
            reject(new Error(result.error || '上传失败'));
          }
        } catch {
          reject(new Error('响应解析失败'));
        } finally {
          setUploading(false);
          setProgress(100);
        }
      });

      xhr.addEventListener('error', () => {
        const result: UploadResult = { success: false, error: '网络错误' };
        setLastResult(result);
        reject(new Error('网络错误'));
        setUploading(false);
      });

      xhr.addEventListener('abort', () => {
        const result: UploadResult = { success: false, error: '上传已取消' };
        setLastResult(result);
        reject(new Error('上传已取消'));
        setUploading(false);
      });

      // 携带用户身份
      try {
        const userStr = localStorage.getItem('user');
        if (userStr) {
          const user = JSON.parse(userStr);
          if (user.id) xhr.setRequestHeader('x-user-id', user.id);
          if (user.role) xhr.setRequestHeader('x-user-role', String(user.role));
        }
        const token = localStorage.getItem('token');
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      } catch { /* ignore */ }

      xhr.open('POST', '/api/knowledge/upload');
      xhr.send(formData);
    });
  }, [type]);

  return { uploadFile, uploading, progress, lastResult };
}
