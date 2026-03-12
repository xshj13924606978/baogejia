'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Edit, History, Upload, ChevronDown, ChevronRight, LayoutGrid, Eye } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { LevelEditor } from './LevelEditor';

interface LevelConfig {
  level: number;
  name: string;
  requiredPoints: number;
  role: string;
  fieldPermissions: {
    can_view_cost_price: boolean;
    can_view_min_price: boolean;
    can_view_manufacturer: boolean;
    can_view_contact: boolean;
    can_view_phone: boolean;
  };
  modulePermissions: string[];
  quotas: {
    daily_quota: number;
    max_files: number;
    max_chat_messages: number;
  };
}

export const LevelList: React.FC = () => {
  const [levels, setLevels] = useState<LevelConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingLevel, setEditingLevel] = useState<number | null>(null);
  const [previewLevel, setPreviewLevel] = useState<number | null>(null);
  const [batchUpdateOpen, setBatchUpdateOpen] = useState(false);
  const [batchUpdating, setBatchUpdating] = useState(false);
  const [batchUpdateReason, setBatchUpdateReason] = useState('');
  const [selectedLevelForBatch, setSelectedLevelForBatch] = useState<number | null>(null);
  const [batchUpdateField, setBatchUpdateField] = useState<string>('');
  const [batchUpdateValue, setBatchUpdateValue] = useState<string>('');
  
  // 历史记录相关状态
  const [historyLevel, setHistoryLevel] = useState<number | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  
  const { toast } = useToast();

  // 树状展开状态
  const [expandedLevels, setExpandedLevels] = useState<Set<number>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Record<number, Set<string>>>({});
  
  // 勾选状态
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [itemValues, setItemValues] = useState<Record<string, string>>({});

  // 配置项定义
  const configCategories = {
    quotas: {
      name: '配额设置',
      icon: LayoutGrid,
      items: [
        { field: 'daily_quota', label: '每日查询配额', type: 'number' },
        { field: 'max_files', label: '最大文件数量', type: 'number' },
        { field: 'max_chat_messages', label: '最大聊天消息数', type: 'number' },
      ]
    },
    fieldPermissions: {
      name: '字段权限',
      icon: Edit,
      items: [
        { field: 'can_view_cost_price', label: '查看成本价', type: 'boolean' },
        { field: 'can_view_min_price', label: '查看最低售价', type: 'boolean' },
        { field: 'can_view_manufacturer', label: '查看厂家信息', type: 'boolean' },
        { field: 'can_view_contact', label: '查看联系人', type: 'boolean' },
        { field: 'can_view_phone', label: '查看联系电话', type: 'boolean' },
      ]
    }
  };

  // 模块名称映射 - 完整版
  const moduleNameMap: Record<string, string> = {
    // 用户相关
    'user.view': '用户查看',
    'user.manage': '用户管理',
    'user.edit': '用户编辑',
    'user.delete': '用户删除',
    'user.create': '用户新建',
    'user.search': '用户搜索',
    
    // 产品相关
    'product.search': '产品搜索',
    'product.detail': '产品详情',
    'product.view': '产品查看',
    'product.edit': '产品编辑',
    'product.delete': '产品删除',
    'product.export': '产品导出',
    'product.create': '产品新建',
    
    // 报价相关
    'quote.create': '报价创建',
    'quote.view': '报价查看',
    'quote.edit': '报价编辑',
    'quote.delete': '报价删除',
    'quote.export': '报价导出',
    'quote.generate': '报价生成',
    'quote_generation': '报价生成',
    'quote_export': '报价导出',
    'quote.manage': '报价管理',
    
    // 文档相关
    'excel.export': 'Excel导出',
    'pdf.export': 'PDF导出',
    'word.export': 'Word导出',
    'doc.export': '文档导出',
    
    // 成本相关
    'cost_price.view': '成本价查看',
    'cost_price.edit': '成本价编辑',
    'cost_analysis': '成本分析',
    'cost.view': '成本查看',
    
    // 厂家相关
    'manufacturer.view': '厂家信息查看',
    'manufacturer.edit': '厂家信息编辑',
    'manufacturer.manage': '厂家管理',
    'manufacturer.create': '厂家新建',
    
    // 联系人相关
    'contact.view': '联系人查看',
    'contact.edit': '联系人编辑',
    'contact.manage': '联系人管理',
    'contact.create': '联系人新建',
    
    // 电话相关
    'phone.view': '联系电话查看',
    'phone.edit': '联系电话编辑',
    'phone.manage': '电话管理',
    
    // 系统相关
    'api.access': 'API调用',
    'api.manage': 'API管理',
    'admin_panel': '管理面板',
    'brand_recommend': '品牌推荐',
    'system.manage': '系统管理',
    'system.config': '系统配置',
    'system.view': '系统查看',
    
    // 特殊权限
    '*': '全部权限',
    'all': '全部权限'
  };

  // 角色名称映射
  const roleNameMap: Record<string, string> = {
    'super_admin': '超级管理员',
    'admin': '管理员',
    'enterprise_admin': '企业管理员',
    'manufacturer': '厂家',
    'vip': 'VIP用户',
    'premium': '付费用户',
    'free': '免费用户',
    'pending': '待审核'
  };

  useEffect(() => {
    fetchLevels();
  }, []);

  const fetchLevels = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/levels');
      const data = await res.json();
      if (data.success) {
        setLevels(data.levels);
      } else {
        toast({
          variant: 'destructive',
          title: '获取等级列表失败',
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: '获取等级列表失败',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateLevel = async (level: number, changes: any, reason: string) => {
    try {
      const res = await fetch(`/api/admin/levels/${level}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes, reason })
      });

      const data = await res.json();

      if (data.success) {
        toast({
          title: '更新成功',
        });
        fetchLevels();
        setEditingLevel(null);
      } else {
        toast({
          variant: 'destructive',
          title: '更新失败',
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: '更新失败',
      });
    }
  };

  const showHistory = async (level: number) => {
    console.log('[LevelList] 显示历史记录, level:', level);
    
    // 设置当前查看的等级和加载状态
    setHistoryLevel(level);
    setHistoryLoading(true);
    setHistoryOpen(true);
    
    try {
      const res = await fetch(`/api/admin/levels/${level}/history`, {
        credentials: 'include'
      });
      
      console.log('[LevelList] 历史API响应状态:', res.status);
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error('[LevelList] 历史API错误:', errorText);
        toast({
          variant: 'destructive',
          title: '获取历史失败',
          description: `HTTP ${res.status}: ${errorText}`,
          duration: 5000,
        });
        setHistoryLoading(false);
        return;
      }
      
      const data = await res.json();
      console.log('[LevelList] 历史数据:', data);
      
      if (!data.success) {
        toast({
          variant: 'destructive',
          title: '获取历史失败',
          description: data.error || '服务器返回错误',
          duration: 5000,
        });
        setHistoryLoading(false);
        return;
      }

      if (!data.history || data.history.length === 0) {
        setHistoryData([]);
        setHistoryLoading(false);
        return;
      }
      
      // 格式化历史记录数据
      const formattedHistory = data.history.map((item: any) => {
        const date = item.created_at || item.createdAt;
        const timeStr = date ? new Date(date).toLocaleString('zh-CN') : '未知时间';
        const admin = item.admin_name || item.adminName || item.admin?.username || item.admin?.email || '系统';
        const reason = item.reason || '无说明';
        const changes = item.changes;
        
        return {
          id: item.id,
          time: timeStr,
          admin: admin,
          reason: reason,
          changes: changes
        };
      });
      
      setHistoryData(formattedHistory);
      setHistoryLoading(false);
    } catch (error) {
      console.error('[LevelList] 获取历史失败:', error);
      toast({
        variant: 'destructive',
        title: '获取历史失败',
        description: '网络请求失败，请稍后重试',
        duration: 5000,
      });
      setHistoryLoading(false);
    }
  };

  // 预览效果
  const showPreview = (level: number) => {
    console.log('[LevelList] 预览等级:', level);
    const levelData = levels.find(l => l.level === level);
    if (!levelData) {
      console.error('[LevelList] 未找到等级数据:', level);
      toast({
        variant: 'destructive',
        title: '预览失败',
        description: '未找到等级数据',
      });
      return;
    }
    console.log('[LevelList] 等级数据:', levelData);
    setPreviewLevel(level);
  };

  const getLevelColor = (level: number) => {
    if (level === 1) return 'bg-blue-500';
    if (level === 5) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const handleBatchUpdate = async () => {
    if (checkedItems.size === 0 || !batchUpdateReason) {
      toast({
        variant: 'destructive',
        title: '请至少勾选一个配置项并填写修改原因',
      });
      return;
    }

    // 检查所有勾选项是否都有值
    for (const itemKey of checkedItems) {
      if (!itemValues[itemKey]) {
        toast({
          variant: 'destructive',
          title: '请为所有勾选的配置项设置新值',
        });
        return;
      }
    }

    try {
      setBatchUpdating(true);

      // 按等级分组更新
      const updatesByLevel: Record<number, any> = {};

      for (const itemKey of checkedItems) {
        const [levelStr, field] = itemKey.split('-');
        const level = parseInt(levelStr);

        if (!updatesByLevel[level]) {
          updatesByLevel[level] = {
            level,
            changes: {
              quotas: {},
              fieldPermissions: {}
            }
          };
        }

        // 判断字段类型
        if (['daily_quota', 'max_files', 'max_chat_messages'].includes(field)) {
          updatesByLevel[level].changes.quotas[field] = parseInt(itemValues[itemKey]);
        } else if (field.startsWith('can_view_')) {
          updatesByLevel[level].changes.fieldPermissions[field] = itemValues[itemKey] === 'true';
        }
      }

      // 构建更新数组
      const updates = Object.values(updatesByLevel).map((update: any) => ({
        ...update,
        reason: batchUpdateReason
      }));

      console.log('[LevelList] 批量更新数据:', updates);

      const res = await fetch('/api/admin/levels/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ updates })
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error('[LevelList] 批量更新API错误:', errorText);
        throw new Error(errorText);
      }

      const data = await res.json();
      console.log('[LevelList] 批量更新结果:', data);

      if (data.success) {
        toast({
          title: `批量更新成功，共更新 ${updates.length} 个等级`,
        });
        
        // 关闭弹窗
        setBatchUpdateOpen(false);
        
        // 刷新列表
        await fetchLevels();
        
        // 重置表单（延迟执行，避免影响弹窗关闭动画）
        setTimeout(() => {
          resetBatchForm();
        }, 300);
      } else {
        toast({
          variant: 'destructive',
          title: '批量更新失败',
          description: data.error || '未知错误'
        });
      }
    } catch (error) {
      console.error('[LevelList] 批量更新失败:', error);
      toast({
        variant: 'destructive',
        title: '批量更新失败',
        description: error instanceof Error ? error.message : '未知错误'
      });
    } finally {
      setBatchUpdating(false);
    }
  };

  // 重置批量更新表单
  const resetBatchForm = () => {
    setBatchUpdateReason('');
    setCheckedItems(new Set());
    setItemValues({});
    setExpandedLevels(new Set());
    setExpandedCategories({});
  };

  // 切换等级展开状态
  const toggleLevelExpand = (level: number) => {
    const newExpanded = new Set(expandedLevels);
    if (newExpanded.has(level)) {
      newExpanded.delete(level);
    } else {
      newExpanded.add(level);
    }
    setExpandedLevels(newExpanded);
  };

  // 切换类别展开状态
  const toggleCategoryExpand = (level: number, category: string) => {
    const levelCategories = expandedCategories[level] || new Set();
    const newCategories = new Set(levelCategories);
    if (newCategories.has(category)) {
      newCategories.delete(category);
    } else {
      newCategories.add(category);
    }
    setExpandedCategories({
      ...expandedCategories,
      [level]: newCategories
    });
  };

  // 切换勾选状态
  const toggleCheck = (itemKey: string) => {
    const newChecked = new Set(checkedItems);
    if (newChecked.has(itemKey)) {
      newChecked.delete(itemKey);
      // 清除对应的值
      const newValues = { ...itemValues };
      delete newValues[itemKey];
      setItemValues(newValues);
    } else {
      newChecked.add(itemKey);
      // 设置默认值
      const [levelStr, field] = itemKey.split('-');
      const category = Object.keys(configCategories).find(cat =>
        configCategories[cat as keyof typeof configCategories].items.some(item => item.field === field)
      );
      const itemConfig = Object.values(configCategories).flatMap(cat => cat.items).find(item => item.field === field);
      if (itemConfig?.type === 'boolean') {
        setItemValues({ ...itemValues, [itemKey]: 'true' });
      }
    }
    setCheckedItems(newChecked);
  };

  // 更新项目值
  const updateItemValue = (itemKey: string, value: string) => {
    setItemValues({ ...itemValues, [itemKey]: value });
  };

  // 恢复默认配置
  const restoreDefaults = async () => {
    console.log('[LevelList] 开始恢复默认配置');
    try {
      // 从 level_definitions 表获取系统默认配置
      const res = await fetch('/api/admin/levels/defaults', {
        credentials: 'include', // 确保携带Cookie
      });
      console.log('[LevelList] 默认配置API响应状态:', res.status);

      if (!res.ok) {
        const errorText = await res.text();
        console.error('[LevelList] 默认配置API错误:', errorText);
        // 如果API失败，使用硬编码默认值
        useHardcodedDefaults();
        return;
      }

      const defaultConfig = await res.json();
      console.log('[LevelList] 默认配置数据:', defaultConfig);

      // 使用系统默认配置
      if (defaultConfig && defaultConfig.length > 0) {
        const newValues: Record<string, string> = {};
        const newChecked = new Set<string>();

        levels.forEach((level) => {
          const levelConfig = defaultConfig.find((c: any) => c.level === level.level);
          if (!levelConfig) {
            console.warn(`[LevelList] 未找到等级 ${level.level} 的默认配置`);
            return;
          }

          console.log(`[LevelList] 等级 ${level.level} 默认配置:`, levelConfig);

          // 配额默认值（优先使用嵌套结构，否则使用扁平结构）
          newValues[`${level.level}-daily_quota`] = String(levelConfig.quotas?.daily_quota || levelConfig.daily_quota || 10);
          newValues[`${level.level}-max_files`] = String(levelConfig.quotas?.max_files || levelConfig.max_files || 5);
          newValues[`${level.level}-max_chat_messages`] = String(levelConfig.quotas?.max_chat_messages || levelConfig.max_chat_messages || 20);

          // 字段权限默认值（优先使用嵌套结构，否则使用扁平结构）
          const fieldPerms = levelConfig.fieldPermissions || levelConfig.field_permissions || levelConfig;
          newValues[`${level.level}-can_view_cost_price`] = String(fieldPerms.can_view_cost_price ?? false);
          newValues[`${level.level}-can_view_min_price`] = String(fieldPerms.can_view_min_price ?? false);
          newValues[`${level.level}-can_view_manufacturer`] = String(fieldPerms.can_view_manufacturer ?? false);
          newValues[`${level.level}-can_view_contact`] = String(fieldPerms.can_view_contact ?? false);
          newValues[`${level.level}-can_view_phone`] = String(fieldPerms.can_view_phone ?? false);

          // 添加到勾选列表
          Object.keys(configCategories).forEach((categoryKey) => {
            configCategories[categoryKey as keyof typeof configCategories].items.forEach((item) => {
              newChecked.add(`${level.level}-${item.field}`);
            });
          });
        });

        setItemValues(newValues);
        setCheckedItems(newChecked);
        setBatchUpdateReason('恢复系统默认配置');

        toast({
          title: '正在恢复默认配置',
          description: '正在保存配置...',
          duration: 3000,
        });

        // 直接执行批量更新
        try {
          const updatesByLevel: Record<number, any> = {};

          levels.forEach((level) => {
            updatesByLevel[level.level] = {
              level: level.level,
              changes: {
                quotas: {
                  daily_quota: parseInt(newValues[`${level.level}-daily_quota`]),
                  max_files: parseInt(newValues[`${level.level}-max_files`]),
                  max_chat_messages: parseInt(newValues[`${level.level}-max_chat_messages`]),
                },
                fieldPermissions: {
                  can_view_cost_price: newValues[`${level.level}-can_view_cost_price`] === 'true',
                  can_view_min_price: newValues[`${level.level}-can_view_min_price`] === 'true',
                  can_view_manufacturer: newValues[`${level.level}-can_view_manufacturer`] === 'true',
                  can_view_contact: newValues[`${level.level}-can_view_contact`] === 'true',
                  can_view_phone: newValues[`${level.level}-can_view_phone`] === 'true',
                }
              }
            };
          });

          const updates = Object.values(updatesByLevel).map((update: any) => ({
            ...update,
            reason: '恢复系统默认配置'
          }));

          console.log('[LevelList] 恢复默认配置数据:', updates);

          const res = await fetch('/api/admin/levels/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ updates })
          });

          if (!res.ok) {
            const errorText = await res.text();
            console.error('[LevelList] 恢复默认配置API错误:', errorText);
            throw new Error(errorText);
          }

          const data = await res.json();
          console.log('[LevelList] 恢复默认配置结果:', data);

          if (data.success) {
            toast({
              title: '已成功恢复默认配置',
              description: `共更新 ${updates.length} 个等级`,
              duration: 3000,
            });

            // 刷新列表
            await fetchLevels();
            
            // 只在弹窗打开时重置表单
            if (batchUpdateOpen) {
              resetBatchForm();
            }
          } else {
            toast({
              variant: 'destructive',
              title: '恢复默认配置失败',
              description: data.error || '未知错误'
            });
          }
        } catch (error) {
          console.error('[LevelList] 恢复默认配置失败:', error);
          toast({
            variant: 'destructive',
            title: '恢复默认配置失败',
            description: error instanceof Error ? error.message : '未知错误'
          });
        }
      } else {
        console.warn('[LevelList] API返回无默认配置，使用硬编码默认值');
        // API 返回空数据，使用硬编码默认值
        useHardcodedDefaults();
      }
    } catch (error) {
      console.error('[LevelList] 恢复默认配置失败:', error);
      // 异常时使用硬编码默认值
      useHardcodedDefaults();
    }
  };

  // 使用硬编码默认值（fallback）- 每个等级有不同的默认配置
  const useHardcodedDefaults = async () => {
    console.log('[LevelList] 使用硬编码默认值');
    const newValues: Record<string, string> = {};
    const newChecked = new Set<string>();

    // 定义每个等级的硬编码默认配置
    const hardcodedLevelConfigs: Record<number, {
      daily_quota: number;
      max_files: number;
      max_chat_messages: number;
      can_view_cost_price: boolean;
      can_view_min_price: boolean;
      can_view_manufacturer: boolean;
      can_view_contact: boolean;
      can_view_phone: boolean;
    }> = {
      1: {
        daily_quota: 10,
        max_files: 5,
        max_chat_messages: 20,
        can_view_cost_price: false,
        can_view_min_price: false,
        can_view_manufacturer: false,
        can_view_contact: false,
        can_view_phone: false,
      },
      2: {
        daily_quota: 50,
        max_files: 20,
        max_chat_messages: 100,
        can_view_cost_price: false,
        can_view_min_price: true,
        can_view_manufacturer: false,
        can_view_contact: false,
        can_view_phone: false,
      },
      3: {
        daily_quota: 200,
        max_files: 50,
        max_chat_messages: 500,
        can_view_cost_price: true,
        can_view_min_price: true,
        can_view_manufacturer: true,
        can_view_contact: false,
        can_view_phone: false,
      },
      4: {
        daily_quota: 1000,
        max_files: 200,
        max_chat_messages: 2000,
        can_view_cost_price: true,
        can_view_min_price: true,
        can_view_manufacturer: true,
        can_view_contact: true,
        can_view_phone: true,
      },
      5: {
        daily_quota: 9999,
        max_files: 9999,
        max_chat_messages: 9999,
        can_view_cost_price: true,
        can_view_min_price: true,
        can_view_manufacturer: true,
        can_view_contact: true,
        can_view_phone: true,
      },
    };

    levels.forEach((level) => {
      const config = hardcodedLevelConfigs[level.level] || hardcodedLevelConfigs[1];

      // 配额默认值
      newValues[`${level.level}-daily_quota`] = String(config.daily_quota);
      newValues[`${level.level}-max_files`] = String(config.max_files);
      newValues[`${level.level}-max_chat_messages`] = String(config.max_chat_messages);

      // 字段权限默认值
      newValues[`${level.level}-can_view_cost_price`] = String(config.can_view_cost_price);
      newValues[`${level.level}-can_view_min_price`] = String(config.can_view_min_price);
      newValues[`${level.level}-can_view_manufacturer`] = String(config.can_view_manufacturer);
      newValues[`${level.level}-can_view_contact`] = String(config.can_view_contact);
      newValues[`${level.level}-can_view_phone`] = String(config.can_view_phone);

      // 添加到勾选列表
      Object.keys(configCategories).forEach((categoryKey) => {
        configCategories[categoryKey as keyof typeof configCategories].items.forEach((item) => {
          newChecked.add(`${level.level}-${item.field}`);
        });
      });
    });

    setItemValues(newValues);
    setCheckedItems(newChecked);
    setBatchUpdateReason('恢复系统默认配置');

    toast({
      title: '正在恢复默认配置',
      description: '正在保存配置...',
      duration: 3000,
    });

    // 直接执行批量更新
    try {
      const updatesByLevel: Record<number, any> = {};

      levels.forEach((level) => {
        updatesByLevel[level.level] = {
          level: level.level,
          changes: {
            quotas: {
              daily_quota: parseInt(newValues[`${level.level}-daily_quota`]),
              max_files: parseInt(newValues[`${level.level}-max_files`]),
              max_chat_messages: parseInt(newValues[`${level.level}-max_chat_messages`]),
            },
            fieldPermissions: {
              can_view_cost_price: newValues[`${level.level}-can_view_cost_price`] === 'true',
              can_view_min_price: newValues[`${level.level}-can_view_min_price`] === 'true',
              can_view_manufacturer: newValues[`${level.level}-can_view_manufacturer`] === 'true',
              can_view_contact: newValues[`${level.level}-can_view_contact`] === 'true',
              can_view_phone: newValues[`${level.level}-can_view_phone`] === 'true',
            }
          }
        };
      });

      const updates = Object.values(updatesByLevel).map((update: any) => ({
        ...update,
        reason: '恢复系统默认配置'
      }));

      console.log('[LevelList] 恢复默认配置数据:', updates);

      const res = await fetch('/api/admin/levels/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ updates })
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error('[LevelList] 恢复默认配置API错误:', errorText);
        throw new Error(errorText);
      }

      const data = await res.json();
      console.log('[LevelList] 恢复默认配置结果:', data);

      if (data.success) {
        toast({
          title: '已成功恢复默认配置',
          description: `共更新 ${updates.length} 个等级`,
          duration: 3000,
        });

        // 刷新列表
        await fetchLevels();
        
        // 只在弹窗打开时重置表单
        if (batchUpdateOpen) {
          resetBatchForm();
        }
      } else {
        toast({
          variant: 'destructive',
          title: '恢复默认配置失败',
          description: data.error || '未知错误'
        });
      }
    } catch (error) {
      console.error('[LevelList] 恢复默认配置失败:', error);
      toast({
        variant: 'destructive',
        title: '恢复默认配置失败',
        description: error instanceof Error ? error.message : '未知错误'
      });
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">等级权限配置</h2>
        <Button onClick={() => setBatchUpdateOpen(true)}>
          <Upload className="mr-2 h-4 w-4" />
          批量更新
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-8">加载中...</div>
      ) : (
        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">等级</TableHead>
                <TableHead className="whitespace-nowrap">名称</TableHead>
                <TableHead className="whitespace-nowrap">所需积分</TableHead>
                <TableHead className="whitespace-nowrap min-w-[200px]">字段权限</TableHead>
                <TableHead className="whitespace-nowrap min-w-[250px]">模块权限</TableHead>
                <TableHead className="whitespace-nowrap">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {levels.map((record) => (
                <TableRow key={record.level}>
                  <TableCell className="whitespace-nowrap">
                    <Badge className={getLevelColor(record.level)}>
                      Lv.{record.level}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{record.name}</TableCell>
                  <TableCell className="whitespace-nowrap">{record.requiredPoints}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <div className="flex flex-wrap gap-1">
                      {record.fieldPermissions.can_view_cost_price && (
                        <Badge variant="secondary">成本价</Badge>
                      )}
                      {record.fieldPermissions.can_view_min_price && (
                        <Badge variant="secondary">最低价</Badge>
                      )}
                      {record.fieldPermissions.can_view_manufacturer && (
                        <Badge variant="outline">厂家</Badge>
                      )}
                      {record.fieldPermissions.can_view_contact && (
                        <Badge variant="outline">联系人</Badge>
                      )}
                      {record.fieldPermissions.can_view_phone && (
                        <Badge variant="outline">电话</Badge>
                      )}
                      {!record.fieldPermissions.can_view_cost_price &&
                       !record.fieldPermissions.can_view_min_price &&
                       !record.fieldPermissions.can_view_manufacturer &&
                       !record.fieldPermissions.can_view_contact &&
                       !record.fieldPermissions.can_view_phone && (
                        <span className="text-muted-foreground text-sm">无权限</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <div className="flex flex-wrap gap-1">
                      {record.modulePermissions.length > 0 ? (
                        <>
                          {record.modulePermissions.slice(0, 3).map((code) => (
                            <Badge key={code} variant="outline" className="bg-purple-50">
                              {moduleNameMap[code] || code}
                            </Badge>
                          ))}
                          {record.modulePermissions.length > 3 && (
                            <Badge variant="outline">
                              +{record.modulePermissions.length - 3}
                            </Badge>
                          )}
                        </>
                      ) : (
                        <span className="text-muted-foreground text-sm">无权限</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingLevel(record.level)}
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        编辑
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => showHistory(record.level)}
                      >
                        <History className="h-4 w-4 mr-1" />
                        历史
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => showPreview(record.level)}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        预览
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {levels.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    暂无等级数据
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!editingLevel} onOpenChange={() => setEditingLevel(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>编辑等级 Lv.{editingLevel} 权限</DialogTitle>
            <DialogDescription>
              修改等级的配额设置、字段权限和模块权限
            </DialogDescription>
          </DialogHeader>
          {editingLevel && (
            <LevelEditor
              level={editingLevel}
              onSave={handleUpdateLevel}
              onCancel={() => setEditingLevel(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* 预览弹窗 */}
      {previewLevel && (() => {
        const levelData = levels.find(l => l.level === previewLevel);
        if (!levelData) return null;

        return (
          <Dialog open={!!previewLevel} onOpenChange={() => setPreviewLevel(null)}>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>等级权限预览</DialogTitle>
                <DialogDescription>
                  查看等级的详细权限配置
                </DialogDescription>
              </DialogHeader>

              <div className="py-4">
                <h3 className="text-lg font-semibold">Lv.{levelData.level}</h3>
                <p className="text-sm text-muted-foreground mb-4">{levelData.name}</p>

                {/* 基础信息 */}
                <div className="mb-4">
                  <h4 className="font-medium mb-2">基础信息</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="text-muted-foreground">所需积分：</span>
                    <span>{levelData.requiredPoints}</span>
                    <span className="text-muted-foreground">角色：</span>
                    <span>{roleNameMap[levelData.role] || levelData.role}</span>
                  </div>
                </div>

                {/* 配额设置 */}
                <div className="mb-4">
                  <h4 className="font-medium mb-2">配额设置</h4>
                  <ul className="list-disc list-inside text-sm space-y-1">
                    <li>
                      每日查询配额：{levelData.quotas?.daily_quota || 0} 次
                      {levelData.quotas?.daily_quota === 0 && (
                        <span className="text-muted-foreground ml-2">（不限制）</span>
                      )}
                    </li>
                    <li>
                      最大文件数量：{levelData.quotas?.max_files || 0} 个
                      {levelData.quotas?.max_files === 0 && (
                        <span className="text-muted-foreground ml-2">（不限制）</span>
                      )}
                    </li>
                    <li>
                      最大聊天消息数：{levelData.quotas?.max_chat_messages || 0} 条
                      {levelData.quotas?.max_chat_messages === 0 && (
                        <span className="text-muted-foreground ml-2">（不限制）</span>
                      )}
                    </li>
                  </ul>
                  <p className="text-xs text-muted-foreground mt-2">
                    注：配额设置为 0 时代表不限制
                  </p>
                </div>

                {/* 字段权限 */}
                <div className="mb-4">
                  <h4 className="font-medium mb-2">字段权限</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {levelData.fieldPermissions?.can_view_cost_price && (
                      <span className="text-green-600">✅ 查看成本价</span>
                    )}
                    {levelData.fieldPermissions?.can_view_min_price && (
                      <span className="text-green-600">✅ 查看最低售价</span>
                    )}
                    {levelData.fieldPermissions?.can_view_manufacturer && (
                      <span className="text-green-600">✅ 查看厂家信息</span>
                    )}
                    {levelData.fieldPermissions?.can_view_contact && (
                      <span className="text-green-600">✅ 查看联系人</span>
                    )}
                    {levelData.fieldPermissions?.can_view_phone && (
                      <span className="text-green-600">✅ 查看联系电话</span>
                    )}
                  </div>
                  {!levelData.fieldPermissions?.can_view_cost_price &&
                   !levelData.fieldPermissions?.can_view_min_price &&
                   !levelData.fieldPermissions?.can_view_manufacturer &&
                   !levelData.fieldPermissions?.can_view_contact &&
                   !levelData.fieldPermissions?.can_view_phone && (
                    <p className="text-sm text-muted-foreground">无权限</p>
                  )}
                </div>

                {/* 模块权限 */}
                <div>
                  <h4 className="font-medium mb-2">模块权限</h4>
                  <div className="flex flex-wrap gap-2">
                    {levelData.modulePermissions?.map((code: string) => (
                      <span key={code} className="px-2 py-1 bg-gray-100 rounded text-sm">
                        {moduleNameMap[code] || code}
                      </span>
                    ))}
                    {!levelData.modulePermissions || levelData.modulePermissions.length === 0 && (
                      <p className="text-sm text-muted-foreground">无权限</p>
                    )}
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* 历史记录 Dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>等级 {historyLevel} 修改历史</DialogTitle>
            <DialogDescription>
              查看该等级的权限配置修改记录
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {historyLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                加载中...
              </div>
            ) : historyData.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                暂无历史记录
              </div>
            ) : (
              <div className="space-y-4">
                {historyData.map((item, index) => (
                  <div key={item.id || index} className="p-4 bg-muted/30 rounded-lg border border-border">
                    <div className="flex items-start justify-between mb-2">
                      <div className="text-sm text-muted-foreground">{item.time}</div>
                      <Badge variant="outline">{index + 1}</Badge>
                    </div>
                    
                    <div className="mb-2">
                      <span className="font-medium">操作人：</span>
                      <span>{item.admin}</span>
                    </div>
                    
                    <div className="mb-2">
                      <span className="font-medium">修改原因：</span>
                      <span>{item.reason}</span>
                    </div>
                    
                    {item.changes && (
                      <details className="mt-3">
                        <summary className="text-sm text-primary cursor-pointer hover:underline">
                          查看修改详情
                        </summary>
                        <pre className="mt-2 p-3 bg-background rounded text-xs overflow-auto max-h-64 border border-border">
                          {typeof item.changes === 'string' 
                            ? item.changes 
                            : JSON.stringify(item.changes, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={batchUpdateOpen} onOpenChange={setBatchUpdateOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>批量更新等级配置</DialogTitle>
            <DialogDescription>
              勾选需要修改的配置项，设置新值后批量提交
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* 等级树状结构 */}
            <div className="border rounded-md">
              {levels.map((level) => {
                const isExpanded = expandedLevels.has(level.level);
                const levelCategories = expandedCategories[level.level] || new Set();

                return (
                  <div key={level.level} className="border-b last:border-b-0">
                    {/* 等级头部 */}
                    <div
                      className="flex items-center justify-between p-3 bg-muted/50 hover:bg-muted cursor-pointer"
                      onClick={() => toggleLevelExpand(level.level)}
                    >
                      <div className="flex items-center gap-2">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                        <Badge className={getLevelColor(level.level)}>
                          Lv.{level.level}
                        </Badge>
                        <span className="font-medium">{level.name}</span>
                        <span className="text-sm text-muted-foreground">
                          (所需积分: {level.requiredPoints})
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        已勾选 {Array.from(checkedItems).filter(item => item.startsWith(`${level.level}-`)).length} 项
                      </span>
                    </div>

                    {/* 配置类别 */}
                    {isExpanded && (
                      <div className="pl-4 bg-background">
                        {Object.entries(configCategories).map(([categoryKey, category]) => {
                          const CategoryIcon = category.icon;
                          const isCategoryExpanded = levelCategories.has(categoryKey);

                          return (
                            <div key={categoryKey} className="border-b last:border-b-0">
                              {/* 类别头部 */}
                              <div
                                className="flex items-center gap-2 p-2 hover:bg-muted/50 cursor-pointer"
                                onClick={() => toggleCategoryExpand(level.level, categoryKey)}
                              >
                                {isCategoryExpanded ? (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                )}
                                <CategoryIcon className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium text-sm">{category.name}</span>
                                {categoryKey === 'quotas' && (
                                  <span className="text-xs text-muted-foreground">（设为0表示不限制）</span>
                                )}
                              </div>

                              {/* 配置项 */}
                              {isCategoryExpanded && (
                                <div className="pl-6 pb-2 space-y-2">
                                  {category.items.map((item) => {
                                    const itemKey = `${level.level}-${item.field}`;
                                    const isChecked = checkedItems.has(itemKey);
                                    const currentValue = itemValues[itemKey];

                                    return (
                                      <div
                                        key={item.field}
                                        className="flex items-center gap-3 p-2 rounded-md border bg-card hover:bg-muted/50"
                                      >
                                        <Checkbox
                                          id={itemKey}
                                          checked={isChecked}
                                          onCheckedChange={() => toggleCheck(itemKey)}
                                        />
                                        <Label
                                          htmlFor={itemKey}
                                          className="flex-1 cursor-pointer text-sm"
                                        >
                                          {item.label}
                                        </Label>
                                        {isChecked && (
                                          <div className="flex items-center gap-2">
                                            {item.type === 'boolean' ? (
                                              <Select
                                                value={currentValue || 'true'}
                                                onValueChange={(value) => updateItemValue(itemKey, value)}
                                              >
                                                <SelectTrigger className="w-32 h-8 text-xs">
                                                  <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                  <SelectItem value="true">开启</SelectItem>
                                                  <SelectItem value="false">关闭</SelectItem>
                                                </SelectContent>
                                              </Select>
                                            ) : (
                                              <Input
                                                type="number"
                                                min="0"
                                                value={currentValue || ''}
                                                onChange={(e) => updateItemValue(itemKey, e.target.value)}
                                                placeholder="输入数值"
                                                className="w-32 h-8 text-xs"
                                              />
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 统计信息 */}
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-md text-sm">
              <span className="text-muted-foreground">
                已勾选 <span className="font-bold text-foreground">{checkedItems.size}</span> 个配置项，
                涉及 <span className="font-bold text-foreground">
                  {new Set(Array.from(checkedItems).map(item => item.split('-')[0])).size}
                </span> 个等级
              </span>
            </div>

            {/* 修改原因 */}
            <div className="space-y-2">
              <Label>修改原因 <span className="text-destructive">*</span></Label>
              <Textarea
                value={batchUpdateReason}
                onChange={(e) => setBatchUpdateReason(e.target.value)}
                rows={3}
                placeholder="请输入修改原因..."
              />
            </div>
          </div>

          <div className="flex justify-between items-center pt-4 border-t">
            <Button
              variant="outline"
              onClick={restoreDefaults}
              className="text-destructive hover:text-destructive"
            >
              恢复默认配置
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setBatchUpdateOpen(false)}>
                取消
              </Button>
              <Button onClick={handleBatchUpdate} disabled={batchUpdating || checkedItems.size === 0}>
                {batchUpdating && (
                  <Upload className="mr-2 h-4 w-4 animate-spin" />
                )}
                确认批量更新
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
