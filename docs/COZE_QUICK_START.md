# 🚀 Coze 工具快速启用指南

## 当前状态

✅ **已预留配置完成**
- ✅ 联网搜索功能已集成
- ✅ 向量大模型已集成
- ✅ 生图大模型已集成
- ✅ API 接口已创建
- ✅ 测试脚本已就绪

⚪ **等待启用**
- ⚪ 需要配置 Coze API Key

---

## 📝 启用步骤（3分钟）

### 1️⃣ 获取 API Key（2分钟）

1. 访问：https://www.coze.cn/open/oauth/apps
2. 登录或注册账号
3. 创建新应用
4. 获取以下信息：
   - `COZE_API_KEY` = 您的 API Key
   - `COZE_BOT_ID` = 您的 Bot ID
   - `COZE_WORKSPACE_ID` = 您的 Workspace ID

### 2️⃣ 配置环境变量（30秒）

编辑 `.env.local` 文件，将以下占位符替换为真实值：

```bash
# 找到这些行并替换
COZE_API_KEY=your_coze_api_key_here
COZE_BOT_ID=your_bot_id_here
COZE_WORKSPACE_ID=your_workspace_id_here

# 启用功能（将 false 改为 true）
ENABLE_COZE_TOOLS=true
ENABLE_COZE_WEB_SEARCH=true
ENABLE_COZE_EMBEDDING=true
ENABLE_COZE_IMAGE_GENERATION=true
```

### 3️⃣ 重启应用（30秒）

```bash
# 停止当前服务（Ctrl+C）
# 然后重新启动
pnpm dev
```

---

## 🧪 验证是否启用成功

### 方法1：浏览器访问
```
http://localhost:5000/api/coze
```

**成功响应示例**：
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

### 方法2：运行测试脚本
```bash
node scripts/test-coze-tools.mjs
```

---

## 💡 功能使用示例

### 联网搜索市场价格
```bash
curl -X POST http://localhost:5000/api/coze \
  -H "Content-Type: application/json" \
  -d '{
    "action": "search-market-price",
    "productName": "污水处理设备"
  }'
```

### 生成产品图片
```bash
curl -X POST http://localhost:5000/api/coze \
  -H "Content-Type: application/json" \
  -d '{
    "action": "generate-product-image",
    "productName": "污水处理设备",
    "specs": "日处理量100吨"
  }'
```

### 智能增强报价单
```bash
curl -X POST http://localhost:5000/api/coze \
  -H "Content-Type: application/json" \
  -d '{
    "action": "enhance-quote",
    "products": [{
      "name": "污水处理设备",
      "quantity": 2,
      "unit": "台",
      "price": 50000,
      "total": 100000,
      "specs": "日处理量100吨"
    }],
    "options": {
      "enableMarketPrice": true,
      "enableSimilarProducts": true,
      "enableProductImages": false
    }
  }'
```

---

## 📚 相关文档

- **详细配置指南**：`docs/COZE_TOOLS_SETUP.md`
- **工具实现代码**：
  - `src/lib/coze-tools.ts` - Coze工具服务
  - `src/lib/quote-enhancer.ts` - 报价增强器
  - `src/app/api/coze/route.ts` - API接口
- **测试脚本**：`scripts/test-coze-tools.mjs`

---

## ❓ 常见问题

### Q: API Key在哪里获取？
A: 访问 https://www.coze.cn/open/oauth/apps 创建应用后即可获取

### Q: 需要付费吗？
A: Coze提供免费额度，超过后可能产生费用。建议先测试再启用

### Q: 可以只启用部分功能吗？
A: 可以。在 `.env.local` 中单独设置：
- `ENABLE_COZE_WEB_SEARCH=true` - 仅启用联网搜索
- `ENABLE_COZE_EMBEDDING=true` - 仅启用向量模型
- `ENABLE_COZE_IMAGE_GENERATION=true` - 仅启用生图功能

### Q: 如何测试功能是否正常？
A: 运行 `node scripts/test-coze-tools.mjs` 自动测试所有功能

---

## 🎯 下一步

启用后，您可以：

1. **在AI对话中使用**
   - 用户询问价格时，AI自动联网搜索
   - 用户描述需求时，AI推荐相似产品

2. **在报价生成中使用**
   - 一键增强报价单
   - 自动获取市场价格
   - 提供价格调整建议

3. **自定义功能**
   - 根据业务需求扩展功能
   - 集成到工作流程中

---

## 🆘 需要帮助？

查看详细文档：`docs/COZE_TOOLS_SETUP.md`

或联系开发团队获取支持。🚀
