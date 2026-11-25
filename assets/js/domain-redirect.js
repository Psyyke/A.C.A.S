(() => {
    if(location.hostname !== 'psyyke.github.io') return;
    const prefix = '/A.C.A.S';
    if(location.pathname !== prefix && !location.pathname.startsWith(prefix + '/')) return;

    const destination = new URL('https://acaschess.com/');
    destination.pathname = location.pathname.slice(prefix.length) || '/';
    destination.search = location.search;
    destination.hash = location.hash;
    location.replace(destination.href);
})();
