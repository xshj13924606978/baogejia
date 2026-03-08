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
import MarkdownIt from 'markdown-it';
import mermaid from 'mermaid';

// 初始化 mermaid
if (typeof window !== 'undefined') {
  mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'loose',
    flowchart: {
      useMaxWidth: true,
      htmlLabels: true,
      curve: 'basis'
    },
    themeVariables: {
      primaryColor: '#3b82f6',
      primaryTextColor: '#ffffff',
      primaryBorderColor: '#1e40af',
      lineColor: '#64748b',
      secondaryColor: '#e0f2fe',
      tertiaryColor: '#f8fafc'
    }
  });
}

const md = new MarkdownIt({ html: true, breaks: true });

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
// Markdown转HTML工具函数（独立函数，供下载功能使用）
// ============================================================================

const parseMarkdownToHtml = (text: string): string => {
  if (!text) return '';
  
  let html = text;
  
  // 修复：检测并修复不完整的内容
  // 1. 修复未闭合的粗体标记
  html = html.replace(/\*\*([^*]+)$/gm, '<strong>$1</strong>');
  
  // 2. 修复未闭合的斜体标记
  html = html.replace(/\*([^*]+)$/gm, '<em>$1</em>');
  
  // 3. 修复未闭合的代码块
  const codeBlockCount = (html.match(/```/g) || []).length;
  if (codeBlockCount % 2 !== 0) {
    html += '\n```'; // 闭合最后一个代码块
  }
  
  // 4. 修复未闭合的表格行
  html = html.replace(/\|([^\n]+)$/gm, (match, content) => {
    if (!content.endsWith('|')) {
      return `|${content}|`;
    }
    return match;
  });
  
  // 5. 去除表格对齐符号行（优化：更严格的匹配）
  // 匹配包含 :---, :--:, --: 等对齐符号的行
  html = html.replace(/^\|[-:\s]+\|$\n?/gm, '');
  
  // 处理主标题（# 标题）
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  
  // 处理副标题（## 标题）
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  
  // 处理子标题（### 标题）
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  
  // 处理粗体（**文本**）- 优化：避免过度加粗
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  
  // 处理斜体（*文本*）- 禁用：减少斜体使用，保持文档清晰
  // html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  
  // 处理表格（| 列1 | 列2 |）
  // 优化：正确处理单元格中的<br>标签和换行符，并确保列宽足够
  const tableRegex = /\|(.+)\|\n((?:\|.+\|\n?)+)/g;
  html = html.replace(tableRegex, (match, headerRow, bodyRows) => {
    // 处理表头 - 获取表头列数
    const headers = headerRow.split('|').filter(h => h.trim());
    const numColumns = headers.length;
    const headerHtml = headers.map(h => {
      let headerText = h.trim();
      // 将Markdown中的<br>转换为HTML的<br/>
      headerText = headerText.replace(/<br>/gi, '<br/>');
      // 计算列宽百分比（最小15%，防止内容重叠）
      const colWidth = Math.max(15, Math.floor(100 / numColumns));
      return `<th style="width: ${colWidth}%">${headerText}</th>`;
    }).join('');

    // 处理表体 - 正确处理单元格中的换行
    const rows = bodyRows.trim().split('\n');
    const bodyHtml = rows.map(row => {
      // 跳过空行和分隔线（包含对齐符号的行）
      if (!row.trim() || row.trim().startsWith('|---')) return '';

      // 去除首尾的|，然后按|分割
      const rowContent = row.trim();
      const cells = rowContent.split('|')
        .map(c => c.trim())
        .filter((c, idx) => idx > 0 && idx <= numColumns); // 保留正确数量的列

      // 如果列数不对，尝试合并
      if (cells.length > numColumns) {
        // 将多余的列合并到最后一列
        const validCells = cells.slice(0, numColumns - 1);
        const lastCell = cells.slice(numColumns - 1).join('<br/>');
        validCells.push(lastCell);
        cells.length = 0;
        cells.push(...validCells);
      } else if (cells.length < numColumns) {
        // 填充空列
        while (cells.length < numColumns) {
          cells.push('');
        }
      }

      // 处理每个单元格的内容
      const processedCells = cells.map((c, idx) => {
        let cellText = c.trim();
        // 保留单元格中的<br>标签，并确保使用<br/>
        cellText = cellText.replace(/<br>/gi, '<br/>');
        // 将换行符也转换为<br/>
        cellText = cellText.replace(/\n/g, '<br/>');
        // 计算列宽百分比
        const colWidth = Math.max(15, Math.floor(100 / numColumns));
        return `<td style="width: ${colWidth}%; word-wrap: break-word; word-break: break-all;">${cellText}</td>`;
      });

      return `<tr>${processedCells.map(c => c).join('')}</tr>`;
    }).filter(row => row).join('');

    return `<table style="width: 100%; table-layout: fixed; border-collapse: collapse;"><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
  });
  
  // 处理列表项（- 项目）
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  
  // 处理数字列表（1. 项目）
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  
  // 处理连续的列表项，包裹在 ul 中
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => {
    return `<ul>${match}</ul>`;
  });
  
  // 处理普通段落 - 优化：更智能地识别是否需要添加p标签
  html = html.split('\n\n').map(para => {
    const trimmedPara = para.trim();

    // 如果为空，返回空字符串
    if (!trimmedPara) return '';

    // 检查是否已经包含HTML块级标签
    const hasBlockTag = /^(<h[1-6]|<table|<ul|<ol|<div|<blockquote|<pre|<hr)/i.test(trimmedPara);

    // 如果已经有块级标签，直接返回
    if (hasBlockTag) {
      return para;
    }

    // 如果是列表项，也直接返回（已经在前面处理过）
    if (trimmedPara.startsWith('<li')) {
      return para;
    }

    // 否则包裹在p标签中
    return `<p>${trimmedPara}</p>`;
  }).filter(para => para.trim()).join('\n');

  // 清理：移除多余的换行和空格，确保HTML结构清晰
  html = html.replace(/\n{3,}/g, '\n\n'); // 多个连续换行替换为两个
  html = html.replace(/>\s+</g, '><'); // 移除标签之间的空白

  return html;
};

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
                     htmlContent.includes('<style>') ||
                     htmlContent.includes('<table');

  console.log('[IframeHTMLContainer] 内容长度:', htmlContent.length);
  console.log('[IframeHTMLContainer] 包含 <!DOCTYPE html:', htmlContent.includes('<!DOCTYPE html'));
  console.log('[IframeHTMLContainer] 包含 <html:', htmlContent.includes('<html'));
  console.log('[IframeHTMLContainer] 包含 <style>:', htmlContent.includes('<style>'));
  console.log('[IframeHTMLContainer] 包含 <table:', htmlContent.includes('<table'));
  console.log('[IframeHTMLContainer] 是否渲染:', isFullHTML);

  if (!isFullHTML) {
    console.log('[IframeHTMLContainer] 不满足渲染条件，返回SimpleMarkdown');
    return <SimpleMarkdown content={htmlContent} />;
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
// Mermaid 图表渲染组件
// ============================================================================

const MermaidDiagram = ({ code }: { code: string }) => {
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    const renderMermaid = async () => {
      try {
        if (!svgContainerRef.current) return;

        // 生成唯一ID
        const id = `mermaid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // 渲染 mermaid
        const { svg } = await mermaid.render(id, code);
        setSvg(svg);
        setError(null);
      } catch (err) {
        console.error('Mermaid 渲染失败:', err);
        setError('流程图渲染失败，请检查语法');
        setSvg(null);
      }
    };

    renderMermaid();
  }, [code]);

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
        <p className="font-medium">⚠️ {error}</p>
        <pre className="mt-2 text-sm overflow-auto">{code}</pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-8 text-center">
        <div className="animate-pulse">
          <div className="h-4 bg-slate-200 rounded w-1/4 mx-auto mb-2"></div>
          <div className="h-32 bg-slate-200 rounded"></div>
        </div>
        <p className="mt-2 text-sm text-slate-500">正在生成流程图...</p>
      </div>
    );
  }

  return (
    <div 
      ref={svgContainerRef}
      className="bg-white border border-slate-200 rounded-lg p-4 overflow-x-auto my-4"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
};

