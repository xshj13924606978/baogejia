/**
 * Coze 工具测试脚本
 * 
 * 使用方法：
 * 1. 配置 .env.local 中的 Coze API Key
 * 2. 启用工具：ENABLE_COZE_TOOLS=true
 * 3. 运行测试：node scripts/test-coze-tools.mjs
 */

const BASE_URL = 'http://localhost:5000';

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(name, passed) {
  const icon = passed ? '✅' : '❌';
  const color = passed ? 'green' : 'red';
  log(`${icon} ${name}`, color);
}

// 测试函数
async function testCozeTools() {
  log('\n========================================', 'bright');
  log('Coze 工具集成测试', 'bright');
  log('========================================\n', 'bright');

  // 测试1：检查工具状态
  log('\n📊 测试1：检查工具状态', 'blue');
  try {
    const response = await fetch(`${BASE_URL}/api/coze`);
    const data = await response.json();
    
    if (data.success && data.data) {
      log(`  总开关: ${data.data.enabled ? '✅ 已启用' : '⚪ 未启用'}`, data.data.enabled ? 'green' : 'yellow');
      log(`  联网搜索: ${data.data.webSearch ? '✅ 已启用' : '⚪ 未启用'}`, data.data.webSearch ? 'green' : 'yellow');
      log(`  向量模型: ${data.data.embedding ? '✅ 已启用' : '⚪ 未启用'}`, data.data.embedding ? 'green' : 'yellow');
      log(`  生图模型: ${data.data.imageGeneration ? '✅ 已启用' : '⚪ 未启用'}`, data.data.imageGeneration ? 'green' : 'yellow');
      log(`  API Key: ${data.data.configuration.hasApiKey ? '✅ 已配置' : '⚪ 未配置'}`, data.data.configuration.hasApiKey ? 'green' : 'red');
      
      if (!data.data.enabled) {
        log('\n  ⚠️  Coze工具未启用，请按以下步骤配置：', 'yellow');
        log('  1. 在 Coze 平台获取 API Key：https://www.coze.cn/open/oauth/apps', 'yellow');
        log('  2. 在 .env.local 中配置 COZE_API_KEY', 'yellow');
        log('  3. 设置 ENABLE_COZE_TOOLS=true', 'yellow');
        log('  4. 重启应用\n', 'yellow');
        return;
      }
      
      logTest('工具状态检查', true);
    } else {
      logTest('工具状态检查', false);
      return;
    }
  } catch (error) {
    logTest('工具状态检查', false);
    log(`  错误: ${error.message}`, 'red');
    return;
  }

  // 测试2：联网搜索
  log('\n🔍 测试2：联网搜索市场价格', 'blue');
  try {
    const response = await fetch(`${BASE_URL}/api/coze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'search-market-price',
        productName: '污水处理设备',
      }),
    });
    
    const data = await response.json();
    
    if (data.success && data.data) {
      log(`  产品名称: ${data.data.productName}`, 'green');
      log(`  平均价格: ¥${data.data.averagePrice?.toLocaleString() || '未获取'}`, 'green');
      log(`  价格范围: ¥${data.data.priceRange?.min?.toLocaleString()} - ¥${data.data.priceRange?.max?.toLocaleString()}`, 'green');
      if (data.data.suppliers && data.data.suppliers.length > 0) {
        log(`  供应商: ${data.data.suppliers.join(', ')}`, 'green');
      }
      logTest('联网搜索', true);
    } else {
      logTest('联网搜索', false);
      log(`  错误: ${data.error || '未知错误'}`, 'red');
    }
  } catch (error) {
    logTest('联网搜索', false);
    log(`  错误: ${error.message}`, 'red');
  }

  // 测试3：相似产品搜索
  log('\n🧠 测试3：相似产品搜索', 'blue');
  try {
    const response = await fetch(`${BASE_URL}/api/coze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'search-similar-products',
        query: '工业水泵',
        products: [
          { id: '1', name: '不锈钢立式泵', price: 3500, specs: '流量100m³/h' },
          { id: '2', name: '卧式离心泵', price: 2800, specs: '流量150m³/h' },
          { id: '3', name: '潜水排污泵', price: 4200, specs: '流量80m³/h' },
        ],
      }),
    });
    
    const data = await response.json();
    
    if (data.success && data.data && data.data.length > 0) {
      log(`  找到 ${data.data.length} 个相似产品:`, 'green');
      data.data.forEach((product, index) => {
        log(`    ${index + 1}. ${product.productName} (相似度: ${(product.similarity * 100).toFixed(1)}%)`, 'green');
      });
      logTest('相似产品搜索', true);
    } else {
      logTest('相似产品搜索', false);
      log(`  错误: ${data.error || '未找到相似产品'}`, 'red');
    }
  } catch (error) {
    logTest('相似产品搜索', false);
    log(`  错误: ${error.message}`, 'red');
  }

  // 测试4：智能报价增强
  log('\n⚡ 测试4：智能报价增强', 'blue');
  try {
    const response = await fetch(`${BASE_URL}/api/coze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'enhance-quote',
        products: [
          {
            id: '1',
            name: '污水处理设备',
            quantity: 2,
            unit: '台',
            price: 50000,
            total: 100000,
            specs: '日处理量100吨',
          },
        ],
        options: {
          enableMarketPrice: true,
          enableSimilarProducts: true,
          enableProductImages: false, // 生图较慢，暂时关闭
        },
      }),
    });
    
    const data = await response.json();
    
    if (data.success && data.data) {
      const { summary, usedTools } = data.data;
      
      log(`  产品数量: ${summary.totalProducts}`, 'green');
      log(`  获取到市场价格: ${summary.productsWithMarketPrice} 个`, 'green');
      log(`  找到相似产品: ${summary.productsWithSimilarProducts} 个`, 'green');
      log(`  报价总额: ¥${summary.totalValue?.toLocaleString()}`, 'green');
      
      if (summary.marketTotalValue) {
        log(`  市场均价总额: ¥${summary.marketTotalValue?.toLocaleString()}`, 'green');
        log(`  价格差异: ¥${summary.priceDifference?.toLocaleString()} (${summary.priceDifferencePercent?.toFixed(1)}%)`, 
          summary.priceDifferencePercent < 0 ? 'green' : 'yellow');
      }
      
      log(`  使用工具: ${usedTools.webSearch ? '✅ 联网搜索' : ''} ${usedTools.embedding ? '✅ 向量模型' : ''}`, 'green');
      
      // 显示价格调整建议
      const enhancedProducts = data.data.products.filter(p => p.priceAdjustment);
      if (enhancedProducts.length > 0) {
        log('\n  💡 价格调整建议:', 'yellow');
        enhancedProducts.forEach((product, index) => {
          const adj = product.priceAdjustment;
          log(`    ${index + 1}. ${product.name}: ${adj.reason}`, 'yellow');
          log(`       建议价格: ¥${adj.suggestedPrice?.toLocaleString()}`, 'yellow');
        });
      }
      
      logTest('智能报价增强', true);
    } else {
      logTest('智能报价增强', false);
      log(`  错误: ${data.error || '增强失败'}`, 'red');
    }
  } catch (error) {
    logTest('智能报价增强', false);
    log(`  错误: ${error.message}`, 'red');
  }

  // 总结
  log('\n========================================', 'bright');
  log('测试完成！', 'bright');
  log('========================================\n', 'bright');
}

// 运行测试
testCozeTools().catch(error => {
  log(`\n❌ 测试执行失败: ${error.message}`, 'red');
  process.exit(1);
});
