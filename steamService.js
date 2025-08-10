const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const cheerio = require('cheerio');


class SteamService {
    constructor(connection) {
        // 初始化代理
        this.proxyAgent = new HttpsProxyAgent('http://127.0.0.1:10808');
        this.conn = connection;
    }

    /**
     * 生成Steam OpenID认证URL
     */
    generateSteamAuthUrl(baseURL, token, redirect, tab) {

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
    async verifySteamOpenId(queryParams) {
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
            const result = await axios.post(
                'https://steamcommunity.com/openid/login',
                body.toString(),
                {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    httpsAgent: this.proxyAgent,
                    timeout: 10000
                }
            );

            return result.data.includes('is_valid:true');
        } catch (error) {
            console.error('Steam OpenID verification error:', error.message);
            return false;
        }
    }


    /**
     * 去验证 该steam是不是已经绑定过了
     */
    async checkSteamIdExists(steamid) {
        const [rows] = await this.conn.query('SELECT steamid FROM user_steam_accounts WHERE steamid = ?', [steamid]);
        return rows[0] || null;
    }



    /**
     * 从claimed_id中提取Steam ID
     */
    extractSteamId(claimedId) {
        if (!claimedId) return null;
        return claimedId.replace('https://steamcommunity.com/openid/id/', '');
    }

    /**
     * 获取Steam用户信息（昵称和头像）
     */
    async getSteamUserInfo(steamId, userAgent) {
        try {
            const response = await axios.get(`https://steamcommunity.com/profiles/${steamId}`, {
                httpsAgent: this.proxyAgent,
                headers: {
                    'User-Agent': userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                },
                timeout: 5000
            });

            const $ = cheerio.load(response.data);
            const nickname = $('.actual_persona_name').text().trim();
            const avatar = $('.playerAvatarAutoSizeInner img').attr('src');

            if (!nickname || !avatar) {
                throw new Error('未能从页面中提取昵称或头像');
            }

            return { nickname, avatar };
        } catch (error) {
            console.error(`获取Steam用户信息失败 (${steamId}):`, error.message);
            throw new Error('获取Steam用户信息失败');
        }
    }

    /**
     * 保存Steam账户信息到数据库
     */
    async saveSteamAccount(userId, steamId, userInfo) {
        try {
            // ✅ 直接插入，让数据库的唯一约束来阻止重复
            await this.conn.query(`
            INSERT INTO user_steam_accounts (user_id, steamid, steam_nickname, avatar)
            VALUES (?, ?, ?, ?)
        `, [userId, steamId, userInfo.nickname, userInfo.avatar]);

            console.log(`✅ Steam账户信息已保存: userId=${userId}, steamId=${steamId}`);
        } catch (error) {
            // ✅ 处理数据库重复键错误
            if (error.code === 'ER_DUP_ENTRY') {
                throw new Error('该用户已经绑定了Steam账户，不能重复绑定');
            }

            console.error('保存Steam账户信息失败:', error);
            throw new Error('保存Steam账户信息失败');
        }
    }

    /**
     * 根据用户ID获取Steam账户信息
     */
    async getSteamAccountByUserId(userId) {
        try {
            const [rows] = await this.conn.query(
                'SELECT * FROM user_steam_accounts WHERE user_id = ?',
                [userId]
            );
            return rows[0] || null;
        } catch (error) {
            console.error('获取Steam账户信息失败:', error);
            throw new Error('获取Steam账户信息失败');
        }
    }

    /**
     * 解绑Steam账户
     */
    async unlinkSteamAccount(userId) {
        try {
            await this.conn.query(
                'DELETE FROM user_steam_accounts WHERE user_id = ?',
                [userId]
            );
            console.log(`✅ Steam账户已解绑: userId=${userId}`);
        } catch (error) {
            console.error('解绑Steam账户失败:', error);
            throw new Error('解绑Steam账户失败');
        }
    }
}

module.exports = SteamService;