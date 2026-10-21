# 支付功能实现文档

## 概述

本文档描述了"报个价"项目中实现的支付功能，包括微信支付集成（JSAPI）、支付宝支付集成、订单管理、支付成功回调等功能。

## 功能列表

### 1. 支付方式

支持以下支付方式：

- **微信支付**
  - JSAPI 支付（公众号/小程序）
  - 扫码支付（Native）
  - H5 支付

- **支付宝支付**
  - 网页支付
  - H5 支付
  - 扫码支付

- **积分支付**
  - 纯积分兑换
  - 混合支付（积分+现金）

### 2. 订单管理

**核心功能**:

- 订单创建
- 订单查询（列表/详情）
- 订单取消
- 订单状态更新
- 订单过期处理

**订单状态**:

- `pending` - 待支付
- `paid` - 已支付
- `cancelled` - 已取消
- `refunding` - 退款中
- `refunded` - 已退款
- `expired` - 已过期

### 3. 支付流程

**创建订单流程**:

1. 用户选择商品和支付方式
2. 系统创建订单（订单状态：pending）
3. 调用支付接口创建支付
4. 跳转到第三方支付页面
5. 用户完成支付
6. 支付平台回调通知
7. 更新订单状态为已支付
8. 跳转到支付结果页

**支付回调流程**:

1. 第三方支付平台发送回调通知
2. 验证签名和数据完整性
3. 更新订单和支付记录
4. 触发后续业务逻辑（增加积分、激活会员等）

### 4. 退款功能

**核心功能**:

- 退款申请
- 退款状态查询
- 退款成功处理

**退款状态**:

- `pending` - 退款中
- `success` - 退款成功
- `failed` - 退款失败
- `rejected` - 退款拒绝

## 文件结构

```
src/
├── types/
│   └── payment.ts                    # 支付相关类型定义
├── lib/
│   ├── payment-service.ts            # 支付服务层
│   └── order-service.ts              # 订单服务层
├── components/
│   ├── payment-dialog.tsx            # 支付弹窗组件
│   └── user/
│       └── points-mall.tsx           # 积分商城（已更新）
└── app/
    ├── api/
    │   ├── payment/
    │   │   ├── route.ts              # 支付API
    │   │   ├── wechat/notify/
    │   │   │   └── route.ts          # 微信支付回调
    │   │   └── alipay/notify/
    │   │       └── route.ts          # 支付宝回调
    │   └── orders/
    │       ├── route.ts              # 订单列表/创建
    │       ├── [id]/
    │       │   └── route.ts          # 订单详情/取消
    │       └── [id]/refund/
    │           └── route.ts          # 退款申请
    └── payment/
        └── result/
            └── page.tsx              # 支付结果页
```

## API 接口

### 1. 支付方式列表

**端点**: `GET /api/payment`

**响应**:

```json
{
  "success": true,
  "payment_methods": [
    {
      "value": "wechat_jsapi",
      "label": "微信支付",
      "icon": "wechat_pay",
      "desc": "使用微信支付",
      "enabled": true
    },
    ...
  ]
}
```

### 2. 创建订单

**端点**: `POST /api/orders`

**请求体**:

```json
{
  "user_id": 1,
  "type": "vip_membership",
  "item_id": 1,
  "item_name": "高级会员月卡",
  "amount": 29.9,
  "payment_method": "wechat_jsapi",
  "metadata": {
    "points_reward": 100
  }
}
```

**响应**:

```json
{
  "success": true,
  "order": {
    "id": "123456",
    "order_no": "ORD20250101120010001",
    "user_id": 1,
    "type": "vip_membership",
    "status": "pending",
    "amount": 29.9,
    "final_amount": 29.9,
    "payment_method": "wechat_jsapi",
    "payment_status": "pending",
    "created_at": "2025-01-01T12:00:00.000Z",
    ...
  }
}
```

### 3. 创建支付

**端点**: `POST /api/payment`

**请求体**:

