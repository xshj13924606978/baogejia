import { NextRequest, NextResponse } from 'next/server';
import { ServerDatabaseUtils, ServerFileUtils } from '@/lib/server-utils';
import { requireAuth } from '@/lib/auth-utils';
import * as XLSX from 'xlsx';
import { safeErrorMessage } from '@/lib/error-handler';

export async function POST(request: NextRequest) {
  // 认证检查
  const auth = await requireAuth(request);
  if (auth.user === null) {
    return NextResponse.json({ error: '未授权' }, { status: auth.errorResponse?.status || 401 });
  }

  try {

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: '请上传文件' }, { status: 400 });
    }


    // 验证文件类型
    const fileExt = file.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(fileExt || '')) {
      return NextResponse.json({ error: '只支持 Excel 或 CSV 文件' }, { status: 400 });
    }

    // 读取文件内容
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // 保存临时文件（可选，用于调试）
    const tempFile = ServerFileUtils.createTempPath('import', `.${fileExt}`);
    ServerFileUtils.writeFile(tempFile, buffer);

    // 解析Excel
    let workbook;
    try {
      workbook = XLSX.read(buffer, { type: 'buffer', cellText: true });
    } catch (error) {
      console.error('[Product Batch] Excel解析失败:', error);
      return NextResponse.json({ error: 'Excel文件解析失败，请检查文件格式' }, { status: 400 });
    }

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

    if (data.length < 2) {
      return NextResponse.json({ error: '文件内容为空' }, { status: 400 });
    }

    // 识别表头
    const headers = data[0];

    // 映射字段索引
    let nameIndex = -1;
    let modelIndex = -1;
    let priceIndex = -1;
    let categoryIndex = -1;
    let brandIndex = -1;
    let unitIndex = -1;
    let specsIndex = -1;

    headers.forEach((header, index) => {
      const headerStr = String(header || '').toLowerCase();
      if (headerStr.includes('产品名称') || headerStr.includes('name')) nameIndex = index;
      if (headerStr.includes('型号') || headerStr.includes('model')) modelIndex = index;
      if (headerStr.includes('价格') || headerStr.includes('price') || headerStr.includes('单价'))
        priceIndex = index;
      if (headerStr.includes('类别') || headerStr.includes('category')) categoryIndex = index;
      if (headerStr.includes('品牌') || headerStr.includes('brand')) brandIndex = index;
      if (headerStr.includes('单位') || headerStr.includes('unit')) unitIndex = index;
      if (headerStr.includes('规格') || headerStr.includes('spec')) specsIndex = index;
    });

    // 验证必要字段
    if (nameIndex === -1) {
      return NextResponse.json(
        { error: '未找到产品名称列，请确保表头包含"产品名称"或"name"' },
        { status: 400 }
      );
    }

    if (priceIndex === -1) {
      return NextResponse.json(
        { error: '未找到价格列，请确保表头包含"价格"或"price"' },
        { status: 400 }
      );
    }

    // 解析数据行
    const products = [];
    const errors = [];

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length === 0) continue;

      try {
        // 提取产品名称
        const name = row[nameIndex]?.toString().trim();
        if (!name) {
          errors.push(`第 ${i + 1} 行：产品名称为空`);
          continue;
        }

        // 提取价格
        let price = 0;
        const priceStr = row[priceIndex]?.toString().trim();
        if (priceStr) {
          // 去除货币符号和逗号
          const cleanPrice = priceStr.replace(/[¥￥$,]/g, '');
          price = parseFloat(cleanPrice);
          if (isNaN(price) || price <= 0) {
            errors.push(`第 ${i + 1} 行：价格格式不正确 (${priceStr})`);
            continue;
          }
        } else {
          errors.push(`第 ${i + 1} 行：价格为空`);
          continue;
        }

        // 构建产品对象
        const product: any = {
          name: name,
          price: price,
          verified: false,
        };

        if (modelIndex !== -1 && row[modelIndex]) product.model = row[modelIndex].toString().trim();
        if (categoryIndex !== -1 && row[categoryIndex])
          product.category = row[categoryIndex].toString().trim();
        if (brandIndex !== -1 && row[brandIndex]) product.brand = row[brandIndex].toString().trim();
        if (unitIndex !== -1 && row[unitIndex]) {
          let unitStr = row[unitIndex].toString().trim();
          // 修复上标字符丢失：m3 -> m³, m2 -> m²
          unitStr = unitStr.replace(/^m3$/i, 'm³').replace(/^m2$/i, 'm²')
            .replace(/^cm3$/i, 'cm³').replace(/^cm2$/i, 'cm²')
            .replace(/^mm3$/i, 'mm³').replace(/^mm2$/i, 'mm²')
            .replace(/^KG$/i, 'kg').replace(/^KW$/i, 'kW');
          product.unit = unitStr;
        }
        if (specsIndex !== -1 && row[specsIndex])
          product.specifications = row[specsIndex].toString().trim();

        // 生成搜索关键词
        const keywords = [name, product.model || '', product.category || '', product.brand || '']
          .filter((k) => k)
          .join(' ');
        product.keywords = keywords;

        products.push(product);
      } catch (error) {
        console.error(`[Product Batch] 第 ${i + 1} 行解析失败:`, error);
        errors.push(`第 ${i + 1} 行：解析失败`);
      }
    }


    if (products.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: '没有有效数据',
          errors: errors,
        },
        { status: 400 }
      );
    }

    // 批量插入数据库
    const db = ServerDatabaseUtils.getDb();
    const { data: inserted, error } = await db.from('products').insert(products).select();

    if (error) {
      console.error('[Product Batch] 数据库插入失败:', error);
      return NextResponse.json(
        {
          success: false,
          error: '数据库插入失败',
        },
        { status: 500 }
      );
    }

    // 清理临时文件
    ServerFileUtils.deleteFile(tempFile);


    return NextResponse.json({
      success: true,
      count: inserted?.length || 0,
      errors: errors,
      message: `成功导入 ${inserted?.length || 0} 个产品${errors.length > 0 ? `，${errors.length} 条数据失败` : ''}`,
      data: inserted,
    });
  } catch (error) {
    console.error('[Product Batch] 批量导入失败:', error);
    return NextResponse.json(
      {
        error: '批量导入失败',
        message: error instanceof Error ? safeErrorMessage(error) : '未知错误',
      },
      { status: 500 }
    );
  }
}
