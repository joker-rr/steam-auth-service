const express = require('express');
const cors = require('cors');

const logger = require('./utils/logger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// 路由导入
const healthRoutes = require('./routes/health');
const steamRoutes = require('./routes/steam');

const app = express();




// CORS配置
app.use(cors({
    origin: function (origin, callback) {
        // 允许的域名列表
        const allowedOrigins = [
            process.env.DOMESTIC_SERVER,  // 国内服务器
            'https://brickly.cn',
            'https://www.brickly.cn',
            'http://localhost:3000',
            'http://localhost:3001',
            'http://localhost:5173'  // Vite开发服务器
        ];

        // 允许无origin的请求（服务器到服务器）
        if (!origin) return callback(null, true);

        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.log('❌ CORS拒绝origin:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
    allowedHeaders: [
        // 🔥 标准头部
        'Content-Type',
        'Authorization',
        'Accept',
        'Accept-Language',
        'Accept-Encoding',

        // 🔥 HMAC签名头部（必须）
        'X-Server-ID',
        'X-Timestamp',
        'X-Nonce',
        'X-Signature',

        // 🔥 调试和追踪头部
        'X-Request-ID',
        'X-Source',
        'User-Agent'
    ],
    // 🔥 预检请求缓存时间
    maxAge: 86400 // 24小时
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