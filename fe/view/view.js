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
      state = res;
      console.log(state);
    }
  }
})();
