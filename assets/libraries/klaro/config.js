var klaroConfig = {
    acceptAll: true,
    storageMethod: 'cookie',
    cookieName: 'klaro',
    cookieExpiresAfterDays: 360,
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
                    'ad_user_data': 'granted',
                    'ad_personalization': 'granted',
                    'ad_storage': 'granted',
                    'analytics_storage': 'granted'
                  });
            },
            onDecline: function() {
                gtag('consent', 'update', {
                    'ad_user_data': 'denied',
                    'ad_personalization': 'denied',
                    'ad_storage': 'denied',
                    'analytics_storage': 'denied'
                });
            }
        }
    ]
};