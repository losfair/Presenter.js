export function sleepMs(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function loadSlide(connCode, index) {
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

  const blob = new Blob( [ new Uint8Array(imageBuf) ], { type: "image/png" } );
  return blob;
}