const logger = require('../utils/logger');
const { ApiResponse } = require('../utils/response');
const crypto = require('crypto');


/**
 * API Key认证中间件
 */
const apiKeyAuth = (req, res, next) => {
    const apiKey = req.headers['x-api-key'] ||
        req.headers['authorization']?.replace('Bearer ', '') ||
        req.query.api_key;

    // 获取配置的API密钥
    const validApiKey = process.env.API_SECRET;

    if (!validApiKey) {
        logger.error('API_SECRET未配置');
        return res.status(500).json(
            ApiResponse.error('CONFIG_ERROR', '服务配置错误')
        );
    }

    if (!apiKey) {
        logger.warn('API请求缺少认证密钥', {
            ip: req.ip,
            url: req.originalUrl,
            userAgent: req.get('User-Agent')
        });

        return res.status(401).json(
            ApiResponse.error('MISSING_API_KEY', '缺少API密钥')
        );
    }

    if (apiKey !== validApiKey) {
        logger.warn('API密钥验证失败', {
            ip: req.ip,
            url: req.originalUrl,
            providedKey: apiKey.substring(0, 10) + '...',
            userAgent: req.get('User-Agent')
        });

        return res.status(401).json(
            ApiResponse.error('INVALID_API_KEY', 'API密钥无效')
        );
    }

    // 验证成功，继续处理请求
    logger.info('API密钥验证成功', {
        ip: req.ip,
        url: req.originalUrl
    });

    next();
};

/**
 * 可选的API Key认证中间件（允许无密钥访问）
 */
const optionalApiKeyAuth = (req, res, next) => {
    const apiKey = req.headers['x-api-key'] ||
        req.headers['authorization']?.replace('Bearer ', '') ||
        req.query.api_key;

    if (apiKey) {
        const validApiKey = process.env.API_SECRET;

        if (apiKey === validApiKey) {
            req.authenticated = true;
            logger.info('API密钥验证成功（可选认证）', {
                ip: req.ip,
                url: req.originalUrl
            });
        } else {
            req.authenticated = false;
            logger.warn('API密钥验证失败（可选认证）', {
                ip: req.ip,
                url: req.originalUrl,
                providedKey: apiKey.substring(0, 10) + '...'
            });
        }
    } else {
        req.authenticated = false;
    }

    next();
};



// 🛡️ HMAC签名验证中间件
const verifyHMACSignature = (req, res, next) => {
    const requestId = req.headers['x-request-id'] || 'unknown';
    // 🔍 调试：打印所有请求头
    console.log('🔍 所有请求头:', JSON.stringify(req.headers, null, 2));
    try {
        const {
            'x-server-id': serverId,
            'x-timestamp': timestamp,
            'x-nonce': nonce,
            'x-signature': signature
        } = req.headers;

        console.log('🔍 验证HMAC签名:', {
            requestId,
            serverId,
            timestamp,
            nonce,
            signature: signature ? signature.substring(0, 16) + '...' : 'missing',
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });

        // 1. 检查必要的头部信息
        if (!serverId || !timestamp || !nonce || !signature) {
            console.log('❌ 缺少认证信息:', { serverId: !!serverId, timestamp: !!timestamp, nonce: !!nonce, signature: !!signature });
            return res.status(401).json({
                success: false,
                error: '缺少认证信息'
            });
        }

        // 2. 验证时间戳（防重放攻击）
        const now = Date.now();
        const requestTime = parseInt(timestamp);
        const timeDiff = Math.abs(now - requestTime);

        if (timeDiff > 300000) { // 5分钟内有效
            console.log('❌ 请求已过期:', {
                now,
                requestTime,
                timeDiff: `${Math.floor(timeDiff / 1000)}秒`
            });
            return res.status(401).json({
                success: false,
                error: `请求已过期，时间差异: ${Math.floor(timeDiff / 1000)}秒`
            });
        }

        // 3. 验证服务器ID白名单
        const allowedServers = [
            'domestic-cn-01',
            'domestic-cn-02',
            'domestic-test-01' // 测试服务器
        ];

        if (!allowedServers.includes(serverId)) {
            console.log('❌ 未授权的服务器ID:', serverId);
            return res.status(401).json({
                success: false,
                error: '未授权的服务器'
            });
        }

        // 4. 验证nonce格式（32位hex字符串）
        if (!/^[a-f0-9]{32}$/.test(nonce)) {
            console.log('❌ 无效的nonce格式:', nonce);
            return res.status(401).json({
                success: false,
                error: '无效的nonce格式'
            });
        }

        // 5. 防重放攻击 - 检查nonce是否已使用（简单内存缓存）
        if (!global.usedNonces) {
            global.usedNonces = new Map();
        }

        if (global.usedNonces.has(nonce)) {
            console.log('❌ Nonce已被使用:', nonce);
            return res.status(401).json({
                success: false,
                error: 'Nonce已被使用'
            });
        }

        // 添加到已使用列表（5分钟后自动清理）
        global.usedNonces.set(nonce, now);
        setTimeout(() => global.usedNonces.delete(nonce), 300000);

        // 6. 生成期望的签名并比较
        const API_SECRET = process.env.API_SECRET;
        if (!API_SECRET) {
            console.error('❌ API_SECRET 环境变量未设置');
            return res.status(500).json({
                success: false,
                error: '服务器配置错误'
            });
        }

        const payload = JSON.stringify(req.body) + timestamp + nonce + serverId;
        const expectedSignature = crypto.createHmac('sha256', API_SECRET).update(payload).digest('hex');

        console.log('🔍 签名验证详情:', {
            requestId,
            payloadLength: payload.length,
            expectedSig: expectedSignature.substring(0, 16) + '...',
            receivedSig: signature.substring(0, 16) + '...',
            match: signature === expectedSignature
        });

        if (signature !== expectedSignature) {
            console.log('❌ 签名验证失败');
            return res.status(401).json({
                success: false,
                error: '签名验证失败'
            });
        }

        // 7. 验证通过
        console.log('✅ HMAC签名验证成功:', {
            requestId,
            serverId,
            timeDiff: `${Math.floor(timeDiff / 1000)}秒`
        });

        next();

    } catch (error) {
        console.error('💥 签名验证异常:', {
            requestId,
            error: error.message,
            stack: error.stack
        });
        return res.status(500).json({
            success: false,
            error: '认证处理失败'
        });
    }
}





module.exports = {
    apiKeyAuth,
    optionalApiKeyAuth,
    verifyHMACSignature
};