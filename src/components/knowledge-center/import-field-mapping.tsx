'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';

// 中文同义词映射表 - 用于智能匹配Excel列名到系统字段
// 注意：键名必须与数据库中的 field_key 一致
const FIELD_SYNONYMS: Record<string, string[]> = {
  // 产品名称 - 数据库中 field_key 是 'name'
  name: [
    '产品名称', '名称', '产品名', '产品', '货品名称', '商品名称', '品名', '设备名称', '设备名', '物料名称',
    'product_name', 'name', 'product name', 'product'
  ],
  model: [
    '规格型号', '型号', '规格', '型号规格', '产品型号', '设备型号', '产品规格',
    'model', 'specification', 'spec', 'type'
  ],
  brand: [
    '品牌', '品牌名称', '厂家', '制造商', '生产厂家', '品牌厂家',
    'brand', 'manufacturer', 'make'
  ],
  // 参数描述 - 数据库中 field_key 是 parameter_description
  parameter_description: [
    '参数描述', '参数', '技术参数', '规格参数', '产品参数', '参数说明', '简介说明', '描述', '产品描述', '备注',
    'parameter_description', 'specifications', 'specs', 'description', 'parameters', 'params'
  ],
  // 兼容 specifications 映射到 parameter_description
  specifications: [
    '参数描述', '参数', '技术参数', '规格参数', '产品参数', '参数说明', '简介说明', '描述', '产品描述', '备注',
    'specifications', 'specs', 'description', 'parameters', 'params'
  ],
  supplier: [
    '供应商', '供应商名称', '供货商', '厂商', '供应商名称', '供货单位',
    'supplier', 'vendor', 'provider'
  ],
  contact_person: [
    '联系人', '联系人姓名', '业务联系人', '对接人', '负责人', '联系人员',
    'contact_person', 'contact', 'contact name'
  ],
  contact_phone: [
    '联系电话', '电话', '联系方式', '手机', '手机号码', '电话号码', '联系电话号码',
    'contact_phone', 'phone', 'tel', 'mobile', 'telephone'
  ],
  unit: [
    '单位', '计量单位', '数量单位', '单位名称',
    'unit', 'uom', 'unit of measure'
  ],
  cost_price: [
    '成本', '成本价', '成本价格', '进价', '进货价', '采购价', '采购价格', '成本（元）', '成本价（元）',
    'cost_price', 'cost', 'purchase price'
  ],
  min_price: [
    '最低售价', '最低价', '最低价格', '底价', '最低销售价', '最低售价（元）',
    'min_price', 'minimum price', 'min price'
  ],
  price: [
    '指导价', '价格', '单价', '售价', '销售价', '报价', '参考价', '市场价', '指导价格', '指导价（元）',
    'price', 'unit price', 'selling price', 'quote price'
  ],
  category: [
    '分类', '产品分类', '类别', '产品类别',
    'category', 'type', 'class'
  ],
  // 兼容旧字段名
  product_name: [
    '产品名称', '名称', '产品名', '产品', '货品名称', '商品名称', '品名', '设备名称', '设备名', '物料名称',
    'product_name', 'name', 'product name', 'product'
  ],
};

// 系统字段定义（默认配置，如果API加载失败会使用）
// 注意：key 必须与数据库中的 field_key 一致
export const SYSTEM_FIELDS = [
  {
    key: 'name',
    label: '产品名称',
    required: true,
    description: '产品的名称',
    sampleValues: ['工业提升泵', '搅拌罐', '板框压滤机'],
  },
  {
    key: 'model',
    label: '规格型号',
    required: false,
    description: '产品的型号规格',
    sampleValues: ['CR5-12', '2.5m³', 'XMYZ100/800-U'],
  },
  {
    key: 'brand',
    label: '品牌',
    required: false,
    description: '产品品牌',
    sampleValues: ['格兰富', '通用', '景津'],
  },
  {
    key: 'category',
    label: '分类',
    required: false,
    description: '产品分类',
    sampleValues: ['泵类', '阀门', '电机'],
  },
  {
    key: 'parameter_description',
    label: '参数描述',
    required: false,
    description: '产品详细参数',
    sampleValues: ['流量12m³/h，扬程30m', '不锈钢材质，配搅拌器'],
  },
  {
    key: 'supplier',
    label: '供应商',
    required: false,
    description: '产品供应商',
    sampleValues: ['格兰富中国', '通用机械', '景津环保'],
  },
  {
    key: 'contact_person',
    label: '联系人',
    required: false,
    description: '供应商联系人',
    sampleValues: ['张三', '李四', '王五'],
  },
  {
    key: 'contact_phone',
    label: '联系电话',
    required: false,
    description: '供应商联系电话',
    sampleValues: ['13800138000', '13900139000'],
  },
  {
    key: 'unit',
    label: '单位',
    required: false,
    description: '单位',
    sampleValues: ['台', '套', '个', '件'],
  },
  {
    key: 'cost_price',
    label: '成本',
    required: false,
    description: '产品成本价格',
    sampleValues: ['3200', '14500', '88000'],
  },
  {
    key: 'min_price',
    label: '最低售价',
    required: false,
    description: '产品最低销售价格',
    sampleValues: ['3500', '15000', '90000'],
  },
  {
    key: 'price',
    label: '指导价',
    required: true,
    description: '产品指导价格',
    sampleValues: ['3200', '14500', '88000'],
  },
  {
    key: 'image_url',
    label: '图片',
    required: false,
    description: '产品图片链接',
    sampleValues: ['https://example.com/image.jpg'],
  },
  {
    key: 'stock',
    label: '库存',
    required: false,
    description: '产品库存数量',
    sampleValues: ['10', '100', '500'],
  },
];

