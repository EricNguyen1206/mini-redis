/**
 * Redis Serialization Protocol (RESP) Implementation
 * 
 * This module provides utilities for parsing and formatting RESP messages
 * to ensure compatibility with standard Redis clients.
 * 
 * RESP Types:
 * - Simple Strings: +OK\r\n
 * - Errors: -Error message\r\n
 * - Integers: :1000\r\n
 * - Bulk Strings: $6\r\nfoobar\r\n
 * - Arrays: *2\r\n$3\r\nfoo\r\n$3\r\nbar\r\n
 * - Null: $-1\r\n
 */

class RESPFormatter {
  /**
   * Format a simple string response
   * @param {string} str - The string to format
   * @returns {string} RESP formatted simple string
   */
  static simpleString(str) {
    return `+${str}\r\n`;
  }

  /**
   * Format an error response
   * @param {string} message - The error message
   * @returns {string} RESP formatted error
   */
  static error(message) {
    return `-${message}\r\n`;
  }

  /**
   * Format an integer response
   * @param {number} num - The integer to format
   * @returns {string} RESP formatted integer
   */
  static integer(num) {
    return `:${num}\r\n`;
  }

  /**
   * Format a bulk string response
   * @param {string|null} str - The string to format, or null for null response
   * @returns {string} RESP formatted bulk string
   */
  static bulkString(str) {
    if (str === null || str === undefined) {
      return "$-1\r\n"; // Null bulk string
    }
    const strValue = String(str);
    const length = Buffer.byteLength(strValue, 'utf8');
    return `$${length}\r\n${strValue}\r\n`;
  }

  /**
   * Format an array response
   * @param {Array} arr - The array to format
   * @returns {string} RESP formatted array
   */
  static array(arr) {
    if (arr === null || arr === undefined) {
      return "*-1\r\n"; // Null array
    }
    let result = `*${arr.length}\r\n`;
    for (const item of arr) {
      if (typeof item === 'string') {
        result += this.bulkString(item);
      } else if (typeof item === 'number') {
        result += this.integer(item);
      } else if (item === null) {
        result += this.bulkString(null);
      } else {
        result += this.bulkString(String(item));
      }
    }
    return result;
  }

  /**
   * Format a response based on its type
   * @param {any} value - The value to format
   * @param {string} type - The response type ('simple', 'error', 'integer', 'bulk', 'array')
   * @returns {string} RESP formatted response
   */
  static format(value, type = 'bulk') {
    switch (type) {
      case 'simple':
        return this.simpleString(value);
      case 'error':
        return this.error(value);
      case 'integer':
        return this.integer(value);
      case 'bulk':
        return this.bulkString(value);
      case 'array':
        return this.array(value);
      default:
        return this.bulkString(value);
    }
  }
}

class RESPParser {
  constructor() {
    this.buffer = '';
  }

  /**
   * Add data to the parser buffer
   * @param {string} data - Data to add
   */
  feed(data) {
    this.buffer += data;
  }

  /**
   * Parse complete RESP messages from the buffer
   * @returns {Array} Array of parsed commands
   */
  parse() {
    const commands = [];
    
    while (this.buffer.length > 0) {
      const result = this._parseNext();
      if (result === null) {
        break; // Need more data
      }
      commands.push(result);
    }
    
    return commands;
  }

  /**
   * Parse the next complete message from the buffer
   * @returns {Array|null} Parsed command array or null if incomplete
   */
  _parseNext() {
    if (this.buffer.length === 0) return null;

    const firstChar = this.buffer[0];
    
    switch (firstChar) {
      case '*': // Array
        return this._parseArray();
      case '$': // Bulk string
        return this._parseBulkString();
      case '+': // Simple string
        return this._parseSimpleString();
      case '-': // Error
        return this._parseError();
      case ':': // Integer
        return this._parseInteger();
      default:
        // Fallback: treat as inline command (space-separated)
        return this._parseInlineCommand();
    }
  }

  _parseArray() {
    const crlfIndex = this.buffer.indexOf('\r\n');
    if (crlfIndex === -1) return null;

    const lengthStr = this.buffer.slice(1, crlfIndex);
    const length = parseInt(lengthStr, 10);
    
    if (isNaN(length)) {
      this.buffer = this.buffer.slice(crlfIndex + 2);
      return [];
    }

    if (length === -1) {
      this.buffer = this.buffer.slice(crlfIndex + 2);
      return null; // Null array
    }

    this.buffer = this.buffer.slice(crlfIndex + 2);
    const elements = [];

    for (let i = 0; i < length; i++) {
      const element = this._parseNext();
      if (element === null) return null; // Need more data
      elements.push(element);
    }

    return elements.flat(); // Flatten for command arrays
  }

  _parseBulkString() {
    const crlfIndex = this.buffer.indexOf('\r\n');
    if (crlfIndex === -1) return null;

    const lengthStr = this.buffer.slice(1, crlfIndex);
    const length = parseInt(lengthStr, 10);

    if (isNaN(length)) {
      this.buffer = this.buffer.slice(crlfIndex + 2);
      return '';
    }

    if (length === -1) {
      this.buffer = this.buffer.slice(crlfIndex + 2);
      return null; // Null bulk string
    }

    const dataStart = crlfIndex + 2;
    const dataEnd = dataStart + length;
    
    if (this.buffer.length < dataEnd + 2) return null; // Need more data

    const data = this.buffer.slice(dataStart, dataEnd);
    this.buffer = this.buffer.slice(dataEnd + 2); // Skip \r\n after data
    
    return data;
  }

  _parseSimpleString() {
    const crlfIndex = this.buffer.indexOf('\r\n');
    if (crlfIndex === -1) return null;

    const data = this.buffer.slice(1, crlfIndex);
    this.buffer = this.buffer.slice(crlfIndex + 2);
    return data;
  }

  _parseError() {
    const crlfIndex = this.buffer.indexOf('\r\n');
    if (crlfIndex === -1) return null;

    const data = this.buffer.slice(1, crlfIndex);
    this.buffer = this.buffer.slice(crlfIndex + 2);
    return new Error(data);
  }

  _parseInteger() {
    const crlfIndex = this.buffer.indexOf('\r\n');
    if (crlfIndex === -1) return null;

    const data = this.buffer.slice(1, crlfIndex);
    this.buffer = this.buffer.slice(crlfIndex + 2);
    return parseInt(data, 10);
  }

  _parseInlineCommand() {
    const crlfIndex = this.buffer.indexOf('\r\n');
    if (crlfIndex === -1) {
      const lfIndex = this.buffer.indexOf('\n');
      if (lfIndex === -1) return null;
      
      const line = this.buffer.slice(0, lfIndex).trim();
      this.buffer = this.buffer.slice(lfIndex + 1);
      return line.split(/\s+/).filter(part => part.length > 0);
    }

    const line = this.buffer.slice(0, crlfIndex).trim();
    this.buffer = this.buffer.slice(crlfIndex + 2);
    return line.split(/\s+/).filter(part => part.length > 0);
  }
}

module.exports = { RESPFormatter, RESPParser };
