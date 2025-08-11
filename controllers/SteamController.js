const SteamService = require('../services/SteamService');
const logger = require('../utils/logger');
const { steamInfoApi } = require('../api/api');

class SteamController {
    constructor() {
        this.steamService = new SteamService();
    }
    // 海外服务器 - 提供Steam验证接口
    async verifyOpenid(req, res) {
        try {
            const { openidParams } = req.body;

            const isValid = await this.steamService.verifyOpenId(openidParams);

            res.json({
                success: true,
                isValid: isValid
            });
        } catch (error) {
            res.json({
                success: false,
                error: error.message
            });
        }

    }


    async getSteamUserInfo(req, res) {

        try {
            const { steamId, userAgent } = req.body;

            const userInfo = await this.steamService.getUserInfo(steamId, userAgent);

            res.json({
                success: true,
                userInfo: userInfo
            });
        } catch (error) {
            res.json({
                success: false,
                error: error.message
            });
        }


    }



    async getSteamItemInfo(req, res) {

        try {
            const { classid, instanceid } = req.query;

            const item = await this.steamService.fetchItemFromSteamAPI(classid, instanceid);

            res.json({
                success: true,
                item: item
            });
        } catch (error) {
            res.json({
                success: false,
                error: error.message
            });
        }


    }



    /**
     * Steam登录认证入口
     * GET /api/steam/auth?token=xxx&redirect=/&tab=preferences
     */
    async auth(req, res, next) {
        const requestId = `auth_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        logger.info('🚀 Steam认证请求开始', {
            requestId,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            query: req.query,
            timestamp: new Date().toISOString()
        });

        try {
            const { token, redirect, tab } = req.query;

            // 参数验证
            logger.debug('📋 验证请求参数', {
                requestId,
                hasToken: !!token,
                redirect,
                tab,
                allParams: Object.keys(req.query)
            });

            if (!token) {
                logger.warn('❌ Steam认证请求缺少token', {
                    requestId,
                    ip: req.ip,
                    query: req.query
                });
                return this._redirectWithError(res, redirect, tab, 'missing_token', '缺少token参数', requestId);
            }

            // 生成Steam认证URL
            const baseURL = process.env.BASE_URL;
            logger.info('🔗 开始生成Steam认证URL', {
                requestId,
                baseURL,
                token: token.substring(0, 8) + '...' // 只记录前8位，保护隐私
            });

            const steamAuthUrl = this.steamService.generateAuthUrl(baseURL, token, redirect, tab);

            logger.info('✅ Steam认证URL生成成功', {
                requestId,
                steamAuthUrl: steamAuthUrl.substring(0, 100) + '...', // 截断URL避免过长
                redirectTo: steamAuthUrl.includes('steamcommunity.com') ? 'Steam官方' : '未知'
            });

            // 重定向到Steam登录页面
            logger.info('🔄 重定向到Steam登录页面', {
                requestId,
                action: 'redirect_to_steam'
            });

            res.redirect(steamAuthUrl);

        } catch (error) {
            logger.error('💥 Steam认证跳转失败', {
                requestId,
                error: error.message,
                stack: error.stack,
                ip: req.ip,
                query: req.query
            });
            return this._redirectWithError(res, redirect, tab, 'Steam_faild', 'Steam认证跳转失败', requestId);
        }
    }

    /**
     * Steam登录回调验证 - POST方案
     * GET /api/steam/verify?token=xxx&redirect=/&tab=preferences&openid.*=...
     */
    async verify(req, res, next) {
        const requestId = `verify_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        logger.info('🔍 Steam回调验证开始', {
            requestId,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            queryKeys: Object.keys(req.query),
            openidMode: req.query['openid.mode'],
            timestamp: new Date().toISOString()
        });

        try {
            const { token, redirect, tab } = req.query;

            // 参数验证
            logger.debug('📋 验证回调参数', {
                requestId,
                hasToken: !!token,
                redirect,
                tab,
                openidKeys: Object.keys(req.query).filter(key => key.startsWith('openid.')),
                totalParams: Object.keys(req.query).length
            });

            if (!token) {
                logger.warn('❌ Steam回调缺少token', {
                    requestId,
                    query: req.query
                });
                return this._redirectWithError(res, redirect, tab, 'missing_token', '缺少token参数', requestId);
            }

            // 验证Steam OpenID签名
            logger.info('🔐 开始验证Steam OpenID签名', {
                requestId,
                openidMode: req.query['openid.mode'],
                openidSig: req.query['openid.sig'] ? req.query['openid.sig'].substring(0, 10) + '...' : 'missing',
                claimedId: req.query['openid.claimed_id']
            });

            const isValid = await this.steamService.verifyOpenId(req.query);

            logger.info(isValid ? '✅ Steam签名验证成功' : '❌ Steam签名验证失败', {
                requestId,
                isValid,
                verificationDetails: {
                    mode: req.query['openid.mode'],
                    hasSig: !!req.query['openid.sig'],
                    hasAssocHandle: !!req.query['openid.assoc_handle'],
                    hasClaimedId: !!req.query['openid.claimed_id']
                }
            });

            if (!isValid) {
                logger.warn('🚫 Steam签名验证失败', {
                    requestId,
                    ip: req.ip,
                    openidParams: Object.keys(req.query).filter(key => key.startsWith('openid.'))
                });
                return this._redirectWithError(res, redirect, tab, 'steam_verify_failed', 'Steam签名验证失败', requestId);
            }

            // 提取Steam ID
            const claimedId = req.query['openid.claimed_id'];
            logger.info('🆔 开始提取Steam ID', {
                requestId,
                claimedId
            });

            const steamId = this.steamService.extractSteamId(claimedId);

            if (!steamId) {
                logger.warn('❌ 无法提取Steam ID', {
                    requestId,
                    claimedId,
                    claimedIdPattern: claimedId ? claimedId.match(/\/(\d+)$/) : null
                });
                return this._redirectWithError(res, redirect, tab, 'invalid_steam_id', '无法提取Steam ID', requestId);
            }

            logger.info('✅ Steam ID提取成功', {
                requestId,
                steamId,
                steamIdLength: steamId.length
            });

            // 获取Steam用户详细信息
            logger.info('👤 开始获取Steam用户信息', {
                requestId,
                steamId
            });

            let userInfo;
            try {
                const startTime = Date.now();
                userInfo = await this.steamService.getUserInfo(steamId);
                const endTime = Date.now();

                logger.info('✅ Steam用户信息获取成功', {
                    requestId,
                    steamId,
                    nickname: userInfo.nickname,
                    hasAvatar: !!userInfo.avatar,
                    avatarUrl: userInfo.avatar ? userInfo.avatar.substring(0, 50) + '...' : null,
                    responseTime: `${endTime - startTime}ms`,
                    userDataKeys: Object.keys(userInfo)
                });

            } catch (error) {
                logger.error('❌ 获取Steam用户信息失败', {
                    requestId,
                    steamId,
                    error: error.message,
                    stack: error.stack,
                    errorCode: error.code,
                    apiResponse: error.response ? {
                        status: error.response.status,
                        statusText: error.response.statusText
                    } : null
                });

                return this._redirectWithError(res, redirect, tab, 'getSteamInfo_failed', '获取steam信息失败', requestId);
            }

            // 🆕 向国内服务器发送POST请求
            logger.info('🌐 开始向国内服务器发送认证结果', {
                requestId,
                steamId: userInfo.steamId,
                domesticServer: process.env.DOMESTIC_SERVER,
                api: steamInfoApi.steamInfo
            });

            try {
                const authResult = await this._sendAuthResultToDomesticServer({
                    token,
                    userInfo,
                    redirect,
                    tab,
                    requestId
                });

                logger.info('📨 国内服务器响应', {
                    requestId,
                    success: authResult.success,
                    hasRedirectUrl: !!authResult.redirectUrl,
                    errorCode: authResult.errorCode,
                    message: authResult.message,
                    responseKeys: Object.keys(authResult)
                });

                // 根据国内服务器的响应，重定向用户
                if (authResult.success) {
                    logger.info('🎉 认证流程完成，重定向用户', {
                        requestId,
                        redirectUrl: authResult.redirectUrl,
                        steamId: userInfo.steamId,
                        nickname: userInfo.nickname
                    });
                    res.redirect(authResult.redirectUrl);
                } else {
                    logger.warn('⚠️ 国内服务器处理失败', {
                        requestId,
                        errorCode: authResult.errorCode,
                        message: authResult.message,
                        steamId: userInfo.steamId
                    });

                    this._redirectWithError(res, redirect, tab, authResult.errorCode || 'domestic_server_error', authResult.message || '处理失败', requestId);
                }

            } catch (domesticError) {
                logger.error('💥 国内服务器通信失败', {
                    requestId,
                    error: domesticError.message,
                    stack: domesticError.stack,
                    steamId: userInfo.steamId,
                    errorType: domesticError.name,
                    isNetworkError: domesticError.code === 'ECONNREFUSED' || domesticError.code === 'ETIMEDOUT'
                });

                return this._redirectWithError(res, req.query.redirect, req.query.tab, 'server_error', '服务器错误', requestId);
            }

        } catch (error) {
            logger.error('💥 Steam回调验证失败', {
                requestId,
                error: error.message,
                stack: error.stack,
                ip: req.ip,
                errorType: error.name,
                queryKeys: Object.keys(req.query)
            });
            return this._redirectWithError(res, req.query.redirect, req.query.tab, 'server_error', '服务器错误', requestId);
        }
    }

