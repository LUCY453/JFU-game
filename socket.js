/**
 * 继父大逃亡 - Socket连接管理
 */

// Socket连接管理器
const SocketManager = {
  /**
   * 当前Socket连接
   */
  socket: null,
  
  /**
   * 连接事件回调
   */
  onConnectCallback: null,
  
  /**
   * 断开连接事件回调
   */
  onDisconnectCallback: null,
  
  /**
   * 事件处理器
   */
  eventHandlers: {},
  
  /**
   * 初始化Socket连接
   * @param {String} url Socket服务器地址
   * @param {Object} options 选项
   */
  init: function(url, options = {}) {
    // 断开现有连接
    if (this.socket) {
      this.disconnect();
    }
    
    // 创建新连接
    this.socket = io(url, {
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      ...options
    });
    
    // 设置事件监听
    this.setupEventListeners();
    
    // 返回实例，支持链式调用
    return this;
  },
  
  /**
   * 设置事件监听器
   */
  setupEventListeners: function() {
    // 连接成功
    this.socket.on('connect', () => {
      console.log('Socket连接成功，ID:', this.socket.id);
      
      // 调用回调
      if (this.onConnectCallback) {
        this.onConnectCallback(this.socket.id);
      }
    });
    
    // 连接错误
    this.socket.on('connect_error', (error) => {
      console.error('Socket连接错误:', error);
    });
    
    // 断开连接
    this.socket.on('disconnect', (reason) => {
      console.log('Socket连接断开:', reason);
      
      // 调用回调
      if (this.onDisconnectCallback) {
        this.onDisconnectCallback(reason);
      }
    });
    
    // 重新连接尝试
    this.socket.on('reconnect_attempt', (attemptNumber) => {
      console.log(`尝试重新连接 (${attemptNumber}/5)`);
    });
    
    // 重新连接成功
    this.socket.on('reconnect', (attemptNumber) => {
      console.log(`重新连接成功，尝试次数: ${attemptNumber}`);
    });
    
    // 重新连接失败
    this.socket.on('reconnect_failed', () => {
      console.error('重新连接失败，已达到最大尝试次数');
    });
  },
  
  /**
   * 连接服务器
   * @param {Function} callback 连接成功回调
   */
  connect: function(callback) {
    // 存储连接回调
    if (callback) {
      this.onConnectCallback = callback;
    }
    
    // 连接服务器
    this.socket.connect();
    
    return this;
  },
  
  /**
   * 断开连接
   * @param {Function} callback 断开连接回调
   */
  disconnect: function(callback) {
    // 存储断开连接回调
    if (callback) {
      this.onDisconnectCallback = callback;
    }
    
    // 断开连接
    if (this.socket && this.socket.connected) {
      this.socket.disconnect();
    }
    
    return this;
  },
  
  /**
   * 监听事件
   * @param {String} event 事件名称
   * @param {Function} handler 事件处理函数
   */
  on: function(event, handler) {
    // 存储事件处理器
    if (!this.eventHandlers[event]) {
      this.eventHandlers[event] = [];
    }
    this.eventHandlers[event].push(handler);
    
    // 设置Socket事件监听
    this.socket.on(event, (data) => {
      // 调用所有处理器
      const handlers = this.eventHandlers[event] || [];
      handlers.forEach(handler => handler(data));
    });
    
    return this;
  },
  
  /**
   * 移除事件监听
   * @param {String} event 事件名称
   * @param {Function} handler 事件处理函数
   */
  off: function(event, handler) {
    // 移除特定处理器
    if (handler && this.eventHandlers[event]) {
      this.eventHandlers[event] = this.eventHandlers[event].filter(h => h !== handler);
    } 
    // 移除所有处理器
    else if (!handler) {
      this.eventHandlers[event] = [];
    }
    
    // 移除Socket事件监听
    this.socket.off(event);
    
    // 如果还有处理器，重新添加监听
    if (this.eventHandlers[event] && this.eventHandlers[event].length > 0) {
      this.socket.on(event, (data) => {
        const handlers = this.eventHandlers[event] || [];
        handlers.forEach(handler => handler(data));
      });
    }
    
    return this;
  },
  
  /**
   * 发送事件
   * @param {String} event 事件名称
   * @param {*} data 事件数据
   * @param {Function} callback 发送完成回调
   */
  emit: function(event, data, callback) {
    if (this.socket && this.socket.connected) {
      this.socket.emit(event, data, callback);
    } else {
      console.error('Socket未连接，无法发送事件');
      if (callback) {
        callback(new Error('Socket未连接'));
      }
    }
    
    return this;
  },
  
  /**
   * 检查连接状态
   * @returns {Boolean} 是否已连接
   */
  isConnected: function() {
    return this.socket && this.socket.connected;
  },
  
  /**
   * 获取Socket ID
   * @returns {String} Socket ID
   */
  getId: function() {
    return this.socket ? this.socket.id : null;
  }
};

// 导出Socket管理器
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SocketManager;
}