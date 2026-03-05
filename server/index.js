const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000", // 你的Next.js前端地址
    methods: ["GET", "POST"],
    credentials: true
  },
  // 增加超时设置
  connectTimeout: 45000,
  // 允许所有传输方式
  transports: ['polling', 'websocket']
});

io.on('connection', (socket) => {
  console.log('客户端已连接:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('客户端已断开:', socket.id);
  });
});

server.listen(5000, () => {
  console.log('服务器运行在 http://localhost:5000');
});