/**
 * 公司信息 API（#[20260827-1030]-7）
 *
 * GET  /api/company-info         → 当前用户的默认公司信息（供方信息）
 * PUT  /api/company-info         → 新增/更新公司信息
 * GET  /api/company-info/list    → 公司信息列表（可选）
 *
 * 目的：方案/报价中的供方信息一律来自数据库（company_info 表），杜绝硬编码。
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { Logger } from '@/lib/logger';
import {
  getDefaultCompany,
  listCompanies,
  upsertCompany,
  deleteCompany,
  type CompanyInfoInput,
} from '@/lib/data/company-service';
import { safeErrorMessage } from '@/lib/error-handler';

export async function GET(request: NextRequest) {
  try {
    const { user: currentUser, errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;
    const userId = currentUser.id;

    const { searchParams } = new URL(request.url);
    const list = searchParams.get('list');

    if (list === '1') {
      const companies = await listCompanies(userId);
      return NextResponse.json({ success: true, data: companies });
    }

    const company = await getDefaultCompany(userId);
    return NextResponse.json({ success: true, data: company });
  } catch (error: any) {
    Logger.error('获取公司信息失败:', error);
    return NextResponse.json(
      { success: false, error: safeErrorMessage(error, '获取公司信息失败') },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { user: currentUser, errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;
    const userId = currentUser.id;

    const body = (await request.json()) as CompanyInfoInput;
    if (!body || !body.company_name || !body.company_name.trim()) {
      return NextResponse.json(
        { success: false, error: '公司名称不能为空' },
        { status: 400 }
      );
    }

    const company = await upsertCompany(userId, body);
    if (!company) {
      return NextResponse.json(
        { success: false, error: '保存公司信息失败' },
        { status: 500 }
      );
    }
    return NextResponse.json({ success: true, data: company });
  } catch (error: any) {
    Logger.error('保存公司信息失败:', error);
    return NextResponse.json(
      { success: false, error: safeErrorMessage(error, '保存公司信息失败') },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { user: currentUser, errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;

    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get('id'));
    if (!id) {
      return NextResponse.json({ success: false, error: '缺少 id 参数' }, { status: 400 });
    }
    const ok = await deleteCompany(id);
    return NextResponse.json({ success: ok });
  } catch (error: any) {
    Logger.error('删除公司信息失败:', error);
    return NextResponse.json(
      { success: false, error: safeErrorMessage(error, '删除公司信息失败') },
      { status: 500 }
    );
  }
}
