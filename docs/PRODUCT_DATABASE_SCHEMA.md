# 产品价格库数据库字段映射文档

## 数据库表结构

### 表名：`products`

### 字段列表

| 序号 | 字段名 | 数据类型 | 说明 | 必填 |
|------|--------|----------|------|------|
| 1 | id | uuid | 主键，自动生成 | 否 |
| 2 | name | character varying | 产品名称 | 是 |
| 3 | model | character varying | 规格型号 | 否 |
| 4 | category | character varying | 分类 | 否 |
| 5 | brand | character varying | 品牌 | 否 |
| 6 | price | numeric | 指导价 | 是 |
| 7 | unit | character varying | 单位 | 否 |
| 8 | parameter_description | text | 参数描述 | 否 |
| 9 | created_at | timestamp with time zone | 创建时间，自动生成 | 否 |
| 10 | updated_at | timestamp with time zone | 更新时间，自动生成 | 否 |
| 11 | supplier | text | 供应商 | 否 |
| 12 | contact_person | text | 联系人 | 否 |
| 13 | contact_phone | text | 联系电话 | 否 |
| 14 | cost_price | numeric | 成本 | 否 |
| 15 | min_price | numeric | 最低售价 | 否 |

## Excel 导入字段映射

### 默认字段映射

| Excel 列名 | 系统字段 | 数据类型 | 说明 |
|-----------|----------|----------|------|
| 产品名称 | product_name | string | 必填 |
| 规格型号 | model | string | |
| 品牌 | brand | string | |
| 参数描述 | parameter_description | string | |
| 供应商 | supplier | string | |
| 联系人 | contact_person | string | |
| 联系电话 | contact_phone | string | |
| 单位 | unit | string | |
| 成本 | cost_price | number | |
| 最低售价 | min_price | number | |
| 指导价 | price | number | 必填 |
| 分类 | category | string | |

### 替代字段名

支持多种 Excel 列名格式：

| 系统字段 | 支持的 Excel 列名 |
|----------|------------------|
| product_name | 产品名称、product_name、name |
| model | 规格型号、型号、model |
| brand | 品牌、brand |
| parameter_description | 参数描述、parameter_description |
| supplier | 供应商、supplier |
| contact_person | 联系人、contact_person |
| contact_phone | 联系电话、电话、contact_phone |
| unit | 单位、unit |
| cost_price | 成本、cost_price |
| min_price | 最低售价、min_price |
| price | 指导价、价格、price |
| category | 分类、category |

## API 接口

### 1. 导入产品

**接口**：`POST /api/tables/products/import`

**请求体**：
```json
{
  "products": [
    {
      "产品名称": "产品A",
      "规格型号": "X-001",
      "品牌": "品牌A",
      "参数描述": "详细参数",
      "供应商": "供应商A",
      "联系人": "张三",
      "联系电话": "13800138000",
      "单位": "台",
      "成本": 800,
      "最低售价": 900,
      "指导价": 1200,
      "分类": "分类A"
    }
  ],
  "fieldMapping": {
    "product_name": "产品名称",
    "model": "规格型号",
    "brand": "品牌",
    "parameter_description": "参数描述",
    "supplier": "供应商",
    "contact_person": "联系人",
    "contact_phone": "联系电话",
    "unit": "单位",
    "cost_price": "成本",
    "min_price": "最低售价",
    "price": "指导价",
    "category": "分类"
  }
}
```

**响应**：
```json
{
  "success": true,
  "message": "成功导入 1 条产品数据",
  "successCount": 1,
  "errorCount": 0,
  "duplicateCount": 0,
  "errors": [],
  "insertedProducts": [
    {
      "id": "uuid",
      "name": "产品A",
      "model": "X-001",
      "category": "分类A",
      "brand": "品牌A",
      "price": 1200,
      "unit": "台",
      "parameter_description": "详细参数",
      "supplier": "供应商A",
      "contact_person": "张三",
      "contact_phone": "13800138000",
      "cost_price": 800,
      "min_price": 900,
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z"
    }
  ],
  "duplicateProducts": [],
  "duration": 1234
}
```

