// 简化版日志工具，兼容Winston接口
class Logger {
    constructor() {
        // 先定义levels，再调用方法
        this.levels = { error: 0, warn: 1, info: 2, debug: 3 };
        this.logLevel = this._getLogLevel();
    }

    _getLogLevel() {
        const level = process.env.LOG_LEVEL || 'info';
        return this.levels[level] !== undefined ? level : 'info';
    }

    _shouldLog(level) {
        return this.levels[level] <= this.levels[this.logLevel];
    }

    _formatMessage(level, message, meta = {}) {
        const timestamp = new Date().toISOString();
        const levelStr = level.toUpperCase().padEnd(5);

        let logMessage = `${timestamp} [${levelStr}] ${message}`;

        if (Object.keys(meta).length > 0) {
            logMessage += ` ${JSON.stringify(meta)}`;
        }

        return logMessage;
    }

    _log(level, message, meta = {}) {
        if (!this._shouldLog(level)) return;

        const formattedMessage = this._formatMessage(level, message, meta);

        // 根据级别选择输出方式
        if (level === 'error') {
            console.error(formattedMessage);
        } else if (level === 'warn') {
            console.warn(formattedMessage);
        } else {
            console.log(formattedMessage);
        }

        // 在生产环境可以添加文件写入逻辑
        if (process.env.NODE_ENV === 'production') {
            this._writeToFile(level, formattedMessage);
        }
    }

    _writeToFile(level, message) {
        // TODO: 实现文件写入逻辑
        // 可以使用 fs.appendFileSync 或者其他文件写入方法
        // 这里暂时跳过，保持简单
    }

    error(message, meta = {}) {
        this._log('error', message, meta);
    }

    warn(message, meta = {}) {
        this._log('warn', message, meta);
    }

    info(message, meta = {}) {
        this._log('info', message, meta);
    }

    debug(message, meta = {}) {
        this._log('debug', message, meta);
    }
}

// 创建全局logger实例
const logger = new Logger();

module.exports = logger;