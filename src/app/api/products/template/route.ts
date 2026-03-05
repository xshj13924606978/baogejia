import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

export async function GET(request: NextRequest) {
  try {
    console.log('[Product Template] ========== 下载模板 ==========');

    // 创建模板数据
    const data = [
      ['产品名称', '型号', '类别', '品牌', '价格', '单位', '规格参数'],
      ['PAM搅拌罐本体', 'φ4000×3000', '搅拌设备', '', '8000', '套', 'φ4000×3000mm Q235B碳钢/壁厚10mm'],
      ['药剂搅拌系统', '11kW', '搅拌设备', '佳木斯', '2200', '套', '不锈钢搅拌器/功率11kW/380V'],
      ['工业离心泵', 'IS150-125-250', '泵类', '上海水泵', '15800', '台', '流量200m³/h 扬程20m'],
      ['蝶阀', 'D341X-16 DN150', '阀门', '上海阀门', '850', '个', '对夹式 铸钢 法兰连接']
    ];

    // 创建工作簿
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);

    // 设置列宽
    ws['!cols'] = [
      { wch: 20 }, // 产品名称
      { wch: 15 }, // 型号
      { wch: 12 }, // 类别
      { wch: 12 }, // 品牌
      { wch: 10 }, // 价格
      { wch: 8 },  // 单位
      { wch: 40 }  // 规格参数
    ];

    XLSX.utils.book_append_sheet(wb, ws, '产品模板');

    // 生成Excel文件
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    console.log('[Product Template] 模板生成成功，大小:', buffer.length);

    // 返回文件
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="产品导入模板.xlsx"',
        'Content-Length': buffer.length.toString()
      }
    });

  } catch (error) {
    console.error('[Product Template] 生成模板失败:', error);
    return NextResponse.json(
      { error: '生成模板失败' },
      { status: 500 }
    );
  }
}