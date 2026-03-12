# 《报个价》项目模块结构梳理
## 为统一权限管理系统做准备

> 生成时间：2026-03-12
> 目的：梳理整个项目的模块结构，为后续实现统一权限管理系统做准备

---

## 一、项目整体架构

### 1.1 技术栈
- **框架**：Next.js 16 (App Router)
- **语言**：TypeScript 5
- **UI组件**：shadcn/ui (基于 Radix UI)
- **样式**：Tailwind CSS 4
- **数据库**：PostgreSQL (Supabase)
- **认证**：Supabase Auth + 自定义角色系统

### 1.2 目录结构概览

```
src/
├── app/                    # Next.js App Router 页面和 API 路由
│   ├── admin/             # 管理后台页面
│   ├── api/               # API 路由
│   ├── login/             # 登录页面
│   ├── payment/           # 支付相关页面
│   ├── team/              # 团队相关页面
│   └── ...
├── components/            # React 组件
│   ├── ui/               # UI 基础组件（shadcn/ui）
│   ├── admin/            # 管理后台业务组件
│   ├── auth/             # 认证相关组件
│   ├── user/             # 用户相关组件
│   └── ...
├── lib/                   # 业务逻辑和服务
├── storage/              # 存储相关（Supabase 客户端）
└── types/                # TypeScript 类型定义
```

---

## 二、核心业务模块

### 2.1 管理后台模块 (src/app/admin/)

#### 2.1.1 模块列表
```
admin/
├── analytics/           # 数据分析模块
├── audit/              # 审计日志模块
├── points/             # 积分管理模块
├── products/           # 产品管理模块
├── quotes/             # 报价管理模块
├── settings/           # 系统设置模块
├── stats/              # 统计分析模块
└── users/              # 用户管理模块
```

#### 2.1.2 权限需求
- 所有页面都需要管理员权限（super_admin 或 admin）
- 部分高级功能（如角色修改、权限配置）仅限超级管理员

---

### 2.2 API 路由模块 (src/app/api/)

#### 2.2.1 管理员 API (api/admin/)
```
api/admin/
├── api-permissions/           # API 权限管理
│   └── route.ts              # CRUD API 权限规则
├── approve/                   # 审批相关
├── audit/                     # 审计日志
├── billing/                   # 账单管理
├── init-test-users/           # 初始化测试用户
├── levels/                    # 等级管理
│   ├── route.ts              # 等级列表
│   ├── batch/route.ts        # 批量更新
│   ├── defaults/route.ts     # 默认配置
│   ├── [level]/route.ts      # 单个等级
│   └── [level]/history/route.ts # 修改历史
├── modules/                   # 模块管理
│   └── route.ts              # 模块列表
├── permissions/               # 权限管理
│   └── preview/route.ts      # 权限预览
├── points/                    # 积分管理
│   └── logs/route.ts         # 积分日志
├── stats/                     # 统计分析
│   ├── route.ts              # 总体统计
│   ├── level-distribution/   # 等级分布
│   ├── permissions/heatmap/  # 权限热力图
│   └── revenue/              # 收入统计
├── templates/                 # 权限模板
│   └── route.ts              # 模板管理
└── users/                     # 用户管理
    ├── route.ts              # 用户列表
    ├── [id]/points/          # 用户积分
    ├── [id]/role/            # 用户角色
    └── [id]/disable/         # 禁用用户
```

