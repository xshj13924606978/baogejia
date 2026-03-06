'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { 
  MessageSquare, FileText, MoreHorizontal, 
  Trash2, Pencil, Share2, Search, Pin, PinOff, ArrowUp, History, Plus
} from 'lucide-react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
  createdAt?: string;
  lastMessage?: string;
  messageCount?: number;
  fileCount?: number;
  messages?: any[];
  files?: any[];
}

interface ConversationListProps {
  selectedConversationId: string | null;
  onSelectConversation: (id: string | null) => void;
  onNewConversation: () => void;
  refreshTrigger?: number;
  hideEmptyConversations?: boolean;
  isCollapsed?: boolean;
}

// 智能生成显示标题
function getDisplayTitle(conv: Conversation): string {
  if (conv.title && conv.title !== '新对话') {
    return conv.title;
  }
  return '新对话';
}

// 格式化时间
function formatTime(dateStr: string): string {
  if (!dateStr) return '';
  
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days < 1) {
      return format(date, 'HH:mm');
    } else if (days < 7) {
      return format(date, 'EEEE', { locale: zhCN });
    } else {
      return format(date, 'yyyy/MM/dd');
    }
  } catch (error) {
    return '';
  }
}

export default function ConversationList({
  selectedConversationId,
  onSelectConversation,
  onNewConversation,
  refreshTrigger = 0,
  hideEmptyConversations = false,
  isCollapsed = false,
}: ConversationListProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [pinnedConversations, setPinnedConversations] = useState<Set<string>>(new Set());
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const dropdownTriggerRef = useRef<HTMLButtonElement>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadConversations = useCallback(async () => {
    if (isRefreshing) {
      console.log('[ConversationList] 正在刷新中，跳过');
      return;
    }

    try {
      setIsRefreshing(true);
      setLoading(true);
      const response = await fetch('/api/conversations');
      if (response.ok) {
        const data = await response.json();
        console.log('[ConversationList] 加载对话列表完成', { count: data.conversations?.length || 0 });
        
        const savedPins = localStorage.getItem('pinned-conversations');
        if (savedPins) {
          setPinnedConversations(new Set(JSON.parse(savedPins)));
        }
        
        // 基于 title 判断是否有内容
        let filteredConversations = data.conversations || [];
        if (hideEmptyConversations) {
          filteredConversations = filteredConversations.filter(
            (conv: Conversation) => {
              const hasContent = conv.title && conv.title !== '新对话';
              return hasContent;
            }
          );
        }
        
        setConversations(filteredConversations);
        console.log('[ConversationList] 过滤后剩余:', filteredConversations.length);
      }
    } catch (error) {
      console.error('[ConversationList] 加载异常:', error);
    } finally {
      setLoading(false);
      setTimeout(() => setIsRefreshing(false), 500);
    }
  }, [hideEmptyConversations, isRefreshing]);

  // 加载单个对话的详细内容
  const loadConversationDetail = async (conversationId: string) => {
    try {
      console.log('[ConversationList] 加载对话详情:', conversationId);
      const response = await fetch(`/api/conversations/${conversationId}`);
      if (response.ok) {
        const data = await response.json();
        console.log('[ConversationList] 对话详情加载成功:', data);
        
        window.dispatchEvent(new CustomEvent('load-conversation', {
          detail: {
            conversationId: data.conversation.id,
            messages: data.conversation.messages || [],
            files: data.conversation.files || []
          }
        }));
        
        return data;
      }
    } catch (error) {
      console.error('[ConversationList] 加载对话详情失败:', error);
    }
  };

  const togglePin = (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    const newPins = new Set(pinnedConversations);
    if (newPins.has(conversationId)) {
      newPins.delete(conversationId);
    } else {
      newPins.add(conversationId);
    }
    
    setPinnedConversations(newPins);
    localStorage.setItem('pinned-conversations', JSON.stringify(Array.from(newPins)));
    setOpenDropdownId(null);
  };

  const handleTitleClick = async (conversation: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    console.log('[ConversationList] 点击标题导入对话:', conversation.id);
    
    onSelectConversation(conversation.id);
    
    window.dispatchEvent(new CustomEvent('select-conversation', {
      detail: { conversationId: conversation.id }
    }));
    
    await loadConversationDetail(conversation.id);
  };

  const handleCardClick = (conversation: Conversation) => {
    console.log('[ConversationList] 点击卡片加载对话:', conversation.id);
    onSelectConversation(conversation.id);
    
    window.dispatchEvent(new CustomEvent('select-conversation', {
      detail: { conversationId: conversation.id }
    }));
    
    loadConversationDetail(conversation.id);
  };

  const filteredAndSortedConversations = useMemo(() => {
    let filtered = conversations.filter(conv => {
      const title = getDisplayTitle(conv).toLowerCase();
      const searchLower = searchTerm.toLowerCase();
      return title.includes(searchLower);
    });

    return filtered.sort((a, b) => {
      const aPinned = pinnedConversations.has(a.id);
      const bPinned = pinnedConversations.has(b.id);
      
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [conversations, searchTerm, pinnedConversations]);

  useEffect(() => {
    loadConversations();
  }, [refreshTrigger]);

  // 监听新建对话事件
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const handleNewConversation = () => {
      console.log('[ConversationList] 收到新建对话事件，准备刷新');
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => {
        console.log('[ConversationList] 执行刷新');
        loadConversations();
      }, 100);
    };

    window.addEventListener('new-conversation', handleNewConversation);
    
    return () => {
      window.removeEventListener('new-conversation', handleNewConversation);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [loadConversations]);

  const handleDelete = async (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    if (!confirm('确定要删除这条对话记录吗？')) {
      return;
    }

    try {
      const response = await fetch(`/api/conversations/${conversationId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        await loadConversations();
        if (selectedConversationId === conversationId) {
          onSelectConversation(null);
        }
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      alert('删除失败，请稍后重试');
    } finally {
      setOpenDropdownId(null);
    }
  };

  const handleRename = async (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    const newTitle = prompt('请输入新的对话标题：');
    if (!newTitle || newTitle.trim() === '') {
      setOpenDropdownId(null);
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
        await loadConversations();
      }
    } catch (error) {
      console.error('Failed to rename conversation:', error);
      alert('重命名失败，请稍后重试');
    } finally {
      setOpenDropdownId(null);
    }
  };

  const handleShare = async (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    try {
      const response = await fetch(`/api/conversations/${conversationId}`);
      if (!response.ok) {
        alert('获取对话失败，请稍后重试');
        return;
      }

      const { conversation } = await response.json();
      const shareUrl = `${window.location.origin}/?conversation=${conversationId}`;

      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        alert('分享链接已复制到剪贴板！');
      } else {
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
    } finally {
      setOpenDropdownId(null);
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
        await loadConversations();
        onSelectConversation(null);
        alert('所有对话记录已清空');
      }
    } catch (error) {
      console.error('Failed to clear all conversations:', error);
      alert('清空失败，请稍后重试');
    }
  };

  // 如果是收起状态，显示简化版本
  if (isCollapsed) {
    return (
      <div className="flex flex-col items-center py-4 space-y-4">
        {/* 新建对话按钮 */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
              onClick={onNewConversation}
            >
              <Plus className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>新建对话</p>
          </TooltipContent>
        </Tooltip>

        {/* 对话列表图标 - 只显示前5个 */}
        {!loading && conversations.length > 0 && (
          <div className="space-y-2">
            {conversations.slice(0, 5).map((conv) => (
              <Tooltip key={conv.id}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "h-9 w-9 rounded-full",
                      selectedConversationId === conv.id
                        ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600"
                        : "hover:bg-slate-100 dark:hover:bg-slate-800"
                    )}
                    onClick={() => handleCardClick(conv)}
                  >
                    <MessageSquare className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>{getDisplayTitle(conv)}</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        )}

        {/* 搜索按钮 */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
              onClick={() => {}} // 可以打开搜索模态框
            >
              <Search className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>搜索对话</p>
          </TooltipContent>
        </Tooltip>
      </div>
    );
  }

  // 展开状态：完整显示
  return (
    <div className="flex flex-col h-full">
      {/* 头部区域 - 优化样式 */}
      <div className="py-4 px-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 sticky top-0 z-50">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-1.5">
            <History className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            <h2 className="text-sm font-medium text-slate-700 dark:text-slate-300">
              对话历史
            </h2>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 rounded-full text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                onClick={handleClearAll}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">清空所有对话记录</p>
            </TooltipContent>
          </Tooltip>
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500">管理所有报价对话记录</p>
      </div>

      {/* 搜索框 */}
      <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input
            type="text"
            placeholder="搜索对话..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 h-8 text-xs bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 focus:ring-1 focus:ring-blue-500 rounded-md"
          />
        </div>
      </div>

      {/* 对话列表 */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-3 space-y-1">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mb-2"></div>
              <p className="text-xs text-slate-400">加载中...</p>
            </div>
          ) : filteredAndSortedConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
              <p className="text-xs text-slate-400 mb-1">
                {searchTerm ? '没有找到匹配的对话' : '暂无对话记录'}
              </p>
              <p className="text-xs text-slate-400">
                {searchTerm ? '试试其他关键词' : '开始第一次报价吧'}
              </p>
            </div>
          ) : (
            filteredAndSortedConversations.map((conversation) => {
              const displayTitle = getDisplayTitle(conversation);
              const isPinned = pinnedConversations.has(conversation.id);
              const timeStr = formatTime(conversation.updatedAt);
              
              return (
                <div
                  key={conversation.id}
                  className={`group relative p-2.5 pr-10 rounded-lg cursor-pointer transition-all duration-200 border ${
                    selectedConversationId === conversation.id
                      ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 shadow-sm'
                      : 'bg-white dark:bg-slate-900 border-transparent hover:border-slate-200 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                  onClick={() => handleCardClick(conversation)}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-shrink-0 mt-0.5">
                      {isPinned ? (
                        <Pin className="h-3.5 w-3.5 text-amber-500" />
                      ) : (
                        <MessageSquare className="h-3.5 w-3.5 text-slate-400 group-hover:text-slate-500" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <button
                          onClick={(e) => handleTitleClick(conversation, e)}
                          className="text-left flex-1 hover:underline decoration-blue-500 underline-offset-2 transition-all duration-200"
                        >
                          <span className={`text-xs ${
                            selectedConversationId === conversation.id
                              ? 'text-blue-700 dark:text-blue-300 font-medium'
                              : 'text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400'
                          }`}>
                            {displayTitle}
                          </span>
                        </button>
                        
                        {timeStr && (
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 whitespace-nowrap">
                            {timeStr}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 操作菜单按钮 - 悬停显示 */}
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <DropdownMenu 
                      open={openDropdownId === conversation.id}
                      onOpenChange={(open) => {
                        setOpenDropdownId(open ? conversation.id : null);
                        if (!open && dropdownTriggerRef.current) {
                          setTimeout(() => {
                            dropdownTriggerRef.current?.focus();
                          }, 0);
                        }
                      }}
                    >
                      <DropdownMenuTrigger asChild>
                        <Button
                          ref={dropdownTriggerRef}
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 rounded-full bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem
                          onClick={(e) => togglePin(conversation.id, e)}
                          className="text-xs py-1.5"
                        >
                          {isPinned ? (
                            <>
                              <PinOff className="h-3.5 w-3.5 mr-2" />
                              取消置顶
                            </>
                          ) : (
                            <>
                              <Pin className="h-3.5 w-3.5 mr-2" />
                              置顶
                            </>
                          )}
                        </DropdownMenuItem>

                        <DropdownMenuItem
                          onClick={(e) => handleShare(conversation.id, e)}
                          className="text-xs py-1.5"
                        >
                          <Share2 className="h-3.5 w-3.5 mr-2" />
                          分享
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => handleRename(conversation.id, e)}
                          className="text-xs py-1.5"
                        >
                          <Pencil className="h-3.5 w-3.5 mr-2" />
                          重命名
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => handleDelete(conversation.id, e)}
                          className="text-xs py-1.5 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-2" />
                          删除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
