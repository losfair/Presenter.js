/// <reference path="../node_modules/blueboat-types/src/index.d.ts" />

import { errBadSession, generateRandomNumericString, mkJsonResponse, randomHex32, sleepMs } from "./util";
import { PresentationState, SessionInfo } from "./session"
import { appConfig, nsPresentations, nsSessions } from "./config";
import { bgEntry } from "./background";

Router.use("/", (req, next) => {
  const u = new URL(req.url);
  if (u.pathname == "/") {
    return Response.redirect("/present/", 302);
  } else {
    return next(req);
  }
});

Router.get("/", App.serveStaticFiles("/", "fe"));

Router.post("/control/update_state", async req => {
  const payload: unknown = await req.json();
  const totalPages: unknown = (payload as any).totalPages;
  const currentPage: unknown = (payload as any).currentPage;
  if (!isNaturalNumber(totalPages) || !isNaturalNumber(currentPage)) {
    return mkJsonResponse(400, { "error": "bad parameters" });
  }

  const sessionProps = await loadSession(payload);
  if (!sessionProps) return errBadSession();
  const [code, session] = sessionProps;

  const preState: PresentationState = {
    totalPages,
    currentPage,
    updateTime: Date.now(),
  };
  await nsPresentations.set(session.token, JSON.stringify(preState));
  return mkJsonResponse(200, {});
});

Router.post("/control/poll_state", async req => {
  const payload: unknown = await req.json();
  const sessionProps = await loadSessionUnauthenticated(payload);
  if (!sessionProps) return errBadSession();
  const [code, session] = sessionProps;

  const lastTime: unknown = (payload as any).lastTime;
  if (!isNaturalNumber(lastTime)) {
    return mkJsonResponse(400, { "error": "bad parameters" });
  }

  // 15 seconds
  for (let i = 0; i < 15; i++) {
    const psRaw = await nsPresentations.get(session.token);
    if (psRaw) {
      const ps: PresentationState = JSON.parse(new TextDecoder().decode(psRaw));
      if (ps.updateTime > lastTime) return mkJsonResponse(200, ps);
    }
    await sleepMs(1000);
  }
  return mkJsonResponse(200, null);
});

function isNaturalNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isSafeInteger(x) && x >= 0;
}

Router.post("/control/load_slide", async req => {
  const payload: unknown = await req.json();
  const slideIndex: unknown = (payload as any).slideIndex;
  if (!isNaturalNumber(slideIndex)) {
    return mkJsonResponse(400, { "error": "bad index" });
  }
  const sessionProps = await loadSessionUnauthenticated(payload);
  if (!sessionProps) return errBadSession();
  const [code, session] = sessionProps;
  const tokenHashS = Codec.hexencode(NativeCrypto.digest("sha256", new TextEncoder().encode(session.token)));

  const slideUrl = ExternalService.AWS.getPresignedUrl({
    name: appConfig.s3Region,
    endpoint: appConfig.s3Endpoint || undefined,
  }, {
    key: appConfig.s3AccessKeyId,
    secret: appConfig.s3SecretAccessKey,
  }, {
    type: "getObject",
    request: {
      bucket: appConfig.s3Bucket,
      key: `slides/${tokenHashS}/${slideIndex}.webp`,
    }
  }, {
    expires_in_secs: 600,
  });

  return mkJsonResponse(200, {
    slideUrl,
  });
});

Router.post("/control/put_slide", async req => {
  const payload: unknown = await req.json();
  const slideIndex: unknown = (payload as any).slideIndex;
  if (!isNaturalNumber(slideIndex)) {
    return mkJsonResponse(400, { "error": "bad index" });
  }
  const sessionProps = await loadSession(payload);
  if (!sessionProps) return errBadSession();
  const [code, session] = sessionProps;
  const tokenHashS = Codec.hexencode(NativeCrypto.digest("sha256", new TextEncoder().encode(session.token)));

  const uploadUrl = ExternalService.AWS.getPresignedUrl({
    name: appConfig.s3Region,
    endpoint: appConfig.s3Endpoint || undefined,
  }, {
    key: appConfig.s3AccessKeyId,
    secret: appConfig.s3SecretAccessKey,
  }, {
    type: "putObject",
    request: {
      bucket: appConfig.s3Bucket,
      key: `slides/${tokenHashS}/${slideIndex}.webp`,
      content_type: "image/webp",
    }
  }, {
    expires_in_secs: 600,
  });
  return mkJsonResponse(200, {
    uploadUrl,
  });
})

Router.post("/control/create_session", async request => {
  const info: SessionInfo = {
    token: randomHex32(),
    createdAt: Date.now(),
  }

  let connectionCode = "";
  let sessionAllocOk = false;

  // Retry until we got a session
  for (let i = 0; i < 7; i++) {
    // Atomically insert
    connectionCode = generateRandomNumericString(4 + i);
    const ourValue = new TextEncoder().encode(JSON.stringify(info));
    const ok = await nsSessions.compareAndSetMany([
      {
        key: connectionCode,
        check: "absent",
        set: { value: ourValue },
      },
    ]);
    if (ok) {
      const { id } = await Background.delayed(bgEntry, "deleteSession", {
        connectionCode,
        expectedValue: ourValue,
      }, {
        tsSecs: Date.now() / 1000 + 4 * 3600,
      });
      console.log(`scheduled session deletion: ${id}`);
      sessionAllocOk = true;
      break;
    }
  }

  if (!sessionAllocOk) {
    return mkJsonResponse(500, { "error": "session allocation failed - try again." });
  }

  const preState: PresentationState = {
    totalPages: 0,
    currentPage: 0,
    updateTime: Date.now(),
  };
  await nsPresentations.set(info.token, JSON.stringify(preState));
  return mkJsonResponse(200, {
    code: connectionCode,
    token: info.token,
  });
});


async function loadSession(form: unknown): Promise<[string, SessionInfo] | null> {
  const token = "" + (form as any).token;
  const session = await loadSessionUnauthenticated(form);
  if (!session) return null;

  if (session[1].token !== token) {
    return null;
  }

  return session;
}

async function loadSessionUnauthenticated(form: unknown): Promise<[string, SessionInfo] | null> {
  const code = "" + (form as any).code;

  const sessionRaw = await nsSessions.get(code);
  if (!sessionRaw) {
    return null;
  }

  const session: SessionInfo = JSON.parse(new TextDecoder().decode(sessionRaw));
  return [code, session];
}