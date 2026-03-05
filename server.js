const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// 启用 CORS
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));

// 解析 JSON 请求体
app.use(express.json());

// 测试路由
app.get('/', (req, res) => {
  res.json({ 
    message: '服务器运行正常',
    time: new Date().toISOString(),
    status: 'ok'
  });
});

// API 路由测试
app.get('/api/test', (req, res) => {
  res.json({ 
    status: 'ok', 
    time: new Date().toISOString(),
    message: 'API 测试成功'
  });
});

// 模拟厂商支付 API（临时解决 500 错误）
app.get('/api/manufacturer/payment', (req, res) => {
  console.log('[API] 收到厂商支付查询请求');
  res.json({
    success: true,
    rankings: []
  });
});

app.post('/api/manufacturer/payment', (req, res) => {
  console.log('[API] 收到厂商支付创建请求', req.body);
  res.json({
    success: true,
    payment: {
      id: Date.now().toString(),
      ...req.body,
      created_at: new Date().toISOString()
    },
    message: '购买成功'
  });
});

// 模拟认证 API
app.get('/api/auth/me', (req, res) => {
  console.log('[API] 收到认证请求');
  // 返回 401 是正常的，表示未登录
  res.status(401).json({ 
    error: '未登录',
    message: '请先登录'
  });
});

// Socket.IO 配置
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['polling', 'websocket']
});

io.on('connection', (socket) => {
  console.log('✅ 客户端已连接, ID:', socket.id);
  
  // 发送欢迎消息
  socket.emit('connected', { 
    message: '连接成功', 
    id: socket.id,
    time: new Date().toISOString()
  });

  // 监听心跳
  socket.on('heartbeat', (data) => {
    console.log('收到心跳:', data);
    socket.emit('heartbeat_ack', { 
      received: data.timestamp,
      time: new Date().toISOString()
    });
  });

  // 监听报价请求
  socket.on('quote:request', (data) => {
    console.log('收到报价请求:', data);
    // 模拟处理
    setTimeout(() => {
      socket.emit('quote:complete', {
        id: Date.now().toString(),
        ...data,
        result: '报价生成成功',
        time: new Date().toISOString()
      });
    }, 2000);
  });

  socket.on('disconnect', () => {
    console.log('❌ 客户端已断开, ID:', socket.id);
  });
});

const PORT = 5000;
server.listen(PORT, () => {
  console.log(`=================================`);
  console.log(`🚀 服务器启动成功！`);
  console.log(`📡 地址: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
  console.log(`=================================`);
});