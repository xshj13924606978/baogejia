# Coze 内置工具集成配置指南

## 📋 概述

《报个价》应用已预留好Coze内置工具的集成配置，包括：
- ✅ **联网搜索** - 实时查询产品市场价格
- ✅ **向量大模型** - 语义化搜索产品库
- ✅ **生图大模型** - 生成产品展示图

## 🔑 快速启用（3步）

### 第1步：获取Coze API Key

1. 访问 [Coze开放平台](https://www.coze.cn/open/oauth/apps)
2. 登录或注册账号
3. 创建应用并获取以下信息：
   - API Key
   - Bot ID
   - Workspace ID

### 第2步：配置环境变量

编辑 `.env.local` 文件，填入您的Coze凭证：

```env
# 替换以下占位符
COZE_API_KEY=your_actual_api_key_here
COZE_BOT_ID=your_actual_bot_id_here
COZE_WORKSPACE_ID=your_actual_workspace_id_here

# 启用功能（设置为 true）
ENABLE_COZE_TOOLS=true
ENABLE_COZE_WEB_SEARCH=true
ENABLE_COZE_EMBEDDING=true
ENABLE_COZE_IMAGE_GENERATION=true
```

### 第3步：重启应用

```bash
# 重启开发服务器
pnpm dev
```

## 📊 功能详情

### 1. 联网搜索（Web Search）

**功能**：实时查询产品市场价格和供应商信息

**API调用示例**：
```typescript
// 搜索单个产品价格
const response = await fetch('/api/coze', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'search-market-price',
    productName: '污水处理设备',
  }),
});

// 批量搜索多个产品价格
const response = await fetch('/api/coze', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'search-market-price',
    productNames: ['污水处理设备', '水泵', '管道'],
  }),
});
```

**返回数据**：
```json
{
  "success": true,
  "data": {
    "productName": "污水处理设备",
    "averagePrice": 50000,
    "priceRange": {
      "min": 30000,
      "max": 80000
    },
    "suppliers": ["XX环保设备有限公司", "YY水处理厂"],
    "lastUpdated": "2026-03-08T06:55:00.000Z",
    "source": "web_search"
  }
}
```

**应用场景**：
- 在报价生成时自动查询市场价格
- 对比当前报价与市场均价
- 提供价格调整建议

---

### 2. 向量大模型（Embedding）

**功能**：语义化搜索相似产品，智能推荐

**API调用示例**：
```typescript
const response = await fetch('/api/coze', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'search-similar-products',
    query: '工业用不锈钢水泵',
    products: [
      {
        id: '1',
        name: '不锈钢立式泵',
        price: 3500,
        specs: '流量100m³/h，扬程20m'
      },
      // ... 更多产品
    ],
  }),
});
```

**返回数据**：
```json
{
  "success": true,
  "data": [
    {
      "productId": "1",
      "productName": "不锈钢立式泵",
      "similarity": 0.85,
      "price": 3500,
      "specs": "流量100m³/h，扬程20m"
    }
  ]
}
```

**应用场景**：
- 当用户描述需求时，推荐相似产品
- 产品库智能搜索
- 替代产品推荐

---

### 3. 生图大模型（Image Generation）

**功能**：生成产品展示图和报价单封面

**API调用示例**：
```typescript
// 生成产品图
const response = await fetch('/api/coze', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'generate-product-image',
    productName: '污水处理设备',
    specs: '日处理量100吨',
  }),
});

// 生成报价单封面
const response = await fetch('/api/coze', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'generate-product-image',
    type: 'quote-cover',
    productName: 'XX环保公司',
    theme: 'professional',
  }),
});
```

**返回数据**：
```json
{
  "success": true,
  "data": {
    "imageUrl": "https://generated-image-url...",
    "productName": "污水处理设备",
    "prompt": "专业的污水处理设备产品摄影图，...",
    "createdAt": "2026-03-08T06:55:00.000Z"
  }
}
```

**应用场景**：
- 自动生成产品展示图
- 创建报价单封面
- 提升报价单视觉效果

---

### 4. 智能报价增强（综合功能）

**功能**：一键增强报价单（市场价格 + 相似产品 + 产品图）

**API调用示例**：
```typescript
const response = await fetch('/api/coze', {
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
      enableProductImages: false, // 生图可能较慢，可选择性启用
      productDatabase: [], // 产品库（用于相似产品搜索）
    },
  }),
});
```

**返回数据**：
```json
{
  "success": true,
  "data": {
    "products": [
      {
        "id": "1",
        "name": "污水处理设备",
        "quantity": 2,
        "unit": "台",
        "price": 50000,
        "total": 100000,
        "specs": "日处理量100吨",
        "marketPrice": {
          "productName": "污水处理设备",
          "averagePrice": 55000,
          "priceRange": { "min": 40000, "max": 70000 }
        },
        "priceAdjustment": {
          "type": "increase",
          "reason": "当前价格比市场均价低 9.1%",
          "suggestedPrice": 55000
        },
        "similarProducts": []
      }
    ],
    "summary": {
      "totalProducts": 1,
      "productsWithMarketPrice": 1,
      "productsWithSimilarProducts": 0,
      "productsWithImages": 0,
      "totalValue": 100000,
      "marketTotalValue": 110000,
      "priceDifference": -10000,
      "priceDifferencePercent": -9.09
    },
    "usedTools": {
      "webSearch": true,
      "embedding": false,
      "imageGeneration": false
    }
  }
}
```

---

## 🧪 测试工具状态

在配置前，可以先测试工具状态：

```bash
# 测试Coze工具状态
curl http://localhost:5000/api/coze
```

**未配置时的响应**：
```json
{
  "success": true,
  "data": {
    "enabled": false,
    "webSearch": false,
    "embedding": false,
    "imageGeneration": false,
    "message": "Coze工具未启用，请在 .env.local 中配置 COZE_API_KEY 并设置 ENABLE_COZE_TOOLS=true",
    "configuration": {
      "hasApiKey": false,
      "webSearchEnabled": false,
      "embeddingEnabled": false,
      "imageGenerationEnabled": false
    }
  }
}
```

**配置成功后的响应**：
```json
{
  "success": true,
  "data": {
    "enabled": true,
    "webSearch": true,
    "embedding": true,
    "imageGeneration": true,
    "message": "Coze工具已启用",
    "configuration": {
      "hasApiKey": true,
      "webSearchEnabled": true,
      "embeddingEnabled": true,
      "imageGenerationEnabled": true
    }
  }
}
```

---

## 📝 使用建议

### 性能优化

1. **市场价格查询**
   - 使用缓存机制，避免重复查询
   - 批量查询时设置合理的延迟（1秒）
   - 定期更新市场价格缓存

2. **向量搜索**
   - 为产品库预先生成向量并存储
   - 使用相似度阈值过滤低匹配结果
   - 降级到文本匹配（当向量不可用时）

3. **图片生成**
   - 生成耗时较长（2-5秒），建议异步处理
   - 生成的图片可缓存到对象存储
   - 按需生成，避免浪费额度

### 成本控制

Coze工具可能产生费用，建议：
- 开发阶段：谨慎使用，优先测试核心功能
- 生产环境：设置调用频率限制
- 监控用量：定期检查API调用统计

### 错误处理

所有工具都包含错误处理：
- API Key未配置：返回友好提示
- 网络错误：自动降级到基础功能
- 超时处理：设置合理的超时时间

---

## 🔧 故障排查

### 问题1：工具状态显示未启用

**原因**：未配置API Key或未启用功能开关

**解决**：
1. 检查 `.env.local` 中的 `COZE_API_KEY` 是否正确
2. 确认 `ENABLE_COZE_TOOLS=true`
3. 重启应用

### 问题2：搜索无结果

**原因**：搜索词过于具体或网络问题

**解决**：
1. 使用更通用的搜索词
2. 检查网络连接
3. 查看控制台日志

### 问题3：图片生成失败

**原因**：API调用次数超限或内容违规

**解决**：
1. 检查Coze平台的使用配额
2. 简化提示词，避免敏感内容
3. 稍后重试

---

## 📚 相关文件

- **服务实现**：`src/lib/coze-tools.ts`
- **报价增强器**：`src/lib/quote-enhancer.ts`
- **API接口**：`src/app/api/coze/route.ts`
- **环境配置**：`.env.local`

---

## 🎯 下一步

配置完成后，您可以：

1. **在聊天界面中使用**：让AI自动查询市场价格
2. **在报价生成时使用**：自动增强报价单
3. **创建自定义功能**：根据业务需求扩展

需要帮助？查看代码注释或联系开发团队。🚀
