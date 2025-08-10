const logger = require('../utils/logger');
const { ApiResponse } = require('../utils/response');

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

module.exports = {
    apiKeyAuth,
    optionalApiKeyAuth
};