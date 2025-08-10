const logger = require('../utils/logger');
const cheerio = require('cheerio');

class SteamService {
    constructor() {
        this.steamOpenIdUrl = 'https://steamcommunity.com/openid/login';
        this.steamProfileUrl = 'https://steamcommunity.com/profiles/';
        this.steamApiUrl = 'https://api.steampowered.com';
    }

    /**
     * 生成Steam OpenID认证URL
     * @param {string} baseURL - 回调基础URL
     * @param {string} token - 用户token
     * @param {string} redirect - 重定向路径
     * @param {string} tab - 标签页参数
     * @returns {string} Steam认证URL
     */
    generateAuthUrl(baseURL, token, redirect = '/', tab = 'preferences') {
        try {
            const openidURL = new URL(this.steamOpenIdUrl);
            const returnTo = new URL(`${baseURL}/api/steam/verify`);

            // 设置回调参数
            returnTo.searchParams.set('token', token);
            returnTo.searchParams.set('redirect', redirect);
            returnTo.searchParams.set('tab', tab);

            // 设置OpenID参数
            openidURL.searchParams.set('openid.ns', 'http://specs.openid.net/auth/2.0');
            openidURL.searchParams.set('openid.mode', 'checkid_setup');
            openidURL.searchParams.set('openid.claimed_id', 'http://specs.openid.net/auth/2.0/identifier_select');
            openidURL.searchParams.set('openid.identity', 'http://specs.openid.net/auth/2.0/identifier_select');
            openidURL.searchParams.set('openid.return_to', returnTo.toString());
            openidURL.searchParams.set('openid.realm', baseURL);

            return openidURL.toString();
        } catch (error) {
            logger.error('生成Steam认证URL失败', { error: error.message });
            throw new Error('生成Steam认证URL失败');
        }
    }

    /**
     * 验证Steam OpenID签名
     * @param {Object} queryParams - Steam回调的查询参数
     * @returns {Promise<boolean>} 验证结果
     */
    async verifyOpenId(queryParams) {
        try {

            // 检查必要参数
            if (!queryParams['openid.claimed_id']) {
                logger.warn('Steam回调缺少claimed_id');
                return false;
            }

            // 构建验证请求体
            const body = new URLSearchParams();
            for (const key in queryParams) {
                if (key.startsWith('openid.')) {
                    body.set(key, queryParams[key]);
                }
            }
            body.set('openid.mode', 'check_authentication');


            // 发送验证请求到Steam
            const response = await fetch(this.steamOpenIdUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'SteamAuthService/1.0',
                    'Accept': 'text/plain'
                },
                body: body.toString(),
                timeout: 10000
            });

            const result = await response.text();
            const isValid = result.includes('is_valid:true');

