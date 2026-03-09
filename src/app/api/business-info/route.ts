import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

// 从环境变量获取数据库连接信息
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres',
});

// ============================================================================
// GET - 获取商务信息
// ============================================================================
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type') || 'all';

    let result: any = {
      success: true,
      data: {}
    };

    // 获取供应商信息
    if (type === 'all' || type === 'supplier') {
      const supplierResult = await pool.query(
        'SELECT * FROM suppliers WHERE company_name = $1 ORDER BY created_at DESC LIMIT 1',
        ['兴绿环境科技有限公司']
      );
      if (supplierResult.rows.length > 0) {
        result.data.supplier = {
          companyName: supplierResult.rows[0].company_name,
          contactPerson: supplierResult.rows[0].contact_person,
          phone: supplierResult.rows[0].phone,
          email: supplierResult.rows[0].email,
          address: supplierResult.rows[0].address,
          bankName: supplierResult.rows[0].bank_name,
          bankAccount: supplierResult.rows[0].bank_account,
          taxNumber: supplierResult.rows[0].tax_id,
        };
      }
    }

    // 获取客户信息
    if (type === 'all' || type === 'customer') {
      const customerResult = await pool.query(
        'SELECT * FROM customers ORDER BY created_at DESC LIMIT 1'
      );
      if (customerResult.rows.length > 0) {
        result.data.customer = {
          companyName: customerResult.rows[0].company_name,
          projectName: customerResult.rows[0].project_name,
          contactPerson: customerResult.rows[0].contact_person,
          phone: customerResult.rows[0].phone,
          email: customerResult.rows[0].email,
          address: customerResult.rows[0].address,
        };
      }
    }

    // 获取报价条款
    if (type === 'all' || type === 'terms') {
      const termsResult = await pool.query(
        'SELECT * FROM quote_terms WHERE is_default = true ORDER BY created_at DESC LIMIT 1'
      );
      if (termsResult.rows.length > 0) {
        result.data.terms = {
          paymentTerms: termsResult.rows[0].payment_terms,
          warrantyPeriod: termsResult.rows[0].warranty_period,
          deliveryPeriod: termsResult.rows[0].delivery_period,
          validityPeriod: termsResult.rows[0].validity_period,
          taxRate: termsResult.rows[0].tax_rate,
          shipping: termsResult.rows[0].shipping,
          installation: termsResult.rows[0].installation,
          otherFees: termsResult.rows[0].other_fees,
        };
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[business-info] 获取商务信息失败:', error);
    return NextResponse.json(
      { success: false, error: '获取商务信息失败' },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST - 保存商务信息
// ============================================================================
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, data } = body;

    if (!type || !data) {
      return NextResponse.json(
        { success: false, error: '缺少必要参数' },
        { status: 400 }
      );
    }

    // 保存供应商信息
    if (type === 'supplier') {
      const result = await pool.query(
        `UPDATE suppliers
         SET company_name = $1, contact_person = $2, phone = $3, email = $4,
             address = $5, bank_name = $6, bank_account = $7, tax_id = $8, updated_at = NOW()
         WHERE company_name = '兴绿环境科技有限公司'`,
        [
          data.companyName,
          data.contactPerson,
          data.phone,
          data.email,
          data.address,
          data.bankName,
          data.bankAccount,
          data.taxNumber,
        ]
      );

      // 如果没有更新任何行，则插入新记录
      if (result.rowCount === 0) {
        await pool.query(
          `INSERT INTO suppliers (company_name, contact_person, phone, email, address, bank_name, bank_account, tax_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            data.companyName,
            data.contactPerson,
            data.phone,
            data.email,
            data.address,
            data.bankName,
            data.bankAccount,
            data.taxNumber,
          ]
        );
      }
    }

    // 保存客户信息
    if (type === 'customer') {
      const result = await pool.query(
        `UPDATE customers
         SET company_name = $1, project_name = $2, contact_person = $3, phone = $4,
             email = $5, address = $6, updated_at = NOW()
         WHERE company_name = $1`,
        [
          data.companyName,
          data.projectName,
          data.contactPerson,
          data.phone,
          data.email,
          data.address,
        ]
      );

      // 如果没有更新任何行，则插入新记录
      if (result.rowCount === 0) {
        await pool.query(
          `INSERT INTO customers (company_name, project_name, contact_person, phone, email, address)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            data.companyName,
            data.projectName,
            data.contactPerson,
            data.phone,
            data.email,
            data.address,
          ]
        );
      }
    }

    // 保存报价条款
    if (type === 'terms') {
      const result = await pool.query(
        `UPDATE quote_terms
         SET payment_terms = $1, warranty_period = $2, delivery_period = $3, validity_period = $4,
             tax_rate = $5, shipping = $6, installation = $7, other_fees = $8, updated_at = NOW()
         WHERE is_default = true`
        .replace(/\$1/g, `'$1'`).replace(/\$2/g, `'$2'`).replace(/\$3/g, `'$3'`).replace(/\$4/g, `'$4'`),
        [
          data.payment,
          data.warranty,
          data.delivery,
          data.validity,
          data.taxRate,
          data.shipping,
          data.installation,
          data.otherFees,
        ]
      );

      // 如果没有更新任何行，则插入新记录
      if (result.rowCount === 0) {
        await pool.query(
          `INSERT INTO quote_terms (name, payment_terms, warranty_period, delivery_period, validity_period, tax_rate, shipping, installation, other_fees, is_default)
           VALUES ('标准条款', $1, $2, $3, $4, $5, $6, $7, $8, true)`,
          [
            data.payment,
            data.warranty,
            data.delivery,
            data.validity,
            data.taxRate,
            data.shipping,
            data.installation,
            data.otherFees,
          ]
        );
      }
    }

    return NextResponse.json({ success: true, message: '保存成功' });
  } catch (error) {
    console.error('[business-info] 保存商务信息失败:', error);
    return NextResponse.json(
      { success: false, error: '保存商务信息失败' },
      { status: 500 }
    );
  }
}
