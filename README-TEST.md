## 测试账号

### 管理员账号
- **用户名**: `admin`
- **密码**: `admin123`
- **角色**: super_admin
- **权限**: 完整的管理权限，包括用户管理、审核、统计等

### 普通用户账号
- **用户名**: `test`
- **密码**: `test123`
- **角色**: user
- **权限**: 基础用户权限，可以创建对话、查询报价等

## 命令行测试

### 快速登录测试
```bash
bash test-login.sh
```

### 完整功能测试（登录后测试所有API）
```bash
bash test-with-login.sh
```

### 手动测试登录
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

## 测试结果

✅ 登录功能正常
✅ 统计数据API正常
✅ 用户列表API正常
✅ 审核列表API正常
✅ 积分查询API正常
✅ 对话列表API正常

## 浏览器访问

- **外网访问**: https://eea906de-e74a-496b-a0fb-ee58e7165f0d.dev.coze.site
- **内网访问**: http://localhost:5000 (如果在本地环境)

使用上述账号登录即可测试所有功能。
