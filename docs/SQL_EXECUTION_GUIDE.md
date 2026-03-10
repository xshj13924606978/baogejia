# SQL 执行与 Schema 缓存刷新指南

## 概述

项目中使用 `exec_sql` 函数执行 SQL 语句，该函数会自动检测并刷新 Supabase schema 缓存，避免因缓存导致的字段识别问题。

## 核心功能

### 自动 Schema 缓存刷新

`exec_sql` 函数会自动检测 SQL 语句类型：

- **DML 语句（数据操作）**：SELECT, INSERT, UPDATE, DELETE - 不刷新缓存
- **DDL 语句（数据定义）**：CREATE, ALTER, DROP, TRUNCATE, RENAME - **自动刷新缓存**

### 刷新原理

当检测到 DDL 语句时，函数会自动执行：
```sql
NOTIFY pgrst, 'reload schema';
```

这会通知 Supabase PostgREST 重新加载 schema 缓存，确保新增/修改的表结构能够被立即识别。

## 使用方法

### 1. 基本用法

```typescript
import { exec_sql } from '@/lib/supabase-exec';

// DML 语句（数据操作）
const result = await exec_sql(
  "SELECT * FROM products WHERE id = $1",
  [123]
);

// DDL 语句（结构变更）- 会自动刷新缓存
await exec_sql(
  "ALTER TABLE products ADD COLUMN brand VARCHAR(100);",
  []
);
```

### 2. 执行结果

函数返回 `Promise<any[]>`，包含查询结果的数组。

### 3. 错误处理

```typescript
try {
  const result = await exec_sql(sql, params);
  console.log('执行成功:', result);
} catch (error) {
  console.error('执行失败:', error);
}
```

## 日志输出

`exec_sql` 函数会输出详细的日志：

```
[exec_sql] 执行 SQL: ALTER TABLE products ADD COLUMN brand ...
[exec_sql] SQL 类型: DDL（结构变更）
[exec_sql] 参数: []
[exec_sql] ✅ SQL 执行成功，返回 0 行
[exec_sql] 检测到 DDL 语句，自动刷新 schema 缓存...
[exec_sql] ✅ Schema 缓存刷新成功
```

## 测试

可以使用测试 API 验证功能：

```bash
curl -X POST http://localhost:5000/api/test/schema-refresh
```

## 注意事项

1. **自动检测**：不需要手动判断 SQL 类型，函数会自动识别
2. **刷新不影响性能**：只对 DDL 语句刷新，DML 语句不会刷新
3. **异常处理**：即使刷新失败也不会影响主 SQL 的执行结果
4. **幂等性**：使用 `IF NOT EXISTS` 等语法避免重复执行错误

## 示例场景

### 创建新表

```typescript
await exec_sql(`
  CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );
`, []);
```

### 添加字段

```typescript
await exec_sql(`
  ALTER TABLE products 
  ADD COLUMN IF NOT EXISTS brand VARCHAR(100);
`, []);
```

### 修改字段

```typescript
await exec_sql(`
  ALTER TABLE products 
  ALTER COLUMN brand TYPE VARCHAR(200);
`, []);
```

### 删除字段

```typescript
await exec_sql(`
  ALTER TABLE products 
  DROP COLUMN IF EXISTS old_field;
`, []);
```

## 相关文件

- `src/lib/supabase-exec.ts` - SQL 执行函数
- `src/app/api/test/schema-refresh/route.ts` - 测试 API
- `src/storage/database/supabase-client.ts` - Supabase 客户端

## 最佳实践

1. **使用参数化查询**：避免 SQL 注入
   ```typescript
   // ❌ 不推荐
   await exec_sql(`SELECT * FROM products WHERE name = '${name}'`, []);
   
   // ✅ 推荐
   await exec_sql("SELECT * FROM products WHERE name = $1", [name]);
   ```

2. **使用 IF NOT EXISTS**：避免重复执行错误
   ```typescript
   await exec_sql(`
     ALTER TABLE products 
     ADD COLUMN IF NOT EXISTS brand VARCHAR(100);
   `, []);
   ```

3. **使用事务**：对于复杂操作，确保数据一致性
   ```typescript
   await exec_sql(`
     BEGIN;
     
     ALTER TABLE products ADD COLUMN brand VARCHAR(100);
     ALTER TABLE products ADD COLUMN unit VARCHAR(50);
     
     COMMIT;
   `, []);
   ```

4. **查看日志**：执行失败时检查日志输出
   ```bash
   tail -f /app/work/logs/bypass/app.log | grep exec_sql
   ```
