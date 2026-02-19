# 数据分析功能实现文档

## 概述

本文档描述了"报个价"项目中实现的数据分析功能，包括用户行为追踪、转化漏斗分析、留存分析和收入统计。

## 功能列表

### 1. 数据分析库

**文件**: `src/lib/analytics.ts`

**功能**:
- 事件追踪和记录
- 转化漏斗分析
- 留存率计算
- 收入数据统计
- 用户行为数据管理

**主要类**: `Analytics`

**主要方法**:
- `trackEvent(event)` - 记录事件
- `calculateFunnel(startDate?, endDate?)` - 计算转化漏斗
- `calculateRetention(days)` - 计算留存率
- `getRevenueData(startDate?, endDate?)` - 获取收入数据
- `getStats(startDate?, endDate?)` - 获取统计数据
- `getUserBehaviorData(userId?)` - 获取用户行为数据
- `getEvents(startDate?, endDate?, userId?)` - 获取事件列表
- `getPageViewStats(startDate?, endDate?)` - 获取页面访问统计

### 2. 事件类型

**枚举**: `EventType`

```typescript
enum EventType {
  PAGE_VIEW = 'page_view',           // 页面访问
  BUTTON_CLICK = 'button_click',     // 按钮点击
  FORM_SUBMIT = 'form_submit',       // 表单提交
  FILE_UPLOAD = 'file_upload',       // 文件上传
  QUOTE_GENERATED = 'quote_generated', // 报价生成
  SIGN_UP = 'sign_up',               // 注册
  FIRST_QUOTE = 'first_quote',       // 首次报价
  FIRST_PAYMENT = 'first_payment',   // 首次付费
  PRODUCT_SEARCH = 'product_search', // 产品搜索
  PRICE_INQUIRY = 'price_inquiry',   // 价格咨询
  INVITE_SENT = 'invite_sent',       // 邀请发送
  POINTS_EARNED = 'points_earned',   // 积分赚取
  POINTS_SPENT = 'points_spent',     // 积分消费
}
```

### 3. 转化漏斗

**枚举**: `FunnelStep`

```typescript
enum FunnelStep {
  VISIT = 'visit',       // 访问
  SIGN_UP = 'sign_up',   // 注册
  UPLOAD = 'upload',     // 上传
  QUOTE = 'quote',       // 报价
  PAYMENT = 'payment',   // 付费
}
```

**数据结构**: `FunnelData`

```typescript
interface FunnelData {
  step: FunnelStep;
  count: number;
  conversionRate: number;
  dropOffRate: number;
  averageTime?: number;
}
```

### 4. 留存分析

**数据结构**: `RetentionData`

```typescript
interface RetentionData {
  date: Date;
  day0: number;           // 当日新增
  day1: number;           // 次日留存
  day7: number;           // 7日留存
  day30: number;          // 30日留存
  retentionRate1: number; // 次日留存率
  retentionRate7: number; // 7日留存率
  retentionRate30: number;// 30日留存率
}
```

### 5. 收入统计

**数据结构**: `RevenueData`

```typescript
interface RevenueData {
  date: Date;
  revenue: number;                    // 收入
  orderCount: number;                 // 订单数
  averageOrderValue: number;         // 平均客单价
  newCustomerRevenue: number;        // 新客户收入
  returningCustomerRevenue: number;   // 老客户收入
}
```

## API 接口

### 1. 记录事件

**端点**: `POST /api/analytics/events`

**请求体**:
```json
{
  "userId": 1,
  "eventType": "page_view",
  "page": "/dashboard",
  "properties": {
    "path": "/dashboard"
  }
}
```

**响应**:
```json
{
  "success": true,
  "message": "事件记录成功"
}
```

### 2. 获取事件列表

**端点**: `GET /api/analytics/events`

**查询参数**:
- `userId` (可选) - 用户ID
- `startDate` (可选) - 开始日期
- `endDate` (可选) - 结束日期

**响应**:
```json
{
  "success": true,
  "events": [...],
  "count": 100
}
```

### 3. 获取转化漏斗

**端点**: `GET /api/analytics/funnel`

**查询参数**:
- `startDate` (可选) - 开始日期
- `endDate` (可选) - 结束日期

**响应**:
```json
{
  "success": true,
  "funnel": [
    {
      "step": "visit",
      "count": 1000,
      "conversionRate": 100,
      "dropOffRate": 0
    },
    ...
  ]
}
```

### 4. 获取留存数据

**端点**: `GET /api/analytics/retention`

**查询参数**:
- `days` (可选) - 天数，默认7
- `limit` (可选) - 限制条数，默认30

**响应**:
```json
{
  "success": true,
  "retention": [
    {
      "date": "2026-02-19",
      "day0": 10,
      "day1": 8,
      "day7": 5,
      "day30": 3,
      "retentionRate1": 80,
      "retentionRate7": 50,
      "retentionRate30": 30
    },
    ...
  ]
}
```

### 5. 获取收入数据

**端点**: `GET /api/analytics/revenue`

**查询参数**:
- `startDate` (可选) - 开始日期
- `endDate` (可选) - 结束日期

**响应**:
```json
{
  "success": true,
  "revenue": [
    {
      "date": "2026-02-19",
      "revenue": 5000,
      "orderCount": 10,
      "averageOrderValue": 500,
      "newCustomerRevenue": 2000,
      "returningCustomerRevenue": 3000
    },
    ...
  ],
  "summary": {
    "totalRevenue": 50000,
    "totalOrders": 100,
    "averageOrderValue": 500
  }
}
```

