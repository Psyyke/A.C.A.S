self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', event => {
    const request = event.request;
    if(request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;
    const url = new URL(request.url);
    const scope = new URL(self.registration.scope);
    const prefix = `${scope.pathname}runtime/`;
    let target = request;
    if(url.origin === scope.origin && url.pathname.startsWith(prefix)) {
        const relative = url.pathname.slice(prefix.length);
        const engine = new URL('../../app/assets/engines/lc0/', scope);
        const mapped = new URL(relative, engine);
        if(mapped.origin !== engine.origin || !mapped.pathname.startsWith(engine.pathname)) {
            event.respondWith(new Response('Invalid runtime path', { status: 400 }));
            return;
        }
        mapped.search = url.search;
        target = new Request(mapped, request);
    }
    event.respondWith((async () => {
        let response;
        try {
            response = await fetch(target);
        } catch(error) {
            console.error('Browser isolation fetch failed:', request.url, error);
            if(request.mode === 'navigate' && request.method === 'GET') {
                try {
                    response = await fetch(target, { cache: 'reload' });
                } catch(retryError) {
                    console.error('Browser isolation navigation retry failed:', request.url, retryError);
                }
            }
            if(!response) {
                const navigation = request.mode === 'navigate';
                response = new Response(navigation
                    ? '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Could not load this tool</title><body><h1>Could not load this tool</h1><p>The browser could not fetch the page, even after retrying. Check your connection or local server, then try again. Technical details are in the browser console.</p><p><a href="">Try again</a></p></body></html>'
                    : 'Browser isolation could not fetch this resource. Check your connection or local server and retry.',
                { status: 503, statusText: 'Service Unavailable',
                    headers: { 'Content-Type': navigation ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8',
                        'Cache-Control': 'no-store' } });
            }
        }
        if(response.type === 'opaque') return response;
        const headers = new Headers(response.headers);
        headers.set('Cross-Origin-Opener-Policy', 'same-origin');
        headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
        return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    })());
});
