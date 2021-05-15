(() => {
  const pdfjsLib = window['pdfjs-dist/build/pdf'];
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@2.7.570/es5/build/pdf.worker.min.js';
  window.addEventListener("load", onready);
  function onready() {
    console.log(pdfjsLib);
  }
})();
