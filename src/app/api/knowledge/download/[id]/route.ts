import { NextRequest, NextResponse } from 'next/server';
import { handleKnowledgeDownload } from '../route';

/**
 * 资料中心文件直接下载（#[20260827-1430]）
 *
 * GET /api/knowledge/download/:id
 *
 * 供聊天「📁 资料中心已匹配到相关文件」卡片点击直接下载（浏览器 <a download> 直链），
 * 复用 /api/knowledge/download 的鉴权 + 扣费分成 + Storage 流式返回逻辑。
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ success: false, error: '缺少文件 ID' }, { status: 400 });
    }
    return handleKnowledgeDownload(request, id);
  } catch (error: any) {
    console.error('[Knowledge Download ById API] 异常:', error);
    return NextResponse.json({ success: false, error: '下载失败' }, { status: 500 });
  }
}
