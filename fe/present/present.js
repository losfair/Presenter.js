import * as util from "../../felib/util"

const pdfjsLib = window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@2.7.570/es5/build/pdf.worker.min.js';
window.addEventListener("load", onready);

let globalCode = "", globalToken = "";

async function onready() {
  console.log(pdfjsLib);
  const { code, token } = await ensureCreds();
  globalCode = code;
  globalToken = token;
  console.log("Initialized credentials.");

  periodicallyRenewSession();

  document.querySelector(".scene-loading").style.display = "none";
  document.querySelector(".credentials-view").innerText = "Code: " + globalCode;
  const resetCredsBtn = document.querySelector("#reset-creds-btn");
  resetCredsBtn.style.display = "inline-block";
  resetCredsBtn.addEventListener("click", resetCreds);
  document.querySelector(".scene-upload").style.display = "block";

  document.querySelector("#pdf-input").addEventListener("change", handlePdfUpload);
}

function resetCreds() {
  if(confirm("Reset credentials?")) {
    delete localStorage.savedCreds;
    window.location.reload();
  }
}

async function handlePdfUpload(event) {
  const file = event.target.files[0];
  if(!file) return;

  document.querySelector(".scene-upload").style.display = "none";

  try {
    const pdfBuf = await new Promise(resolve => {
      const reader = new FileReader();
      reader.addEventListener("load", (event) => {
        resolve(event.target.result);
      });
      reader.readAsArrayBuffer(file);
    });
    const pdf = await pdfjsLib.getDocument({data: new Uint8Array(pdfBuf)}).promise;
    console.log(pdf);

    const pushPromises = [];

    for(let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      var viewport = page.getViewport({scale: 2});
  
      var canvas = document.createElement("canvas");
      var context = canvas.getContext("2d");
      canvas.height = viewport.height;
      canvas.width = viewport.width;
  
      var renderContext = {
        canvasContext: context,
        viewport: viewport
      };
      var renderTask = page.render(renderContext);
      await renderTask.promise;

      pushPromises.push(uploadPdfPage(i, canvas));
    }
    await Promise.all(pushPromises);
    console.log("Rendered and uploaded all pages.");

    const updateStateRes = await fetch("/control/update_state", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code: globalCode,
        token: globalToken,
        totalPages: pdf.numPages,
        currentPage: 1,
      }),
    });
    if(!updateStateRes.ok) {
      throw new Error("update state failed: " + await updateStateRes.text());
    }
  } catch(e) {
    console.log(e);
    alert("Error processing PDF: " + e);
    window.location.reload();
  }
}

async function uploadPdfPage(pageIndex, canvas) {
  const blob = await new Promise(resolve => canvas.toBlob(resolve));
  for(let i = 0; i < 3; i++) {
    const putSlideRes = await fetch("/control/put_slide", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code: globalCode,
        token: globalToken,
        slideIndex: pageIndex,
      }),
    });
    if(!putSlideRes.ok) {
      console.log(`putSlide failed for page ${pageIndex}: ` + await putSlideRes.text());
      continue;
    }
    const { uploadUrl } = await putSlideRes.json();
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "image/png",
      },
      body: blob,
    });
    if(!uploadRes.ok) {
      console.log(`PUT operation failed for page ${pageIndex}: ` + await uploadRes.text());
      continue;
    }

    return;
  }
  throw new Error(`upload failed for page ${pageIndex} after retrying`);
}

async function periodicallyRenewSession() {
  while(true) {
    try {
      await renewSession(globalCode, globalToken);
    } catch(e) {
      console.log(e);
    }
    await util.sleepMs(15 * 1000);
  }
}

async function ensureCreds() {
  const savedCredsRaw = localStorage.savedCreds;
  if(savedCredsRaw) {
    const { code, token } = JSON.parse(savedCredsRaw);
    if(await renewSession(code, token)) {
      return { code, token };
    }
  }

  const res = await fetch("/control/create_session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: "{}"
  });
  if(!res.ok) throw new Error("create_session failed");
  const { code, token } = await res.json();
  localStorage.savedCreds = JSON.stringify({ code, token });
  return { code, token };
}

async function renewSession(code, token) {
  const res = await fetch("/control/renew_session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      code,
      token,
    }),
  });
  return res.ok;
}