#### 2.2.2 业务功能 API
```
api/
├── analytics/               # 数据分析
├── auth/                    # 认证相关
│   ├── login/               # 登录
│   ├── register/            # 注册
│   ├── qq/                  # QQ 登录
│   └── wechat/              # 微信登录
├── brand-display-rules/     # 品牌展示规则
├── brand-payment-records/   # 品牌付款记录
├── brand-vendors/           # 品牌供应商
├── business-info/           # 企业信息
├── chat/                    # 聊天功能
│   └── stream/              # 流式响应
├── comments/                # 评论功能
├── conversations/           # 对话管理
├── customers/               # 客户管理
├── documents/               # 文档管理
│   └── parse/               # 文档解析
├── knowledge/               # 知识库
│   ├── upload/              # 上传
│   ├── parse-web-link/      # 解析网页链接
│   └── parse-cloud-link/    # 解析云文件链接
├── manufacturer/            # 厂商管理
├── messages/                # 消息管理
├── notifications/           # 通知管理
├── orders/                  # 订单管理
├── payment/                 # 支付功能
│   ├── plans/               # 支付计划
│   ├── alipay/              # 支付宝
│   └── wechat/              # 微信支付
├── points/                  # 积分功能
│   └── exchange/            # 积分兑换
├── products/                # 产品功能
│   ├── search/              # 搜索
│   ├── batch/               # 批量操作
│   └── template/            # 模板
├── proposal/                # 方案功能
│   └── enhance/             # 方案增强
├── quota/                   # 配额管理
│   └── check/               # 配额检查
├── quotes/                  # 报价功能
│   ├── export/              # 导出
│   ├── export-pdf/          # PDF 导出
│   ├── export-html/         # HTML 导出
│   ├── market-price/        # 市场价
│   ├── batch-market-price/  # 批量市场价
│   └── proposal/            # 报价方案
├── socket/                  # WebSocket
├── stats/                   # 统计
│   ├── overview/            # 概览
│   └── usage/               # 使用统计
├── suppliers/               # 供应商
├── tables/                  # 表格功能
│   └── products/            # 产品表格
├── teams/                   # 团队功能
├── terms/                   # 条款
├── upload/                  # 上传功能
├── user/                    # 用户功能
│   ├── level/               # 用户等级
│   ├── points/              # 用户积分
│   ├── stats/               # 用户统计
│   ├── billing/             # 用户账单
│   ├── channels/            # 用户渠道
│   └── uploads/             # 用户上传
├── verify-email/            # 邮箱验证
└── websocket/               # WebSocket
```

---

### 2.3 业务组件模块 (src/components/)

#### 2.3.1 管理后台组件
```
components/admin/
├── levels/                  # 等级管理组件
│   ├── LevelList.tsx       # 等级列表
│   └── LevelEditor.tsx     # 等级编辑器
└── points/                  # 积分管理组件
```

#### 2.3.2 业务功能组件
```
components/
├── admin-audit-panel.tsx   # 审计面板
├── auth/                   # 认证组件
├── chat-area.tsx           # 聊天区域
├── chat-message.tsx        # 聊天消息
├── conversation-list.tsx   # 对话列表
├── info-panel.tsx          # 信息面板
├── knowledge-center/       # 知识中心
├── manufacturer-payment-panel.tsx  # 厂商付款面板
├── message-read-receipt/   # 消息已读回执
├── notification-panel.tsx  # 通知面板
├── online-status/          # 在线状态
├── payment-dialog.tsx      # 支付对话框
├── points-panel.tsx        # 积分面板
├── profile-dialog.tsx      # 个人资料对话框
├── quote-table.tsx         # 报价表格
├── realtime/               # 实时功能
├── sidebar.tsx             # 侧边栏
├── team/                   # 团队组件
├── user/                   # 用户组件
└── websocket/              # WebSocket 组件
```

---

### 2.4 业务服务模块 (src/lib/)

#### 2.4.1 核心服务
```
lib/
├── ai-service-selector.ts       # AI 服务选择器
├── analytics.ts                 # 数据分析服务
├── audit-log-service.ts         # 审计日志服务
├── auth/                        # 认证相关
├── auth-utils.ts                # 认证工具函数
├── brand-ranking-service.ts     # 品牌排名服务
├── coze-tools.ts                # Coze 工具
├── deepseek-client.ts           # DeepSeek 客户端
├── input-processor.ts           # 输入处理器
├── intent-detector.ts           # 意图检测
├── logger.ts                    # 日志工具
├── oauth-service.ts             # OAuth 服务
├── order-service.ts             # 订单服务
├── payment-service.ts           # 支付服务
├── price-matching.ts            # 价格匹配
├── product-extractor.ts         # 产品提取
├── proposal-enhancer.ts         # 方案增强
├── quote-enhancer.ts            # 报价增强
├── quote-utils.ts               # 报价工具
├── server-utils.ts              # 服务器工具
├── smart-chat-processor.ts      # 智能聊天处理器
├── sms-service.ts               # 短信服务
├── socket-client.ts             # Socket 客户端
├── socket.ts                    # Socket 服务
├── supabase-client.ts           # Supabase 客户端
├── supabase-exec.ts             # Supabase 执行工具
├── supabase-storage.ts          # Supabase 存储
├── supabase.ts                  # Supabase 配置
├── team-service.ts              # 团队服务
├── token-billing-service.ts     # Token 计费服务
├── upload-processor.ts          # 上传处理器
├── user-level-service.ts        # 用户等级服务 ⭐核心
├── utils.ts                     # 工具函数
├── websocket/                   # WebSocket 相关
└── websocket-adapter.ts         # WebSocket 适配器
```

