'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  User, Bot, RotateCw, FileText, 
  Sparkles, FileSpreadsheet, File as FileIcon, Image as ImageIcon,
  FileText as FileTextIcon, FileSpreadsheet as FileSpreadsheetIcon,
  RefreshCw, Printer, Copy, Edit2
} from 'lucide-react';
import QuoteTable from '@/components/quote-table';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface Message {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  quoteData?: any;
  files?: any[];
  fileData?: any[];
  isTemporary?: boolean;
  action?: string;
  fileGroupId?: string;
  currentChoice?: string;
  metadata?: {
    intent?: string;
    inputType?: string;
    confidence?: number;
    entities?: any;
  };
}

interface ChatMessageProps {
  message: Message;
  onRegenerate?: (messageId: number) => void;
  supplierInfo?: any;
  onUpdateProductPrice?: (messageId: number, productIndex: number, newPrice: number) => void;
  onUpdateProductQuantity?: (messageId: number, productIndex: number, newQuantity: number) => void;
  onIntentSelection?: (intent: 'quote' | 'proposal' | 'both') => void;
  onEdit?: (messageId: number, newContent: string) => void;
}

// ============================================================================
// 修复：完整提取汇总行，保持原始格式
// ============================================================================

const fixTableStructure = (htmlContent: string): string => {
  if (!htmlContent) return htmlContent;

  console.log('[修复] 开始修复，原始HTML长度:', htmlContent.length);

  // 1. 提取所有表格
  const tableRegex = /<table\b([^>]*)>([\s\S]*?)<\/table>/gi;
  const tables: Array<{original: string; attrs: string; body: string}> = [];
  let match;
  
  while ((match = tableRegex.exec(htmlContent)) !== null) {
    tables.push({
      original: match[0],
      attrs: match[1],
      body: match[2]
    });
  }

  console.log(`[修复] 找到 ${tables.length} 个表格`);

  // 如果没有表格，直接返回
  if (tables.length === 0) {
    console.log('[修复] 没有找到表格，直接返回原始内容');
    return htmlContent;
  }

  // 2. 清理每个表格中的重复汇总行
  const cleanedTables = tables.map((table, index) => {
    console.log(`[修复] 处理表格${index}`);
    
    // 检查表格是否包含所有汇总项
    const hasAllSummaries = 
      table.body.includes('设备小计') &&
      table.body.includes('运费') &&
      table.body.includes('小计') &&
      table.body.includes('增值税') &&
      table.body.includes('合计金额') &&
      table.body.includes('大写金额');
    
    console.log(`[修复] 表格${index}包含所有汇总项: ${hasAllSummaries}`);
    
    if (hasAllSummaries) {
      // 方法：找到"设备小计"开始的位置和"大写金额"结束的位置
      // 提取完整的汇总行
      
      // 找到"设备小计"在body中的位置
      const subtotalStart = table.body.indexOf('设备小计');
      if (subtotalStart === -1) {
        console.log('[修复] 未找到设备小计，跳过');
        return {
          original: table.original,
          attrs: table.attrs,
          body: table.body
        };
      }
      
      // 找到从设备小计开始，向后找最后一个">"，这通常是tr标签的结束
      // 然后找到这个tr标签的开始
      const beforeSubtotal = table.body.substring(0, subtotalStart);
      const lastTrStart = beforeSubtotal.lastIndexOf('<tr');
      
      if (lastTrStart === -1) {
        console.log('[修复] 未找到tr标签开始，跳过');
        return {
          original: table.original,
          attrs: table.attrs,
          body: table.body
        };
      }
      
      console.log(`[修复] 找到tr标签开始位置: ${lastTrStart}`);
      
      // 找到"大写金额"在body中的位置（从lastTrStart开始）
      const amountEnd = table.body.indexOf('大写金额', lastTrStart);
      if (amountEnd === -1) {
        console.log('[修复] 未找到大写金额，跳过');
        return {
          original: table.original,
          attrs: table.attrs,
          body: table.body
        };
      }
      
      // 找到包含大写金额的tr标签的结束位置
      // 从amountEnd开始，找"</tr>"
      const trEnd = table.body.indexOf('</tr>', amountEnd);
      if (trEnd === -1) {
        console.log('[修复] 未找到</tr>标签，跳过');
        return {
          original: table.original,
          attrs: table.attrs,
          body: table.body
        };
      }
      
      // 提取完整的汇总行（包含所有<tr>标签）
      const summaryRows = table.body.substring(lastTrStart, trEnd + 5); // +5 是因为"</tr>"的长度
      console.log(`[修复] 提取汇总行，长度: ${summaryRows.length}`);
      console.log(`[修复] 汇总行开头: ${summaryRows.substring(0, 50)}...`);
      
      // 移除所有旧的汇总行（从lastTrStart到trEnd之后）
      let cleanedBody = table.body.substring(0, lastTrStart) + 
                       table.body.substring(trEnd + 5);
      
      // 将汇总行添加到末尾
      cleanedBody = cleanedBody + summaryRows;
      
      console.log(`[修复] 清理后body长度: ${cleanedBody.length} (原始: ${table.body.length})`);
      
      return {
        original: table.original,
        attrs: table.attrs,
        body: cleanedBody
      };
    }
    
    // 如果没有所有汇总项，直接返回原始表格
    return {
      original: table.original,
      attrs: table.attrs,
      body: table.body
    };
  });

  // 3. 重建HTML
  let result = htmlContent;
  
  // 替换每个表格为清理后的版本
  for (const table of cleanedTables) {
    const cleanedTable = `<table${table.attrs}>${table.body}</table>`;
    if (table.original !== cleanedTable) {
      result = result.replace(table.original, cleanedTable);
      console.log('[修复] 已替换表格');
    }
  }

  // 4. 移除外层的div容器中的汇总段落
  const summaryDivRegex = /<div[^>]*>\s*(?:设备小计[\s\S]*?大写金额[^<]*)\s*<\/div>/gi;
  result = result.replace(summaryDivRegex, '');
  console.log('[修复] 移除了外层的汇总div容器');

  console.log('[修复] 完成，结果长度:', result.length, ' (原始:', htmlContent.length, ')');
  return result;
};

