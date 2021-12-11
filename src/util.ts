export function randomHex32(): string {
  return Codec.hexencode(crypto.getRandomValues(new Uint8Array(16)));
}

function randUint64(): bigint {
  const buf = new BigUint64Array(1);
  crypto.getRandomValues(new Uint8Array(buf.buffer));
  return buf[0];
}

export function generateRandomNumericString(len: number): string {
  let s = "";
  const candidates = "0123456789";
  for(let i = 0; i < len; i++) {
    const index = Number(randUint64() % BigInt(candidates.length));
    s += candidates[index];
  }
  return s;
}

export function mkJsonResponse(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' },
      status: status,
  });
}

export function errBadSession(): Response {
  return mkJsonResponse(401, {"error": "bad session credentials"});
}

export function sleepMs(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
