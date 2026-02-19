'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { MessageSquare, Plus, Clock, FileText, MoreHorizontal, Copy, Trash2, Pencil, Share2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface Conversation {
  id: number;
  title: string;
  updatedAt: string;
  quoteCount?: number;
}

interface ConversationListProps {
  selectedConversationId: number | null;
  onSelectConversation: (id: number | null) => void;
  onNewConversation: () => void;
}

export default function ConversationList({
  selectedConversationId,
  onSelectConversation,
  onNewConversation,
}: ConversationListProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    try {
      const response = await fetch('/api/conversations');
      if (response.ok) {
        const data = await response.json();
        setConversations(data.conversations || []);
      }
    } catch (error) {
      console.error('Failed to load conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleNewConversation = () => {
    onNewConversation();
  };

  const handleReuse = async (conversationId: number) => {
    try {
      const response = await fetch(`/api/conversations/${conversationId}/reuse`, {
        method: 'POST',
      });
      if (response.ok) {
        const data = await response.json();
        onSelectConversation(data.newConversationId);
      }
    } catch (error) {
      console.error('Failed to reuse conversation:', error);
    }
  };

  const handleDelete = async (conversationId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('确定要删除这条对话记录吗？')) {
      return;
    }

    try {
      const response = await fetch(`/api/conversations/${conversationId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        // 刷新列表
        loadConversations();
        // 如果删除的是当前选中的对话，清空选中状态
        if (selectedConversationId === conversationId) {
          onSelectConversation(null);
        }
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      alert('删除失败，请稍后重试');
    }
  };

  const handleRename = async (conversationId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const newTitle = prompt('请输入新的对话标题：');
    if (!newTitle || newTitle.trim() === '') {
      return;
    }

    try {
      const response = await fetch(`/api/conversations/${conversationId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      if (response.ok) {
        loadConversations();
      }
    } catch (error) {
      console.error('Failed to rename conversation:', error);
      alert('重命名失败，请稍后重试');
    }
  };

  const handleShare = async (conversationId: number, e: React.MouseEvent) => {
    e.stopPropagation();

    try {
      // 获取对话详情
      const response = await fetch(`/api/conversations/${conversationId}`);
      if (!response.ok) {
        alert('获取对话失败，请稍后重试');
        return;
      }

      const { conversation } = await response.json();

      // 生成分享链接
      const shareUrl = `${window.location.origin}/?conversation=${conversationId}`;

      // 复制到剪贴板
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        alert('分享链接已复制到剪贴板！');
      } else {
        // 降级方案
        const textarea = document.createElement('textarea');
        textarea.value = shareUrl;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
          document.execCommand('copy');
          alert('分享链接已复制到剪贴板！');
        } catch (err) {
          prompt('请复制以下分享链接：', shareUrl);
        }
        document.body.removeChild(textarea);
      }
    } catch (error) {
      console.error('Failed to share conversation:', error);
      alert('分享失败，请稍后重试');
    }
  };

  const handleClearAll = async () => {
    if (!confirm('确定要清空所有对话记录吗？此操作不可恢复！')) {
      return;
    }

    try {
      const response = await fetch('/api/conversations', {
        method: 'DELETE',
      });
      if (response.ok) {
        loadConversations();
        // 清空当前选中的对话
        onSelectConversation(null);
        alert('所有对话记录已清空');
      }
    } catch (error) {
      console.error('Failed to clear all conversations:', error);
      alert('清空失败，请稍后重试');
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* 头部 */}
      <div className="py-5 px-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 sticky top-0 z-50">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
              <MessageSquare className="h-4 w-4 text-white" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              对话历史
            </h2>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-full text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                onClick={handleClearAll}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>清空所有对话记录</p>
            </TooltipContent>
          </Tooltip>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">管理所有报价对话记录</p>
      </div>

      {/* 对话列表 */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-3">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-3"></div>
              <p className="text-sm text-muted-foreground">加载中...</p>
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FileText className="h-12 w-12 text-slate-300 dark:text-slate-600 mb-4" />
              <p className="text-sm text-muted-foreground mb-2">暂无对话记录</p>
              <p className="text-xs text-slate-400">开始第一次报价吧</p>
            </div>
          ) : (
            conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={`group relative p-4 pr-12 h-[88px] rounded-xl cursor-pointer transition-all duration-200 border-2 ${
                  selectedConversationId === conversation.id
                    ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-600 dark:border-blue-500 shadow-sm'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md'
                }`}
                onClick={() => onSelectConversation(conversation.id)}
              >
                <div className="flex items-center gap-3 h-full">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className={`flex-shrink-0 rounded-lg p-2 ${
                        selectedConversationId === conversation.id
                          ? 'bg-blue-600'
                          : 'bg-slate-100 dark:bg-slate-800 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/50'
                      }`}>
                        <MessageSquare className={`h-4 w-4 ${
                          selectedConversationId === conversation.id
                            ? 'text-white'
                            : 'text-slate-500 dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400'
                        }`} />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      <p>对话 #{conversation.id}</p>
                    </TooltipContent>
                  </Tooltip>
                  <div className="flex-1 min-w-0 pr-8">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <p className={`text-sm font-medium truncate mb-1 cursor-help ${
                          selectedConversationId === conversation.id
                            ? 'text-blue-900 dark:text-blue-100'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}>
                          {conversation.title}
                        </p>
                      </TooltipTrigger>
                      <TooltipContent side="top" align="start" className="max-w-md">
                        <p className="text-sm">{conversation.title}</p>
                      </TooltipContent>
                    </Tooltip>
                    <div className="flex items-center gap-2">
                      <Clock className={`h-3 w-3 ${
                        selectedConversationId === conversation.id
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-slate-400 dark:text-slate-500'
                      }`} />
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(conversation.updatedAt), {
                          addSuffix: true,
                          locale: zhCN,
                        })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 操作菜单 */}
                <div className="absolute top-3 right-3">
                  <DropdownMenu>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>更多操作</p>
                      </TooltipContent>
                    </Tooltip>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReuse(conversation.id);
                        }}
                      >
                        <Copy className="h-4 w-4 mr-2 text-slate-500" />
                        复用
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          handleShare(conversation.id, e);
                        }}
                      >
                        <Share2 className="h-4 w-4 mr-2 text-slate-500" />
                        分享
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRename(conversation.id, e);
                        }}
                      >
                        <Pencil className="h-4 w-4 mr-2 text-slate-500" />
                        重命名
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(conversation.id, e);
                        }}
                        className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 focus:text-red-700 dark:focus:text-red-300"
                      >
                        <Trash2 className="h-4 w-2 mr-2 text-red-600 dark:text-red-400" />
                        删除
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
