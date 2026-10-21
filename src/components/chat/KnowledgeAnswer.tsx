'use client';

/**
 * 知识问答卡片（#[20260827-1030]-2-UI 最终版 / #[20260827-1430] 资料中心匹配）
 * 展示回答内容 + 📁 资料中心匹配结果（可直接下载/跳转）+ 📚 资料来源列表
 */

import { useEffect, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { BookOpen, FileText, FolderOpen, Link2 } from 'lucide-react';
import type { KnowledgeAssetReference, KnowledgeCardItem } from '@/lib/intent-recognizer';

interface KnowledgeAnswerProps {
  /** 由资料库检索生成的回答内容（可选，无则只展示来源） */
  content?: string;
  items: KnowledgeCardItem[];
  /** 资料中心已匹配文件（#[20260827-1430]） */
  assetReference?: KnowledgeAssetReference;
}

/** 来源类型图标 */
function TypeIcon({ type }: { type: string }) {
  if (/联网|搜索|在线/.test(type)) {
    return <Link2 className="h-3.5 w-3.5 flex-shrink-0 text-violet-500" />;
  }
  return <FileText className="h-3.5 w-3.5 flex-shrink-0 text-emerald-500" />;
}

export function KnowledgeAnswer({ content, items, assetReference }: KnowledgeAnswerProps) {
  const assetFiles = assetReference?.files || [];

  // #[20260827-1800]：按用户角色决定资料中心入口
  // 管理员 → 管理后台资料中心（file.libraryUrl，服务端生成的 /admin/knowledge-center/...，含编辑/审核/上传）
  // 普通用户 → 打开系统自有的资料中心弹窗（与用户菜单"管理资料→资料中心"同入口），
  //            定位"全局搜索"并自动填入资料标题搜索
  // 判断方式与 chat-area 一致：localStorage 中的登录用户 role
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    try {
      const userStr = localStorage.getItem('user');
      const user = userStr ? JSON.parse(userStr) : null;
      setIsAdmin(!!user && (user.role === 'super_admin' || user.role === 'admin'));
    } catch {
      setIsAdmin(false);
    }
  }, []);

  const getLibraryHref = (file: KnowledgeAssetReference['files'][number]): string =>
    isAdmin && file.libraryUrl ? file.libraryUrl : '#';

  const handleLibraryClick = (
    e: ReactMouseEvent<HTMLAnchorElement>,
    file: KnowledgeAssetReference['files'][number]
  ) => {
    if (isAdmin) return;
    e.preventDefault();
    // #[20260827-1800]-1：直接定位文件（弹窗直接展示该文件详情/下载，无需搜索等待）
    window.dispatchEvent(
      new CustomEvent('open-knowledge-center', {
        detail: {
          file: { id: file.id, title: file.title || '', category: file.category || '' },
        },
      })
    );
  };

  // 调试日志（#[20260827-1430-3]）：确认前端收到资料中心匹配数据，用于排查引用卡片未显示
  useEffect(() => {
    console.log(
      '[KnowledgeAnswer] 收到数据: items=' + (items?.length ?? 0) + ' assetReference.files=' + assetFiles.length
    );
    if (assetReference && assetReference.files && assetReference.files.length > 0) {
      console.log('[KnowledgeAnswer] assetReference.files=' + JSON.stringify(assetReference.files.map((f) => f.title)));
    }
  }, [items, assetReference]);

  if ((!items || items.length === 0) && assetFiles.length === 0) return null;

  const totalCount = (items?.length || 0) + assetFiles.length;

  return (
    <div className="overflow-hidden rounded-xl border border-emerald-100 bg-white shadow-sm">
      <div className="flex items-center gap-1.5 bg-emerald-50/70 px-4 py-2.5 text-sm font-semibold text-emerald-800">
        <BookOpen className="h-4 w-4" />
        知识参考（{totalCount} 项）
      </div>

      {content && <div className="border-b border-gray-50 px-4 py-3 text-sm leading-relaxed text-gray-700">{content}</div>}

      {/* 📁 资料中心已匹配文件（#[20260827-1430]：直接下载 / 前往资料中心查看） */}
      {assetFiles.length > 0 && (
        <div className="mx-4 mb-3 mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-blue-700">
            <FolderOpen className="h-4 w-4" />
            📁 资料中心已匹配到相关文件
          </div>
          <div className="mt-2 space-y-2">
            {assetFiles.map((file) => (
              <div key={file.id} className="rounded-md border border-blue-100 bg-white px-3 py-2">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <FileText className="h-3.5 w-3.5 flex-shrink-0 text-gray-500" />
                  <a
                    href={file.downloadUrl}
                    download
                    className="min-w-0 flex-1 truncate font-medium text-blue-600 hover:underline"
                    title="点击下载"
                  >
                    {file.title}
                  </a>
                  <span className="flex-shrink-0 text-xs text-gray-400">（{file.category}）</span>
                  <a
                    href={getLibraryHref(file)}
                    onClick={(e) => handleLibraryClick(e, file)}
                    className="flex-shrink-0 text-xs text-blue-500 hover:underline"
                    title="前往资料中心查看"
                  >
                    📂 前往资料中心查看
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {items && items.length > 0 && (
        <div className="px-4 py-3">
          <div className="mb-2 text-xs font-medium text-gray-500">📚 资料来源</div>
          <ul className="space-y-2">
            {items.map((item, index) => (
              <li key={index} className="rounded-lg border border-gray-100 bg-gray-50/50 p-2.5">
                <div className="flex items-center gap-1.5">
                  <TypeIcon type={item.type} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800">{item.title}</span>
                  <span className="flex-shrink-0 text-xs text-gray-400">{item.type}</span>
                </div>
                {item.summary && <div className="mt-1 line-clamp-2 pl-5 text-xs text-gray-500">{item.summary}</div>}
                <div className="mt-1 flex items-center gap-2 pl-5 text-xs text-gray-400">
                  <span>相关度 {item.relevanceScore}%</span>
                  {item.sourceFile && <span className="truncate">来源：{item.sourceFile}</span>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
