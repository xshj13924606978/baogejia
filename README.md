# 《报个价》智能报价系统

基于 Next.js 16 + shadcn/ui 的全栈智能报价管理系统，支持 AI 对话解析需求、自动生成报价单及技术方案导出。

## 🌟 核心功能

### 1. AI 智能对话（双引擎架构）
- ✅ **DeepSeek 大语言模型**：智能语义理解、意图识别、技术方案生成
- ✅ **Coze 增强工具**：联网搜索、向量模型、生图模型
- 🔄 **自动服务选择**：根据任务类型自动选择最合适的服务
- 🛡️ **智能降级**：服务不可用时自动切换备用方案
- 自动解析客户需求
- 智能生成产品清单
- 多轮对话优化报价

### 2. 报价单管理
- 自动生成报价单
- 支持多种格式导出（PDF、Word、Excel）
- 自定义报价模板
- 历史报价记录
- 智能价格优化建议（DeepSeek + 市场数据）

### 3. 客户资料库
- 客户信息管理
- 财务信息记录
- 模板快速填充
- 批量导入导出
- 智能搜索

### 4. 产品库
- 产品分类管理
- 价格历史追踪
- 相似产品推荐（Coze 向量搜索）
- 批量导入产品

### 5. Coze 工具集成（已预留配置）

#### 🌐 联网搜索
- 实时查询产品市场价格
- 对比竞争对手报价
- 自动价格趋势分析

#### 🧠 向量大模型
- 语义化搜索产品
- 智能相似产品推荐
- 需求自动匹配

#### 🎨 生图大模型
- 自动生成产品展示图
- 创建报价单封面
- 提升视觉效果

**配置指南**：见 `docs/COZE_QUICK_START.md`  
**架构说明**：见 `docs/DEEPSEEK_COZE_DUAL_ENGINE.md`

## 🚀 快速开始

### 环境要求

- Node.js 24+
- pnpm 9.0+

### 安装依赖

```bash
pnpm install
```

### 配置环境变量

复制 `.env.local.example` 到 `.env.local` 并配置：

```env
# Supabase 配置
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# DeepSeek API 配置
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat

# Coze 工具配置（可选）
# COZE_API_KEY=your_coze_api_key
# ENABLE_COZE_TOOLS=false
```

### 启动开发服务器

```bash
pnpm dev
```

访问：http://localhost:5000

## 📁 项目结构

```
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/               # API 接口
│   │   │   ├── chat/          # AI 对话接口（DeepSeek）
│   │   │   ├── customers/     # 客户管理接口
│   │   │   ├── coze/          # Coze 工具接口
│   │   │   └── quotes/        # 报价管理接口
│   │   ├── page.tsx           # 主页面
│   │   └── layout.tsx         # 布局
│   ├── components/            # React 组件
│   │   ├── user/              # 用户相关组件
│   │   │   ├── customer-panel.tsx      # 客户面板
│   │   │   └── customer-list-panel.tsx # 客户列表
│   │   ├── ui/                # UI 组件
│   │   └── quote-table.tsx    # 报价表格
│   ├── contexts/              # React Context
│   │   ├── QuoteContext.tsx   # 报价上下文
│   │   └── UserContext.tsx    # 用户上下文
│   ├── lib/                   # 工具库
│   │   ├── ai-service-selector.ts # 智能服务选择器
│   │   ├── coze-tools.ts      # Coze 工具服务
│   │   ├── quote-enhancer.ts  # 报价增强器（DeepSeek + Coze）
│   │   ├── deepseek-client.ts # DeepSeek 客户端
│   │   ├── smart-chat-processor.ts # 智能对话处理器
│   │   ├── logger.ts          # 日志工具
│   │   └── server-utils.ts    # 服务端工具
│   └── types/                 # TypeScript 类型定义
├── docs/                      # 文档
│   ├── DEEPSEEK_COZE_DUAL_ENGINE.md # 双引擎架构说明
│   ├── COZE_QUICK_START.md    # Coze 工具快速启用
│   ├── COZE_TOOLS_SETUP.md    # Coze 工具详细配置
│   └── COZE_INTEGRATION_COMPLETE.md # 集成完成报告
├── scripts/                   # 脚本
│   ├── test-coze-tools.mjs    # Coze 工具测试
│   ├── dev.sh                 # 开发脚本
│   └── build.sh               # 构建脚本
├── .env.local                 # 环境变量（本地）
└── README.md                  # 项目说明
```

