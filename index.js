const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// 环境变量配置
dotenv.config();

// 创建Express应用
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// 设置CORS
app.use(cors());

// 请求体解析
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

// 连接MongoDB（如果有配置）
if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('MongoDB连接成功'))
    .catch(err => console.error('MongoDB连接失败:', err));
}

// 用户数据存储（示例，实际项目应使用数据库）
const users = [];
const rooms = [];
const onlinePlayers = new Map();

// 身份验证中间件
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: '未提供Token' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_secret_key');
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: '无效的Token' });
  }
};

// API路由
app.get('/api/serverinfo', (req, res) => {
  const host = req.headers.host || 'localhost:3000';
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const serverUrl = `${protocol}://${host}`;
  const wsProtocol = protocol === 'https' ? 'wss' : 'ws';
  const wsUrl = `${wsProtocol}://${host}`;
  
  res.json({
    serverUrl,
    wsUrl,
    version: '1.0.0',
    status: 'online'
  });
});

// 健康检查API
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 用户注册API
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    // 检查用户名是否已存在
    if (users.some(user => user.username === username)) {
      return res.status(400).json({ error: '用户名已存在' });
    }
    
    // 检查邮箱是否已存在
    if (users.some(user => user.email === email)) {
      return res.status(400).json({ error: '邮箱已被注册' });
    }
    
    // 密码加密
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // 创建新用户
    const newUser = {
      id: users.length + 1,
      username,
      email,
      password: hashedPassword,
      createdAt: new Date().toISOString(),
      gamesPlayed: 0,
      gamesWon: 0,
      coins: 100
    };
    
    users.push(newUser);
    
    // 创建JWT令牌
    const token = jwt.sign({ id: newUser.id, username }, process.env.JWT_SECRET || 'default_secret_key', { expiresIn: '7d' });
    
    // 返回用户信息和令牌
    res.status(201).json({
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        createdAt: newUser.createdAt,
        gamesPlayed: newUser.gamesPlayed,
        gamesWon: newUser.gamesWon,
        coins: newUser.coins
      },
      token
    });
  } catch (error) {
    console.error('注册失败:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 用户登录API
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // 查找用户
    const user = users.find(user => user.username === username);
    
    if (!user) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    
    // 验证密码
    const isValidPassword = await bcrypt.compare(password, user.password);
    
    if (!isValidPassword) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    
    // 创建JWT令牌
    const token = jwt.sign({ id: user.id, username }, process.env.JWT_SECRET || 'default_secret_key', { expiresIn: '7d' });
    
    // 返回用户信息和令牌
    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        createdAt: user.createdAt,
        gamesPlayed: user.gamesPlayed,
        gamesWon: user.gamesWon,
        coins: user.coins
      },
      token
    });
  } catch (error) {
    console.error('登录失败:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 用户资料API
app.get('/api/user/profile', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const user = users.find(user => user.id === userId);
  
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }
  
  res.json({
    id: user.id,
    username: user.username,
    email: user.email,
    createdAt: user.createdAt,
    gamesPlayed: user.gamesPlayed,
    gamesWon: user.gamesWon,
    coins: user.coins
  });
});

// 房间相关API
app.get('/api/rooms', (req, res) => {
  // 过滤房间信息，只返回必要的字段
  const roomsInfo = rooms.map(room => ({
    id: room.id,
    name: room.name,
    hasPassword: !!room.password,
    maxPlayers: room.maxPlayers,
    players: room.players.length,
    status: room.status,
    createdAt: room.createdAt
  }));
  
  res.json(roomsInfo);
});

