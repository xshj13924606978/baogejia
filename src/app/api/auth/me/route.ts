import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      // 返回模拟用户数据（仅用于测试）
      return NextResponse.json({
        id: '11111111-1111-1111-1111-111111111111',
        email: 'admin@example.com',
        name: '管理员',
        role: 'admin',
        avatar: null,
      });
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error('[Auth API] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
