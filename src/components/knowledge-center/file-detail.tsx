'use client';

import { useCallback, useEffect, useState } from 'react';
import type { KnowledgeEntry } from '@/types/knowledge';
import type { KnowledgeAssetReferenceFile } from '@/lib/intent-recognizer';
import FileDownloadButton from './FileDownloadButton';
import { getClientAuthHeaders, getClientUser } from '@/lib/client-utils';

interface FileDetailProps {
  /** 聊天卡片传入的命中文件（#[20260827-1800]-1：直接定位，无需搜索） */
  file: KnowledgeAssetReferenceFile;
  /** 返回资料中心列表 */
  onBack: () => void;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getFileIcon(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return '📕';
  if (ext === 'doc' || ext === 'docx') return '📘';
  if (ext === 'xls' || ext === 'xlsx') return '📗';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) return '🖼️';
  return '📄';
}

type LoadState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'forbidden' }
  | { status: 'error' }
  | { status: 'ready'; entry: KnowledgeEntry; canDownload: boolean };

export default function FileDetail({ file, onBack }: FileDetailProps) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const res = await fetch(`/api/knowledge/${file.id}`, {
        headers: { ...getClientAuthHeaders() },
        cache: 'no-store',
      });
      if (res.status === 404) {
        setState({ status: 'missing' });
        return;
      }
      if (res.status === 403) {
        setState({ status: 'forbidden' });
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        setState({ status: 'error' });
        return;
      }
      setState({
        status: 'ready',
        entry: data.data as KnowledgeEntry,
        canDownload: data.permissions?.can_download !== false,
      });
    } catch {
      setState({ status: 'error' });
    }
  }, [file.id]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="max-w-2xl mx-auto p-6">
      {/* 返回按钮 */}
      <button
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
      >
        <span>←</span> 返回资料中心
      </button>

      {state.status === 'loading' && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 animate-pulse">
          <div className="h-6 w-2/3 bg-slate-200 dark:bg-slate-800 rounded mb-4" />
          <div className="h-4 w-full bg-slate-100 dark:bg-slate-800 rounded mb-2" />
          <div className="h-4 w-3/4 bg-slate-100 dark:bg-slate-800 rounded" />
        </div>
      )}

      {(state.status === 'missing' || state.status === 'error') && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-8 text-center">
          <span className="text-5xl mb-4 block">🗑️</span>
          <div className="text-lg font-medium text-slate-700 dark:text-slate-200">
            该文件可能已被删除或移至回收站
          </div>
          <p className="text-sm text-slate-400 mt-2 break-words">{file.title}</p>
        </div>
      )}

      {state.status === 'forbidden' && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-8 text-center">
          <span className="text-5xl mb-4 block">🔒</span>
          <div className="text-lg font-medium text-slate-700 dark:text-slate-200">暂无查看权限</div>
          <p className="text-sm text-slate-400 mt-2">该文件未通过审核或已被下架</p>
        </div>
      )}

      {state.status === 'ready' && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          {/* 头部 */}
          <div className="flex items-start gap-4 p-6 border-b border-slate-100 dark:border-slate-800">
            <span className="text-4xl">{getFileIcon(state.entry.file_name || '')}</span>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 break-words">
                {state.entry.title}
              </h3>
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300">
                  {file.category || state.entry.type}
                </span>
                {state.entry.file_name && (
                  <span className="text-xs text-slate-400 truncate">{state.entry.file_name}</span>
                )}
              </div>
            </div>
          </div>

          {/* 信息行 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 p-6 border-b border-slate-100 dark:border-slate-800">
            <div>
              <div className="text-xs text-slate-400">文件大小</div>
              <div className="text-sm font-medium text-slate-700 dark:text-slate-200 mt-0.5">
                {formatFileSize(state.entry.file_size)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400">下载次数</div>
              <div className="text-sm font-medium text-slate-700 dark:text-slate-200 mt-0.5">
                {state.entry.downloads ?? 0}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400">上传者</div>
              <div className="text-sm font-medium text-slate-700 dark:text-slate-200 mt-0.5 truncate">
                {state.entry.uploader_name || '未知'}
              </div>
            </div>
          </div>

          {/* 描述 */}
          <div className="p-6 border-b border-slate-100 dark:border-slate-800">
            <div className="text-xs text-slate-400 mb-2">简介</div>
            <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">
              {state.entry.description || '暂无简介'}
            </p>
          </div>

          {/* 操作（#[20260827-2000]-3：区分未登录/已登录但无下载权限，消除"已登录却提示登录"矛盾） */}
          <div className="flex items-center gap-3 p-6">
            {state.canDownload ? (
              <FileDownloadButton
                entryId={state.entry.id}
                fileName={state.entry.file_name || undefined}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                下载文件
              </FileDownloadButton>
            ) : getClientUser() ? (
              <span className="text-sm text-amber-600 dark:text-amber-400">
                当前账号暂无下载权限，请联系管理员开通
              </span>
            ) : (
              <span className="text-sm text-slate-400">请先登录后下载该文件</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
