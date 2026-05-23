// ULID: Crockford Base32, time-sortable, 26 chars
const CHARS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
let lastTs = 0;
let lastRand = new Uint8Array(10);

function encodeTime(ts, len) {
  let out = '';
  for (let i = len - 1; i >= 0; i--) {
    out = CHARS[ts % 32] + out;
    ts = Math.floor(ts / 32);
  }
  return out;
}

function encodeRand(bytes) {
  let out = '';
  let bits = 0, value = 0;
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += CHARS[(value >> bits) & 0x1f];
    }
  }
  return out.slice(0, 16);
}

export function ulid() {
  const ts = Date.now();
  let rand;
  if (ts === lastTs) {
    // increment last rand to preserve monotonicity within same ms
    rand = new Uint8Array(lastRand);
    for (let i = 9; i >= 0; i--) {
      if (rand[i] < 255) { rand[i]++; break; }
      rand[i] = 0;
    }
  } else {
    rand = new Uint8Array(10);
    crypto.getRandomValues(rand);
  }
  lastTs = ts;
  lastRand = rand;
  return encodeTime(ts, 10) + encodeRand(rand);
}
