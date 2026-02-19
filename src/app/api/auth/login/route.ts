import { NextRequest, NextResponse } from 'next/server';
import { POST as awardPoints } from '../../points/route';

// 模拟用户数据库
const MOCK_USERS = [
  {
    id: 1,
    username: 'admin',
    password: 'admin123',
    email: 'admin@example.com',
    phone: '13800138000',
    role: 'super_admin',
    points: 1000,
    total_points: 1000,
    status: 'active',
    company: '报个价科技有限公司',
    contact: '管理员',
    verified: true,
    last_login: null,
    created_at: '2024-01-01T00:00:00Z'
  },
  {
    id: 2,
    username: 'test',
    password: 'test123',
    email: 'test@example.com',
    phone: '13800138001',
    role: 'user',
    points: 100,
    total_points: 100,
    status: 'active',
    company: '测试公司',
    contact: '测试用户',
    verified: true,
    last_login: null,
    created_at: '2024-02-01T00:00:00Z'
  }
];

// 登录用户
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { error: '用户名和密码不能为空' },
        { status: 400 }
      );
    }

    // 使用模拟数据查询用户
    const user = MOCK_USERS.find(
      u => u.username === username && u.password === password
    );

    if (!user) {
      return NextResponse.json(
        { error: '用户名或密码错误' },
        { status: 401 }
      );
    }

    // 检查用户状态
    if (user.status !== 'active') {
      return NextResponse.json(
        { error: '账号已被禁用' },
        { status: 403 }
      );
    }

    // 更新最后登录时间（模拟）
    user.last_login = new Date().toISOString() as any;

    // 返回用户信息（不包含密码）
    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        phone: user.phone,
        role: user.role,
        points: user.points,
        total_points: user.total_points,
        company: user.company,
        contact: user.contact,
        verified: user.verified
      }
    });
  } catch (error) {
    console.error('[Auth] 登录请求失败:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}
