'use client';

/**
 * 价格表字段映射弹窗（资料贡献上传页面）
 *
 * 上传价格表（.xls/.xlsx/.csv）并解析后，展示解析出的字段列表，
 * 每个字段旁提供下拉选择框，将外部表字段名映射到系统字段，
 * 确认映射后再导入。
 *
 * 创建时间: 2026-08-19
 */

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// 系统字段默认值（key 与后台 product_field_configs 规范一致）。
// 实际使用由父组件传入 systemFields（后台字段配置驱动），仅作接口兜底。
export const CONTRIBUTOR_SYSTEM_FIELDS: { key: string; label: string; required: boolean }[] = [
  { key: 'name', label: '产品名称', required: true },
  { key: 'model', label: '规格型号', required: true },
  { key: 'parameter_description', label: '参数描述', required: true },
  { key: 'brand', label: '品牌', required: true },
  { key: 'unit', label: '单位', required: true },
  { key: 'supplier', label: '供应商', required: true },
  { key: 'contact_person', label: '联系人', required: true },
  { key: 'contact_phone', label: '联系电话', required: true },
  { key: 'cost_price', label: '成本价', required: true },
  { key: 'min_price', label: '最低售价', required: false },
  { key: 'price', label: '指导价', required: true },
  { key: 'category', label: '分类', required: false },
  { key: 'image_url', label: '产品图片', required: false },
  { key: 'stock', label: '库存', required: false },
];

// 外部表字段名同义词，用于自动匹配（key 为后台规范字段 key）
const FIELD_SYNONYMS: Record<string, string[]> = {
  name: ['产品名称', '名称', '产品名', '产品', '货品名称', '商品名称', '品名', '设备名称', '设备名', '产品型号名称', 'product_name', 'product name', 'product', 'name'],
  model: ['规格型号', '型号', '规格', '型号规格', '产品型号', '设备型号', '产品规格', 'model', 'specification', 'spec', 'type', 'spec_model'],
  brand: ['品牌', '品牌名称', '厂家', '制造商', '生产厂家', '生产商', 'brand', 'manufacturer', 'make'],
  parameter_description: ['参数描述', '参数', '技术参数', '规格参数', '产品参数', '参数说明', '描述', '产品描述', '备注', 'parameter_description', 'specifications', 'specs', 'description', 'parameters', 'params', 'param_desc'],
  price: ['价格', '单价', '指导价', '售价', '报价', '报价价格', '销售价', '市场价', '价格（元）', '价格(元)', 'price', 'list price'],
  cost_price: ['成本价', '成本', '进价', '采购价', '成本价(元)', '成本价（元）', 'cost_price', 'cost'],
  min_price: ['最低售价', '最低售价(元)', '最低售价（元）', '最低价', 'min_price'],
  supplier: ['供应商', '供应商名称', '供货商', '厂家名称', 'supplier'],
  contact_person: ['联系人', '负责人', 'contact', 'contact_person'],
  contact_phone: ['电话', '联系电话', '手机', '手机号', '手机号码', 'phone', 'tel', 'mobile', 'contact_phone'],
  unit: ['单位', '计量单位', 'unit'],
  category: ['分类', '类别', '产品分类', 'category'],
  image_url: ['图片', '产品图片', '图片链接', 'image', 'image_url'],
  stock: ['库存', '数量', 'stock'],
  // 技术文档库
  doc_title: ['文档标题', '文档名称', '标题', '技术文档名称', 'doc_title'],
  doc_type: ['文档类型', '类型', '资料类型', '文件类型', 'doc_type'],
  keywords: ['关键词', '关键字', '标签', 'keywords', 'tags'],
  // 案例库
  case_name: ['案例名称', '案例名', '项目名称', '名称', 'case_name'],
  industry: ['行业类型', '行业', '所属行业', '行业分类', 'industry'],
  case_desc: ['案例描述', '案例简介', '项目描述', '描述', 'case_desc'],
  link: ['链接', '相关链接', '网址', 'url', 'link'],
  // 标准规范库
  standard_no: ['标准编号', '标准号', '编号', 'standard_no', 'std_no'],
  standard_name: ['标准名称', '标准名', '名称', 'standard_name'],
  publisher: ['发布单位', '发布机构', '出版社', 'publisher'],
  implement_date: ['实施日期', '发布日期', '实施时间', '生效日期', 'implement_date', 'date'],
  // 图纸图片库
  drawing_name: ['图纸名称', '图名', '名称', 'drawing_name'],
  drawing_no: ['图纸编号', '图号', '编号', 'drawing_no'],
  version: ['版本', '版本号', 'version'],
  // 定额库
  quota_no: ['定额编号', '编号', 'quota_no'],
  quota_name: ['定额名称', '名称', 'quota_name'],
  unit_price: ['单价', '定额单价', '价格', 'unit_price', 'unit price'],
  // 通用文本字段
  description: ['描述', '说明', '简介', '补充说明', '备注', 'description', 'desc'],
};

