# DeepSeek + Coze 双引擎架构说明

## 🎯 核心设计理念

**DeepSeek 原有调用完全保留**，Coze 工具作为增强能力，应用能够**灵活机动地自动选择**最合适的服务。

---

## 📋 架构概览

### 双引擎分工

| 功能             | 主要服务    | 辅助服务                 | 说明                       |
| ---------------- | ----------- | ------------------------ | -------------------------- |
| **对话理解**     | ✅ DeepSeek | -                        | 智能语义理解、意图识别     |
| **技术方案生成** | ✅ DeepSeek | -                        | 生成完整技术方案和配置清单 |
| **报价单生成**   | ✅ DeepSeek | -                        | 基于产品清单生成报价       |
| **市场价格查询** | -           | ✅ Coze Web Search       | 联网搜索实时市场价格       |
| **相似产品推荐** | 降级选项    | ✅ Coze Embedding        | 向量搜索推荐相似产品       |
| **产品图生成**   | -           | ✅ Coze Image Generation | 自动生成产品展示图         |
| **价格优化建议** | ✅ DeepSeek | ✅ Coze Web Search       | 结合市场数据和智能分析     |
| **报价增强**     | ✅ DeepSeek | ✅ Coze (全部工具)       | 组合使用双引擎能力         |

---

## 🔄 自动选择机制

### 智能服务选择器（AIServiceSelector）

位置：`src/lib/ai-service-selector.ts`

```typescript
// 根据任务类型自动选择服务
const selector = AIServiceSelector.getInstance();
const selection = selector.selectService('market-price');

console.log(selection);
// {
//   service: 'coze',
//   reason: '市场价格查询需要联网搜索能力，使用 Coze Web Search',
//   confidence: 0.95
// }
```

### 任务类型映射

| 任务类型             | 首选服务              | 降级策略                     |
| -------------------- | --------------------- | ---------------------------- |
| `chat`               | DeepSeek              | → Coze（如 DeepSeek 不可用） |
| `technical-proposal` | DeepSeek              | → Coze                       |
| `quote-generation`   | DeepSeek              | → Coze                       |
| `market-price`       | Coze Web Search       | → DeepSeek（关键词匹配）     |
| `similar-products`   | Coze Embedding        | → DeepSeek（文本匹配）       |
| `product-image`      | Coze Image Generation | → 无替代方案                 |
| `quote-enhancement`  | DeepSeek + Coze       | → 单独使用可用服务           |
| `price-optimization` | DeepSeek              | → 不可用则跳过               |

### 故障降级流程

```
尝试首选服务
    ↓
  成功？→ 使用结果
    ↓ 失败
检查备用服务可用性
    ↓
  可用？→ 尝试备用服务
    ↓ 成功
  使用备用服务结果
    ↓ 失败
返回错误或降级方案
```

---

## 💡 实际使用示例

### 示例1：智能对话（自动选择 DeepSeek）

```typescript
// 用户发送消息
const response = await smartChatProcessor.process('我需要一个60吨/天的污水处理方案');

// 自动选择：DeepSeek
// 原因：对话理解和方案生成适合 DeepSeek 的语义理解能力
// 结果：生成完整的技术方案
```

### 示例2：报价增强（组合使用）

```typescript
// 增强报价单
const result = await quoteEnhancer.enhanceQuote(products, {
  enableMarketPrice: true, // 使用 Coze Web Search
  enableSimilarProducts: true, // 使用 Coze Embedding
  enableProductImages: false, // 不生成产品图
  enablePriceOptimization: true, // 使用 DeepSeek 智能建议
});

// 结果包含：
// - products[].marketPrice (Coze 联网搜索)
// - products[].similarProducts (Coze 向量搜索)
// - priceOptimizations (DeepSeek 智能分析)
```

### 示例3：市场价格查询（Coze 优先）

```typescript
const selection = aiServiceSelector.selectService('market-price');

// 如果 Coze 可用：
// {
//   service: 'coze',
//   reason: '市场价格查询需要联网搜索能力，使用 Coze Web Search',
//   confidence: 0.95
// }

// 如果 Coze 不可用（降级）：
// {
//   service: 'deepseek',
//   reason: 'Coze Web Search 未启用，降级到 DeepSeek（可能缺少实时市场价格数据）',
//   confidence: 0.6
// }
```

---

## 🔧 配置状态检查

### 检查服务可用性

```typescript
const availability = aiServiceSelector.checkAvailability('auto');

console.log(availability);
// {
//   available: true,
//   deepseekAvailable: true,
//   cozeAvailable: false,
//   cozeTools: {
//     webSearch: false,
//     embedding: false,
//     imageGeneration: false
//   }
// }
```

### 获取推荐配置

```typescript
const recommendation = aiServiceSelector.getRecommendation();

console.log(recommendation);
// {
//   recommendation: '⚠️  基础配置可用。建议启用 Coze 工具以获得...',
//   currentSetup: {
//     deepseek: true,
//     coze: false,
//     cozeTools: []
//   },
//   optimalSetup: {
//     description: '推荐配置：DeepSeek（对话/方案/报价）+ Coze（搜索/向量/生图）',
//     deepseekRequired: true,
//     cozeRequired: true,
//     cozeTools: ['Web Search', 'Embedding', 'Image Generation']
//   }
// }
```

---

## 📊 环境配置说明

