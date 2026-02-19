'use client';

import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Bot, User, FileText, RefreshCw, Copy, Pencil, Square, Link as LinkIcon } from 'lucide-react';
import QuoteTable from './quote-table';
import IntentSelector from './intent-selector';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface SupplierInfo {
  companyName: string;
  logoUrl?: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  bankName: string;
  bankAccount: string;
  taxNumber: string;
}

interface Message {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  quoteData?: any;
  files?: FileUpload[];
  fileData?: any[];
  isTemporary?: boolean;
  fileGroupId?: string;
  currentChoice?: string;
}

interface FileUpload {
  id: string;
  name: string;
  size: string;
  type: string;
  url?: string;
}

interface ChatMessageProps {
  message: Message;
  onRegenerate?: (messageId: number) => void;
  supplierInfo?: SupplierInfo;
  onUpdateProductPrice?: (messageId: number, productIndex: number, newPrice: number) => void;
  onIntentSelection?: (intent: 'quote' | 'proposal' | 'both') => void;
}

export default function ChatMessage({ message, onRegenerate, supplierInfo, onUpdateProductPrice, onIntentSelection }: ChatMessageProps) {
  const isUser = message.role === 'user';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleUpdateProductPrice = (productIndex: number, newPrice: number) => {
    if (onUpdateProductPrice) {
      onUpdateProductPrice(message.id, productIndex, newPrice);
    }
  };

  const handleIntentSelection = (intent: 'quote' | 'proposal' | 'both') => {
    if (onIntentSelection) {
      onIntentSelection(intent);
    }
  };

  const getRecommendation = (files: any[]) => {
    const hasExcel = files.some(f =>
      f.type?.includes('sheet') ||
      f.type?.includes('excel') ||
      f.productCount > 0
    );
    const hasDocs = files.some(f =>
      f.type?.includes('pdf') ||
      f.type?.includes('image') ||
      f.productCount === undefined
    );

    if (hasExcel && !hasDocs) return '📊 仅报价单';
    if (!hasExcel && hasDocs) return '📝 仅方案书';
    if (hasExcel && hasDocs) return '📑 方案+报价';
    return '📊 仅报价单';
  };

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''} max-w-full`}>
      {/* 头像 */}
      <Avatar className={`h-9 w-9 flex-shrink-0 shadow-sm ${
        isUser
          ? 'bg-gradient-to-br from-blue-500 to-blue-600'
          : 'bg-gradient-to-br from-emerald-500 to-emerald-600'
      }`}>
        <div className="flex h-full w-full items-center justify-center text-white">
          {isUser ? (
            <User className="h-5 w-5" />
          ) : (
            <Bot className="h-5 w-5" />
          )}
        </div>
      </Avatar>

      {/* 消息内容 */}
      <div className={`flex-1 min-w-0 space-y-3 ${isUser ? 'text-right' : ''}`}>
        <Card className={`p-4 w-full shadow-sm transition-all duration-200 overflow-hidden ${
          isUser ? 'ml-auto max-w-2xl' : 'mr-auto max-w-none'
        } ${
          isUser
            ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0'
            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
        }`}>
          {/* 文件列表 */}
          {message.files && message.files.length > 0 && (
            <div className={`flex flex-wrap gap-2 mb-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
              {message.files.map((file) => (
                <div
                  key={file.id}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                    isUser
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                  }`}
                >
                  <FileText className="h-4 w-4" />
                  <span>{file.name}</span>
                </div>
              ))}
            </div>
          )}

          {/* 文本内容 */}
          <div className={`whitespace-pre-wrap text-left leading-relaxed break-words overflow-x-hidden ${
            isUser ? 'text-white' : 'text-slate-900 dark:text-slate-100'
          }`}>
            {message.content}
          </div>
        </Card>

        {/* 意图选择界面 - 仅在临时消息且有文件数据时显示 */}
        {message.isTemporary && message.fileData && message.fileData.length > 0 && message.fileGroupId && (
          <Card className="p-4 w-full bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="space-y-4">
              {/* 文件列表 */}
              <div>
                <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-3">✅ 文件解析完成</h3>
                <div className="space-y-2">
                  {message.fileData.map((file: any, index: number) => (
                    <div
                      key={file.id || file.fileKey || index}
                      className="flex items-center gap-3 px-4 py-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg text-sm"
                    >
                      <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      <span className="flex-1 text-slate-900 dark:text-slate-100 font-medium">
                        {file.name || `文件${index + 1}`}
                      </span>
                      <span className="text-slate-600 dark:text-slate-400">
                        {file.productCount !== undefined ? `${file.productCount}个产品` : '文档'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 意图选择器组件 */}
              <div>
                <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-3">请选择需要生成的内容：</h3>
                <IntentSelector
                  fileGroupId={message.fileGroupId}
                  files={message.fileData}
                  currentChoice={message.currentChoice}
                />
              </div>

              {/* 提示信息 */}
              <p className="text-xs text-slate-500 dark:text-slate-500 text-center">
                您也可以直接输入数字 1、2 或 3 来快速选择
              </p>
            </div>
          </Card>
        )}

        {/* 报价表格 */}
        {message.quoteData && (
          <div className="w-full">
            <QuoteTable
              data={message.quoteData}
              supplierInfo={supplierInfo}
              onUpdateProductPrice={handleUpdateProductPrice}
            />
          </div>
        )}

        {/* 功能区域 */}
        <TooltipProvider>
          <div className={`flex items-center gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
            {/* 用户消息：复制图标 */}
            {isUser && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleCopy}
                    className="h-7 w-7 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  >
                    <Copy className="h-3.5 w-3.5 text-slate-600 dark:text-slate-400" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="bg-black text-white text-xs px-2 py-1 rounded shadow-md">
                  复制
                </TooltipContent>
              </Tooltip>
            )}

            {/* 用户消息：链接图标（分享） */}
            {isUser && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  >
                    <LinkIcon className="h-3.5 w-3.5 text-slate-600 dark:text-slate-400" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="bg-black text-white text-xs px-2 py-1 rounded shadow-md">
                  分享
                </TooltipContent>
              </Tooltip>
            )}

            {/* AI消息：窗口图标（转发/分享） */}
            {!isUser && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  >
                    <Square className="h-3.5 w-3.5 text-slate-600 dark:text-slate-400" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="bg-black text-white text-xs px-2 py-1 rounded shadow-md">
                  转发
                </TooltipContent>
              </Tooltip>
            )}

            {/* 铅笔图标（编辑） */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5 text-slate-600 dark:text-slate-400" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="bg-black text-white text-xs px-2 py-1 rounded shadow-md">
                编辑
              </TooltipContent>
            </Tooltip>

            {/* AI消息：复制按钮 */}
            {!isUser && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopy}
                className="h-7 px-3 rounded-full bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 text-white text-xs transition-colors"
              >
                复制
              </Button>
            )}

            {/* AI消息：重新生成按钮 */}
            {!isUser && onRegenerate && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRegenerate(message.id)}
                className="h-7 px-3 rounded-full text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 text-xs transition-colors"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                重新生成
              </Button>
            )}
          </div>
        </TooltipProvider>

        {/* 时间戳 */}
        <div className={`text-xs text-muted-foreground flex items-center gap-1 ${isUser ? 'justify-end' : 'justify-start'}`}>
          {formatDistanceToNow(new Date(message.timestamp), {
            addSuffix: true,
            locale: zhCN,
          })}
        </div>
      </div>
    </div>
  );
}
