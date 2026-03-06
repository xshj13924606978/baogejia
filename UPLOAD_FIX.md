# 文件上传问题修复说明

## 问题描述
用户上传文件时，系统一直显示"请上传文件或输入产品需求"，无法完成文件上传。

## 根本原因
从日志中发现错误信息：
```
[Upload] 上传到存储失败: Error [StorageApiError]: Bucket not found
```

Supabase Storage 的 `quote-files` bucket 虽然存在，但是由于 RLS (Row Level Security) 策略的限制，anon key 无法看到 bucket 列表，导致上传失败。

## 解决方案

### 1. 修改上传路由
修改 `src/app/api/upload/route.ts`，添加自动创建 bucket 的逻辑：
- 当检测到 "Bucket not found" 错误时
- 使用 service role key 创建 bucket
- 然后重新尝试上传

### 2. 创建辅助 API
- `src/app/api/init-storage/route.ts`：手动初始化存储桶
- `src/app/api/test-upload/route.ts`：测试上传功能是否正常

## 验证结果
测试结果显示：
- ✅ Service role 可以看到和管理 bucket
- ✅ Anon key 可以上传文件到 `quote-files` bucket
- ✅ 上传功能正常工作

## 使用说明
现在可以正常使用以下功能：
1. 上传 Excel、PDF 等文件
2. 系统会自动解析 Excel 文件内容
3. AI 会基于解析的内容生成报价

## 注意事项
- 文件大小限制：10MB
- 支持的格式：PDF, Excel (xls, xlsx), Word, 文本文件, 图片
- 系统会自动合并单元格和提取多行文本内容
