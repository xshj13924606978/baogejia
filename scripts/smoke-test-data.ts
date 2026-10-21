/**
 * 数据层冒烟测试（#[20260827-1030]-7）
 *
 * 验证内容：
 * 1. 价格决策链路 resolvePrice：产品库/定额库无表（未迁移）时 → 规则估算兜底
 * 2. resolveEquipmentPrices：设备清单逐项富集，DB 不可用时保留规则估算并标注"待核实"
 * 3. parseOnlinePrice：从搜索文本提取价格（万元/元）
 * 4. generateProposal(rule-only)：无 AI、无 DB 时仍能输出完整方案 + 数据来源标注
 */
import { generateProposal } from '../src/lib/proposal-generator';
import {
  resolvePrice,
  resolveEquipmentPrices,
  parseOnlinePrice,
  getPricePriority,
  isOnlineSearchEnabled,
  isDataSourceTrackingEnabled,
} from '../src/lib/data/price-resolver';
import { selectAllEquipment } from '../src/lib/rules';

function ok(cond: boolean, label: string) {
  console.log(`  ${cond ? '✅' : '❌'} ${label}`);
  return cond;
}

async function main() {
  const results: boolean[] = [];

  console.log('=== 1. 价格决策链路（DB 未迁移时应兜底规则估算） ===');
  const resolved = await resolvePrice('板框压滤机', '100m²', { enableOnlineSearch: false });
  console.log(`  resolvePrice → source=${resolved.source} price=${resolved.price} detail=${resolved.sourceDetail}`);
  results.push(
    ok(
      resolved.source === 'rule_estimate' &&
        resolved.sourceDetail.includes('规则估算'),
      'DB 不可用时回落 rule_estimate 并标注来源'
    )
  );

  console.log('=== 2. 设备清单价格富集（无 DB 时保留规则估算） ===');
  const equipment = selectAllEquipment(100, '生化');
  const enriched = await resolveEquipmentPrices(equipment.items, {
    enableOnlineSearch: false,
  });
  const allEstimated = enriched.every((e) => e.priceSource === 'rule_estimate' && (e.priceDetail || '').includes('待核实'));
  const total = enriched.reduce((s, e) => s + e.unitPrice * e.quantity, 0);
  console.log(`  ${enriched.length} 项设备，富集后小计=${total.toLocaleString()} 元`);
  for (const e of enriched.slice(0, 3)) {
    console.log(`   - ${e.name} ${e.unitPrice.toLocaleString()} 元 [${e.priceSource}]`);
  }
  results.push(ok(allEstimated, '全部设备标注 rule_estimate 且含"待核实"'));
  results.push(ok(total > 0, `设备小计>0（${total.toLocaleString()}）`));

  console.log('=== 3. parseOnlinePrice 文本价格提取 ===');
  results.push(ok(parseOnlinePrice('XMY100/1000-U 厢式压滤机报价 23.5万元') === 235000, '3.5万→35000 万换算'));
  results.push(ok(parseOnlinePrice('报价：86000元/台') === 86000, '86000元/台'));
  results.push(ok(parseOnlinePrice('市场价大概6000') === null, '无单位数字不采纳（6000→null，因无元/万标识）'));

  console.log('=== 4. 配置读取 ===');
  console.log(`  PRICE_PRIORITY=${getPricePriority()} ENABLE_ONLINE_SEARCH=${isOnlineSearchEnabled()} TRACKING=${isDataSourceTrackingEnabled()}`);
  results.push(ok(['product_db_first', 'quota_first', 'mixed'].includes(getPricePriority()), 'PRICE_PRIORITY 合法'));

  console.log('=== 5. generateProposal(rule-only) 全链路 ===');
  const proposal = await generateProposal('食品废水100吨/天', { useAI: false });
  console.log(`  method=${proposal.method} 设备${proposal.equipment.items.length}项 总价=${proposal.cost.total.toLocaleString()} 元`);
  console.log(`  数据来源条目=${proposal.dataSources.length}`);
  console.log(`  公司信息=${proposal.companyInfo ? proposal.companyInfo.company_name : 'null（未配置，方案标注待补充）'}`);
  console.log(`  方案长度=${proposal.markdown.length} 字符，含"数据来源"=${proposal.markdown.includes('数据来源')}`);
  console.log(`  含"供方信息"=${proposal.markdown.includes('供方信息')}`);
  results.push(ok(proposal.success && proposal.markdown.length > 500, '完整方案生成'));
  results.push(ok(proposal.markdown.includes('数据来源'), '方案末尾附数据来源表'));
  results.push(ok(proposal.dataSources.length >= proposal.equipment.items.length, '数据来源条目覆盖全部设备'));
  results.push(
    ok(
      proposal.equipment.items.every((e) => e.priceSource === 'rule_estimate' && (e.priceDetail || '').includes('待核实')),
      '设备价格均标注"规则估算价，待核实"'
    )
  );

  console.log('========================================');
  const passed = results.filter(Boolean).length;
  console.log(`数据层冒烟测试：${passed}/${results.length} 通过`);
  process.exit(results.every(Boolean) ? 0 : 1);
}

main().catch((e) => {
  console.error('冒烟测试异常:', e);
  process.exit(1);
});
