addEventListener("fetch", (event: FetchEvent) => {
  event.respondWith(new Response("Hello, world!"));
});