interface FieldConfig {
  id: number;
  field_key: string;
  field_label: string;
  is_required: boolean;
}

interface ImportFieldMappingProps {
  excelHeaders: string[];
  excelData: any[];
  onConfirm: (mapping: Record<string, string>) => void;
  onCancel: () => void;
}

export default function ImportFieldMapping({
  excelHeaders,
  excelData,
  onConfirm,
  onCancel,
}: ImportFieldMappingProps) {
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [autoMapped, setAutoMapped] = useState(false);
  const [fieldConfigs, setFieldConfigs] = useState(SYSTEM_FIELDS);
  const [loadingConfigs, setLoadingConfigs] = useState(true);

  // 从API加载字段配置
  useEffect(() => {
    loadFieldConfigs();
  }, []);

  const loadFieldConfigs = async () => {
    try {
      const res = await fetch('/api/tables/products/field-configs');
      const data = await res.json();

      if (data.success && data.data && data.data.length > 0) {
        // 过滤掉 description 字段，只保留 parameter_description
        const filteredData = data.data.filter((config: FieldConfig) => config.field_key !== 'description');
        
        // 将API返回的配置转换为组件需要的格式
        // 确保使用中文标签
        const configs = filteredData.map((config: FieldConfig) => {
          // 从默认配置中获取中文标签
          const defaultField = SYSTEM_FIELDS.find(f => f.key === config.field_key);
          return {
            key: config.field_key,
            label: defaultField?.label || config.field_label || config.field_key,
            required: config.is_required,
            description: getFieldDescription(config.field_key),
            sampleValues: getFieldSampleValues(config.field_key),
          };
        });
        setFieldConfigs(configs);
        console.log('加载的字段配置:', configs.map((c: { label: string; key: string }) => `${c.label} (${c.key})`));
      }
    } catch (error) {
      console.error('加载字段配置失败:', error);
      // 使用默认配置（过滤掉description）
      const defaultConfigs = SYSTEM_FIELDS.filter(f => f.key !== 'description');
      setFieldConfigs(defaultConfigs);
    } finally {
      setLoadingConfigs(false);
    }
  };

  const getFieldDescription = (key: string): string => {
    const descriptions: Record<string, string> = {
      name: '产品的名称',
      product_name: '产品的名称',
      model: '产品的型号规格',
      brand: '产品品牌',
      parameter_description: '产品详细参数',
      supplier: '产品供应商',
      contact_person: '供应商联系人',
      contact_phone: '供应商联系电话',
      unit: '单位',
      cost_price: '产品成本价格',
      min_price: '产品最低销售价格',
      price: '产品指导价格',
      category: '产品分类',
      image_url: '产品图片链接',
      stock: '产品库存数量',
    };
    return descriptions[key] || '';
  };

  const getFieldSampleValues = (key: string): string[] => {
    const samples: Record<string, string[]> = {
      name: ['工业提升泵', '搅拌罐', '板框压滤机'],
      product_name: ['工业提升泵', '搅拌罐', '板框压滤机'],
      model: ['CR5-12', '2.5m³', 'XMYZ100/800-U'],
      brand: ['格兰富', '通用', '景津'],
      parameter_description: ['流量12m³/h，扬程30m', '不锈钢材质，配搅拌器'],
      supplier: ['格兰富中国', '通用机械', '景津环保'],
      contact_person: ['张三', '李四', '王五'],
      contact_phone: ['13800138000', '13900139000'],
      unit: ['台', '套', '个', '件'],
      cost_price: ['3200', '14500', '88000'],
      min_price: ['3500', '15000', '90000'],
      price: ['3200', '14500', '88000'],
      category: ['泵类', '阀门', '电机'],
      image_url: ['https://example.com/image.jpg'],
      stock: ['10', '100', '500'],
    };
    return samples[key] || [];
  };

  // 智能匹配函数 - 使用同义词表进行匹配
  const findBestMatchBySynonyms = (excelHeader: string): { fieldKey: string; score: number } | null => {
    if (!excelHeader) return null;

    // 清理Excel列名
    const cleanHeader = excelHeader
      .replace(/[（(）)]/g, '')
      .replace(/\s+/g, '')
      .trim();

    let bestMatch: { fieldKey: string; score: number } | null = null;

    // 遍历所有字段的同义词
    for (const [fieldKey, synonyms] of Object.entries(FIELD_SYNONYMS)) {
      for (const synonym of synonyms) {
        const cleanSynonym = synonym
          .replace(/[（(）)]/g, '')
          .replace(/\s+/g, '')
          .toLowerCase();

        const cleanHeaderLower = cleanHeader.toLowerCase();

        // 完全匹配 (优先级最高)
        if (cleanHeaderLower === cleanSynonym) {
          return { fieldKey, score: 100 };
        }

        // 包含匹配
        if (cleanHeaderLower.includes(cleanSynonym) || cleanSynonym.includes(cleanHeaderLower)) {
          if (!bestMatch || 90 > bestMatch.score) {
            bestMatch = { fieldKey, score: 90 };
          }
        }

        // 计算字符相似度
        const commonChars = cleanHeaderLower.split('').filter(c => cleanSynonym.includes(c)).length;
        const maxLength = Math.max(cleanHeaderLower.length, cleanSynonym.length);
        if (maxLength > 0) {
          const similarity = (commonChars / maxLength) * 100;
          if (similarity >= 60 && (!bestMatch || similarity > bestMatch.score)) {
            bestMatch = { fieldKey, score: similarity };
          }
        }
      }
    }

    return bestMatch;
  };

  // 模糊匹配函数 (保留原有逻辑作为备用)
  const findBestMatch = (fileName: string, systemFields: string[]): string | null => {
    if (!fileName || !systemFields || systemFields.length === 0) return null;

    // 清理文件列名：去除空格、括号等
    const cleanName = fileName
      .replace(/[（(）)]/g, '')
      .replace(/\s+/g, '')
      .toLowerCase();

    let bestMatch: string | null = null;
    let highestScore = 0;

    for (const field of systemFields) {
      const cleanField = field
        .replace(/[（(）)]/g, '')
        .replace(/\s+/g, '')
        .toLowerCase();

      // 计算相似度
      let score = 0;

      // 完全匹配
      if (cleanName === cleanField) {
        score = 100;
      }
      // 包含关系
      else if (cleanName.includes(cleanField) || cleanField.includes(cleanName)) {
        score = 80;
      }
      // 编辑距离计算（简化版）
      else {
        // 计算公共子序列长度
        const commonChars = cleanName.split('').filter(c => cleanField.includes(c)).length;
        const maxLength = Math.max(cleanName.length, cleanField.length);
        if (maxLength > 0) {
          score = (commonChars / maxLength) * 60;
        }
      }

      if (score > highestScore) {
        highestScore = score;
        bestMatch = field;
      }
    }

    // 只有当相似度超过阈值时才返回匹配
    return highestScore > 50 ? bestMatch : null;
  };

  // 自动映射字段 - 优化版
  useEffect(() => {
    if (!autoMapped && excelHeaders.length > 0 && !loadingConfigs) {
      const autoMapping: Record<string, string> = {};
      const usedHeaders = new Set<string>(); // 记录已映射的列名，避免重复映射

      console.log('=== 开始自动映射字段 ===');
      console.log('文件列名:', excelHeaders);
      console.log('系统字段:', fieldConfigs.map(f => f.label));

      // 第一轮：使用同义词表进行智能匹配
      excelHeaders.forEach((header) => {
        if (usedHeaders.has(header)) return;

        const matchResult = findBestMatchBySynonyms(header);
        if (matchResult && matchResult.score >= 70) {
          // 检查该系统字段是否已被映射
          const fieldConfig = fieldConfigs.find(f => f.key === matchResult.fieldKey);
          if (fieldConfig && !autoMapping[matchResult.fieldKey]) {
            autoMapping[matchResult.fieldKey] = header;
            usedHeaders.add(header);
            console.log(`同义词匹配: ${fieldConfig.label} (${matchResult.fieldKey}) -> ${header} (分数: ${matchResult.score})`);
          }
        }
      });

      // 第二轮：使用原有的精确匹配和包含匹配作为补充
      fieldConfigs.forEach((field) => {
        if (autoMapping[field.key]) return; // 已映射则跳过

        // 先尝试精确匹配
        const exactMatch = excelHeaders.find(
          (header) =>
            !usedHeaders.has(header) &&
            (header.toLowerCase() === field.label.toLowerCase() ||
            header.toLowerCase().replace(/\s/g, '') === field.label.toLowerCase().replace(/\s/g, ''))
        );

        if (exactMatch) {
          autoMapping[field.key] = exactMatch;
          usedHeaders.add(exactMatch);
          console.log(`精确匹配: ${field.label} -> ${exactMatch}`);
          return;
        }

        // 尝试包含匹配
        const containsMatch = excelHeaders.find(
          (header) =>
            !usedHeaders.has(header) &&
            (header.toLowerCase().includes(field.label.toLowerCase()) ||
            field.label.toLowerCase().includes(header.toLowerCase()))
        );

        if (containsMatch) {
          autoMapping[field.key] = containsMatch;
          usedHeaders.add(containsMatch);
          console.log(`包含匹配: ${field.label} -> ${containsMatch}`);
          return;
        }

        // 尝试模糊匹配
        const bestMatch = findBestMatch(field.label, excelHeaders.filter(h => !usedHeaders.has(h)));
        if (bestMatch) {
          autoMapping[field.key] = bestMatch;
          usedHeaders.add(bestMatch);
          console.log(`模糊匹配: ${field.label} -> ${bestMatch}`);
        }
      });

      console.log('自动映射结果:', autoMapping);
      console.log('未映射的系统字段:', fieldConfigs.filter(f => !autoMapping[f.key]).map(f => f.label));
      setMapping(autoMapping);
      setAutoMapped(true);
    }
  }, [excelHeaders, autoMapped, fieldConfigs, loadingConfigs]);

  const handleFieldMapping = (systemField: string, excelHeader: string) => {
    setMapping((prev) => ({
      ...prev,
      [systemField]: excelHeader,
    }));
  };

  const handleConfirm = () => {
    // 过滤掉值为 "none" 的字段
    const filteredMapping: Record<string, string> = {};
    Object.keys(mapping).forEach((key) => {
      if (mapping[key] && mapping[key] !== 'none') {
        filteredMapping[key] = mapping[key];
      }
    });

    // 验证必填字段
    const requiredFields = fieldConfigs.filter((f) => f.required);
    const missingFields = requiredFields.filter((field) => !filteredMapping[field.key]);

    if (missingFields.length > 0) {
      alert(`请为以下必填字段选择对应的文件列：\n${missingFields.map((f) => f.label).join('、')}`);
      return;
    }

    onConfirm(filteredMapping);
  };

  const getExcelHeaderPreview = (header: string) => {
    if (!excelData || excelData.length === 0) return '';

    const sample = excelData.find((row) => row[header] && row[header] !== '');
    return sample ? sample[header] : '';
  };

  return (
    <Card className="w-full max-w-3xl mx-auto max-h-[80vh] flex flex-col">
      <CardHeader className="flex-shrink-0 pb-2">
        <CardTitle className="text-lg">字段映射</CardTitle>
        <CardDescription className="text-sm">请将文件的列映射到系统字段，红色*号为必填项</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden flex flex-col min-h-0">
        <div className="flex-1 overflow-y-auto -mx-6 px-6">
          {/* 字段映射表格 */}
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="text-left p-2 font-medium w-32">系统字段</th>
                  <th className="text-left p-2 font-medium">文件列名</th>
                  <th className="text-left p-2 font-medium w-36">示例数据</th>
                </tr>
              </thead>
              <tbody>
                {fieldConfigs.map((field) => (
                  <tr key={field.key} className="border-t hover:bg-muted/50">
                    <td className="p-2">
                      <div className="flex flex-col gap-0.5">
                        <Label className={`text-sm ${field.required ? 'text-red-500' : ''}`}>
                          {field.required ? '* ' : ''}
                          {field.label}
                        </Label>
                        <span className="text-xs text-muted-foreground">{field.description}</span>
                      </div>
                    </td>
                    <td className="p-2">
                      <Select
                        value={mapping[field.key] || 'none'}
                        onValueChange={(value) =>
                          handleFieldMapping(field.key, value === 'none' ? '' : value)
                        }
                      >
                        <SelectTrigger className="w-full h-8">
                          <SelectValue placeholder="请选择..." />
                        </SelectTrigger>
                        <SelectContent className="max-h-48">
                          <SelectItem value="none">不导入</SelectItem>
                          {excelHeaders.map((header) => (
                            <SelectItem key={header} value={header}>
                              {header}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-2">
                      {mapping[field.key] && (
                        <span className="text-xs text-muted-foreground truncate block max-w-[140px]">
                          {getExcelHeaderPreview(mapping[field.key]) || '-'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex justify-end gap-3 pt-3 mt-3 border-t flex-shrink-0">
          <Button variant="outline" size="sm" onClick={onCancel}>
            取消
          </Button>
          <Button size="sm" onClick={handleConfirm}>确认并导入</Button>
        </div>
      </CardContent>
    </Card>
  );
}
