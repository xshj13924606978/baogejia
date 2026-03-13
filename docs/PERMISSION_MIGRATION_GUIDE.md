# 统一权限管理系统 - API 迁移指南

> 版本：v2.0.0
> 更新时间：2026-03-12

---

## 一、迁移概述

本指南说明如何将现有的 API 路由迁移到新的统一权限管理系统。

### 迁移目标

1. 统一权限检查逻辑
2. 简化代码结构
3. 提高代码可维护性
4. 增强权限管理能力

### 迁移步骤

1. **分析现有权限检查代码**：识别需要迁移的 API 路由
2. **选择合适的权限检查方式**：根据需求选择包装器或自定义配置
3. **替换权限检查代码**：使用新的权限系统替换旧代码
4. **测试验证**：确保功能正常工作
5. **删除旧代码**：清理不再使用的代码

---

## 二、迁移前准备

### 2.1 了解现有权限检查模式

检查现有 API 路由中的权限检查代码，常见的模式包括：

**模式 1：手动检查用户角色**

```typescript
const currentUser = await getCurrentUser(request);
if (!currentUser) {
  return NextResponse.json({ error: '未登录' }, { status: 401 });
}

const { data: userRole } = await supabase
  .from('user_roles')
  .select('role')
  .eq('user_id', currentUser.id)
  .single();

if (userRole?.role !== 'admin') {
  return NextResponse.json({ error: '权限不足' }, { status: 403 });
}
```

**模式 2：检查用户等级**

```typescript
const { data: user } = await supabase.from('users').select('level').eq('id', userId).single();

if (user?.level < 3) {
  return NextResponse.json({ error: '等级不足' }, { status: 403 });
}
```

**模式 3：检查字段权限**

```typescript
const levelConfig = await userLevelService.getLevelConfig(user.level);

if (!levelConfig.fieldPermissions.can_view_cost_price) {
  return NextResponse.json({ error: '无权查看成本价' }, { status: 403 });
}
```

### 2.2 确定权限映射

将现有的权限检查映射到新的权限代码：

| 旧方式           | 新权限代码                      | 说明         |
| ---------------- | ------------------------------- | ------------ |
| 检查角色为 admin | roles: ['admin', 'super_admin'] | 管理员角色   |
| 检查等级 >= 3    | minLevel: 3                     | 最低等级要求 |
| 检查积分 >= 100  | minPoints: 100                  | 最低积分要求 |
| 查看用户         | permissions: 'user.view'        | 用户查看权限 |
| 编辑用户         | permissions: 'user.edit'        | 用户编辑权限 |
| 删除用户         | permissions: 'user.delete'      | 用户删除权限 |

---

## 三、迁移方法

### 方法 1：使用预定义包装器（推荐）

适用于常见权限场景，最简单直接。

#### 用户相关

```typescript
import { withUserView, withUserCreate, withUserEdit, withUserDelete } from '@/lib/permission-check';

// 查看用户
export const GET = withUserView(async (request: NextRequest, user: any) => {
  // 业务逻辑
  return NextResponse.json({ success: true });
});

// 创建用户
export const POST = withUserCreate(async (request: NextRequest, user: any) => {
  // 业务逻辑
  return NextResponse.json({ success: true });
});

// 编辑用户
export const PUT = withUserEdit(async (request: NextRequest, user: any) => {
  // 业务逻辑
  return NextResponse.json({ success: true });
});

// 删除用户
export const DELETE = withUserDelete(async (request: NextRequest, user: any) => {
  // 业务逻辑
  return NextResponse.json({ success: true });
});
```

#### 产品相关

```typescript
import { withProductView, withProductEdit, withProductExport } from '@/lib/permission-check';

export const GET = withProductView(async (request: NextRequest, user: any) => {
  // 业务逻辑
  return NextResponse.json({ success: true });
});

export const PUT = withProductEdit(async (request: NextRequest, user: any) => {
  // 业务逻辑
  return NextResponse.json({ success: true });
});

export const POST = withProductExport(async (request: NextRequest, user: any) => {
  // 业务逻辑
  return NextResponse.json({ success: true });
});
```

#### 报价相关

```typescript
import {
  withQuoteCreate,
  withQuoteView,
  withQuoteEdit,
  withQuoteExport,
} from '@/lib/permission-check';

export const GET = withQuoteView(async (request: NextRequest, user: any) => {
  // 业务逻辑
  return NextResponse.json({ success: true });
});

export const POST = withQuoteCreate(async (request: NextRequest, user: any) => {
  // 业务逻辑
  return NextResponse.json({ success: true });
});
```

#### 管理员相关

