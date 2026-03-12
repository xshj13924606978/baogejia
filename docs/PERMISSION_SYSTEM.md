# 统一权限管理系统使用文档

> 版本：v2.0.0
> 创建时间：2026-03-12

---

## 一、系统概述

统一权限管理系统是一个基于角色的访问控制（RBAC）系统，支持多层权限控制：
- **角色权限**：基于用户角色的基础权限
- **等级权限**：基于用户等级的权限控制
- **特殊权限**：为特定用户授予或撤销特殊权限

---

## 二、数据库表结构

### 2.1 permissions 表（权限定义）

存储系统中所有可用的权限定义。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| code | VARCHAR(100) | 权限代码（唯一） |
| name | VARCHAR(100) | 权限名称 |
| category | VARCHAR(50) | 权限分类 |
| description | TEXT | 权限描述 |
| resource_type | VARCHAR(50) | 资源类型（module, field, api） |
| resource_path | VARCHAR(200) | 资源路径 |
| method | VARCHAR(10) | 请求方法 |
| is_active | BOOLEAN | 是否启用 |

### 2.2 role_permissions 表（角色权限）

存储角色与权限的映射关系。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| role | VARCHAR(50) | 角色名称 |
| permission_id | INTEGER | 权限ID（外键） |
| granted | BOOLEAN | 是否授予 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

### 2.3 user_permissions 表（用户特殊权限）

存储用户的特殊权限（覆盖默认角色权限）。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| user_id | INTEGER | 用户ID（外键） |
| permission_id | INTEGER | 权限ID（外键） |
| granted | BOOLEAN | 是否授予 |
| reason | VARCHAR(200) | 原因 |
| expires_at | TIMESTAMP | 过期时间 |
| created_by | INTEGER | 操作人 |
| created_at | TIMESTAMP | 创建时间 |

---

## 三、权限代码清单

### 3.1 用户相关

| 代码 | 名称 | 说明 |
|------|------|------|
| user.view | 查看用户 | 查看用户列表和详情 |
| user.create | 创建用户 | 创建新用户 |
| user.edit | 编辑用户 | 编辑用户信息 |
| user.delete | 删除用户 | 删除用户 |
| user.manage | 管理用户 | 管理用户权限和角色 |

### 3.2 产品相关

| 代码 | 名称 | 说明 |
|------|------|------|
| product.search | 搜索产品 | 搜索产品信息 |
| product.view | 查看产品 | 查看产品详情 |
| product.edit | 编辑产品 | 编辑产品信息 |
| product.export | 导出产品 | 导出产品数据 |

### 3.3 成本相关

| 代码 | 名称 | 说明 |
|------|------|------|
| cost_price.view | 查看成本价 | 查看产品成本价 |
| min_price.view | 查看最低售价 | 查看产品最低售价 |
| manufacturer.view | 查看厂家信息 | 查看厂家信息 |

### 3.4 报价相关

| 代码 | 名称 | 说明 |
|------|------|------|
| quote.create | 创建报价 | 创建新的报价单 |
| quote.view | 查看报价 | 查看报价详情 |
| quote.edit | 编辑报价 | 编辑报价信息 |
| quote.export | 导出报价 | 导出报价数据 |

### 3.5 管理相关

| 代码 | 名称 | 说明 |
|------|------|------|
| admin.levels.view | 查看等级配置 | 查看等级配置信息 |
| admin.levels.edit | 编辑等级配置 | 编辑等级配置 |
| admin.users.view | 查看用户列表 | 查看用户列表 |
| admin.users.edit | 编辑用户 | 编辑用户信息 |

---

## 四、使用方法

### 4.1 在 API 路由中使用权限中间件

#### 方式 1：使用 withPermission 包装器

```typescript
import { withPermission } from '@/middleware/permission-middleware';

export const GET = withPermission({
  permissions: 'user.view',
  roles: ['admin', 'super_admin']
})(async (request: NextRequest) => {
  // 业务逻辑
  return NextResponse.json({ success: true });
});
```

#### 方式 2：使用便捷函数

