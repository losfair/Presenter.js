import * as util from "../../felib/util"

const pdfjsLib = window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@2.7.570/es5/build/pdf.worker.min.js';
window.addEventListener("load", onready);

let globalCode = "", globalToken = "";
let pdfPages = [];
let pdfPageBoxes = [];
let currentPage = 0, totalPages = 0;

async function onready() {
  console.log(pdfjsLib);
  const { code, token } = await ensureCreds();
  globalCode = code;
  globalToken = token;
  console.log("Initialized credentials.");

  const pollStateRes = await fetch("/control/poll_state", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      code: globalCode,
      lastTime: 0,
    }),
  });
  if(!pollStateRes.ok) throw new Error("Poll state error: " + await pollStateRes.text());
  const cloudState = await pollStateRes.json();
  currentPage = cloudState.currentPage;
  totalPages = cloudState.totalPages;

  document.querySelector(".scene-loading").style.display = "none";

  const credsBox = document.querySelector(".credentials-box");
  credsBox.style.display = "block";

  document.querySelector(".credentials-view").innerText =
    "Presentation Code: " + globalCode + "\n" +
    `View: https://${window.location.hostname}/view/`;

  const resetCredsBtn = document.querySelector("#reset-creds-btn");
  resetCredsBtn.addEventListener("click", resetCreds);

  document.querySelector(".scene-upload").style.display = "block";

  if(totalPages) {
    // Sync state from cloud
    document.querySelector(".scene-upload-state").innerText = "Syncing slides";
    const promises = [];
    for(let i = 1; i <= totalPages; i++) {
      promises.push(util.loadSlide(globalCode, i));
    }
    const blobs = await Promise.all(promises);
    pdfPages = blobs.map(x => {
      const urlCreator = window.URL || window.webkitURL;
      const imageUrl = urlCreator.createObjectURL(x);
      const image = new Image();
      image.src = imageUrl;
      return image;
    });

    document.querySelector(".scene-upload").style.display = "none";
    showPresentatationControl();
  } else {
    // Nothing's uploaded yet
    document.querySelector("#pdf-input").addEventListener("change", handlePdfUpload);
  }
}

function showPresentatationControl() {
  const slideListElem = document.querySelector("#pcontrol-slides");
  let index = 1;
  for(const page of pdfPages) {
    const box = document.createElement("div");
    box.className = "pcontrol-slide-box";
    page.className = "pcontrol-img";
    box.appendChild(page);
    slideListElem.appendChild(box);
    pdfPageBoxes.push(box);
    let thisIndex = index;
    box.addEventListener("click", () => {
      currentPage = thisIndex;
      syncPresentationState();
      applyPresentationControlState();
    })
    index++;
  }
  document.querySelector(".scene-pcontrol").style.display = "block";
  applyPresentationControlState();
}

function applyPresentationControlState() {
  for(const box of pdfPageBoxes) {
    box.dataset.active = "0";
  }
  pdfPageBoxes[currentPage - 1].dataset.active = "1";
}

function resetCreds() {
  if(confirm("Reset session?")) {
    delete localStorage.savedCreds;
    window.location.reload();
  }
}

async function handlePdfUpload(event) {
  const file = event.target.files[0];
  if(!file) return;

  document.querySelector(".scene-upload-state").innerText = "Processing";

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
      var viewport = page.getViewport({scale: 3});
  
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

      pdfPages.push(null);
      pushPromises.push(uploadPdfPage(i, canvas));
    }
    await Promise.all(pushPromises);
    console.log("Rendered and uploaded all pages.");

    currentPage = 1;
    totalPages = pdf.numPages;
    await syncPresentationState();
  } catch(e) {
    console.log(e);
    alert("Error processing PDF: " + e);
    window.location.reload();
    return;
  }

  document.querySelector(".scene-upload").style.display = "none";
  showPresentatationControl();
}

async function syncPresentationState() {
  try {
    const updateStateRes = await fetch("/control/update_state", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code: globalCode,
        token: globalToken,
        totalPages: totalPages,
        currentPage: currentPage,
      }),
    });
    if(!updateStateRes.ok) {
      throw new Error("update state failed: " + await updateStateRes.text());
    }
  } catch(e) {
    console.log(e);
  }
}

async function uploadPdfPage(pageIndex, canvas) {
  const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/webp"));
  const urlCreator = window.URL || window.webkitURL;
  const imageUrl = urlCreator.createObjectURL( blob );
  const image = new Image();
  image.src = imageUrl;
  pdfPages[pageIndex - 1] = image;
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
        "Content-Type": "image/webp",
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

async function ensureCreds() {
  const savedCredsRaw = localStorage.savedCreds;
  if(savedCredsRaw) {
    try {
      const { code, token, ts } = JSON.parse(savedCredsRaw);
      if(Date.now() - ts < 3600 * 1000) {
        return { code, token };
      }
    } catch(e) {
      console.log(e);
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
  const ts = Date.now();
  localStorage.savedCreds = JSON.stringify({ code, token, ts });
  return { code, token };
}

