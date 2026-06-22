export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    const host = new URL(request.url).hostname;
    const headers = new Headers(response.headers);
    if (host === 'ludochaos.com') {
      headers.set('X-Content-Type-Options', 'nosniff');
    } else {
      headers.set('X-Robots-Tag', 'noindex');
    }
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
};