```typescript
import { withAdmin, withSuperAdmin, withPermissionCheck } from '@/middleware/permission-middleware';

// 需要管理员权限
export const GET = withAdmin(async (request: NextRequest) => {
  return NextResponse.json({ success: true });
});

// 需要超级管理员权限
export const POST = withSuperAdmin(async (request: NextRequest) => {
  return NextResponse.json({ success: true });
});

// 需要特定权限（OR 关系）
export const PUT = withPermissionCheck('user.edit')(async (request: NextRequest) => {
  return NextResponse.json({ success: true });
});

// 需要多个权限（AND 关系）
export const DELETE = withPermissionCheck(['user.delete', 'admin.users.manage'], true)(
  async (request: NextRequest) => {
    return NextResponse.json({ success: true });
  }
);
```

#### 方式 3：手动检查权限

```typescript
import { permissionService } from '@/lib/permission-service';
import { getCurrentUser } from '@/lib/auth-utils';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);
  
  if (!user) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const hasPermission = await permissionService.hasPermission(user.id, 'user.view');
  
  if (!hasPermission) {
    return NextResponse.json({ error: '权限不足' }, { status: 403 });
  }

  // 业务逻辑
  return NextResponse.json({ success: true });
}
```

### 4.2 权限配置选项

```typescript
interface PermissionConfig {
  permissions?: string | string[];  // 需要的权限
  requireAll?: boolean;             // 是否需要所有权限（默认 false，OR 关系）
  minLevel?: number;                // 最低等级要求
  minPoints?: number;               // 最低积分要求
  roles?: string[];                 // 允许的角色列表
}
```

### 4.3 在服务中使用权限服务

```typescript
import { permissionService } from '@/lib/permission-service';

// 检查单个权限
const canView = await permissionService.hasPermission(userId, 'user.view');

// 检查多个权限（返回权限检查结果）
const permissions = await permissionService.hasPermissions(userId, [
  'user.view',
  'user.edit',
  'user.delete'
]);

// 检查是否有任一权限
const hasAny = await permissionService.hasAnyPermission(userId, [
  'user.view',
  'user.edit'
]);

// 检查是否有所有权限
const hasAll = await permissionService.hasAllPermissions(userId, [
  'user.view',
  'user.edit'
]);

// 获取用户所有权限
const userPermissions = await permissionService.getUserPermissions(userId);

// 授予临时权限
await permissionService.grantPermission(
  userId,
  'user.create',
  '临时授权，用于测试',
  new Date('2026-12-31')  // 过期时间
);

// 撤销权限
await permissionService.revokePermission(
  userId,
  'user.delete',
  '违规操作，撤销权限'
);

// 获取所有权限列表（管理员用）
const allPermissions = await permissionService.getAllPermissions();

// 获取角色的权限列表（管理员用）
const rolePermissions = await permissionService.getRolePermissions('admin');

// 更新角色权限
await permissionService.updateRolePermission(
  'admin',
  'user.delete',
  true  // 授予
);
```

---

## 五、前端权限检查

### 5.1 创建权限 Hook

```typescript
// hooks/usePermission.ts
import { useState, useEffect } from 'react';
import { getClientUser } from '@/lib/auth-utils';

export function usePermission(permission: string) {
  const [hasPermission, setHasPermission] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const checkPermission = async () => {
      const user = getClientUser();
      
      if (!user) {
        setHasPermission(false);
        setLoading(false);
        return;
      }

      try {
        const response = await fetch('/api/user/check-permission', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ permission }),
          credentials: 'include'
        });

        const data = await response.json();
        setHasPermission(data.allowed);
      } catch (error) {
        console.error('权限检查失败:', error);
        setHasPermission(false);
      } finally {
        setLoading(false);
      }
    };

    checkPermission();
  }, [permission]);

  return { hasPermission, loading };
}
```

### 5.2 创建权限组件

```typescript
// components/PermissionGuard.tsx
import { usePermission } from '@/hooks/usePermission';

interface PermissionGuardProps {
  permission: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function PermissionGuard({ permission, fallback, children }: PermissionGuardProps) {
  const { hasPermission, loading } = usePermission(permission);

  if (loading) {
    return <div>加载中...</div>;
  }

  if (!hasPermission) {
    return <>{fallback || null}</>;
  }

  return <>{children}</>;
}

// 使用示例
<PermissionGuard 
  permission="user.edit" 
  fallback={<div>无权限</div>}
>
  <Button>编辑</Button>
</PermissionGuard>
```

---

## 六、权限缓存

权限服务内置了 5 分钟的缓存机制，以提高性能。

### 6.1 缓存配置

```typescript
private readonly CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存
```

### 6.2 清除缓存

