const logger = require('../utils/logger');

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
            openidURL.searchParams.set('openid.realm', process.env.DOMESTIC_SERVER);

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
        try {

            // 构建Steam个人资料URL
            const profileUrl = `${this.steamProfileUrl}${steamId}`;

            // 请求Steam个人资料页面
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

            const $ = cheerio.load(response.data);
            const nickname = $('.actual_persona_name').text().trim();
            const avatar = $('.playerAvatarAutoSizeInner img').attr('src');

            if (!nickname || !avatar) {
                throw new Error('未能从页面中提取昵称或头像');
            }

            // 解析Steam页面获取用户信息
            const userInfo = {
                steamId: steamId,
                nickname: nickname,
                avatar: avatar,
            }

            return userInfo;

        } catch (error) {
            logger.error('获取Steam用户信息失败', { error: error.message, steamId });
            throw new Error('获取Steam用户信息失败');
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