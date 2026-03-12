import { PriceMatcher } from './src/lib/price-matching';
import { userLevelService } from './src/lib/user-level-service';
import { getSupabaseClient } from './src/storage/database/supabase-client';

async function testLevelBasedFiltering() {
  console.log('========== 开始测试等级权限过滤功能 ==========\n');

  const supabase = getSupabaseClient();

  // 测试用户ID
  const testUserId = '2';
  const productId = 106;

  try {
    // 1. 获取用户等级信息
    console.log('1. 获取用户等级信息...');
    const levelInfo = await userLevelService.getUserLevel(testUserId);
    console.log('用户等级:', JSON.stringify(levelInfo, null, 2));

    // 2. 获取产品信息
    console.log('\n2. 获取产品信息...');
    const { data: product } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .single();

    if (!product) {
      console.error('产品不存在');
      return;
    }

    console.log('原始产品信息（包含所有字段）:');
    console.log({
      id: product.id,
      name: product.name,
      model: product.model,
      brand: product.brand,
      display_price: product.display_price,
      cost_price: product.cost_price,
      min_price: product.min_price,
      manufacturer: product.manufacturer,
      contact: product.contact,
      phone: product.phone
    });

    // 3. 测试等级 2（普通会员）的权限
    console.log('\n3. 测试等级 2（普通会员）的权限过滤...');
    console.log('等级 2 权限: can_view_cost_price=false, can_view_min_price=true');
    const result2 = await PriceMatcher.matchPrice(
      {
        name: product.name,
        model: product.model,
        category: product.category,
        brand: product.brand
      },
      testUserId
    );

    console.log('过滤后的结果:');
    console.log({
      price: result2.price,
      cost_price: result2.costPrice,
      min_price: result2.minPrice,
      manufacturer: (result2 as any).manufacturer,
      contact: (result2 as any).contact,
      phone: (result2 as any).phone,
      hasFilteredSensitiveFields: (result2 as any).hasFilteredSensitiveFields,
      filteredByLevel: (result2 as any).filteredByLevel
    });

    // 验证
    if ((result2 as any).hasFilteredSensitiveFields) {
      console.log('✅ 敏感字段已被过滤');
    } else {
      console.log('❌ 敏感字段未被过滤（可能需要修复）');
    }

    // 4. 测试等级 4（企业会员）的权限
    console.log('\n4. 测试等级 4（企业会员）的权限过滤...');
    console.log('等级 4 权限: can_view_cost_price=true, can_view_min_price=true, can_view_manufacturer=true, can_view_contact=true, can_view_phone=true');

    // 临时修改用户等级
    await userLevelService.setUserLevel(testUserId, 4);

    const result4 = await PriceMatcher.matchPrice(
      {
        name: product.name,
        model: product.model,
        category: product.category,
        brand: product.brand
      },
      testUserId
    );

    console.log('过滤后的结果:');
    console.log({
      price: result4.price,
      cost_price: result4.costPrice,
      min_price: result4.minPrice,
      manufacturer: (result4 as any).manufacturer,
      contact: (result4 as any).contact,
      phone: (result4 as any).phone,
      hasFilteredSensitiveFields: (result4 as any).hasFilteredSensitiveFields,
      filteredByLevel: (result4 as any).filteredByLevel
    });

    // 恢复用户等级
    await userLevelService.setUserLevel(testUserId, 2);

    console.log('\n========== 测试完成 ==========');

  } catch (error) {
    console.error('测试失败:', error);
  }
}

// 运行测试
testLevelBasedFiltering();