    /**
     * 向国内服务器发送POST请求传递认证结果
     * @private
     */
    async _sendAuthResultToDomesticServer({ token, userInfo, redirect, tab, requestId }) {
        const domesticApiUrl = `${process.env.DOMESTIC_SERVER}${steamInfoApi.steamInfo}`;
        const requestData = {
            token: token,
            success: true,
            steamUser: {
                steamId: userInfo.steamId,
                nickname: userInfo.nickname,
                avatar: userInfo.avatar,
                bindTime: new Date().toISOString()
            },
        };

        logger.info('📤 准备发送请求到国内服务器', {
            requestId,
            url: domesticApiUrl,
            steamId: userInfo.steamId,
            nickname: userInfo.nickname,
            hasAvatar: !!userInfo.avatar,
            tokenPrefix: token ? token.substring(0, 8) + '...' : 'missing',
            requestSize: JSON.stringify(requestData).length
        });

        try {
            const startTime = Date.now();

            const response = await fetch(domesticApiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'SteamAuthService/1.0',
                    'X-Source': 'overseas-auth-server',
                    'X-Steam-ID': userInfo.steamId,
                    'X-Request-ID': requestId
                },
                body: JSON.stringify(requestData),
                timeout: 10000
            });

            const endTime = Date.now();
            const responseTime = endTime - startTime;

