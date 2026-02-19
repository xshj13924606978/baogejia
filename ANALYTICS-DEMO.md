# 数据分析功能演示指南

## 访问入口

1. 启动项目后，访问管理后台：
   ```
   http://localhost:5000/admin/analytics
   ```

2. 需要管理员权限才能访问

## 功能演示

### 1. 统计卡片

页面顶部显示 5 个关键指标卡片：

- **总用户数** - 系统总用户数量
- **活跃用户** - 最近 7 天活跃用户数
- **总收入** - 累计收入
- **转化率** - 从访问到付费的转化率
- **客单价** - 平均订单金额

### 2. 转化漏斗

**访问路径**: 转化漏斗标签页

**展示内容**:
- 访问 → 注册 → 上传 → 报价 → 付费
- 每个步骤的数量、转化率、流失率
- 可视化进度条

**关键指标**:
- 整体转化率
- 各步骤转化率
- 流失率分析

### 3. 留存分析

**访问路径**: 留存分析标签页

**展示内容**:
- 留存率趋势图（面积图）
- 次日留存、7日留存、30日留存
- 留存率统计表格

**关键指标**:
- 次日留存率
- 7日留存率
- 30日留存率
- 留存率趋势

### 4. 收入统计

**访问路径**: 收入统计标签页

**展示内容**:
- 收入趋势图（折线图）
- 新老客户收入对比（饼图）
- 订单量趋势图

**关键指标**:
- 总收入
- 订单数
- 平均客单价
- 新客户收入
- 老客户收入

### 5. 用户行为

**访问路径**: 用户行为标签页

**展示内容**:
- 事件类型分布（柱状图）
- 关键指标卡片
- 最近事件列表

**关键指标**:
- 页面访问次数
- 按钮点击次数
- 表单提交次数
- 文件上传次数
- 报价生成次数

### 6. 数据导出

**操作**:
1. 点击页面右上角的"导出数据"按钮
2. 自动下载 CSV 格式的分析报告
3. CSV 包含统计数据、转化漏斗、收入数据、留存数据

## 行为追踪演示

### 在代码中使用

```typescript
import { useAnalytics } from '@/hooks/useAnalytics';

function MyComponent() {
  const { trackButtonClick, trackPageView } = useAnalytics({
    userId: 1,
  });

  return (
    <div>
      {/* 自动追踪页面访问 */}
      <Button onClick={() => trackButtonClick('submit')}>
        提交
      </Button>
    </div>
  );
}
```

### 追踪的事件类型

1. **页面访问** - 用户访问页面时自动记录
2. **按钮点击** - 用户点击按钮时记录
3. **表单提交** - 用户提交表单时记录
4. **文件上传** - 用户上传文件时记录
5. **报价生成** - 用户生成报价时记录
6. **产品搜索** - 用户搜索产品时记录
7. **价格咨询** - 用户咨询价格时记录
8. **积分操作** - 用户获得或消耗积分时记录

## 数据模拟

开发环境会自动初始化模拟数据：

- 100 个用户
- 最近 30 天的事件数据
- 100 个订单（收入约 5 万元）
- 模拟转化漏斗数据
- 模拟留存数据

## 图表交互

### 转化漏斗图表
- 鼠标悬停显示详细信息
- 渐变色进度条

### 留存率图表
- 鼠标悬停显示日期和留存率
- 面积图展示趋势

### 收入图表
- 鼠标悬停显示详细数据
- 可查看新老客户对比
- 订单量趋势

### 用户行为图表
- 鼠标悬停显示事件数量
- 柱状图展示事件分布

## 自定义分析

### 按用户筛选

```typescript
const userBehavior = analytics.getUserBehaviorData(userId);
```

### 按时间范围筛选

```typescript
const funnel = analytics.calculateFunnel(startDate, endDate);
const revenue = analytics.getRevenueData(startDate, endDate);
```

### 获取原始事件数据

```typescript
const events = analytics.getEvents(startDate, endDate, userId);
```

## 性能优化建议

1. **数据缓存**: 使用 Redis 缓存统计数据
2. **分页加载**: 事件列表支持分页
3. **索引优化**: 数据库添加索引
4. **异步处理**: 使用队列处理事件记录

## 扩展功能

### 自定义事件

```typescript
analytics.trackEvent({
  userId: 1,
  eventType: 'custom_event',
  properties: {
    customProperty: 'value',
  },
});
```

### 自定义漏斗

```typescript
const customFunnel = [
  'step1',
  'step2',
  'step3',
];

const result = analytics.calculateFunnel(undefined, undefined, customFunnel);
```

### A/B 测试

```typescript
// 记录 A/B 测试变体
analytics.trackEvent({
  userId: 1,
  eventType: 'ab_test',
  properties: {
    variant: 'A',
    experiment: 'button_color',
  },
});
```

## 注意事项

1. **开发环境**: 数据存储在内存中，重启后丢失
2. **生产环境**: 建议使用数据库持久化
3. **隐私保护**: 遵守隐私法规，获得用户同意
4. **性能监控**: 监控数据处理性能
5. **数据清理**: 定期清理过期数据

## 故障排查

### 数据不更新

- 检查事件是否正确记录
- 检查时间范围设置
- 检查用户筛选条件

### 图表不显示

- 检查 Recharts 是否正确安装
- 检查数据格式是否正确
- 查看浏览器控制台错误

### 导出失败

- 检查数据格式
- 检查文件权限
- 查看服务器日志

## 技术支持

如有问题，请查看：
- [README-ANALYTICS.md](./README-ANALYTICS.md) - 详细技术文档
- [README.md](./README.md) - 项目总体说明
- [GitHub Issues](https://github.com) - 提交问题