            return isValid



        } catch (error) {
            logger.error('Steam OpenID验证异常', { error: error.message });
            return false;
        }
    }


    /**
     * 从claimed_id中提取Steam ID
     * @param {string} claimedId - OpenID claimed_id
     * @returns {string|null} Steam ID
     */

    extractSteamId(claimedId) {
        if (!claimedId) return null;
        return claimedId.replace('https://steamcommunity.com/openid/id/', '');
    }

    /**
     * 获取Steam用户信息（通过爬取Steam页面）
     * @param {string} steamId - Steam ID
     * @returns {Promise<Object>} 用户信息
     */

    async getUserInfo(steamId) {
        const requestId = `getUserInfo_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

        logger.info('👤 开始获取Steam用户信息', {
            requestId,
            steamId,
            timestamp: new Date().toISOString()
        });

        try {
            // 构建Steam个人资料URL
            const profileUrl = `${this.steamProfileUrl}${steamId}`;

            logger.info('🔗 构建Steam个人资料URL', {
                requestId,
                steamId,
                profileUrl,
                baseUrl: this.steamProfileUrl
            });

            // 请求Steam个人资料页面
            logger.info('📤 发送请求到Steam个人资料页面', {
                requestId,
                url: profileUrl,
                headers: {
                    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            const startTime = Date.now();
            const response = await fetch(profileUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'DNT': '1',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1'
                },
                timeout: 10000
            });
            const endTime = Date.now();

            logger.info('📨 收到Steam个人资料页面响应', {
                requestId,
                steamId,
                status: response.status,
                statusText: response.statusText,
                responseTime: `${endTime - startTime}ms`,
                headers: {
                    contentType: response.headers.get('content-type'),
                    contentLength: response.headers.get('content-length'),
                    server: response.headers.get('server'),
                    setCookie: !!response.headers.get('set-cookie')
                },
                url: response.url,
                redirected: response.redirected
            });




            // 获取响应文本 - 修复
            const htmlContent = await response.text();  // ✅ 修复：使用response.text()

            logger.info('📄 获取到HTML内容', {
                requestId,
                steamId,
                contentLength: htmlContent.length,
                contentPreview: htmlContent.substring(0, 200).replace(/\s+/g, ' '),
                hasActualPersonaName: htmlContent.includes('actual_persona_name'),
                hasPlayerAvatar: htmlContent.includes('playerAvatarAutoSizeInner'),
                hasPrivateProfile: htmlContent.includes('private profile') || htmlContent.includes('This profile is private'),
                hasProfileNotFound: htmlContent.includes('profile could not be found') || htmlContent.includes('404')
            });

            // 使用cheerio解析HTML - 修复
            const $ = cheerio.load(htmlContent);  // ✅ 修复：使用htmlContent
            // 查找昵称
            const nicknameElement = $('.actual_persona_name');
            const nickname = nicknameElement.text().trim();

            logger.info('👤 解析用户昵称', {
                requestId,
                steamId,
                nicknameFound: !!nickname,
                nickname,
                nicknameLength: nickname.length,
                elementExists: nicknameElement.length > 0,
                elementHtml: nicknameElement.html(),
                // 尝试其他可能的选择器
                alternativeSelectors: {
                    personaName: $('.persona_name').text().trim(),
                    profileHeader: $('.profile_header .actual_persona_name').text().trim(),
                    playerName: $('.player_name').text().trim()
                }
            });

            // 查找头像
            const avatarElement = $('.playerAvatarAutoSizeInner img');
            const avatar = avatarElement.attr('src');

            logger.info('🖼️ 解析用户头像', {
                requestId,
                steamId,
                avatarFound: !!avatar,
                avatar,
                elementExists: avatarElement.length > 0,
                elementAttributes: {
                    src: avatarElement.attr('src'),
                    alt: avatarElement.attr('alt'),
                    class: avatarElement.attr('class')
                },
                // 尝试其他可能的选择器
                alternativeSelectors: {
                    avatarImg: $('.profile_avatar img').attr('src'),
                    playerAvatar: $('.player_avatar img').attr('src'),
                    avatarMedium: $('.avatar_medium img').attr('src')
                }
            });

            // 检查是否获取到必要信息
            if (!nickname || !avatar) {
                logger.warn('⚠️ 未能从页面中提取完整信息', {
                    requestId,
                    steamId,
                    hasNickname: !!nickname,
                    hasAvatar: !!avatar,
                    nickname,
                    avatar,
                    // 页面可能的问题
                    possibleIssues: {
                        isPrivateProfile: htmlContent.includes('private') || htmlContent.includes('Private'),
                        isProfileNotFound: htmlContent.includes('404') || htmlContent.includes('not found'),
                        isBlocked: htmlContent.includes('blocked') || htmlContent.includes('unavailable'),
                        pageStructureChanged: !htmlContent.includes('actual_persona_name')
                    }
                });

                // 尝试备用解析方法
                const alternativeNickname = $('.persona_name').text().trim() ||
                    $('.profile_header .actual_persona_name').text().trim() ||
                    $('.player_name').text().trim();

                const alternativeAvatar = $('.profile_avatar img').attr('src') ||
                    $('.player_avatar img').attr('src') ||
                    $('.avatar_medium img').attr('src');

                if (alternativeNickname || alternativeAvatar) {
                    logger.info('🔄 使用备用解析方法', {
                        requestId,
                        steamId,
                        alternativeNickname,
                        alternativeAvatar
                    });
                }

                throw new Error(`未能从页面中提取${!nickname ? '昵称' : ''}${!nickname && !avatar ? '和' : ''}${!avatar ? '头像' : ''}`);
            }

            // 解析Steam页面获取用户信息
            const userInfo = {
                steamId: steamId,
                nickname: nickname,
                avatar: avatar,
            };

            logger.info('✅ Steam用户信息获取成功', {
                requestId,
                steamId,
                userInfo: {
                    steamId: userInfo.steamId,
                    nickname: userInfo.nickname,
                    avatarUrl: userInfo.avatar.substring(0, 50) + '...',
                    nicknameLength: userInfo.nickname.length,
                    avatarDomain: new URL(userInfo.avatar).hostname
                },
                totalTime: `${Date.now() - startTime}ms`
            });

            return userInfo;

        } catch (error) {
            logger.error('💥 获取Steam用户信息失败', {
                requestId,
                steamId,
                error: error.message,
                stack: error.stack,
                errorType: error.name,
                isNetworkError: error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT',
                isTimeoutError: error.name === 'AbortError' || error.message.includes('timeout'),
                isFetchError: error.name === 'TypeError' && error.message.includes('fetch')
            });
            throw new Error('获取Steam用户信息失败: ' + error.message);
        }
    }


    /**
     * 验证API密钥
     * @param {string} apiKey - API密钥
     * @returns {boolean} 验证结果
     */
    validateApiKey(apiKey) {
        const validApiKey = process.env.API_SECRET;
        return apiKey && apiKey === validApiKey;
    }
}

module.exports = SteamService;