```typescript
// 清除特定用户的缓存
permissionService.clearUserCache(userId);

// 清除所有缓存
permissionService.clearAllCache(); // 需要添加此方法
```

---

## 七、最佳实践

### 7.1 权限代码命名规范

- 使用小写字母和点号分隔：`module.action`
- 示例：`user.view`, `product.edit`, `admin.users.manage`

### 7.2 权限检查位置

- **API 层**：所有 API 路由都应进行权限检查
- **数据层**：敏感数据访问时再次检查
- **前端层**：根据权限显示/隐藏功能

### 7.3 权限设计原则

1. **最小权限原则**：只授予必要的权限
2. **职责分离**：不同角色有不同的权限
3. **审计追踪**：记录所有权限变更
4. **定期审查**：定期审查和清理权限

---

## 八、常见问题

### 8.1 如何添加新权限？

1. 在 `permissions` 表中插入新权限：
```sql
INSERT INTO permissions (code, name, category, description, resource_type)
VALUES ('new.permission', '新权限', 'category', '描述', 'module');
```

2. 为角色分配权限：
```sql
INSERT INTO role_permissions (role, permission_id, granted)
SELECT 'admin', id, true FROM permissions WHERE code = 'new.permission';
```

### 8.2 如何调试权限问题？

1. 查看用户权限：
```bash
curl http://localhost:5000/api/user/permissions
```

2. 检查权限中间件日志：
```typescript
console.log('[PermissionMiddleware] 权限检查结果:', result);
```

3. 清除缓存：
```typescript
permissionService.clearUserCache(userId);
```

### 8.3 权限检查失败怎么办？

1. 检查用户是否登录
2. 检查用户角色是否正确
3. 检查权限配置是否正确
4. 查看数据库中的权限映射
5. 清除权限缓存重试

---

## 九、API 参考

### 9.1 权限服务 API

| 方法 | 说明 | 返回值 |
|------|------|--------|
| `hasPermission(userId, permission)` | 检查单个权限 | `Promise<boolean>` |
| `hasPermissions(userId, permissions)` | 检查多个权限 | `Promise<Record<string, boolean>>` |
| `hasAnyPermission(userId, permissions)` | 检查是否有任一权限 | `Promise<boolean>` |
| `hasAllPermissions(userId, permissions)` | 检查是否有所有权限 | `Promise<boolean>` |
| `getUserPermissions(userId)` | 获取用户所有权限 | `Promise<UserPermissionInfo \| null>` |
| `grantPermission(userId, permissionCode, reason, expiresAt)` | 授予临时权限 | `Promise<boolean>` |
| `revokePermission(userId, permissionCode, reason)` | 撤销权限 | `Promise<boolean>` |
| `getAllPermissions()` | 获取所有权限列表 | `Promise<Permission[]>` |
| `getRolePermissions(role)` | 获取角色的权限列表 | `Promise<RolePermission[]>` |
| `updateRolePermission(role, permissionCode, granted)` | 更新角色权限 | `Promise<boolean>` |

### 9.2 权限中间件 API

| 方法 | 说明 |
|------|------|
| `withPermission(config)` | 创建权限检查包装器 |
| `withAdmin(handler)` | 需要管理员权限 |
| `withSuperAdmin(handler)` | 需要超级管理员权限 |
| `withPermissionCheck(permission, requireAll)` | 需要特定权限 |

---

## 十、测试

### 10.1 测试 API

```bash
# 查看当前用户权限
curl http://localhost:5000/api/user/permissions

# 测试权限检查
curl http://localhost:5000/api/admin/test-permission
```

### 10.2 测试中间件

```bash
# 测试需要管理员权限的 API
curl -X POST http://localhost:5000/api/admin/test-permission

# 查看返回结果
{
  "success": true,
  "message": "权限测试通过",
  "timestamp": "2026-03-12T12:42:02.679Z"
}
```

---

## 十一、后续改进

1. **权限模板**：创建可复用的权限模板
2. **权限审计**：完善权限变更审计日志
3. **权限可视化**：创建权限管理界面
4. **权限批量操作**：支持批量授予/撤销权限
5. **权限过期提醒**：在权限即将过期时提醒管理员
6. **权限申请流程**：创建用户权限申请流程
7. **权限审批**：添加权限审批机制

---

## 十二、联系与支持

如有问题，请联系开发团队或查看项目文档。