---

## 三、权限系统架构

### 3.1 数据库表结构

#### 3.1.1 核心权限表

**1. users 表** - 用户基础信息
```sql
- id: UUID (主键)
- email: VARCHAR
- username: VARCHAR
- password_hash: VARCHAR
- role: VARCHAR (基础角色：user, admin, super_admin)
- status: VARCHAR
- level: INTEGER (用户等级 1-5)
- points: INTEGER (用户积分)
- created_at, updated_at
```

**2. user_roles 表** - 用户角色映射
```sql
- user_id: UUID (外键 → users.id)
- role: VARCHAR (角色：free, premium, vip, enterprise_admin, super_admin)
- created_at, updated_at
```

**3. level_configs 表** - 等级配置
```sql
- level: INTEGER (等级 1-5)
- name: VARCHAR (等级名称)
- required_points: INTEGER (升级所需积分)
- role: VARCHAR (对应角色)
- field_permissions: JSONB (字段权限)
  {
    can_view_cost_price: boolean
    can_view_min_price: boolean
    can_view_manufacturer: boolean
    can_view_contact: boolean
    can_view_phone: boolean
  }
- module_permissions: TEXT[] (模块权限列表)
- quotas: JSONB (配额限制)
  {
    daily_quota: INTEGER
    max_files: INTEGER
    max_chat_messages: INTEGER
  }
- created_at, updated_at
```

**4. level_definitions 表** - 等级默认定义
```sql
- id: INTEGER (主键)
- level: INTEGER (等级)
- name: VARCHAR (等级名称)
- required_points: INTEGER (升级所需积分)
- role: VARCHAR (对应角色)
- quotas: JSONB (配额配置)
- field_permissions: JSONB (字段权限)
- module_permissions: TEXT[] (模块权限)
- created_at, updated_at
```

**5. level_permission_history 表** - 权限修改历史
```sql
- id: INTEGER (主键)
- level: INTEGER (等级)
- admin_id: INTEGER (管理员ID)
- changes: JSONB (修改内容)
- reason: TEXT (修改原因)
- created_at: TIMESTAMP (修改时间)
```

**6. modules 表** - 模块定义
```sql
- id: INTEGER (主键)
- module_code: VARCHAR (模块代码)
- module_name: VARCHAR (模块名称)
- category: VARCHAR (模块分类)
- description: TEXT (描述)
- is_active: BOOLEAN (是否启用)
- created_at, updated_at
```

**7. api_permissions 表** - API 权限规则
```sql
- id: INTEGER (主键)
- api_path: VARCHAR (API路径)
- method: VARCHAR (HTTP方法：GET, POST, PUT, DELETE)
- module_code: VARCHAR (所属模块)
- min_level: INTEGER (最低等级)
- min_points: INTEGER (最低积分)
- is_public: BOOLEAN (是否公开)
- description: TEXT (描述)
- created_at, updated_at
```

#### 3.1.2 辅助表

**8. user_quotas 表** - 用户配额
```sql
- id: UUID (主键)
- user_id: UUID (外键 → users.id)
- quotes_today: INTEGER (今日报价数)
- quotes_total: INTEGER (总报价数)
- uploads_today: INTEGER (今日上传数)
- uploads_total: INTEGER (总上传数)
- storage_used: BIGINT (已用存储)
- quota_reset_date: DATE (配额重置日期)
- created_at, updated_at
```

**9. audit_log 表** - 审计日志
```sql
- id: UUID (主键)
- user_id: UUID (操作用户)
- action: VARCHAR (操作类型)
- resource: VARCHAR (资源类型)
- details: JSONB (详细信息)
- ip_address: VARCHAR
- user_agent: TEXT
- created_at: TIMESTAMP
```

---

### 3.2 权限模型

#### 3.2.1 三层权限体系