### 2. 获取产品列表

**接口**：`GET /api/tables/products/list`

**查询参数**：
- `keyword` (可选): 搜索关键词
- `page` (可选): 页码，默认 1
- `limit` (可选): 每页数量，默认 100

**响应**：
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "product_name": "产品A",
      "model": "X-001",
      "brand": "品牌A",
      "parameter_description": "详细参数",
      "unit": "台",
      "cost_price": 800,
      "min_price": 900,
      "price": 1200,
      "supplier": "供应商A",
      "contact_person": "张三",
      "contact_phone": "13800138000",
      "category": "分类A"
    }
  ],
  "total": 100,
  "count": 10,
  "duration": 123
}
```

## Excel 模板示例

### 推荐格式

| 产品名称 | 规格型号 | 品牌 | 参数描述 | 供应商 | 联系人 | 联系电话 | 单位 | 成本 | 最低售价 | 指导价 | 分类 |
|---------|---------|------|---------|--------|--------|----------|------|------|---------|--------|------|
| 产品A | X-001 | 品牌A | 详细参数描述 | 供应商A | 张三 | 13800138000 | 台 | 800 | 900 | 1200 | 分类A |
| 产品B | X-002 | 品牌B | 另一个参数描述 | 供应商B | 李四 | 13900139000 | 件 | 600 | 700 | 900 | 分类B |

### 最小必填字段

| 产品名称 | 指导价 |
|---------|--------|
| 产品C | 1500 |

## 数据验证规则

### 必填字段
- **产品名称** (product_name): 不能为空
- **指导价** (price): 必须大于 0

### 数据类型
- **数字字段** (cost_price, min_price, price): 自动转换为数值
- **字符串字段**: 自动去除前后空格

### 查重规则
- 根据产品名称 (name) + 规格型号 (model) 判断重复
- 如果名称和型号都相同，则视为重复，跳过插入

## 使用示例

### 1. 使用默认字段映射

```typescript
const response = await fetch('/api/tables/products/import', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    products: [
      {
        '产品名称': '产品A',
        '规格型号': 'X-001',
        '品牌': '品牌A',
        '指导价': 1200
      }
    ]
    // 不提供 fieldMapping，使用默认映射
  })
});
```

### 2. 使用自定义字段映射

```typescript
const response = await fetch('/api/tables/products/import', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    products: [
      {
        'Product': '产品A',
        'Model': 'X-001',
        'Brand': '品牌A',
        'Price': 1200
      }
    ],
    fieldMapping: {
      product_name: 'Product',
      model: 'Model',
      brand: 'Brand',
      price: 'Price'
    }
  })
});
```

### 3. 查询产品列表

```typescript
const response = await fetch('/api/tables/products/list?keyword=产品A&page=1&limit=10');
const result = await response.json();

console.log(result.data); // 产品列表
console.log(result.total); // 总数
```

## 测试 API

### 完整导入测试

```bash
curl -X POST http://localhost:5000/api/test/full-import
```

测试所有字段的导入和查询功能。

## 常见问题

### Q: 为什么有些字段没有保存到数据库？

A: 检查以下几点：
1. 确认 Excel 列名是否与系统字段映射一致
2. 检查是否使用了自定义字段映射
3. 查看导入 API 的错误日志

### Q: 如何处理重复产品？

A: 系统会根据产品名称和规格型号自动检测重复：
- 重复的产品会被跳过
- 导入结果中会显示重复产品数量和详情

### Q: 数字字段为什么保存失败？

A: 确保数字字段格式正确：
- 不要包含货币符号（如 ¥、$）
- 不要包含千位分隔符（如 1,000）
- 正确格式：1000.00

## 相关文件

- `src/app/api/tables/products/import/route.ts` - 导入 API
- `src/app/api/tables/products/list/route.ts` - 列表 API
- `src/app/api/test/full-import/route.ts` - 测试 API
- `docs/SQL_EXECUTION_GUIDE.md` - SQL 执行指南
