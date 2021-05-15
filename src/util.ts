// https://stackoverflow.com/questions/40031688/javascript-arraybuffer-to-hex
export function hexEncode(view: Uint8Array): string {
  return [...view].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomHex32(): string {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return hexEncode(buf);
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

const ext2mime: Record<string, string> = {
  "css": "text/css",
  "html": "text/html",
  "js": "text/javascript",
}

export function handleStaticFile(url: URL) {
  let filePath: string;
  if(url.pathname.endsWith("/")) {
    filePath = url.pathname + "index.html";
  } else {
    filePath = url.pathname;
  }
  filePath = "./fe" + filePath;
  let file = getFileFromBundle(filePath);
  if(file === null) {
    return new Response("not found: " + filePath, {
      status: 404,
    });
  } else {
    const fileParts = filePath.split(".");
    const fileExt = fileParts[fileParts.length - 1];
    let contentType = ext2mime[fileExt] || "application/octet-stream";
    return new Response(file, {
      headers: {
        "Content-Type": contentType,
      }
    });
  }
}