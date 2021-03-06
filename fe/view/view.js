import { loadSlide } from "../../felib/util";

window.addEventListener("load", onready);
function onready() {
  const connBtn = document.getElementById("conn-btn");
  const connCode = document.getElementById("conn-code");
  connBtn.addEventListener("click", () => {
    document.querySelector(".scene-entry").style.display = "none";
    document.querySelector(".scene-view").style.display = "block";

    launchPersistentConnection(connCode.value)
  });
}

function launchPersistentConnection(connCode) {
  console.log("Launching persistent connection: " + connCode);
  let state = {
    totalPages: 0,
    currentPage: 0,
    updateTime: 0,
  };
  let images = [];
  innerLoop();

  document.addEventListener("keydown", e => {
    if(e.key == "ArrowLeft") {
      if(state.currentPage > 1) {
        state.currentPage--;
        applyStateToView();
      }
    }
    if(e.key == "ArrowRight") {
      if(state.currentPage < state.totalPages) {
        state.currentPage++;
        applyStateToView();
      }
    }
  });

  async function innerLoop() {
    try {
      await runOnce();
      setTimeout(innerLoop, 0);
    } catch(e) {
      console.log(e);
      setTimeout(innerLoop, 1000);
    }
  }

  function applyStateToView() {
    if(state.currentPage >= 1 && state.currentPage <= images.length) {
      document.getElementById("current-image").innerHTML = "";
      document.getElementById("current-image").appendChild(images[state.currentPage - 1]);
    }
  }

  async function runOnce() {
    const fetchRes = await fetch("/control/poll_state", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code: connCode,
        lastTime: state.updateTime,
      }),
    });
    if(!fetchRes.ok) throw new Error("fetch returns error: " + await fetchRes.text());
    const res = await fetchRes.json();
    if(!res) return;

    const loadEdge = state.totalPages === 0 && res.totalPages !== 0;
    state = res;

    console.log(state);
    if(loadEdge) {
      console.log(`Loading ${state.totalPages} pages.`);
      const slidesLoadingBox = document.querySelector(".slides-loading");
      slidesLoadingBox.style.display = "block";
      const promises = [];
      for(let i = 1; i <= state.totalPages; i++) {
        let index = i;
        promises.push((async () => {
          while(true) {
            try {
              const blob = await loadSlide(connCode, index);
              const urlCreator = window.URL || window.webkitURL;
              var imageUrl = urlCreator.createObjectURL( blob );
              return imageUrl;
            } catch(e) {
              console.log(`error loading slide ${index}`, e);
              await sleepMs(5000);
            }
          }
        })());
      }
      const slideImages = await Promise.all(promises);
      images = slideImages.map(x => {
        const img = new Image();
        img.src = x;
        img.className = "slide-image";
        return img;
      });
      slidesLoadingBox.style.display = "none";
    }
    applyStateToView();
  }
}

function sleepMs(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