**第一层：角色权限 (Role-based)**
- 基础角色：user, admin, super_admin
- 业务角色：free, premium, vip, enterprise_admin
- 用途：控制用户身份和基础访问权限

**第二层：等级权限 (Level-based)**
- 等级体系：1-5 级
- 每个等级对应不同的权限配置
- 用途：细粒度控制业务功能访问

**第三层：资源权限 (Resource-based)**
- 字段权限：控制特定字段的查看/编辑
- 模块权限：控制特定模块的访问
- 配额限制：控制资源使用量

#### 3.2.2 权限检查流程

```
用户请求 → 角色检查 → 等级检查 → API权限检查 → 配额检查 → 授权/拒绝
```

1. **角色检查**：验证用户是否登录，基础角色是否满足
2. **等级检查**：验证用户等级是否达到最低要求
3. **API权限检查**：验证 API 路径和方法的权限配置
4. **配额检查**：验证资源使用量是否超限

---

### 3.3 权限配置

#### 3.3.1 等级配置示例

**等级 1 - 免费用户 (free)**
```json
{
  "level": 1,
  "name": "免费用户",
  "required_points": 0,
  "role": "free",
  "field_permissions": {
    "can_view_cost_price": false,
    "can_view_min_price": false,
    "can_view_manufacturer": false,
    "can_view_contact": false,
    "can_view_phone": false
  },
  "module_permissions": ["user.view", "product.search"],
  "quotas": {
    "daily_quota": 10,
    "max_files": 5,
    "max_chat_messages": 20
  }
}
```

**等级 2 - 普通会员 (premium)**
```json
{
  "level": 2,
  "name": "普通会员",
  "required_points": 100,
  "role": "premium",
  "field_permissions": {
    "can_view_cost_price": false,
    "can_view_min_price": true,
    "can_view_manufacturer": false,
    "can_view_contact": false,
    "can_view_phone": false
  },
  "module_permissions": ["user.view", "product.search", "product.detail"],
  "quotas": {
    "daily_quota": 50,
    "max_files": 20,
    "max_chat_messages": 100
  }
}
```

**等级 5 - 超级会员 (super_admin)**
```json
{
  "level": 5,
  "name": "超级会员",
  "required_points": 5000,
  "role": "super_admin",
  "field_permissions": {
    "can_view_cost_price": true,
    "can_view_min_price": true,
    "can_view_manufacturer": true,
    "can_view_contact": true,
    "can_view_phone": true
  },
  "module_permissions": ["*"],
  "quotas": {
    "daily_quota": 9999,
    "max_files": 9999,
    "max_chat_messages": 9999
  }
}
```

#### 3.3.2 API 权限配置示例

```json
{
  "api_path": "/api/admin/levels",
  "method": "GET",
  "module_code": "levels",
  "min_level": 3,
  "min_points": 500,
  "is_public": false,
  "description": "获取等级列表（管理员）"
}
```

---

## 四、核心服务分析

### 4.1 用户等级服务 (user-level-service.ts)

**核心功能**：
- 获取用户等级信息
- 等级升级逻辑
- 权限检查
- 配额检查
- API 权限验证
- 权限修改历史
- 权限变更预览

**关键方法**：
```typescript
- getUserLevel(userId: number): Promise<UserLevelInfo>
- upgradeUserLevel(userId: number, reason: string): Promise<UpgradeResult>
- checkPermission(userId: number, permission: string): Promise<boolean>
- checkQuota(userId: number, quotaType: string, amount: number): Promise<QuotaCheckResult>
- checkApiPermission(userId: number, apiPath: string, method: string): Promise<ApiPermissionCheckResult>
- getLevelPermissionHistory(level: number): Promise<PermissionHistory[]>
- previewPermissionChange(level: number, changes: any): Promise<PermissionChangePreview>
```

### 4.2 审计日志服务 (audit-log-service.ts)

**核心功能**：
- 记录用户操作
- 记录权限变更
- 记录敏感操作

**关键方法**：
```typescript
- logAction(userId: number, action: string, resource: string, details: any): Promise<void>
- getUserAuditLogs(userId: number, limit?: number): Promise<AuditLog[]>
- getResourceAuditLogs(resource: string, limit?: number): Promise<AuditLog[]>
```

### 4.3 认证工具 (auth-utils.ts)

