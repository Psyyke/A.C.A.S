var klaroConfig = {
    acceptAll: true,
    storageMethod: 'cookie',
    cookieName: 'klaro',
    services: [
        {
            name: 'adsense',
            title: 'Google AdSense',
            description: 'Displays advertisements and tracks user behavior.',
            purposes: ['advertising'],
            cookies: ['__gads', '__gpi'],
            optOut: true,
            required: false,
            onAccept: function() {
                gtag('consent', 'update', {
                    'ad_storage': 'granted'
                });
            },
            onDecline: function() {
                gtag('consent', 'update', {
                    'ad_storage': 'denied'
                });
            }
        }
    ]
};