// ============================================================================
// iframe容器 - 使用修复后的内容
// ============================================================================

const IframeHTMLContainer = ({ htmlContent }: { htmlContent: string }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [iframeHeight, setIframeHeight] = useState(400);
  const contentRef = useRef<string>(htmlContent);

  // 保存并修复内容
  useEffect(() => {
    const fixedContent = fixTableStructure(htmlContent);
    contentRef.current = fixedContent;
  }, [htmlContent]);

  // 渲染iframe内容的函数
  const renderIframeContent = () => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          ${contentRef.current.match(/<style[^>]*>[\s\S]*?<\/style>/gi)?.join('') || ''}
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              padding: 20px;
              background: white;
              color: #333;
              line-height: 1.6;
            }
            table { 
              width: 100%; 
              border-collapse: collapse; 
              margin-bottom: 20px;
            }
            th { 
              background-color: #f8fafc; 
              font-weight: 600;
              padding: 12px 8px;
              border: 1px solid #e2e8f0;
              text-align: left;
            }
            td { 
              padding: 8px;
              border: 1px solid #e2e8f0;
            }
            .download-buttons, button, .btn, [class*="download"] {
              display: none !important;
            }
            @media print {
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          ${contentRef.current.replace(/<style[\s\S]*?<\/style>/g, '')}
        </body>
      </html>
    `);
    doc.close();

    // 调整高度
    setTimeout(() => {
      if (iframe.contentWindow?.document.body) {
        const height = iframe.contentWindow.document.body.scrollHeight;
        setIframeHeight(Math.min(height + 20, 800));
      }
    }, 100);
  };

  // 展开/收起时重新渲染
  useEffect(() => {
    if (isExpanded) {
      setTimeout(renderIframeContent, 50);
    }
  }, [isExpanded]);

  // 初始渲染
  useEffect(() => {
    if (isExpanded) {
      renderIframeContent();
    }
  }, []);

  // 处理打印
  const handlePrint = () => {
    console.log('[打印] 开始打印');
    if (!iframeRef.current || !contentRef.current) return;
    
    const iframe = iframeRef.current;
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    
    if (!iframeDoc) {
      console.log('[打印] 无法获取iframe内容');
      return;
    }

    try {
      if (iframe.contentWindow) {
        iframe.contentWindow.print();
        console.log('[打印] 打印成功');
      } else {
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
          alert('请允许弹出窗口');
          return;
        }

        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="UTF-8">
              <title>报价单</title>
              ${contentRef.current.match(/<style[^>]*>[\s\S]*?<\/style>/gi)?.join('') || ''}
              <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                th { background-color: #f2f2f2; }
                @media print {
                  body { padding: 0; }
                }
              </style>
            </head>
            <body>
              ${contentRef.current.replace(/<style[\s\S]*?<\/style>/g, '')}
            </body>
          </html>
        `);
        
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => printWindow.print(), 500);
      }
    } catch (error) {
      console.error('[打印] 打印失败:', error);
      alert('打印失败，请重试');
    }
  };

  // 检查是否是完整HTML
  const isFullHTML = htmlContent.includes('<!DOCTYPE html') || 
                     htmlContent.includes('<html') || 
                     htmlContent.includes('<style') ||
                     htmlContent.includes('<table');

  if (!isFullHTML) {
    return null;
  }

  return (
    <div className="w-full mt-2 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
          📄 报价单
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="text-xs gap-1"
          >
            <Printer className="h-3 w-3" />
            打印/导出PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs"
          >
            {isExpanded ? '收起报价单' : '展开完整报价单'}
          </Button>
        </div>
      </div>
      
      {isExpanded && (
        <iframe
          ref={iframeRef}
          className="w-full border rounded-lg bg-white"
          style={{ 
            height: `${iframeHeight}px`,
            minHeight: '300px'
          }}
          title="报价单"
          sandbox="allow-same-origin allow-scripts allow-modals allow-popups"
        />
      )}
      {!isExpanded && (
        <div className="text-sm text-slate-600 bg-slate-50 p-4 rounded-lg border">
          <p className="mb-2">📋 专业报价单已生成</p>
          <p className="text-xs">点击"展开完整报价单"查看详细内容</p>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 简单的Markdown渲染组件
// ============================================================================

const SimpleMarkdown = ({ content }: { content: string }) => {
  if (!content) return null;
  
  return (
    <div className="whitespace-pre-wrap break-words">
      {content.split('\n').map((line, i) => (
        <p key={i} className="mb-1">{line}</p>
      ))}
    </div>
  );
};

// ============================================================================
// 编辑对话框组件 - 修复内容显示不全问题
// ============================================================================

interface EditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialContent: string;
  onSave: (content: string) => void;
}

const EditDialog = ({ open, onOpenChange, initialContent, onSave }: EditDialogProps) => {
  const [content, setContent] = useState(initialContent);

  useEffect(() => {
    setContent(initialContent);
  }, [initialContent, open]);

  const handleSave = () => {
    onSave(content.trim());
    onOpenChange(false);
  };

  const handleCancel = () => {
    setContent(initialContent);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl flex flex-col max-h-[85vh]">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>编辑消息内容</DialogTitle>
          <DialogDescription>
            修改消息内容后点击保存，内容将更新到对话框中
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 min-h-0 my-4 overflow-hidden">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="请输入消息内容..."
            className="h-full min-h-[300px] resize-y border-2 focus-visible:ring-2 focus-visible:ring-blue-500"
            autoFocus
          />
        </div>

        <DialogFooter className="flex-shrink-0">
          <Button 
            variant="outline" 
            onClick={handleCancel}
          >
            取消
          </Button>
          <Button 
            onClick={handleSave}
            disabled={!content.trim()}
            className="bg-blue-600 hover:bg-blue-700"
          >
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default function ChatMessage({ 
  message, 
  onRegenerate, 
  supplierInfo,
  onUpdateProductPrice,
  onUpdateProductQuantity,
  onIntentSelection,
  onEdit
}: ChatMessageProps) {
  const { toast } = useToast();
  const [selectedIntent, setSelectedIntent] = useState<'quote' | 'proposal' | 'both' | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const getFileIcon = (fileType: string) => {
    if (fileType.includes('image')) return <ImageIcon className="h-4 w-4" />;
    if (fileType.includes('spreadsheet') || fileType.includes('excel')) return <FileSpreadsheetIcon className="h-4 w-4" />;
    if (fileType.includes('pdf')) return <FileTextIcon className="h-4 w-4" />;
    if (fileType.includes('word') || fileType.includes('document')) return <FileTextIcon className="h-4 w-4" />;
    return <FileIcon className="h-4 w-4" />;
  };

  const formatTime = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const isQuoteMessage = (): boolean => {
    return !!(message.quoteData || 
      (message.content && (
        message.content.includes('报价单') || 
        message.content.includes('<table')
      ))
    );
  };

  const getQuoteData = () => {
    if (message.quoteData) return message.quoteData;
    return null;
  };

  const handleRegenerate = () => {
    if (onRegenerate) {
      onRegenerate(message.id);
    }
  };

  const handleCopy = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      toast({
        title: "复制成功",
        description: "内容已复制到剪贴板",
        variant: "default",
      });
    } catch (error) {
      console.error('Failed to copy:', error);
      toast({
        title: "复制失败",
        description: "无法复制内容",
        variant: "destructive",
      });
    }
  };

  // 修改：打开编辑对话框
  const handleEdit = () => {
    console.log('[编辑] 点击编辑按钮');
    console.log('[编辑] onEdit 是否存在:', !!onEdit);
    
    if (onEdit) {
      console.log('[编辑] 打开编辑对话框');
      setIsEditDialogOpen(true);
    } else {
      console.warn('[编辑] 编辑功能需要父组件提供 onEdit 回调');
      toast({
        title: "编辑功能暂不可用",
        description: "请先在父组件中实现 onEdit 回调",
        variant: "destructive",
      });
    }
  };

  // 保存编辑内容
  const handleSaveEdit = (newContent: string) => {
    console.log('[编辑] 保存编辑内容');
    console.log('[编辑] 原内容:', message.content);
    console.log('[编辑] 新内容:', newContent);
    
    onEdit?.(message.id, newContent);
  };

  const handleIntentSelect = (intent: 'quote' | 'proposal' | 'both') => {
    setSelectedIntent(intent);
    if (onIntentSelection) {
      onIntentSelection(intent);
    }
  };

  const getFiles = () => {
    return message.files || message.fileData || [];
  };

  // 渲染用户消息 - 修复布局和添加按钮
  const renderUserMessage = () => {
    const files = getFiles();
    
    return (
      <div className="flex items-start gap-3 flex-row-reverse">
        <Avatar className="h-8 w-8 flex-shrink-0">
          <AvatarFallback className="bg-blue-100 text-blue-700">
            <User className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0 space-y-2 text-right">
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2 justify-end">
              {files.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-full text-xs"
                >
                  {getFileIcon(file.type || '')}
                  <span className="max-w-32 truncate">{file.name || '文件'}</span>
                </div>
              ))}
            </div>
          )}
          
          <div className="bg-blue-50 text-slate-900 rounded-lg p-3 text-left">
            <SimpleMarkdown content={message.content} />
          </div>
          
          {/* 添加按钮区域 - 新增 onClick 事件 */}
          <div className="flex items-center gap-2 justify-end">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleCopy(message.content)}
                    className="h-6 w-6 flex-shrink-0"
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>复制</TooltipContent>
              </Tooltip>
              
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleEdit}
                    className="h-6 w-6 flex-shrink-0"
                  >
                    <Edit2 className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>编辑</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          
          <div className="text-xs text-slate-500">
            {formatTime(message.timestamp)}
          </div>
        </div>
      </div>
    );
  };

  // 渲染助手消息
  const renderAssistantMessage = () => {
    const quoteData = getQuoteData();
    const hasQuote = isQuoteMessage();
    const files = getFiles();
    const isTemporary = message.isTemporary;
    const action = message.action;
    
    if (action === 'ASK_INTENT' && files.length > 0) {
      return (
        <div className="flex items-start gap-3">
          <Avatar className="h-8 w-8 flex-shrink-0">
            <AvatarFallback className="bg-emerald-100 text-emerald-700">
              <Bot className="h-4 w-4" />
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0 space-y-3">
            <SimpleMarkdown content={message.content} />
            
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={selectedIntent === 'quote' ? 'default' : 'outline'}
                onClick={() => handleIntentSelect('quote')}
              >
                <FileText className="h-4 w-4 mr-1" />
                生成报价单
              </Button>
              <Button
                size="sm"
                variant={selectedIntent === 'proposal' ? 'default' : 'outline'}
                onClick={() => handleIntentSelect('proposal')}
              >
                <Sparkles className="h-4 w-4 mr-1" />
                生成方案
              </Button>
            </div>
            
            <div className="text-xs text-slate-500">
              {formatTime(message.timestamp)}
            </div>
          </div>
        </div>
      );
    }
    
    if (isTemporary) {
      return (
        <div className="flex items-start gap-3">
          <Avatar className="h-8 w-8 flex-shrink-0">
            <AvatarFallback className="bg-emerald-100 text-emerald-700">
              <Bot className="h-4 w-4" />
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-slate-600">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span className="text-sm">{message.content}</span>
            </div>
          </div>
        </div>
      );
    }
    
    return (
      <div className="flex items-start gap-3">
        <Avatar className="h-8 w-8 flex-shrink-0">
          <AvatarFallback className="bg-emerald-100 text-emerald-700">
            <Bot className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
        
        <div className="flex-1 min-w-0 space-y-3">
          <IframeHTMLContainer htmlContent={message.content} />
          
          {hasQuote && quoteData && (
            <div className="mt-4">
              <QuoteTable
                data={quoteData}
                supplierInfo={supplierInfo}
                onUpdateProductPrice={(index, price) => 
                  onUpdateProductPrice?.(message.id, index, price)
                }
                onUpdateProductQuantity={(index, quantity) =>
                  onUpdateProductQuantity?.(message.id, index, quantity)
                }
              />
            </div>
          )}
          
          <div className="flex items-center gap-2 mt-2">
            {onRegenerate && !isTemporary && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 flex-shrink-0"
                      onClick={handleRegenerate}
                    >
                      <RotateCw className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>重新生成</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            
            <span className="text-xs text-slate-400 ml-auto flex-shrink-0">
              {formatTime(message.timestamp)}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      className={cn(
        "py-4 px-4 md:px-6 w-full",
        message.role === 'user' ? 'bg-white' : 'bg-slate-50'
      )}
    >
      <div className="max-w-5xl mx-auto w-full">
        {message.role === 'user' ? renderUserMessage() : renderAssistantMessage()}
      </div>
      
      {/* 编辑对话框 */}
      <EditDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        initialContent={message.content}
        onSave={handleSaveEdit}
      />
    </div>
  );
}