// Socket.IO连接处理
io.on('connection', (socket) => {
  console.log('新连接:', socket.id);
  
  // 用户认证
  socket.on('authenticate', (data) => {
    try {
      const { token } = data;
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_secret_key');
      
      const user = users.find(user => user.id === decoded.id);
      
      if (!user) {
        socket.emit('auth_error', { message: '用户不存在' });
        return;
      }
      
      // 将用户信息与socket关联
      socket.user = {
        id: user.id,
        username: user.username
      };
      
      // 将用户添加到在线玩家列表
      onlinePlayers.set(socket.id, {
        id: user.id,
        username: user.username,
        socketId: socket.id
      });
      
      // 通知客户端认证成功
      socket.emit('authenticated', {
        user: {
          id: user.id,
          username: user.username
        }
      });
      
      // 广播在线玩家列表更新
      io.emit('online_players_update', Array.from(onlinePlayers.values()));
      
    } catch (error) {
      console.error('认证失败:', error);
      socket.emit('auth_error', { message: '认证失败' });
    }
  });
  
  // 创建房间
  socket.on('create_room', (data) => {
    if (!socket.user) {
      socket.emit('error', { message: '请先登录' });
      return;
    }
    
    const { name, password, maxPlayers } = data;
    
    // 检查房间名是否已存在
    if (rooms.some(room => room.name === name)) {
      socket.emit('error', { message: '房间名已存在' });
      return;
    }
    
    // 创建新房间
    const newRoom = {
      id: `room_${Date.now()}`,
      name,
      password,
      maxPlayers: Math.min(Math.max(maxPlayers, 3), 6), // 限制3-6人
      players: [],
      host: socket.user.id,
      status: 'waiting',
      createdAt: new Date().toISOString()
    };
    
    rooms.push(newRoom);
    
    // 通知客户端房间创建成功
    socket.emit('room_created', {
      id: newRoom.id,
      name: newRoom.name
    });
    
    // 广播房间列表更新
    io.emit('rooms_update', rooms.map(room => ({
      id: room.id,
      name: room.name,
      hasPassword: !!room.password,
      maxPlayers: room.maxPlayers,
      players: room.players.length,
      status: room.status,
      createdAt: room.createdAt
    })));
  });
  
  // 加入房间
  socket.on('join_room', (data) => {
    if (!socket.user) {
      socket.emit('error', { message: '请先登录' });
      return;
    }
    
    const { roomId, password } = data;
    
    // 查找房间
    const room = rooms.find(room => room.id === roomId);
    
    if (!room) {
      socket.emit('error', { message: '房间不存在' });
      return;
    }
    
    // 检查房间是否已满
    if (room.players.length >= room.maxPlayers) {
      socket.emit('error', { message: '房间已满' });
      return;
    }
    
    // 检查房间是否需要密码
    if (room.password && room.password !== password) {
      socket.emit('error', { message: '房间密码错误' });
      return;
    }
    
    // 检查用户是否已在房间中
    if (room.players.some(player => player.id === socket.user.id)) {
      socket.emit('error', { message: '您已在该房间中' });
      return;
    }
    
    // 将用户加入房间
    room.players.push({
      id: socket.user.id,
      username: socket.user.username,
      isReady: false
    });
    
    // 将socket加入房间
    socket.join(roomId);
    
    // 通知房间内所有人有新玩家加入
    io.to(roomId).emit('player_joined', {
      playerId: socket.user.id,
      username: socket.user.username
    });
    
    // 发送房间详情给新加入的玩家
    socket.emit('room_joined', {
      id: room.id,
      name: room.name,
      players: room.players,
      host: room.host,
      status: room.status
    });
    
    // 发送系统消息
    io.to(roomId).emit('chat_message', {
      type: 'system',
      content: `${socket.user.username} 加入了房间`
    });
    
    // 广播房间列表更新
    io.emit('rooms_update', rooms.map(room => ({
      id: room.id,
      name: room.name,
      hasPassword: !!room.password,
      maxPlayers: room.maxPlayers,
      players: room.players.length,
      status: room.status,
      createdAt: room.createdAt
    })));
  });
  
  // 准备/取消准备
  socket.on('toggle_ready', (data) => {
    if (!socket.user) {
      socket.emit('error', { message: '请先登录' });
      return;
    }
    
    const { roomId } = data;
    
    // 查找房间
    const room = rooms.find(room => room.id === roomId);
    
    if (!room) {
      socket.emit('error', { message: '房间不存在' });
      return;
    }
    
    // 查找玩家
    const player = room.players.find(player => player.id === socket.user.id);
    
    if (!player) {
      socket.emit('error', { message: '您不在该房间中' });
      return;
    }
    
    // 切换准备状态
    player.isReady = !player.isReady;
    
    // 通知房间内所有人玩家状态变化
    io.to(roomId).emit('player_ready_changed', {
      playerId: socket.user.id,
      isReady: player.isReady
    });
  });
  
  // 开始游戏
  socket.on('start_game', (data) => {
    if (!socket.user) {
      socket.emit('error', { message: '请先登录' });
      return;
    }
    
    const { roomId } = data;
    
    // 查找房间
    const room = rooms.find(room => room.id === roomId);
    
    if (!room) {
      socket.emit('error', { message: '房间不存在' });
      return;
    }
    
    // 检查是否房主
    if (room.host !== socket.user.id) {
      socket.emit('error', { message: '只有房主可以开始游戏' });
      return;
    }
    
    // 检查人数是否足够
    if (room.players.length < 3) {
      socket.emit('error', { message: '至少需要3名玩家才能开始游戏' });
      return;
    }
    
    // 检查是否所有人都准备好了
    const allReady = room.players.every(player => player.id === room.host || player.isReady);
    
    if (!allReady) {
      socket.emit('error', { message: '并非所有玩家都已准备' });
      return;
    }
    
    // 更新房间状态
    room.status = 'playing';
    
    // 随机选择一名玩家作为继父
    const randomIndex = Math.floor(Math.random() * room.players.length);
    const stepfatherId = room.players[randomIndex].id;
    
    // 设置游戏数据
    room.gameData = {
      stepfatherId,
      startTime: Date.now(),
      items: [],
      capturedPlayers: []
    };
    
    // 通知房间内所有人游戏开始
    io.to(roomId).emit('game_started', {
      stepfatherId,
      players: room.players.map(player => ({
        id: player.id,
        username: player.username,
        role: player.id === stepfatherId ? 'stepfather' : 'stepson'
      }))
    });
    
    // 广播房间列表更新
    io.emit('rooms_update', rooms.map(room => ({
      id: room.id,
      name: room.name,
      hasPassword: !!room.password,
      maxPlayers: room.maxPlayers,
      players: room.players.length,
      status: room.status,
      createdAt: room.createdAt
    })));
  });
  
  // 聊天消息
  socket.on('send_message', (data) => {
    if (!socket.user) {
      socket.emit('error', { message: '请先登录' });
      return;
    }
    
    const { roomId, message } = data;
    
    // 查找房间
    const room = rooms.find(room => room.id === roomId);
    
    if (!room) {
      socket.emit('error', { message: '房间不存在' });
      return;
    }
    
    // 检查用户是否在房间中
    if (!room.players.some(player => player.id === socket.user.id)) {
      socket.emit('error', { message: '您不在该房间中' });
      return;
    }
    
    // 发送消息给房间内所有人
    io.to(roomId).emit('chat_message', {
      type: 'user',
      userId: socket.user.id,
      username: socket.user.username,
      content: message,
      timestamp: Date.now()
    });
  });
  
  // 离开房间
  socket.on('leave_room', (data) => {
    if (!socket.user) {
      socket.emit('error', { message: '请先登录' });
      return;
    }
    
    const { roomId } = data;
    
    // 查找房间
    const room = rooms.find(room => room.id === roomId);
    
    if (!room) {
      socket.emit('error', { message: '房间不存在' });
      return;
    }
    
    // 将用户从房间中移除
    const playerIndex = room.players.findIndex(player => player.id === socket.user.id);
    
    if (playerIndex === -1) {
      socket.emit('error', { message: '您不在该房间中' });
      return;
    }
    
    // 从房间玩家列表中移除
    room.players.splice(playerIndex, 1);
    
    // 将socket从房间频道中移除
    socket.leave(roomId);
    
    // 通知客户端离开成功
    socket.emit('room_left');
    
    // 如果房间为空，删除房间
    if (room.players.length === 0) {
      const roomIndex = rooms.findIndex(r => r.id === roomId);
      rooms.splice(roomIndex, 1);
    } else {
      // 如果离开的是房主，选择新房主
      if (room.host === socket.user.id) {
        room.host = room.players[0].id;
        
        // 通知房间内所有人新房主
        io.to(roomId).emit('host_changed', { newHostId: room.host });
      }
      
      // 通知房间内所有人有玩家离开
      io.to(roomId).emit('player_left', { playerId: socket.user.id });
      
      // 发送系统消息
      io.to(roomId).emit('chat_message', {
        type: 'system',
        content: `${socket.user.username} 离开了房间`
      });
    }
    
    // 广播房间列表更新
    io.emit('rooms_update', rooms.map(room => ({
      id: room.id,
      name: room.name,
      hasPassword: !!room.password,
      maxPlayers: room.maxPlayers,
      players: room.players.length,
      status: room.status,
      createdAt: room.createdAt
    })));
  });
  
  // 断开连接处理
  socket.on('disconnect', () => {
    console.log('断开连接:', socket.id);
    
    // 从在线玩家列表中移除
    onlinePlayers.delete(socket.id);
    
    // 广播在线玩家列表更新
    io.emit('online_players_update', Array.from(onlinePlayers.values()));
    
    // 如果用户在房间中，处理离开房间
    if (socket.user) {
      // 查找用户所在的房间
      const room = rooms.find(room => room.players.some(player => player.id === socket.user.id));
      
      if (room) {
        // 将用户从房间中移除
        const playerIndex = room.players.findIndex(player => player.id === socket.user.id);
        room.players.splice(playerIndex, 1);
        
        // 如果房间为空，删除房间
        if (room.players.length === 0) {
          const roomIndex = rooms.findIndex(r => r.id === room.id);
          rooms.splice(roomIndex, 1);
        } else {
          // 如果离开的是房主，选择新房主
          if (room.host === socket.user.id) {
            room.host = room.players[0].id;
            
            // 通知房间内所有人新房主
            io.to(room.id).emit('host_changed', { newHostId: room.host });
          }
          
          // 通知房间内所有人有玩家离开
          io.to(room.id).emit('player_left', { playerId: socket.user.id });
          
          // 发送系统消息
          io.to(room.id).emit('chat_message', {
            type: 'system',
            content: `${socket.user.username} 离开了房间`
          });
        }
        
        // 广播房间列表更新
        io.emit('rooms_update', rooms.map(room => ({
          id: room.id,
          name: room.name,
          hasPassword: !!room.password,
          maxPlayers: room.maxPlayers,
          players: room.players.length,
          status: room.status,
          createdAt: room.createdAt
        })));
      }
    }
  });
});

// 启动服务器
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
});

// 为了在Vercel上使用Serverless函数，我们需要导出应用
module.exports = app;