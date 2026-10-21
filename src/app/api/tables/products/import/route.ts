import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getSupabaseClient, getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { createDuplicateChecker, DuplicateChecker } from '@/lib/duplicate-checker';
import { matchCategory } from '@/lib/category-matcher';
import { resolveAuthContext } from '@/lib/knowledge/api-utils';
import { submitProductUpdateRequest } from '@/lib/contributor/service';
import { getProductRequiredFieldKeys } from '@/lib/product-field-merge';
import { SENSITIVE_PRODUCT_FIELDS } from '@/lib/product-visibility';
import { getCurrentUser } from '@/lib/auth-utils';
import { safeErrorMessage } from '@/lib/error-handler';

// 单位标准化：修复 XLSX 解析可能导致的上标字符丢失问题
function normalizeUnit(unit: any): string {
  if (!unit || typeof unit !== 'string') return String(unit || '');
  let normalized = unit.trim();
  // 修复 XLSX 解析时 m³ 上标 ³ 被丢失为 3 或被截断为 m 的问题
  // Excel 中 m³ 可能有多种存储形式
  normalized = normalized.replace(/^m3$/i, 'm³');
  normalized = normalized.replace(/^m2$/i, 'm²');
  normalized = normalized.replace(/^m1$/i, 'm');
  normalized = normalized.replace(/^cm3$/i, 'cm³');
  normalized = normalized.replace(/^cm2$/i, 'cm²');
  normalized = normalized.replace(/^mm3$/i, 'mm³');
  normalized = normalized.replace(/^mm2$/i, 'mm²');
  normalized = normalized.replace(/^km3$/i, 'km³');
  normalized = normalized.replace(/^km2$/i, 'km²');
  normalized = normalized.replace(/^L$/i, 'L');
  normalized = normalized.replace(/^KG$/i, 'kg');
  normalized = normalized.replace(/^KW$/i, 'kW');
  return normalized;
}

// 字段映射：从系统字段名映射到数据库字段名
// 统一产品字段规范（13个标准字段）
const FIELD_TO_DB_MAP: Record<string, string> = {
  // 标准字段
  category: 'category',
  name: 'name',
  model: 'model',
  parameter_description: 'parameter_description',
  brand: 'brand',
  unit: 'unit',
  supplier: 'supplier',
  contact_person: 'contact_person',
  contact_phone: 'contact_phone',
  cost_price: 'cost_price',
  min_price: 'min_price',
  price: 'price',
  image_url: 'image_url',
  // 兼容旧字段名
  product_name: 'name',
  specifications: 'parameter_description',
  // 系统字段
  stock: 'stock',
};

