/**
 * API响应格式化工具
 */
class ApiResponse {
    /**
     * 成功响应
     * @param {*} data - 响应数据
     * @param {string} message - 响应消息
     * @param {Object} meta - 元数据
     * @returns {Object} 格式化的响应对象
     */
    static success(data = null, message = 'Success', meta = {}) {
        return {
            success: true,
            message,
            data,
            meta: {
                timestamp: new Date().toISOString(),
                ...meta
            }
        };
    }

    /**
     * 错误响应
     * @param {string} code - 错误代码
     * @param {string} message - 错误消息
     * @param {Object} details - 错误详情
     * @returns {Object} 格式化的错误响应对象
     */
    static error(code = 'UNKNOWN_ERROR', message = 'An error occurred', details = {}) {
        return {
            success: false,
            error: {
                code,
                message,
                details,
                timestamp: new Date().toISOString()
            }
        };
    }

    /**
     * 分页响应
     * @param {Array} data - 数据数组
     * @param {Object} pagination - 分页信息
     * @param {string} message - 响应消息
     * @returns {Object} 格式化的分页响应对象
     */
    static paginated(data = [], pagination = {}, message = 'Success') {
        const defaultPagination = {
            page: 1,
            limit: 10,
            total: 0,
            totalPages: 0
        };

        return {
            success: true,
            message,
            data,
            pagination: { ...defaultPagination, ...pagination },
            meta: {
                timestamp: new Date().toISOString()
            }
        };
    }

    /**
     * 验证错误响应
     * @param {Array|Object} errors - 验证错误
     * @returns {Object} 格式化的验证错误响应对象
     */
    static validationError(errors) {
        return {
            success: false,
            error: {
                code: 'VALIDATION_ERROR',
                message: 'Validation failed',
                details: errors,
                timestamp: new Date().toISOString()
            }
        };
    }

    /**
     * 健康检查响应
     * @param {string} status - 健康状态
     * @param {Object} checks - 各项检查结果
     * @param {Object} info - 额外信息
     * @returns {Object} 健康检查响应
     */
    static health(status = 'healthy', checks = {}, info = {}) {
        return {
            status,
            service: 'Steam Auth Service',
            version: '1.0.0',
            environment: process.env.NODE_ENV || 'development',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            checks,
            ...info
        };
    }
}

module.exports = { ApiResponse };