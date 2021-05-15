import { errBadSession, generateRandomNumericString, hexEncode, mkJsonResponse, randomHex32 } from "./util";
import { SessionInfo } from "./session"
import { awsSign } from "./awsApi";

const connectionTtlMs = 600 * 1000; // 10 mins

addEventListener("fetch", (event: FetchEvent) => {
  event.respondWith(handleRequest(event));
});

async function handleRequest(event: FetchEvent): Promise<Response> {
  const url = new URL(event.request.url);
  if(url.pathname == "/control/create_session") {
    return handleSessionCreation(event.request);
  } else if(url.pathname == "/control/put_slide") {
    return handlePutSlide(event.request);
  } else if(url.pathname == "/control/renew_session") {
    const payload: unknown = await event.request.json();
    const sessionProps = await loadSession(payload);
    if(!sessionProps) return errBadSession();

    const [code, session] = sessionProps;
    const infoS = JSON.stringify(session);

    // Atomically update TTL.
    const updated = await kv.sessions.cmpUpdate(
      [[code, infoS]],
      [[code, infoS]],
      {
        ttlMs: connectionTtlMs,
      }
    );
    if(!updated) return errBadSession();
    return mkJsonResponse(200, {});
  } else {
    return mkJsonResponse(404, {"error": "not found"});
  }
}

async function handlePutSlide(request: Request): Promise<Response> {
  const payload: unknown = await request.json();
  const slideIndex = (payload as any).slideIndex;
  if(typeof slideIndex !== "number" || slideIndex < 0 || !Number.isSafeInteger(slideIndex)) {
    return mkJsonResponse(400, {"error": "bad index"});
  }
  const sessionProps = await loadSession(payload);
  if(!sessionProps) return errBadSession();
  const [code, session] = sessionProps;
  const tokenHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(session.token));
  const tokenHashS = hexEncode(new Uint8Array(tokenHash));

  const opts: {
    host: string,
    path: string,
    method: string,
    service: string,
    signQuery: boolean,
    region: string,
    headers?: Record<string, string>,
  } = {
    host: S3_DOMAIN,
    path: `/slides/${tokenHashS}/${slideIndex}.png`,
    method: "PUT",
    service: "s3",
    headers: {
      "Content-Type": "image/png",
    },
    region: S3_REGION,
    signQuery: true,
  };
  awsSign(opts);
  return mkJsonResponse(200, {
    uploadUrl: `https://${opts.host}${opts.path}`,
  });
}

async function handleSessionCreation(request: Request): Promise<Response> {
  const info: SessionInfo = {
    token: randomHex32(),
  }

  let connectionCode = "";
  let sessionAllocOk = false;

  // Retry until we got a session
  for(let i = 0; i < 3; i++) {
    // Atomically insert
    connectionCode = generateRandomNumericString(8);
    await kv.sessions.put(connectionCode, JSON.stringify(info), {
      ttlMs: connectionTtlMs,
      ifNotExists: true,
    });

    // If succeeded...
    const entry: SessionInfo = JSON.parse(await kv.sessions.get(connectionCode) || "");
    if(entry.token === info.token) {
      sessionAllocOk = true;
      break;
    }
  }

  if(!sessionAllocOk) {
    return mkJsonResponse(500, {"error": "session allocation failed - try again."});
  }
  return mkJsonResponse(200, {
    code: connectionCode,
    token: info.token,
  });
}

async function loadSession(form: unknown): Promise<[string, SessionInfo] | null> {
  const code = "" + (form as any).code;
  const token = "" + (form as any).token;

  const sessionRaw = await kv.sessions.get(code);
  if(!sessionRaw) {
    return null;
  }

  const session: SessionInfo = JSON.parse(sessionRaw);
  if(session.token !== token) {
    return null;
  }

  return [code, session];
}