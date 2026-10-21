import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { analyzeDrawing } from '@/lib/openclaw-cnc';
import { safeErrorMessage } from '@/lib/error-handler';

// 允许的图纸/模型文件扩展名
const ALLOWED_EXTENSIONS = [
  'step', 'stp', 'stl', 'obj', 'ply', 'glb', 'gltf',
  'dxf', 'png', 'jpg', 'jpeg', 'bmp', 'webp',
];

// 文件大小限制（500MB，#20260823-1900 由 50MB 调大）
const MAX_FILE_SIZE = 500 * 1024 * 1024;

/**
 * 图纸/模型分析接口
 * 上传 STEP/STL/DXF/图片等文件，调用 OpenClaw CNC 分析并返回尺寸、体积等信息
 */
export async function POST(req: NextRequest) {
  let tempDir: string | null = null;
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: '请选择文件' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: '文件大小不能超过500MB' }, { status: 400 });
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json({ error: `不支持的文件格式: .${ext}` }, { status: 400 });
    }

    // 保存到临时目录供 Python 读取
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cnc-analyze-'));
    const filePath = path.join(tempDir, `upload.${ext}`);
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(filePath, buffer);

    const densityParam = formData.get('density') as string | null;
    const density = densityParam && !Number.isNaN(Number(densityParam))
      ? Number(densityParam)
      : undefined;

    const result = await analyzeDrawing(filePath, file.name, density);

    // 返回结果
    return NextResponse.json({
      success: result.success,
      result,
    });
  } catch (error: any) {
    console.error('[CNCAnalyze] 分析失败:', error);
    return NextResponse.json({ error: '图纸分析失败', details: safeErrorMessage(error) }, { status: 500 });
  } finally {
    // 清理临时文件
    if (tempDir) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  }
}
