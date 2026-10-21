# 登录测试说明

## 📋 测试账号信息

### 管理员账号

| 字段   | 值                 |
| ------ | ------------------ |
| 用户名 | `admin`            |
| 密码   | `admin123`         |
| 角色   | super_admin        |
| 邮箱   | admin@example.com  |
| 电话   | 13800138000        |
| 公司   | 报个价科技有限公司 |

### 普通用户账号

| 字段   | 值               |
| ------ | ---------------- |
| 用户名 | `test`           |
| 密码   | `test123`        |
| 角色   | user             |
| 邮箱   | test@example.com |
| 电话   | 13800138001      |
| 公司   | 测试公司         |

## 🌐 访问地址

### 外网访问（推荐）

```
https://eea906de-e74a-496b-a0fb-ee58e7165f0d.dev.coze.site
```

### 本地访问

```
http://localhost:5000
```

## 🔧 命令行测试

### 1. 快速登录测试

```bash
bash test-login.sh
```

此脚本会测试：

- 管理员账号登录
- 普通用户登录
- 错误密码测试

### 2. 完整功能测试

```bash
bash test-with-login.sh
```

此脚本会测试：

- 登录功能
- 统计数据API
- 用户列表API
- 审核列表API
- 积分查询API
- 对话列表API

### 3. 手动登录测试

```bash
# 管理员登录
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# 普通用户登录
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test123"}'
```

## ✅ 测试结果

所有功能测试通过：

- ✅ 登录功能正常
- ✅ 统计数据API正常
- ✅ 用户列表API正常
- ✅ 审核列表API正常
- ✅ 积分查询API正常
- ✅ 对话列表API正常

## 📝 使用说明

1. **打开浏览器访问**: https://eea906de-e74a-496b-a0fb-ee58e7165f0d.dev.coze.site
2. **点击登录按钮**: 页面右上角或侧边栏中的"登录"按钮
3. **输入测试账号**:
   - 管理员: admin / admin123
   - 普通用户: test / test123
4. **测试功能**:
   - 对话创建与管理
   - 报价单生成
   - 用户权限管理（管理员）
   - 审核功能（管理员）
   - 积分系统
   - 实时通信（WebSocket）

## 🔍 故障排查

### 登录失败

1. 检查用户名和密码是否正确
2. 查看浏览器控制台是否有错误信息
3. 使用命令行测试API是否正常响应

### 页面无法访问

1. 检查网络连接
2. 确认服务是否正常运行（5000端口）
3. 尝试使用 https://eea906de-e74a-496b-a0fb-ee58e7165f0d.dev.coze.site

### API请求失败

1. 检查服务是否启动
2. 查看日志：`tail -n 50 /app/work/logs/bypass/app.log`
3. 使用测试脚本验证API功能

## 📞 联系支持

如有问题，请查看项目文档或联系开发团队。