```typescript
import { withAdmin, withSuperAdmin } from '@/lib/permission-check';

// 需要管理员权限
export const GET = withAdmin(async (request: NextRequest, user: any) => {
  // 业务逻辑
  return NextResponse.json({ success: true });
});

// 需要超级管理员权限
export const DELETE = withSuperAdmin(async (request: NextRequest, user: any) => {
  // 业务逻辑
  return NextResponse.json({ success: true });
});
```

#### 等级和积分

```typescript
import { withLevel, withPoints } from '@/lib/permission-check';

// 需要等级 >= 2
export const POST = withLevel(2, async (request: NextRequest, user: any) => {
  // 业务逻辑
  return NextResponse.json({ success: true });
});

// 需要积分 >= 100
export const POST = withPoints(100, async (request: NextRequest, user: any) => {
  // 业务逻辑
  return NextResponse.json({ success: true });
});
```

### 方法 2：使用自定义权限配置

适用于需要特殊权限配置的场景。

```typescript
import { withPermissionCheck } from '@/lib/permission-check';

export const GET = withPermissionCheck(
  {
    permissions: ['user.view', 'user.edit'], // 需要所有权限
    requireAll: true,
    roles: ['admin', 'super_admin'],
    minLevel: 2,
    minPoints: 100,
  },
  async (request: NextRequest, user: any) => {
    // 业务逻辑
    return NextResponse.json({ success: true });
  }
);
```

### 方法 3：使用 OR/AND 权限

适用于需要灵活权限组合的场景。

```typescript
import { withAnyPermission, withAllPermissions } from '@/lib/permission-check';

// 需要任一权限（OR）
export const GET = withAnyPermission(
  ['user.view', 'user.edit'],
  async (request: NextRequest, user: any) => {
    // 业务逻辑
    return NextResponse.json({ success: true });
  }
);

// 需要所有权限（AND）
export const POST = withAllPermissions(
  ['user.delete', 'admin.users.manage'],
  async (request: NextRequest, user: any) => {
    // 业务逻辑
    return NextResponse.json({ success: true });
  }
);
```

---

## 四、迁移示例

### 示例 1：迁移用户列表 API

**迁移前：**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  const currentUser = await getCurrentUser(request);
  if (!currentUser) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const supabase = getSupabaseClient();
  const { data: userRole } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', currentUser.id)
    .single();

  if (userRole?.role !== 'admin' && userRole?.role !== 'super_admin') {
    return NextResponse.json({ error: '权限不足' }, { status: 403 });
  }

  // 业务逻辑...
  return NextResponse.json({ success: true });
}
```

**迁移后：**

```typescript
import { withAdmin } from '@/lib/permission-check';

export const GET = withAdmin(async (request: NextRequest, user: any) => {
  // 业务逻辑...
  return NextResponse.json({ success: true });
});
```

### 示例 2：迁移产品编辑 API

**迁移前：**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { userLevelService } from '@/lib/user-level-service';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function PUT(request: NextRequest) {
  const currentUser = await getCurrentUser(request);
  if (!currentUser) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const levelInfo = await userLevelService.getUserLevel(currentUser.id);
  if (!levelInfo.config.fieldPermissions.can_view_cost_price) {
    return NextResponse.json({ error: '无权查看成本价' }, { status: 403 });
  }

  // 业务逻辑...
  return NextResponse.json({ success: true });
}
```

**迁移后：**

```typescript
import { withProductEdit } from '@/lib/permission-check';

export const PUT = withProductEdit(async (request: NextRequest, user: any) => {
  // 业务逻辑...
  return NextResponse.json({ success: true });
});
```

### 示例 3：迁移报价创建 API（等级限制）

**迁移前：**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser(request);
  if (!currentUser) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const supabase = getSupabaseClient();
  const { data: user } = await supabase
    .from('users')
    .select('level')
    .eq('id', currentUser.id)
    .single();

  if (user?.level < 2) {
    return NextResponse.json({ error: '等级不足' }, { status: 403 });
  }

  // 业务逻辑...
  return NextResponse.json({ success: true });
}
```

**迁移后：**

```typescript
import { withLevel } from '@/lib/permission-check';

export const POST = withLevel(2, async (request: NextRequest, user: any) => {
  // 业务逻辑...
  return NextResponse.json({ success: true });
});
```

### 示例 4：迁移批量操作 API（多权限）

**迁移前：**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser(request);
  if (!currentUser) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const supabase = getSupabaseClient();
  const { data: userRole } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', currentUser.id)
    .single();

  if (userRole?.role !== 'super_admin') {
    return NextResponse.json({ error: '权限不足' }, { status: 403 });
  }

  // 检查其他权限...

  // 业务逻辑...
  return NextResponse.json({ success: true });
}
```

**迁移后：**

```typescript
import { withAllPermissions } from '@/lib/permission-check';

export const POST = withAllPermissions(
  ['product.edit', 'product.delete', 'admin.manage'],
  async (request: NextRequest, user: any) => {
    // 业务逻辑...
    return NextResponse.json({ success: true });
  }
);
```

