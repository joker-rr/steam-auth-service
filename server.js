require('dotenv').config();
const app = require('./app');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 3001;

// 启动服务器
const server = app.listen(PORT, () => {
    logger.info('🚀 Steam Auth Service Started (MVC架构)', {
        port: PORT,
        environment: process.env.NODE_ENV,
        baseUrl: process.env.BASE_URL,
        domesticServer: process.env.DOMESTIC_SERVER,
        timestamp: new Date().toISOString()
    });

    // 显示可用接口
    console.log('');
    console.log('📋 可用接口:');
    console.log(`  根路径: ${process.env.BASE_URL || `http://localhost:${PORT}`}/`);
    console.log(`  健康检查: ${process.env.BASE_URL || `http://localhost:${PORT}`}/health`);
    console.log(`  Steam认证: ${process.env.BASE_URL || `http://localhost:${PORT}`}/api/steam/auth?token=xxx`);
    console.log(`  Steam用户信息: ${process.env.BASE_URL || `http://localhost:${PORT}`}/api/steam/user/:steamid`);
    console.log('');
});

// 优雅关闭处理
const gracefulShutdown = (signal) => {
    logger.info(`${signal} received, shutting down gracefully`);

    server.close(() => {
        logger.info('HTTP server closed');

        // 关闭其他连接（数据库、Redis等）
        // 这里可以添加其他清理逻辑

        logger.info('Process terminated gracefully');
        process.exit(0);
    });

    // 强制退出保护
    setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 10000);
};

// 监听终止信号
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// 未捕获异常处理
process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception:', {
        message: err.message,
        stack: err.stack
    });
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection:', {
        reason: reason,
        promise: promise
    });
    process.exit(1);
});

module.exports = server;