interface PriceTableMappingDialogProps {
  open: boolean;
  headers: string[];
  rows: Record<string, string>[];
  onConfirm: (mapping: Record<string, string>) => void;
  onCancel: () => void;
  /** 系统字段列表（由后台字段配置驱动），默认使用 CONTRIBUTOR_SYSTEM_FIELDS */
  systemFields?: { key: string; label: string; required: boolean }[];
}

export default function PriceTableMappingDialog({
  open,
  headers,
  rows,
  onConfirm,
  onCancel,
  systemFields = CONTRIBUTOR_SYSTEM_FIELDS,
}: PriceTableMappingDialogProps) {
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  const sampleRow = useMemo(() => rows[0] || {}, [rows]);

  // #20260828-1230：计算是否所有必填字段都已映射，缺失时按钮置灰，
  // 强制映射全部必填字段后才能进入下一步，杜绝未映射字段入库。
  const canConfirm = useMemo(() => {
    const used = new Set(Object.values(mapping).filter(Boolean));
    return systemFields.every((f) => !f.required || used.has(f.key));
  }, [mapping, systemFields]);

  // 打开弹窗时：根据同义词自动匹配映射
  useEffect(() => {
    if (!open) return;

    const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '');
    const used = new Set<string>();
    const auto: Record<string, string> = {};
    // 只匹配当前类型系统字段中包含的同义词，避免映射到其他资料类型的字段
    const activeKeys = new Set(systemFields.map((f) => f.key));
    const synonymsToMatch = Object.entries(FIELD_SYNONYMS).filter(([sysKey]) => activeKeys.has(sysKey));

    for (const header of headers) {
      const h = normalize(header);
      if (!h) continue;

      let matched: string | null = null;
      // 优先精确匹配
      for (const [sysKey, synonyms] of synonymsToMatch) {
        if (used.has(sysKey)) continue;
        if (synonyms.some((s) => normalize(s) === h)) {
          matched = sysKey;
          break;
        }
      }
      // 再尝试包含匹配（外部字段常带单位或前后缀，如 "价格(元)"）
      if (!matched) {
        for (const [sysKey, synonyms] of synonymsToMatch) {
          if (used.has(sysKey)) continue;
          if (synonyms.some((s) => {
            const ns = normalize(s);
            return ns.length >= 2 && h.includes(ns);
          })) {
            matched = sysKey;
            break;
          }
        }
      }

      if (matched) {
        auto[header] = matched;
        used.add(matched);
      }
    }

    setMapping(auto);
    setError('');
  }, [open, headers]);

  const handleSelectChange = (header: string, value: string) => {
    setError('');
    setMapping((prev) => {
      const next: Record<string, string> = {};
      // 同一系统字段只能映射一次，冲突时先清空旧列
      for (const [h, k] of Object.entries(prev)) {
        if (k === value && h !== header) next[h] = '';
      }
      next[header] = value;
      return next;
    });
  };

  const handleConfirm = () => {
    const used = new Set(Object.values(mapping).filter(Boolean));
    const missing = systemFields.filter((f) => f.required && !used.has(f.key));
    if (missing.length > 0) {
      setError(`请为必填字段选择对应列：${missing.map((f) => f.label).join('、')}`);
      return;
    }

    const filtered: Record<string, string> = {};
    for (const [header, sysKey] of Object.entries(mapping)) {
      if (sysKey) filtered[header] = sysKey;
    }
    onConfirm(filtered);
  };

  return (
    // #20260828-1230-1：强制完成映射后才能进入下一步——
    // 1) 隐藏右上角关闭按钮（showCloseButton={false}）
    // 2) 阻止 Esc / 点击遮罩 / 点击外部区域关闭（preventDefault）
    // 3) onOpenChange 中忽略任何关闭意图，唯一出口是「确认映射并导入」
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) return;
      }}
    >
      <DialogContent
        className="max-h-[85vh] max-w-2xl overflow-y-auto"
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>表格字段映射</DialogTitle>
          <DialogDescription>
            已解析出 {headers.length} 列、{rows.length} 行数据。请将外部表的每一列映射到系统字段，标 * 的字段为必填。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {headers.map((header, idx) => (
            <div key={`${header}-${idx}`} className="flex items-center gap-3">
              <div className="w-28 shrink-0 truncate text-sm font-medium" title={header}>
                {header}
              </div>
              <div className="w-36 shrink-0 truncate text-xs text-muted-foreground" title={sampleRow[header]}>
                {sampleRow[header]}
              </div>
              <select
                className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                value={mapping[header] || ''}
                onChange={(e) => handleSelectChange(header, e.target.value)}
              >
                <option value="">不使用</option>
                {systemFields.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                    {f.required ? ' *' : ''}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <DialogFooter>
          {/* #20260828-1230：取消按钮移除（导入流程不允许中断）。
              "确认映射并导入"在必填字段未全部映射时置灰，强制完成映射后才能入库。 */}
          <Button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="bg-black text-white hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            确认映射并导入
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