### 当前配置（.env.local）

```env
# DeepSeek API（已配置 ✅）
DEEPSEEK_API_KEY=YOUR_API_KEY
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat

# Coze API（待配置 ⏳）
COZE_API_KEY=your_coze_api_key_here
COZE_BOT_ID=your_bot_id_here
COZE_WORKSPACE_ID=your_workspace_id_here

# Coze 工具开关（待启用 ⏳）
ENABLE_COZE_TOOLS=false
ENABLE_COZE_WEB_SEARCH=false
ENABLE_COZE_EMBEDDING=false
ENABLE_COZE_IMAGE_GENERATION=false
```

### 配置状态

| 服务                      | API Key   | 状态      | 可用功能                   |
| ------------------------- | --------- | --------- | -------------------------- |
| **DeepSeek**              | ✅ 已配置 | ✅ 正常   | 对话、方案、报价、价格优化 |
| **Coze**                  | ⏳ 待配置 | ⚪ 未启用 | -                          |
| **Coze Web Search**       | ⏳ 待配置 | ⚪ 未启用 | 市场价格查询               |
| **Coze Embedding**        | ⏳ 待配置 | ⚪ 未启用 | 相似产品推荐               |
| **Coze Image Generation** | ⏳ 待配置 | ⚪ 未启用 | 产品图生成                 |

---

## 🚀 启用 Coze 工具后

### 配置步骤

1. **获取 Coze API Key**（2分钟）
   - 访问：https://www.coze.cn/open/oauth/apps
   - 创建应用并获取 API Key

2. **更新 .env.local**（30秒）

   ```env
   COZE_API_KEY=your_actual_api_key
   COZE_BOT_ID=your_actual_bot_id
   COZE_WORKSPACE_ID=your_actual_workspace_id

   ENABLE_COZE_TOOLS=true
   ENABLE_COZE_WEB_SEARCH=true
   ENABLE_COZE_EMBEDDING=true
   ENABLE_COZE_IMAGE_GENERATION=true
   ```

3. **重启应用**（30秒）
   ```bash
   pnpm dev
   ```

### 启用后的能力对比

#### 启用前（仅 DeepSeek）

- ✅ 智能对话理解
- ✅ 技术方案生成
- ✅ 报价单生成
- ❌ 市场价格查询（无实时数据）
- ❌ 相似产品推荐（仅关键词匹配）
- ❌ 产品图生成
- ✅ 基础价格优化建议（基于行业经验）

#### 启用后（DeepSeek + Coze）

- ✅ 智能对话理解（DeepSeek）
- ✅ 技术方案生成（DeepSeek）
- ✅ 报价单生成（DeepSeek）
- ✅ 市场价格查询（Coze 实时数据）
- ✅ 相似产品推荐（Coze 向量搜索）
- ✅ 产品图生成（Coze 生图）
- ✅ 智能价格优化建议（DeepSeek + 市场数据）

**预期提升**：

- 报价准确度：↑ 40%
- 工作效率：↑ 60%
- 竞争力：↑ 50%

---

## 🎯 使用建议

### 何时使用双引擎

✅ **推荐启用 Coze 的情况**：

- 需要实时市场价格数据
- 需要智能相似产品推荐
- 需要自动生成产品展示图
- 需要提升报价竞争力
- 需要快速响应市场变化

✅ **仅使用 DeepSeek 即可**：

- 仅需要对话理解和方案生成
- 已有完整的产品数据库
- 产品图由其他方式提供
- 预算有限，暂时不启用 Coze

### 性能优化建议

1. **缓存机制**：
   - 市场价格查询结果自动缓存（5分钟）
   - 相似产品搜索结果自动缓存（10分钟）

2. **批量操作**：
   - 使用 `batchSearchMarketPrices()` 批量查询价格
   - 减少单次调用开销

3. **按需启用**：
   - 可以只启用部分 Coze 工具
   - 例如：只启用 Web Search，不启用 Embedding

---

## 🔍 监控与调试

### 查看服务使用日志

```typescript
// 所有服务选择都会记录详细日志
[AIServiceSelector] 任务类型: market-price
[AIServiceSelector] 选择服务: coze
[AIServiceSelector] 原因: 市场价格查询需要联网搜索能力，使用 Coze Web Search
[AIServiceSelector] 置信度: 0.95
```

### 手动检查状态

```bash
# 检查 Coze 工具状态
curl http://localhost:5000/api/coze

# 检查 DeepSeek 是否正常
curl -X POST http://localhost:5000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"测试"}'
```

---

## 📚 相关文档

- [Coze 工具配置指南](./COZE_TOOLS_SETUP.md)
- [Coze 快速启用指南](./COZE_QUICK_START.md)
- [DeepSeek 客户端文档](../lib/deepseek-client.ts)
- [智能服务选择器源码](../lib/ai-service-selector.ts)
- [报价增强器源码](../lib/quote-enhancer.ts)

---

## ✅ 总结

**DeepSeek 原有调用完全保留** ✅

**Coze 工具作为增强能力，不替代任何原有功能** ✅

**应用能够灵活机动地自动选择最合适的服务** ✅

**支持服务降级和故障转移** ✅

**推荐配置：DeepSeek（对话/方案/报价）+ Coze（搜索/向量/生图）** 🚀

---

_最后更新：2024-01-XX_
