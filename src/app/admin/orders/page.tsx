// 管理端：订单管理（#202608292700-阶段四：统一订单）

import { OrderManagement } from '@/components/admin/orders/OrderManagement';

export default function AdminOrdersPage() {
  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold">订单管理</h1>
        <p className="text-sm text-gray-500">统一订单（充值 / 商城 / 会员 / Token / 品牌）</p>
      </div>
      <OrderManagement />
    </div>
  );
}
