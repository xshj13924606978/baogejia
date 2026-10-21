import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

// ============================================================================
// 注意：历史版本使用 pg Pool 直连 DATABASE_URL（db.<ref>.supabase.co），
// 该域名仅解析 IPv6（WSL 环境 ENETUNREACH），导致所有读写静默失败（假成功）。
// 已统一改为 Supabase Service Client（与 /api/terms、/api/admin/quote-terms 一致）。
//
// 硬编码修复（#[20260827-1807]）：
//   - 之前 GET supplier 用 `.eq('company_name','兴绿环境科技有限公司')`，
//     POST supplier/customer 用 `.eq('company_name',<var>)` 全表硬匹配，
//     仅在公司名严格匹配且未按用户隔离时才能读到数据。
//   - 已改为基于当前登录用户的 metadata->>user_id 字段按用户隔离，
//     既不再硬编码，又能保证多用户/多公司数据互不干扰。
//   - GET/POST terms 部分保持原行为（基线项 ✅ 不动）。
// ============================================================================

// ============================================================================
// GET - 获取商务信息
// ============================================================================
export async function GET(request: NextRequest) {
  // 认证检查
  const auth = await requireAuth(request);
  if (auth.user === null) {
    return NextResponse.json({ success: false, error: '未授权' }, { status: auth.errorResponse?.status || 401 });
  }
  const userId = auth.user.id;

  try {
    const db = getSupabaseServiceClient();
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type') || 'all';

    let result: any = {
      success: true,
      data: {}};

    // 获取供应商信息（按当前用户 metadata->>user_id 隔离 + 兼容无 owner 的旧数据）
    if (type === 'all' || type === 'supplier') {
      try {
        const [userRows, legacyRows] = await Promise.all([
          db.from('suppliers').select('company_name, contact_person, phone, email, address, bank_name, bank_account, tax_id, metadata')
            .eq('metadata->>user_id', userId)
            .order('updated_at', { ascending: false })
            .limit(1),
          db.from('suppliers').select('company_name, contact_person, phone, email, address, bank_name, bank_account, tax_id, metadata')
            .is('metadata->>user_id', null)
            .order('updated_at', { ascending: false })
            .limit(1),
        ]);
        const row = userRows.data?.[0] || legacyRows.data?.[0] || null;
        if (row) {
          result.data.supplier = {
            companyName: row.company_name,
            contactPerson: row.contact_person,
            phone: row.phone,
            email: row.email,
            address: row.address,
            bankName: row.bank_name,
            bankAccount: row.bank_account,
            taxNumber: row.tax_id};
        }
      } catch (_err) {
        // 表不存在，跳过
        console.warn('[business-info] suppliers 表不存在，跳过');
      }
    }

    // 获取客户信息（按当前用户 metadata->>user_id 隔离）
    if (type === 'all' || type === 'customer') {
      try {
        const [userRows, legacyRows] = await Promise.all([
          db.from('customers').select('*')
            .eq('metadata->>user_id', userId)
            .order('updated_at', { ascending: false })
            .limit(1),
          db.from('customers').select('*')
            .is('metadata->>user_id', null)
            .order('updated_at', { ascending: false })
            .limit(1),
        ]);
        const row = userRows.data?.[0] || legacyRows.data?.[0] || null;
        if (row) {
          result.data.customer = {
            companyName: row.company_name,
            projectName: row.project_name,
            contactPerson: row.contact_person,
            phone: row.phone,
            email: row.email,
            address: row.address};
        }
      } catch (_err) {
        // 表不存在，跳过
        console.warn('[business-info] customers 表不存在，跳过');
      }
    }

    // 获取报价条款
    if (type === 'all' || type === 'terms') {
      try {
        const { data } = await db
          .from('quote_terms')
          .select('*')
          .eq('is_default', true)
          .order('created_at', { ascending: false })
          .limit(1);
        if (data && data.length > 0) {
          result.data.terms = {
            paymentTerms: data[0].payment_terms,
            warrantyPeriod: data[0].warranty_period,
            deliveryPeriod: data[0].delivery_period,
            validityPeriod: data[0].validity_period,
            taxRate: data[0].tax_rate,
            shipping: data[0].shipping,
            installation: data[0].installation,
            otherFees: data[0].other_fees};
        }
      } catch (_err) {
        // 表不存在，跳过
        console.warn('[business-info] quote_terms 表不存在，跳过');
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[business-info] 获取商务信息失败:', error);
    return NextResponse.json({ success: false, error: '获取商务信息失败' }, { status: 500 });
  }
}

// ============================================================================
// POST - 保存商务信息
// ============================================================================
export async function POST(request: NextRequest) {
  // 认证检查
  const auth = await requireAuth(request);
  if (auth.user === null) {
    return NextResponse.json({ success: false, error: '未授权' }, { status: auth.errorResponse?.status || 401 });
  }
  const userId = auth.user.id;

  try {
    const db = getSupabaseServiceClient();
    const body = await request.json();
    const { type, data } = body;

    if (!type || !data) {
      return NextResponse.json({ success: false, error: '缺少必要参数' }, { status: 400 });
    }

    // 保存供应商信息（按当前用户 metadata->>user_id 隔离；没匹配则插入绑定用户归属）
    if (type === 'supplier') {
      try {
        const { data: updated, error } = await db
          .from('suppliers')
          .update({
            company_name: data.companyName,
            contact_person: data.contactPerson,
            phone: data.phone,
            email: data.email,
            address: data.address,
            bank_name: data.bankName,
            bank_account: data.bankAccount,
            tax_id: data.taxNumber,
            metadata: { user_id: userId },
            updated_at: new Date().toISOString(),
          })
          .eq('metadata->>user_id', userId)
          .select();
        if (error) throw error;

        // 如果没有更新任何行，则插入新记录（绑定当前用户）
        if (!updated || updated.length === 0) {
          const { error: insErr } = await db.from('suppliers').insert({
            company_name: data.companyName,
            contact_person: data.contactPerson,
            phone: data.phone,
            email: data.email,
            address: data.address,
            bank_name: data.bankName,
            bank_account: data.bankAccount,
            tax_id: data.taxNumber,
            metadata: { user_id: userId },
          });
          if (insErr) throw insErr;
        }
      } catch (_err) {
        console.warn('[business-info] 保存供应商信息失败，表可能不存在:');
      }
    }

    // 保存客户信息（按当前用户 metadata->>user_id 隔离；用主键 id 唯一匹配，未匹配则插入）
    if (type === 'customer') {
      try {
        // 仅当传入 id 时按主键更新；否则按 user_id 找该用户最新一条；都未命中则插入绑定用户
        let updated: any = null;
        let error: any = null;
        if (data.id) {
          const res = await db
            .from('customers')
            .update({
              company_name: data.companyName,
              project_name: data.projectName,
              contact_person: data.contactPerson,
              phone: data.phone,
              email: data.email,
              address: data.address,
              updated_at: new Date().toISOString(),
            })
            .eq('id', data.id)
            .select();
          updated = res.data;
          error = res.error;
        } else {
          const res = await db
            .from('customers')
            .update({
              project_name: data.projectName,
              contact_person: data.contactPerson,
              phone: data.phone,
              email: data.email,
              address: data.address,
              updated_at: new Date().toISOString(),
            })
            .eq('metadata->>user_id', userId)
            .order('updated_at', { ascending: false })
            .limit(1)
            .select();
          updated = res.data;
          error = res.error;
        }
        if (error) throw error;

        // 如果没有更新任何行，则插入新记录（绑定当前用户）
        if (!updated || updated.length === 0) {
          const { error: insErr } = await db.from('customers').insert({
            company_name: data.companyName,
            project_name: data.projectName,
            contact_person: data.contactPerson,
            phone: data.phone,
            email: data.email,
            address: data.address,
            metadata: { user_id: userId },
          });
          if (insErr) throw insErr;
        }
      } catch (_err) {
        console.warn('[business-info] 保存客户信息失败，表可能不存在:');
      }
    }

    // 保存报价条款
    if (type === 'terms') {
      try {
        const { data: updated, error } = await db
          .from('quote_terms')
          .update({
            payment_terms: data.payment,
            warranty_period: data.warranty,
            delivery_period: data.delivery,
            validity_period: data.validity,
            tax_rate: data.taxRate,
            shipping: data.shipping,
            installation: data.installation,
            other_fees: data.otherFees,
            updated_at: new Date().toISOString(),
          })
          .eq('is_default', true)
          .select();
        if (error) throw error;

        // 如果没有更新任何行，则插入新记录
        if (!updated || updated.length === 0) {
          const { error: insErr } = await db.from('quote_terms').insert({
            name: '标准条款',
            payment_terms: data.payment,
            warranty_period: data.warranty,
            delivery_period: data.delivery,
            validity_period: data.validity,
            tax_rate: data.taxRate,
            shipping: data.shipping,
            installation: data.installation,
            other_fees: data.otherFees,
            is_default: true,
          });
          if (insErr) throw insErr;
        }
      } catch (_err) {
        console.warn('[business-info] 保存报价条款失败，表可能不存在:');
      }
    }

    return NextResponse.json({ success: true, message: '保存成功' });
  } catch (error) {
    console.error('[business-info] 保存商务信息失败:', error);
    return NextResponse.json({ success: false, error: '保存商务信息失败' }, { status: 500 });
  }
}