## 🔧 技术栈

- **框架**：Next.js 16 (App Router)
- **UI**：React 19 + shadcn/ui
- **样式**：Tailwind CSS 4
- **语言**：TypeScript 5
- **数据库**：Supabase (PostgreSQL)
- **AI 引擎**：
  - ✅ **DeepSeek**：对话理解、技术方案、报价生成（已配置）
  - ⏳ **Coze**：联网搜索、向量搜索、生图模型（待配置）
- **智能选择**：自动服务选择器（AIServiceSelector）
- **工具**：Coze SDK、OpenAI SDK

## 📖 使用指南

### AI 对话生成报价

1. 点击"开始新对话"
2. 输入客户需求，例如：
   ```
   我需要一套污水处理设备，日处理量100吨，
   用于工业园区，预算50万元
   ```
3. AI 自动解析需求并生成产品清单
4. 调整价格和数量
5. 导出报价单

### 客户资料管理

1. 点击右上角用户菜单
2. 选择"客户管理"
3. 添加新客户或从资料库选择
4. 填写客户信息（包括财务信息）
5. 保存到报价单

### Coze 工具与智能服务选择

1. **双引擎架构**：
   - ✅ **DeepSeek**（已配置）：对话理解、技术方案、报价生成、智能价格优化
   - ⏳ **Coze**（待配置）：联网搜索、向量搜索、生图模型

2. **自动服务选择**：
   - 根据任务类型自动选择最合适的服务
   - 对话类任务 → DeepSeek
   - 联网搜索 → Coze Web Search
   - 向量搜索 → Coze Embedding
   - 生图 → Coze Image Generation
   - 支持智能降级和故障转移

3. **在报价生成时**：
   - 自动获取市场价格（Coze）
   - 智能推荐相似产品（Coze）
   - 生成产品展示图（Coze）
   - 智能价格优化建议（DeepSeek）

**配置指南**：见 `docs/COZE_QUICK_START.md`  
**架构说明**：见 `docs/DEEPSEEK_COZE_DUAL_ENGINE.md`

## 🧪 测试

### 运行测试脚本

```bash
# 测试 Coze 工具
node scripts/test-coze-tools.mjs

# 类型检查
pnpm ts-check

# 构建测试
pnpm build
```

### API 测试

```bash
# 检查工具状态
curl http://localhost:5000/api/coze

# 搜索市场价格
curl -X POST http://localhost:5000/api/coze \
  -H "Content-Type: application/json" \
  -d '{"action":"search-market-price","productName":"污水处理设备"}'
```

## 📝 配置 Coze 工具

详细配置步骤请查看：[docs/COZE_QUICK_START.md](docs/COZE_QUICK_START.md)

快速启用：
1. 获取 API Key：https://www.coze.cn/open/oauth/apps
2. 配置 `.env.local`（设置 `COZE_API_KEY` 和工具开关）
3. 重启应用：`pnpm dev`
4. 验证：`curl http://localhost:5000/api/coze`

**双引擎架构说明**：见 [docs/DEEPSEEK_COZE_DUAL_ENGINE.md](docs/DEEPSEEK_COZE_DUAL_ENGINE.md)

## 📚 相关文档

- [DeepSeek + Coze 双引擎架构](docs/DEEPSEEK_COZE_DUAL_ENGINE.md) - 自动服务选择机制
- [Coze 工具快速启用](docs/COZE_QUICK_START.md) - 3分钟快速启用指南
- [Coze 工具详细配置](docs/COZE_TOOLS_SETUP.md) - 完整配置文档
- [Coze 工具集成报告](docs/COZE_INTEGRATION_COMPLETE.md) - 集成完成报告
2. 配置 `.env.local` 中的 Coze 凭证
3. 设置 `ENABLE_COZE_TOOLS=true`
4. 重启应用

## 🤝 贡献

欢迎提交 Issue 和 Pull Request。

## 📄 许可证

MIT License

## 📞 联系

如有问题，请提交 Issue 或联系开发团队。
