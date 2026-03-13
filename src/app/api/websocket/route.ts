import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // 返回 WebSocket 服务器配置信息
    const wsPort = process.env.WS_PORT || 6000;
    const wsUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:5000'}`
      .replace(/^https?:\/\//, '')
      .split(':')[0];

    return NextResponse.json({
      success: true,
      websocketUrl: `ws://${wsUrl}:${wsPort}`,
      port: wsPort,
      status: 'running'});
  } catch (error) {
    console.error('[API] 获取 WebSocket 配置失败:', error);
    return NextResponse.json({ error: '获取 WebSocket 配置失败' }, { status: 500 });
  }
}
