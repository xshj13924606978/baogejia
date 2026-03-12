import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheck } from '@/lib/permission-check';


export const GET = withPermissionCheck(
  { requiresAuth: true, permissions: ['admin.audit.view'] },
  async (request: NextRequest, user: any) => {

  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status') || 'pending';

    // 模拟审核数据，实际需要从数据库中获取
    const mockAuditItems = [
      {
        id: 1,
        type: 'product',
        title: '空调压缩机上传',
        description: '上传了格力品牌的新型空调压缩机产品信息，包含详细规格参数',
        submitter_name: '用户A',
        submitter_id: 1,
        status: status === 'all' ? 'pending' : status,
        points: 0,
        reason: '',
        created_at: new Date(Date.now() - 86400000).toISOString(),
      },
      {
        id: 2,
        type: 'document',
        title: '技术文档上传',
        description: '上传了PLC控制器技术文档，包含安装指南和使用说明',
        submitter_name: '用户B',
        submitter_id: 2,
        status: status === 'all' ? 'approved' : status,
        points: 5,
        reason: '',
        created_at: new Date(Date.now() - 172800000).toISOString(),
      },
      {
        id: 3,
        type: 'case',
        title: '项目案例上传',
        description: '上传了工业自动化项目案例，包含完整实施方案',
        submitter_name: '用户C',
        submitter_id: 3,
        status: status === 'all' ? 'rejected' : status,
        points: 0,
        reason: '内容不够详细，请补充更多技术细节',
        created_at: new Date(Date.now() - 259200000).toISOString(),
      },
      {
        id: 4,
        type: 'product',
        title: '传感器模块上传',
        description: '上传了欧姆龙品牌的传感器模块产品信息',
        submitter_name: '用户D',
        submitter_id: 4,
        status: 'pending',
        points: 0,
        reason: '',
        created_at: new Date(Date.now() - 345600000).toISOString(),
      },
    ];

    // 根据状态过滤
    let filteredItems = mockAuditItems;
    if (status !== 'all') {
      filteredItems = mockAuditItems.filter(item => item.status === status);
    });

    return NextResponse.json(filteredItems);
  } catch (error) {
    console.error('获取审核列表失败:', error);
    return NextResponse.json(
      { error: '获取审核列表失败' },
      { status: 500 }
    );
  }