// 导入产品
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let dryRun = false;
  // #[20260824-2120] 提升到函数顶部供外层 catch 块复用，避免块级作用域遮蔽
  let currentUserId: string | null = null;
  let effectiveRole: string | null = null;
  // #[20260824-2140] 真实用户名（来自数据库 users.name / email，零硬编码），用于产品修改审批"请求人"字段
  let requesterName: string | null = null;

  try {
    const body = await request.json();
    const { products: productData, fieldMapping } = body;
    // 覆盖模式：'skip'（跳过重复）| 'overwrite'（重复项提交覆盖审批请求）
    const mode = body.mode === 'overwrite' ? 'overwrite' : 'skip';
    const reason = typeof body.reason === 'string' ? body.reason : '';
    // 同一批次导入的覆盖请求使用相同 source_id，便于管理端按批次汇总审批（#[20260822-1000]-1）
    // #[20260824-2200] 缺失时后端自动生成本次 POST 的批次 UUID（一次 POST 内所有覆盖请求共享），保证按 source_id 汇总展示
    const sourceId = typeof body.sourceId === 'string' && body.sourceId
      ? body.sourceId
      : randomUUID();
    dryRun = body.dryRun === true;

    // #[20260824-2120] 复用 service_role 客户端写 import_logs（绕过该表 RLS，与 GET 端点保持一致）
    const svcDb = getSupabaseServiceClient();

    // 获取当前登录用户，用于记录 creator_id（未登录不允许导入）
    try {
      const ctx = await resolveAuthContext(request);
      currentUserId = ctx.isAuthenticated ? ctx.currentUserId : null;
      effectiveRole = ctx.effectiveRole;
    } catch { /* ignore */ }
    if (!currentUserId) {
      return NextResponse.json({ success: false, error: '请先登录' }, { status: 401 });
    }
    // #[20260824-2140] 复用 getCurrentUser 拿真实用户名（数据库 users.name → email 兜底，零硬编码零虚假数据）
    try {
      const currentUser = await getCurrentUser(request);
      requesterName = currentUser?.name || currentUser?.email || null;
    } catch { /* ignore */ }
    // 非管理员导入时丢弃敏感字段（厂家/联系人/电话/进价/最低售价）
    const canWriteSensitive = effectiveRole === 'admin' || effectiveRole === 'super_admin';

    if (!Array.isArray(productData)) {
      console.error('[Import API] ❌ 产品数据格式不正确，必须是数组');
      return NextResponse.json(
        { success: false, error: '产品数据格式不正确，必须是数组' },
        { status: 400 }
      );
    }

    if (productData.length === 0) {
      console.error('[Import API] ❌ 产品数据为空');
      return NextResponse.json(
        { success: false, error: '产品数据为空' },
        { status: 400 }
      );
    }


    let successCount = 0;
    let errorCount = 0;
    let duplicateCount = 0;
    let pendingOverwriteCount = 0;
    const errors: string[] = [];
    const insertedProducts: any[] = [];
    const duplicateProducts: any[] = [];

    const db = getSupabaseClient();

    // #[20260824-2015] 必填字段来源统一走共享合并函数 getProductRequiredFieldKeys
    // （以 system_fields 为主、product_field_configs 仅在显式 true 时覆盖），
    // 与前端新增/编辑表单红 *、POST 创建校验完全一致；移除原硬编码兜底 ['product_name', 'price']（虚假数据）
    let requiredFields: string[] = [];
    try {
      requiredFields = await getProductRequiredFieldKeys(db);
    } catch (error) {
      console.error('[Import API] 获取必填字段配置失败:', error);
      // #[E1 caller closure] 必填字段元数据前置条件失败 → 导入 fail-closed，
      // 不得 required=[] 后继续跳过校验导入数据。
      return NextResponse.json(
        { success: false, error: '获取产品必填字段配置失败，导入已阻止' },
        { status: 500 },
      );
    }

    // 非管理员不可填写敏感字段（供应商/联系人/电话/成本/最低售价），必填校验需排除
    // #[20260824-2015] 敏感字段列表统一复用 SENSITIVE_PRODUCT_FIELDS（src/lib/product-visibility.ts），消除重复硬编码
    if (!canWriteSensitive) {
      const sensitiveKeys: readonly string[] = SENSITIVE_PRODUCT_FIELDS;
      requiredFields = requiredFields.filter((f) => !sensitiveKeys.includes(f));
    }

    // 初始化判重检查器
    let duplicateChecker: DuplicateChecker;
    try {
      duplicateChecker = await createDuplicateChecker(db);
      const config = duplicateChecker.getConfig();
    } catch (error) {
      console.error('[Import API] 初始化判重检查器失败，使用默认配置:', error);
      duplicateChecker = new DuplicateChecker({ fields: ['name', 'model'], matchRule: 'and' }, db);
    }

    // ═══ 第一阶段：批量处理字段映射和验证（纯逻辑，无 DB 查询） ═══
    const validProducts: { index: number; dbProduct: Record<string, any> }[] = [];

    for (let i = 0; i < productData.length; i++) {
      const item = productData[i];

      try {
        let product: Record<string, any>;

        // 如果提供了字段映射，使用映射转换数据
        if (fieldMapping && typeof fieldMapping === 'object' && Object.keys(fieldMapping).length > 0) {
          product = {};
          Object.keys(fieldMapping).forEach((systemField) => {
            const excelHeader = fieldMapping[systemField];
            if (excelHeader && item[excelHeader] !== undefined) {
              // 处理字段名映射：name -> product_name（兼容前端映射）
              if (systemField === 'name') {
                product['product_name'] = item[excelHeader];
              } else if (systemField === 'parameter_description') {
                product['specifications'] = item[excelHeader];
              } else if (systemField === 'unit') {
                product['unit'] = normalizeUnit(item[excelHeader]);
              } else {
                product[systemField] = item[excelHeader];
              }
            }
          });
        } else {
          // 使用默认映射
          product = {
            product_name: item['产品名称'] || item['product_name'] || item['name'] || '',
            model: item['规格型号'] || item['型号'] || item['model'] || '',
            brand: item['品牌'] || item['brand'] || '',
            parameter_description: item['参数描述'] || item['parameter_description'] || '',
            description: item['描述'] || item['description'] || '',
            supplier: item['供应商'] || item['supplier'] || '',
            contact_person: item['联系人'] || item['contact_person'] || '',
            contact_phone: item['联系电话'] || item['电话'] || item['contact_phone'] || '',
            unit: normalizeUnit(item['单位'] || item['unit'] || ''),
            cost_price:
              parseFloat(item['成本'] || item['成本价(元)'] || item['cost_price'] || '0') || 0,
            min_price:
              parseFloat(item['最低售价'] || item['最低售价(元)'] || item['min_price'] || '0') || 0,
            price: parseFloat(item['指导价'] || item['价格'] || item['price'] || '0') || 0,
            stock: parseInt(item['库存'] || item['stock'] || '0') || 0,
            category: item['分类'] || item['category'] || '',
            image_url: item['图片'] || item['image_url'] || '',
          };
        }


        // 验证必填字段 - 兼容 name/product_name、parameter_description/specifications 旧键
        const missingFields = requiredFields.filter(
          (field) => {
            if (field === 'product_name' || field === 'name') {
              return !product.product_name && !product.name;
            }
            if (field === 'parameter_description') {
              return !product.parameter_description && !product.specifications;
            }
            return !product[field] || product[field] === '' || product[field] === 0;
          }
        );
        if (missingFields.length > 0) {
          const errorMsg = `产品 "${product.product_name || product.name || '未知'}" 缺少必填字段: ${missingFields.join('、')}`;
          errorCount++;
          errors.push(errorMsg);
          continue;
        }

        // 验证价格
        if (product.price <= 0) {
          const errorMsg = `产品 "${product.product_name || product.name || '未知'}" 价格必须大于0`;
          errorCount++;
          errors.push(errorMsg);
          continue;
        }


        // 构造数据库记录（统一产品字段规范；非管理员不写入敏感字段）
        const dbProduct: any = {
          // 13个标准字段
          category: product.category || '',
          name: product.name || product.product_name || '',
          model: product.model || '',
          parameter_description: product.parameter_description || product.specifications || '',
          brand: product.brand || '',
          unit: normalizeUnit(product.unit || '台'),
          supplier: canWriteSensitive ? product.supplier || '' : '',
          contact_person: canWriteSensitive ? product.contact_person || '' : '',
          contact_phone: canWriteSensitive ? product.contact_phone || '' : '',
          cost_price: canWriteSensitive ? product.cost_price || 0 : 0,
          min_price: canWriteSensitive ? product.min_price || 0 : 0,
          price: product.price || 0,
          image_url: product.image_url || '',
          // 系统字段
          stock: product.stock || 0,
          // 上传者（用于权限控制：非管理员只能编辑自己的产品）
          creator_id: currentUserId,
        };

        // 移除空值字段，避免数据库约束错误
        Object.keys(dbProduct).forEach(key => {
          if (dbProduct[key] === '' || dbProduct[key] === null || dbProduct[key] === undefined) {
            delete dbProduct[key];
          }
        });


        // 智能分类匹配 - 如果没有提供分类则尝试智能匹配
        if (!dbProduct.category) {
          const matchedCategory = matchCategory(
            dbProduct.name,
            dbProduct.parameter_description || ''
          );
          if (matchedCategory) {
            dbProduct.category = matchedCategory;
          }
        }

        validProducts.push({ index: i, dbProduct });
      } catch (error) {
        const errorMsg = `处理失败: ${error instanceof Error ? safeErrorMessage(error) : '未知错误'}`;
        console.error('[Import API] ❌', errorMsg);
        errorCount++;
        errors.push(errorMsg);
      }
    }

    // ═══ 第二阶段：批量查重 + 批量插入 ═══
    // 按分批处理，每批 50 个
    const BATCH_SIZE = 50;
    for (let batchStart = 0; batchStart < validProducts.length; batchStart += BATCH_SIZE) {
      const batch = validProducts.slice(batchStart, batchStart + BATCH_SIZE);

      for (const { index, dbProduct } of batch) {
        // 使用判重检查器进行查重
        const checkResult = await duplicateChecker.checkDuplicate(dbProduct);

        // 如果已存在相同产品
        if (checkResult.isDuplicate) {
          if (mode === 'overwrite') {
            if (dryRun) {
              // 预检模式：仅统计覆盖数量，不实际提交审批
              pendingOverwriteCount++;
              duplicateProducts.push({
                existing: checkResult.duplicateProduct,
                attempted: dbProduct,
              });
            } else {
              // 覆盖模式 → 创建覆盖审批请求，不直接覆盖（#20260820-1130-2）
              const svcDb = getSupabaseServiceClient();
              const { data: existingRow } = await svcDb
                .from('products')
                .select('*')
                .eq('id', checkResult.duplicateProduct.id)
                .single();
              // 非管理员无权写敏感字段：覆盖时移除 0/空值，审批 merge 时保留现有敏感字段（#20260820-1130-5）
              // #[20260824-2015] 敏感字段列表统一复用 SENSITIVE_PRODUCT_FIELDS，消除重复硬编码
              const newData = { ...dbProduct };
              if (!canWriteSensitive) {
                for (const key of SENSITIVE_PRODUCT_FIELDS) {
                  if (newData[key] === 0 || newData[key] === '' || newData[key] === null || newData[key] === undefined) {
                    delete newData[key];
                  }
                }
              }
              const reqResult = await submitProductUpdateRequest({
                productId: checkResult.duplicateProduct.id,
                originalData: existingRow || checkResult.duplicateProduct,
                newData,
                reason: reason || `批量导入覆盖更新：${dbProduct.name || ''}`,
                requestType: 'import',
                requesterId: currentUserId,
                // #[20260824-2140] 优先用后端 auth context 真实用户名，body 兜底（兼容历史/外部调用）
                requesterName: requesterName || (typeof body.requesterName === 'string' ? body.requesterName : ''),
                sourceId: sourceId || undefined,
              });
              if (reqResult.success) {
                pendingOverwriteCount++;
              } else {
                errorCount++;
                errors.push(`覆盖申请提交失败 "${dbProduct.name || '未知'}": ${reqResult.error}`);
              }
            }
          } else {
            // 跳过模式：保留现有行为
            const duplicateMsg = DuplicateChecker.formatResult(checkResult);
            duplicateCount++;
            duplicateProducts.push({
              existing: checkResult.duplicateProduct,
              attempted: dbProduct,
            });
            errors.push(duplicateMsg);
          }
          continue;
        }

        if (dryRun) {
          // 预检模式：统计将成功导入数量，不实际写入
          successCount++;
          continue;
        }

        // 插入数据库
        const { data: insertedData, error: insertError } = await db
          .from('products')
          .insert(dbProduct)
          .select();

        if (insertError) {
          console.error('[Import API] ❌ 插入失败:', insertError);
          errorCount++;
          errors.push(`插入失败 "${dbProduct.name}": ${insertError.message}`);
        } else {
          successCount++;
          insertedProducts.push(insertedData?.[0]);
        }
      }
    }

    const duration = Date.now() - startTime;

    // 导入后验证：查询实际数据库中的产品数量
    try {
      const { data: allProducts, error: verifyError } = await db
        .from('products')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (!verifyError && allProducts) {

        // 统计本次导入的产品
        const recentProducts = allProducts.filter((p) => {
          if (p.created_at) {
            const productTime = new Date(p.created_at).getTime();
            return productTime >= startTime;
          }
          return false;
        });

        recentProducts.forEach((p) => {
        });
      }
    } catch (error) {
      console.error('[Import API] 验证查询失败:', error);
    }

    // 预检模式不记录导入日志
    if (!dryRun) {
      try {
        const duplicateConfig = duplicateChecker.getConfig();

        // #[20260824-2120] 改用 service_role 写 import_logs（绕过 RLS）+ 附加 user_id 字段
        await svcDb.from('import_logs').insert({
          user_id: currentUserId,
          file_name: body.file_name || 'unknown',
          file_type: body.file_type || 'unknown',
          total_count: productData.length,
          imported_count: successCount,
          skipped_count: duplicateCount,
          failed_count: errorCount,
          duplicate_config: duplicateConfig,
          details: {
            errors: errors.length > 0 ? errors : undefined,
            duplicateProducts: duplicateCount > 0 ? duplicateProducts : undefined,
            pendingOverwriteCount: pendingOverwriteCount > 0 ? pendingOverwriteCount : undefined,
          },
          duration_ms: duration,
          status: 'completed',
          started_at: new Date(startTime).toISOString(),
          completed_at: new Date().toISOString(),
        });

      } catch (logError) {
        console.error('[Import API] ⚠️ 记录导入日志失败:', logError);
        // 不影响主流程，仅记录错误
      }
    }

    return NextResponse.json({
      success: true,
      message: `成功导入 ${successCount} 条产品数据${duplicateCount > 0 ? `，跳过 ${duplicateCount} 条重复产品` : ''}${pendingOverwriteCount > 0 ? `，${pendingOverwriteCount} 条重复产品已提交覆盖申请，等待管理员审核` : ''}${errorCount > 0 ? `，${errorCount} 条失败` : ''}`,
      successCount,
      errorCount,
      duplicateCount,
      pendingOverwriteCount,
      errors: errors.length > 0 ? errors : undefined,
      duplicateProducts: duplicateCount > 0 ? duplicateProducts : undefined,
      insertedProducts,
    });
  } catch (error) {
    console.error('[Import API] ❌ 导入失败:', error);
    console.error('[Import API] 错误堆栈:', error instanceof Error ? error.stack : error);
    if (!dryRun) {
      try {
        // #[20260824-2120] 失败日志也用 service_role 写（与主分支一致，绕过 RLS）
        const svcDb = getSupabaseServiceClient();
        await svcDb.from('import_logs').insert({
          user_id: currentUserId,
          file_name: 'unknown',
          file_type: 'unknown',
          total_count: 0,
          imported_count: 0,
          skipped_count: 0,
          failed_count: 0,
          duplicate_config: null,
          details: {
            error: error instanceof Error ? safeErrorMessage(error) : '未知错误',
            stack: error instanceof Error ? error.stack : undefined,
          },
          duration_ms: Date.now() - startTime,
          status: 'failed',
          started_at: new Date(startTime).toISOString(),
          completed_at: new Date().toISOString(),
        });
      } catch (logError) {
        console.error('[Import API] ⚠️ 记录失败日志失败:', logError);
      }
    }

    return NextResponse.json(
      { success: false, error: '导入产品失败', details: error instanceof Error ? safeErrorMessage(error) : '未知错误' },
      { status: 500 }
    );
  }
}
