require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件配置
app.use(cors({
    origin: [
        process.env.DOMESTIC_SERVER,
        'https://brickly.cn',
        'http://localhost:3000'
    ],
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 请求日志中间件
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} ${req.method} ${req.url}`);
    next();
});

// ====== Steam认证服务核心功能 ======

/**
 * 生成Steam OpenID认证URL
 */
function generateSteamAuthUrl(baseURL, token, redirect, tab) {
    const openidURL = new URL('https://steamcommunity.com/openid/login');
    const returnTo = new URL(`${baseURL}/api/steam/verify`);

    // 设置回调参数
    returnTo.searchParams.set('token', token);
    returnTo.searchParams.set('redirect', redirect || '/');
    returnTo.searchParams.set('tab', tab || 'preferences');

    // 设置OpenID参数
    openidURL.searchParams.set('openid.ns', 'http://specs.openid.net/auth/2.0');
    openidURL.searchParams.set('openid.mode', 'checkid_setup');
    openidURL.searchParams.set('openid.claimed_id', 'http://specs.openid.net/auth/2.0/identifier_select');
    openidURL.searchParams.set('openid.identity', 'http://specs.openid.net/auth/2.0/identifier_select');
    openidURL.searchParams.set('openid.return_to', returnTo.toString());
    openidURL.searchParams.set('openid.realm', baseURL);

    return openidURL.toString();
}

/**
 * 验证Steam OpenID签名
 */
async function verifySteamResponse(queryParams) {
    if (!queryParams['openid.claimed_id']) {
        console.log('❌ Missing claimed_id');
        return false;
    }

    // 构建验证请求
    const body = new URLSearchParams();
    for (const key in queryParams) {
        if (key.startsWith('openid.')) {
            body.set(key, queryParams[key]);
        }
    }
    body.set('openid.mode', 'check_authentication');

    try {
        console.log('🔍 验证Steam签名...');
        const response = await fetch('https://steamcommunity.com/openid/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'SteamAuthService/1.0'
            },
            body: body.toString()
        });

        const result = await response.text();
        const isValid = result.includes('is_valid:true');
        console.log(`✅ Steam验证结果: ${isValid}`);
        return isValid;
    } catch (error) {
        console.error('❌ Steam verification error:', error.message);
        return false;
    }
}

/**
 * 从claimed_id中提取Steam ID
 */
function extractSteamId(claimedId) {
    if (!claimedId) return null;
    return claimedId.replace('https://steamcommunity.com/openid/id/', '');
}

// ====== 路由定义 ======

// 健康检查
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'Steam Auth Service',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        environment: process.env.NODE_ENV
    });
});

// 根路径
app.get('/', (req, res) => {
    res.json({
        success: true,
        service: 'Steam Auth Service',
        version: '1.0.0',
        endpoints: {
            health: '/health',
            steamAuth: '/api/steam/auth',
            steamVerify: '/api/steam/verify'
        },
        timestamp: new Date().toISOString()
    });
});

// Steam登录跳转
app.get('/api/steam/auth', (req, res) => {
    try {
        const { token, redirect, tab } = req.query;

        if (!token) {
            return res.status(400).json({
                success: false,
                message: '缺少token参数'
            });
        }

        const baseURL = process.env.BASE_URL;
        const steamAuthUrl = generateSteamAuthUrl(baseURL, token, redirect, tab);

        console.log('🚀 Steam认证跳转:', steamAuthUrl.substring(0, 100) + '...');
        res.redirect(steamAuthUrl);
    } catch (error) {
        console.error('❌ Steam auth error:', error);
        res.status(500).json({
            success: false,
            message: 'Steam认证失败'
        });
    }
});

// Steam回调验证
app.get('/api/steam/verify', async (req, res) => {
    try {
        const { token, redirect, tab } = req.query;

        console.log('📥 Steam回调接收');
        console.log('Token:', token ? token.substring(0, 10) + '...' : 'missing');
        console.log('Redirect:', redirect);
        console.log('Has OpenID data:', !!req.query['openid.claimed_id']);

        // 验证Steam返回
        const isValid = await verifySteamResponse(req.query);
        if (!isValid) {
            console.log('❌ Steam验证失败');
            const errorUrl = `${process.env.DOMESTIC_SERVER}${redirect || '/'}?error=steam_verify_failed&tab=${tab}`;
            return res.redirect(errorUrl);
        }

        // 提取Steam ID
        const steamId = extractSteamId(req.query['openid.claimed_id']);
        if (!steamId) {
            console.log('❌ 无法提取Steam ID');
            const errorUrl = `${process.env.DOMESTIC_SERVER}${redirect || '/'}?error=invalid_steam_id&tab=${tab}`;
            return res.redirect(errorUrl);
        }

        console.log('✅ Steam认证成功, Steam ID:', steamId);

        // 跳转回国内服务器，携带认证结果
        const callbackUrl = `${process.env.DOMESTIC_SERVER}/api/steam/callback?` +
            `token=${encodeURIComponent(token)}&` +
            `steamId=${steamId}&` +
            `tab=${tab || 'preferences'}&` +
            `redirect=${encodeURIComponent(redirect || '/')}&` +
            `success=1`;

        console.log('🔄 跳转回国内服务器:', callbackUrl.substring(0, 100) + '...');
        res.redirect(callbackUrl);

    } catch (error) {
        console.error('❌ Steam verify error:', error);
        const errorUrl = `${process.env.DOMESTIC_SERVER}${req.query.redirect || '/'}?error=server_error&tab=${req.query.tab}`;
        res.redirect(errorUrl);
    }
});

// 404处理
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'API endpoint not found',
        path: req.originalUrl
    });
});

// 错误处理
app.use((error, req, res, next) => {
    console.error('💥 Server Error:', error);
    res.status(500).json({
        success: false,
        message: 'Internal Server Error'
    });
});

// 启动服务器
app.listen(PORT, () => {
    console.log('🚀 Steam Auth Service Started');
    console.log(`📡 Port: ${PORT}`);
    console.log(`🌍 Base URL: ${process.env.BASE_URL}`);
    console.log(`🏠 Domestic Server: ${process.env.DOMESTIC_SERVER}`);
    console.log(`⏰ Started at: ${new Date().toISOString()}`);
    console.log('');
    console.log('📋 可用接口:');
    console.log(`  健康检查: ${process.env.BASE_URL}/health`);
    console.log(`  Steam认证: ${process.env.BASE_URL}/api/steam/auth?token=xxx`);
    console.log('');
});

// 优雅关闭
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    process.exit(0);
});

module.exports = app;