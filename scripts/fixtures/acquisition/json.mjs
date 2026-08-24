import { LIMITS } from './constants.mjs';
import { fail } from './errors.mjs';

const decoder = new TextDecoder('utf-8', { fatal: true });

function wellFormed(value) {
  if (typeof value.isWellFormed === 'function') return value.isWellFormed();
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}

function validateScalarString(value, failureCode) {
  if (!wellFormed(value)) fail(failureCode);
}

function scanWithoutDuplicateMembers(text, failureCode) {
  let index = 0;
  let totalMembers = 0;
  const stack = [{ type: 'root', state: 'value', items: 0 }];
  const malformed = () => fail(failureCode);
  const whitespace = () => {
    while (index < text.length && /[\u0009\u000a\u000d\u0020]/u.test(text[index])) index += 1;
  };
  const stringToken = () => {
    if (text[index] !== '"') malformed();
    const start = index;
    index += 1;
    while (index < text.length) {
      const unit = text.charCodeAt(index);
      if (unit === 0x22) {
        index += 1;
        let decoded;
        try { decoded = JSON.parse(text.slice(start, index)); } catch { malformed(); }
        validateScalarString(decoded, failureCode);
        return decoded;
      }
      if (unit <= 0x1f) malformed();
      if (unit !== 0x5c) {
        index += 1;
        continue;
      }
      index += 1;
      if (index >= text.length) malformed();
      const escape = text[index];
      if (escape === 'u') {
        if (!/^[0-9a-fA-F]{4}$/u.test(text.slice(index + 1, index + 5))) malformed();
        index += 5;
      } else if ('"\\/bfnrt'.includes(escape)) index += 1;
      else malformed();
    }
    malformed();
  };
  const numberToken = () => {
    if (text[index] === '-') index += 1;
    if (text[index] === '0') index += 1;
    else {
      if (text[index] === undefined || text[index] < '1' || text[index] > '9') malformed();
      do { index += 1; } while (text[index] !== undefined && text[index] >= '0' && text[index] <= '9');
    }
    if (text[index] === '.') {
      index += 1;
      if (text[index] === undefined || text[index] < '0' || text[index] > '9') malformed();
      do { index += 1; } while (text[index] !== undefined && text[index] >= '0' && text[index] <= '9');
    }
    if (text[index] === 'e' || text[index] === 'E') {
      index += 1;
      if (text[index] === '+' || text[index] === '-') index += 1;
      if (text[index] === undefined || text[index] < '0' || text[index] > '9') malformed();
      do { index += 1; } while (text[index] !== undefined && text[index] >= '0' && text[index] <= '9');
    }
  };
  const push = (context) => {
    if (stack.length > LIMITS.jsonDepth) malformed();
    stack.push(context);
  };
  const noteArrayValue = (context) => {
    if (context.type !== 'array') return;
    context.items += 1;
    if (context.items > LIMITS.jsonArrayItems) malformed();
  };
  const value = (context) => {
    noteArrayValue(context);
    const token = text[index];
    context.state = context.type === 'root' ? 'done' : 'comma-or-end';
    if (token === '{') {
      index += 1;
      push({ type: 'object', state: 'key-or-end', keys: new Set(), items: 0 });
    } else if (token === '[') {
      index += 1;
      push({ type: 'array', state: 'value-or-end', items: 0 });
    } else if (token === '"') stringToken();
    else if (token === '-' || (token !== undefined && token >= '0' && token <= '9')) numberToken();
    else if (text.startsWith('true', index)) index += 4;
    else if (text.startsWith('false', index)) index += 5;
    else if (text.startsWith('null', index)) index += 4;
    else malformed();
  };

  while (stack.length > 0) {
    whitespace();
    const context = stack.at(-1);
    if (context.type === 'root') {
      if (context.state === 'value') value(context);
      else {
        if (index !== text.length) malformed();
        stack.pop();
      }
    } else if (context.type === 'object') {
      if (context.state === 'key-or-end' || context.state === 'key') {
        if (context.state === 'key-or-end' && text[index] === '}') {
          index += 1;
          stack.pop();
          continue;
        }
        const key = stringToken();
        if (context.keys.has(key)) malformed();
        context.keys.add(key);
        totalMembers += 1;
        if (totalMembers > LIMITS.jsonMembers) malformed();
        context.state = 'colon';
      } else if (context.state === 'colon') {
        if (text[index] !== ':') malformed();
        index += 1;
        context.state = 'value';
      } else if (context.state === 'value') value(context);
      else if (text[index] === ',') {
        index += 1;
        context.state = 'key';
      } else if (text[index] === '}') {
        index += 1;
        stack.pop();
      } else malformed();
    } else if (context.state === 'value-or-end' || context.state === 'value') {
      if (context.state === 'value-or-end' && text[index] === ']') {
        index += 1;
        stack.pop();
      } else value(context);
    } else if (text[index] === ',') {
      index += 1;
      context.state = 'value';
    } else if (text[index] === ']') {
      index += 1;
      stack.pop();
    } else malformed();
  }
}

function validateNumbers(value, failureCode) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) fail(failureCode);
  } else if (Array.isArray(value)) value.forEach((entry) => validateNumbers(entry, failureCode));
  else if (value !== null && typeof value === 'object') {
    Object.values(value).forEach((entry) => validateNumbers(entry, failureCode));
  }
}

export function parseBoundedJsonBytes(bytes, maximumBytes, failureCode = 'E_SCHEMA') {
  if (failureCode !== 'E_SCHEMA' && failureCode !== 'E_RECEIPT_SCHEMA') {
    throw new TypeError('unsupported bounded JSON failure code');
  }
  if (
    !(bytes instanceof Uint8Array) ||
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes < 0 ||
    bytes.byteLength > maximumBytes
  ) fail(failureCode);
  let text;
  try { text = decoder.decode(bytes); } catch { fail(failureCode); }
  scanWithoutDuplicateMembers(text, failureCode);
  let value;
  try { value = JSON.parse(text); } catch { fail(failureCode); }
  validateNumbers(value, failureCode);
  return value;
}

export function encodeBoundedJson(value, maximumBytes) {
  let bytes;
  try { bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8'); } catch { fail('E_RECEIPT_SCHEMA'); }
  if (bytes.byteLength > maximumBytes) fail('E_RECEIPT_SCHEMA');
  return bytes;
}
