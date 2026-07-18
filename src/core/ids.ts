// ID体系 (docs/02 §3)
// - エンティティID: <prefix>_<ULID>。時刻順ソート可能・自己発行・衝突確率は実用上ゼロ
// - actorId: userId×deviceId から導出し、op-logのファイル名と書き手識別に使う

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford Base32

export function ulid(now: number = Date.now()): string {
  let t = now;
  const time = new Array<string>(10);
  for (let i = 9; i >= 0; i--) {
    time[i] = B32[t % 32]!;
    t = Math.floor(t / 32);
  }
  const rand = new Uint8Array(10); // 80 bits
  crypto.getRandomValues(rand);
  let out = time.join('');
  let acc = 0;
  let bits = 0;
  for (const byte of rand) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(acc >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out; // 26 chars
}

export const ID_PREFIXES = ['prj', 'usr', 'dev', 'set', 'cap', 'view', 'mat', 'ast'] as const;
export type IdPrefix = (typeof ID_PREFIXES)[number];

export function newId(prefix: IdPrefix, now?: number): string {
  return `${prefix}_${ulid(now)}`;
}

/** userId×deviceId → actorId（決定的。同一ユーザー同一端末なら常に同じ値になる） */
export function actorIdFrom(userId: string, deviceId: string): string {
  // FNV-1a 64bit（暗号用途ではなく識別子の短縮のみ）
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const s = `${userId}:${deviceId}`;
  for (let i = 0; i < s.length; i++) {
    h ^= BigInt(s.charCodeAt(i));
    h = (h * prime) & 0xffffffffffffffffn;
  }
  let out = '';
  for (let i = 0; i < 13; i++) {
    out = B32[Number(h & 31n)] + out;
    h >>= 5n;
  }
  return `a_${out}`;
}
