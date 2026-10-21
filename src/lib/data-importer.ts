/**
 * 数据导入模块
 * 将八爪鱼 RPA 采集的数据映射到 products 表并导入数据库
 */

import { getSupabaseClient } from '@/storage/database/supabase-client';
import { validateBatch, type RawCollectionData } from './data-validator';
import { createDuplicateChecker } from './duplicate-checker';

// 字段映射：八爪鱼采集字段 → 数据库字段
const FIELD_MAPPING: Record<string, string> = {
  product_name: 'name',
  model: 'model',
  brand: 'brand',
  price: 'cost_price', // 采集价格作为进价
  supplier: 'supplier',
  contact_person: 'contact_person',
  contact_phone: 'contact_phone',
  parameter_description: 'parameter_description',
  category: 'category',
};

export interface ImportResult {
  totalRaw: number;
  validCount: number;
  invalidCount: number;
  newProducts: number;
  updatedProducts: number;
  errors: string[];
}

/**
 * 导入采集数据到 products 表
 */
export async function importCollectedData(rawDataList: RawCollectionData[]): Promise<ImportResult> {
  const supabase = getSupabaseClient();
  const errors: string[] = [];
  let newProducts = 0;
  let updatedProducts = 0;

  console.log(`[DataImporter] 开始处理 ${rawDataList.length} 条采集数据`);

  if (rawDataList.length > 0) {
    console.log('[DataImporter] 数据样本:', JSON.stringify(rawDataList[0], null, 2));
  }

  // 1. 数据清洗与验证
  const validatedList = validateBatch(rawDataList);

  console.log(
    `[DataImporter] 清洗完成: 有效 ${validatedList.length} 条, 无效 ${rawDataList.length - validatedList.length} 条`
  );

  // 2. 加载判重检查器（判重字段由后台「判重字段配置」product_field_configs.is_duplicate_check 决定）
  const duplicateChecker = await createDuplicateChecker(supabase);

  // 3. 逐条导入
  for (const product of validatedList) {
    try {
      // 检查重复（统一走后台判重配置）
      const dupCheck = await duplicateChecker.checkDuplicate(product);

      if (dupCheck.isDuplicate && dupCheck.duplicateProduct) {
        // 已存在：更新价格和供应商信息
        const existingId = dupCheck.duplicateProduct.id;
        const { error: updateError } = await supabase
          .from('products')
          .update({
            cost_price: product.cost_price,
            min_price: product.min_price,
            guide_price: product.guide_price,
            supplier: product.supplier,
            contact_person: product.contact_person,
            contact_phone: product.contact_phone,
            parameter_description: product.parameter_description,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingId);

        if (updateError) {
          errors.push(`更新产品 "${product.name}" 失败: ${updateError.message}`);
        } else {
          updatedProducts++;
        }
      } else {
        // 新产品：插入
        const { error: insertError } = await supabase.from('products').insert({
          name: product.name,
          model: product.model,
          brand: product.brand,
          category: product.category,
          cost_price: product.cost_price,
          min_price: product.min_price,
          price: product.guide_price, // 指导价存入 price 字段
          supplier: product.supplier,
          contact_person: product.contact_person,
          contact_phone: product.contact_phone,
          parameter_description: product.parameter_description,
          unit: '',
        });

        if (insertError) {
          errors.push(`插入产品 "${product.name}" 失败: ${insertError.message}`);
        } else {
          newProducts++;
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`处理产品 "${product.name}" 时发生异常: ${message}`);
    }
  }

  return {
    totalRaw: rawDataList.length,
    validCount: validatedList.length,
    invalidCount: rawDataList.length - validatedList.length,
    newProducts,
    updatedProducts,
    errors,
  };
}