// ============================================================================
// 简单的Markdown渲染组件（增强版 - 使用 markdown-it + mermaid）
// ============================================================================

const SimpleMarkdown = ({ content }: { content: string }) => {
  if (!content) return null;

  // 使用 markdown-it 渲染 Markdown 内容
  const html = md.render(content);

  // 检查是否包含 mermaid 代码块
  const hasMermaid = /```mermaid\n([\s\S]*?)\n```/.test(content);

  if (hasMermaid) {
    // 提取 mermaid 代码块
    const mermaidMatch = content.match(/```mermaid\n([\s\S]*?)\n```/);
    if (mermaidMatch) {
      const mermaidCode = mermaidMatch[1];
      const contentWithoutMermaid = content.replace(/```mermaid\n[\s\S]*?\n```/, '');

      return (
        <div className="space-y-4">
          <MermaidDiagram code={mermaidCode} />
          <div 
            className="prose prose-slate max-w-none prose-headings:text-foreground prose-p:text-muted-foreground prose-strong:text-foreground prose-table:w-full"
            dangerouslySetInnerHTML={{ __html: md.render(contentWithoutMermaid) }}
          />
        </div>
      );
    }
  }

  return (
    <div 
      className="prose prose-slate max-w-none prose-headings:text-foreground prose-p:text-muted-foreground prose-strong:text-foreground prose-table:w-full"
      dangerouslySetInnerHTML={{ __html: html }}
    />
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

  // ============================================================================
  // 下载功能
  // ============================================================================

  /**
   * 下载为纯文本
   */
  const downloadAsText = () => {
    const content = message.content;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `技术方案_${new Date().toLocaleDateString('zh-CN')}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    toast({
      title: "下载成功",
      description: "文本文件已下载",
      duration: 2000,
    });
  };

  /**
   * 下载为Word（使用HTML模板方式 - 商务风格优化版）
   */
  const downloadAsWord = () => {
    const content = message.content;
    
    // 将Markdown转换为HTML
    const parsedContent = parseMarkdownToHtml(content);
    
    const currentDate = new Date().toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    // 提取项目标题（第一个 h1 标签）
    const titleMatch = parsedContent.match(/<h1[^>]*>(.+?)<\/h1>/);
    const projectTitle = titleMatch ? titleMatch[1] : '技术方案';
    
    // 将Markdown转换为更美观的HTML
    const htmlContent = `
<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>技术方案</title>
  <style>
    /* 页面设置 */
    @page {
      size: A4;
      margin: 1.5cm 1.2cm;
    }
    
    @media print {
      body {
        padding: 0;
      }
    }
    
    body {
      font-family: "Microsoft YaHei UI", "Microsoft YaHei", "SimSun", "Arial Unicode MS", Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.5;
      color: #333333;
      margin: 0;
      padding: 0;
      background: white;
    }
    
    /* 封面样式 - 简洁商务 */
    .cover {
      text-align: center;
      padding: 60pt 0;
      page-break-after: always;
      background: #1e40af;
      color: white;
      min-height: 80vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .cover-title {
      font-size: 32pt;
      font-weight: 700;
      color: #ffffff;
      margin-bottom: 16pt;
      letter-spacing: 2pt;
    }

    .cover-subtitle {
      font-size: 16pt;
      color: #e0e7ff;
      margin-bottom: 50pt;
      font-weight: 400;
      letter-spacing: 1pt;
    }

    .cover-info {
      font-size: 11pt;
      color: #c7d2fe;
      margin-top: 40pt;
      line-height: 1.8;
    }

    .cover-info p {
      text-indent: 0;
      margin: 6pt 0;
      color: #e0e7ff;
      font-weight: 400;
    }

    .cover-logo {
      font-size: 13pt;
      font-weight: 600;
      color: #e0e7ff;
      margin-bottom: 10pt;
      letter-spacing: 1pt;
    }
    
    /* 页眉 - 简洁 */
    .header {
      border-bottom: 2px solid #1e40af;
      padding-bottom: 8pt;
      margin-bottom: 18pt;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .header-title {
      font-size: 13pt;
      font-weight: 600;
      color: #1e40af;
    }

    .header-date {
      font-size: 11pt;
      color: #64748b;
    }
    
    /* 标题样式 - 简洁商务 */
    h1 {
      font-size: 20pt;
      font-weight: 600;
      color: #1e40af;
      margin-top: 24pt;
      margin-bottom: 16pt;
      padding-bottom: 8pt;
      border-bottom: 2px solid #3b82f6;
      text-align: center;
      page-break-after: avoid;
    }

    h2 {
      font-size: 15pt;
      font-weight: 600;
      color: #1e40af;
      margin-top: 20pt;
      margin-bottom: 12pt;
      padding-left: 12pt;
      border-left: 4px solid #3b82f6;
      background: #f0f9ff;
      padding-top: 8pt;
      padding-bottom: 8pt;
      page-break-after: avoid;
    }

    h3 {
      font-size: 13pt;
      font-weight: 600;
      color: #334155;
      margin-top: 16pt;
      margin-bottom: 10pt;
      padding-left: 10pt;
      border-left: 3px solid #60a5fa;
      page-break-after: avoid;
    }
    
    /* 段落样式 - 简洁 */
    p {
      margin-bottom: 10pt;
      text-align: justify;
      text-indent: 2em;
      font-size: 11pt;
      line-height: 1.6;
      color: #333;
    }
    
    /* 表格样式 - 简洁商务 */
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 16pt 0;
      border: 1px solid #cbd5e1;
    }

    th {
      background: #1e40af;
      color: white;
      font-weight: 600;
      padding: 10pt 8pt;
      border: 1px solid #1e40af;
      text-align: center;
      font-size: 11pt;
    }

    td {
      padding: 8pt 6pt;
      border: 1px solid #cbd5e1;
      text-align: center;
      font-size: 11pt;
      color: #333;
      vertical-align: middle;
    }

    tr:nth-child(even) {
      background-color: #f8fafc;
    }

    tr:nth-child(odd) {
      background-color: white;
    }
    
    /* 列表样式 - 简洁 */
    ul, ol {
      margin: 12pt 0;
      padding-left: 30pt;
    }

    li {
      margin-bottom: 6pt;
      font-size: 11pt;
      line-height: 1.6;
      color: #333;
      text-indent: 0;
    }

    ul li {
      list-style-type: disc;
      color: #3b82f6;
      margin-bottom: 6pt;
    }

    ul li::marker {
      color: #3b82f6;
    }

    ol li {
      list-style-type: decimal;
      color: #333;
    }
    
    ol li::marker {
      color: #1e40af;
      font-weight: 600;
    }
    
    /* 强调文本 - 适度 */
    strong {
      color: #1e40af;
      font-weight: 600;
    }

    /* 斜体文本 - 禁用斜体，保持文档清晰 */
    em {
      color: #64748b;
      font-style: normal;
    }
    
    /* 分隔线 */
    hr {
      border: none;
      border-top: 2px solid #cbd5e1;
      margin: 32pt 0;
    }
    
    /* 内容区域 */
    .content {
      position: relative;
      z-index: 1;
    }
    
    /* 移除首行缩进的特殊情况 */
    .cover p, ul, ol, td, th, li {
      text-indent: 0;
    }
    
    /* 防止表格和列表被分页打断 */
    table, ul, ol {
      page-break-inside: avoid;
    }
    
    /* 章节标题前分页 */
    h2, h3 {
      page-break-after: avoid;
    }
    
    /* 水印效果 */
    .watermark {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-45deg);
      font-size: 100px;
      color: rgba(30, 64, 175, 0.03);
      font-weight: 700;
      pointer-events: none;
      z-index: -1;
      white-space: nowrap;
    }
  </style>
</head>
<body>
  <!-- 水印 -->
  <div class="watermark">技术方案</div>
  
  <!-- 封面页 -->
  <div class="cover">
    <div class="cover-title">技术方案</div>
    <div class="cover-subtitle">Technical Proposal</div>
    <div class="cover-info">
      <p>生成日期：${currentDate}</p>
      <p style="margin-top: 40pt; font-size: 14pt; color: #1a56db; font-weight: 700;">智能报价管理系统</p>
      <p style="margin-top: 20pt; font-size: 11pt; opacity: 0.8;">Professional Solution System</p>
    </div>
  </div>
  
  <!-- 正文 -->
  <div class="content">
    <!-- 页眉 -->
    <div class="header">
      <div class="header-title">技术方案</div>
      <div class="header-date">${currentDate}</div>
    </div>
    
    ${parsedContent}
  </div>
</body>
</html>`;
    
    const blob = new Blob(['\ufeff' + htmlContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `技术方案_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '_')}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    toast({
      title: "下载成功",
      description: "Word文档已下载",
      duration: 2000,
    });
  };

  /**
   * 下载为PDF（使用浏览器打印功能 - 商务风格）
   */
  const downloadAsPDF = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({
        title: "下载失败",
        description: "请允许弹出窗口",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }
    
    const content = message.content;
    
    // 将Markdown转换为HTML
    const parsedContent = parseMarkdownToHtml(content);
    
    const currentDate = new Date().toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    // 提取方案标题（第一个 h1 标签）
    const titleMatch = parsedContent.match(/<h1[^>]*>(.+?)<\/h1>/);
    const projectTitle = titleMatch ? titleMatch[1] : '技术方案';
    
    // 获取供应方信息
    const supplierName = supplierInfo?.companyName || '未填写';
    const contactPerson = supplierInfo?.contactPerson || '未填写';
    const contactPhone = supplierInfo?.phone || '未填写';
    const contactEmail = supplierInfo?.email || '未填写';
    
    const printContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>技术方案</title>
  <style>
    /* 打印设置 */
    @page {
      size: A4;
      margin: 1.5cm 1.2cm;
    }
    
    @media print {
      body {
        padding: 0;
      }

      /* 分页控制 - 移除H2强制分页，使用更智能的分页策略 */
      h2 {
        page-break-before: auto;
        margin-top: 32px;
        margin-bottom: 16px;
      }

      h2:first-child {
        page-break-before: auto;
        margin-top: 0;
      }

      h3 {
        page-break-after: avoid;
        page-break-inside: avoid;
      }

      /* 避免表格被分页打断 */
      table {
        page-break-inside: avoid;
      }

      /* 避免列表项被分页打断 */
      li {
        page-break-inside: avoid;
      }

      /* 避免段落被分页打断（短段落除外） */
      p {
        page-break-inside: avoid;
      }

      /* 隐藏打印时不显示的元素 */
      .no-print {
        display: none;
      }

      /* 打印时去除背景渐变（节省墨水），但保留基础颜色 */
      .cover {
        background: #1e40af !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      /* 打印时表格样式调整 */
      th {
        background: #1e40af !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      tr:nth-child(even) {
        background-color: #f8fafc !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
    
    body {
      font-family: "Microsoft YaHei", "SimSun", Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      margin: 0;
      padding: 16px;
    }
    
    /* 封面样式 */
    .cover {
      text-align: center;
      padding: 60px 0;
      page-break-after: always;
      background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
      color: white;
      min-height: 85vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    
    .cover-title {
      font-size: 32px;
      font-weight: bold;
      color: #e0e7ff;
      margin-bottom: 20px;
      letter-spacing: 4px;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
    }
    
    .cover-subtitle {
      font-size: 18px;
      color: #cbd5e1;
      margin-bottom: 60px;
      font-weight: 300;
      letter-spacing: 1.5px;
    }
    
    .cover-info {
      font-size: 13px;
      color: #e2e8f0;
      margin-top: 40px;
      line-height: 1.8;
    }
    
    .cover-info p {
      text-indent: 0;
      margin: 8px 0;
      color: #e2e8f0;
    }
    
    /* 页眉 */
    .header {
      border-bottom: 2px solid #3b82f6;
      padding-bottom: 12px;
      margin-bottom: 28px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .header-title {
      font-size: 16px;
      font-weight: 600;
      color: #1e40af;
    }

    .header-date {
      font-size: 12px;
      color: #64748b;
    }
    
    /* 标题样式 */
    h1 {
      font-size: 28px;
      font-weight: 700;
      color: #1e40af;
      margin-top: 40px;
      margin-bottom: 24px;
      padding-bottom: 10px;
      border-bottom: 3px solid #3b82f6;
      text-align: center;
    }

    h2 {
      font-size: 20px;
      font-weight: 600;
      color: #1e3a8a;
      margin-top: 32px;
      margin-bottom: 16px;
      padding-left: 18px;
      padding-right: 15px;
      padding-top: 14px;
      padding-bottom: 14px;
      border-left: 5px solid #3b82f6;
      background: linear-gradient(to right, #eff6ff 0%, #ffffff 100%);
      border-radius: 0 6px 6px 0;
    }

    h3 {
      font-size: 17px;
      font-weight: 600;
      color: #334155;
      margin-top: 24px;
      margin-bottom: 14px;
      padding-left: 14px;
      border-left: 4px solid #60a5fa;
      line-height: 1.6;
    }
    
    /* 段落样式 */
    p {
      margin-bottom: 12px;
      text-align: justify;
      text-indent: 2em;
      font-size: 14px;
      line-height: 1.8;
      color: #334155;
    }
    
    /* 表格样式 */
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      border-radius: 6px;
      overflow: hidden;
      border: 1px solid #e2e8f0;
      table-layout: auto;
    }

    th {
      background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%);
      color: white;
      font-weight: 600;
      padding: 12px 10px;
      border: 1px solid #1e40af;
      text-align: center;
      font-size: 13px;
      text-transform: none;
      letter-spacing: 0;
      line-height: 1.6;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    td {
      padding: 10px 8px;
      border: 1px solid #e2e8f0;
      text-align: center;
      font-size: 12px;
      color: #334155;
      vertical-align: middle;
      line-height: 1.6;
      word-wrap: break-word;
      overflow-wrap: break-word;
      hyphens: auto;
    }

    /* 第一列左对齐（通常是序号列） */
    td:first-child {
      text-align: center;
      font-weight: 600;
      color: #1e40af;
    }

    tr:nth-child(even) {
      background-color: #f8fafc;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    tr:nth-child(odd) {
      background-color: white;
    }

    tr:hover {
      background-color: #e0f2fe;
      transition: background-color 0.2s;
    }

    /* 表格中的换行处理 */
    td br {
      display: block;
      margin: 3px 0;
      content: "";
    }
    
    /* 列表样式 */
    ul, ol {
      margin: 16px 0;
      padding-left: 45px;
    }

    li {
      margin-bottom: 8px;
      font-size: 14px;
      line-height: 1.8;
      color: #334155;
    }

    ul li::marker {
      color: #3b82f6;
      font-size: 1.1em;
    }

    ol li::marker {
      color: #3b82f6;
      font-weight: 600;
    }
    
    /* 强调文本 */
    strong {
      color: #1e40af;
      font-weight: 600;
    }

    /* 斜体文本 - 禁用斜体，保持文档清晰 */
    em {
      color: #64748b;
      font-style: normal;
    }
    
    /* 水印 */
    .watermark {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-45deg);
      font-size: 110px;
      color: rgba(30, 64, 175, 0.04);
      font-weight: 700;
      pointer-events: none;
      z-index: -1;
      white-space: nowrap;
    }
    
    /* 分隔线 */
    hr {
      border: none;
      border-top: 2px solid #cbd5e1;
      margin: 28px 0;
    }

    /* 分隔线变体 */
    hr.dashed {
      border-top: 2px dashed #94a3b8;
    }
    
    /* 内容区域 */
    .content {
      position: relative;
      z-index: 1;
    }
    
    /* 移除首行缩进的特殊情况 */
    .cover p, ul, ol {
      text-indent: 0;
    }
    
    /* 打印提示 */
    .print-hint {
      position: fixed;
      top: 20px;
      right: 20px;
      background: #fff;
      padding: 15px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      text-align: center;
      z-index: 1000;
    }
    
    .print-hint h3 {
      margin: 0 0 10px 0;
      font-size: 16px;
      color: #1a56db;
    }
    
    .print-hint p {
      margin: 5px 0;
      text-indent: 0;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <!-- 水印 -->
  <div class="watermark">技术方案</div>
  
  <!-- 打印提示 -->
  <div class="print-hint no-print">
    <h3>💡 下载PDF</h3>
    <p>1. 点击「打印」按钮</p>
    <p>2. 目标打印机选择「另存为PDF」</p>
    <p>3. 点击保存即可</p>
  </div>
  
  <!-- 封面页 -->
  <div class="cover">
    <div class="cover-title">${projectTitle}</div>
    <div class="cover-subtitle">Technical Proposal</div>
    <div class="cover-info">
      <p><strong>编制单位：</strong>${supplierName}</p>
      <p><strong>编制人：</strong>${contactPerson}</p>
      <p><strong>联系方式：</strong>${contactPhone}</p>
      ${contactEmail !== '未填写' ? `<p><strong>邮箱：</strong>${contactEmail}</p>` : ''}
      <p style="margin-top: 20px;"><strong>编制日期：</strong>${currentDate}</p>
    </div>
  </div>
  
  <!-- 正文 -->
  <div class="content">
    <!-- 页眉 -->
    <div class="header">
      <div class="header-title">技术方案</div>
      <div class="header-date">${currentDate}</div>
    </div>
    
    ${parsedContent}
  </div>
  
  <script>
    window.onload = function() {
      // 5秒后自动打印
      setTimeout(function() {
        window.print();
      }, 500);
    };
    
    // 打印后关闭窗口
    window.onafterprint = function() {
      window.close();
    };
  </script>
</body>
</html>`;
    
    printWindow.document.write(printContent);
    printWindow.document.close();
    
    toast({
      title: "准备下载PDF",
      description: "打印窗口已打开，请选择「另存为PDF」保存",
      duration: 5000,
    });
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
    const intent = message.metadata?.intent;
    
    // 判断是否是详细方案（包含方案相关关键词或metadata中有detailed_proposal意图）
    const isDetailedProposal = 
      intent === 'detailed_proposal' ||
      (message.content && (message.content.includes('技术方案') || message.content.includes('项目概述')));
    
    console.log('[ChatMessage] ========== 渲染助手消息 ==========');
    console.log('[ChatMessage] 消息ID:', message.id);
    console.log('[ChatMessage] 意图:', intent);
    console.log('[ChatMessage] 是否详细方案:', isDetailedProposal);
    console.log('[ChatMessage] 是否报价单:', hasQuote);
    console.log('[ChatMessage] 内容长度:', message.content?.length);
    console.log('[ChatMessage] 内容预览:', message.content?.substring(0, 100));
    console.log('[ChatMessage] metadata:', message.metadata);
    
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
    
    console.log('[ChatMessage] 选择渲染组件:', isDetailedProposal ? 'SimpleMarkdown (详细方案)' : (hasQuote ? 'IframeHTMLContainer (报价单)' : 'SimpleMarkdown (普通)'));
    
    return (
      <div className="flex items-start gap-3">
        <Avatar className="h-8 w-8 flex-shrink-0">
          <AvatarFallback className="bg-emerald-100 text-emerald-700">
            <Bot className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
        
        <div className="flex-1 min-w-0 space-y-3">
          {/* 根据内容类型选择渲染方式 */}
          {isDetailedProposal ? (
            /* 详细方案使用 SimpleMarkdown 渲染 */
            (() => {
              console.log('[ChatMessage] 渲染详细方案');
              return <SimpleMarkdown content={message.content} />;
            })()
          ) : hasQuote ? (
            /* 报价单使用 IframeHTMLContainer 渲染 */
            (() => {
              console.log('[ChatMessage] 渲染报价单');
              return <IframeHTMLContainer htmlContent={message.content} />;
            })()
          ) : (
            /* 普通消息使用 SimpleMarkdown 渲染 */
            (() => {
              console.log('[ChatMessage] 渲染普通消息');
              return <SimpleMarkdown content={message.content} />;
            })()
          )}
          
          {hasQuote && quoteData && !isDetailedProposal && (
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
            {/* 复制按钮 */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 flex-shrink-0"
                    onClick={() => handleCopy(message.content)}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>复制内容</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* 下载按钮组 - 仅对详细方案和普通消息显示 */}
            {!isTemporary && (!hasQuote || isDetailedProposal) && (
              <>
                {/* Word下载 */}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 flex-shrink-0"
                        onClick={downloadAsWord}
                      >
                        <FileText className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>下载Word</TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                {/* PDF下载 */}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 flex-shrink-0"
                        onClick={downloadAsPDF}
                      >
                        <Printer className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>下载PDF</TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                {/* 文本下载 */}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 flex-shrink-0"
                        onClick={downloadAsText}
                      >
                        <FileTextIcon className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>下载文本</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </>
            )}

            {/* 重新生成按钮 */}
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
