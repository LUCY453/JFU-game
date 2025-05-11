/**
 * 继父大逃亡 - 主脚本文件
 */

// 全局游戏对象
const Game = {
  socket: null,
  currentPage: null,
  isAuthenticated: false,
  currentRoom: null,
  isPlaying: false,
  gameData: null,
  gameLoop: null,
  playerControls: {
    up: false,
    down: false,
    left: false,
    right: false,
    action: false
  },
  
  // 游戏初始化
  init: function() {
    // 显示加载界面
    this.showLoadingScreen();
    
    // 检查用户认证状态
    this.checkAuth();
    
    // 初始化页面内容
    this.initPageContent();
    
    // 初始化事件监听
    this.initEventListeners();
    
    // 隐藏加载界面
    setTimeout(() => {
      this.hideLoadingScreen();
    }, 1500);
  },
  
  // 显示加载界面
  showLoadingScreen: function() {
    const loadingScreen = document.getElementById('loadingScreen');
    const loadingProgress = document.getElementById('loadingProgress');
    
    // 重置进度条
    loadingProgress.style.width = '0%';
    
    // 显示加载界面
    loadingScreen.classList.remove('hidden');
    
    // 模拟加载进度
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 10;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
      }
      loadingProgress.style.width = `${progress}%`;
    }, 200);
  },
  
  // 隐藏加载界面
  hideLoadingScreen: function() {
    const loadingScreen = document.getElementById('loadingScreen');
    loadingScreen.classList.add('hidden');
  },
  
  // 检查用户认证状态
  checkAuth: function() {
    const token = Utils.getLocalStorage('token');
    const user = Utils.getLocalStorage('user');
    
    if (token && user) {
      this.isAuthenticated = true;
      this.showUserPanel(user);
      
      // 如果已登录，则连接WebSocket
      this.connectSocket(token);
    } else {
      this.isAuthenticated = false;
      this.showAuthPage();
    }
  },
  
  // 连接WebSocket
  connectSocket: function(token) {
    // 获取WebSocket URL
    const wsUrl = Utils.GameDataManager.wsUrl || window.location.origin;
    
    // 创建Socket.IO连接
    this.socket = io(wsUrl, {
      transports: ['websocket'],
      upgrade: false
    });
    
    // 连接事件
    this.socket.on('connect', () => {
      console.log('Socket连接成功');
      
      // 认证
      this.socket.emit('authenticate', { token });
    });
    
    // 认证成功事件
    this.socket.on('authenticated', (data) => {
      console.log('认证成功:', data);
      
      // 加载大厅页面
      if (!this.currentPage) {
        this.loadPage('lobby');
      }
    });
    
    // 认证错误事件
    this.socket.on('auth_error', (data) => {
      console.error('认证错误:', data);
      
      // 清除认证信息
      Utils.GameDataManager.clearUserData();
      
      // 显示登录页面
      this.isAuthenticated = false;
      this.showAuthPage();
      
      // 显示错误通知
      Utils.showNotification('登录已过期，请重新登录', 5000);
    });
    
    // 错误事件
    this.socket.on('error', (data) => {
      console.error('Socket错误:', data);
      Utils.showNotification(data.message, 5000);
    });
    
    // 在线玩家更新事件
    this.socket.on('online_players_update', (players) => {
      this.updateOnlinePlayers(players);
    });
    
    // 房间列表更新事件
    this.socket.on('rooms_update', (rooms) => {
      this.updateRoomsList(rooms);
    });
    
    // 房间创建成功事件
    this.socket.on('room_created', (data) => {
      console.log('房间创建成功:', data);
      
      // 关闭创建房间模态框
      this.closeAllModals();
      
      // 加入创建的房间
      this.joinRoom(data.id);
    });
    
    // 加入房间成功事件
    this.socket.on('room_joined', (roomData) => {
      console.log('加入房间成功:', roomData);
      
      // 关闭加入房间模态框
      this.closeAllModals();
      
      // 保存当前房间信息
      this.currentRoom = roomData;
      
      // 加载房间页面
      this.loadPage('room');
      
      // 更新房间信息
      this.updateRoomInfo(roomData);
    });
    
    // 玩家加入房间事件
    this.socket.on('player_joined', (data) => {
      console.log('玩家加入房间:', data);
      
      // 如果在房间页面，则更新玩家列表
      if (this.currentPage === 'room' && this.currentRoom) {
        // 添加玩家到当前房间
        this.currentRoom.players.push({
          id: data.playerId,
          username: data.username,
          isReady: false
        });
        
        // 更新玩家列表显示
        this.updatePlayersInRoom();
      }
    });
    
    // 玩家离开房间事件
    this.socket.on('player_left', (data) => {
      console.log('玩家离开房间:', data);
      
      // 如果在房间页面，则更新玩家列表
      if (this.currentPage === 'room' && this.currentRoom) {
        // 从当前房间移除玩家
        const playerIndex = this.currentRoom.players.findIndex(p => p.id === data.playerId);
        if (playerIndex !== -1) {
          this.currentRoom.players.splice(playerIndex, 1);
        }
        
        // 更新玩家列表显示
        this.updatePlayersInRoom();
      }
    });
    
    // 房主变更事件
    this.socket.on('host_changed', (data) => {
      console.log('新房主:', data);
      
      // 如果在房间页面，则更新房主信息
      if (this.currentPage === 'room' && this.currentRoom) {
        this.currentRoom.host = data.newHostId;
        
        // 更新房间控制按钮
        this.updateRoomControls();
        
        // 更新玩家列表显示
        this.updatePlayersInRoom();
      }
    });
    
    // 玩家准备状态变更事件
    this.socket.on('player_ready_changed', (data) => {
      console.log('玩家准备状态变更:', data);
      
      // 如果在房间页面，则更新玩家准备状态
      if (this.currentPage === 'room' && this.currentRoom) {
        // 更新玩家准备状态
        const player = this.currentRoom.players.find(p => p.id === data.playerId);
        if (player) {
          player.isReady = data.isReady;
        }
        
        // 更新玩家列表显示
        this.updatePlayersInRoom();
      }
    });
    
    // 游戏开始事件
    this.socket.on('game_started', (gameData) => {
      console.log('游戏开始:', gameData);
      
      // 设置游戏状态
      this.isPlaying = true;
      
      // 保存游戏数据
      this.gameData = gameData;
      
      // 播放游戏开始音效
      Utils.SoundManager.play('gameStart');
      
      // 加载游戏页面
      this.loadPage('game');
      
      // 初始化游戏
      this.initGame(gameData);
    });
    
    // 聊天消息事件
    this.socket.on('chat_message', (message) => {
      console.log('收到消息:', message);
      
      // 如果在房间页面或游戏页面，则显示消息
      if ((this.currentPage === 'room' || this.currentPage === 'game') && this.currentRoom) {
        this.addChatMessage(message);
      }
    });
    
    // 游戏事件
    this.socket.on('game_event', (event) => {
      console.log('游戏事件:', event);
      
      // 如果正在游戏中，则处理游戏事件
      if (this.isPlaying) {
        this.handleGameEvent(event);
      }
    });
    
    // 游戏状态更新事件
    this.socket.on('game_state_update', (state) => {
      // 如果正在游戏中，则更新游戏状态
      if (this.isPlaying) {
        this.updateGameState(state);
      }
    });
    
    // 游戏结束事件
    this.socket.on('game_over', (results) => {
      console.log('游戏结束:', results);
      
      // 设置游戏状态
      this.isPlaying = false;
      
      // 停止游戏循环
      if (this.gameLoop) {
        cancelAnimationFrame(this.gameLoop);
        this.gameLoop = null;
      }
      
      // 播放游戏结束音效
      Utils.SoundManager.play('gameOver');
      
      // 显示游戏结果
      this.showGameResults(results);
    });
    
    // 离开房间成功事件
    this.socket.on('room_left', () => {
      console.log('成功离开房间');
      
      // 清除当前房间信息
      this.currentRoom = null;
      
      // 加载大厅页面
      this.loadPage('lobby');
    });
    
    // 连接错误事件
    this.socket.on('connect_error', (error) => {
      console.error('连接错误:', error);
      Utils.showNotification('服务器连接失败，请检查网络', 5000);
    });
    
    // 断开连接事件
    this.socket.on('disconnect', (reason) => {
      console.log('断开连接:', reason);
      
      if (reason === 'io server disconnect') {
        // 服务器主动断开连接，尝试重新连接
        this.socket.connect();
      }
      
      Utils.showNotification('与服务器断开连接', 5000);
    });
  },
  
  // 初始化页面内容
  initPageContent: function() {
    // 根据认证状态显示适当的页面
    if (this.isAuthenticated) {
      this.loadPage('lobby');
    } else {
      this.showAuthPage();
    }
  },
  
  // 初始化事件监听
  initEventListeners: function() {
    // 导航链接点击事件
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const page = link.getAttribute('data-page');
        
        // 如果当前正在游戏中，询问是否要离开
        if (this.isPlaying && page !== 'game') {
          if (confirm('正在游戏中，确定要离开吗？')) {
            this.isPlaying = false;
            this.loadPage(page);
          }
        } else {
          this.loadPage(page);
        }
      });
    });
    
    // 登出按钮点击事件
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.logout();
      });
    }
    
    // 监听窗口大小改变事件，实现响应式
    window.addEventListener('resize', this.handleResize.bind(this));
    
    // 初始调用一次，设置初始状态
    this.handleResize();
  },
  
  // 处理窗口大小改变
  handleResize: function() {
    // 检测设备类型
    const device = Utils.checkDevice();
    
    // 根据设备类型和窗口宽度调整UI
    if (device.isMobile || window.innerWidth < 768) {
      document.body.classList.add('mobile-view');
      document.body.classList.remove('desktop-view');
    } else {
      document.body.classList.add('desktop-view');
      document.body.classList.remove('mobile-view');
    }
  },
  
  // 显示用户面板
  showUserPanel: function(user) {
    const userPanel = document.getElementById('userPanel');
    
    if (userPanel) {
      // 设置用户头像和名称
      document.getElementById('userAvatar').src = user.avatar || 'img/default-avatar.png';
      document.getElementById('userName').textContent = user.username;
      
      // 显示用户面板
      userPanel.classList.remove('hidden');
      
      // 隐藏登录/注册按钮
      document.getElementById('authButtons').classList.add('hidden');
    }
  },
  
  // 显示认证页面
  showAuthPage: function() {
    // 加载认证页面
    this.loadPage('auth');
    
    // 初始化认证表单事件
    this.initAuthForm();
  },
  
  // 初始化认证表单
  initAuthForm: function() {
    // 防止重复初始化
    if (document.querySelector('.auth-form-initialized')) {
      return;
    }
    
    // 标记表单已初始化
    document.querySelectorAll('form').forEach(form => {
      form.classList.add('auth-form-initialized');
    });
    
    // 切换登录/注册标签
    document.querySelectorAll('.auth-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        // 移除所有标签的活动状态
        document.querySelectorAll('.auth-tab-btn').forEach(b => {
          b.classList.remove('active');
        });
        
        // 移除所有表单的活动状态
        document.querySelectorAll('.auth-tab').forEach(tab => {
          tab.classList.remove('active');
        });
        
        // 设置当前标签和表单为活动状态
        btn.classList.add('active');
        document.getElementById(btn.getAttribute('data-tab')).classList.add('active');
      });
    });
    
    // 登录表单提交
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        // 获取表单数据
        const username = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;
        
        // 简单验证
        if (!username || !password) {
          return Utils.showNotification('请填写完整的登录信息', 3000);
        }
        
        // 显示加载状态
        document.getElementById('loginBtn').disabled = true;
        document.getElementById('loginBtn').textContent = '登录中...';
        
        // 发送登录请求
        fetch('/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ username, password })
        })
        .then(response => response.json())
        .then(data => {
          // 恢复按钮状态
          document.getElementById('loginBtn').disabled = false;
          document.getElementById('loginBtn').textContent = '登录';
          
          if (data.error) {
            // 显示错误消息
            Utils.showNotification(data.error, 3000);
          } else {
            // 保存认证信息
            Utils.GameDataManager.saveUserData(data.user, data.token);
            
            // 更新认证状态
            this.isAuthenticated = true;
            this.showUserPanel(data.user);
            
            // 连接WebSocket
            this.connectSocket(data.token);
            
            // 加载大厅页面
            this.loadPage('lobby');
            
            // 播放成功音效
            Utils.SoundManager.play('notification');
            
            // 显示欢迎消息
            Utils.showNotification(`欢迎回来，${data.user.username}！`, 3000);
          }
        })
        .catch(error => {
          console.error('登录失败:', error);
          
          // 恢复按钮状态
          document.getElementById('loginBtn').disabled = false;
          document.getElementById('loginBtn').textContent = '登录';
          
          // 显示错误消息
          Utils.showNotification('登录失败，请稍后重试', 3000);
        });
      });
    }
    
    // 注册表单提交
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
      registerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        // 获取表单数据
        const username = document.getElementById('registerUsername').value;
        const email = document.getElementById('registerEmail').value;
        const password = document.getElementById('registerPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        
        // 简单验证
        if (!username || !email || !password || !confirmPassword) {
          return Utils.showNotification('请填写完整的注册信息', 3000);
        }
        
        if (password !== confirmPassword) {
          return Utils.showNotification('两次输入的密码不一致', 3000);
        }
        
        // 显示加载状态
        document.getElementById('registerBtn').disabled = true;
        document.getElementById('registerBtn').textContent = '注册中...';
        
        // 发送注册请求
        fetch('/api/auth/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ username, email, password })
        })
        .then(response => response.json())
        .then(data => {
          // 恢复按钮状态
          document.getElementById('registerBtn').disabled = false;
          document.getElementById('registerBtn').textContent = '注册';
          
          if (data.error) {
            // 显示错误消息
            Utils.showNotification(data.error, 3000);
          } else {
            // 保存认证信息
            Utils.GameDataManager.saveUserData(data.user, data.token);
            
            // 更新认证状态
            this.isAuthenticated = true;
            this.showUserPanel(data.user);
            
            // 连接WebSocket
            this.connectSocket(data.token);
            
            // 加载大厅页面
            this.loadPage('lobby');
            
            // 播放成功音效
            Utils.SoundManager.play('notification');
            
            // 显示欢迎消息
            Utils.showNotification(`欢迎加入，${data.user.username}！`, 3000);
          }
        })
        .catch(error => {
          console.error('注册失败:', error);
          
          // 恢复按钮状态
          document.getElementById('registerBtn').disabled = false;
          document.getElementById('registerBtn').textContent = '注册';
          
          // 显示错误消息
          Utils.showNotification('注册失败，请稍后重试', 3000);
        });
      });
    }
  },
  
  // 加载页面内容
  loadPage: function(pageName) {
    // 防止重复加载相同页面
    if (pageName === this.currentPage) {
      return;
    }
    
    // 更新当前页面标记
    this.currentPage = pageName;
    
    // 更新导航链接状态
    document.querySelectorAll('.nav-link').forEach(link => {
      if (link.getAttribute('data-page') === pageName) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
    
    // 获取内容容器
    const contentContainer = document.getElementById('content');
    
    // 显示加载中状态
    contentContainer.innerHTML = '<div class="loading">加载中...</div>';
    
    // 根据页面名称加载不同内容
    switch (pageName) {
      case 'auth':
        this.loadAuthPage(contentContainer);
        break;
      case 'lobby':
        this.loadLobbyPage(contentContainer);
        break;
      case 'room':
        this.loadRoomPage(contentContainer);
        break;
      case 'game':
        this.loadGamePage(contentContainer);
        break;
      case 'gameOver':
        this.loadGameOverPage(contentContainer);
        break;
      case 'shop':
        this.loadShopPage(contentContainer);
        break;
      case 'rules':
        this.loadRulesPage(contentContainer);
        break;
      case 'profile':
        this.loadProfilePage(contentContainer);
        break;
      default:
        contentContainer.innerHTML = '<div class="error-message">页面不存在</div>';
    }
  },
  
  // 加载认证页面
  loadAuthPage: function(container) {
    container.innerHTML = `
      <div class="auth-container">
        <div class="auth-logo">
          <img src="img/logo.png" alt="继父大逃亡">
          <h1>继父大逃亡</h1>
        </div>
        
        <div class="auth-tabs">
          <button class="auth-tab-btn active" data-tab="loginTab">登录</button>
          <button class="auth-tab-btn" data-tab="registerTab">注册</button>
        </div>
        
        <div id="loginTab" class="auth-tab active">
          <form id="loginForm">
            <div class="form-group">
              <label for="loginUsername">用户名</label>
              <input type="text" id="loginUsername" placeholder="请输入用户名" required>
            </div>
            
            <div class="form-group">
              <label for="loginPassword">密码</label>
              <input type="password" id="loginPassword" placeholder="请输入密码" required>
            </div>
            
            <button type="submit" id="loginBtn" class="btn primary-btn" style="width: 100%;">登录</button>
          </form>
        </div>
        
        <div id="registerTab" class="auth-tab">
          <form id="registerForm">
            <div class="form-group">
              <label for="registerUsername">用户名</label>
              <input type="text" id="registerUsername" placeholder="请输入用户名" required>
            </div>
            
            <div class="form-group">
              <label for="registerEmail">邮箱</label>
              <input type="email" id="registerEmail" placeholder="请输入邮箱" required>
            </div>
            
            <div class="form-group">
              <label for="registerPassword">密码</label>
              <input type="password" id="registerPassword" placeholder="请输入密码" required>
            </div>
            
            <div class="form-group">
              <label for="confirmPassword">确认密码</label>
              <input type="password" id="confirmPassword" placeholder="请再次输入密码" required>
            </div>
            
            <button type="submit" id="registerBtn" class="btn primary-btn" style="width: 100%;">注册</button>
          </form>
        </div>
      </div>
    `;
    
    // 初始化认证表单
    this.initAuthForm();
  },
  
  // 加载大厅页面
  loadLobbyPage: function(container) {
    // 检查是否已认证
    if (!this.isAuthenticated) {
      this.showAuthPage();
      return;
    }
    
    container.innerHTML = `
      <div class="lobby-container">
        <div class="rooms-section">
          <div class="rooms-header">
            <h2>游戏房间</h2>
            <button id="createRoomBtn" class="btn primary-btn">创建房间</button>
          </div>
          
          <div class="rooms-filter">
            <input type="text" id="roomSearch" placeholder="搜索房间">
            <select id="roomFilter">
              <option value="all">所有房间</option>
              <option value="waiting">等待中</option>
              <option value="playing">游戏中</option>
            </select>
          </div>
          
          <div id="roomsList" class="rooms-list">
            <div class="loading">加载房间列表中...</div>
          </div>
        </div>
        
        <div class="lobby-sidebar">
          <div class="online-players">
            <h3>在线玩家</h3>
            <div id="onlinePlayersList">
              <div class="loading">加载玩家列表中...</div>
            </div>
          </div>
          
          <div class="game-news">
            <h3>游戏公告</h3>
            <ul>
              <li>
                <span class="news-date">2023-04-10</span>
                欢迎来到《继父大逃亡》!
              </li>
              <li>
                <span class="news-date">2023-04-05</span>
                游戏正式上线，祝大家游戏愉快!
              </li>
            </ul>
          </div>
        </div>
      </div>
    `;
    
    // 初始化大厅页面事件
    this.initLobbyEvents();
    
    // 获取房间列表
    this.fetchRooms();
    
    // 如果已连接Socket，获取在线玩家列表
    if (this.socket && this.socket.connected) {
      this.socket.emit('get_online_players');
    }
  },
  
  // 初始化大厅页面事件
  initLobbyEvents: function() {
    // 创建房间按钮
    const createRoomBtn = document.getElementById('createRoomBtn');
    if (createRoomBtn) {
      createRoomBtn.addEventListener('click', () => {
        this.showCreateRoomModal();
      });
    }
    
    // 房间搜索框
    const roomSearch = document.getElementById('roomSearch');
    if (roomSearch) {
      roomSearch.addEventListener('input', Utils.debounce(() => {
        this.filterRooms();
      }, 300));
    }
    
    // 房间过滤下拉框
    const roomFilter = document.getElementById('roomFilter');
    if (roomFilter) {
      roomFilter.addEventListener('change', () => {
        this.filterRooms();
      });
    }
  },
  
  // 显示创建房间模态框
  showCreateRoomModal: function() {
    // 创建模态框
    const modalHtml = `
      <div class="modal-header">
        <h3>创建房间</h3>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-body">
        <form id="createRoomForm">
          <div class="form-group">
            <label for="roomName">房间名称</label>
            <input type="text" id="roomName" placeholder="请输入房间名称" required>
          </div>
          
          <div class="form-group">
            <label for="roomPassword">房间密码 (可选)</label>
            <input type="password" id="roomPassword" placeholder="留空表示无密码">
          </div>
          
          <div class="form-group">
            <label for="maxPlayers">最大玩家数</label>
            <select id="maxPlayers">
              <option value="3">3人</option>
              <option value="4" selected>4人</option>
              <option value="5">5人</option>
              <option value="6">6人</option>
            </select>
          </div>
        </form>
      </div>
      <div class="modal-footer">
        <button class="btn secondary-btn modal-close">取消</button>
        <button class="btn primary-btn" id="createRoomSubmit">创建</button>
      </div>
    `;
    
    this.showModal(modalHtml);
    
    // 绑定创建房间按钮事件
    document.getElementById('createRoomSubmit').addEventListener('click', () => {
      const roomName = document.getElementById('roomName').value;
      const roomPassword = document.getElementById('roomPassword').value;
      const maxPlayers = parseInt(document.getElementById('maxPlayers').value);
      // 简单验证
      if (!roomName) {
        return Utils.showNotification('请输入房间名称', 3000);
      }
      
      // 检查名称长度
      if (roomName.length < 3 || roomName.length > 20) {
        return Utils.showNotification('房间名称长度应在3-20个字符之间', 3000);
      }
      
      // 创建房间
      this.socket.emit('create_room', {
        name: roomName,
        password: roomPassword,
        maxPlayers: maxPlayers
      });
    });
  },
  
  // 加入房间
  joinRoom: function(roomId, password) {
    this.socket.emit('join_room', {
      roomId: roomId,
      password: password || ''
    });
  },
  
  // 显示加入房间模态框（带密码）
  showJoinRoomModal: function(roomId, roomName) {
    // 创建模态框
    const modalHtml = `
      <div class="modal-header">
        <h3>加入房间</h3>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-body">
        <p>您正在加入房间: <b>${roomName}</b></p>
        <form id="joinRoomForm">
          <div class="form-group">
            <label for="roomPasswordJoin">房间密码</label>
            <input type="password" id="roomPasswordJoin" placeholder="请输入房间密码" required>
          </div>
        </form>
      </div>
      <div class="modal-footer">
        <button class="btn secondary-btn modal-close">取消</button>
        <button class="btn primary-btn" id="joinRoomSubmit">加入</button>
      </div>
    `;
    
    this.showModal(modalHtml);
    
    // 绑定加入房间按钮事件
    document.getElementById('joinRoomSubmit').addEventListener('click', () => {
      const password = document.getElementById('roomPasswordJoin').value;
      
      // 加入房间
      this.joinRoom(roomId, password);
    });
  },
  
  // 显示模态框
  showModal: function(content) {
    // 创建模态框容器
    const modalContainer = document.createElement('div');
    modalContainer.className = 'modal-container';
    
    // 创建模态框
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = content;
    
    // 添加到容器
    modalContainer.appendChild(modal);
    
    // 添加到body
    document.body.appendChild(modalContainer);
    
    // 显示模态框
    setTimeout(() => {
      modalContainer.classList.add('active');
    }, 10);
    
    // 绑定关闭按钮事件
    modalContainer.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => {
        this.closeModal(modalContainer);
      });
    });
    
    // 点击模态框外部关闭
    modalContainer.addEventListener('click', (e) => {
      if (e.target === modalContainer) {
        this.closeModal(modalContainer);
      }
    });
  },
  
  // 关闭模态框
  closeModal: function(modalContainer) {
    modalContainer.classList.remove('active');
    
    // 延迟移除DOM元素
    setTimeout(() => {
      document.body.removeChild(modalContainer);
    }, 300);
  },
  
  // 关闭所有模态框
  closeAllModals: function() {
    document.querySelectorAll('.modal-container').forEach(modal => {
      this.closeModal(modal);
    });
  },
  
  // 获取房间列表
  fetchRooms: function() {
    const roomsList = document.getElementById('roomsList');
    
    if (!roomsList) {
      return;
    }
    
    // 显示加载中
    roomsList.innerHTML = '<div class="loading">加载房间列表中...</div>';
    
    // 获取房间列表
    fetch('/api/rooms')
      .then(response => response.json())
      .then(rooms => {
        // 更新房间列表
        this.updateRoomsList(rooms);
      })
      .catch(error => {
        console.error('获取房间列表失败:', error);
        roomsList.innerHTML = '<div class="error-message">获取房间列表失败，请刷新重试</div>';
      });
  },
  
  // 更新房间列表
  updateRoomsList: function(rooms) {
    const roomsList = document.getElementById('roomsList');
    
    if (!roomsList) {
      return;
    }
    
    // 保存房间列表
    this.rooms = rooms;
    
    // 应用过滤
    this.filterRooms();
  },
  
  // 过滤房间列表
  filterRooms: function() {
    const roomsList = document.getElementById('roomsList');
    const roomSearch = document.getElementById('roomSearch');
    const roomFilter = document.getElementById('roomFilter');
    
    if (!roomsList || !this.rooms) {
      return;
    }
    
    // 获取过滤条件
    const searchText = roomSearch ? roomSearch.value.toLowerCase() : '';
    const filterValue = roomFilter ? roomFilter.value : 'all';
    
    // 过滤房间
    const filteredRooms = this.rooms.filter(room => {
      // 名称搜索
      const nameMatch = room.name.toLowerCase().includes(searchText);
      
      // 状态过滤
      let statusMatch = true;
      if (filterValue === 'waiting') {
        statusMatch = room.status === 'waiting';
      } else if (filterValue === 'playing') {
        statusMatch = room.status === 'playing';
      }
      
      return nameMatch && statusMatch;
    });
    
    // 如果没有房间
    if (filteredRooms.length === 0) {
      roomsList.innerHTML = '<div class="empty-message">没有找到符合条件的房间</div>';
      return;
    }
    
    // 生成房间列表HTML
    let html = '';
    filteredRooms.forEach(room => {
      const statusClass = room.status === 'waiting' ? 'status-waiting' : 'status-playing';
      const statusText = room.status === 'waiting' ? '等待中' : '游戏中';
      const lockIcon = room.hasPassword ? '<i class="fas fa-lock"></i>' : '';
      
      html += `
        <div class="room-item" data-id="${room.id}">
          <div class="room-info">
            <h4>${room.name} ${lockIcon}</h4>
            <div class="room-meta">
              <span class="room-players">${room.players}/${room.maxPlayers}人</span>
              <span class="room-status ${statusClass}">${statusText}</span>
            </div>
          </div>
          <button class="btn ${room.status === 'waiting' ? 'primary-btn' : 'secondary-btn'} join-room-btn" ${room.status === 'playing' || room.players >= room.maxPlayers ? 'disabled' : ''}>
            ${room.status === 'waiting' && room.players < room.maxPlayers ? '加入' : '已满'}
          </button>
        </div>
      `;
    });
    
    roomsList.innerHTML = html;
    
    // 绑定加入房间按钮事件
    roomsList.querySelectorAll('.join-room-btn:not([disabled])').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const roomId = btn.closest('.room-item').getAttribute('data-id');
        const room = this.rooms.find(r => r.id === roomId);
        
        if (room.hasPassword) {
          // 显示密码输入模态框
          this.showJoinRoomModal(roomId, room.name);
        } else {
          // 直接加入房间
          this.joinRoom(roomId);
        }
      });
    });
  },
  
  // 更新在线玩家列表
  updateOnlinePlayers: function(players) {
    const onlinePlayersList = document.getElementById('onlinePlayersList');
    
    if (!onlinePlayersList) {
      return;
    }
    
    // 如果没有玩家
    if (players.length === 0) {
      onlinePlayersList.innerHTML = '<div class="empty-message">当前没有在线玩家</div>';
      return;
    }
    
    // 生成玩家列表HTML
    let html = '<ul class="players-list">';
    players.forEach(player => {
      html += `
        <li class="player-item">
          <div class="player-avatar">
            <img src="img/default-avatar.png" alt="${player.username}">
          </div>
          <div class="player-name">${player.username}</div>
        </li>
      `;
    });
    html += '</ul>';
    
    onlinePlayersList.innerHTML = html;
  },
  
  // 加载房间页面
  loadRoomPage: function(container) {
    // 检查是否已认证
    if (!this.isAuthenticated) {
      this.showAuthPage();
      return;
    }
    
    // 检查是否有房间信息
    if (!this.currentRoom) {
      this.loadPage('lobby');
      return;
    }
    
    container.innerHTML = `
      <div class="room-container">
        <div class="room-header">
          <h2>房间：${this.currentRoom.name}</h2>
          <button id="leaveRoomBtn" class="btn danger-btn">离开房间</button>
        </div>
        
        <div class="room-content">
          <div class="players-panel">
            <h3>玩家列表</h3>
            <div id="roomPlayersList" class="room-players-list">
              <div class="loading">加载玩家列表中...</div>
            </div>
          </div>
          
          <div class="chat-panel">
            <h3>聊天</h3>
            <div id="chatMessages" class="chat-messages"></div>
            <div class="chat-input">
              <input type="text" id="chatInput" placeholder="输入消息...">
              <button id="sendChatBtn" class="btn primary-btn">发送</button>
            </div>
          </div>
        </div>
        
        <div class="room-footer">
          <div class="room-controls">
            <button id="toggleReadyBtn" class="btn primary-btn">准备</button>
            <button id="startGameBtn" class="btn success-btn" disabled>开始游戏</button>
          </div>
        </div>
      </div>
    `;
    
    // 初始化房间页面事件
    this.initRoomEvents();
    
    // 更新房间信息
    this.updateRoomInfo(this.currentRoom);
  },
  
  // 初始化房间页面事件
  initRoomEvents: function() {
    // 离开房间按钮
    const leaveRoomBtn = document.getElementById('leaveRoomBtn');
    if (leaveRoomBtn) {
      leaveRoomBtn.addEventListener('click', () => {
        if (confirm('确定要离开房间吗？')) {
          this.socket.emit('leave_room', { roomId: this.currentRoom.id });
        }
      });
    }
    
    // 准备按钮
    const toggleReadyBtn = document.getElementById('toggleReadyBtn');
    if (toggleReadyBtn) {
      toggleReadyBtn.addEventListener('click', () => {
        this.socket.emit('toggle_ready', { roomId: this.currentRoom.id });
      });
    }
    
    // 开始游戏按钮
    const startGameBtn = document.getElementById('startGameBtn');
    if (startGameBtn) {
      startGameBtn.addEventListener('click', () => {
        this.socket.emit('start_game', { roomId: this.currentRoom.id });
      });
    }
    
    // 发送聊天消息
    const sendChatBtn = document.getElementById('sendChatBtn');
    const chatInput = document.getElementById('chatInput');
    
    if (sendChatBtn && chatInput) {
      // 发送按钮点击事件
      sendChatBtn.addEventListener('click', () => {
        this.sendChatMessage();
      });
      
      // 输入框回车事件
      chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.sendChatMessage();
        }
      });
    }
  },
  
  // 发送聊天消息
  sendChatMessage: function() {
    const chatInput = document.getElementById('chatInput');
    
    if (!chatInput || !this.currentRoom) {
      return;
    }
    
    const message = chatInput.value.trim();
    
    if (!message) {
      return;
    }
    
    // 发送消息
    this.socket.emit('send_message', {
      roomId: this.currentRoom.id,
      message: message
    });
    
    // 清空输入框
    chatInput.value = '';
  },
  
  // 添加聊天消息
  addChatMessage: function(message) {
    const chatMessages = document.getElementById('chatMessages');
    
    if (!chatMessages) {
      return;
    }
    
    // 创建消息元素
    const messageEl = document.createElement('div');
    messageEl.className = `chat-message ${message.type}-message`;
    
    // 设置消息内容
    if (message.type === 'system') {
      messageEl.innerHTML = `<span class="system-message-content">${message.content}</span>`;
    } else {
      messageEl.innerHTML = `
        <span class="message-sender">${message.username}:</span>
        <span class="message-content">${message.content}</span>
      `;
    }
    
    // 添加到聊天区域
    chatMessages.appendChild(messageEl);
    
    // 滚动到底部
    chatMessages.scrollTop = chatMessages.scrollHeight;
  },
  
  // 更新房间信息
  updateRoomInfo: function(room) {
    // 更新房间玩家列表
    this.updatePlayersInRoom();
    
    // 更新房间控制按钮
    this.updateRoomControls();
  },
  
  // 更新房间玩家列表
  updatePlayersInRoom: function() {
    const roomPlayersList = document.getElementById('roomPlayersList');
    
    if (!roomPlayersList || !this.currentRoom) {
      return;
    }
    
    // 获取当前用户ID
    const currentUser = Utils.getLocalStorage('user');
    
    // 生成玩家列表HTML
    let html = '<ul class="room-players">';
    this.currentRoom.players.forEach(player => {
      const isHost = player.id === this.currentRoom.host;
      const isCurrentUser = currentUser && player.id === currentUser.id;
      const statusClass = player.isReady ? 'status-ready' : 'status-not-ready';
      const statusText = player.isReady ? '已准备' : '未准备';
      
      html += `
        <li class="player-item ${isCurrentUser ? 'current-user' : ''}">
          <div class="player-avatar">
            <img src="img/default-avatar.png" alt="${player.username}">
            ${isHost ? '<span class="host-badge">房主</span>' : ''}
          </div>
          <div class="player-info">
            <div class="player-name">${player.username} ${isCurrentUser ? '(你)' : ''}</div>
            <div class="player-status ${statusClass}">${statusText}</div>
          </div>
        </li>
      `;
    });
    html += '</ul>';
    
    roomPlayersList.innerHTML = html;
  },
  
  // 更新房间控制按钮
  updateRoomControls: function() {
    const toggleReadyBtn = document.getElementById('toggleReadyBtn');
    const startGameBtn = document.getElementById('startGameBtn');
    
    if (!toggleReadyBtn || !startGameBtn || !this.currentRoom) {
      return;
    }
    
    // 获取当前用户ID
    const currentUser = Utils.getLocalStorage('user');
    
    if (!currentUser) {
      return;
    }
    
    // 查找当前用户在房间中的数据
    const currentPlayer = this.currentRoom.players.find(player => player.id === currentUser.id);
    
    if (!currentPlayer) {
      return;
    }
    
    // 是否是房主
    const isHost = this.currentRoom.host === currentUser.id;
    
    // 更新准备按钮
    if (isHost) {
      toggleReadyBtn.disabled = true;
      toggleReadyBtn.textContent = '房主无需准备';
    } else {
      toggleReadyBtn.disabled = false;
      toggleReadyBtn.textContent = currentPlayer.isReady ? '取消准备' : '准备';
      toggleReadyBtn.className = currentPlayer.isReady ? 'btn secondary-btn' : 'btn primary-btn';
    }
    
    // 更新开始游戏按钮
    if (isHost) {
      startGameBtn.disabled = false;
      
      // 检查是否所有非房主玩家都已准备
      const allReady = this.currentRoom.players
        .filter(player => player.id !== this.currentRoom.host)
        .every(player => player.isReady);
      
      // 检查人数是否足够
      const enoughPlayers = this.currentRoom.players.length >= 3;
      
      startGameBtn.disabled = !allReady || !enoughPlayers;
      
      if (!enoughPlayers) {
        startGameBtn.title = '至少需要3名玩家才能开始游戏';
      } else if (!allReady) {
        startGameBtn.title = '有玩家尚未准备';
      } else {
        startGameBtn.title = '点击开始游戏';
      }
    } else {
      startGameBtn.disabled = true;
      startGameBtn.title = '只有房主可以开始游戏';
    }
  },
  
  // 加载游戏页面
  loadGamePage: function(container) {
    // 检查是否已认证
    if (!this.isAuthenticated) {
      this.showAuthPage();
      return;
    }
    
    // 检查是否有房间信息
    if (!this.currentRoom) {
      this.loadPage('lobby');
      return;
    }
    
    container.innerHTML = `
      <div class="game-container">
        <div class="game-header">
          <h2>继父大逃亡</h2>
          <div class="game-timer" id="gameTimer">05:00</div>
        </div>
        
        <div class="game-content">
          <div class="game-canvas-container">
            <canvas id="gameCanvas" width="800" height="600"></canvas>
            <div id="gameControls" class="game-controls">
              <div class="mobile-controls">
                <div class="joystick-container">
                  <div id="joystick" class="joystick">
                    <div class="joystick-handle"></div>
                  </div>
                </div>
                <div class="action-buttons">
                  <button id="actionButton" class="action-button">互动</button>
                </div>
              </div>
            </div>
          </div>
          
          <div class="game-sidebar">
            <div class="game-info">
              <h3>游戏信息</h3>
              <div id="gameInfo" class="game-info-content">
                <div class="loading">加载游戏信息...</div>
              </div>
            </div>
            
            <div class="game-chat">
              <h3>聊天</h3>
              <div id="gameChatMessages" class="chat-messages"></div>
              <div class="chat-input">
                <input type="text" id="gameChatInput" placeholder="输入消息...">
                <button id="gameSendChatBtn" class="btn primary-btn">发送</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    
    // 初始化游戏页面事件
    this.initGameEvents();
    
    // 初始化游戏
    if (this.gameData) {
      this.initGame(this.gameData);
    }
  },
  
  // 初始化游戏页面事件
  initGameEvents: function() {
    // 发送聊天消息
    const sendChatBtn = document.getElementById('gameSendChatBtn');
    const chatInput = document.getElementById('gameChatInput');
    
    if (sendChatBtn && chatInput) {
      // 发送按钮点击事件
      sendChatBtn.addEventListener('click', () => {
        this.sendGameChatMessage();
      });
      
      // 输入框回车事件
      chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.sendGameChatMessage();
        }
      });
    }
    
    // 绑定键盘控制
    window.addEventListener('keydown', this.handleKeyDown.bind(this));
    window.addEventListener('keyup', this.handleKeyUp.bind(this));
    
    // 初始化触摸控制
    this.initTouchControls();
  },
  
  // 发送游戏聊天消息
  sendGameChatMessage: function() {
    const chatInput = document.getElementById('gameChatInput');
    
    if (!chatInput || !this.currentRoom) {
      return;
    }
    
    const message = chatInput.value.trim();
    
    if (!message) {
      return;
    }
    
    // 发送消息
    this.socket.emit('send_message', {
      roomId: this.currentRoom.id,
      message: message
    });
    
    // 清空输入框
    chatInput.value = '';
  },
  
  // 初始化触摸控制
  initTouchControls: function() {
    const joystick = document.getElementById('joystick');
    const actionButton = document.getElementById('actionButton');
    
    if (!joystick || !actionButton) {
      return;
    }
    
    // 初始化虚拟摇杆
    const joystickManager = nipplejs.create({
      zone: joystick,
      mode: 'static',
      position: { left: '50%', top: '50%' },
      color: 'rgba(255, 255, 255, 0.5)',
      size: 120
    });
    
    // 摇杆移动事件
    joystickManager.on('move', (e, data) => {
      // 重置所有方向
      this.playerControls.up = false;
      this.playerControls.down = false;
      this.playerControls.left = false;
      this.playerControls.right = false;
      
      // 根据角度设置方向
      const angle = data.angle.degree;
      
      if (angle >= 45 && angle < 135) {
        this.playerControls.down = true;
      } else if (angle >= 135 && angle < 225) {
        this.playerControls.left = true;
      } else if (angle >= 225 && angle < 315) {
        this.playerControls.up = true;
      } else {
        this.playerControls.right = true;
      }
      
      // 发送玩家输入
      this.sendPlayerInput();
    });
    
    // 摇杆结束事件
    joystickManager.on('end', () => {
      // 重置所有方向
      this.playerControls.up = false;
      this.playerControls.down = false;
      this.playerControls.left = false;
      this.playerControls.right = false;
      
      // 发送玩家输入
      this.sendPlayerInput();
    });
    
    // 动作按钮事件
    actionButton.addEventListener('touchstart', () => {
      this.playerControls.action = true;
      this.sendPlayerInput();
    });
    
    actionButton.addEventListener('touchend', () => {
      this.playerControls.action = false;
      this.sendPlayerInput();
    });
  },
  
  // 处理键盘按下事件
  handleKeyDown: function(e) {
    if (!this.isPlaying) {
      return;
    }
    
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.playerControls.up = true;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.playerControls.down = true;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.playerControls.left = true;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.playerControls.right = true;
        break;
      case 'Space':
      case 'Enter':
        this.playerControls.action = true;
        break;
    }
    
    // 发送玩家输入
    this.sendPlayerInput();
  },
  
  // 处理键盘释放事件
  handleKeyUp: function(e) {
    if (!this.isPlaying) {
      return;
    }
    
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.playerControls.up = false;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.playerControls.down = false;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.playerControls.left = false;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.playerControls.right = false;
        break;
      case 'Space':
      case 'Enter':
        this.playerControls.action = false;
        break;
    }
    
    // 发送玩家输入
    this.sendPlayerInput();
  },
  
  // 发送玩家输入
  sendPlayerInput: function() {
    if (!this.socket || !this.isPlaying) {
      return;
    }
    
    this.socket.emit('player_input', {
      roomId: this.currentRoom.id,
      controls: this.playerControls
    });
  },
  
  // 初始化游戏
  initGame: function(gameData) {
    console.log('初始化游戏:', gameData);
    
    // 获取当前用户ID
    const currentUser = Utils.getLocalStorage('user');
    
    if (!currentUser) {
      return;
    }
    
    // 设置玩家角色
    const playerRole = gameData.players.find(p => p.id === currentUser.id).role;
    
    // 更新游戏信息
    const gameInfo = document.getElementById('gameInfo');
    if (gameInfo) {
      gameInfo.innerHTML = `
        <div class="player-role ${playerRole === 'stepfather' ? 'role-stepfather' : 'role-stepson'}">
          <h4>您的角色</h4>
          <div class="role-name">${playerRole === 'stepfather' ? '继父' : '继子'}</div>
          <div class="role-desc">
            ${playerRole === 'stepfather' ? '抓住所有继子' : '与其他继子合作逃脱继父'}
          </div>
        </div>
        
        <div class="players-status">
          <h4>玩家状态</h4>
          <ul id="playersStatusList">
            ${gameData.players.map(player => `
              <li class="player-status-item">
                <span class="player-name">${player.username}</span>
                <span class="player-role-tag ${player.role === 'stepfather' ? 'role-stepfather' : 'role-stepson'}">
                  ${player.role === 'stepfather' ? '继父' : '继子'}
                </span>
                <span class="player-state-tag state-alive">存活</span>
              </li>
            `).join('')}
          </ul>
        </div>
      `;
    }
    
    // 初始化游戏画布
    this.initGameCanvas(gameData);
    
    // 开始游戏循环
    this.startGameLoop();
    
    // 播放背景音乐
    Utils.SoundManager.playMusic('gameBackground');
  },
  
  // 初始化游戏画布
  initGameCanvas: function(gameData) {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    
    if (!canvas || !ctx) {
      return;
    }
    
    // 调整画布大小
    this.resizeGameCanvas();
    
    // 监听窗口大小变化
    window.addEventListener('resize', this.resizeGameCanvas);
    
    // 预加载图像
    this.loadGameAssets()
      .then(() => {
        console.log('游戏资源加载完成');
      })
      .catch(error => {
        console.error('游戏资源加载失败:', error);
      });
  },
  
  // 调整游戏画布大小
  resizeGameCanvas: function() {
    const canvas = document.getElementById('gameCanvas');
    const container = document.querySelector('.game-canvas-container');
    
    if (!canvas || !container) {
      return;
    }
    
    // 设置宽高
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    // 更新画布尺寸
    canvas.width = width;
    canvas.height = height;
  },
  
  // 加载游戏资源
  loadGameAssets: function() {
    return new Promise((resolve, reject) => {
      // 图像资源列表
      const imageAssets = {
        'stepfather': 'img/stepfather.png',
        'stepson': 'img/stepson.png',
        'wall': 'img/wall.png',
        'floor': 'img/floor.png',
        'exit': 'img/exit.png',
        'item': 'img/item.png'
      };
      
      // 已加载的图像
      this.gameAssets = {};
      
      // 总资源数
      const totalAssets = Object.keys(imageAssets).length;
      let loadedAssets = 0;
      
      // 加载每个图像
      Object.keys(imageAssets).forEach(key => {
        const img = new Image();
        img.src = imageAssets[key];
        
        img.onload = () => {
          this.gameAssets[key] = img;
          loadedAssets++;
          
          if (loadedAssets === totalAssets) {
            resolve();
          }
        };
        
        img.onerror = () => {
          reject(new Error(`Failed to load image: ${imageAssets[key]}`));
        };
      });
    });
  },
  
  // 开始游戏循环
  startGameLoop: function() {
    // 停止之前的游戏循环
    if (this.gameLoop) {
      cancelAnimationFrame(this.gameLoop);
    }
    
    // 启动新的游戏循环
    const loop = () => {
      this.renderGame();
      this.gameLoop = requestAnimationFrame(loop);
    };
    
    // 开始循环
    this.gameLoop = requestAnimationFrame(loop);
  },
  
  // 渲染游戏
  renderGame: function() {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    
    if (!canvas || !ctx || !this.gameData) {
      return;
    }
    
    // 清空画布
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 计算缩放因子
    const scale = Math.min(
      canvas.width / this.gameData.map.width,
      canvas.height / this.gameData.map.height
    );
    
    // 绘制地图
    this.renderMap(ctx, scale);
    
    // 绘制玩家
    this.renderPlayers(ctx, scale);
    
    // 绘制道具
    this.renderItems(ctx, scale);
  },
  
  // 渲染地图
  renderMap: function(ctx, scale) {
    if (!this.gameData || !this.gameAssets) {
      return;
    }
    
    // 获取当前状态
    const gameState = this.gameData.currentState || this.gameData;
    
    // 绘制地板和墙壁
    for (let y = 0; y < gameState.map.height; y++) {
      for (let x = 0; x < gameState.map.width; x++) {
        const cell = gameState.map.grid[y][x];
        const posX = x * scale;
        const posY = y * scale;
        
        // 绘制地板
        ctx.drawImage(
          this.gameAssets.floor,
          posX,
          posY,
          scale,
          scale
        );
        
        // 绘制墙壁
        if (cell === 1) {
          ctx.drawImage(
            this.gameAssets.wall,
            posX,
            posY,
            scale,
            scale
          );
        }
        
        // 绘制出口
        if (cell === 2) {
          ctx.drawImage(
            this.gameAssets.exit,
            posX,
            posY,
            scale,
            scale
          );
        }
      }
    }
  },
  
  // 渲染玩家
  renderPlayers: function(ctx, scale) {
    if (!this.gameData || !this.gameAssets) {
      return;
    }
    
    // 获取当前状态
    const gameState = this.gameData.currentState || this.gameData;
    
    // 绘制每个玩家
    gameState.players.forEach(player => {
      if (player.state !== 'alive') {
        return;
      }
      
      const posX = player.position.x * scale;
      const posY = player.position.y * scale;
      
      // 选择角色图像
      const img = player.role === 'stepfather' ? this.gameAssets.stepfather : this.gameAssets.stepson;
      
      // 绘制玩家
      ctx.drawImage(
        img,
        posX,
        posY,
        scale,
        scale
      );
      
      // 绘制玩家名称
      ctx.font = '12px Arial';
      ctx.fillStyle = 'white';
      ctx.textAlign = 'center';
      ctx.fillText(player.username, posX + scale / 2, posY - 5);
    });
  },
  
  // 渲染道具
  renderItems: function(ctx, scale) {
    if (!this.gameData || !this.gameAssets || !this.gameData.items) {
      return;
    }
    
    // 获取当前状态
    const gameState = this.gameData.currentState || this.gameData;
    
    // 绘制每个道具
    gameState.items.forEach(item => {
      const posX = item.position.x * scale;
      const posY = item.position.y * scale;
      
      // 绘制道具
      ctx.drawImage(
        this.gameAssets.item,
        posX,
        posY,
        scale,
        scale
      );
    });
  },
  
  // 更新游戏状态
  updateGameState: function(state) {
    // 更新游戏数据
    if (this.gameData) {
      this.gameData.currentState = state;
    }
    
    // 更新玩家状态显示
    this.updatePlayersStatus(state.players);
    
    // 更新游戏计时器
    this.updateGameTimer(state.timeRemaining);
  },
  
  // 更新玩家状态显示
  updatePlayersStatus: function(players) {
    const playersStatusList = document.getElementById('playersStatusList');
    
    if (!playersStatusList) {
      return;
    }
    
    // 更新每个玩家的状态
    players.forEach(player => {
      const playerItem = playersStatusList.querySelector(`li:contains('${player.username}')`);
      
      if (playerItem) {
        // 更新状态标签
        const stateTag = playerItem.querySelector('.player-state-tag');
        
        if (stateTag) {
          stateTag.className = `player-state-tag state-${player.state}`;
          stateTag.textContent = this.getStateText(player.state);
        }
      }
    });
  },
  
  // 获取状态文本
  getStateText: function(state) {
    switch (state) {
      case 'alive':
        return '存活';
      case 'caught':
        return '被抓';
      case 'escaped':
        return '逃脱';
      default:
        return state;
    }
  },
  
  // 更新游戏计时器
  updateGameTimer: function(timeRemaining) {
    const gameTimer = document.getElementById('gameTimer');
    
    if (!gameTimer) {
      return;
    }
    
    // 格式化时间
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;
    
    gameTimer.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    // 如果时间少于1分钟，添加警告效果
    if (timeRemaining < 60) {
      gameTimer.classList.add('timer-warning');
    } else {
      gameTimer.classList.remove('timer-warning');
    }
  },
  
  // 处理游戏事件
  handleGameEvent: function(event) {
    console.log('处理游戏事件:', event);
    
    switch (event.type) {
      case 'player_caught':
        // 播放被抓音效
        Utils.SoundManager.play('caught');
        
        // 显示事件通知
        this.addGameEventMessage({
          type: 'system',
          content: `${event.data.playerName} 被继父抓住了！`
        });
        break;
        
      case 'player_escaped':
        // 播放逃脱音效
        Utils.SoundManager.play('escaped');
        
        // 显示事件通知
        this.addGameEventMessage({
          type: 'system',
          content: `${event.data.playerName} 成功逃脱！`
        });
        break;
        
      case 'item_collected':
        // 播放收集道具音效
        Utils.SoundManager.play('itemCollected');
        
        // 显示事件通知
        this.addGameEventMessage({
          type: 'system',
          content: `${event.data.playerName} 收集了一个道具！`
        });
        break;
    }
  },
  
  // 添加游戏事件消息
  addGameEventMessage: function(message) {
    const chatMessages = document.getElementById('gameChatMessages');
    
    if (!chatMessages) {
      return;
    }
    
    // 创建消息元素
    const messageEl = document.createElement('div');
    messageEl.className = `chat-message ${message.type}-message`;
    
    // 设置消息内容
    if (message.type === 'system') {
      messageEl.innerHTML = `<span class="system-message-content">${message.content}</span>`;
    } else {
      messageEl.innerHTML = `
        <span class="message-sender">${message.username}:</span>
        <span class="message-content">${message.content}</span>
      `;
    }
    
    // 添加到聊天区域
    chatMessages.appendChild(messageEl);
    
    // 滚动到底部
    chatMessages.scrollTop = chatMessages.scrollHeight;
  },
  
  // 加载游戏结束页面
  loadGameOverPage: function(container) {
    // 检查是否已认证
    if (!this.isAuthenticated) {
      this.showAuthPage();
      return;
    }
    
    // 检查是否有房间信息
    if (!this.currentRoom) {
      this.loadPage('lobby');
      return;
    }
    
    container.innerHTML = `
      <div class="game-over-container">
        <div class="game-over-header">
          <h2>游戏结束</h2>
        </div>
        
        <div class="game-over-content">
          <div class="game-results">
            <h3>游戏结果</h3>
            <div id="gameResults">
              <div class="loading">加载游戏结果中...</div>
            </div>
          </div>
          
          <div class="game-stats">
            <h3>游戏统计</h3>
            <div id="gameStats">
              <div class="loading">加载游戏统计中...</div>
            </div>
          </div>
        </div>
        
        <div class="game-over-footer">
          <button id="returnToRoomBtn" class="btn primary-btn">返回房间</button>
          <button id="returnToLobbyBtn" class="btn secondary-btn">返回大厅</button>
        </div>
      </div>
    `;
    
    // 初始化游戏结束页面事件
    this.initGameOverEvents();
  },
  
  // 初始化游戏结束页面事件
  initGameOverEvents: function() {
    // 返回房间按钮
    const returnToRoomBtn = document.getElementById('returnToRoomBtn');
    if (returnToRoomBtn) {
      returnToRoomBtn.addEventListener('click', () => {
        this.loadPage('room');
      });
    }
    
    // 返回大厅按钮
    const returnToLobbyBtn = document.getElementById('returnToLobbyBtn');
    if (returnToLobbyBtn) {
      returnToLobbyBtn.addEventListener('click', () => {
        this.socket.emit('leave_room', { roomId: this.currentRoom.id });
      });
    }
  },
  
  // 显示游戏结果
  showGameResults: function(results) {
    const gameResults = document.getElementById('gameResults');
    const gameStats = document.getElementById('gameStats');
    
    if (!gameResults || !gameStats) {
      return;
    }
    
    // 计算获胜方
    const winnerText = results.winner === 'stepfather' ? '继父获胜！' : '继子们获胜！';
    
    // 计算逃脱的继子数量
    const escapedStepsons = results.players.filter(p => p.role === 'stepson' && p.state === 'escaped').length;
    const totalStepsons = results.players.filter(p => p.role === 'stepson').length;
    
    // 更新游戏结果
    gameResults.innerHTML = `
      <div class="result-winner ${results.winner === 'stepfather' ? 'winner-stepfather' : 'winner-stepson'}">
        ${winnerText}
      </div>
      
      <div class="escape-stats">
        <span class="escaped-count">${escapedStepsons}</span>/${totalStepsons} 个继子逃脱
      </div>
      
      <div class="player-results">
        ${results.players.map(player => `
          <div class="player-result ${player.role === 'stepfather' ? 'role-stepfather' : 'role-stepson'}">
            <span class="player-name">${player.username}</span>
            <span class="player-role-tag">${player.role === 'stepfather' ? '继父' : '继子'}</span>
            <span class="player-state-tag state-${player.state}">${this.getStateText(player.state)}</span>
          </div>
        `).join('')}
      </div>
    `;
    
    // 更新游戏统计
    gameStats.innerHTML = `
      <div class="stats-item">
        <span class="stats-label">游戏时长:</span>
        <span class="stats-value">${Math.floor(results.gameDuration / 60)}分${results.gameDuration % 60}秒</span>
      </div>
      
      <div class="stats-item">
        <span class="stats-label">收集的道具:</span>
        <span class="stats-value">${results.itemsCollected}</span>
      </div>
    `;
  },
  
  // 加载商店页面
  loadShopPage: function(container) {
    // 检查是否已认证
    if (!this.isAuthenticated) {
      this.showAuthPage();
      return;
    }
    
    container.innerHTML = `
      <div class="shop-container">
        <div class="shop-header">
          <h2>游戏商店</h2>
          <div class="user-currency">
            <i class="fas fa-coins"></i>
            <span id="userCoins">0</span> 金币
          </div>
        </div>
        
        <div class="shop-categories">
          <button class="shop-category-btn active" data-category="characters">角色皮肤</button>
          <button class="shop-category-btn" data-category="items">游戏道具</button>
          <button class="shop-category-btn" data-category="effects">特效</button>
        </div>
        
        <div class="shop-content">
          <div id="shopItems" class="shop-items">
            <div class="loading">加载商店物品中...</div>
          </div>
        </div>
      </div>
    `;
    
    // 初始化商店页面事件
    this.initShopEvents();
    
    // 获取用户金币数
    this.fetchUserCoins();
    
    // 获取商店物品
    this.fetchShopItems('characters');
  },
  
  // 初始化商店页面事件
  initShopEvents: function() {
    // 分类按钮点击事件
    document.querySelectorAll('.shop-category-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        // 更新活动类别
        document.querySelectorAll('.shop-category-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // 加载对应类别的物品
        const category = btn.getAttribute('data-category');
        this.fetchShopItems(category);
      });
    });
  },
  
  // 获取用户金币数
  fetchUserCoins: function() {
    const userCoins = document.getElementById('userCoins');
    
    if (!userCoins) {
      return;
    }
    
    // 获取用户金币数
    fetch('/api/users/coins', {
      headers: {
        'Authorization': `Bearer ${Utils.getLocalStorage('token')}`
      }
    })
      .then(response => response.json())
      .then(data => {
        userCoins.textContent = data.coins;
      })
      .catch(error => {
        console.error('获取用户金币失败:', error);
      });
  },
  
  // 获取商店物品
  fetchShopItems: function(category) {
    const shopItems = document.getElementById('shopItems');
    
    if (!shopItems) {
      return;
    }
    
    // 显示加载中
    shopItems.innerHTML = '<div class="loading">加载商店物品中...</div>';
    
    // 获取商店物品
    fetch(`/api/shop/items?category=${category}`, {
      headers: {
        'Authorization': `Bearer ${Utils.getLocalStorage('token')}`
      }
    })
      .then(response => response.json())
      .then(items => {
        // 生成商店物品HTML
        let html = '';
        
        if (items.length === 0) {
          html = '<div class="empty-message">暂无物品</div>';
        } else {
          items.forEach(item => {
            const isOwned = item.owned;
            const buttonText = isOwned ? '已拥有' : `购买 (${item.price} 金币)`;
            const buttonClass = isOwned ? 'btn secondary-btn' : 'btn primary-btn';
            const buttonDisabled = isOwned ? 'disabled' : '';
            
            html += `
              <div class="shop-item">
                <div class="item-image">
                  <img src="${item.image}" alt="${item.name}">
                </div>
                <div class="item-info">
                  <h4>${item.name}</h4>
                  <p>${item.description}</p>
                </div>
                <div class="item-actions">
                  <button class="${buttonClass} buy-item-btn" data-id="${item.id}" ${buttonDisabled}>
                    ${buttonText}
                  </button>
                </div>
              </div>
            `;
          });
        }
        
        shopItems.innerHTML = html;
        
        // 绑定购买按钮事件
        shopItems.querySelectorAll('.buy-item-btn:not([disabled])').forEach(btn => {
          btn.addEventListener('click', () => {
            const itemId = btn.getAttribute('data-id');
            this.buyShopItem(itemId);
          });
        });
      })
      .catch(error => {
        console.error('获取商店物品失败:', error);
        shopItems.innerHTML = '<div class="error-message">获取商店物品失败，请刷新重试</div>';
      });
  },
  
  // 购买商店物品
  buyShopItem: function(itemId) {
    // 发送购买请求
    fetch('/api/shop/buy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Utils.getLocalStorage('token')}`
      },
      body: JSON.stringify({ itemId })
    })
      .then(response => response.json())
      .then(data => {
        if (data.error) {
          Utils.showNotification(data.error, 3000);
        } else {
          // 播放购买成功音效
          Utils.SoundManager.play('purchase');
          
          // 显示成功消息
          Utils.showNotification('购买成功！', 3000);
          
          // 更新用户金币数
          this.fetchUserCoins();
          
          // 更新商店物品
          const activeCategory = document.querySelector('.shop-category-btn.active').getAttribute('data-category');
          this.fetchShopItems(activeCategory);
        }
      })
      .catch(error => {
        console.error('购买物品失败:', error);
        Utils.showNotification('购买失败，请稍后重试', 3000);
      });
  },
  
  // 加载规则页面
  loadRulesPage: function(container) {
    container.innerHTML = `
      <div class="rules-container">
        <div class="rules-header">
          <h2>游戏规则</h2>
        </div>
        
        <div class="rules-content">
          <div class="rule-section">
            <h3>游戏背景</h3>
            <p>《继父大逃亡》是一款多人在线逃生游戏。游戏中，一位玩家扮演继父，其他玩家扮演继子。继父的目标是抓住所有的继子，而继子们则需要合作找到出口逃脱。</p>
          </div>
          
          <div class="rule-section">
            <h3>角色介绍</h3>
            <div class="role-card role-stepfather">
              <h4>继父</h4>
              <div class="role-details">
                <img src="img/stepfather.png" alt="继父" class="role-image">
                <ul>
                  <li>速度较快，但无法穿过墙壁</li>
                  <li>可以看到继子的大致位置</li>
                  <li>目标是抓住所有继子</li>
                </ul>
              </div>
            </div>
            
            <div class="role-card role-stepson">
              <h4>继子</h4>
              <div class="role-details">
                <img src="img/stepson.png" alt="继子" class="role-image">
                <ul>
                  <li>速度较慢，但可以通过收集道具获得临时加速</li>
                  <li>可以看到出口位置</li>
                  <li>需要合作找到出口并逃脱</li>
                </ul>
              </div>
            </div>
          </div>
          
          <div class="rule-section">
            <h3>游戏流程</h3>
            <ol>
              <li>游戏开始时，系统随机选择一名玩家扮演继父，其他玩家扮演继子</li>
              <li>继父需要在有限的时间内抓住所有继子</li>
              <li>继子需要找到地图上的出口并逃脱</li>
              <li>如果时间结束，所有尚未被抓住的继子自动获胜</li>
            </ol>
          </div>
          
          <div class="rule-section">
            <h3>游戏地图</h3>
            <p>游戏地图由房间和走廊组成，包含墙壁、道具和出口。继父和继子初始位置在地图的不同区域。</p>
          </div>
          
          <div class="rule-section">
            <h3>操作说明</h3>
            <div class="controls-section">
              <h4>键盘控制</h4>
              <ul>
                <li><b>W / 上箭头</b>: 向上移动</li>
                <li><b>S / 下箭头</b>: 向下移动</li>
                <li><b>A / 左箭头</b>: 向左移动</li>
                <li><b>D / 右箭头</b>: 向右移动</li>
                <li><b>空格 / 回车</b>: 互动 (收集道具、使用出口)</li>
              </ul>
            </div>
            
            <div class="controls-section">
              <h4>触摸控制 (移动设备)</h4>
              <ul>
                <li><b>虚拟摇杆</b>: 控制移动方向</li>
                <li><b>动作按钮</b>: 互动 (收集道具、使用出口)</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    `;
  },
  
  // 加载个人资料页面
  loadProfilePage: function(container) {
    // 检查是否已认证
    if (!this.isAuthenticated) {
      this.showAuthPage();
      return;
    }
    
    container.innerHTML = `
      <div class="profile-container">
        <div class="profile-header">
          <h2>个人资料</h2>
        </div>
        
        <div class="profile-content">
          <div class="profile-info">
            <div class="profile-avatar">
              <img id="userProfileAvatar" src="img/default-avatar.png" alt="用户头像">
              <button id="changeAvatarBtn" class="btn secondary-btn">更换头像</button>
            </div>
            
            <div class="profile-details">
              <form id="profileForm">
                <div class="form-group">
                  <label for="profileUsername">用户名</label>
                  <input type="text" id="profileUsername" disabled>
                </div>
                
                <div class="form-group">
                  <label for="profileEmail">电子邮箱</label>
                  <input type="email" id="profileEmail" disabled>
                </div>
                
                <div class="form-group">
                  <label for="profileBio">个人简介</label>
                  <textarea id="profileBio" placeholder="介绍一下自己吧"></textarea>
                </div>
                
                <button type="submit" id="saveProfileBtn" class="btn primary-btn">保存更改</button>
              </form>
            </div>
          </div>
          
          <div class="profile-stats">
            <h3>游戏统计</h3>
            <div class="stats-container" id="userStats">
              <div class="loading">加载游戏统计中...</div>
            </div>
          </div>
        </div>
      </div>
    `;
    
    // 初始化个人资料页面事件
    this.initProfileEvents();
    
    // 获取用户资料
    this.fetchUserProfile();
    
    // 获取用户统计数据
    this.fetchUserStats();
  },
  
  // 初始化个人资料页面事件
  initProfileEvents: function() {
    // 更换头像按钮
    const changeAvatarBtn = document.getElementById('changeAvatarBtn');
    if (changeAvatarBtn) {
      changeAvatarBtn.addEventListener('click', () => {
        this.showAvatarModal();
      });
    }
    
    // 个人资料表单
    const profileForm = document.getElementById('profileForm');
    if (profileForm) {
      profileForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        // 获取表单数据
        const bio = document.getElementById('profileBio').value;
        
        // 保存个人资料
        this.saveUserProfile({ bio });
      });
    }
  },
  
  // 显示头像选择模态框
  showAvatarModal: function() {
    // 创建模态框
    const modalHtml = `
      <div class="modal-header">
        <h3>选择头像</h3>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-body">
        <div class="avatar-grid">
          <div class="loading">加载头像列表中...</div>
        </div>
      </div>
    `;
    
    this.showModal(modalHtml);
    
    // 获取头像列表
    fetch('/api/avatars', {
      headers: {
        'Authorization': `Bearer ${Utils.getLocalStorage('token')}`
      }
    })
      .then(response => response.json())
      .then(avatars => {
        // 更新头像网格
        const avatarGrid = document.querySelector('.avatar-grid');
        
        if (avatarGrid) {
          let html = '';
          
          avatars.forEach(avatar => {
            html += `
              <div class="avatar-item" data-avatar="${avatar.url}">
                <img src="${avatar.url}" alt="头像">
              </div>
            `;
          });
          
          avatarGrid.innerHTML = html;
          
          // 绑定头像选择事件
          avatarGrid.querySelectorAll('.avatar-item').forEach(item => {
            item.addEventListener('click', () => {
              const avatarUrl = item.getAttribute('data-avatar');
              this.updateUserAvatar(avatarUrl);
            });
          });
        }
      })
      .catch(error => {
        console.error('获取头像列表失败:', error);
        
        const avatarGrid = document.querySelector('.avatar-grid');
        if (avatarGrid) {
          avatarGrid.innerHTML = '<div class="error-message">获取头像列表失败，请刷新重试</div>';
        }
      });
  },
  
  // 更新用户头像
  updateUserAvatar: function(avatarUrl) {
    // 发送更新请求
    fetch('/api/users/avatar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Utils.getLocalStorage('token')}`
      },
      body: JSON.stringify({ avatarUrl })
    })
      .then(response => response.json())
      .then(data => {
        if (data.error) {
          Utils.showNotification(data.error, 3000);
        } else {
          // 更新本地存储的用户数据
          const user = Utils.getLocalStorage('user');
          if (user) {
            user.avatar = avatarUrl;
            Utils.setLocalStorage('user', user);
          }
          
          // 更新页面上的头像
          document.getElementById('userAvatar').src = avatarUrl;
          document.getElementById('userProfileAvatar').src = avatarUrl;
          
          // 关闭模态框
          this.closeAllModals();
          
          // 显示成功消息
          Utils.showNotification('头像更新成功！', 3000);
        }
      })
      .catch(error => {
        console.error('更新头像失败:', error);
        Utils.showNotification('更新头像失败，请稍后重试', 3000);
      });
  },
  
  // 获取用户资料
  fetchUserProfile: function() {
    // 获取用户资料
    fetch('/api/users/profile', {
      headers: {
        'Authorization': `Bearer ${Utils.getLocalStorage('token')}`
      }
    })
      .then(response => response.json())
      .then(profile => {
        // 更新表单
        document.getElementById('profileUsername').value = profile.username;
        document.getElementById('profileEmail').value = profile.email;
        document.getElementById('profileBio').value = profile.bio || '';
        
        // 更新头像
        if (profile.avatar) {
          document.getElementById('userProfileAvatar').src = profile.avatar;
        }
      })
      .catch(error => {
        console.error('获取用户资料失败:', error);
        Utils.showNotification('获取用户资料失败，请刷新重试', 3000);
      });
  },
  
  // 保存用户资料
  saveUserProfile: function(profileData) {
    // 更新按钮状态
    const saveBtn = document.getElementById('saveProfileBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = '保存中...';
    
    // 发送更新请求
    fetch('/api/users/profile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Utils.getLocalStorage('token')}`
      },
      body: JSON.stringify(profileData)
    })
      .then(response => response.json())
      .then(data => {
        // 恢复按钮状态
        saveBtn.disabled = false;
        saveBtn.textContent = '保存更改';
        
        if (data.error) {
          Utils.showNotification(data.error, 3000);
        } else {
          // 显示成功消息
          Utils.showNotification('个人资料更新成功！', 3000);
        }
      })
      .catch(error => {
        console.error('更新个人资料失败:', error);
        
        // 恢复按钮状态
        saveBtn.disabled = false;
        saveBtn.textContent = '保存更改';
        
        Utils.showNotification('更新个人资料失败，请稍后重试', 3000);
      });
  },
  
  // 获取用户统计数据
  fetchUserStats: function() {
    const userStats = document.getElementById('userStats');
    
    if (!userStats) {
      return;
    }
    
    // 获取用户统计数据
    fetch('/api/users/stats', {
      headers: {
        'Authorization': `Bearer ${Utils.getLocalStorage('token')}`
      }
    })
      .then(response => response.json())
      .then(stats => {
        // 更新统计数据
        userStats.innerHTML = `
          <div class="stats-row">
            <div class="stats-item">
              <div class="stats-value">${stats.totalGames}</div>
              <div class="stats-label">总游戏次数</div>
            </div>
            
            <div class="stats-item">
              <div class="stats-value">${stats.wins}</div>
              <div class="stats-label">获胜次数</div>
            </div>
            
            <div class="stats-item">
              <div class="stats-value">${stats.loses}</div>
              <div class="stats-label">失败次数</div>
            </div>
          </div>
          
          <div class="stats-row">
            <div class="stats-item">
              <div class="stats-value">${stats.stepfatherGames}</div>
              <div class="stats-label">扮演继父次数</div>
            </div>
            
            <div class="stats-item">
              <div class="stats-value">${stats.stepsonGames}</div>
              <div class="stats-label">扮演继子次数</div>
            </div>
            
            <div class="stats-item">
              <div class="stats-value">${stats.escapeRate}%</div>
              <div class="stats-label">逃脱成功率</div>
            </div>
          </div>
          
          <div class="stats-row">
            <div class="stats-item">
              <div class="stats-value">${stats.totalItems}</div>
              <div class="stats-label">收集道具总数</div>
            </div>
            
            <div class="stats-item">
              <div class="stats-value">${stats.totalPlayTime}</div>
              <div class="stats-label">总游戏时间</div>
            </div>
            
            <div class="stats-item">
              <div class="stats-value">${stats.rank}</div>
              <div class="stats-label">排名</div>
            </div>
          </div>
        `;
      })
      .catch(error => {
        console.error('获取用户统计数据失败:', error);
        userStats.innerHTML = '<div class="error-message">获取用户统计数据失败，请刷新重试</div>';
      });
  },
  
  // 登出
  logout: function() {
    // 确认登出
    if (confirm('确定要登出吗？')) {
      // 清除用户数据
      Utils.GameDataManager.clearUserData();
      
      // 断开Socket连接
      if (this.socket) {
        this.socket.disconnect();
        this.socket = null;
      }
      
      // 更新认证状态
      this.isAuthenticated = false;
      
      // 隐藏用户面板
      document.getElementById('userPanel').classList.add('hidden');
      
      // 显示登录/注册按钮
      document.getElementById('authButtons').classList.remove('hidden');
      
      // 显示认证页面
      this.showAuthPage();
      
      // 显示成功消息
      Utils.showNotification('您已成功登出', 3000);
    }
  }
};

// 页面加载完成后初始化游戏
document.addEventListener('DOMContentLoaded', function() {
  // 初始化声音管理器
  Utils.SoundManager.init();
  
  // 初始化游戏
  Game.init();
});