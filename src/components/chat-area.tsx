'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Upload, Send, Paperclip, Sparkles, Square, Loader2, Plus, Code, ArrowUp, ChevronDown, Layers, ArrowDownToLine } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import QuoteTable from '@/components/quote-table';
import ChatMessage from '@/components/chat-message';
import IntentSelector from '@/components/intent-selector';
import FixedSwitcher from '@/components/fixed-switcher';
import FloatingSwitcher from '@/components/floating-switcher';
import KnowledgeCenter from '@/components/knowledge-center';
import { useSwitch } from './switch-manager';

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
  conversationId: number | null;
  onOpenRightPanel: () => void;
  onNewConversation?: () => void;
  supplierInfo?: SupplierInfo;
}

interface Message {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  quoteData?: any;
  files?: FileUpload[];
  fileData?: any[];
  isTemporary?: boolean; // 标记为临时消息（如上传成功提示）
  action?: string; // 消息动作类型（如 'ASK_INTENT'）
  fileGroupId?: string; // 文件组ID，用于切换
  currentChoice?: string; // 当前选中的选项
}

interface FileUpload {
  id: string;
  name: string;
  size: string;
  type: string;
  url?: string;
  file?: File; // 保存原始的 File 对象用于上传
}

export default function ChatArea({ conversationId, onOpenRightPanel, onNewConversation, supplierInfo }: ChatAreaProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [files, setFiles] = useState<FileUpload[]>([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevMessagesLengthRef = useRef(0); // 记录上一次的消息数量
  const abortControllerRef = useRef<AbortController | null>(null);

  // 意图询问相关状态
  const [pendingFiles, setPendingFiles] = useState<FileUpload[]>([]); // 待处理的文件
  const [showIntentButtons, setShowIntentButtons] = useState(false); // 是否显示意图选择按钮
  const [uploadedFilesData, setUploadedFilesData] = useState<any[]>([]); // 上传后的文件数据（包含解析结果）

  // 切换功能相关状态
  const [parsedFilesMap, setParsedFilesMap] = useState<Record<string, any[]>>({}); // 存储已解析的文件
  const parsedFilesMapRef = useRef(parsedFilesMap); // 使用 ref 保存最新的 parsedFilesMap

  // 资料中心相关状态
  const [showKnowledgeCenter, setShowKnowledgeCenter] = useState(false);
  const [activeModule, setActiveModule] = useState<string | null>(null);

  // 同步 ref 的值
  useEffect(() => {
    parsedFilesMapRef.current = parsedFilesMap;
  }, [parsedFilesMap]);

  // 使用统一的切换状态管理
  const switchContext = useSwitch();
  const { setActiveGroup, setLoading: setSwitchLoading, fileGroupId: activeGroupId, currentChoice: activeChoice, isLoading: switchIsLoading, generatedChoice, setGeneratedChoice } =
    switchContext;

  // 保存 activeChoice 的最新值
  const activeChoiceRef = useRef(activeChoice);
  useEffect(() => {
    activeChoiceRef.current = activeChoice;
  }, [activeChoice]);

  // 保存 switchIsLoading 的最新值
  const switchIsLoadingRef = useRef(switchIsLoading);
  useEffect(() => {
    switchIsLoadingRef.current = switchIsLoading;
  }, [switchIsLoading]);

  // 保存 messages 的最新值
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // 保存 generatedChoice 的最新值
  const generatedChoiceRef = useRef(generatedChoice);
  useEffect(() => {
    generatedChoiceRef.current = generatedChoice;
  }, [generatedChoice]);

  const { getRootProps: getRootPropsForInput, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles) => {
      const newFiles = acceptedFiles.map((file) => ({
        id: `${Date.now()}-${Math.random()}`,
        name: file.name,
        size: formatFileSize(file.size),
        type: file.type,
        file: file, // 保存原始 File 对象
      }));
      setFiles([...files, ...newFiles]);
    },
    noClick: true, // 禁止点击打开文件选择器，只允许拖放
    multiple: true,
  });

  // 提取 Dropzone 的拖放相关 props，排除键盘和点击事件
  const dropzoneProps = getRootPropsForInput();
  const { onKeyDown: dropzoneKeyDown, ...dropzonePropsWithoutKeyboard } = dropzoneProps;

  // 创建单独的根属性用于上传按钮（允许点击）
  const { getRootProps: getRootPropsForButton } = useDropzone({
    onDrop: (acceptedFiles) => {
      const newFiles = acceptedFiles.map((file) => ({
        id: `${Date.now()}-${Math.random()}`,
        name: file.name,
        size: formatFileSize(file.size),
        type: file.type,
        file: file, // 保存原始 File 对象
      }));
      setFiles([...files, ...newFiles]);
    },
    multiple: true,
  });

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  useEffect(() => {
    if (conversationId) {
      loadConversation(conversationId);
    }
  }, [conversationId]);

  useEffect(() => {
    // 只在消息数量增加时才滚动到底部（添加新消息时）
    // 避免在更新现有消息（如修改价格、数量）时滚动
    if (messages.length > prevMessagesLengthRef.current) {
      scrollToBottom();
    }
    // 更新消息数量记录
    prevMessagesLengthRef.current = messages.length;
  }, [messages]);

  // 组件卸载时取消请求
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // 监听输入框焦点，动态调整悬浮按钮z-index
  useEffect(() => {
    const inputElement = document.querySelector('textarea');
    if (inputElement) {
      const handleFocus = () => {
        // 输入框获得焦点时，临时降低悬浮按钮的z-index
        const switcher = document.querySelector('[class*="floating-switcher"]') as HTMLElement;
        if (switcher) {
          switcher.style.zIndex = '40';
        }
      };

      const handleBlur = () => {
        // 输入框失去焦点时，恢复悬浮按钮的z-index
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

  // 监听IntentSelector的点击事件
  useEffect(() => {
    const handleIntentSelect = async (event: Event) => {
      const customEvent = event as CustomEvent;
      const { fileGroupId, choice } = customEvent.detail;

      console.log('[Chat] 收到 intent-select 事件:', { fileGroupId, choice });
      console.log('[Chat] 当前 parsedFilesMap:', Object.keys(parsedFilesMapRef.current));

      // 更新活跃的文件组（用于悬浮按钮）
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
  }, []); // 移除依赖，使用 ref 获取最新值

  // 监听switch-change事件（来自FixedSwitcher和FloatingSwitcher）
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

  // 监听fill-market-prices-complete事件，更新临时消息状态
  useEffect(() => {
    const handleFillPricesComplete = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { success, count, error } = customEvent.detail;

      setMessages((prev) =>
        prev.map((msg) => {
          // 找到填充价格的临时消息
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

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  // 打开资料中心模块
  const openModule = (module: string) => {
    setActiveModule(module);
    setShowKnowledgeCenter(true);
  };

  const loadConversation = async (id: number) => {
    try {
      const response = await fetch(`/api/conversations/${id}`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data.conversation.messages || []);
        // 加载对话后手动滚动到底部
        setTimeout(() => scrollToBottom(), 100);
      }
    } catch (error) {
      console.error('Failed to load conversation:', error);
    }
  };

  const handleSendMessage = async () => {
    if ((!input.trim() && files.length === 0) || loading) return;

    // 配额检查（仅普通用户）
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        if (user.role === 'user') {
          const quotaRes = await fetch(`/api/quota/check?user_id=${user.id}`);
          if (quotaRes.ok) {
            const quotaData = await quotaRes.json();
            if (!quotaData.allowed) {
              alert('您的使用次数已用完，请升级VIP会员获取无限次使用');
              return;
            }
          }
        }
      } catch (err) {
        console.error('[Chat] 配额检查失败:', err);
      }
    }

    // 检查是否是快捷回复（1、2、3）
    const trimmedInput = input.trim();
    if (trimmedInput === '1' || trimmedInput === '2' || trimmedInput === '3') {
      // 找到最新的临时消息
      const tempMessage = messages.find(m => m.isTemporary && m.fileData);
      if (tempMessage && tempMessage.fileData) {
        const intentMap: Record<string, 'quote' | 'proposal' | 'both'> = {
          '1': 'quote',
          '2': 'proposal',
          '3': 'both',
        };

        // 添加用户回复消息
        const userMessage: Message = {
          id: Date.now() + Math.random(),
          role: 'user',
          content: trimmedInput,
          timestamp: new Date().toISOString(),
        };
        setMessages([...messages, userMessage]);
        setInput('');

        // 触发意图选择
        await handleIntentSelection(intentMap[trimmedInput], tempMessage.fileData, uploadedFilesData);
        return;
      }
    }

    // 创建新的 AbortController
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
    
    // 保存文件列表用于上传提示
    const filesToUpload = [...files];
    setFiles([]);

    // 如果有文件，添加文件上传成功提示
    let uploadSuccessMessageId: number | null = null;
    if (filesToUpload.length > 0) {
      const fileNames = filesToUpload.map(f => f.name).join('、');
      const tempId = Date.now() + 1;
      uploadSuccessMessageId = tempId;
      setMessages((prev) => [
        ...prev,
        {
          id: tempId,
          role: 'assistant',
          content: `文件「${fileNames}」上传成功，正在解析...`,
          timestamp: new Date().toISOString(),
          isTemporary: true, // 标记为临时消息
        },
      ]);
    }

    try {
      // 上传文件
      const fileUrls: string[] = [];
      const uploadedFiles: any[] = [];

      for (let i = 0; i < (userMessage.files || []).length; i++) {
        const file = userMessage.files![i];

        // 更新上传进度提示
        setMessages((prev) => prev.map(msg => {
          if (msg.id === uploadSuccessMessageId) {
            const progress = ((i + 1) / (userMessage.files?.length || 1)) * 100;
            const fileNames = userMessage.files?.map(f => f.name).join('、') || '';
            return {
              ...msg,
              content: `正在上传文件「${fileNames}」... ${Math.round(progress)}%`,
            };
          }
          return msg;
        }));

        const formData = new FormData();
        // 使用原始的 File 对象上传
        if (file.file) {
          formData.append('file', file.file);
        } else {
          // 兼容旧数据，如果没有 file 属性
          formData.append('file', new Blob([file as any]), file.name);
        }
        const uploadResponse = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        });
        if (uploadResponse.ok) {
          const uploadData = await uploadResponse.json();
          fileUrls.push(uploadData.url);
          uploadedFiles.push(uploadData); // 保存完整的上传数据
          console.log(`文件 ${file.name} 上传成功，正在解析...`);
        }
      }

      // 调用智能报价匹配 API
      // 更新为联网搜索提示
      setMessages((prev) => prev.map(msg => {
        if (msg.id === uploadSuccessMessageId) {
          return {
            ...msg,
            content: '正在联网搜索产品信息...',
          };
        }
        return msg;
      }));

      const chatResponse = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
          files: uploadedFiles, // 传递完整的上传数据（包含fileKey）
          conversationId,
        }),
        signal: controller.signal,
      });

      if (chatResponse.ok) {
        const data = await chatResponse.json();

        // 检查是否是填充价格指令
        if (data.action === 'FILL_PRICES') {
          // 添加用户的消息
          const userMessageWithFill: Message = {
            id: Date.now() + Math.random(),
            role: 'user',
            content: userMessage.content,
            timestamp: new Date().toISOString(),
          };
          
          // 添加AI的响应消息
          const aiMessage: Message = {
            id: Date.now() + 1,
            role: 'assistant',
            content: data.content,
            timestamp: new Date().toISOString(),
            isTemporary: true,
          };

          // 添加消息到列表
          setMessages((prev) => {
            // 删除临时的上传成功提示（如果有）
            const filtered = uploadSuccessMessageId !== null 
              ? prev.filter((m) => m.id !== uploadSuccessMessageId)
              : prev;
            return [...filtered, userMessageWithFill, aiMessage];
          });

          // 触发自定义事件，通知quote-table执行填充操作
          window.dispatchEvent(new CustomEvent('fill-market-prices'));
        }
        // 检查是否是意图询问（文件上传后的新响应）
        else if (data.action === 'ASK_INTENT' && data.files) {
          // 生成唯一的文件组ID
          const fileGroupId = `files_${Date.now()}`;

          // 保存文件数据到map
          setParsedFilesMap(prev => ({
            ...prev,
            [fileGroupId]: data.files
          }));

          // 保存上传的文件数据到状态
          setUploadedFilesData(data.files);

          // 将临时消息更新为意图询问界面
          setMessages((prev) => prev.map(msg => {
            if (msg.id === uploadSuccessMessageId) {
              return {
                ...msg,
                content: data.content || '文件解析完成，请选择您需要的服务：',
                fileData: data.files,
                isTemporary: true,
                action: 'ASK_INTENT',
                fileGroupId,
              };
            }
            return msg;
          }));
        }
        // 如果是文件上传场景（有文件且没有用户输入内容）
        else if (filesToUpload.length > 0 && !userMessage.content.trim()) {
          // 保存上传的文件数据到状态
          setUploadedFilesData(uploadedFiles);

          // 将临时消息更新为意图询问界面（兼容旧逻辑）
          setMessages((prev) => prev.map(msg => {
            if (msg.id === uploadSuccessMessageId) {
              return {
                ...msg,
                content: data.content || '文件解析完成，请选择您需要的服务：',
                fileData: data.fileData || uploadedFiles,
                isTemporary: true,
                action: 'ASK_INTENT',
              };
            }
            return msg;
          }));
        } else {
          // 普通对话场景，直接显示AI响应
          const assistantMessage: Message = {
            id: Date.now() + 1,
            role: 'assistant',
            content: data.content,
            timestamp: new Date().toISOString(),
            quoteData: data.quoteData,
          };

          // 删除临时的上传成功提示（如果有）
          if (uploadSuccessMessageId !== null) {
            setMessages((prev) => prev.filter((m) => m.id !== uploadSuccessMessageId));
          }

          // 添加AI响应消息
          setMessages((prev) => [...prev, assistantMessage]);

          // 更新对话ID
          if (data.conversationId) {
            // 更新 URL 但不刷新页面
            window.history.replaceState({}, '', `?conversation=${data.conversationId}`);
          }

          // 报价生成完成后，自动滚动到表格位置
          setTimeout(() => {
            const quoteTable = document.querySelector('.export-container');
            if (quoteTable) {
              quoteTable.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }, 500);
        }
      }
    } catch (error) {
      // 如果是用户取消的错误，不显示错误消息
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
    setMessages(prev => prev.map(msg => {
      if (msg.id === messageId && msg.quoteData) {
        const updatedProducts = [...msg.quoteData.products];
        const product = updatedProducts[productIndex];
        if (product) {
          // 更新单价
          product.unitPrice = newPrice;
          // 更新总价（确保quantity有默认值）
          const quantity = product.quantity || 1;
          product.totalPrice = newPrice * quantity;
          // 更新小计
          const newSubtotal = updatedProducts.reduce((sum, p) => sum + (p.totalPrice || 0), 0);
          // 更新税额
          const newTaxAmount = newSubtotal * (msg.quoteData.taxRate / 100);
          // 更新总价
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
    }));
  };

  const handleUpdateProductQuantity = (messageId: number, productIndex: number, newQuantity: number) => {
    setMessages(prev => prev.map(msg => {
      if (msg.id === messageId && msg.quoteData) {
        const updatedProducts = [...msg.quoteData.products];
        const product = updatedProducts[productIndex];
        if (product) {
          // 更新数量
          product.quantity = newQuantity;
          // 更新总价
          const price = product.unitPrice || 0;
          product.totalPrice = price * newQuantity;
          // 更新小计
          const newSubtotal = updatedProducts.reduce((sum, p) => sum + (p.totalPrice || 0), 0);
          // 更新税额
          const newTaxAmount = newSubtotal * (msg.quoteData.taxRate / 100);
          // 更新总价
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
    }));
  };

  // 处理意图选择
  const handleIntentSelection = async (intent: 'quote' | 'proposal' | 'both', fileData: any[], uploadedFiles: any[]) => {
    try {
      // 生成唯一的文件组ID
      const fileGroupId = `group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // 保存文件到 parsedFilesMap
      setParsedFilesMap(prev => ({
        ...prev,
        [fileGroupId]: uploadedFiles,
      }));

      // 添加用户的选择消息
      const userChoiceText = intent === 'quote' ? '📊 我选择：生成报价单' :
                           intent === 'proposal' ? '📝 我选择：生成方案' :
                           '📑 我选择：生成方案（内含报价）';

      const userChoiceMessage: Message = {
        id: Date.now(),
        role: 'user',
        content: userChoiceText,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => {
        // 先添加用户选择消息
        const withUserChoice = [...prev.filter(m => !m.isTemporary), userChoiceMessage];
        // 然后添加一个处理中的临时消息
        const tempMessage: Message = {
          id: Date.now() + 1,
          role: 'assistant',
          content: `正在生成${intent === 'quote' ? '报价单' : intent === 'proposal' ? '方案' : '报价和方案'}，请稍候...`,
          timestamp: new Date().toISOString(),
          isTemporary: true,
          fileGroupId, // 保存 fileGroupId 到临时消息
          currentChoice: intent, // 保存当前选择
        };
        return [...withUserChoice, tempMessage];
      });

      // 调用API处理意图
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent,
          files: uploadedFiles,
          conversationId,
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
          fileGroupId, // 保存 fileGroupId
          currentChoice: intent, // 保存当前选择
        };

        // 删除临时的意图询问消息和处理中消息，添加最终结果
        setMessages((prev) => {
          const withoutTemp = prev.filter(m => !m.isTemporary);
          return [...withoutTemp, assistantMessage];
        });

        // 扣减用户配额（仅普通用户）
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
              // 刷新localStorage中的用户信息
              const updatedUserStr = localStorage.getItem('user');
              if (updatedUserStr) {
                const updatedUser = JSON.parse(updatedUserStr);
                setMessages((prev) => {
                  // 更新所有需要用户信息的组件
                  return prev;
                });
              }
            }
          } catch (err) {
            console.error('[Chat] 扣减配额失败:', err);
          }
        }

        // 设置活跃的文件组（用于悬浮和固定切换按钮）
        setActiveGroup(fileGroupId, uploadedFiles, intent);
        setGeneratedChoice(intent);

        console.log('[Intent] 已生成内容，类型:', intent, 'fileGroupId:', fileGroupId);

        // 如果有报价数据，自动滚动到表格位置
        if (data.quoteData) {
          setTimeout(() => {
            const quoteTable = document.querySelector('.export-container');
            if (quoteTable) {
              quoteTable.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }, 500);
        }
      }
    } catch (error) {
      console.error('处理意图失败:', error);
      setMessages((prev) => {
        // 删除处理中消息，添加错误消息
        const withoutTemp = prev.filter(m => !m.isTemporary);
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

  // 处理意图选择切换（基于fileGroupId）
  const handleIntentSelectionForSwitch = useCallback(async (fileGroupId: string, choice: string) => {
    console.log('[Switch] handleIntentSelectionForSwitch 开始:', { fileGroupId, choice });

    // 如果正在加载，忽略
    if (switchIsLoadingRef.current) {
      console.log('[Switch] 正在加载，忽略请求');
      return;
    }

    // 获取该组的文件
    const files = parsedFilesMapRef.current[fileGroupId];
    if (!files) {
      console.error('[Switch] 未找到文件组:', fileGroupId);
      console.error('[Switch] 可用的 fileGroupId:', Object.keys(parsedFilesMapRef.current));
      return;
    }

    console.log('[Switch] 找到文件组，文件数量:', files.length);

    // 如果已经生成过相同类型的内容，不重复处理
    if (generatedChoiceRef.current === choice) {
      console.log('[Switch] 已生成相同类型的内容，忽略请求');
      return;
    }

    console.log('[Switch] 开始生成内容，类型:', choice);

    // 设置加载状态
    setSwitchLoading(true);

    try {
      // 更新活跃的文件组（用于悬浮和固定切换按钮）
      setActiveGroup(fileGroupId, files, choice);

      // 调用API处理意图
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent: choice,
          files: files,
          conversationId,
        }),
      });

      if (response.ok) {
        const data = await response.json();

        // 查找该文件组对应的临时消息
        const tempMessageIndex = messagesRef.current.findIndex((m) => m.fileGroupId === fileGroupId && m.isTemporary);

        if (tempMessageIndex !== -1) {
          // 更新临时消息，显示选择器带当前选中状态
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

          // 添加结果消息
          const assistantMessage: Message = {
            id: Date.now() + Math.random(),
            role: 'assistant',
            content: data.content,
            timestamp: new Date().toISOString(),
            quoteData: data.quoteData,
            fileGroupId,
            currentChoice: choice,
          };

          setMessages((prev) => [...prev, assistantMessage]);

          // 扣减用户配额（仅普通用户）
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

          // 更新已生成的内容类型
          setGeneratedChoice(choice);
          console.log('[Switch] 已生成内容，类型:', choice);

          // 如果有报价数据，自动滚动到表格位置
          if (data.quoteData) {
            setTimeout(() => {
              const quoteTable = document.querySelector('.export-container');
              if (quoteTable) {
                quoteTable.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            }, 500);
          }
        }
      }
    } catch (error) {
      console.error('[Switch] 处理意图失败:', error);
    } finally {
      setSwitchLoading(false);
    }
  }, []); // 依赖数组为空，所有状态通过 ref 访问

  const handleRegenerate = async (messageId: number) => {
    // 找到对应的助手消息
    const assistantMessageIndex = messages.findIndex(m => m.id === messageId);
    if (assistantMessageIndex === -1) return;

    const assistantMessage = messages[assistantMessageIndex];

    // 找到对应的用户消息（向前查找最近的用户消息）
    let userMessageIndex = assistantMessageIndex - 1;
    while (userMessageIndex >= 0 && messages[userMessageIndex].role !== 'user') {
      userMessageIndex--;
    }

    // 删除从助手消息开始的所有后续消息（包括助手消息）
    const newMessages = messages.slice(0, assistantMessageIndex);
    setMessages(newMessages);

    // 创建新的 AbortController
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setLoading(true);

    try {
      // 如果找不到用户消息，使用助手消息的内容重新生成（文本对话）
      if (userMessageIndex < 0) {
        // 调用智能报价匹配 API
        const chatResponse = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: assistantMessage.content,
            files: [],
            conversationId,
          }),
          signal: controller.signal,
        });

        if (chatResponse.ok) {
          const data = await chatResponse.json();
          const newAssistantMessage: Message = {
            id: Date.now() + Math.random(), // 确保ID唯一
            role: 'assistant',
            content: data.content,
            timestamp: new Date().toISOString(),
            quoteData: data.quoteData,
          };
          setMessages((prev) => [...prev, newAssistantMessage]);

          // 更新对话ID
          if (data.conversationId) {
            window.history.replaceState({}, '', `?conversation=${data.conversationId}`);
          }
        }
        return;
      }

      const userMessage = messages[userMessageIndex];
      const userFiles = userMessage.files || [];

      // 如果用户消息是"我选择：生成报价单/方案"类型的消息，重新生成报价单
      if (userMessage.content.includes('我选择：') && userFiles.length > 0) {
        // 生成唯一的文件组ID
        const fileGroupId = `group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // 保存文件到 parsedFilesMap
        setParsedFilesMap(prev => ({
          ...prev,
          [fileGroupId]: userFiles,
        }));

        // 确定意图类型
        let intent: 'quote' | 'proposal' | 'both' = 'quote';
        if (userMessage.content.includes('方案（内含报价）')) {
          intent = 'both';
        } else if (userMessage.content.includes('生成方案')) {
          intent = 'proposal';
        }

        // 添加一个处理中的临时消息
        const tempMessage: Message = {
          id: Date.now() + Math.random(), // 确保ID唯一
          role: 'assistant',
          content: `正在重新生成${intent === 'quote' ? '报价单' : intent === 'proposal' ? '方案' : '报价和方案'}，请稍候...`,
          timestamp: new Date().toISOString(),
          isTemporary: true,
          fileGroupId,
          currentChoice: intent,
        };
        setMessages((prev) => [...prev, tempMessage]);

        // 调用API重新生成
        const chatResponse = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            intent,
            files: userFiles,
            conversationId,
          }),
          signal: controller.signal,
        });

        if (chatResponse.ok) {
          const data = await chatResponse.json();
          const newAssistantMessage: Message = {
            id: Date.now() + Math.random() + 1, // 确保ID唯一
            role: 'assistant',
            content: data.content,
            timestamp: new Date().toISOString(),
            quoteData: data.quoteData,
            fileGroupId,
            currentChoice: intent,
          };

          // 删除临时消息，添加最终结果
          setMessages((prev) => {
            const withoutTemp = prev.filter(m => !m.isTemporary);
            return [...withoutTemp, newAssistantMessage];
          });

          // 设置活跃的文件组（用于悬浮和固定切换按钮）
          setActiveGroup(fileGroupId, userFiles, intent);
          setGeneratedChoice(intent);

          console.log('[Regenerate] 重新生成内容成功，类型:', intent, 'fileGroupId:', fileGroupId);

          // 如果有报价数据，自动滚动到表格位置
          if (data.quoteData) {
            setTimeout(() => {
              const quoteTable = document.querySelector('.export-container');
              if (quoteTable) {
                quoteTable.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            }, 500);
          }

          // 更新对话ID
          if (data.conversationId) {
            window.history.replaceState({}, '', `?conversation=${data.conversationId}`);
          }
        }
      } else {
        // 普通消息重新生成（带文件）
        // 上传文件
        const fileUrls: string[] = [];
        for (const file of userFiles) {
          const formData = new FormData();
          formData.append('file', new Blob([file as any]), file.name);
          const uploadResponse = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
            signal: controller.signal,
          });
          if (uploadResponse.ok) {
            const uploadData = await uploadResponse.json();
            fileUrls.push(uploadData.url);
          }
        }

        // 调用智能报价匹配 API
        const chatResponse = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: userMessage.content,
            files: fileUrls,
            conversationId,
          }),
          signal: controller.signal,
        });

        if (chatResponse.ok) {
          const data = await chatResponse.json();
          const newAssistantMessage: Message = {
            id: Date.now() + Math.random() + 2, // 确保ID唯一
            role: 'assistant',
            content: data.content,
            timestamp: new Date().toISOString(),
            quoteData: data.quoteData,
          };
          setMessages((prev) => [...prev, newAssistantMessage]);

          // 更新对话ID
          if (data.conversationId) {
            window.history.replaceState({}, '', `?conversation=${data.conversationId}`);
          }
        }
      }
    } catch (error) {
      // 如果是用户取消的错误，不显示错误消息
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Regeneration cancelled by user');
        return;
      }
      console.error('Failed to regenerate response:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + Math.random() + 3, // 确保ID唯一
          role: 'assistant',
          content: '抱歉，重新生成时发生了一些错误，请稍后重试。',
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setLoading(false);
    }
  };

  const suggestions = [
    { text: '上传询价单Excel', icon: '📊' },
    { text: '查一下工业空调的价格', icon: '❄️' },
    { text: '对比两款产品的价格', icon: '🔄' },
    { text: '生成一份报价单', icon: '📄' },
  ];

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950">
      {/* 顶部工具栏 - 简化版 */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
        <button
          onClick={onNewConversation}
          disabled={!onNewConversation || loading}
          className="flex items-center gap-1.5 px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="font-semibold text-base text-slate-900 dark:text-slate-100">
            {conversationId ? '对话框' : '对话框'}
          </span>
          <ArrowDownToLine className="h-4 w-4 text-slate-600 dark:text-slate-400" />
        </button>
      </div>

      {/* 消息区域 */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden px-4 md:px-6 py-4 space-y-6"
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-6 px-4">
            <div className="space-y-4">
              <div className="w-20 h-20 mx-auto">
                <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
              </div>
              <p className="text-slate-600 dark:text-slate-400 mt-2 max-w-md text-sm leading-relaxed">
                上传产品资料或描述需求，AI 智能分析并快速生成专业报价单
              </p>
            </div>

            {/* 建议提示 - 现代卡片风格 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-xl w-full">
              {suggestions.map((suggestion) => (
                <Button
                  key={suggestion.text}
                  variant="ghost"
                  className="h-auto py-3 px-4 text-sm justify-start gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600 hover:shadow-md transition-all duration-200 group"
                  onClick={() => setInput(suggestion.text)}
                >
                  <span className="text-xl group-hover:scale-110 transition-transform">{suggestion.icon}</span>
                  <span className="text-slate-700 dark:text-slate-300 text-left">
                    {suggestion.text}
                  </span>
                </Button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            message={message}
            onRegenerate={handleRegenerate}
            supplierInfo={supplierInfo}
            onUpdateProductPrice={handleUpdateProductPrice}
            onIntentSelection={(intent) => {
              if (message.fileData) {
                handleIntentSelection(intent, message.fileData, uploadedFilesData);
              }
            }}
          />
        ))}

        {/* 固定切换按钮 - 显示在消息列表中 */}
        {activeGroupId && (
          <div className="mb-4">
            <FixedSwitcher />
          </div>
        )}

        {/* 悬浮切换按钮 - 固定在右下角 */}
        <FloatingSwitcher />
      </div>

      {/* 输入区域 - 现代极简风格 */}
      <div className="p-4 bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800">
        {/* 主输入容器 - 圆角设计 */}
        <div
          {...dropzonePropsWithoutKeyboard}
          className={`rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 shadow-sm transition-all duration-200 ${
            isDragActive
              ? 'border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-950/20 shadow-lg'
              : 'hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-md'
          }`}
        >
          {/* 文件列表 */}
          {files.length > 0 && (
            <div className="flex flex-col gap-2 p-3 pb-2">
              {/* 文件项 */}
              <div className="flex flex-wrap gap-2">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-full text-xs border border-slate-200 dark:border-slate-700"
                  >
                    <Paperclip className="h-3 w-3 text-slate-500 dark:text-slate-400" />
                    <span className="max-w-32 truncate">{file.name}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">({file.size})</span>
                    <button
                      className="h-4 w-4 flex items-center justify-center rounded-full hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
                      onClick={() => handleRemoveFile(file.id)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              {/* 文件类型提示 */}
              {files.some(f => f.type?.includes('pdf') || f.name?.endsWith('.pdf')) && (
                <div className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/20 dark:text-amber-400 px-3 py-2 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span>⚠️</span>
                    <span>PDF文档解析需要几秒钟，系统会自动识别其中的产品和表格信息。</span>
                  </div>
                </div>
              )}

              {files.some(f => ['dwg', 'dxf', 'dwf'].includes(f.name?.split('.').pop()?.toLowerCase() || '')) && (
                <div className="text-xs text-blue-600 bg-blue-50 dark:bg-blue-950/20 dark:text-blue-400 px-3 py-2 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span>📐</span>
                    <span>CAD图纸正在解析中，系统会提取图纸中的文字和尺寸信息。</span>
                  </div>
                </div>
              )}
            </div>
          )}

          <input {...getInputProps()} />

          {/* 输入框 */}
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              isDragActive
                ? '释放文件以上传'
                : '输入需求或拖拽文件上传...'
            }
            className="min-h-24 max-h-40 resize-none border-0 focus-visible:ring-0 px-4 pt-2 pb-0 text-base placeholder:text-slate-400 dark:placeholder:text-slate-500 bg-transparent"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();
                handleSendMessage();
              }
            }}
          />

          {/* 底部工具栏 */}
          <TooltipProvider>
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-800">
              {/* 左侧功能按钮组 */}
              <div className="flex items-center gap-2">
                {/* 上传按钮 */}
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
                              file: file, // 保存原始 File 对象
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
                  <TooltipContent side="top" className="bg-black text-white text-xs px-2 py-1 rounded shadow-md">
                    上传附件
                  </TooltipContent>
                </Tooltip>

                {/* 代码按钮 */}
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
                  <TooltipContent side="top" className="bg-black text-white text-xs px-2 py-1 rounded shadow-md">
                    插入代码
                  </TooltipContent>
                </Tooltip>

                {/* 资料中心 */}
                <div className="flex items-center gap-2 px-2 py-1.5 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">📚 资料中心</span>
                  <span className="text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded">7大模块</span>
                </div>

                {/* 7大模块快捷入口 */}
                <div className="flex gap-1">
                  <button
                    onClick={() => openModule('price')}
                    className="flex items-center justify-center w-8 h-8 bg-blue-50 dark:bg-blue-950/30 rounded-md hover:bg-blue-100 dark:hover:bg-blue-950/50 transition-colors"
                    title="产品价格库"
                  >
                    <span className="text-sm">📊</span>
                  </button>

                  <button
                    onClick={() => openModule('document')}
                    className="flex items-center justify-center w-8 h-8 bg-green-50 dark:bg-green-950/30 rounded-md hover:bg-green-100 dark:hover:bg-green-950/50 transition-colors"
                    title="技术文档库"
                  >
                    <span className="text-sm">📄</span>
                  </button>

                  <button
                    onClick={() => openModule('case')}
                    className="flex items-center justify-center w-8 h-8 bg-purple-50 dark:bg-purple-950/30 rounded-md hover:bg-purple-100 dark:hover:bg-purple-950/50 transition-colors"
                    title="案例库"
                  >
                    <span className="text-sm">🏗️</span>
                  </button>

                  <button
                    onClick={() => openModule('standard')}
                    className="flex items-center justify-center w-8 h-8 bg-yellow-50 dark:bg-yellow-950/30 rounded-md hover:bg-yellow-100 dark:hover:bg-yellow-950/50 transition-colors"
                    title="标准规范库"
                  >
                    <span className="text-sm">📋</span>
                  </button>

                  <button
                    onClick={() => openModule('drawing')}
                    className="flex items-center justify-center w-8 h-8 bg-pink-50 dark:bg-pink-950/30 rounded-md hover:bg-pink-100 dark:hover:bg-pink-950/50 transition-colors"
                    title="图纸图片库"
                  >
                    <span className="text-sm">🖼️</span>
                  </button>

                  <button
                    onClick={() => openModule('quota')}
                    className="flex items-center justify-center w-8 h-8 bg-orange-50 dark:bg-orange-950/30 rounded-md hover:bg-orange-100 dark:hover:bg-orange-950/50 transition-colors"
                    title="定额库"
                  >
                    <span className="text-sm">📊</span>
                  </button>

                  <button
                    onClick={() => openModule('search')}
                    className="flex items-center justify-center w-8 h-8 bg-slate-100 dark:bg-slate-800 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    title="全局搜索"
                  >
                    <span className="text-sm">🔍</span>
                  </button>
                </div>

                {/* 管理资料按钮 */}
                <button
                  onClick={() => setShowKnowledgeCenter(true)}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/20 rounded transition-colors"
                >
                  <span>⚙️</span>
                  <span className="hidden sm:inline">管理资料</span>
                </button>

                {/* 模式选择器 */}
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
                  <TooltipContent side="top" className="bg-black text-white text-xs px-2 py-1 rounded shadow-md">
                    生成模式
                  </TooltipContent>
                </Tooltip>

                {/* 分隔线 */}
                <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1" />

                {/* 开始新对话按钮 - 明显的蓝色 */}
                {onNewConversation && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={onNewConversation}
                        disabled={loading}
                        className="h-9 px-3 rounded-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-md hover:shadow-lg transition-all duration-200 gap-2 text-sm font-medium"
                      >
                        <Plus className="h-4 w-4" />
                        <span className="hidden sm:inline">新对话</span>
                        <span className="sm:hidden">新对话</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="bg-black text-white text-xs px-2 py-1 rounded shadow-md">
                      开始新对话
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>

              {/* 右侧发送/停止按钮 */}
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
                  <TooltipContent side="top" className="bg-black text-white text-xs px-2 py-1 rounded shadow-md">
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
                        (input.trim() || files.length > 0)
                          ? 'bg-gradient-to-r from-blue-700 to-blue-600 hover:from-blue-800 hover:to-blue-700 text-white shadow-xl shadow-blue-500/30'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      <ArrowUp className="h-5 w-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="bg-black text-white text-xs px-2 py-1 rounded shadow-md">
                    发送消息
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </TooltipProvider>
        </div>
      </div>

      {/* 资料中心弹窗 */}
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