**核心功能**：
- 获取当前用户
- 解析用户令牌
- 客户端用户获取

**关键方法**：
```typescript
- getCurrentUser(request: NextRequest): Promise<User | null>
- getClientUser(): User | null
```

---

## 五、权限检查点

### 5.1 API 层权限检查

**检查位置**：所有 API 路由入口
**检查内容**：
1. 用户是否登录
2. 用户角色是否满足要求
3. 用户等级是否达到最低要求
4. API 是否有权限配置
5. 资源配额是否足够

**示例代码**：
```typescript
export async function GET(request: NextRequest) {
  // 1. 获取当前用户
  const currentUser = await getCurrentUser(request);
  if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
  
  // 2. 检查角色
  const userRole = await getUserRole(currentUser.id);
  if (userRole.role !== 'admin' && userRole.role !== 'super_admin') {
    return NextResponse.json({ error: '权限不足' }, { status: 403 });
  }
  
  // 3. 检查 API 权限
  const hasPermission = await userLevelService.checkApiPermission(
    currentUser.id,
    '/api/admin/levels',
    'GET'
  );
  if (!hasPermission) {
    return NextResponse.json({ error: '权限不足' }, { status: 403 });
  }
  
  // 4. 执行业务逻辑
  // ...
}
```

### 5.2 页面层权限检查

**检查位置**：管理后台页面
**检查内容**：
1. 用户是否登录
2. 用户是否为管理员

**示例代码**：
```typescript
// src/app/admin/layout.tsx
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  
  const userRole = await getUserRole(user.id);
  if (userRole.role !== 'admin' && userRole.role !== 'super_admin') {
    redirect('/');
  }
  
  return <AdminSidebar>{children}</AdminSidebar>;
}
```

### 5.3 数据层权限检查

**检查位置**：敏感数据访问
**检查内容**：
1. 字段权限（成本价、厂家信息等）
2. 资源所有权

**示例代码**：
```typescript
// 获取产品详情时过滤敏感字段
async function getProductDetails(productId: string, userId: number) {
  const product = await supabase.from('products').select('*').eq('id', productId).single();
  
  const userLevel = await userLevelService.getUserLevel(userId);
  
  // 根据用户等级过滤字段
  if (!userLevel.config.fieldPermissions.can_view_cost_price) {
    delete product.price;
  }
  if (!userLevel.config.fieldPermissions.can_view_manufacturer) {
    delete product.manufacturer;
  }
  
  return product;
}
```

---

## 六、权限管理功能

### 6.1 等级管理

**功能列表**：
- 查看所有等级配置
- 编辑等级配置
- 批量更新等级配置
- 恢复默认配置
- 查看等级修改历史
- 权限变更预览

**相关文件**：
- 页面：`src/app/admin/levels/`
- 组件：`src/components/admin/levels/`
- API：`src/app/api/admin/levels/`

### 6.2 用户管理

**功能列表**：
- 查看用户列表
- 修改用户角色
- 修改用户积分
- 禁用/启用用户
- 查看用户等级

**相关文件**：
- 页面：`src/app/admin/users/`
- API：`src/app/api/admin/users/`

### 6.3 API 权限管理

**功能列表**：
- 查看 API 权限规则
- 创建 API 权限规则
- 更新 API 权限规则
- 删除 API 权限规则

**相关文件**：
- API：`src/app/api/admin/api-permissions/`

### 6.4 模块管理

**功能列表**：
- 查看所有模块
- 管理模块配置

**相关文件**：
- API：`src/app/api/admin/modules/`

### 6.5 权限统计

**功能列表**：
- 等级分布统计
- 权限使用热力图
- 权限变更统计

**相关文件**：
- API：`src/app/api/admin/stats/`

---

## 七、权限系统存在的问题

### 7.1 权限检查分散
- **问题**：权限检查逻辑分散在每个 API 路由中
- **影响**：代码重复，难以维护
- **改进建议**：统一权限检查中间件

### 7.2 权限配置不统一
- **问题**：部分权限硬编码，部分从数据库读取
- **影响**：配置不一致，难以管理
- **改进建议**：统一权限配置来源

### 7.3 缺少权限缓存
- **问题**：每次请求都查询数据库获取用户权限
- **影响**：性能较差
- **改进建议**：添加权限缓存机制