---

## 五、迁移检查清单

### 迁移前

- [ ] 确认 API 路由的功能和权限需求
- [ ] 识别现有的权限检查代码
- [ ] 确定权限映射关系
- [ ] 选择合适的迁移方法

### 迁移中

- [ ] 使用新的权限系统替换旧代码
- [ ] 确保用户信息正确传递
- [ ] 保留业务逻辑不变
- [ ] 添加必要的错误处理

### 迁移后

- [ ] 测试 API 功能是否正常
- [ ] 测试权限检查是否正确
- [ ] 测试错误处理是否正常
- [ ] 检查日志输出
- [ ] 删除旧的权限检查代码

---

## 六、常见问题

### Q1：如何处理需要多个条件的权限？

使用自定义权限配置：

```typescript
export const GET = withPermissionCheck(
  {
    permissions: 'user.view',
    roles: ['admin', 'super_admin'],
    minLevel: 2,
  },
  async (request: NextRequest, user: any) => {
    // 业务逻辑
  }
);
```

### Q2：如何处理 OR 权限（有任一权限即可）？

使用 `withAnyPermission`：

```typescript
export const GET = withAnyPermission(
  ['user.view', 'user.edit'],
  async (request: NextRequest, user: any) => {
    // 业务逻辑
  }
);
```

### Q3：如何处理 AND 权限（需要所有权限）？

使用 `withAllPermissions`：

```typescript
export const POST = withAllPermissions(
  ['user.delete', 'admin.users.manage'],
  async (request: NextRequest, user: any) => {
    // 业务逻辑
  }
);
```

### Q4：如何处理等级和积分权限？

使用 `withLevel` 和 `withPoints`：

```typescript
// 等级权限
export const POST = withLevel(2, async (request: NextRequest, user: any) => {
  // 业务逻辑
});

// 积分权限
export const POST = withPoints(100, async (request: NextRequest, user: any) => {
  // 业务逻辑
});
```

### Q5：如何在业务逻辑中访问用户信息？

用户信息会作为第二个参数传递给处理函数：

```typescript
export const GET = withAdmin(async (request: NextRequest, user: any) => {
  console.log('用户ID:', user.id);
  console.log('用户角色:', user.role);
  console.log('用户等级:', user.level);
  console.log('用户积分:', user.currentPoints);

  // 业务逻辑
  return NextResponse.json({ success: true });
});
```

### Q6：迁移后原有权限检查代码是否需要删除？

是的，迁移完成后应该删除旧的权限检查代码，以保持代码整洁和一致性。

---

## 七、测试指南

### 7.1 单元测试

测试权限检查是否正确：

```typescript
import { checkPermission } from '@/lib/permission-check';

test('管理员可以访问用户列表', async () => {
  const result = await checkPermission(mockRequest, {
    roles: ['admin', 'super_admin'],
  });
  expect(result.allowed).toBe(true);
});
```

### 7.2 集成测试

测试 API 端点是否正常工作：

```bash
# 测试需要管理员权限的 API
curl http://localhost:5000/api/admin/users/demo

# 测试需要特定权限的 API
curl -X POST http://localhost:5000/api/admin/users/demo
```

### 7.3 权限测试

使用权限测试 API：

```bash
# 查看所有测试端点
curl http://localhost:5000/api/admin/permission-test/all

# 运行所有权限测试
curl -X POST http://localhost:5000/api/admin/permission-test/all

# 测试特定权限
curl http://localhost:5000/api/admin/permission-test/all/admin
curl http://localhost:5000/api/admin/permission-test/all/super-admin
```

---

## 八、迁移计划

### 优先级分类

**高优先级（立即迁移）**

- `/api/admin/levels/*` - 等级管理
- `/api/admin/users/*` - 用户管理
- `/api/admin/permissions/*` - 权限管理

**中优先级（逐步迁移）**

- `/api/admin/products/*` - 产品管理
- `/api/admin/quotes/*` - 报价管理
- `/api/admin/stats/*` - 统计分析

**低优先级（按需迁移）**

- 其他 API 路由

### 迁移时间表

| 阶段     | 时间   | 目标              |
| -------- | ------ | ----------------- |
| 第一阶段 | Week 1 | 高优先级 API 迁移 |
| 第二阶段 | Week 2 | 中优先级 API 迁移 |
| 第三阶段 | Week 3 | 低优先级 API 迁移 |
| 第四阶段 | Week 4 | 测试和优化        |

---

## 九、总结

迁移到统一权限管理系统可以带来以下好处：

✅ 代码更简洁
✅ 权限检查更统一
✅ 更容易维护和扩展
✅ 更好的错误处理
✅ 完善的权限管理能力

按照本指南进行迁移，可以确保迁移过程顺利，并最大限度地减少对现有功能的影响。
