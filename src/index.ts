import { errBadSession, generateRandomNumericString, handleStaticFile, hexEncode, mkJsonResponse, randomHex32, sleepMs } from "./util";
import { PresentationState, SessionInfo } from "./session"
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
  } else if(url.pathname == "/control/update_state") {
    return handleUpdateState(event.request);
  } else if(url.pathname == "/control/poll_state") {
    return handlePollState(event.request);
  } else if(url.pathname == "/control/load_slide") {
    return handleLoadSlide(event.request);
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
  } else if(url.pathname == "/") {
    return new Response("redirecting", {
      status: 302,
      headers: {
        "Location": "/present/",
      },
    });
  } else {
    return handleStaticFile(url);
  }
}

async function handleUpdateState(request: Request): Promise<Response> {
  const payload: unknown = await request.json();
  const totalPages: unknown = (payload as any).totalPages;
  const currentPage: unknown = (payload as any).currentPage;
  if(!isNaturalNumber(totalPages) || !isNaturalNumber(currentPage)) {
    return mkJsonResponse(400, {"error": "bad parameters"});
  }

  const sessionProps = await loadSession(payload);
  if(!sessionProps) return errBadSession();
  const [code, session] = sessionProps;

  const preState: PresentationState = {
    totalPages,
    currentPage,
    updateTime: Date.now(),
  };
  await kv.presentations.put(session.token, JSON.stringify(preState));
  return mkJsonResponse(200, {});
}

async function handlePollState(request: Request): Promise<Response> {
  const payload: unknown = await request.json();
  const sessionProps = await loadSessionUnauthenticated(payload);
  if(!sessionProps) return errBadSession();
  const [code, session] = sessionProps;

  const lastTime: unknown = (payload as any).lastTime;
  if(!isNaturalNumber(lastTime)) {
    return mkJsonResponse(400, {"error": "bad parameters"});
  }

  // 15 seconds
  for(let i = 0; i < 15; i++) {
    const psRaw = await kv.presentations.get(session.token);
    if(psRaw) {
      const ps: PresentationState = JSON.parse(psRaw);
      if(ps.updateTime > lastTime) return mkJsonResponse(200, ps);
    }
    await sleepMs(1000);
  }
  return mkJsonResponse(200, null);
}

function isNaturalNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isSafeInteger(x) && x >= 0;
}

async function handleLoadSlide(request: Request): Promise<Response> {
  const payload: unknown = await request.json();
  const slideIndex: unknown = (payload as any).slideIndex;
  if(!isNaturalNumber(slideIndex)) {
    return mkJsonResponse(400, {"error": "bad index"});
  }
  const sessionProps = await loadSessionUnauthenticated(payload);
  if(!sessionProps) return errBadSession();
  const [code, session] = sessionProps;
  const tokenHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(session.token));
  const tokenHashS = hexEncode(new Uint8Array(tokenHash));

  return mkJsonResponse(200, {
    slideUrl: `https://${S3_DOMAIN}/slides/${tokenHashS}/${slideIndex}.webp`,
  });
}

async function handlePutSlide(request: Request): Promise<Response> {
  const payload: unknown = await request.json();
  const slideIndex: unknown = (payload as any).slideIndex;
  if(!isNaturalNumber(slideIndex)) {
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
    path: `/slides/${tokenHashS}/${slideIndex}.webp`,
    method: "PUT",
    service: "s3",
    headers: {
      "Content-Type": "image/webp",
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
  for(let i = 0; i < 7; i++) {
    // Atomically insert
    connectionCode = generateRandomNumericString(4 + i);
    await kv.sessions.put(connectionCode, JSON.stringify(info), {
      ttlMs: connectionTtlMs,
      ifNotExists: true,
    });

    // If succeeded...
    const entry: SessionInfo | null = JSON.parse(await kv.sessions.get(connectionCode) || "null");
    if(entry && entry.token === info.token) {
      sessionAllocOk = true;
      break;
    }
  }

  if(!sessionAllocOk) {
    return mkJsonResponse(500, {"error": "session allocation failed - try again."});
  }

  const preState: PresentationState = {
    totalPages: 0,
    currentPage: 0,
    updateTime: Date.now(),
  };
  await kv.presentations.put(info.token, JSON.stringify(preState));
  return mkJsonResponse(200, {
    code: connectionCode,
    token: info.token,
  });
}

async function loadSession(form: unknown): Promise<[string, SessionInfo] | null> {
  const token = "" + (form as any).token;
  const session = await loadSessionUnauthenticated(form);
  if(!session) return null;

  if(session[1].token !== token) {
    return null;
  }

  return session;
}

async function loadSessionUnauthenticated(form: unknown): Promise<[string, SessionInfo] | null> {
  const code = "" + (form as any).code;

  const sessionRaw = await kv.sessions.get(code);
  if(!sessionRaw) {
    return null;
  }

  const session: SessionInfo = JSON.parse(sessionRaw);
  return [code, session];
}