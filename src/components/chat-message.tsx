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
  User,
  Bot,
  RotateCw,
  FileText,
  Sparkles,
  FileSpreadsheet,
  File as FileIcon,
  Image as ImageIcon,
  FileText as FileTextIcon,
  FileSpreadsheet as FileSpreadsheetIcon,
  RefreshCw,
  Printer,
  Copy,
  Edit2,
  Brain,
  ArrowDownToLine,
} from 'lucide-react';
import QuoteTable from '@/components/quote-table';
import { MatchVisualization } from '@/components/match-visualization';
import { BrandCompareCard } from '@/components/brand-compare-card';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// 动态导入 markdown-it 和 mermaid，避免 SSR 问题
let MarkdownIt: any = null;
let mermaid: any = null;
let md: any = null;

// 只在客户端初始化
if (typeof window !== 'undefined') {
  // 使用动态 import 替代 require
  import('markdown-it').then((mod) => {
    MarkdownIt = mod.default || mod;
    md = new MarkdownIt({ html: true, breaks: true });
  }).catch((err) => {
    console.error('Failed to load markdown-it:', err);
  });

  import('mermaid').then((mod) => {
    mermaid = mod.default || mod;
    mermaid.initialize({
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'loose',
      flowchart: {
        useMaxWidth: true,
        htmlLabels: true,
        curve: 'basis',
      },
      themeVariables: {
        primaryColor: '#3b82f6',
        primaryTextColor: '#ffffff',
        primaryBorderColor: '#1e40af',
        lineColor: '#64748b',
        secondaryColor: '#e0f2fe',
        tertiaryColor: '#f8fafc',
      },
    });
  }).catch((err) => {
    console.error('Failed to load mermaid:', err);
  });
}

// 默认的简单 Markdown 渲染函数（当 markdown-it 未加载时使用）
const simpleMarkdownRender = (text: string): string => {
  if (!text) return '';
  // 简单的 Markdown 转 HTML
  return text
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>');
};

interface Message {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  quoteData?: any;
  files?: any[];
  fileData?: any[];
  isTemporary?: boolean;
  isStreaming?: boolean;
  action?: string;
  fileGroupId?: string;
  currentChoice?: string;
  metadata?: {
    intent?: string;
    inputType?: string;
    confidence?: number;
    entities?: any;
    imageUrl?: string;
    imagePrompt?: string;
  };
}

interface ChatMessageProps {
  message: Message;
  onRegenerate?: (messageId: number) => void;
  supplierInfo?: any;
  onUpdateProductPrice?: (messageId: number, productIndex: number, newPrice: number) => void;
  onUpdateProductQuantity?: (messageId: number, productIndex: number, newQuantity: number) => void;
  onIntentSelection?: (intent: 'quote' | 'proposal' | 'both') => void;
  onBrandSelect?: (messageId: number, item: any) => void;
  onEdit?: (messageId: number, newContent: string) => void;
}

// ============================================================================
// 自动添加章节编号工具函数（优化版）
// ============================================================================

