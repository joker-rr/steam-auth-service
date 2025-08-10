/*
 * @Description:
 * @author: 刘港
 * @Date: 2025-05-27 13:52:10
 * @LastEditors: 刘港
 * @LastEditTime: 2025-05-28 17:20:24
 */
// 🔥 直接禁用所有日志
// console.log = () => { }    // 禁用所有console.log
// console.warn = () => { }   // 禁用所有console.warn
// console.error 保留，用于错误调试


// require('dotenv').config();
const path = require('path');
require('dotenv').config({
  path: path.join(__dirname, '.env')
});

const express = require("express");
const Redis = require('ioredis');

const conn = require("./db");
const app = express();
const port = process.env.PORT;
const wrapResponse = require("./api/request.js");
const { productSql } = require("./api/sql.js");
const productApi = require("./api/api.js");
const cors = require('cors');

// ===========================================
// 🎯 新增：导入翻译服务
// ===========================================
const translationService = require('./services/HybridTranslationService.js');


console.log('🔧 FRONTEND_URL:', process.env.FRONTEND_URL)

app.use(cors({
  origin: process.env.FRONTEND_URL,
  methods: ['GET', 'POST', 'OPTIONS', 'DELETE', 'PUT'],
  allowedHeaders: ['Content-Type', 'Authorization', 'encryptedapikey'],
  credentials: true // ✅ 允许带 cookie
}));

// 必须添加的中间件
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true })); // 解析x-www-form-urlencoded

// 查询饰品列表接口
app.post(productApi.getList, async (req, res) => {
  const { start, pageSize, filters } = req.body; // 直接解构获取参数
  try {
    const { sql, params } = productSql.query_cs2_all_prices(start, pageSize, filters);
    const [rows] = await conn.query(sql, params); // ✅
    const [count] = await conn.query(productSql.count_cs2_all_prices())

    // 🎯 新增：为查询结果添加中文翻译（可选）
    const rowsWithTranslation = await Promise.all(
      rows.map(async (row) => {
        if (row.market_hash_name) {
          row.market_hash_name_zh = await translationService.getCNName(row.market_hash_name);
        }
        return row;
      })
    );

    const result = {
      list: rowsWithTranslation, // 使用带翻译的数据
      total: count[0].count,
    };
    res.json(wrapResponse(result));
  } catch (err) {
    res.status(500).json({ error: "查询失败" });
  }
});

// Redis 初始化
const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD
});

////////////////////////////////////
const createAuthRoutes = require('./routes/auth');
const createSteamRoutes = require('./routes/Steam.js');
const createPlantFormApiRoutes = require('./routes/plantFormApi');
const createplantFormRoutes = require('./routes/plantFormRoutes');
const createPlantFormSellHistoryRoutes = require('./routes/plantFormSellHistoryRoutes')
// 使用路由
app.use('/api/auth', createAuthRoutes(conn, redis));
app.use('/api/steam', createSteamRoutes(conn, redis));


app.use('/api/plantFormApi', createPlantFormApiRoutes(conn));

app.use('/api/sellHistory', createPlantFormSellHistoryRoutes(conn));
app.use('/api/panltForm', createplantFormRoutes(conn));


app.use('/api/steamItems', require('./routes/steamItemRoute'));


// 🎯 新增：获取翻译统计信息
app.get('/api/translation-stats', (req, res) => {
  res.json(translationService.getStats());
});


app.use('/', require('./routes/saveTasks.js'));


// ===========================================
// 🎯 关键：初始化翻译服务的函数
// ===========================================
async function initTranslationService() {
  try {
    console.log('🔄 初始化翻译服务...');

    // 调用翻译服务的 init 方法，传入数据库连接
    await translationService.init(conn);

    console.log('✅ 翻译服务初始化完成');

    // 打印统计信息
    const stats = translationService.getStats();
    console.log(`📊 翻译缓存: ${stats.cacheSize} 条记录已加载`);

    return true;
  } catch (error) {
    console.error('❌ 翻译服务初始化失败:', error);
    throw error;
  }
}

// 如果你有现有的 initItemCNMap 函数，可以选择：
// 方案1：完全替换它
// 方案2：或者保留原有的，同时调用新的翻译服务




app.get('/api/steam/callback', async (req, res) => {
  try {
    const { token, steamId, success, redirect, tab } = req.query;

    console.log('📥 接收海外认证结果:', {
      token: token ? token.substring(0, 10) + '...' : 'missing',
      steamId,
      success,
      redirect,
      tab
    });

    if (success && steamId) {
      // 🎉 认证成功处理
      console.log('✅ Steam认证成功:', steamId);

      // TODO: 这里添加你的业务逻辑
      // 1. 验证token
      // 2. 获取Steam用户信息
      // 3. 保存到数据库
      // 4. 更新用户会话

      // 暂时直接重定向到成功页面
      const redirectUrl = redirect || '/dashboard';
      const finalUrl = `${redirectUrl}?steamBound=1&tab=${tab || 'preferences'}`;

      console.log('🔄 跳转到成功页面:', finalUrl);
      res.redirect(finalUrl);

    } else {
      // ❌ 认证失败处理
      console.log('❌ Steam认证失败');

      const redirectUrl = redirect || '/dashboard';
      const errorMsg = encodeURIComponent('Steam认证失败，请重试');
      const finalUrl = `${redirectUrl}?error=${errorMsg}&tab=${tab || 'preferences'}`;

      console.log('🔄 跳转到错误页面:', finalUrl);
      res.redirect(finalUrl);
    }

  } catch (error) {
    console.error('💥 Steam回调处理错误:', error);

    const redirectUrl = req.query.redirect || '/dashboard';
    const errorMsg = encodeURIComponent('系统错误，请重试');
    const finalUrl = `${redirectUrl}?error=${errorMsg}`;

    res.redirect(finalUrl);
  }
});


// ===========================================
// 🚀 启动服务器 - 修改这里
// ===========================================
app.listen(port, async () => {
  try {
    // 🎯 关键：替换或补充你原来的 initItemCNMap()
    // await initItemCNMap(); // 如果你想保留原来的函数，取消注释

    // 🎯 新增：初始化翻译服务
    await initTranslationService();

    console.log(`🚀 后端API服务启动在 http://localhost:${port}`);

  } catch (error) {
    console.error('💥 应用启动失败:', error);
    process.exit(1);
  }
});