```json
{
  "order_id": "123456",
  "payment_method": "wechat_jsapi",
  "openid": "o1234567890",
  "return_url": "https://example.com/payment/result"
}
```

**响应**:

```json
{
  "success": true,
  "payment": {
    "prepay_id": "wx_prepay_123456",
    "params": {
      "appId": "wx1234567890",
      "timeStamp": "1234567890",
      "nonceStr": "random",
      "package": "prepay_id=wx_prepay_123456",
      "signType": "RSA",
      "paySign": "signature"
    }
  }
}
```

### 4. 查询订单列表

**端点**: `GET /api/orders?user_id=1&page=1&pageSize=20&status=paid`

**响应**:

```json
{
  "success": true,
  "orders": [...],
  "total": 10
}
```

### 5. 查询订单详情

**端点**: `GET /api/orders/{id}`

**响应**:

```json
{
  "success": true,
  "order": {...}
}
```

### 6. 取消订单

**端点**: `DELETE /api/orders/{id}`

**响应**:

```json
{
  "success": true,
  "order": {...}
}
```

### 7. 申请退款

**端点**: `POST /api/orders/{id}/refund`

**请求体**:

```json
{
  "reason": "商品不符合预期"
}
```

**响应**:

```json
{
  "success": true,
  "refund": {
    "id": "123456",
    "order_id": "789",
    "refund_amount": 29.9,
    "status": "pending",
    ...
  }
}
```

### 8. 微信支付回调

**端点**: `POST /api/payment/wechat/notify`

**请求**: XML 格式

**响应**: XML 格式

```xml
<xml>
  <return_code><![CDATA[SUCCESS]]></return_code>
  <return_msg><![CDATA[OK]]></return_msg>
</xml>
```

### 9. 支付宝回调

**端点**: `POST /api/payment/alipay/notify`

**请求**: FormData 格式

**响应**: `success` 或 `fail`

## 配置说明

### 环境变量

创建 `.env.local` 文件，添加以下配置：

```env
# 基础配置
NEXT_PUBLIC_BASE_URL=https://yourdomain.com

# 微信支付配置
WECHAT_APP_ID=wx1234567890abcdef
WECHAT_MCH_ID=1234567890
WECHAT_API_KEY=your_api_key_here
WECHAT_API_V3_KEY=your_api_v3_key_here
WECHAT_CERT_PATH=/path/to/cert.pem

# 支付宝配置
ALIPAY_APP_ID=2021001234567890
ALIPAY_PRIVATE_KEY=your_private_key_here
ALIPAY_PUBLIC_KEY=your_public_key_here
ALIPAY_GATEWAY_URL=https://openapi.alipay.com/gateway.do
```

### 支付配置获取

#### 微信支付