const addSectionNumbers = (html: string): string => {
  // 提取所有标题标签
  const h1Regex = /<h1[^>]*>([\s\S]*?)<\/h1>/g;
  const h2Regex = /<h2[^>]*>([\s\S]*?)<\/h2>/g;
  const h3Regex = /<h3[^>]*>([\s\S]*?)<\/h3>/g;
  const h4Regex = /<h4[^>]*>([\s\S]*?)<\/h4>/g;

  // 第一步：识别所有H1，确定哪些是文档标题，哪些是一级章节
  const h1Matches = Array.from(html.matchAll(h1Regex));
  const chapterInfo: {
    index: number;
    isDocTitle: boolean;
    isChapter: boolean;
    chapterNum: number;
  }[] = [];

  let chapterCount = 0;
  h1Matches.forEach((match, index) => {
    const content = match[1].trim();

    // 判断是否是文档标题
    // 规则：必须是第一个H1，并且内容不包含"一"、"二"、"三"等章节编号
    // 如果H1内容包含中文编号或数字编号，说明它是一级章节，不是文档标题
    const isDocTitle =
      index === 0 &&
      !/^[一二三四五六七八九十]+[、\.]/.test(content) &&
      !/^\d+[、\.]/.test(content) &&
      !/第[一二三四五六七八九十]+章/.test(content) &&
      !/^[一二三四五六七八九十]+、/.test(content);

    const isChapter = !isDocTitle;

    if (isChapter) {
      chapterCount++;
    }

    chapterInfo.push({
      index,
      isDocTitle,
      isChapter,
      chapterNum: isChapter ? chapterCount : 0,
    });
  });

  // 第二步：处理H1标题
  const h1Counters = { count: 0 };
  const chineseNumbers = [
    '一',
    '二',
    '三',
    '四',
    '五',
    '六',
    '七',
    '八',
    '九',
    '十',
    '十一',
    '十二',
    '十三',
    '十四',
    '十五',
  ];

  html = html.replace(h1Regex, (match, content) => {
    h1Counters.count++;
    const info = chapterInfo[h1Counters.count - 1];

    // 如果是文档标题，不添加编号
    if (info.isDocTitle) {
      return match;
    }

    // 如果是一级章节，添加编号
    const number = chineseNumbers[info.chapterNum - 1] || info.chapterNum;

    // 检查是否已经有编号
    const hasChineseNumber = /^[一二三四五六七八九十]+[、\.]/.test(content.trim());
    const hasNumberNumber = /^\d+[、\.]/.test(content.trim());
    const hasChapterPrefix = /第[一二三四五六七八九十]+章/.test(content.trim());

    if (!hasChineseNumber && !hasNumberNumber && !hasChapterPrefix) {
      const attrMatch = match.match(/<h1([^>]*)>/);
      const attrs = attrMatch ? attrMatch[1] : '';
      return `<h1${attrs}>${number}、${content}</h1>`;
    }
    return match;
  });

  // 第三步：处理H2标题
  // 先提取所有H2，记录它们在原始HTML中的位置
  const h2Matches = Array.from(html.matchAll(h2Regex));
  const h2Counters: { [key: number]: number } = {};

  // 计算每个H2所属的章节编号
  h2Matches.forEach((match, _index) => {
    const h1Before = (html.substring(0, match.index).match(/<h1/g) || []).length;
    const currentChapter = chapterInfo[h1Before - 1];

    // 如果H2之前没有一级章节，跳过
    if (!currentChapter || !currentChapter.isChapter) {
      return;
    }

    const currentH1Index = currentChapter.chapterNum;
    if (!h2Counters[currentH1Index]) {
      h2Counters[currentH1Index] = 0;
    }
    h2Counters[currentH1Index]++;
  });

  // 重置计数器并实际替换
  const h2Counters2: { [key: number]: number } = {};
  html = html.replace(h2Regex, (match, content, offset) => {
    const h1Before = (html.substring(0, offset).match(/<h1/g) || []).length;
    const currentChapter = chapterInfo[h1Before - 1];

    if (!currentChapter || !currentChapter.isChapter) {
      return match;
    }

    const currentH1Index = currentChapter.chapterNum;
    if (!h2Counters2[currentH1Index]) {
      h2Counters2[currentH1Index] = 0;
    }
    h2Counters2[currentH1Index]++;

    const h2Number = h2Counters2[currentH1Index];
    const fullNumber = `${currentH1Index}.${h2Number}`;

    const hasNumber = /^\d+\.\d+/.test(content.trim());

    if (!hasNumber) {
      const attrMatch = match.match(/<h2([^>]*)>/);
      const attrs = attrMatch ? attrMatch[1] : '';
      return `<h2${attrs}>${fullNumber} ${content}</h2>`;
    }
    return match;
  });

  // 第四步：处理H3标题
  const _h3Matches = Array.from(html.matchAll(h3Regex));
  const h3Counters: { [key: string]: number } = {};

  html = html.replace(h3Regex, (match, content, offset) => {
    const h1Before = (html.substring(0, offset).match(/<h1/g) || []).length;
    const h2Before = (html.substring(0, offset).match(/<h2/g) || []).length;

    const currentChapter = chapterInfo[h1Before - 1];

    if (!currentChapter || !currentChapter.isChapter) {
      return match;
    }

    const currentH1Index = currentChapter.chapterNum;
    const h3Key = `${currentH1Index}-${h2Before}`;

    if (!h3Counters[h3Key]) {
      h3Counters[h3Key] = 0;
    }
    h3Counters[h3Key]++;

    const h3Number = h3Counters[h3Key];
    const fullNumber = `${currentH1Index}.${h2Before}.${h3Number}`;

    const hasNumber = /^\d+\.\d+\.\d+/.test(content.trim());

    if (!hasNumber) {
      const attrMatch = match.match(/<h3([^>]*)>/);
      const attrs = attrMatch ? attrMatch[1] : '';
      return `<h3${attrs}>${fullNumber} ${content}</h3>`;
    }
    return match;
  });

  // 第五步：处理H4标题
  const h4Counters: { [key: string]: number } = {};

  html = html.replace(h4Regex, (match, content, offset) => {
    const h1Before = (html.substring(0, offset).match(/<h1/g) || []).length;
    const h2Before = (html.substring(0, offset).match(/<h2/g) || []).length;
    const h3Before = (html.substring(0, offset).match(/<h3/g) || []).length;

    const currentChapter = chapterInfo[h1Before - 1];

    if (!currentChapter || !currentChapter.isChapter) {
      return match;
    }

    const currentH1Index = currentChapter.chapterNum;
    const h4Key = `${currentH1Index}-${h2Before}-${h3Before}`;

    if (!h4Counters[h4Key]) {
      h4Counters[h4Key] = 0;
    }
    h4Counters[h4Key]++;

    const h4Number = h4Counters[h4Key];
    const fullNumber = `${currentH1Index}.${h2Before}.${h3Before}.${h4Number}`;

    const hasNumber = /^\d+\.\d+\.\d+\.\d+/.test(content.trim());

    if (!hasNumber) {
      const attrMatch = match.match(/<h4([^>]*)>/);
      const attrs = attrMatch ? attrMatch[1] : '';
      return `<h4${attrs}>${fullNumber} ${content}</h4>`;
    }
    return match;
  });

  return html;
};

// ============================================================================
// Markdown转HTML工具函数（独立函数，供下载功能使用）
// ============================================================================

