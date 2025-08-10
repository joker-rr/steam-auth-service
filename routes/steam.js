const express = require('express');
const SteamController = require('../controllers/SteamController');
const { asyncHandler } = require('../middleware/errorHandler');
const { rateLimiters } = require('../middleware/rateLimiter');
const { apiKeyAuth, optionalApiKeyAuth } = require('../middleware/auth');

const router = express.Router();
const steamController = new SteamController();

/**
 * Steam认证路由
 */

// Steam登录认证入口
// GET /api/steam/auth?token=xxx&redirect=/&tab=preferences
router.get('/auth',
    rateLimiters.steamAuth, // 10次/10分钟
    asyncHandler(steamController.auth.bind(steamController))
);

// Steam登录回调验证
// GET /api/steam/verify?token=xxx&redirect=/&tab=preferences&openid.*=...
router.get('/verify',
    rateLimiters.standard, // 20次/分钟
    asyncHandler(steamController.verify.bind(steamController))
);




module.exports = router;