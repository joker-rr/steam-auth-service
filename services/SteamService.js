const logger = require('../utils/logger');
const cheerio = require('cheerio');


class SteamService {
    constructor() {
        this.steamOpenIdUrl = 'https://steamcommunity.com/openid/login';
        this.steamProfileUrl = 'https://steamcommunity.com/profiles/';
        this.steamApiUrl = 'https://api.steampowered.com';
        this.STEAM_API_KEY = process.env.STEAM_API_KEY;
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

        // 检查必要参数
        if (!queryParams['openid.claimed_id']) {

            throw new Error('Missing claimed_id');
        }

        // 构建验证请求体
        const body = new URLSearchParams();
        for (const key in queryParams) {
            if (key.startsWith('openid.')) {
                body.set(key, queryParams[key]);
            }
        }
        body.set('openid.mode', 'check_authentication');

        try {
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
            console.error('Steam OpenID验证异常', { error: error.message });
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

    async getUserInfo(steamId, userAgent) {

        try {
            // 构建Steam个人资料URL
            const profileUrl = `${this.steamProfileUrl}${steamId}`;

            const response = await fetch(profileUrl, {
                headers: {
                    'User-Agent': userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'DNT': '1',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1'
                },
                timeout: 10000
            });

            console.log('✅ 有回应', response);

            // 获取响应文本 - 修复
            const htmlContent = await response.text();  // ✅ 修复：使用response.text()

            console.log('✅ 有回应 文本', htmlContent);

            // 使用cheerio解析HTML - 修复
            const $ = cheerio.load(htmlContent);  // ✅ 修复：使用htmlContent

            console.log('✅ ￥￥￥￥￥￥$$$$$$$$$', $);
            // 查找昵称
            const nicknameElement = $('.actual_persona_name');
            const nickname = nicknameElement.text().trim();

            // 查找头像
            const avatarElement = $('.playerAvatarAutoSizeInner img');
            const avatar = avatarElement.attr('src');

            // 检查是否获取到必要信息
            if (!nickname || !avatar) {

                throw new Error(`未能从页面中提取${!nickname ? '昵称' : ''}${!nickname && !avatar ? '和' : ''}${!avatar ? '头像' : ''}`);
            }

            return { nickname, avatar };

        } catch (error) {
            throw new Error('获取Steam用户信息失败: ' + error.message);
        }
    }



    /**
     * 获取SteamItem信息
     * @param {string} classid - classid
     * @param {string} instanceid - instanceid
     * @returns {Promise<Object>} item信息
     */
    async fetchItemFromSteamAPI(classid, instanceid) {
        const url = 'https://api.steampowered.com/ISteamEconomy/GetAssetClassInfo/v1/';

        // 构建URL参数
        const params = new URLSearchParams({
            key: this.STEAM_API_KEY,
            appid: 730,
            class_count: 1,
            [`classid0`]: classid,
            [`instanceid0`]: instanceid
        });

        const fullUrl = `${url}?${params.toString()}`;

        try {
            const response = await fetch(fullUrl, {
                method: 'GET',
                headers: {
                    'User-Agent': 'SteamAPI/1.0',
                    'Accept': 'application/json',
                },
                timeout: 10000
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            const key = instanceid === "0" || instanceid === 0
                ? `${classid}`
                : `${classid}_${instanceid}`;

            const item = data?.result?.[key];

            if (!item) {
                throw new Error('未找到该物品');
            }

            return item;

        } catch (error) {
            console.error('Steam API 调用失败：', error.message);
            throw error;
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