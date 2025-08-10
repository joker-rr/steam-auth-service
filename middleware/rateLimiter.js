const logger = require('../utils/logger');
const { ApiResponse } = require('../utils/response');

// 内存中的速率限制器（简化版）
class SimpleRateLimiter {
    constructor() {
        this.clients = new Map();
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, 60000); // 每分钟清理一次过期记录
    }

    /**
     * 检查速率限制
     * @param {string} key - 客户端标识
     * @param {number} maxRequests - 最大请求数
     * @param {number} windowMs - 时间窗口（毫秒）
     * @returns {Object} 限制结果
     */
    checkLimit(key, maxRequests, windowMs) {
        const now = Date.now();
        const windowStart = now - windowMs;

        if (!this.clients.has(key)) {
            this.clients.set(key, []);
        }

        const requests = this.clients.get(key);

        // 清理过期请求
        const validRequests = requests.filter(timestamp => timestamp > windowStart);
        this.clients.set(key, validRequests);

        // 检查是否超过限制
        if (validRequests.length >= maxRequests) {
            return {
                allowed: false,
                remaining: 0,
                resetTime: validRequests[0] + windowMs,
                retryAfter: Math.ceil((validRequests[0] + windowMs - now) / 1000)
            };
        }

        // 记录当前请求
        validRequests.push(now);
        this.clients.set(key, validRequests);

        return {
            allowed: true,
            remaining: maxRequests - validRequests.length,
            resetTime: now + windowMs,
            retryAfter: 0
        };
    }

    /**
     * 清理过期记录
     */
    cleanup() {
        const now = Date.now();
        const maxAge = 3600000; // 1小时

        for (const [key, requests] of this.clients.entries()) {
            const validRequests = requests.filter(timestamp => timestamp > now - maxAge);
            if (validRequests.length === 0) {
                this.clients.delete(key);
            } else {
                this.clients.set(key, validRequests);
            }
        }
    }
}

// 全局速率限制器实例
const rateLimiter = new SimpleRateLimiter();

/**
 * 创建速率限制中间件
 * @param {number} maxRequests - 最大请求数
 * @param {number} windowMs - 时间窗口（毫秒）
 * @param {string} message - 限制消息
 * @returns {Function} 速率限制中间件
 */
const createRateLimiter = (maxRequests = 100, windowMs = 60000, message = '请求过于频繁') => {
    return (req, res, next) => {
        // 跳过健康检查接口
        if (req.path === '/health') {
            return next();
        }

        const clientKey = req.ip || req.connection.remoteAddress || 'unknown';
        const result = rateLimiter.checkLimit(clientKey, maxRequests, windowMs);

        // 设置响应头
        res.set({
            'X-RateLimit-Limit': maxRequests,
            'X-RateLimit-Remaining': result.remaining,
            'X-RateLimit-Reset': Math.ceil(result.resetTime / 1000)
        });

        if (!result.allowed) {
            logger.warn('速率限制触发', {
                ip: clientKey,
                url: req.originalUrl,
                userAgent: req.get('User-Agent'),
                limit: maxRequests,
                window: windowMs
            });

            res.set('Retry-After', result.retryAfter);
            return res.status(429).json(
                ApiResponse.error('RATE_LIMIT_EXCEEDED', message, {
                    limit: maxRequests,
                    window: windowMs,
                    retryAfter: result.retryAfter
                })
            );
        }

        next();
    };
};

// 预定义的速率限制器
const rateLimiters = {
    // 严格限制：5次/分钟（用于敏感操作）
    strict: createRateLimiter(5, 60000, '操作过于频繁，请稍后再试'),

    // 标准限制：20次/分钟（用于一般API）
    standard: createRateLimiter(20, 60000, '请求过于频繁，请稍后再试'),

    // 宽松限制：100次/分钟（用于公开接口）
    loose: createRateLimiter(100, 60000, '请求过于频繁，请稍后再试'),

    // Steam认证专用：10次/10分钟
    steamAuth: createRateLimiter(10, 600000, 'Steam认证请求过于频繁，请10分钟后再试')
};

module.exports = {
    createRateLimiter,
    rateLimiters
};