1. 登录 [微信支付商户平台](https://pay.weixin.qq.com)
2. 获取商户号（MchID）
3. 获取 API 密钥
4. 获取商户证书（v3 版本需要）
5. 配置回调通知 URL

#### 支付宝

1. 登录 [支付宝开放平台](https://open.alipay.com)
2. 创建应用并获取 AppID
3. 生成并上传 RSA 公钥/私钥
4. 配置应用网关地址
5. 配置回调通知 URL

## 数据库表结构

生产环境需要创建以下表：

### orders 表

```sql
CREATE TABLE orders (
  id VARCHAR(64) PRIMARY KEY,
  order_no VARCHAR(32) UNIQUE NOT NULL,
  user_id INT NOT NULL,
  type VARCHAR(32) NOT NULL,
  status VARCHAR(20) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  discount_amount DECIMAL(10, 2) DEFAULT 0,
  points_used INT DEFAULT 0,
  final_amount DECIMAL(10, 2) NOT NULL,
  payment_method VARCHAR(32) NOT NULL,
  payment_status VARCHAR(20) NOT NULL,
  payment_time TIMESTAMP NULL,
  transaction_id VARCHAR(64),
  expire_time TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  metadata JSON,
  INDEX idx_user_id (user_id),
  INDEX idx_order_no (order_no),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
);
```

### payment_records 表

```sql
CREATE TABLE payment_records (
  id VARCHAR(64) PRIMARY KEY,
  order_id VARCHAR(64) NOT NULL,
  order_no VARCHAR(32) NOT NULL,
  user_id INT NOT NULL,
  payment_method VARCHAR(32) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  status VARCHAR(20) NOT NULL,
  transaction_id VARCHAR(64),
  notify_data TEXT,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  INDEX idx_order_id (order_id),
  INDEX idx_order_no (order_no),
  INDEX idx_transaction_id (transaction_id)
);
```

### refund_records 表

```sql
CREATE TABLE refund_records (
  id VARCHAR(64) PRIMARY KEY,
  order_id VARCHAR(64) NOT NULL,
  order_no VARCHAR(32) NOT NULL,
  user_id INT NOT NULL,
  refund_amount DECIMAL(10, 2) NOT NULL,
  refund_points INT DEFAULT 0,
  status VARCHAR(20) NOT NULL,
  reason TEXT,
  transaction_id VARCHAR(64),
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  INDEX idx_order_id (order_id)
);
```

## 使用示例

### 1. 创建订单

```typescript
const response = await fetch('/api/orders', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    user_id: 1,
    type: 'vip_membership',
    item_id: 1,
    item_name: '高级会员月卡',
    amount: 29.9,
    payment_method: 'wechat_jsapi',
  }),
});

const data = await response.json();
console.log('订单创建成功:', data.order);
```

### 2. 创建支付

```typescript
const response = await fetch('/api/payment', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    order_id: data.order.id,
    payment_method: 'wechat_jsapi',
    openid: 'o1234567890',
  }),
});

const paymentData = await response.json();

// 跳转到支付页面
if (paymentData.payment?.payment_url) {
  window.location.href = paymentData.payment.payment_url;
}
```

### 3. 查询订单

```typescript
const response = await fetch(`/api/orders/${orderId}`);
const data = await response.json();
console.log('订单详情:', data.order);
```

### 4. 申请退款

```typescript
const response = await fetch(`/api/orders/${orderId}/refund`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    reason: '商品不符合预期',
  }),
});

const data = await response.json();
console.log('退款申请成功:', data.refund);
```

## 注意事项

### 1. 开发环境

- 当前实现使用内存存储数据
- 支付接口返回模拟数据
- 没有真实的签名验证

### 2. 生产环境

- 必须配置真实的支付密钥和证书
- 必须实现签名验证逻辑
- 必须使用数据库持久化订单数据
- 必须配置 HTTPS

### 3. 安全注意事项

- 支付密钥不要提交到代码仓库
- 回调 URL 必须配置为 HTTPS
- 必须验证回调数据的签名
- 订单金额必须严格验证
- 防止重复支付和重复退款

### 4. 性能优化

- 添加订单表索引
- 使用 Redis 缓存热点数据
- 支付回调异步处理
- 定时清理过期订单

## 扩展功能

### 1. 支付分账

支持订单金额分账给多个商户。

### 2. 订单对账

定时与支付平台对账，确保数据一致性。

### 3. 退款审核

大额退款需要管理员审核。

### 4. 支付路由

根据用户偏好自动选择支付方式。

### 5. 积分现金混合支付

支持积分抵扣部分金额。

## 故障排查

### 1. 支付回调不成功

- 检查回调 URL 是否可访问
- 检查签名验证逻辑
- 查看服务器日志

### 2. 订单状态未更新

- 检查回调是否成功
- 检查数据库连接
- 查看订单过期时间

### 3. 支付页面无法打开

- 检查支付参数是否正确
- 检查网络连接
- 查看第三方支付平台状态

## 技术支持

如有问题，请联系开发团队或查看：

- [微信支付文档](https://pay.weixin.qq.com/wiki/doc/api/index.html)
- [支付宝文档](https://opendocs.alipay.com/open)

## 版本信息

- **实现日期**: 2026-02-19
- **Next.js**: 16.1.1
- **TypeScript**: 5.x
