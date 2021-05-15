import { errBadSession, generateRandomNumericString, mkJsonResponse, randomHex32 } from "./util";
import { SessionInfo } from "./session"

const connectionTtlMs = 600 * 1000; // 10 mins

addEventListener("fetch", (event: FetchEvent) => {
  event.respondWith(handleRequest(event));
});

async function handleRequest(event: FetchEvent): Promise<Response> {
  const url = new URL(event.request.url);
  if(url.pathname == "/control/create_session") {
    return handleSessionCreation(event.request);
  } else if(url.pathname == "/control/put_slide") {
    const form = await event.request.formData();
    const sessionProps = await loadSession(form);
    return mkJsonResponse(200, {"info": "not implemented"});
  } else if(url.pathname == "/control/renew_session") {
    const form = await event.request.formData();
    const sessionProps = await loadSession(form);
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

async function loadSession(form: FormData): Promise<[string, SessionInfo] | null> {
  const code = form.get("code")?.toString() || "";
  const token = form.get("token")?.toString() || "";

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