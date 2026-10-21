// 管理端：交易配置中心（#202608292700-阶段四：统一订单）

import { TradeConfigPanel } from '@/components/admin/trade-config/TradeConfigPanel';

export default function AdminTradeConfigPage() {
  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold">交易配置</h1>
        <p className="text-sm text-gray-500">统一管理支付 / 积分 / 会员 / Token / 品牌等交易配置，修改后实时生效</p>
      </div>
      <TradeConfigPanel />
    </div>
  );
}
