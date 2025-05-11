/**
 * 继父大逃亡 - 服务器工具函数
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const Utils = {
  /**
   * 生成随机ID
   * @param {Number} length ID长度
   * @returns {String} 随机ID
   */
  generateId: function(length = 8) {
    return crypto.randomBytes(length).toString('hex');
  },
  
  /**
   * 生成JWT令牌
   * @param {Object} payload 令牌数据
   * @param {String} secret 密钥
   * @param {Object} options 选项
   * @returns {String} JWT令牌
   */
  generateToken: function(payload, secret, options = {}) {
    return jwt.sign(payload, secret, {
      expiresIn: '7d', // 默认7天有效期
      ...options
    });
  },
  
  /**
   * 验证JWT令牌
   * @param {String} token JWT令牌
   * @param {String} secret 密钥
   * @returns {Object} 解析后的数据
   */
  verifyToken: function(token, secret) {
    try {
      return jwt.verify(token, secret);
    } catch (error) {
      return null;
    }
  },
  
  /**
   * 哈希密码
   * @param {String} password 原始密码
   * @returns {String} 哈希后的密码
   */
  hashPassword: function(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
  },
  
  /**
   * 验证密码
   * @param {String} password 原始密码
   * @param {String} hashedPassword 哈希后的密码
   * @returns {Boolean} 密码是否匹配
   */
  verifyPassword: function(password, hashedPassword) {
    const [salt, hash] = hashedPassword.split(':');
    const computedHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return hash === computedHash;
  },
  
  /**
   * 延迟执行
   * @param {Number} ms 延迟毫秒数
   * @returns {Promise} Promise对象
   */
  delay: function(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },
  
  /**
   * 解析请求头中的认证信息
   * @param {Object} req 请求对象
   * @returns {String} 令牌
   */
  getTokenFromRequest: function(req) {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    
    return null;
  },
  
  /**
   * 处理API错误
   * @param {Error} error 错误对象
   * @param {Object} res 响应对象
   * @param {Number} statusCode 状态码
   */
  handleApiError: function(error, res, statusCode = 500) {
    console.error('API错误:', error);
    
    res.status(statusCode).json({
      error: error.message || '服务器内部错误'
    });
  }
};

module.exports = Utils;