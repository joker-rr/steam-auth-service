const express = require('express');
const { ApiResponse } = require('../utils/response');

const router = express.Router();

/**
 * 基础健康检查接口
 * GET /health
 */
router.get('/', (req, res) => {
    const healthInfo = {
        memory: {
            used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
            unit: 'MB'
        },
        config: {
            baseUrl: process.env.BASE_URL,
            domesticServer: process.env.DOMESTIC_SERVER,
            nodeVersion: process.version,
            hasApiSecret: !!process.env.API_SECRET
        }
    };

    res.json(ApiResponse.health('healthy', {}, healthInfo));
});

/**
 * 详细健康检查接口
 * GET /health/detailed
 */
router.get('/detailed', async (req, res) => {
    const startTime = Date.now();

    const checks = {
        server: 'healthy',
        steam: 'unknown',
        config: 'healthy'
    };

    // 检查Steam连接性
    try {
        const response = await fetch('https://steamcommunity.com', {
            method: 'HEAD',
            timeout: 5000
        });
        checks.steam = response.ok ? 'healthy' : 'unhealthy';
    } catch (error) {
        checks.steam = 'unhealthy';
    }

    // 检查配置
    const requiredConfig = ['BASE_URL', 'DOMESTIC_SERVER', 'API_SECRET'];
    const missingConfig = requiredConfig.filter(key => !process.env[key]);
    if (missingConfig.length > 0) {
        checks.config = 'unhealthy';
    }

    const responseTime = Date.now() - startTime;
    const overallStatus = Object.values(checks).every(status => status === 'healthy') ? 'healthy' : 'degraded';

    const healthInfo = {
        checks,
        responseTime: `${responseTime}ms`,
        details: {
            missingConfig,
            endpoints: {
                steamAuth: '/api/steam/auth',
                steamVerify: '/api/steam/verify',
                steamUser: '/api/steam/user/:steamid'
            }
        }
    };

    const statusCode = overallStatus === 'healthy' ? 200 : 503;
    res.status(statusCode).json(ApiResponse.health(overallStatus, checks, healthInfo));
});

/**
 * 简单ping接口
 * GET /health/ping
 */
router.get('/ping', (req, res) => {
    res.json({
        pong: true,
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

module.exports = router;