
const jwt = require('jsonwebtoken');
const ApiResponse = require('../utils/response');
const SteamService = require('../services/steamService');
const UserService = require('../services/userService');
const RedisService = require('../services/redisService');

class SteamController {
    constructor(connection, redisClient) {
        this.steamService = new SteamService(connection);
        this.userService = new UserService(connection);
        this.redisService = new RedisService(redisClient);
    }
    // Steam 登录跳转
    steamAuth(req, res) {
        try {
            const { token, redirect, tab } = req.query;

            if (!token) {
                res.status(400).json(ApiResponse.error('TOKEN_ERROR', '缺少用户 token'));
            }


            const protocol = req.secure || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
            const host = req.get('host'); // 例如：brickly.cn
            const baseURL = `${protocol}://${host}`;


            const steamAuthUrl = this.steamService.generateSteamAuthUrl(baseURL, token, redirect, tab);
            res.redirect(steamAuthUrl);
        } catch (error) {
            console.error('Steam auth redirect error:', error);
            res.status(500).json(ApiResponse.error('STEAM_ERROR', 'Steam 认证跳转失败'));

        }
    }

    // Steam 登录回调验证
    async steamVerify(req, res) {
        try {
            const { token, redirect, tab } = req.query;

            if (!token) {
                return res.status(400).json(ApiResponse.error('TOKEN_ERROR', '缺少用户 token')); // ✅ 添加return
            }



            // 🔑 先尝试正常验证
            const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
            const userId = decoded.id;

            // 验证Steam OpenID
            const isValid = await this.steamService.verifySteamOpenId(req.query);
            if (!isValid) {
                return res.status(400).json(ApiResponse.error('STEAM_ERROR', 'Steam 签名验证失败'));
            }

            // 提取Steam ID
            const steamId = this.steamService.extractSteamId(req.query['openid.claimed_id']);
            if (!steamId) {
                return res.status(400).json(ApiResponse.error('STEAM_ERROR', '无效的Steam ID'));
            }

            // 重定向到前端
            const frontendUrl = process.env.FRONTEND_URL;
            const redirectPath = redirect || '/';
            const tabParam = tab || 'preferences';


            // ✅ 先检查用户是否已经绑定了Steam账户
            const existingAccounts = await this.steamService.checkSteamIdExists(steamId)

            if (existingAccounts) {
                // ✅ 已绑定：重定向并携带错误信息
                console.log('⚠️ Steam账户已绑定，重定向并显示提示');

                const errorMsg = encodeURIComponent('该Steam账户已绑定，无法重复绑定');
                return res.redirect(`${frontendUrl}${redirectPath}?showSetting=1&tab=${tabParam}&error=${errorMsg}&type=warning`);

            } else {
                // 获取Steam用户信息并保存
                const userInfo = await this.steamService.getSteamUserInfo(steamId, req.headers['user-agent']);
                await this.steamService.saveSteamAccount(userId, steamId, userInfo);
                return res.redirect(`${frontendUrl}${redirectPath}?showSetting=1&tab=${tabParam}&steamBound=1`);
            }

        } catch (error) {
            console.error('🔥 Steam 验证失败:', error.message);
            if (error.name === 'TokenExpiredError') {
                return res.status(402).json(
                    ApiResponse.error('TOKEN_EXPIRED', '令牌已过期')
                );
            } else if (error.name === 'JsonWebTokenError') {
                return res.status(402).json(
                    ApiResponse.error('INVALID_TOKEN', '无效的令牌')
                );
            } else {
                return res.status(500).json(
                    ApiResponse.error('SERVER_ERROR', '服务器错误')
                );
            }
        }
    }

    //获取 steam信息

    async getSteamAccount(req, res) {
        try {

            const userWithSteam = await this.userService.findUserWithSteam(req.user.id);

            res.json(ApiResponse.success({
                steamAccounts: userWithSteam.steamid ? [{
                    steamid: userWithSteam.steamid,
                    steam_nickname: userWithSteam.steam_nickname,
                    avatar: userWithSteam.avatar
                }] : []
            }, 'Steam账户信息获取成功'));

        } catch (error) {
            console.error('获取Steam账户信息失败:', error);
            return res.status(500).json(ApiResponse.error('SERVER_ERROR', '获取Steam账户信息失败'));
        }
    }

}

module.exports = SteamController;