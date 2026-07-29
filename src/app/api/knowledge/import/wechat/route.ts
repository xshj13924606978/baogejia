import { NextRequest, NextResponse } from 'next/server';

/**
 * 微信消息导入知识库（接口框架）
 *
 * POST: 接收微信 webhook 推送的消息
 * - 验证 webhook secret
 * - 解析消息内容（文本/文件/图片）
 * - 创建 knowledge_entry
 *
 * 当前为接口框架，实际微信对接需要：
 * 1. 配置企业微信/微信机器人 webhook
 * 2. 实现消息解析逻辑
 * 3. 处理不同消息类型（文本/图片/文件/链接）
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // TODO: 验证 webhook secret
    // TODO: 解析微信消息（文本/文件/图片）
    // TODO: 下载附件到 Supabase Storage
    // TODO: 创建 knowledge_entry
    // TODO: 自动分类到对应子库

    return NextResponse.json({
      success: false,
      error: '微信导入功能尚未实现',
    }, { status: 501 });
  } catch (error) {
    console.error('[WeChat Import] 异常:', error);
    return NextResponse.json({ success: false, error: '处理失败' }, { status: 500 });
  }
}
