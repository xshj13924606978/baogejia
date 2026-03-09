'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';

// 系统字段定义（默认配置，如果API加载失败会使用）
export const SYSTEM_FIELDS = [
  {
    key: 'product_name',
    label: '产品名称',
    required: true,
    description: '产品的名称',
    sampleValues: ['工业提升泵', '搅拌罐', '板框压滤机']
  },
  {
    key: 'model',
    label: '规格型号',
    required: false,
    description: '产品的型号规格',
    sampleValues: ['CR5-12', '2.5m³', 'XMYZ100/800-U']
  },
  {
    key: 'brand',
    label: '品牌',
    required: false,
    description: '产品品牌',
    sampleValues: ['格兰富', '通用', '景津']
  },
  {
    key: 'specifications',
    label: '参数描述',
    required: false,
    description: '产品详细参数',
    sampleValues: ['流量12m³/h，扬程30m', '不锈钢材质，配搅拌器']
  },
  {
    key: 'supplier',
    label: '供应商',
    required: false,
    description: '产品供应商',
    sampleValues: ['格兰富中国', '通用机械', '景津环保']
  },
  {
    key: 'contact_person',
    label: '联系人',
    required: false,
    description: '供应商联系人',
    sampleValues: ['张三', '李四', '王五']
  },
  {
    key: 'contact_phone',
    label: '联系电话',
    required: false,
    description: '供应商联系电话',
    sampleValues: ['13800138000', '13900139000']
  },
  {
    key: 'unit',
    label: '单位',
    required: false,
    description: '产品计量单位',
    sampleValues: ['台', '套', '个', '件']
  },
  {
    key: 'cost_price',
    label: '成本',
    required: false,
    description: '产品成本价格',
    sampleValues: ['3200', '14500', '88000']
  },
  {
    key: 'min_price',
    label: '最低售价',
    required: false,
    description: '产品最低销售价格',
    sampleValues: ['3500', '15000', '90000']
  },
  {
    key: 'price',
    label: '指导价',
    required: true,
    description: '产品指导价格',
    sampleValues: ['3200', '14500', '88000']
  }
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
  onCancel
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
        // 将API返回的配置转换为组件需要的格式
        const configs = data.data.map((config: FieldConfig) => ({
          key: config.field_key,
          label: config.field_label,
          required: config.is_required,
          description: getFieldDescription(config.field_key),
          sampleValues: getFieldSampleValues(config.field_key)
        }));
        setFieldConfigs(configs);
      }
    } catch (error) {
      console.error('加载字段配置失败:', error);
      // 使用默认配置
    } finally {
      setLoadingConfigs(false);
    }
  };

  const getFieldDescription = (key: string): string => {
    const descriptions: Record<string, string> = {
      'product_name': '产品的名称',
      'model': '产品的型号规格',
      'brand': '产品品牌',
      'specifications': '产品详细参数',
      'supplier': '产品供应商',
      'contact_person': '供应商联系人',
      'contact_phone': '供应商联系电话',
      'unit': '产品计量单位',
      'cost_price': '产品成本价格',
      'min_price': '产品最低销售价格',
      'price': '产品指导价格'
    };
    return descriptions[key] || '';
  };

  const getFieldSampleValues = (key: string): string[] => {
    const samples: Record<string, string[]> = {
      'product_name': ['工业提升泵', '搅拌罐', '板框压滤机'],
      'model': ['CR5-12', '2.5m³', 'XMYZ100/800-U'],
      'brand': ['格兰富', '通用', '景津'],
      'specifications': ['流量12m³/h，扬程30m', '不锈钢材质，配搅拌器'],
      'supplier': ['格兰富中国', '通用机械', '景津环保'],
      'contact_person': ['张三', '李四', '王五'],
      'contact_phone': ['13800138000', '13900139000'],
      'unit': ['台', '套', '个', '件'],
      'cost_price': ['3200', '14500', '88000'],
      'min_price': ['3500', '15000', '90000'],
      'price': ['3200', '14500', '88000']
    };
    return samples[key] || [];
  };

  // 自动映射字段
  useEffect(() => {
    if (!autoMapped && excelHeaders.length > 0 && !loadingConfigs) {
      const autoMapping: Record<string, string> = {};

      fieldConfigs.forEach(field => {
        // 尝试精确匹配
        const exactMatch = excelHeaders.find(
          header => header.toLowerCase() === field.label.toLowerCase() ||
                   header.toLowerCase().replace(/\s/g, '') === field.label.toLowerCase().replace(/\s/g, '')
        );

        if (exactMatch) {
          autoMapping[field.key] = exactMatch;
          return;
        }

        // 尝试包含匹配
        const containsMatch = excelHeaders.find(header =>
          header.toLowerCase().includes(field.label.toLowerCase()) ||
          field.label.toLowerCase().includes(header.toLowerCase())
        );

        if (containsMatch) {
          autoMapping[field.key] = containsMatch;
        }
      });

      setMapping(autoMapping);
      setAutoMapped(true);
    }
  }, [excelHeaders, autoMapped, fieldConfigs, loadingConfigs]);

  const handleFieldMapping = (systemField: string, excelHeader: string) => {
    setMapping(prev => ({
      ...prev,
      [systemField]: excelHeader
    }));
  };

  const handleConfirm = () => {
    // 过滤掉值为 "none" 的字段
    const filteredMapping: Record<string, string> = {};
    Object.keys(mapping).forEach(key => {
      if (mapping[key] && mapping[key] !== 'none') {
        filteredMapping[key] = mapping[key];
      }
    });

    // 验证必填字段
    const requiredFields = fieldConfigs.filter(f => f.required);
    const missingFields = requiredFields.filter(field => !filteredMapping[field.key]);

    if (missingFields.length > 0) {
      alert(`请为以下必填字段选择对应的Excel列：\n${missingFields.map(f => f.label).join('、')}`);
      return;
    }

    onConfirm(filteredMapping);
  };

  const getExcelHeaderPreview = (header: string) => {
    if (!excelData || excelData.length === 0) return '';

    const sample = excelData.find(row => row[header] && row[header] !== '');
    return sample ? sample[header] : '';
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>字段映射</CardTitle>
        <CardDescription>
          请将 Excel 表的列映射到系统字段，红色*号为必填项
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* 字段映射表格 */}
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-3 font-medium">系统字段</th>
                  <th className="text-left p-3 font-medium">Excel列名</th>
                  <th className="text-left p-3 font-medium w-48">示例数据</th>
                </tr>
              </thead>
              <tbody>
                {fieldConfigs.map((field) => (
                  <tr key={field.key} className="border-t">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <Label className={field.required ? 'text-red-500' : ''}>
                          {field.required ? '* ' : ''}
                          {field.label}
                        </Label>
                        <span className="text-xs text-muted-foreground">
                          ({field.description})
                        </span>
                      </div>
                    </td>
                    <td className="p-3">
                      <Select
                        value={mapping[field.key] || 'none'}
                        onValueChange={(value) => handleFieldMapping(field.key, value === 'none' ? '' : value)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="请选择Excel列" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">不导入</SelectItem>
                          {excelHeaders.map((header) => (
                            <SelectItem key={header} value={header}>
                              {header}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-3">
                      {mapping[field.key] && (
                        <span className="text-sm text-muted-foreground">
                          {getExcelHeaderPreview(mapping[field.key]) || '-'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 操作按钮 */}
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={onCancel}>
              取消
            </Button>
            <Button onClick={handleConfirm}>
              确认并导入
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
