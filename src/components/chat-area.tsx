'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Upload, Paperclip, Sparkles, Square, Loader2, Plus, Code, ArrowUp, ChevronDown, Layers, ArrowDownToLine, MessageSquare, Zap, FileText, Sparkle, Info, Brain, FileSpreadsheet, FileText as _FileTextIcon, Image as _ImageIcon } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import ChatMessage from '@/components/chat-message';
import { BrandCompareItem } from '@/components/brand-compare-card';
import FixedSwitcher from '@/components/fixed-switcher';
import FloatingSwitcher from '@/components/floating-switcher';
import KnowledgeCenter from '@/components/knowledge-center';
import { useSwitch } from './switch-manager';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { logOnce, logWithTimestamp, warnOnce } from '@/lib/logger';
import { getClientAuthHeaders } from '@/lib/client-utils';

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

interface ChatAreaProps {
  conversationId: string | null;
  onOpenRightPanel: () => void;
  onNewConversation?: () => void;
  supplierInfo?: SupplierInfo;
  onTitleChange?: (title: string) => void;
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
  isStreaming?: boolean;
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

interface FileUpload {
  id: string;
  name: string;
  size: string;
  type: string;
  url?: string;
  file?: File;
}

// ============================================================================
// 意图图标映射
// ============================================================================

const intentIcons: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  ask_quote: {
    icon: <FileText className="h-3 w-3" />,
    label: '报价咨询',
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  upload_document: {
    icon: <FileSpreadsheet className="h-3 w-3" />,
    label: '文件解析',
    color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  compare_quotes: {
    icon: <Layers className="h-3 w-3" />,
    label: '对比分析',
    color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  },
  modify_quote: {
    icon: <Zap className="h-3 w-3" />,
    label: '修改报价',
    color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  },
  export_quote: {
    icon: <ArrowDownToLine className="h-3 w-3" />,
    label: '导出报价',
    color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  },
  ask_general: {
    icon: <MessageSquare className="h-3 w-3" />,
    label: '一般咨询',
    color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400',
  },
  unknown: {
    icon: <Info className="h-3 w-3" />,
    label: '未知',
    color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
  },
};

// ============================================================================
// 智能标题生成函数
// ============================================================================

function generateSmartTitle(message: string, files: FileUpload[]): string {
  if (files && files.length > 0) {
    const fileNames = files.map((f) => f.name).join('、');
    if (fileNames.length <= 20) {
      return fileNames;
    }
    return fileNames.substring(0, 17) + '...';
  }

  if (!message || message.trim() === '') {
    return '新对话';
  }

  const cleanMessage = message.trim().replace(/\s+/g, ' ');

  if (cleanMessage.length <= 15) {
    return cleanMessage;
  }

  const maxLength = 15;
  let truncated = cleanMessage.substring(0, maxLength);

  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxLength * 0.6) {
    truncated = truncated.substring(0, lastSpace);
  }

  return truncated + '...';
}

// 保存消息到数据库
const saveMessageToDatabase = async (
  conversationId: string | null,
  role: string,
  content: string,
  quoteData?: any,
  files?: any[],
  metadata?: any
) => {
  if (!conversationId) {
    console.log('[ChatArea] 没有 conversationId，不保存消息');
    return;
  }

  if (!content || content.trim() === '') {
    console.log('[ChatArea] 消息内容为空，不保存到数据库');
    return;
  }

  try {
    console.log('[ChatArea] 保存消息到数据库:', { conversationId, role, content });
    const response = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getClientAuthHeaders() },
      body: JSON.stringify({
        conversationId,
        role,
        content,
        quoteData,
        files,
        metadata,
      }),
    });

    const data = await response.json();
    if (response.ok) {
      console.log('[ChatArea] 消息保存成功:', data);
    } else {
      console.error('[ChatArea] 消息保存失败:', data);
    }
  } catch (error) {
    console.error('保存消息失败:', error);
  }
};