### 6. 导出数据

**端点**: `GET /api/analytics/export`

**查询参数**:
- `startDate` (可选) - 开始日期
- `endDate` (可选) - 结束日期

**响应**: CSV 文件

## React Hook

### useAnalytics Hook

**文件**: `src/hooks/useAnalytics.ts`

**使用方法**:

```typescript
import { useAnalytics } from '@/hooks/useAnalytics';

function MyComponent() {
  const {
    trackEvent,
    trackPageView,
    trackButtonClick,
    trackFormSubmit,
    trackFileUpload,
    trackQuoteGenerated,
    trackProductSearch,
    trackPriceInquiry,
    trackInviteSent,
    trackPointsEarned,
    trackPointsSpent,
  } = useAnalytics({
    userId: 1,
    autoTrackPageView: true,
  });

  const handleButtonClick = () => {
    trackButtonClick('submit-button', { action: 'submit' });
  };

  return <button onClick={handleButtonClick}>提交</button>;
}
```

**自动追踪**:
- 页面访问（当 `autoTrackPageView` 为 `true` 时）
- 路由变化
- 会话时长

## 数据分析页面

**文件**: `src/app/admin/analytics/page.tsx`

**访问路径**: `/admin/analytics`

**功能**:
- 统计卡片（总用户数、活跃用户、总收入、转化率、客单价）
- 转化漏斗可视化
- 留存率分析图表
- 收入趋势图表
- 用户行为统计
- 数据导出

**标签页**:
1. **转化漏斗** - 显示从访问到付费的转化路径
2. **留存分析** - 显示次日、7日、30日留存率
3. **收入统计** - 显示收入趋势和新老客户对比
4. **用户行为** - 显示事件类型分布和关键指标

## 使用示例

### 1. 在组件中使用行为追踪

```typescript
import { useAnalytics } from '@/hooks/useAnalytics';
import { EventType } from '@/lib/analytics';

function ProductPage() {
  const { trackButtonClick, trackProductSearch } = useAnalytics({
    userId: 1,
  });

  const handleSearch = (query: string) => {
    trackProductSearch(query, 10);
  };

  const handleAddToCart = () => {
    trackButtonClick('add-to-cart', { productId: 123 });
  };

  return (
    <div>
      <input onChange={(e) => handleSearch(e.target.value)} />
      <button onClick={handleAddToCart}>加入购物车</button>
    </div>
  );
}
```

### 2. 手动记录事件

```typescript
import { analytics, EventType } from '@/lib/analytics';

analytics.trackEvent({
  userId: 1,
  eventType: EventType.QUOTE_GENERATED,
  timestamp: new Date(),
  properties: {
    quoteId: 'QUOTE-123',
    productCount: 5,
  },
});
```

### 3. 获取分析数据

```typescript
import { analytics } from '@/lib/analytics';

// 获取转化漏斗
const funnel = analytics.calculateFunnel();

// 获取留存数据
const retention = analytics.calculateRetention(7);

// 获取收入数据
const revenue = analytics.getRevenueData();

// 获取统计数据
const stats = analytics.getStats();
```

## 图表组件

使用的图表库: `recharts`

### 转化漏斗图表

使用渐变色进度条显示每个转化步骤的转化率。

### 留存率图表

使用面积图显示留存率趋势。

### 收入统计图表

- **收入趋势**: 折线图
- **新老客户对比**: 饼图
- **订单量**: 折线图

### 用户行为图表

- **事件类型分布**: 柱状图
- **转化率对比**: 进度条

## 数据导出

### 导出为 CSV

点击页面右上角的"导出数据"按钮，即可下载 CSV 格式的分析报告。

### CSV 内容包括:
- 统计概览
- 转化漏斗数据
- 收入数据
- 留存数据

## 配置

### 环境变量

当前实现使用内存存储数据。在生产环境中，建议:

1. 使用数据库持久化事件数据
2. 使用 Redis 缓存统计数据
3. 配置数据保留策略

### 数据初始化

在开发环境中，`Analytics` 类会自动初始化模拟数据：

```typescript
if (typeof window === 'undefined' && process.env.NODE_ENV === 'development') {
  analytics.initMockData();
}
```

## 注意事项

1. **数据持久化**: 当前实现使用内存存储，重启后会丢失数据
2. **性能优化**: 大量数据时需要添加分页和缓存机制
3. **隐私保护**: 记录用户行为前需要获得用户同意
4. **数据清理**: 建议定期清理过期数据
5. **错误处理**: 需要添加完善的错误处理和重试机制

## 扩展建议

1. **数据库集成**: 集成 PostgreSQL 或 MongoDB 存储事件数据
2. **实时统计**: 使用 WebSocket 实现实时数据更新
3. **自定义报表**: 支持用户自定义报表和筛选条件
4. **异常检测**: 实现异常数据检测和告警
5. **用户分群**: 支持用户分群和精细化分析
6. **A/B 测试**: 集成 A/B 测试分析功能
7. **热力图**: 实现页面热力图分析
8. **漏斗对比**: 支持多个时间段的漏斗对比

## 版本信息

- **实现日期**: 2026-02-19
- **Next.js**: 16.1.1
- **React**: 19.2.3
- **Recharts**: 2.15.4
- **TypeScript**: 5.x

## 联系支持

如有问题或建议，请联系开发团队。
