(() => {
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

    async function innerLoop() {
      try {
        await runOnce();
        setTimeout(innerLoop, 0);
      } catch(e) {
        console.log(e);
        setTimeout(innerLoop, 1000);
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
                const metaRes = await fetch("/control/load_slide", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    code: connCode,
                    slideIndex: index,
                  }),
                });
                if(!metaRes.ok) throw new Error("load_slide failed: " + await metaRes.text());
                const { slideUrl } = await metaRes.json();

                const imageRes = await fetch(slideUrl);
                if(!imageRes.ok) throw new Error("fetch slide failed: " + await imageRes.text());
                const imageBuf = await imageRes.arrayBuffer();
                console.log(imageBuf);

                const blob = new Blob( [ new Uint8Array(imageBuf) ], { type: "image/png" } );
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
      if(state.currentPage >= 1 && state.currentPage <= images.length) {
        document.getElementById("current-image").innerHTML = "";
        document.getElementById("current-image").appendChild(images[state.currentPage - 1]);
      }
    }
  }

  function sleepMs(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
})();
