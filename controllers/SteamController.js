const SteamService = require('../services/SteamService');
const logger = require('../utils/logger');
const { steamInfoApi } = require('../api/api');


class SteamController {
    constructor() {
        this.steamService = new SteamService();
    }

    /**
     * Steam登录认证入口
     * GET /api/steam/auth?token=xxx&redirect=/&tab=preferences
     */
    async auth(req, res, next) {
        try {
            const { token, redirect, tab } = req.query;

            // 参数验证
            if (!token) {
                logger.warn('Steam认证请求缺少token', { ip: req.ip });
                return this._redirectWithError(res, redirect, tab, 'missing_token', '缺少token参数');
            }

            // 生成Steam认证URL
            const baseURL = process.env.BASE_URL;
            const steamAuthUrl = this.steamService.generateAuthUrl(baseURL, token, redirect, tab);

            // 重定向到Steam登录页面
            res.redirect(steamAuthUrl);

        } catch (error) {
            logger.error('Steam认证跳转失败', {
                error: error.message,
                stack: error.stack,
                ip: req.ip
            });
            return this._redirectWithError(res, redirect, tab, 'Steam_faild', 'Steam认证跳转失败');
        }
    }

    /**
  * Steam登录回调验证 - POST方案
  * GET /api/steam/verify?token=xxx&redirect=/&tab=preferences&openid.*=...
  */
    async verify(req, res, next) {
        try {
            const { token, redirect, tab } = req.query;

            // 参数验证
            if (!token) {
                logger.warn('Steam回调缺少token');
                return this._redirectWithError(res, redirect, tab, 'missing_token', '缺少token参数');
            }

            // 验证Steam OpenID签名
            const isValid = await this.steamService.verifyOpenId(req.query);
            if (!isValid) {
                logger.warn('Steam签名验证失败', { ip: req.ip });
                return this._redirectWithError(res, redirect, tab, 'steam_verify_failed', 'Steam签名验证失败');
            }

            // 提取Steam ID
            const steamId = this.steamService.extractSteamId(req.query['openid.claimed_id']);
            if (!steamId) {
                logger.warn('无法提取Steam ID', { claimedId: req.query['openid.claimed_id'] });
                return this._redirectWithError(res, redirect, tab, 'invalid_steam_id', '无法提取Steam ID');
            }


            // 获取Steam用户详细信息
            let userInfo;
            try {
                userInfo = await this.steamService.getUserInfo(steamId);

            } catch (error) {
                logger.warn('获取Steam用户信息失败，使用默认信息', {
                    steamId,
                    error: error.message
                });

                return this._redirectWithError(res, redirect, tab, 'getSteamInfo_failed', '获取steam信息失败');
            }

            // 🆕 向国内服务器发送POST请求
            try {
                const authResult = await this._sendAuthResultToDomesticServer({
                    token,
                    userInfo,
                    redirect,
                    tab,
                });


                // 根据国内服务器的响应，重定向用户
                if (authResult.success) {
                    res.redirect(authResult.redirectUrl);
                } else {
                    // 处理失败，重定向到错误页面

                    this._redirectWithError(res, redirect, tab, authResult.errorCode || 'domestic_server_error', authResult.message || '处理失败');
                }


            } catch (domesticError) {
                logger.error('国内服务器通信失败', {
                    error: domesticError.message,
                    steamId: userInfo.steamId
                });


                return this._redirectWithError(res, req.query.redirect, req.query.tab, 'server_error', '服务器错误');
            }

        } catch (error) {
            logger.error('Steam回调验证失败', {
                error: error.message,
                stack: error.stack,
                ip: req.ip
            });
            return this._redirectWithError(res, req.query.redirect, req.query.tab, 'server_error', '服务器错误');
        }
    }

    /**
     * 向国内服务器发送POST请求传递认证结果
     * @private
     */
    async _sendAuthResultToDomesticServer({ token, userInfo, redirect, tab }) {
        const domesticApiUrl = `${process.env.DOMESTIC_SERVER}${steamInfoApi.steamInfo}`;
        const requestData = {
            // 认证信息
            token: token,
            success: true,

            // Steam用户信息
            steamUser: {
                steamId: userInfo.steamId,
                nickname: userInfo.nickname,
                avatar: userInfo.avatar,
                bindTime: new Date().toISOString()
            },

        };


        try {
            const response = await fetch(domesticApiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'SteamAuthService/1.0',
                    'X-Source': 'overseas-auth-server',
                    'X-Steam-ID': userInfo.steamId
                },
                body: JSON.stringify(requestData),
                timeout: 10000 // 10秒超时
            });

            const result = await response.json();
            return result;

        } catch (error) {
            logger.error('国内服务器通信失败', {
                error: error.message,
                url: domesticApiUrl,
                steamId: userInfo.steamId
            });
            throw error;
        }
    }

    /**
     * 错误重定向
     * @private
     */
    _redirectWithError(res, redirect, tab, errorCode, errorMessage) {
        const baseUrl = process.env.DOMESTIC_SERVER;
        const redirectPath = redirect || '/';

        const params = new URLSearchParams({
            error: encodeURIComponent(errorMessage),
            errorCode,
            showSetting: 1,
            tab: tab || 'preferences',
            type: 'warning'
        });
        const errorUrl = `${baseUrl}${redirectPath}?${params.toString()}`;
        res.redirect(errorUrl);
    }
}

module.exports = SteamController;