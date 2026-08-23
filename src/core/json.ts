type RootContext = {
  type: 'root';
  state: 'value' | 'done';
};

type ObjectContext = {
  type: 'object';
  state: 'key-or-end' | 'key' | 'colon' | 'value' | 'comma-or-end';
  keys: Set<string>;
};

type ArrayContext = {
  type: 'array';
  state: 'value-or-end' | 'value' | 'comma-or-end';
};

type JsonContext = RootContext | ObjectContext | ArrayContext;

/** Parse one JSON value while rejecting duplicate decoded keys in each object scope. */
export function parseJsonWithoutDuplicateMembers(text: string): unknown {
  let index = 0;
  const stack: JsonContext[] = [{ type: 'root', state: 'value' }];
  const malformed = (): never => {
    throw new SyntaxError('invalid JSON');
  };
  const duplicate = (): never => {
    throw new SyntaxError('duplicate JSON object member');
  };
  const whitespace = (): void => {
    while (
      index < text.length &&
      (text[index] === ' ' || text[index] === '\t' || text[index] === '\r' || text[index] === '\n')
    ) {
      index += 1;
    }
  };
  const stringToken = (): string => {
    if (text[index] !== '"') malformed();
    const start = index;
    index += 1;
    while (index < text.length) {
      const unit = text.charCodeAt(index);
      if (unit === 0x22) {
        index += 1;
        try {
          return JSON.parse(text.slice(start, index)) as string;
        } catch {
          malformed();
        }
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
      } else if (escape !== undefined && '"\\/bfnrt'.includes(escape)) {
        index += 1;
      } else {
        malformed();
      }
    }
    return malformed();
  };
  const numberToken = (): void => {
    if (text[index] === '-') index += 1;
    if (text[index] === '0') {
      index += 1;
    } else {
      if (text[index] === undefined || text[index]! < '1' || text[index]! > '9') malformed();
      do {
        index += 1;
      } while (text[index] !== undefined && text[index]! >= '0' && text[index]! <= '9');
    }
    if (text[index] === '.') {
      index += 1;
      if (text[index] === undefined || text[index]! < '0' || text[index]! > '9') malformed();
      do {
        index += 1;
      } while (text[index] !== undefined && text[index]! >= '0' && text[index]! <= '9');
    }
    if (text[index] === 'e' || text[index] === 'E') {
      index += 1;
      if (text[index] === '+' || text[index] === '-') index += 1;
      if (text[index] === undefined || text[index]! < '0' || text[index]! > '9') malformed();
      do {
        index += 1;
      } while (text[index] !== undefined && text[index]! >= '0' && text[index]! <= '9');
    }
  };
  const value = (context: JsonContext): void => {
    const token = text[index];
    if (context.type === 'root') context.state = 'done';
    else context.state = 'comma-or-end';
    if (token === '{') {
      index += 1;
      stack.push({ type: 'object', state: 'key-or-end', keys: new Set<string>() });
    } else if (token === '[') {
      index += 1;
      stack.push({ type: 'array', state: 'value-or-end' });
    } else if (token === '"') {
      stringToken();
    } else if (token === '-' || (token !== undefined && token >= '0' && token <= '9')) {
      numberToken();
    } else if (text.startsWith('true', index)) {
      index += 4;
    } else if (text.startsWith('false', index)) {
      index += 5;
    } else if (text.startsWith('null', index)) {
      index += 4;
    } else {
      malformed();
    }
  };

  while (stack.length > 0) {
    whitespace();
    const context = stack.at(-1)!;
    if (context.type === 'root') {
      if (context.state === 'value') {
        value(context);
      } else {
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
        if (context.keys.has(key)) duplicate();
        context.keys.add(key);
        context.state = 'colon';
      } else if (context.state === 'colon') {
        if (text[index] !== ':') malformed();
        index += 1;
        context.state = 'value';
      } else if (context.state === 'value') {
        value(context);
      } else if (text[index] === ',') {
        index += 1;
        context.state = 'key';
      } else if (text[index] === '}') {
        index += 1;
        stack.pop();
      } else {
        malformed();
      }
    } else if (context.state === 'value-or-end' || context.state === 'value') {
      if (context.state === 'value-or-end' && text[index] === ']') {
        index += 1;
        stack.pop();
      } else {
        value(context);
      }
    } else if (text[index] === ',') {
      index += 1;
      context.state = 'value';
    } else if (text[index] === ']') {
      index += 1;
      stack.pop();
    } else {
      malformed();
    }
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    malformed();
  }
}