const parseMarkdownToHtml = (text: string): string => {
  if (!text) return '';

  let html = text;

  // ========================================================================
  // 0. 预处理：过滤"后续建议"和清理多余的星号
  // ========================================================================

  // 0.1 过滤掉"后续建议"部分（从特定的文本开始删除直到文档末尾）
  // 匹配以"后续建议"、"后续说明"、"后续步骤"、"后续服务"等关键词开始的段落，删除该段落及其后的所有内容
  const suggestionPatterns = [
    // 匹配带分隔符的后续建议（如 "--- 后续建议"）
    /\n\s*(?:---|\*\*|\*?|\●|\○|\■)\s*(?:后续建议|后续说明|后续说明：|后续建议：|补充说明|补充说明：|后续步骤建议|后续步骤|后续服务建议|后续支持|后续支持：)\s*\n[\s\S]*$/gi,

    // 匹配列表项形式的后续建议（如 "* 后续建议"）
    /\n\s*(?:\*|\-|\d+\.)\s*后续建议[:：]?\s*\n[\s\S]*$/gi,
    /\n\s*(?:\*|\-|\d+\.)\s*后续步骤建议[:：]?\s*\n[\s\S]*$/gi,
    /\n\s*(?:\*|\-|\d+\.)\s*后续服务建议[:：]?\s*\n[\s\S]*$/gi,

    // 匹配粗体标记的后续建议（如 "**后续建议**"）
    /\n\s*\*\*后续建议\*\*[\s\S]*$/gi,
    /\n\s*\*\*后续步骤建议\*\*[\s\S]*$/gi,
    /\n\s*\*\*后续服务\*\*[\s\S]*$/gi,

    // 匹配以"如需"或"可为您"开始的建议性内容
    /\n\s*(?:如需|可为您|如您需要|如果您)\s*(?:更精确|修订|生成|提供|制作|帮助)[\s\S]*$/gi,

    // 匹配"后续"开头的标题
    /\n\s*(?:#|##|###)\s*后续[建议|说明|步骤|服务|支持]+.*?\n[\s\S]*$/gi,

    // 匹配包含"设备采购清单"或"实施进度计划表"的段落（通常是后续建议的内容）
    /\n\s*(?:\*|\-|\d+\.)\s*可为您生成(?:设备采购清单|项目实施进度计划表|施工进度计划表|采购清单|进度计划表)[\s\S]*$/gi,

    // 兜底：匹配任何包含"后续"关键字且在文档末尾的段落
    /\n\s*(?:\*|\-|\d+\.|\w+)\s*(?:后续|下一步|后续步骤|后续支持)\s*[:：]?\s*[\s\S]*$/gi,
  ];

  for (const pattern of suggestionPatterns) {
    html = html.replace(pattern, '\n');
  }

  // 额外清理：移除空行
  html = html.replace(/\n{3,}/g, '\n\n');

  // 0.2 删除多余的星号，但保留Markdown格式标记
  // 策略：分步骤清理，彻底删除所有不是用于格式的星号

  // 第一步：保护和恢复粗体标记
  html = html.replace(/\*\*([^*]+)\*\*/g, (match, content) => {
    // 使用唯一的占位符，避免与正常文本冲突
    return `<<<BOLD_START>>>${content}<<<BOLD_END>>>`;
  });

  // 第二步：保护和恢复斜体标记
  html = html.replace(/\*([^*]+)\*/g, (match, content) => {
    return `<<<ITALIC_START>>>${content}<<<ITALIC_END>>>`;
  });

  // 第三步：删除所有剩余的星号（包括前导、后导、中间的孤立星号）
  html = html.replace(/\*/g, '');

  // 第四步：恢复粗体标记
  html = html.replace(/<<<BOLD_START>>>(.+?)<<<BOLD_END>>>/g, '**$1**');

  // 第五步：恢复斜体标记
  html = html.replace(/<<<ITALIC_START>>>(.+?)<<<ITALIC_END>>>/g, '*$1*');

  // ========================================================================
  // 1. 修复：检测并修复不完整的内容
  // ========================================================================

  // 1.1 修复未闭合的粗体标记
  html = html.replace(/\*\*([^*]+)$/gm, '<strong>$1</strong>');

  // 1.2 修复未闭合的斜体标记
  html = html.replace(/\*([^*]+)$/gm, '<em>$1</em>');

  // 1.3 修复未闭合的代码块
  const codeBlockCount = (html.match(/```/g) || []).length;
  if (codeBlockCount % 2 !== 0) {
    html += '\n```'; // 闭合最后一个代码块
  }

  // 1.4 修复未闭合的表格行
  html = html.replace(/\|([^\n]+)$/gm, (match, content) => {
    if (!content.endsWith('|')) {
      return `|${content}|`;
    }
    return match;
  });

  // 5. 去除表格对齐符号行（:---, :--:, --:）
  // 匹配包含 :---, :--:, --: 等对齐符号的行，包括各种格式变体
  // 例如：
  // |:---|:---|:---|
  // |---|---|---|
  // |---|
  // :---|:---|:---
  // ---|---|---
  // | :--- | :---: | ---: |
  // | :--- | --- | --- |
  html = html.replace(/^\|?\s*:?-{3,}[:?\s|:]+\|?\s*$/gm, '');

  // 处理主标题（# 标题）
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // 处理副标题（## 标题）
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');

  // 处理子标题（### 标题）
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');

  // 处理四级标题（#### 标题）
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');

  // 自动添加章节编号
  html = addSectionNumbers(html);

  // 处理粗体（**文本**）- 优化：避免过度加粗
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // 处理斜体（*文本*）- 禁用：减少斜体使用，保持文档清晰
  // html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // 处理表格（| 列1 | 列2 |）
  // 优化：正确处理单元格中的<br>标签和换行符，并确保列宽足够
  const tableRegex = /\|(.+)\|\n((?:\|.+\|\n?)+)/g;
  html = html.replace(tableRegex, (match, headerRow, bodyRows) => {
    // 处理表头 - 获取表头列数
    const headers = headerRow.split('|').filter((h: string) => h.trim());
    const numColumns = headers.length;
    const headerHtml = headers
      .map((h: string) => {
        let headerText = h.trim();
        // 将Markdown中的<br>转换为HTML的<br/>
        headerText = headerText.replace(/<br>/gi, '<br/>');
        // 计算列宽百分比（最小15%，防止内容重叠）
        const colWidth = Math.max(15, Math.floor(100 / numColumns));
        return `<th style="width: ${colWidth}%">${headerText}</th>`;
      })
      .join('');

    // 处理表体 - 正确处理单元格中的换行
    const rows = bodyRows.trim().split('\n');
    const bodyHtml = rows
      .map((row: string) => {
        const trimmedRow = row.trim();

        // 过滤掉对齐符号行（如 |:---|:---| 或 | :--- | :---: | ---: |）
        if (/^\|?\s*:?-{3,}[:?\s|:]+\|?\s*$/.test(trimmedRow)) return '';

        // 去除首尾的|，然后按|分割
        const rowContent = row.trim();
        const cells = rowContent
          .split('|')
          .map((c: string) => c.trim())
          .filter((c: string, idx: number) => idx > 0 && idx <= numColumns); // 保留正确数量的列

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
        const processedCells = cells.map((c: string, _idx_idxidx: number) => {
          let cellText = c.trim();
          // 保留单元格中的<br>标签，并确保使用<br/>
          cellText = cellText.replace(/<br>/gi, '<br/>');
          // 将换行符也转换为<br/>
          cellText = cellText.replace(/\n/g, '<br/>');
          // 计算列宽百分比
          const colWidth = Math.max(15, Math.floor(100 / numColumns));
          return `<td style="width: ${colWidth}%; word-wrap: break-word; word-break: break-all;">${cellText}</td>`;
        });

        return `<tr>${processedCells.map((c: string) => c).join('')}</tr>`;
      })
      .filter((row: string) => row)
      .join('');

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
  html = html
    .split('\n\n')
    .map((para) => {
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
    })
    .filter((para) => para.trim())
    .join('\n');

  // 清理：移除多余的换行和空格，确保HTML结构清晰
  html = html.replace(/\n{3,}/g, '\n\n'); // 多个连续换行替换为两个
  html = html.replace(/>\s+</g, '><'); // 移除标签之间的空白

  // 最终清理1：移除任何可能残留的对齐符号行内容
  // 移除只包含对齐符号的文本节点
  html = html.replace(/<p>\s*:?-{3,}:?\s*<\/p>/gi, '');
  html = html.replace(/<p>\s*[\s|:-]+\s*<\/p>/gi, '');

  // 移除表格中可能存在的对齐符号行（转换为HTML后的形式）
  html = html.replace(/<tr>\s*(<td[^>]*>[\s|:-]*<\/td>\s*)+\s*<\/tr>/gi, '');

  // 最终清理2：删除所有剩余的星号（在HTML标签外）
  // 确保不影响HTML标签结构，只删除文本内容中的星号
  html = html
    // 保护HTML标签（避免删除标签内的星号）
    .replace(/(<[^>]+>)/g, (match) => {
      // 将HTML标签中的内容进行base64编码保护
      return '<<<HTML_TAG>>>' + Buffer.from(match).toString('base64') + '<<<HTML_TAG_END>>>';
    })
    // 删除所有剩余的星号
    .replace(/\*/g, '')
    // 恢复HTML标签
    .replace(/<<<HTML_TAG>>>(.+?)<<<HTML_TAG_END>>>/g, (match, encoded) => {
      return Buffer.from(encoded, 'base64').toString('utf-8');
    });

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
  const tables: Array<{ original: string; attrs: string; body: string }> = [];
  let match;

  while ((match = tableRegex.exec(htmlContent)) !== null) {
    tables.push({
      original: match[0],
      attrs: match[1],
      body: match[2],
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
          body: table.body,
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
          body: table.body,
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
          body: table.body,
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
          body: table.body,
        };
      }

      // 提取完整的汇总行（包含所有<tr>标签）
      const summaryRows = table.body.substring(lastTrStart, trEnd + 5); // +5 是因为"</tr>"的长度
      console.log(`[修复] 提取汇总行，长度: ${summaryRows.length}`);
      console.log(`[修复] 汇总行开头: ${summaryRows.substring(0, 50)}...`);

      // 移除所有旧的汇总行（从lastTrStart到trEnd之后）
      let cleanedBody = table.body.substring(0, lastTrStart) + table.body.substring(trEnd + 5);

      // 将汇总行添加到末尾
      cleanedBody = cleanedBody + summaryRows;

      console.log(`[修复] 清理后body长度: ${cleanedBody.length} (原始: ${table.body.length})`);

      return {
        original: table.original,
        attrs: table.attrs,
        body: cleanedBody,
      };
    }

    // 如果没有所有汇总项，直接返回原始表格
    return {
      original: table.original,
      attrs: table.attrs,
      body: table.body,
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
  const isFullHTML =
    htmlContent.includes('<!DOCTYPE html') ||
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
          <Button variant="outline" size="sm" onClick={handlePrint} className="text-xs gap-1">
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
            minHeight: '300px',
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
        
        // 确保 mermaid 已加载
        if (!mermaid) {
          // 等待 mermaid 加载
          const mermaidMod = await import('mermaid');
          mermaid = mermaidMod.default || mermaidMod;
          mermaid.initialize({
            startOnLoad: false,
            theme: 'default',
            securityLevel: 'loose',
          });
        }

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
// 简单的Markdown渲染组件（使用 markdown-it + mermaid）
// ============================================================================

const SimpleMarkdown = ({ content, isStreaming }: { content: string; isStreaming?: boolean }) => {
  const [html, setHtml] = useState<string>('');

  useEffect(() => {
    const renderMarkdown = async () => {
      if (!content) {
        setHtml('');
        return;
      }

      // 确保 markdown-it 已加载
      if (!md) {
        try {
          const mod = await import('markdown-it');
          MarkdownIt = mod.default || mod;
          md = new MarkdownIt({ html: true, breaks: true });
        } catch (err) {
          console.error('Failed to load markdown-it:', err);
          setHtml(simpleMarkdownRender(content));
          return;
        }
      }

      // 使用 markdown-it 渲染 Markdown 内容
      let renderedHtml = md.render(content);

      // 自动添加章节编号（在添加样式之前）
      renderedHtml = addSectionNumbers(renderedHtml);

      // 后处理：增强章节分隔和视觉层次
      // 1. 为一级标题添加底部边距和分隔线（左对齐）
      renderedHtml = renderedHtml.replace(
        /<h1([^>]*)>([\s\S]*?)<\/h1>/g,
        '<h1 class="scroll-m-20 text-3xl font-extrabold tracking-tight lg:text-4xl mb-6 pb-4 border-b-2 border-border text-left"$1>$2</h1>'
      );

      // 2. 为二级标题添加左边框和背景色（字号小于一级目录）
      renderedHtml = renderedHtml.replace(
        /<h2([^>]*)>([\s\S]*?)<\/h2>/g,
        '<h2 class="scroll-m-20 border-l-4 border-primary pl-4 py-2 my-6 bg-muted/50 text-xl font-semibold tracking-tight"$1>$2</h2>'
      );

      // 3. 为三级标题添加左边框（颜色递变）和左缩进
      renderedHtml = renderedHtml.replace(
        /<h3([^>]*)>([\s\S]*?)<\/h3>/g,
        '<h3 class="scroll-m-20 border-l-2 border-primary/60 pl-8 py-2 my-4 text-xl font-semibold tracking-tight text-slate-700"$1>$2</h3>'
      );

      // 4. 为四级标题添加左边框（颜色递变）和左缩进
      renderedHtml = renderedHtml.replace(
        /<h4([^>]*)>([\s\S]*?)<\/h4>/g,
        '<h4 class="scroll-m-20 border-l-2 border-primary/40 pl-12 py-2 my-4 text-lg font-semibold tracking-tight text-slate-600"$1>$2</h4>'
      );

      // 5. 为段落添加适当间距
      renderedHtml = renderedHtml.replace(/<p([^>]*)>/g, '<p class="leading-7 my-4"$1>');

      // 6. 为列表项添加适当间距
      renderedHtml = renderedHtml.replace(/<li([^>]*)>/g, '<li class="my-2"$1>');

      setHtml(renderedHtml);
    };

    renderMarkdown();
  }, [content]);

  // 检查是否包含 mermaid 代码块
  const hasMermaid = /```mermaid\n([\s\S]*?)\n```/.test(content);

  if (hasMermaid) {
    // 提取 mermaid 代码块
    const mermaidMatch = content.match(/```mermaid\n([\s\S]*?)\n```/);
    if (mermaidMatch) {
      const mermaidCode = mermaidMatch[1];
      const contentWithoutMermaid = content.replace(/```mermaid\n[\s\S]*?\n```/, '');
      
      return (
        <div className="space-y-6">
          <MermaidDiagram code={mermaidCode} />
          <SimpleMarkdown content={contentWithoutMermaid} isStreaming={isStreaming} />
        </div>
      );
    }
  }

  if (!html) return null;

  return (
    <div className="relative">
      <div
        className="prose prose-slate max-w-none prose-headings:text-foreground prose-p:text-muted-foreground prose-strong:text-foreground prose-table:w-full"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {/* 打字机光标效果 - 仅在流式输出时显示 */}
      {isStreaming && (
        <span className="inline-block w-2 h-5 bg-blue-600 ml-1 animate-pulse align-middle" />
      )}
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
          <DialogDescription>修改消息内容后点击保存，内容将更新到对话框中</DialogDescription>
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
          <Button variant="outline" onClick={handleCancel}>
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
  onBrandSelect,
  onIntentSelection,
  onEdit,
}: ChatMessageProps) {
  const { toast } = useToast();
  const [selectedIntent, setSelectedIntent] = useState<'quote' | 'proposal' | 'both' | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const getFileIcon = (fileType: string) => {
    if (fileType.includes('image')) return <ImageIcon className="h-4 w-4" />;
    if (fileType.includes('spreadsheet') || fileType.includes('excel'))
      return <FileSpreadsheetIcon className="h-4 w-4" />;
    if (fileType.includes('pdf')) return <FileTextIcon className="h-4 w-4" />;
    if (fileType.includes('word') || fileType.includes('document'))
      return <FileTextIcon className="h-4 w-4" />;
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
    return !!(
      message.quoteData ||
      (message.content &&
        (message.content.includes('报价单') || message.content.includes('<table')))
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
        title: '复制成功',
        description: '内容已复制到剪贴板',
        variant: 'default',
      });
    } catch (error) {
      console.error('Failed to copy:', error);
      toast({
        title: '复制失败',
        description: '无法复制内容',
        variant: 'destructive',
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
        title: '编辑功能暂不可用',
        description: '请先在父组件中实现 onEdit 回调',
        variant: 'destructive',
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
      title: '下载成功',
      description: '文本文件已下载',
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
      day: 'numeric',
    });

    // 提取项目标题（第一个 h1 标签）
    const titleMatch = parsedContent.match(/<h1[^>]*>(.+?)<\/h1>/);
    let projectTitle = titleMatch ? titleMatch[1] : '技术方案';

    // 提取竖排文字（智能关键词提取）
    const rawTitle = projectTitle.replace(/<[^>]*>/g, '');
    let verticalText = '';

    // 提取关键词
    const keywords = ['技术方案', '报价方案', '报价单'];
    for (const keyword of keywords) {
      if (rawTitle.includes(keyword)) {
        verticalText = keyword;
        // 从主标题中移除关键词，避免重复
        projectTitle = projectTitle.replace(keyword, '').trim();
        break;
      }
    }

    // 如果没有找到关键词，默认为"技术方案"，并从主标题移除
    if (!verticalText) {
      verticalText = '技术方案';
      // 从主标题中移除"技术方案"
      projectTitle = projectTitle.replace(/技术方案/g, '').trim();
    }

    // 移除正文中的第一个h1标签（避免重复显示）
    let contentWithoutFirstH1 = parsedContent.replace(/<h1[^>]*>.+?<\/h1>/, '');

    // 移除正文中可能存在的"技术方案"重复标题（h2或h3标签）
    contentWithoutFirstH1 = contentWithoutFirstH1.replace(
      /<h[23][^>]*>(技术方案|报价方案|报价单)[^<]*<\/h[23]>/,
      ''
    );

    // 生成竖排文字（每个字符一行）- Word兼容性更好
    const verticalTextWithBreak = verticalText.split('').join('<br>');

    // 获取供应方信息
    const supplierName = supplierInfo?.companyName || '未填写';
    const contactPerson = supplierInfo?.contactPerson || '未填写';
    const contactPhone = supplierInfo?.phone || '未填写';
    const contactEmail = supplierInfo?.email || '未填写';

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
      margin: 0.8cm 0.8cm;
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
    
    /* 隐藏水印 */
    .watermark {
      display: none;
    }
    
    /* 封面样式 - 删除蓝色渲染块 */
    .cover {
      text-align: center;
      padding: 40pt 60pt;
      page-break-after: always;
      break-after: page;
      mso-pagination: none;
      background: white;
      color: #333333;
      height: 270mm;
      min-height: 270mm;
      max-height: 270mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }

    .cover-title {
      font-size: 32pt;
      font-weight: 700;
      color: #333333;
      margin-bottom: 4pt;
      margin-top: 30pt;
      letter-spacing: 2pt;
    }

    .cover-vertical-text {
      /* 竖排文字 - 使用br换行实现，兼容性最好 */
      font-size: 48pt;
      color: #333333;
      letter-spacing: 54pt;
      height: auto;
      margin: 200px auto 0;
      font-weight: bold;
      line-height: 1.5;
      text-align: center;
      white-space: nowrap;
    }

    .cover-divider {
      width: 120pt;
      height: 2pt;
      background: #333333;
      margin: 0 auto 30pt;
    }

    /* 封面底部区域 */
    .cover-bottom {
      padding: 5px 80px 20px 80px;
      text-align: left;
      position: absolute;
      bottom: 15px;
      left: 0;
      right: 0;
    }

    .cover-info {
      font-size: 13pt;
      color: #333333;
      margin: 0 auto;
      max-width: 500pt;
      line-height: 1.8;
      text-align: left;
      padding-bottom: 30pt;
    }

    .cover-info p {
      text-indent: 0;
      margin: 4pt 0;
      color: #333333;
      font-weight: 400;
    }

    .cover-info strong {
      color: #333333;
      font-weight: 600;
      display: inline-block;
      min-width: 90pt;
    }
    
    /* 分页控制 - 强制封面独占一页 */
    .page-break {
      page-break-after: always;
      break-after: page;
      mso-element: none;
      mso-pagination: none;
      mso-break-type: section-break;
      clear: both;
      height: 0;
      line-height: 0;
      font-size: 0;
      margin: 0;
      padding: 0;
      border: none;
    }
    
    .page-break-before {
      page-break-before: always;
      break-before: page;
    }
    
    /* 确保页眉不在封面页显示 */
    .content > .header {
      display: block;
    }
    
    .cover + .page-break + .content > .header {
      display: block;
    }
    
    /* 页眉 - 简洁 */
    .header {
      border-bottom: 2px solid #333333;
      padding-bottom: 6pt;
      margin-bottom: 12pt;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .header-title {
      font-size: 13pt;
      font-weight: 600;
      color: #333333;
    }

    .header-date {
      font-size: 11pt;
      color: #666666;
    }
    
    /* 标题样式 - 多级编号商务风格 */
    h1 {
      font-size: 18pt;
      font-weight: 700;
      color: #1e40af;
      margin-top: 14pt;
      margin-bottom: 10pt;
      padding-bottom: 6pt;
      border-bottom: 2px solid #1e40af;
      text-align: center;
      page-break-after: avoid;
    }

    h2 {
      font-size: 15pt;
      font-weight: 700;
      color: #000000;
      margin-top: 16pt;
      margin-bottom: 8pt;
      padding-top: 8pt;
      padding-bottom: 8pt;
      padding-left: 12pt;
      border-left: 4px solid #1e40af;
      background: #f0f9ff;
      page-break-after: avoid;
    }

    h3 {
      font-size: 13pt;
      font-weight: 600;
      color: #333333;
      margin-top: 12pt;
      margin-bottom: 6pt;
      padding-left: 16pt;
      border-left: 3px solid #60a5fa;
      background: #f8fafc;
      page-break-after: avoid;
    }

    h4 {
      font-size: 12pt;
      font-weight: 600;
      color: #333333;
      margin-top: 10pt;
      margin-bottom: 5pt;
      padding-left: 20pt;
      border-left: 2px solid #93c5fd;
      page-break-after: avoid;
    }
    
    /* 段落样式 - 简洁 */
    p {
      margin-bottom: 5pt;
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
      margin: 10pt 0;
      border: 1px solid #cbd5e1;
    }

    th {
      background: #1e40af;
      color: white;
      font-weight: 600;
      padding: 6pt 4pt;
      border: 1px solid #1e40af;
      text-align: center;
      font-size: 10pt;
    }

    td {
      padding: 5pt 3pt;
      border: 1px solid #cbd5e1;
      text-align: center;
      font-size: 10pt;
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
      margin: 8pt 0;
      padding-left: 28pt;
    }

    li {
      margin-bottom: 4pt;
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
      margin: 24pt 0;
    }
    
    /* 内容区域 */
    .content {
      position: relative;
      z-index: 1;
      page-break-before: always;
      break-before: page;
      mso-pagination: none;
      display: block;
      min-height: 100%;
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
  </style>
</head>
<body>
  <!-- 封面页 -->
  <div class="cover">
    <!-- 封面顶部区域 -->
    <div class="cover-top">
      <!-- 主标题（左对齐） -->
      <div class="cover-title">${projectTitle}</div>
      
      <!-- 竖排方案名称（居中） -->
      <div class="cover-vertical-text">${verticalTextWithBreak}</div>
    </div>
    
    <!-- 封面底部区域 -->
    <div class="cover-bottom">
      <div class="cover-info">
        <p><strong>编制单位</strong>　${supplierName}</p>
        <p><strong>编制人</strong>　${contactPerson}</p>
        <p><strong>联系电话</strong>　${contactPhone}</p>
        ${contactEmail !== '未填写' ? `<p><strong>电子邮箱</strong>　${contactEmail}</p>` : ''}
        <p style="page-break-after: always; break-after: page; mso-element: none; mso-pagination: none; mso-break-type: section-break;"><strong>编制日期</strong>　${currentDate}</p>
      </div>
    </div>
  </div>
  
  <!-- 分页控制：强制正文从第二页开始 -->
  <div class="page-break"></div>
  
  <!-- 正文 -->
  <div class="content">
    ${contentWithoutFirstH1}
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
      title: '下载成功',
      description: 'Word文档已下载',
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
        title: '下载失败',
        description: '请允许弹出窗口',
        variant: 'destructive',
        duration: 3000,
      });
      return;
    }

    const content = message.content;

    // 将Markdown转换为HTML
    let parsedContent = parseMarkdownToHtml(content);

    // 移除正文中的第一个 h1 标题，避免重复显示
    parsedContent = parsedContent.replace(/<h1[^>]*>.+?<\/h1>/, '');

    const currentDate = new Date().toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // 提取PDF专用标题（独立于Word的逻辑）
    const titleMatch = content.match(/^#\s+(.+)$/m);
    let pdfMainTitle = titleMatch ? titleMatch[1].trim() : '技术方案';

    // 从主标题中移除"技术方案"等关键词，避免重复显示
    const pdfKeywords = ['技术方案', '报价方案', '报价单'];
    for (const keyword of pdfKeywords) {
      if (pdfMainTitle.includes(keyword)) {
        pdfMainTitle = pdfMainTitle.replace(keyword, '').trim();
        break;
      }
    }

    const pdfVerticalText = '技术方案'; // PDF固定显示"技术方案"竖排文字

    // 获取供应方信息
    const supplierName = supplierInfo?.companyName || '未填写';
    const contactPerson = supplierInfo?.contactPerson || '未填写';
    const contactPhone = supplierInfo?.phone || '未填写';
    const contactEmail = supplierInfo?.email || '未填写';

    // 竖排文字直接使用writing-mode，不需要手动添加<br>
    const pdfVerticalTextWithBreak = pdfVerticalText;

    const printContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>技术方案</title>
  <style>
    /* 打印设置 - PDF专用 */
    @page {
      size: A4;
      margin: 0.8cm 0.8cm;
    }
    
    @media print {
      body {
        padding: 0;
      }

      /* 分页控制 */
      h2 {
        page-break-before: auto;
        margin-top: 20px;
        margin-bottom: 10px;
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
        background: #ffffff !important;
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
      line-height: 1.5;
      color: #333;
      margin: 0;
      padding: 12px;
    }
    
    /* 封面样式 - PDF专用 */
    .cover {
      text-align: center;
      padding: 0;
      page-break-after: always;
      background: transparent;
      color: #000000;
      height: 270mm;
      min-height: 270mm;
      max-height: 270mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      position: relative;
      overflow: visible;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      padding: 25.4mm 31.8mm 25.4mm 31.8mm;
      box-sizing: border-box;
    }
    
    /* 封面顶部区域 - 主标题居中 */
    .cover-top {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      margin-top: 0;
    }
    
    .cover-title {
      font-size: 36px;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: 2px;
      font-family: "Microsoft YaHei", "SimHei", sans-serif;
      text-align: center;
      margin-bottom: 100px;
      z-index: 10;
      position: relative;
    }
    
    /* 竖排方案名称 - 从上到下显示 */
    .cover-vertical-text {
      writing-mode: vertical-lr;
      text-orientation: mixed;
      font-size: 52px;
      color: #ffffff;
      letter-spacing: 45px;
      margin: 0 auto;
      font-weight: 800;
      line-height: normal;
      font-family: "Microsoft YaHei", "SimHei", sans-serif;
      align-self: center;
      z-index: 10;
      position: relative;
      height: auto;
    }
    
    /* 蓝色渲染块 - 全尺寸封面 */
    .cover-blue-block {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      width: 210mm;
      height: 297mm;
      background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
      z-index: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    
    /* 封面底部区域 */
    .cover-bottom {
      position: absolute;
      left: 30mm;
      bottom: 10mm;
      text-align: left;
    }
    
    .cover-info {
      font-size: 14px;
      color: #ffffff;
      line-height: 1.8;
      text-align: left;
      font-family: "Microsoft YaHei", "SimHei", sans-serif;
    }
    
    .cover-info p {
      text-indent: 0;
      margin: 0;
      color: #ffffff;
    }
    
    .cover-info strong {
      color: #ffffff;
      font-weight: 600;
      display: inline-block;
      min-width: 80px;
      margin-right: 8px;
    }
    
    /* 标题样式 - 多级编号商务风格 */
    h1 {
      font-size: 28px;
      font-weight: 700;
      color: #1e40af;
      margin-top: 16px;
      margin-bottom: 14px;
      padding-bottom: 8px;
      border-bottom: 3px solid #1e40af;
      text-align: center;
    }

    h2 {
      font-size: 20px;
      font-weight: 700;
      color: #000000;
      margin-top: 20px;
      margin-bottom: 10px;
      padding-left: 18px;
      padding-right: 15px;
      padding-top: 10px;
      padding-bottom: 10px;
      border-left: 5px solid #1e40af;
      background: #f0f9ff;
      border-radius: 0 6px 6px 0;
    }

    h3 {
      font-size: 17px;
      font-weight: 600;
      color: #333333;
      margin-top: 16px;
      margin-bottom: 8px;
      padding-left: 22px;
      border-left: 4px solid #60a5fa;
      background: #f8fafc;
      line-height: 1.6;
    }

    h4 {
      font-size: 16px;
      font-weight: 600;
      color: #333333;
      margin-top: 14px;
      margin-bottom: 6px;
      padding-left: 26px;
      border-left: 3px solid #93c5fd;
      background: #f0f9ff;
      line-height: 1.6;
    }
    
    /* 段落样式 */
    p {
      margin-bottom: 6px;
      text-align: justify;
      text-indent: 2em;
      font-size: 14px;
      line-height: 1.7;
      color: #334155;
    }
    
    /* 表格样式 */
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0;
      border: 1px solid #e2e8f0;
      table-layout: auto;
    }

    th {
      background: #1e40af;
      color: white;
      font-weight: 600;
      padding: 8px 6px;
      border: 1px solid #1e40af;
      text-align: center;
      font-size: 12px;
      line-height: 1.5;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    td {
      padding: 6px 4px;
      border: 1px solid #e2e8f0;
      text-align: center;
      font-size: 11px;
      color: #334155;
      vertical-align: middle;
      line-height: 1.5;
      word-wrap: break-word;
      overflow-wrap: break-word;
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
      margin: 12px 0;
      padding-left: 40px;
    }

    li {
      margin-bottom: 4px;
      font-size: 14px;
      line-height: 1.7;
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
      margin: 24px 0;
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
    <!-- 蓝色渲染块 -->
    <div class="cover-blue-block"></div>
    
    <!-- 封面顶部区域 -->
    <div class="cover-top">
      <div class="cover-title">${pdfMainTitle}</div>
      <div class="cover-vertical-text">${pdfVerticalTextWithBreak}</div>
    </div>
    
    <!-- 封面底部区域 -->
    <div class="cover-bottom">
      <div class="cover-info">
        <p><strong>编制单位</strong>　${supplierName}</p>
        <p><strong>编制人</strong>　${contactPerson}</p>
        <p><strong>联系电话</strong>　${contactPhone}</p>
        ${contactEmail !== '未填写' ? `<p><strong>电子邮箱</strong>　${contactEmail}</p>` : ''}
        <p><strong>编制日期</strong>　${currentDate}</p>
      </div>
    </div>
  </div>
  
  <!-- 正文 -->
  <div class="content">
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
      title: '准备下载PDF',
      description: '打印窗口已打开，请选择「另存为PDF」保存',
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

          <div className="text-xs text-slate-500">{formatTime(message.timestamp)}</div>
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
      (message.content &&
        (message.content.includes('技术方案') || message.content.includes('项目概述')));

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

            <div className="text-xs text-slate-500">{formatTime(message.timestamp)}</div>
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

    console.log(
      '[ChatMessage] 选择渲染组件:',
      isDetailedProposal
        ? 'SimpleMarkdown (详细方案)'
        : hasQuote
          ? 'IframeHTMLContainer (报价单)'
          : 'SimpleMarkdown (普通)'
    );

    return (
      <div className="flex items-start gap-3">
        <Avatar className="h-8 w-8 flex-shrink-0">
          <AvatarFallback className="bg-emerald-100 text-emerald-700">
            <Bot className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0 space-y-3">
          {/* 根据内容类型选择渲染方式 */}
          {isDetailedProposal
            ? /* 详细方案使用 SimpleMarkdown 渲染 */
              (() => {
                console.log('[ChatMessage] 渲染详细方案');
                return (
                  <SimpleMarkdown content={message.content} isStreaming={message.isStreaming} />
                );
              })()
            : hasQuote
              ? /* 报价单使用 IframeHTMLContainer 渲染 */
                (() => {
                  console.log('[ChatMessage] 渲染报价单');
                  return <IframeHTMLContainer htmlContent={message.content} />;
                })()
              : /* 普通消息使用 SimpleMarkdown 渲染 */
                (() => {
                  console.log('[ChatMessage] 渲染普通消息');
                  return (
                    <SimpleMarkdown content={message.content} isStreaming={message.isStreaming} />
                  );
                })()}

          {/* 生图结果 */}
          {message.metadata?.imageUrl && (
            <div className="mt-2 space-y-2">
              <div className="relative group rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={message.metadata.imageUrl}
                  alt={message.metadata.imagePrompt || '生成的图片'}
                  className="w-full max-w-lg rounded-lg"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                  <a
                    href={message.metadata.imageUrl}
                    download="generated-image.png"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="opacity-0 group-hover:opacity-100 transition-opacity bg-white text-slate-800 rounded-full p-2 shadow-lg hover:bg-slate-100"
                    title="下载图片"
                  >
                    <ArrowDownToLine className="h-5 w-5" />
                  </a>
                </div>
              </div>
              {message.metadata.imagePrompt && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  提示词: {message.metadata.imagePrompt}
                </p>
              )}
            </div>
          )}

          {/* 置信度指标和匹配详情 - 新增 */}
          {message.metadata?.confidence !== undefined && (
            <div className="mt-3 space-y-3">
              {/* 置信度卡片 */}
              <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <div className="flex items-center gap-2 text-sm">
                  <Brain className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <span className="font-medium text-blue-900 dark:text-blue-100">智能匹配置信度</span>
                  <span className="text-xs bg-blue-100 dark:bg-blue-900/50 px-2 py-0.5 rounded-full text-blue-700 dark:text-blue-300">
                    {(message.metadata.confidence * 100).toFixed(1)}%
                  </span>
                </div>

                {/* 匹配详情 */}
                {message.metadata?.entities?.matchSummary && (
                  <div className="mt-2 space-y-1 text-xs text-slate-700 dark:text-slate-300">
                    <div className="flex justify-between">
                      <span>匹配产品数:</span>
                      <span className="font-medium">{message.metadata.entities.matchSummary.totalMatches}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>精确匹配:</span>
                      <span className="font-medium text-green-700 dark:text-green-400">
                        {message.metadata.entities.matchSummary.exactMatches}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>近似匹配:</span>
                      <span className="font-medium text-amber-700 dark:text-amber-400">
                        {message.metadata.entities.matchSummary.approximateMatches}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* 可视化图表 */}
              {message.metadata?.entities?.matchSummary && (
                <MatchVisualization matchSummary={message.metadata.entities.matchSummary} />
              )}
            </div>
          )}

          {/* 产品对比卡片（不受 prose 容器宽度限制） */}
          {message.metadata?.entities?.brandCompare &&
            Array.isArray(message.metadata.entities.brandCompare) &&
            message.metadata.entities.brandCompare.length >= 2 && (
              <div className="mt-4 not-prose">
                <BrandCompareCard
                  items={message.metadata.entities.brandCompare}
                  onBrandSelect={(item) => onBrandSelect?.(message.id, item)}
                />
              </div>
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
        'py-4 px-4 md:px-6 w-full',
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
