'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {  AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import {
  MessageSquare,
  Plus,
  Settings,
  LogOut,
  History,
  Trash2,
  Edit2,
  Check,
  X,
  MoreHorizontal,
  Archive,
  Star,
  Clock,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/components/ui/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Conversation {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: Date;
  isStarred?: boolean;
  isArchived?: boolean;
}

export default function Sidebar() {
  const router = useRouter();
  const { toast } = useToast();
  const [conversations, setConversations] = useState<Conversation[]>([
    {
      id: '1',
      title: '工业空调报价咨询',
      lastMessage: '需要3台5匹工业空调的报价',
      timestamp: new Date(Date.now() - 1000 * 60 * 30),
      isStarred: true,
    },
    {
      id: '2',
      title: '污水处理设备',
      lastMessage: '询价：污水处理设备一套',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2),
    },
    {
      id: '3',
      title: '水泵采购',
      lastMessage: '需要10台离心泵的报价',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24),
      isStarred: true,
    },
  ]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [filter, setFilter] = useState<'all' | 'starred' | 'archived'>('all');

  const filteredConversations = conversations.filter((conv) => {
    if (filter === 'starred') return conv.isStarred;
    if (filter === 'archived') return conv.isArchived;
    return !conv.isArchived;
  });

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;
    return date.toLocaleDateString();
  };

  // 新对话功能
  const handleNewChat = () => {
    const newId = Date.now().toString();
    const newConversation: Conversation = {
      id: newId,
      title: '新对话',
      lastMessage: '开始新的报价咨询',
      timestamp: new Date(),
    };
    setConversations([newConversation, ...conversations]);

    // 跳转到新对话页面
    router.push(`/chat/${newId}`);

    // 触发全局事件，通知 ChatArea 刷新
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('new-conversation', { detail: { id: newId } }));
    }

    toast({
      title: '新对话已创建',
      description: '开始您的报价咨询',
      duration: 2000,
    });
  };

  const handleSelectChat = (id: string) => {
    router.push(`/chat/${id}`);
  };

  const handleDelete = (id: string) => {
    setDeleteId(id);
    setShowDeleteDialog(true);
  };

  const confirmDelete = () => {
    if (deleteId) {
      setConversations(conversations.filter((c) => c.id !== deleteId));
      toast({
        title: '删除成功',
        description: '对话已删除',
        duration: 2000,
      });
      setDeleteId(null);
      setShowDeleteDialog(false);

      // 如果删除的是当前对话，跳转到首页
      if (window.location.pathname.includes(`/chat/${deleteId}`)) {
        router.push('/');
      }
    }
  };

  const handleArchive = (id: string) => {
    setConversations(
      conversations.map((c) => (c.id === id ? { ...c, isArchived: !c.isArchived } : c))
    );
    toast({
      title: '操作成功',
      description: '对话已归档',
      duration: 2000,
    });
  };

  const handleStar = (id: string) => {
    setConversations(
      conversations.map((c) => (c.id === id ? { ...c, isStarred: !c.isStarred } : c))
    );
    toast({
      title: '操作成功',
      description: '已更新收藏状态',
      duration: 2000,
    });
  };

  const handleRename = (id: string, currentTitle: string) => {
    setEditingId(id);
    setEditTitle(currentTitle);
  };

  const saveRename = (id: string) => {
    if (editTitle.trim()) {
      setConversations(conversations.map((c) => (c.id === id ? { ...c, title: editTitle } : c)));
      toast({
        title: '重命名成功',
        duration: 2000,
      });
    }
    setEditingId(null);
    setEditTitle('');
  };

  return (
    <>
      <div className="flex flex-col h-full bg-white dark:bg-gray-950 border-r border-gray-200 dark:border-gray-800">
        {/* 头部 - 只保留logo和标题 */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-brand-primary to-brand-secondary rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">报</span>
            </div>
            <span className="font-semibold text-lg">报个价</span>
          </div>
        </div>

        {/* 对话历史标题和筛选 */}
        <div className="px-4 py-3 flex items-center justify-between border-b border-gray-200 dark:border-gray-800">
          <h3 className="font-medium text-sm text-gray-500 dark:text-gray-400">对话历史</h3>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className={`h-7 px-2 ${filter === 'all' ? 'bg-gray-100 dark:bg-gray-800' : ''}`}
              onClick={() => setFilter('all')}
            >
              全部
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={`h-7 px-2 ${filter === 'starred' ? 'bg-gray-100 dark:bg-gray-800' : ''}`}
              onClick={() => setFilter('starred')}
            >
              <Star className="h-3 w-3 mr-1" />
              收藏
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={`h-7 px-2 ${filter === 'archived' ? 'bg-gray-100 dark:bg-gray-800' : ''}`}
              onClick={() => setFilter('archived')}
            >
              <Archive className="h-3 w-3 mr-1" />
              归档
            </Button>
          </div>
        </div>

        {/* 对话列表 */}
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {filteredConversations.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">暂无对话记录</p>
                <p className="text-xs mt-1">点击下方按钮开始新对话</p>
              </div>
            ) : (
              filteredConversations.map((conv) => (
                <div
                  key={conv.id}
                  className="group relative rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  {editingId === conv.id ? (
                    <div className="p-2">
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="w-full px-2 py-1 text-sm border rounded dark:bg-gray-700 dark:border-gray-600"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveRename(conv.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                      />
                      <div className="flex justify-end gap-1 mt-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2"
                          onClick={() => saveRename(conv.id)}
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2"
                          onClick={() => setEditingId(null)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <button
                        className="w-full text-left p-2 pr-16"
                        onClick={() => handleSelectChat(conv.id)}
                      >
                        <div className="flex items-start gap-2">
                          <MessageSquare className="h-4 w-4 mt-0.5 text-gray-400 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1">
                              <span className="font-medium text-sm truncate">{conv.title}</span>
                              {conv.isStarred && (
                                <Star className="h-3 w-3 fill-yellow-400 text-yellow-400 flex-shrink-0" />
                              )}
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                              {conv.lastMessage}
                            </p>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                              {formatTime(conv.timestamp)}
                            </p>
                          </div>
                        </div>
                      </button>

                      {/* 操作按钮组 */}
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-white dark:bg-gray-950 pl-1">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuLabel>对话操作</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleStar(conv.id)}>
                              <Star
                                className={`h-4 w-4 mr-2 ${conv.isStarred ? 'fill-yellow-400' : ''}`}
                              />
                              {conv.isStarred ? '取消收藏' : '收藏'}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleArchive(conv.id)}>
                              <Archive className="h-4 w-4 mr-2" />
                              {conv.isArchived ? '取消归档' : '归档'}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleRename(conv.id, conv.title)}>
                              <Edit2 className="h-4 w-4 mr-2" />
                              重命名
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => handleDelete(conv.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              删除
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        {/* 底部 - 新建对话按钮 */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-800">
          <Button
            className="w-full bg-gradient-to-r from-brand-primary to-brand-secondary hover:from-brand-primary/90 hover:to-brand-secondary/90 text-white"
            onClick={handleNewChat}
          >
            <Plus className="h-4 w-4 mr-2" />
            新建对话
          </Button>
        </div>
      </div>

      {/* 删除确认对话框 */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>此操作无法撤销，对话将被永久删除。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
