// services/logger.js

/**
 * A simple logger service to standardize console output.
 */
const Logger = {
  // Log levels
  LEVELS: {
    DEBUG: 'DEBUG',
    INFO: 'INFO',
    WARN: 'WARN',
    ERROR: 'ERROR',
  },

  // Current log level
  currentLevel: 'INFO', // Default level

  /**
   * Set the current log level.
   * @param {string} level - The log level to set (DEBUG, INFO, WARN, ERROR).
   */
  setLevel(level) {
    if (Object.values(this.LEVELS).includes(level)) {
      this.currentLevel = level;
    }
  },

  /**
   * Internal log function.
   * @param {string} level - The log level.
   * @param {string} message - The message to log.
   * @param {...any} args - Additional arguments to log.
   */
  _log(level, message, ...args) {
    const levelIndex = Object.keys(this.LEVELS).indexOf(this.currentLevel);
    const messageLevelIndex = Object.keys(this.LEVELS).indexOf(level);

    if (messageLevelIndex >= levelIndex) {
      const timestamp = new Date().toISOString();
      let logFunction;
      let style = '';

      switch (level) {
        case this.LEVELS.ERROR:
          logFunction = console.error;
          style = 'color: red; font-weight: bold;';
          break;
        case this.LEVELS.WARN:
          logFunction = console.warn;
          style = 'color: orange;';
          break;
        case this.LEVELS.DEBUG:
          logFunction = console.debug;
          style = 'color: gray;';
          break;
        case this.LEVELS.INFO:
        default:
          logFunction = console.info;
          style = 'color: blue;';
          break;
      }
      
      logFunction(`%c[${timestamp}] [${level}]`, style, message, ...args);
    }
  },

  /**
   * Log a debug message.
   * @param {string} message - The message to log.
   * @param {...any} args - Additional arguments to log.
   */
  debug(message, ...args) {
    this._log(this.LEVELS.DEBUG, message, ...args);
  },

  /**
   * Log an info message.
   * @param {string} message - The message to log.
   * @param {...any} args - Additional arguments to log.
   */
  info(message, ...args) {
    this._log(this.LEVELS.INFO, message, ...args);
  },

  /**
   * Log a warning message.
   * @param {string} message - The message to log.
   * @param {...any} args - Additional arguments to log.
   */
  warn(message, ...args) {
    this._log(this.LEVELS.WARN, message, ...args);
  },

  /**
   * Log an error message.
   * @param {string} message - The message to log.
   * @param {...any} args - Additional arguments to log.
   */
  error(message, ...args) {
    this._log(this.LEVELS.ERROR, message, ...args);
  },

  /**
   * Start a collapsed log group.
   * @param {string} label - The label for the group.
   */
  group(label) {
    const levelIndex = Object.keys(this.LEVELS).indexOf(this.currentLevel);
    if (levelIndex <= 1) { // Only group for INFO and DEBUG levels
        console.groupCollapsed(`%c[${new Date().toISOString()}] [GROUP] ${label}`, 'color: green; font-weight: bold;');
    }
  },

  /**
   * End the current log group.
   */
  groupEnd() {
    const levelIndex = Object.keys(this.LEVELS).indexOf(this.currentLevel);
     if (levelIndex <= 1) {
        console.groupEnd();
    }
  },
};

export { Logger };