### 7.4 缺少细粒度权限
- **问题**：只有等级权限，缺少资源权限
- **影响**：无法实现更精细的权限控制
- **改进建议**：实现 RBAC 或 ABAC 模型

### 7.5 缺少权限审计
- **问题**：权限变更记录不完整
- **影响**：难以追踪权限滥用
- **改进建议**：完善权限审计日志

### 7.6 前端权限控制不足
- **问题**：前端没有统一的权限检查机制
- **影响**：用户体验不一致
- **改进建议**：实现前端权限组件和 Hook

---

## 八、统一权限管理系统设计方案

### 8.1 设计目标

1. **统一性**：所有权限检查逻辑统一管理
2. **灵活性**：支持多种权限模型（RBAC、ABAC）
3. **性能**：通过缓存提高权限检查速度
4. **可追溯**：完整的权限变更审计
5. **易用性**：提供简洁的 API 和工具

### 8.2 架构设计

```
┌─────────────────────────────────────────────────────────┐
│                    应用层 (App)                          │
├─────────────────────────────────────────────────────────┤
│  API Routes  │  Pages  │  Components                    │
└──────────────┬──────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────┐
│              权限中间件层 (Middleware)                   │
├─────────────────────────────────────────────────────────┤
│  API Permission Middleware  │  Page Permission Guard     │
└──────────────┬──────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────┐
│              权限服务层 (Service)                        │
├─────────────────────────────────────────────────────────┤
│  PermissionService  │  RoleService  │  CacheService      │
└──────────────┬──────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────┐
│               权限配置层 (Config)                        │
├─────────────────────────────────────────────────────────┤
│  Database  │  Redis Cache  │  Config Files               │
└─────────────────────────────────────────────────────────┘
```

### 8.3 核心组件设计

#### 8.3.1 PermissionService (权限服务)

```typescript
interface PermissionService {
  // 基础权限检查
  hasPermission(userId: number, permission: string): Promise<boolean>;
  hasRole(userId: number, role: string): Promise<boolean>;
  hasLevel(userId: number, minLevel: number): Promise<boolean>;
  
  // API 权限检查
  checkApiPermission(
    userId: number,
    apiPath: string,
    method: string
  ): Promise<ApiPermissionCheckResult>;
  
  // 资源权限检查
  checkResourcePermission(
    userId: number,
    resourceType: string,
    resourceId: string,
    action: string
  ): Promise<boolean>;
  
  // 配额检查
  checkQuota(
    userId: number,
    quotaType: string,
    amount: number
  ): Promise<QuotaCheckResult>;
  
  // 权限缓存
  clearUserPermissionCache(userId: number): Promise<void>;
}
```

#### 8.3.2 PermissionMiddleware (权限中间件)

```typescript
// API 路由权限中间件
export function withPermission(permission: string) {
  return async (request: NextRequest) => {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
    
    const hasPermission = await permissionService.hasPermission(user.id, permission);
    if (!hasPermission) {
      return NextResponse.json({ error: '权限不足' }, { status: 403 });
    }
    
    return NextResponse.next();
  };
}

// 使用示例
export const GET = withPermission('admin.levels.view')(async (request: NextRequest) => {
  // 业务逻辑
});
```

#### 8.3.3 PermissionGuard (前端权限组件)

```typescript
// 权限检查组件
interface PermissionGuardProps {
  permission: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function PermissionGuard({ permission, fallback, children }: PermissionGuardProps) {
  const { user } = useAuth();
  const [hasPermission, setHasPermission] = useState<boolean>(false);
  
  useEffect(() => {
    checkPermission(user?.id, permission).then(setHasPermission);
  }, [user, permission]);
  
  if (!hasPermission) return <>{fallback}</>;
  return <>{children}</>;
}

// 使用示例
<PermissionGuard permission="admin.levels.edit" fallback={<div>无权限</div>}>
  <Button>编辑</Button>
</PermissionGuard>
```

### 8.4 数据库表设计优化

#### 8.4.1 新增表