// 更新对话标题
const updateConversationTitle = async (conversationId: string, title: string) => {
  try {
    console.log('[ChatArea] 更新对话标题:', { conversationId, title });
    const response = await fetch(`/api/conversations/${conversationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getClientAuthHeaders() },
      body: JSON.stringify({ title }),
    });

    if (response.ok) {
      console.log('[ChatArea] 标题更新成功');
      window.dispatchEvent(new CustomEvent('conversation-list-refresh'));

      window.dispatchEvent(
        new CustomEvent('conversation-title-changed', {
          detail: { title },
        })
      );
    }
  } catch (error) {
    console.error('[ChatArea] 更新标题失败:', error);
  }
};

export default function ChatArea({
  conversationId,
  onOpenRightPanel,
  onNewConversation,
  supplierInfo,
  onTitleChange,
}: ChatAreaProps) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [files, setFiles] = useState<FileUpload[]>([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevMessagesLengthRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(conversationId);
  const currentConversationIdRef = useRef(currentConversationId);
  const [isReady, setIsReady] = useState(false);

  const shouldAllowCreation = useRef(false);

  const [_pendingFiles,_setPendingFiless] = useState<FileUpload[]>([]);
  const [_showIntentButtons,_setShowIntentButtonss] = useState(false);
  const [uploadedFilesData, setUploadedFilesData] = useState<any[]>([]);
  const [parsedFilesMap, setParsedFilesMap] = useState<Record<string, any[]>>({});
  const parsedFilesMapRef = useRef(parsedFilesMap);
  const [showKnowledgeCenter, setShowKnowledgeCenter] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('deepseek');
  const [activeModule, setActiveModule] = useState<string | null>(null);

  const switchContext = useSwitch();
  const {
    setActiveGroup,
    setLoading: setSwitchLoading,
    fileGroupId: activeGroupId,
    currentChoice: activeChoice,
    isLoading: switchIsLoading,
    generatedChoice,
    setGeneratedChoice,
    resetSwitch,
  } = switchContext;

  // 页面首次加载时记录初始化日志（只输出一次）
  useEffect(() => {
    if (typeof window !== 'undefined' && window.console) {
      // 使用 logOnce 确保整个初始化过程只输出一次
      const timestamp = new Date().toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      
      logOnce(
        'ChatArea-Init', 
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${timestamp} - ChatArea 组件初始化\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
      );
    }
  }, []); // 只在组件挂载时执行一次

  // 自动滚动到底部的函数
  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
      // 移除频繁的滚动日志，避免控制台过于嘈杂
      // logOnce('ChatArea', '滚动到底部');
    } else if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      // 移除频繁的滚动日志，避免控制台过于嘈杂
      // logOnce('ChatArea', '滚动到容器底部');
    }
  }, [messagesEndRef, scrollRef]);

  // 当消息数量变化时滚动到底部
  useEffect(() => {
    if (messages.length > prevMessagesLengthRef.current) {
      // 移除频繁的滚动日志，避免控制台过于嘈杂
      // console.log('[ChatArea] 消息数量增加，触发滚动');
      setTimeout(scrollToBottom, 100);
    }
    prevMessagesLengthRef.current = messages.length;
  }, [messages, scrollToBottom]);

  useEffect(() => {
    parsedFilesMapRef.current = parsedFilesMap;
  }, [parsedFilesMap]);

  useEffect(() => {
    currentConversationIdRef.current = currentConversationId;
  }, [currentConversationId]);

  const activeChoiceRef = useRef(activeChoice);
  useEffect(() => {
    activeChoiceRef.current = activeChoice;
  }, [activeChoice]);

  const switchIsLoadingRef = useRef(switchIsLoading);
  useEffect(() => {
    switchIsLoadingRef.current = switchIsLoading;
  }, [switchIsLoading]);

  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const generatedChoiceRef = useRef(generatedChoice);
  useEffect(() => {
    generatedChoiceRef.current = generatedChoice;
  }, [generatedChoice]);

  // 监听新对话事件
  useEffect(() => {
    const handleNewConversation = () => {
      logOnce('ChatArea', '收到新建对话事件，清空所有状态');

      logWithTimestamp('ChatArea', '新建对话');

      setMessages([]);
      setFiles([]);
      setInput('');
      setUploadedFilesData([]);
      setParsedFilesMap({});
      setCurrentConversationId(null);

      if (resetSwitch) {
        resetSwitch();
      }

      if (onTitleChange) {
        onTitleChange('新对话');
      }

      setTimeout(scrollToBottom, 100);
    };

    window.addEventListener('new-conversation', handleNewConversation);
    return () => {
      window.removeEventListener('new-conversation', handleNewConversation);
    };
  }, [resetSwitch, onTitleChange, scrollToBottom]);

  useEffect(() => {
    const handleSelectConversation = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { conversationId } = customEvent.detail;
      console.log('[ChatArea] 收到选择对话事件:', conversationId);
    };

    window.addEventListener('select-conversation', handleSelectConversation);
    return () => {
      window.removeEventListener('select-conversation', handleSelectConversation);
    };
  }, []);

  // 监听加载对话事件
  useEffect(() => {
    const handleLoadConversation = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { conversationId, messages: loadedMessages, files: loadedFiles } = customEvent.detail;
      console.log('[ChatArea] 收到加载对话事件:', {
        conversationId,
        loadedMessagesCount: loadedMessages?.length,
        loadedFilesCount: loadedFiles?.length,
      });

      setCurrentConversationId(conversationId);

      if (loadedMessages && loadedMessages.length > 0) {
        console.log('[ChatArea] 设置消息:', loadedMessages);

        const allFiles: any[] = [];

        // 找到最后一个助手消息的索引
        let lastAssistantIndex = -1;
        for (let i = loadedMessages.length - 1; i >= 0; i--) {
          if (loadedMessages[i].role === 'assistant') {
            lastAssistantIndex = i;
            break;
          }
        }

        const formattedMessages = loadedMessages
          .map((msg: any, index: number) => {
            // 如果是助手消息但不是最后一个，返回 null（后续过滤掉）
            if (msg.role === 'assistant' && index !== lastAssistantIndex) {
              console.log(`[ChatArea] 过滤掉旧的助手消息: ${msg.id}`);
              return null;
            }

            let fileData = [];

            if (msg.file_data && Array.isArray(msg.file_data) && msg.file_data.length > 0) {
              fileData = msg.file_data;
              console.log(
                `[ChatArea] 消息 ${msg.id || index} 从 file_data 获取文件:`,
                fileData.length
              );
            } else if (msg.files && Array.isArray(msg.files) && msg.files.length > 0) {
              fileData = msg.files;
              console.log(`[ChatArea] 消息 ${msg.id || index} 从 files 获取文件:`, fileData.length);
            } else if (msg.fileData && Array.isArray(msg.fileData) && msg.fileData.length > 0) {
              fileData = msg.fileData;
              console.log(
                `[ChatArea] 消息 ${msg.id || index} 从 fileData 获取文件:`,
                fileData.length
              );
            } else {
              console.log(`[ChatArea] 消息 ${msg.id || index} 没有文件数据`);
            }

            if (fileData.length > 0) {
              allFiles.push(...fileData);
            }

            const quoteData = msg.quote_data || msg.quoteData;
            const metadata = msg.metadata;

            return {
              id: msg.id || Date.now() + index,
              role: msg.role || 'assistant',
              content: msg.content || '',
              timestamp: msg.created_at || msg.timestamp || new Date().toISOString(),
              quoteData: quoteData,
              files: fileData,
              fileData: fileData,
              action: msg.action,
              fileGroupId: msg.fileGroupId,
              currentChoice: msg.currentChoice,
              isTemporary: msg.isTemporary || false,
              metadata: metadata,
            };
          })
          .filter((msg: any) => msg !== null); // 过滤掉旧的助手消息

        setMessages(formattedMessages);

        const uniqueFiles = allFiles.filter(
          (file: any, index: number, self: any[]) =>
            index === self.findIndex((f: any) => f.id === file.id)
        );

        // 注意：不要在这里调用 setFiles(uniqueFiles)
        // 历史消息中的文件应该只在消息历史中显示，不应该再次添加到输入框
        if (uniqueFiles.length > 0) {
          console.log(
            '[ChatArea] 检测到历史消息中的文件，但不会将其添加到输入框，数量:',
            uniqueFiles.length
          );
        } else {
          console.log('[ChatArea] 没有文件可设置');
        }

        const firstUserMessage = formattedMessages.find((m: any) => m.role === 'user');
        if (firstUserMessage && onTitleChange) {
          const title = generateSmartTitle(firstUserMessage.content, []);
          onTitleChange(title);
        }

        const fileCountByMessage = formattedMessages.map((m: any) => ({
          id: m.id,
          filesCount: m.files?.length || 0,
        }));
        console.log('[ChatArea] 各消息文件数量统计:', fileCountByMessage);
        console.log('[ChatArea] 总文件数量:', uniqueFiles.length);
      } else {
        console.log('[ChatArea] 没有消息可显示');
        setMessages([]);
        setFiles([]);
        if (onTitleChange) {
          onTitleChange('新对话');
        }
      }

      setTimeout(scrollToBottom, 300);
    };

    window.addEventListener('load-conversation', handleLoadConversation);
    return () => {
      window.removeEventListener('load-conversation', handleLoadConversation);
    };
  }, []);

  const {
    getRootProps: getRootPropsForInput,
    getInputProps,
    isDragActive,
  } = useDropzone({
    onDrop: (acceptedFiles) => {
      const newFiles = acceptedFiles.map((file) => ({
        id: `${Date.now()}-${Math.random()}`,
        name: file.name,
        size: formatFileSize(file.size),
        type: file.type,
        file: file,
      }));
      setFiles([...files, ...newFiles]);
    },
    noClick: true,
    multiple: true,
  });

  const dropzoneProps = getRootPropsForInput();
  const { onKeyDown: _dropzoneKeyDown, ...dropzonePropsWithoutKeyboard } = dropzoneProps;

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  useEffect(() => {
    setIsReady(true);
    const timer = setTimeout(() => {
      shouldAllowCreation.current = true;
      logOnce('ChatArea', '安全锁已开启，现在允许创建对话');
    }, 500);

    return () => {
      clearTimeout(timer);
      setIsReady(false);
      shouldAllowCreation.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isReady) return;

    if (conversationId) {
      setCurrentConversationId(conversationId);
      loadConversation(conversationId);
    } else {
      setMessages([]);
      setCurrentConversationId(null);
      window.dispatchEvent(new CustomEvent('clear-quote-table'));
      if (onTitleChange) {
        onTitleChange('新对话');
      }
      setTimeout(scrollToBottom, 100);
    }
  }, [conversationId, isReady]);

  useEffect(() => {
    const inputElement = document.querySelector('textarea');
    if (inputElement) {
      const handleFocus = () => {
        const switcher = document.querySelector('[class*="floating-switcher"]') as HTMLElement;
        if (switcher) {
          switcher.style.zIndex = '40';
        }
      };

      const handleBlur = () => {
        const switcher = document.querySelector('[class*="floating-switcher"]') as HTMLElement;
        if (switcher) {
          switcher.style.zIndex = '9999';
        }
      };

      inputElement.addEventListener('focus', handleFocus);
      inputElement.addEventListener('blur', handleBlur);

      return () => {
        inputElement.removeEventListener('focus', handleFocus);
        inputElement.removeEventListener('blur', handleBlur);
      };
    }
  }, []);

  useEffect(() => {
    const handleIntentSelect = async (event: Event) => {
      const customEvent = event as CustomEvent;
      const { fileGroupId, choice } = customEvent.detail;

      console.log('[Chat] 收到 intent-select 事件:', { fileGroupId, choice });
      console.log('[Chat] 当前 parsedFilesMap:', Object.keys(parsedFilesMapRef.current));

      const files = parsedFilesMapRef.current[fileGroupId];
      console.log('[Chat] 获取到的 files:', files ? `有 ${files.length} 个文件` : 'undefined');

      if (files) {
        setActiveGroup(fileGroupId, files, choice);
      } else {
        console.error('[Chat] 未找到文件组数据, fileGroupId:', fileGroupId);
      }

      await handleIntentSelectionForSwitch(fileGroupId, choice);
    };

    window.addEventListener('intent-select', handleIntentSelect);
    return () => {
      window.removeEventListener('intent-select', handleIntentSelect);
    };
  }, []);

  useEffect(() => {
    const handleSwitchChange = async (event: Event) => {
      const customEvent = event as CustomEvent;
      const { fileGroupId, choice } = customEvent.detail;

      await handleIntentSelectionForSwitch(fileGroupId, choice);
    };

    window.addEventListener('switch-change', handleSwitchChange);
    return () => {
      window.removeEventListener('switch-change', handleSwitchChange);
    };
  }, [parsedFilesMap, switchIsLoading]);

  useEffect(() => {
    const handleFillPricesComplete = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { success, count, error } = customEvent.detail;

      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.isTemporary && msg.content.includes('正在为您填充市场参考价')) {
            if (success) {
              return {
                ...msg,
                content: `价格都已按照市场价格填充，共填充 ${count} 个产品的市场参考价`,
                isTemporary: false,
              };
            } else {
              return {
                ...msg,
                content: `价格填充失败：${error}`,
                isTemporary: false,
              };
            }
          }
          return msg;
        })
      );
    };

    window.addEventListener('fill-market-prices-complete', handleFillPricesComplete);
    return () => {
      window.removeEventListener('fill-market-prices-complete', handleFillPricesComplete);
    };
  }, []);

  const loadConversation = async (id: string) => {
    try {
      console.log('[ChatArea] 加载对话:', id);
      const response = await fetch(`/api/conversations/${id}`, {
        headers: getClientAuthHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        console.log('[ChatArea] 加载成功:', data);

        if (data.conversation?.messages && data.conversation.messages.length > 0) {
          console.log('[ChatArea] 从API获取到消息:', data.conversation.messages.length);

          const allFiles: any[] = [];

          // 找到最后一个助手消息的索引
          let lastAssistantIndex = -1;
          for (let i = data.conversation.messages.length - 1; i >= 0; i--) {
            if (data.conversation.messages[i].role === 'assistant') {
              lastAssistantIndex = i;
              break;
            }
          }

          const formattedMessages = data.conversation.messages
            .map((msg: any, index: number) => {
              // 如果是助手消息但不是最后一个，返回 null
              if (msg.role === 'assistant' && index !== lastAssistantIndex) {
                console.log(`[ChatArea] 过滤掉旧的助手消息: ${msg.id}`);
                return null;
              }

              const fileData = msg.file_data || [];

              if (fileData.length > 0) {
                allFiles.push(...fileData);
              }

              const quoteData = msg.quote_data;
              const metadata = msg.metadata;

              console.log(`[ChatArea] 消息 ${msg.id} 文件数据:`, fileData);

              return {
                id: msg.id || Date.now() + index,
                role: msg.role || 'assistant',
                content: msg.content || '',
                timestamp: msg.created_at || new Date().toISOString(),
                quoteData: quoteData,
                files: fileData,
                fileData: fileData,
                metadata: metadata,
              };
            })
            .filter((msg: any) => msg !== null);

          setMessages(formattedMessages);

          // 注意：不要在这里设置 setFiles(allFiles)
          // 历史消息中的文件应该只在消息历史中显示，不应该再次添加到输入框
          if (allFiles.length > 0) {
            console.log('[ChatArea] 检测到历史消息中的文件，但不会将其添加到输入框');
          }

          const firstUserMessage = formattedMessages.find((m: any) => m.role === 'user');
          if (firstUserMessage && onTitleChange) {
            const title = generateSmartTitle(firstUserMessage.content, []);
            onTitleChange(title);
          }
        } else {
          console.log('[ChatArea] API返回的消息为空');
          setMessages([]);
          setFiles([]);
          if (onTitleChange) {
            onTitleChange('新对话');
          }
        }

        window.dispatchEvent(new CustomEvent('clear-quote-table'));
        setTimeout(scrollToBottom, 300);
      } else if (response.status === 404) {
        console.log('[ChatArea] 对话不存在');
        setMessages([]);
        setFiles([]);
        if (onTitleChange) {
          onTitleChange('新对话');
        }
      }
    } catch (error) {
      console.error('Failed to load conversation:', error);
    }
  };

  const createNewConversation = async (
    title: string = '新对话',
    hasContent: boolean = false
  ): Promise<any | null> => {
    if (!shouldAllowCreation.current && !hasContent) {
      warnOnce('ChatArea', '安全锁未开启，禁止创建新对话');
      return null;
    }

    try {
      logOnce('ChatArea', `创建新对话: ${title}, hasContent: ${hasContent}`);
      const response = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getClientAuthHeaders() },
        body: JSON.stringify({
          title,
          hasContent,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log('[ChatArea] 对话创建成功:', data.conversation.id);
        return data.conversation;
      } else {
        const error = await response.json();
        console.log('[ChatArea] 对话创建被拒绝:', error);
        return null;
      }
    } catch (error) {
      console.error('[ChatArea] 创建对话失败:', error);
    }
    return null;
  };

  const ensureConversationId = async (hasContent: boolean = false): Promise<string | null> => {
    if (currentConversationId) {
      return currentConversationId;
    }

    if (conversationId) {
      setCurrentConversationId(conversationId);
      return conversationId;
    }

    if (!hasContent) {
      console.log('[ChatArea] 没有内容，不创建对话');
      return null;
    }

    const newConversation = await createNewConversation('新对话', true);
    if (newConversation) {
      setCurrentConversationId(newConversation.id);

      window.dispatchEvent(
        new CustomEvent('conversation-created', {
          detail: { conversationId: newConversation.id },
        })
      );

      return newConversation.id;
    }

    return null;
  };

  // 编辑消息处理函数
  const handleEditMessage = async (messageId: number, newContent: string) => {
    console.log('[ChatArea] 编辑消息:', { messageId, newContent });

    const activeConversationId = currentConversationId || conversationId;
    if (!activeConversationId) {
      console.error('[ChatArea] 没有对话ID，无法编辑消息');
      toast({
        title: '编辑失败',
        description: '没有对话ID，无法编辑消息',
        variant: 'destructive',
      });
      return;
    }

    // 更新本地消息
    setMessages((prev) =>
      prev.map((msg) => (msg.id === messageId ? { ...msg, content: newContent } : msg))
    );

    // 如果是第一条用户消息，更新对话标题
    const messageIndex = messages.findIndex((m) => m.id === messageId);
    if (messageIndex === 0 && messages[messageIndex].role === 'user') {
      const title = generateSmartTitle(newContent, []);
      await updateConversationTitle(activeConversationId, title);
      if (onTitleChange) {
        onTitleChange(title);
      }
    }

    // 更新数据库中的消息
    try {
      const message = messages.find((m) => m.id === messageId);
      if (!message) {
        console.error('[ChatArea] 未找到消息:', messageId);
        return;
      }

      const response = await fetch(`/api/messages/${messageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getClientAuthHeaders() },
        body: JSON.stringify({
          content: newContent,
        }),
      });

      if (response.ok) {
        console.log('[ChatArea] 消息编辑成功');
        toast({
          title: '编辑成功',
          description: '消息已更新',
          duration: 2000,
        });
      } else {
        const errorData = await response.json();
        console.error('[ChatArea] 消息编辑失败:', errorData);
        toast({
          title: '编辑失败',
          description: errorData.error || '请稍后重试',
          variant: 'destructive',
          duration: 2000,
        });
      }
    } catch (error) {
      console.error('[ChatArea] 编辑消息异常:', error);
      toast({
        title: '编辑失败',
        description: '发生错误，请稍后重试',
        variant: 'destructive',
        duration: 2000,
      });
    }
  };

  // 重新生成回复
  const handleRegenerate = async (messageId: number) => {
    console.log('[ChatArea] 重新生成回复，消息ID:', messageId);

    const messageIndex = messages.findIndex((m) => m.id === messageId);
    if (messageIndex === -1) {
      console.error('[ChatArea] 未找到消息:', messageId);
      return;
    }

    const currentMessage = messages[messageIndex];
    if (currentMessage.role !== 'assistant') {
      console.error('[ChatArea] 只能重新生成助手消息');
      return;
    }

    let userMessageIndex = messageIndex - 1;
    while (userMessageIndex >= 0 && messages[userMessageIndex].role !== 'user') {
      userMessageIndex--;
    }

    if (userMessageIndex < 0) {
      console.error('[ChatArea] 未找到对应的用户消息');
      return;
    }

    const userMessage = messages[userMessageIndex];
    console.log('[ChatArea] 找到用户消息:', userMessage);

    let userFiles = userMessage.files || userMessage.fileData || [];

    if (userFiles.length === 0) {
      console.log('[ChatArea] 用户消息没有文件，尝试从助手消息获取');

      for (let i = userMessageIndex + 1; i < messages.length; i++) {
        const msg = messages[i];
        if (msg.role === 'assistant') {
          const assistantFiles = msg.files || msg.fileData || [];
          if (assistantFiles.length > 0) {
            console.log('[ChatArea] 从助手消息获取到文件:', assistantFiles.length);
            userFiles = assistantFiles;
            break;
          }
        }
      }
    }

    console.log('[ChatArea] 最终使用的文件数据:', userFiles.length);

    const fileGroupId = `regenerate-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    if (userFiles.length > 0) {
      setParsedFilesMap((prev) => ({
        ...prev,
        [fileGroupId]: userFiles,
      }));
      console.log('[ChatArea] 保存文件到 parsedFilesMap:', fileGroupId, userFiles.length);
    }

    if (!currentConversationId) {
      console.error('[ChatArea] 没有对话ID');
      return;
    }

    setMessages((prev) => prev.slice(0, messageIndex));

    const controller = new AbortController();
    abortControllerRef.current = controller;

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🔄 重新生成消息: ${new Date().toLocaleString('zh-CN')}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    setLoading(true);

    try {
      const filesToSend = userFiles;

      console.log('[ChatArea] 调用API - 请求参数:', {
        message: userMessage.content,
        filesCount: filesToSend.length,
        conversationId: currentConversationId,
      });

      const chatResponse = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getClientAuthHeaders() },
        body: JSON.stringify({
          message: userMessage.content,
          files: filesToSend,
          conversationId: currentConversationId,
        }),
        signal: controller.signal,
      });

      if (chatResponse.ok) {
        const data = await chatResponse.json();
        console.log('[ChatArea] API响应:', data);

        if (data.action === 'ASK_INTENT' && data.files) {
          console.log('[ChatArea] 收到 ASK_INTENT 响应，文件数:', data.files.length);

          const intentFiles = data.files;

          setParsedFilesMap((prev) => ({
            ...prev,
            [fileGroupId]: intentFiles,
          }));

          setUploadedFilesData(intentFiles);

          const tempMessage: Message = {
            id: Date.now(),
            role: 'assistant',
            content: data.content || '文件解析完成，请选择您需要的服务：',
            timestamp: new Date().toISOString(),
            isTemporary: true,
            action: 'ASK_INTENT',
            fileGroupId,
            fileData: intentFiles,
            files: intentFiles,
            metadata: data.metadata,
          };

          setMessages((prev) => [...prev, tempMessage]);

          await saveMessageToDatabase(
            currentConversationId,
            'assistant',
            data.content,
            null,
            intentFiles,
            data.metadata
          );

          if (intentFiles.length > 0) {
            setActiveGroup(fileGroupId, intentFiles, 'quote');
            setGeneratedChoice('quote');
            console.log('[ChatArea] 设置活跃组 (ASK_INTENT):', fileGroupId, intentFiles.length);
          }
        } else {
          const newAssistantMessage: Message = {
            id: Date.now(),
            role: 'assistant',
            content: data.content,
            timestamp: new Date().toISOString(),
            quoteData: data.quoteData,
            files: filesToSend,
            fileData: filesToSend,
            fileGroupId: fileGroupId,
            currentChoice: data.currentChoice || 'quote',
            action: data.action,
            metadata: data.metadata,
          };

          setMessages((prev) => [...prev, newAssistantMessage]);

          await saveMessageToDatabase(
            currentConversationId,
            'assistant',
            data.content,
            data.quoteData,
            filesToSend,
            data.metadata
          );

          if (filesToSend.length > 0 && data.action !== 'ASK_INTENT') {
            setActiveGroup(fileGroupId, filesToSend, data.currentChoice || 'quote');
            setGeneratedChoice(data.currentChoice || 'quote');
            console.log('[ChatArea] 设置活跃组 (正常):', fileGroupId, filesToSend.length);
          }
        }

        if (data.quoteData) {
          setTimeout(() => {
            const quoteTable = document.querySelector('.export-container');
            if (quoteTable) {
              quoteTable.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }, 300);
        }

        setTimeout(scrollToBottom, 300);

        toast({
          title: '重新生成成功',
          description: '已重新生成回复',
          duration: 2000,
        });
      } else {
        const errorData = await chatResponse.json();
        console.error('[ChatArea] 重新生成失败:', errorData);
        toast({
          title: '重新生成失败',
          description: errorData.error || '请稍后重试',
          variant: 'destructive',
          duration: 2000,
        });
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('[ChatArea] 重新生成被取消');
        return;
      }
      console.error('[ChatArea] 重新生成异常:', error);
      toast({
        title: '重新生成失败',
        description: '发生错误，请稍后重试',
        variant: 'destructive',
        duration: 2000,
      });
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
      
      // 通知其他组件更新积分显示
      try {
        window.dispatchEvent(new CustomEvent('points-updated'));
      } catch (e) {
        console.error('[ChatArea] 触发积分更新事件失败:', e);
      }
    }
  };

  // 处理流式聊天响应
  const handleStreamingChat = async (message: string, conversationId: string) => {
    const tempId = Date.now() + 1;
    let fullContent = '';

    // 创建临时消息，显示加载动画
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        isStreaming: true,
      },
    ]);

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getClientAuthHeaders() },
        body: JSON.stringify({
          message,
          conversationId,
          model: selectedModel,
        }),
        signal: abortControllerRef.current?.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`流式请求失败 (${response.status}: ${response.statusText}) - ${errorText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('无法获取响应流');
      }

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === 'content') {
                fullContent += data.content;
                setMessages((prev) =>
                  prev.map((msg) => (msg.id === tempId ? { ...msg, content: fullContent } : msg))
                );
                // 每次更新内容后滚动到底部
                scrollToBottom();
              } else if (data.type === 'error') {
                console.error('[ChatArea] 流式错误:', data.error);
                throw new Error(data.error);
              } else if (data.type === 'end') {
                // 流式结束，更新消息
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === tempId
                      ? {
                          ...msg,
                          content: fullContent,
                          isStreaming: false,
                          metadata: data.metadata,
                        }
                      : msg
                  )
                );

                // 保存到数据库
                await saveMessageToDatabase(
                  conversationId,
                  'assistant',
                  fullContent,
                  undefined,
                  undefined,
                  data.metadata
                );

                // 滚动到底部
                setTimeout(scrollToBottom, 100);
              }
            } catch (e) {
              console.error('[ChatArea] 解析SSE数据失败:', e);
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('[ChatArea] 流式请求已取消');
        return;
      }

      console.error('[ChatArea] 流式聊天失败:', error);

      // 根据错误类型生成更友好的提示信息
      let userMessage = '抱歉，生成内容时发生错误，请稍后重试。';
      if (error instanceof Error) {
        if (error.message.includes('500')) {
          userMessage = '服务器内部错误，请稍后重试。';
        } else if (error.message.includes('402')) {
          userMessage = '积分不足，请充值后继续使用。';
        } else if (error.message.includes('401') || error.message.includes('403')) {
          userMessage = '认证失败，请检查您的登录状态。';
        } else if (error.message.includes('404')) {
          userMessage = '请求的资源不存在。';
        } else if (error.message.includes('429')) {
          userMessage = '请求过于频繁，请稍后再试。';
        } else if (error.message.includes('timeout') || error.message.includes('超时')) {
          userMessage = '请求超时，请检查网络连接后重试。';
        }
        // 对于其他错误，在控制台输出完整错误信息
        console.error('[ChatArea] 详细错误信息:', error.message);
      }

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempId
            ? {
                ...msg,
                content: userMessage,
                isStreaming: false,
              }
            : msg
        )
      );
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
      
      // 触发积分更新事件，通知其他组件刷新积分显示
      try {
        window.dispatchEvent(new CustomEvent('points-updated'));
        console.log('[ChatArea] 已触发积分更新事件');
      } catch (e) {
        console.error('[ChatArea] 触发积分更新事件失败:', e);
      }
    }
  };

  const handleSendMessage = async () => {
    const hasContent = input.trim() !== '' || files.length > 0;
    if (!hasContent) {
      console.log('[ChatArea] 没有内容，不发送消息');
      return;
    }

    if (loading) return;

    const activeConversationId = await ensureConversationId(true);
    if (!activeConversationId) {
      console.error('[ChatArea] 无法获取或创建对话');
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    const userMessage: Message = {
      id: Date.now(),
      role: 'user',
      content: input,
      timestamp: new Date().toISOString(),
      files: [...files],
    };

    setMessages([...messages, userMessage]);
    setInput('');

    await saveMessageToDatabase(activeConversationId, 'user', input);

    if (messages.length === 0) {
      const title = generateSmartTitle(input, files);
      await updateConversationTitle(activeConversationId, title);
      if (onTitleChange) {
        onTitleChange(title);
      }
    }

    const filesToUpload = [...files];
    setFiles([]);

    let uploadSuccessMessageId: number | null = null;
    if (filesToUpload.length > 0) {
      const fileNames = filesToUpload.map((f) => f.name).join('、');
      const tempId = Date.now() + 1;
      uploadSuccessMessageId = tempId;
      setMessages((prev) => [
        ...prev,
        {
          id: tempId,
          role: 'assistant',
          content: `文件「${fileNames}」上传成功，正在解析...`,
          timestamp: new Date().toISOString(),
          isTemporary: true,
        },
      ]);
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📤 开始上传文件: ${new Date().toLocaleString('zh-CN')}`);
    console.log(`📁 文件数量: ${filesToUpload.length}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    try {
      const uploadedFiles: any[] = [];

      for (let i = 0; i < (userMessage.files || []).length; i++) {
        const file = userMessage.files![i];

        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id === uploadSuccessMessageId) {
              const progress = ((i + 1) / (userMessage.files?.length || 1)) * 100;
              return {
                ...msg,
                content: `正在上传文件... ${Math.round(progress)}%`,
              };
            }
            return msg;
          })
        );

        const formData = new FormData();
        if (file.file) {
          formData.append('file', file.file);
        } else {
          formData.append('file', new Blob([file as any]), file.name);
        }
        const uploadResponse = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        });

        if (uploadResponse.ok) {
          const uploadData = await uploadResponse.json();
          uploadedFiles.push(uploadData);
          console.log('[ChatArea] 文件上传成功:', uploadData.fileName);
        } else {
          const errorData = await uploadResponse.json();
          console.error('[ChatArea] 文件上传失败:', errorData);

          // 移除上传进度消息
          if (uploadSuccessMessageId !== null) {
            setMessages((prev) => prev.filter((m) => m.id !== uploadSuccessMessageId));
          }

          // 显示错误消息
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now(),
              role: 'assistant',
              content: `文件上传失败：${errorData.error || '未知错误'}。请稍后重试。`,
              timestamp: new Date().toISOString(),
              action: 'ERROR',
              isTemporary: false,
            },
          ]);

          setLoading(false);
          abortControllerRef.current = null;
          return;
        }
      }

      // 如果没有文件上传，使用流式API
      if (uploadedFiles.length === 0 && userMessage.content.trim()) {
        console.log('[ChatArea] 使用流式API处理纯文本消息');
        await handleStreamingChat(userMessage.content, activeConversationId);
        return;
      }

      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id === uploadSuccessMessageId) {
            return {
              ...msg,
              content: '正在联网搜索产品信息...',
            };
          }
          return msg;
        })
      );

      const chatResponse = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getClientAuthHeaders() },
        body: JSON.stringify({
          message: userMessage.content,
          files: uploadedFiles,
          conversationId: activeConversationId,
        }),
        signal: controller.signal,
      });

      if (chatResponse.ok) {
        const data = await chatResponse.json();

        if (data.action === 'FILL_PRICES') {
          const userMessageWithFill: Message = {
            id: Date.now() + Math.random(),
            role: 'user',
            content: userMessage.content,
            timestamp: new Date().toISOString(),
          };

          const aiMessage: Message = {
            id: Date.now() + 1,
            role: 'assistant',
            content: data.content,
            timestamp: new Date().toISOString(),
            isTemporary: true,
          };

          setMessages((prev) => {
            const filtered =
              uploadSuccessMessageId !== null
                ? prev.filter((m) => m.id !== uploadSuccessMessageId)
                : prev;
            return [...filtered, userMessageWithFill, aiMessage];
          });

          window.dispatchEvent(new CustomEvent('fill-market-prices'));
        } else if (data.action === 'ASK_INTENT' && data.files) {
          const fileGroupId = `files_${Date.now()}`;

          setParsedFilesMap((prev) => ({
            ...prev,
            [fileGroupId]: data.files,
          }));

          setUploadedFilesData(data.files);

          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.id === uploadSuccessMessageId) {
                return {
                  ...msg,
                  content: data.content || '文件解析完成，请选择您需要的服务：',
                  fileData: data.files,
                  isTemporary: true,
                  action: 'ASK_INTENT',
                  fileGroupId,
                  metadata: data.metadata,
                };
              }
              return msg;
            })
          );
        } else if (data.action === 'ERROR') {
          // 处理解析错误
          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.id === uploadSuccessMessageId) {
                return {
                  ...msg,
                  content: data.content || '文件解析失败',
                  isTemporary: false,
                  action: 'ERROR',
                };
              }
              return msg;
            })
          );
        } else if (filesToUpload.length > 0 && !userMessage.content.trim()) {
          setUploadedFilesData(uploadedFiles);

          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.id === uploadSuccessMessageId) {
                return {
                  ...msg,
                  content: data.content || '文件解析完成，请选择您需要的服务：',
                  fileData: data.fileData || uploadedFiles,
                  isTemporary: true,
                  action: 'ASK_INTENT',
                  metadata: data.metadata,
                };
              }
              return msg;
            })
          );
        } else {
          const assistantMessage: Message = {
            id: Date.now() + 1,
            role: 'assistant',
            content: data.content,
            timestamp: new Date().toISOString(),
            quoteData: data.quoteData,
            metadata: data.metadata,
          };

          if (uploadSuccessMessageId !== null) {
            setMessages((prev) => prev.filter((m) => m.id !== uploadSuccessMessageId));
          }

          setMessages((prev) => [...prev, assistantMessage]);

          await saveMessageToDatabase(
            activeConversationId,
            'assistant',
            data.content,
            data.quoteData,
            uploadedFiles,
            data.metadata
          );

          if (data.conversationId) {
            window.history.replaceState({}, '', `?conversation=${data.conversationId}`);
          }

          if (data.quoteData) {
            const scrollToQuote = (retryCount = 0) => {
              const quoteTable = document.querySelector('.export-container');
              if (quoteTable) {
                const rect = quoteTable.getBoundingClientRect();
                const absoluteTop = rect.top + window.pageYOffset - 80;

                window.scrollTo({
                  top: absoluteTop,
                  behavior: 'smooth',
                });
                console.log('[Chat] 滚动到报价表格位置:', absoluteTop);
              } else if (retryCount < 5) {
                setTimeout(() => scrollToQuote(retryCount + 1), 300 * (retryCount + 1));
              }
            };

            setTimeout(() => scrollToQuote(), 300);
          }

          setTimeout(scrollToBottom, 300);
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Request cancelled by user');
        return;
      }
      console.error('Failed to send message:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'assistant',
          content: '抱歉，发生了一些错误，请稍后重试。',
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleRemoveFile = (fileId: string) => {
    setFiles(files.filter((f) => f.id !== fileId));
  };

  const handleUpdateProductPrice = (messageId: number, productIndex: number, newPrice: number) => {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id === messageId && msg.quoteData) {
          const updatedProducts = [...msg.quoteData.products];
          const product = updatedProducts[productIndex];
          if (product) {
            product.unitPrice = newPrice;
            const quantity = product.quantity || 1;
            product.totalPrice = newPrice * quantity;
            const newSubtotal = updatedProducts.reduce((sum, p) => sum + (p.totalPrice || 0), 0);
            const newTaxAmount = newSubtotal * (msg.quoteData.taxRate / 100);
            const newTotalAmount = newSubtotal + newTaxAmount;

            return {
              ...msg,
              quoteData: {
                ...msg.quoteData,
                products: updatedProducts,
                subtotal: newSubtotal,
                taxAmount: newTaxAmount,
                totalAmount: newTotalAmount,
              },
            };
          }
        }
        return msg;
      })
    );
  };

  const handleUpdateProductQuantity = (
    messageId: number,
    productIndex: number,
    newQuantity: number
  ) => {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id === messageId && msg.quoteData) {
          const updatedProducts = [...msg.quoteData.products];
          const product = updatedProducts[productIndex];
          if (product) {
            product.quantity = newQuantity;
            const price = product.unitPrice || 0;
            product.totalPrice = price * newQuantity;
            const newSubtotal = updatedProducts.reduce((sum, p) => sum + (p.totalPrice || 0), 0);
            const newTaxAmount = newSubtotal * (msg.quoteData.taxRate / 100);
            const newTotalAmount = newSubtotal + newTaxAmount;

            return {
              ...msg,
              quoteData: {
                ...msg.quoteData,
                products: updatedProducts,
                subtotal: newSubtotal,
                taxAmount: newTaxAmount,
                totalAmount: newTotalAmount,
              },
            };
          }
        }
        return msg;
      })
    );
  };

  // 将选用的品牌产品转换为报价单产品，并更新消息的 quoteData
  const handleBrandSelect = (messageId: number, item: BrandCompareItem) => {
    let newQuoteData: any = null;

    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id === messageId) {
          const existingQuoteData = msg.quoteData;
          const newProduct = {
            id: undefined,
            name: item.productName || item.brand,
            model: item.model,
            parameter_description: item.parameterDescription || '',
            brand: item.brand,
            unit: '台',
            supplier: item.supplier,
            contact_person: undefined,
            contact_phone: item.contactPhone,
            cost_price: item.costPrice,
            min_price: item.minPrice,
            price: item.price,
            image_url: undefined,
            quantity: 1,
            unitPrice: item.price,
            totalPrice: item.price,
            system: item.brand,
          };

          if (existingQuoteData) {
            // 追加产品到已有 quoteData
            const updatedProducts = [...existingQuoteData.products, newProduct];
            const newSubtotal = updatedProducts.reduce((sum: number, p: any) => sum + (p.totalPrice || 0), 0);
            const newTaxAmount = newSubtotal * ((existingQuoteData.taxRate || 13) / 100);
            const newTotalAmount = newSubtotal + newTaxAmount + (existingQuoteData.shipping || 0) + (existingQuoteData.installation || 0) + (existingQuoteData.otherFees || 0);

            newQuoteData = {
              ...existingQuoteData,
              products: updatedProducts,
              subtotal: newSubtotal,
              taxAmount: newTaxAmount,
              totalAmount: newTotalAmount,
              updatedAt: new Date().toISOString(),
            };

            return { ...msg, quoteData: newQuoteData };
          } else {
            // 创建新的 quoteData
            const taxRate = 13;
            const taxAmount = item.price * (taxRate / 100);

            newQuoteData = {
              quoteNumber: `QT${Date.now()}`,
              supplierInfo: {
                companyName: '',
                contactPerson: '',
                phone: '',
                email: '',
                address: '',
                bankName: '',
                bankAccount: '',
                taxNumber: '',
              },
              customerInfo: {
                name: '',
                projectName: '',
              },
              products: [newProduct],
              subtotal: item.price,
              taxRate,
              taxAmount,
              shipping: 0,
              installation: 0,
              otherFees: 0,
              totalAmount: item.price + taxAmount,
              terms: {
                payment: '',
                warranty: '',
                delivery: '',
                validity: '',
              },
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };

            return { ...msg, quoteData: newQuoteData };
          }
        }
        return msg;
      })
    );

    toast({
      title: '已选用产品',
      description: `${item.brand} ${item.model} 已添加到报价表`,
      duration: 2000,
    });

    // 持久化到数据库
    if (newQuoteData) {
      updateMessageQuoteData(messageId, newQuoteData);
    }
  };

  // 将消息的 quoteData 持久化到数据库
  const updateMessageQuoteData = async (messageId: number, quoteData: any) => {
    const message = messagesRef.current.find((m) => m.id === messageId);
    if (!message) return;

    try {
      const response = await fetch('/api/messages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getClientAuthHeaders() },
        body: JSON.stringify({
          quoteData,
          conversationId: currentConversationIdRef.current,
          role: message.role,
          contentPrefix: message.content?.substring(0, 100) || '',
        }),
      });

      if (!response.ok) {
        console.error('[ChatArea] 更新消息 quoteData 失败:', response.status);
      }
    } catch (error) {
      console.error('[ChatArea] 更新消息 quoteData 失败:', error);
    }
  };

  const handleIntentSelection = async (
    intent: 'quote' | 'proposal' | 'both',
    fileData: any[],
    uploadedFiles: any[]
  ) => {
    const activeConversationId = await ensureConversationId(true);
    if (!activeConversationId) {
      console.error('[ChatArea] 无法获取或创建对话');
      return;
    }

    try {
      const fileGroupId = `group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      setParsedFilesMap((prev) => ({
        ...prev,
        [fileGroupId]: uploadedFiles,
      }));

      const userChoiceText =
        intent === 'quote'
          ? '📊 我选择：生成报价单'
          : intent === 'proposal'
            ? '📝 我选择：生成方案'
            : '📑 我选择：生成方案（内含报价）';

      const userChoiceMessage: Message = {
        id: Date.now(),
        role: 'user',
        content: userChoiceText,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => {
        const withUserChoice = [...prev.filter((m) => !m.isTemporary), userChoiceMessage];
        const tempMessage: Message = {
          id: Date.now() + 1,
          role: 'assistant',
          content: `正在生成${intent === 'quote' ? '报价单' : intent === 'proposal' ? '方案' : '报价和方案'}，请稍候...`,
          timestamp: new Date().toISOString(),
          isTemporary: true,
          fileGroupId,
          currentChoice: intent,
        };
        return [...withUserChoice, tempMessage];
      });

      await saveMessageToDatabase(activeConversationId, 'user', userChoiceText);

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getClientAuthHeaders() },
        body: JSON.stringify({
          intent,
          files: uploadedFiles,
          conversationId: activeConversationId,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const assistantMessage: Message = {
          id: Date.now() + 2,
          role: 'assistant',
          content: data.content,
          timestamp: new Date().toISOString(),
          quoteData: data.quoteData,
          fileGroupId,
          currentChoice: intent,
          metadata: data.metadata,
        };

        setMessages((prev) => {
          const withoutTemp = prev.filter((m) => !m.isTemporary);
          return [...withoutTemp, assistantMessage];
        });

        await saveMessageToDatabase(
          activeConversationId,
          'assistant',
          data.content,
          data.quoteData,
          uploadedFiles,
          data.metadata
        );

        const userStr = localStorage.getItem('user');
        if (userStr) {
          try {
            const user = JSON.parse(userStr);
            if (user.role === 'user') {
              await fetch('/api/quota/check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: user.id, count: 1 }),
              });
            }
          } catch (err) {
            console.error('[Chat] 扣减配额失败:', err);
          }
        }

        setActiveGroup(fileGroupId, uploadedFiles, intent);
        setGeneratedChoice(intent);

        console.log('[Intent] 已生成内容，类型:', intent, 'fileGroupId:', fileGroupId);

        if (data.quoteData) {
          const scrollToQuote = (retryCount = 0) => {
            const quoteTable = document.querySelector('.export-container');
            if (quoteTable) {
              const rect = quoteTable.getBoundingClientRect();
              const absoluteTop = rect.top + window.pageYOffset - 80;

              window.scrollTo({
                top: absoluteTop,
                behavior: 'smooth',
              });
              console.log('[Intent] 滚动到报价表格位置:', absoluteTop);
            } else if (retryCount < 5) {
              setTimeout(() => scrollToQuote(retryCount + 1), 300 * (retryCount + 1));
            }
          };

          setTimeout(() => scrollToQuote(), 300);
        }

        setTimeout(scrollToBottom, 300);
      }
    } catch (error) {
      console.error('处理意图失败:', error);
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => !m.isTemporary);
        const errorMessage: Message = {
          id: Date.now() + Math.random(),
          role: 'assistant',
          content: '❌ 处理失败，请重试。',
          timestamp: new Date().toISOString(),
        };
        return [...withoutTemp, errorMessage];
      });
    }
  };

  const handleIntentSelectionForSwitch = useCallback(
    async (fileGroupId: string, choice: string) => {
      console.log('[Switch] handleIntentSelectionForSwitch 开始:', { fileGroupId, choice });

      if (switchIsLoadingRef.current) {
        console.log('[Switch] 正在加载，忽略请求');
        return;
      }

      const files = parsedFilesMapRef.current[fileGroupId];
      if (!files) {
        console.error('[Switch] 未找到文件组:', fileGroupId);
        return;
      }

      if (generatedChoiceRef.current === choice) {
        console.log('[Switch] 已生成相同类型的内容，忽略请求');
        return;
      }

      setSwitchLoading(true);

      try {
        const activeConversationId = currentConversationIdRef.current || conversationId;

        if (!activeConversationId) {
          console.error('[Switch] 没有可用的对话ID，无法保存消息');
          setSwitchLoading(false);
          return;
        }

        setActiveGroup(fileGroupId, files, choice);

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getClientAuthHeaders() },
          body: JSON.stringify({
            intent: choice,
            files: files,
            conversationId: activeConversationId,
          }),
        });

        if (response.ok) {
          const data = await response.json();

          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.fileGroupId === fileGroupId && msg.isTemporary) {
                return {
                  ...msg,
                  currentChoice: choice,
                };
              }
              return msg;
            })
          );

          const assistantMessage: Message = {
            id: Date.now() + Math.random(),
            role: 'assistant',
            content: data.content,
            timestamp: new Date().toISOString(),
            quoteData: data.quoteData,
            fileGroupId,
            currentChoice: choice,
            metadata: data.metadata,
          };

          setMessages((prev) => [...prev, assistantMessage]);

          await saveMessageToDatabase(
            activeConversationId,
            'assistant',
            data.content,
            data.quoteData,
            files,
            data.metadata
          );

          const userStr = localStorage.getItem('user');
          if (userStr) {
            try {
              const user = JSON.parse(userStr);
              if (user.role === 'user') {
                await fetch('/api/quota/check', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ user_id: user.id, count: 1 }),
                });
              }
            } catch (err) {
              console.error('[Switch] 扣减配额失败:', err);
            }
          }

          setGeneratedChoice(choice);
          console.log('[Switch] 已生成内容，类型:', choice);

          if (data.quoteData) {
            const scrollToQuote = (retryCount = 0) => {
              const quoteTable = document.querySelector('.export-container');
              if (quoteTable) {
                const rect = quoteTable.getBoundingClientRect();
                const absoluteTop = rect.top + window.pageYOffset - 80;

                window.scrollTo({
                  top: absoluteTop,
                  behavior: 'smooth',
                });
                console.log('[Switch] 滚动到报价表格位置:', absoluteTop);
              } else if (retryCount < 5) {
                setTimeout(() => scrollToQuote(retryCount + 1), 300 * (retryCount + 1));
              }
            };

            setTimeout(() => scrollToQuote(), 300);
          }

          setTimeout(scrollToBottom, 300);
        }
      } catch (error) {
        console.error('[Switch] 处理意图失败:', error);
      } finally {
        setSwitchLoading(false);
      }
    },
    [conversationId, scrollToBottom]
  );

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setLoading(false);
    }
  };

  // 意图标签组件
  const IntentBadge = ({ intent, confidence }: { intent?: string; confidence?: number }) => {
    if (!intent || intent === 'unknown') return null;

    const intentInfo = intentIcons[intent] || intentIcons.unknown;
    const confidencePercent = confidence ? Math.round(confidence * 100) : 0;

    return (
      <div
        className={cn(
          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
          intentInfo.color
        )}
      >
        {intentInfo.icon}
        <span>{intentInfo.label}</span>
        {confidencePercent > 0 && <span className="ml-1 opacity-75">({confidencePercent}%)</span>}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950">
      {/* 顶部工具栏 - 桌面端隐藏，移动端显示 */}
      <div className="lg:hidden flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex-shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-blue-600" />
          <span className="font-semibold text-base text-slate-900 dark:text-slate-100">对话框</span>
        </div>
      </div>

      {/* 消息区域 */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide min-h-0"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        <div className="mx-auto py-6 space-y-6 px-4 md:px-6 lg:px-8 max-w-5xl">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-8">
              <div className="space-y-3">
                <div className="flex items-center justify-center gap-2">
                  <Sparkle className="h-8 w-8 text-blue-600" />
                  <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-200">
                    今天有什么可以帮到你？
                  </h1>
                </div>
                <p className="text-slate-500 dark:text-slate-400 text-base">
                  上传文件或描述需求，快速给您生成专业报价单或方案
                </p>
              </div>
            </div>
          )}

          {messages.map((message) => (
            <div key={message.id} className="space-y-1">
              {message.role === 'assistant' && message.metadata?.intent && (
                <div className="flex justify-start pl-12">
                  <IntentBadge
                    intent={message.metadata.intent}
                    confidence={message.metadata.confidence}
                  />
                </div>
              )}
              <ChatMessage
                message={message}
                onRegenerate={handleRegenerate}
                supplierInfo={supplierInfo}
                onUpdateProductPrice={handleUpdateProductPrice}
                onUpdateProductQuantity={handleUpdateProductQuantity}
                onBrandSelect={handleBrandSelect}
                onIntentSelection={(intent) => {
                  if (message.fileData) {
                    handleIntentSelection(intent, message.fileData, uploadedFilesData);
                  }
                }}
                onEdit={handleEditMessage}
              />
            </div>
          ))}

          {activeGroupId && (
            <div className="mb-4">
              <FixedSwitcher />
            </div>
          )}

          <FloatingSwitcher />

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* 输入区域 */}
      <div className="flex-shrink-0 p-4 bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800">
        <div className="max-w-5xl mx-auto">
          <div
            {...dropzonePropsWithoutKeyboard}
            className={`rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 shadow-sm transition-all duration-200 ${
              isDragActive
                ? 'border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-950/20 shadow-lg'
                : 'hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-md'
            }`}
          >
            {files.length > 0 && (
              <div className="flex flex-col gap-2 p-3 pb-2">
                <div className="flex flex-wrap gap-2">
                  {files.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-full text-xs border border-slate-200 dark:border-slate-700"
                    >
                      <Paperclip className="h-3 w-3 text-slate-500 dark:text-slate-400" />
                      <span className="max-w-32 truncate">{file.name}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        ({file.size})
                      </span>
                      <button
                        className="h-4 w-4 flex items-center justify-center rounded-full hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
                        onClick={() => handleRemoveFile(file.id)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <input {...getInputProps()} />

            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isDragActive ? '释放文件以上传' : '给报个价发送消息'}
              className="min-h-24 max-h-40 resize-none border-0 focus-visible:ring-0 px-4 pt-2 pb-0 text-base placeholder:text-slate-400 dark:placeholder:text-slate-500 bg-transparent w-full"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
            />

            <TooltipProvider>
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const input = document.createElement('input');
                          input.type = 'file';
                          input.multiple = true;
                          input.onchange = (e) => {
                            const target = e.target as HTMLInputElement;
                            if (target.files) {
                              const acceptedFiles = Array.from(target.files);
                              const newFiles = acceptedFiles.map((file) => ({
                                id: `${Date.now()}-${Math.random()}`,
                                name: file.name,
                                size: formatFileSize(file.size),
                                type: file.type,
                                file: file,
                              }));
                              setFiles([...files, ...newFiles]);
                            }
                          };
                          input.click();
                        }}
                        disabled={loading}
                        className="h-9 w-9 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        <Upload className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      className="bg-black text-white text-xs px-2 py-1 rounded shadow-md"
                    >
                      上传附件
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={loading}
                        className="h-9 w-9 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        <Code className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      className="bg-black text-white text-xs px-2 py-1 rounded shadow-md"
                    >
                      插入代码
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowKnowledgeCenter(true)}
                        className="h-9 px-3 rounded-full bg-blue-50 dark:bg-blue-950/20 hover:bg-blue-100 dark:hover:bg-blue-950/30 text-blue-600 dark:text-blue-400 gap-1.5"
                      >
                        <span className="text-base">📚</span>
                        <span className="text-sm font-medium">管理资料</span>
                        <span className="bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded-full ml-1">
                          7
                        </span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      className="bg-black text-white text-xs px-2 py-1 rounded shadow-md"
                    >
                      管理产品价格库、技术文档、案例等7大模块
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Select value={selectedModel} onValueChange={setSelectedModel}>
                        <SelectTrigger className="h-9 w-auto min-w-[90px] rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border-slate-200 dark:border-slate-700 text-xs">
                          <Brain className="h-3.5 w-3.5 mr-1 text-violet-500" />
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="deepseek">DeepSeek</SelectItem>
                          <SelectItem value="gemini">Gemini</SelectItem>
                        </SelectContent>
                      </Select>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      className="bg-black text-white text-xs px-2 py-1 rounded shadow-md"
                    >
                      AI 模型
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Select defaultValue="auto">
                        <SelectTrigger className="h-9 w-20 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border-slate-200 dark:border-slate-700 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">自动</SelectItem>
                          <SelectItem value="manual">手动</SelectItem>
                        </SelectContent>
                      </Select>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      className="bg-black text-white text-xs px-2 py-1 rounded shadow-md"
                    >
                      生成模式
                    </TooltipContent>
                  </Tooltip>
                </div>

                <div className="flex items-center gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={onNewConversation}
                        disabled={!onNewConversation || loading}
                        className="h-9 w-9 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
                      >
                        <Plus className="h-5 w-5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      className="bg-black text-white text-xs px-2 py-1 rounded shadow-md"
                    >
                      新建对话
                    </TooltipContent>
                  </Tooltip>

                  {loading ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={handleStopGeneration}
                          className="h-10 w-10 rounded-full bg-slate-800 dark:bg-slate-700 hover:bg-slate-700 dark:hover:bg-slate-600 text-white transition-all duration-200 shadow-xl"
                        >
                          <Square className="h-5 w-5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent
                        side="top"
                        className="bg-black text-white text-xs px-2 py-1 rounded shadow-md"
                      >
                        停止生成
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={handleSendMessage}
                          disabled={!input.trim() && files.length === 0}
                          className={`h-10 w-10 rounded-full transition-all duration-200 transform hover:scale-105 active:scale-95 ${
                            input.trim() || files.length > 0
                              ? 'bg-gradient-to-r from-blue-700 to-blue-600 hover:from-blue-800 hover:to-blue-700 text-white shadow-xl shadow-blue-500/30'
                              : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                          }`}
                        >
                          <ArrowUp className="h-5 w-5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent
                        side="top"
                        className="bg-black text-white text-xs px-2 py-1 rounded shadow-md"
                      >
                        发送消息
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </div>
            </TooltipProvider>
          </div>
        </div>
      </div>

      {showKnowledgeCenter && (
        <KnowledgeCenter
          initialModule={activeModule}
          onClose={() => {
            setShowKnowledgeCenter(false);
            setActiveModule(null);
          }}
        />
      )}
    </div>
  );
}
