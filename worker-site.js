export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/index.html") {
      url.pathname = "/chess.html";
      request = new Request(url, request);
    }
    return env.ASSETS.fetch(request);
  },
};
