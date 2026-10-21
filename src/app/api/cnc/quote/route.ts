import { NextRequest, NextResponse } from 'next/server';
import { generateCncQuote, getPythonPath } from '@/lib/openclaw-cnc';
import { CNCQuoteRequest } from '@/lib/openclaw-cnc/types';
import { safeErrorMessage } from '@/lib/error-handler';

// 支持的表面处理选项
const SURFACE_TREATMENTS = ['无', '阳极氧化', '硬质阳极氧化', '镀锌', '镀镍', '镀铬', '喷砂', '抛光', '拉丝', '喷漆'];

/**
 * CNC 加工报价接口
 * 根据材料与尺寸参数计算 CNC 加工价格
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<CNCQuoteRequest>;

    if (!body.material) {
      return NextResponse.json({ error: '请选择材料' }, { status: 400 });
    }
    if (!body.length || !body.width || !body.height) {
      return NextResponse.json({ error: '请填写长、宽、高' }, { status: 400 });
    }
    if (!body.quantity || body.quantity <= 0) {
      return NextResponse.json({ error: '请填写有效数量' }, { status: 400 });
    }
    if (body.surfaceTreatment && !SURFACE_TREATMENTS.includes(body.surfaceTreatment)) {
      return NextResponse.json({ error: '不支持的表面处理方式' }, { status: 400 });
    }

    const result = await generateCncQuote({
      material: body.material,
      length: Number(body.length),
      width: Number(body.width),
      height: Number(body.height),
      quantity: Number(body.quantity),
      tolerance: body.tolerance,
      surfaceTreatment: body.surfaceTreatment || '无',
      complexity: body.complexity || 'medium',
    });

    return NextResponse.json({ success: result.success, result });
  } catch (error: any) {
    console.error('[CNCQuote] 报价失败:', error);
    return NextResponse.json({ error: '报价计算失败', details: safeErrorMessage(error) }, { status: 500 });
  }
}

/**
 * 健康检查：确认 Python 环境可用
 */
export async function GET() {
  const pythonPath = getPythonPath();
  return NextResponse.json({
    success: true,
    python: pythonPath,
    message: 'CNC 服务可用',
  });
}