            logger.info('📨 收到国内服务器响应', {
                requestId,
                status: response.status,
                statusText: response.statusText,
                responseTime: `${responseTime}ms`,
                headers: {
                    contentType: response.headers.get('content-type'),
                    server: response.headers.get('server'),
                    date: response.headers.get('date')
                }
            });



            const result = await response.json();

            logger.info('📋 解析国内服务器响应数据', {
                requestId,
                success: result.success,
                resultKeys: Object.keys(result),
                hasData: !!result.data,
                hasError: !!result.error
            });

            return result;

        } catch (error) {
            logger.error('💥 国内服务器通信异常', {
                requestId,
                error: error.message,
                stack: error.stack,
                url: domesticApiUrl,
                steamId: userInfo.steamId,
                errorType: error.name,
                isTimeout: error.name === 'AbortError',
                isNetworkError: error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT'
            });
            throw error;
        }
    }

    /**
     * 错误重定向
     * @private
     */
    _redirectWithError(res, redirect, tab, errorCode, errorMessage, requestId) {
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

        logger.warn('🔄 错误重定向', {
            requestId: requestId || 'unknown',
            errorCode,
            errorMessage,
            redirectPath,
            finalUrl: errorUrl,
            baseUrl
        });

        res.redirect(errorUrl);
    }
}

module.exports = SteamController;