const logger = require('../utils/logger');
const { ApiResponse } = require('../utils/response');

/**
 * 全局错误处理中间件
 */
const errorHandler = (err, req, res, next) => {
    // 记录错误日志
    logger.error('Unhandled Error:', {
        message: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });

    // 根据错误类型返回不同的响应
    let statusCode = 500;
    let errorCode = 'INTERNAL_SERVER_ERROR';
    let errorMessage = 'Internal Server Error';

    // 处理不同类型的错误
    if (err.name === 'ValidationError') {
        statusCode = 400;
        errorCode = 'VALIDATION_ERROR';
        errorMessage = err.message;
    } else if (err.name === 'UnauthorizedError') {
        statusCode = 401;
        errorCode = 'UNAUTHORIZED';
        errorMessage = 'Unauthorized access';
    } else if (err.name === 'ForbiddenError') {
        statusCode = 403;
        errorCode = 'FORBIDDEN';
        errorMessage = 'Access forbidden';
    } else if (err.name === 'NotFoundError') {
        statusCode = 404;
        errorCode = 'NOT_FOUND';
        errorMessage = 'Resource not found';
    } else if (err.name === 'ConflictError') {
        statusCode = 409;
        errorCode = 'CONFLICT';
        errorMessage = err.message;
    } else if (err.name === 'RateLimitError') {
        statusCode = 429;
        errorCode = 'RATE_LIMIT_EXCEEDED';
        errorMessage = 'Too many requests';
    }

    // 在开发环境下返回详细错误信息
    const errorDetails = process.env.NODE_ENV === 'development' ? {
        stack: err.stack,
        details: err.details || {}
    } : {};

    res.status(statusCode).json(
        ApiResponse.error(errorCode, errorMessage, errorDetails)
    );
};

/**
 * 404错误处理
 */
const notFoundHandler = (req, res) => {
    res.status(404).json(
        ApiResponse.error('NOT_FOUND', `Route ${req.method} ${req.originalUrl} not found`)
    );
};

/**
 * 异步错误包装器
 */
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

module.exports = {
    errorHandler,
    notFoundHandler,
    asyncHandler
};