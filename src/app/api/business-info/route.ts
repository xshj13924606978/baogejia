import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 获取商务信息API
 * 统一获取供应方、客户、商务条款信息，用于生成报价和方案
 */
export async function GET(request: NextRequest) {
  try {
    const db = getSupabaseClient();
    const searchParams = request.nextUrl.searchParams;
    
    // 获取参数
    const type = searchParams.get('type'); // 'supplier', 'customer', 'terms', 或 'all'
    const customerId = searchParams.get('customerId');
    const useDefaultTerms = searchParams.get('useDefaultTerms') === 'true';

    console.log('[Business Info API] 获取商务信息:', { type, customerId, useDefaultTerms });

    let result: any = {};

    // 1. 获取供应方信息
    if (type === 'all' || type === 'supplier') {
      const { data: supplierData, error: supplierError } = await db
        .from('suppliers')
        .select('*')
        .limit(1)
        .single();

      if (supplierError && supplierError.code !== 'PGRST116') {
        console.error('[Business Info API] 获取供应方信息失败:', supplierError);
      }

      if (supplierData) {
        // 转换为camelCase
        result.supplier = {
          id: supplierData.id,
          companyName: supplierData.company_name,
          contactPerson: supplierData.contact_person,
          phone: supplierData.phone,
          email: supplierData.email,
          address: supplierData.address,
          website: supplierData.website,
          bankName: supplierData.bank_name,
          bankAccount: supplierData.bank_account,
          taxId: supplierData.tax_id,
          logo: supplierData.logo,
        };
      } else {
        // 返回默认供应方信息
        result.supplier = {
          companyName: '环保设备有限公司',
          contactPerson: '张经理',
          phone: '400-888-8888',
          email: 'contact@example.com',
          address: '上海市浦东新区张江高科技园区',
          website: 'www.example.com',
          bankName: '中国银行',
          bankAccount: '1234567890123456',
          taxId: '310115XXXXXXXXXXXX',
        };
      }
    }

    // 2. 获取客户信息
    if (type === 'all' || type === 'customer') {
      if (customerId) {
        // 获取指定客户
        const { data: customerData, error: customerError } = await db
          .from('customers')
          .select('*')
          .eq('id', customerId)
          .single();

        if (customerError) {
          console.error('[Business Info API] 获取客户信息失败:', customerError);
        }

        if (customerData) {
          result.customer = {
            id: customerData.id,
            companyName: customerData.company_name,
            projectName: customerData.project_name,
            contactPerson: customerData.contact_person,
            phone: customerData.phone,
            email: customerData.email,
            address: customerData.address,
          };
        }
      } else {
        // 获取最近添加的客户
        const { data: customersData, error: customersError } = await db
          .from('customers')
          .select('*')
          .order('updated_at', { ascending: false })
          .limit(1);

        if (customersError) {
          console.error('[Business Info API] 获取客户列表失败:', customersError);
        }

        if (customersData && customersData.length > 0) {
          const customer = customersData[0];
          result.customer = {
            id: customer.id,
            companyName: customer.company_name,
            projectName: customer.project_name,
            contactPerson: customer.contact_person,
            phone: customer.phone,
            email: customer.email,
            address: customer.address,
          };
        } else {
          // 返回默认客户信息
          result.customer = {
            companyName: 'XX工程项目部',
            projectName: '污水处理设备采购项目',
            contactPerson: '李工',
            phone: '13912345678',
            email: 'ligong@example.com',
            address: '江苏省苏州市工业园区',
          };
        }
      }
    }

    // 3. 获取商务条款
    if (type === 'all' || type === 'terms') {
      if (useDefaultTerms) {
        // 获取默认条款
        const { data: termsData, error: termsError } = await db
          .from('quote_terms')
          .select('*')
          .eq('is_default', true)
          .single();

        if (termsError && termsError.code !== 'PGRST116') {
          console.error('[Business Info API] 获取默认条款失败:', termsError);
        }

        if (termsData) {
          result.terms = {
            id: termsData.id,
            name: termsData.name,
            paymentTerms: termsData.payment_terms,
            warrantyPeriod: termsData.warranty_period,
            deliveryPeriod: termsData.delivery_period,
            validityPeriod: termsData.validity_period,
            remarks: termsData.remarks,
            isDefault: termsData.is_default,
          };
        } else {
          // 返回默认条款
          result.terms = {
            name: '标准条款',
            paymentTerms: '合同签订后预付30%，发货前支付65%，验收合格后支付5%',
            warrantyPeriod: '12个月',
            deliveryPeriod: '15-20个工作日',
            validityPeriod: '30天',
            remarks: '',
          };
        }
      } else {
        // 获取最近添加的条款
        const { data: termsList, error: termsError } = await db
          .from('quote_terms')
          .select('*')
          .order('updated_at', { ascending: false })
          .limit(1);

        if (termsError) {
          console.error('[Business Info API] 获取条款列表失败:', termsError);
        }

        if (termsList && termsList.length > 0) {
          const terms = termsList[0];
          result.terms = {
            id: terms.id,
            name: terms.name,
            paymentTerms: terms.payment_terms,
            warrantyPeriod: terms.warranty_period,
            deliveryPeriod: terms.delivery_period,
            validityPeriod: terms.validity_period,
            remarks: terms.remarks,
            isDefault: terms.is_default,
          };
        } else {
          // 返回默认条款
          result.terms = {
            name: '标准条款',
            paymentTerms: '合同签订后预付30%，发货前支付65%，验收合格后支付5%',
            warrantyPeriod: '12个月',
            deliveryPeriod: '15-20个工作日',
            validityPeriod: '30天',
            remarks: '',
          };
        }
      }
    }

    console.log('[Business Info API] 商务信息获取成功');
    
    return NextResponse.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Business Info API] 获取商务信息失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: '获取商务信息失败',
        message: error instanceof Error ? error.message : '未知错误'
      },
      { status: 500 }
    );
  }
}
