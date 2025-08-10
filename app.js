const express = require('express');
const cors = require('cors');

const logger = require('./utils/logger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// 路由导入
const healthRoutes = require('./routes/health');
const steamRoutes = require('./routes/steam');

const app = express();

// 请求日志中间件
app.use((req, res, next) => {
    logger.info('Request received', {
        method: req.method,
        url: req.originalUrl,
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent')
    });
    next();
});

// CORS配置
app.use(cors({
    origin: [
        process.env.DOMESTIC_SERVER,
        'https://brickly.cn',
        'http://localhost:3000',
        'http://localhost:3001'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// 基础中间件
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 路由配置
app.use('/health', healthRoutes);
app.use('/api/steam', steamRoutes);

// 根路径响应
app.get('/', (req, res) => {
    res.json({
        success: true,
        service: 'Steam Auth Service',
        version: '1.0.0',
        architecture: 'MVC',
        timestamp: new Date().toISOString(),
        endpoints: {
            health: '/health',
            healthDetailed: '/health/detailed',
            healthPing: '/health/ping',
            steamAuth: '/api/steam/auth',
            steamVerify: '/api/steam/verify',
            steamUser: '/api/steam/user/:steamid',
            steamUsers: '/api/steam/users'
        },
        environment: process.env.NODE_ENV || 'development'
    });
});

// 404处理
app.use('*', notFoundHandler);

// 错误处理中间件
app.use(errorHandler);

module.exports = app;