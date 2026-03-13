import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { ServerProcessUtils } from '@/lib/server-utils';

export async function GET() {
  try {
    const startTime = Date.now();

    // 检查数据库连接
    const supabase = getSupabaseClient();
    const { data: dbTest, error: dbError } = await supabase
      .from('products')
      .select('count', { count: 'exact', head: true });

    // 检查系统工具
    const hasPdftotext = await ServerProcessUtils.checkCommand('pdftotext');
    const hasTesseract = await ServerProcessUtils.checkCommand('tesseract');

    const endTime = Date.now();
    const responseTime = endTime - startTime;

    const status = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`,
      services: {
        database: dbError ? 'unhealthy' : 'healthy',
        storage: 'healthy', // 假设正常
      },
      tools: {
        pdftotext: hasPdftotext ? 'available' : 'missing',
        tesseract: hasTesseract ? 'available' : 'missing',
      },
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0',
    };

    // 如果任何关键服务异常，返回503
    if (dbError || (!hasPdftotext && !hasTesseract)) {
      return NextResponse.json({ ...status, status: 'degraded' }, { status: 503 });
    }

    return NextResponse.json(status, { status: 200 });
  } catch (error) {
    console.error('[Health] 健康检查失败:', error);
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : '未知错误',
      },
      { status: 500 }
    );
  }
}
