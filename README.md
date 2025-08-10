"# steam-auth-service" 
# Steam认证服务 - 核心版

一个简化的Steam OpenID认证服务，用于海外服务器部署。

## 🚀 快速启动

### 1. 安装依赖
```bash
npm install
```

### 2. 配置环境变量
编辑 `.env` 文件，确保以下配置正确：
- `BASE_URL`: 海外服务器域名 (https://steam.brickly.cn)
- `DOMESTIC_SERVER`: 国内服务器域名 (https://brickly.cn)

### 3. 启动服务
```bash
npm start
```

## 📡 API接口

### 健康检查
```
GET /health
```

### Steam认证流程
```
1. GET /api/steam/auth?token=xxx&redirect=/&tab=preferences
   -> 跳转到Steam登录页面

2. Steam认证完成后自动回调:
   GET /api/steam/verify?token=xxx&redirect=/&tab=preferences&openid.*=...
   -> 验证Steam签名并跳转回国内服务器
```

## 🧪 测试方法

### 1. 检查服务状态
```bash
curl https://steam.brickly.cn/health
```

### 2. 测试Steam认证跳转
在浏览器访问：
```
https://steam.brickly.cn/api/steam/auth?token=test123&redirect=/dashboard
```

应该会跳转到Steam登录页面。

## 🔧 常见问题

### 404错误
- 检查Nginx是否正确代理到3001端口
- 确认服务是否正常启动

### Steam验证失败
- 检查服务器能否访问Steam
- 确认域名SSL配置正确

## 📋 下一步
核心功能测试通过后，可以扩展为完整的MVC架构。