**permissions 表** - 权限定义
```sql
CREATE TABLE permissions (
  id SERIAL PRIMARY KEY,
  code VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  category VARCHAR(50),
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**role_permissions 表** - 角色权限关联
```sql
CREATE TABLE role_permissions (
  id SERIAL PRIMARY KEY,
  role VARCHAR(50) NOT NULL,
  permission_code VARCHAR(100) NOT NULL REFERENCES permissions(code),
  granted BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(role, permission_code)
);
```

**user_permissions 表** - 用户权限关联（特殊权限）
```sql
CREATE TABLE user_permissions (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  permission_code VARCHAR(100) NOT NULL REFERENCES permissions(code),
  granted BOOLEAN DEFAULT true,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, permission_code)
);
```

#### 8.4.2 优化现有表

**level_configs 表** - 增加字段
```sql
ALTER TABLE level_configs ADD COLUMN permission_codes TEXT[];
```

---

## 九、实施计划

### 第一阶段：基础设施搭建 (Week 1-2)
1. 创建权限服务层（PermissionService）
2. 实现权限缓存机制
3. 设计并创建新的权限表

### 第二阶段：中间件实现 (Week 2-3)
1. 实现 API 权限中间件
2. 实现页面权限守卫
3. 实现前端权限组件

### 第三阶段：迁移现有功能 (Week 3-4)
1. 迁移 API 路由权限检查
2. 迁移页面权限检查
3. 迁移数据层权限检查

### 第四阶段：功能完善 (Week 4-5)
1. 实现权限审计
2. 实现权限管理界面
3. 完善文档和测试

### 第五阶段：测试和优化 (Week 5-6)
1. 功能测试
2. 性能测试
3. 安全测试
4. 优化和调整

---

## 十、附录

### 10.1 关键文件清单

#### 权限相关
- `src/lib/user-level-service.ts` - 用户等级服务（核心）
- `src/lib/audit-log-service.ts` - 审计日志服务
- `src/lib/auth-utils.ts` - 认证工具

#### 管理后台
- `src/app/admin/levels/` - 等级管理
- `src/app/admin/users/` - 用户管理
- `src/components/admin/levels/` - 等级管理组件

#### API 路由
- `src/app/api/admin/levels/` - 等级 API
- `src/app/api/admin/users/` - 用户 API
- `src/app/api/admin/permissions/` - 权限 API
- `src/app/api/admin/api-permissions/` - API 权限
- `src/app/api/admin/modules/` - 模块 API

### 10.2 数据库迁移脚本

**权限系统表创建脚本**：
```sql
-- 创建权限定义表
CREATE TABLE IF NOT EXISTS permissions (
  id SERIAL PRIMARY KEY,
  code VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  category VARCHAR(50),
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 创建角色权限关联表
CREATE TABLE IF NOT EXISTS role_permissions (
  id SERIAL PRIMARY KEY,
  role VARCHAR(50) NOT NULL,
  permission_code VARCHAR(100) NOT NULL REFERENCES permissions(code),
  granted BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(role, permission_code)
);

-- 创建用户权限关联表
CREATE TABLE IF NOT EXISTS user_permissions (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  permission_code VARCHAR(100) NOT NULL REFERENCES permissions(code),
  granted BOOLEAN DEFAULT true,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, permission_code)
);
```

### 10.3 权限代码清单

**基础权限**：
- `user.view` - 查看用户
- `user.edit` - 编辑用户
- `user.delete` - 删除用户
- `user.manage` - 管理用户

**产品权限**：
- `product.search` - 搜索产品
- `product.view` - 查看产品详情
- `product.edit` - 编辑产品
- `product.export` - 导出产品

**报价权限**：
- `quote.create` - 创建报价
- `quote.view` - 查看报价
- `quote.edit` - 编辑报价
- `quote.export` - 导出报价

**成本权限**：
- `cost_price.view` - 查看成本价
- `cost_price.edit` - 编辑成本价

**管理员权限**：
- `admin.*` - 所有管理员权限
- `admin.levels.*` - 等级管理
- `admin.users.*` - 用户管理
- `admin.permissions.*` - 权限管理

---

## 总结

本项目是一个多层次的权限系统，包含角色权限、等级权限和资源权限。权限检查逻辑分散在各个层级，需要统一管理以降低复杂度。

通过实施统一权限管理系统，可以实现：
1. 统一的权限检查逻辑
2. 更好的权限缓存机制
3. 更细粒度的权限控制
4. 完整的权限审计
5. 更好的用户体验

建议按照实施计划分阶段推进，确保系统的稳定性和可维护性。
