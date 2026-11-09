var klaroConfig = {
    acceptAll: true,
    storageMethod: 'cookie',
    cookieName: 'klaro',
    cookieExpiresAfterDays: 360,
    translations: {
        en: {
            consentNotice: {
                description: 'Ads help keep A.C.A.S going :) Is it okay to personalize ads and use analytics cookies? You can change your choice later. The app itself has no ads or analytics.'
            }
        }
    },
    services: [
        {
            name: 'adsense',
            title: 'Google AdSense',
            description: 'Controls whether Google may personalize advertisements.',
            purposes: ['advertising'],
            cookies: ['__gads', '__gpi'],
            optOut: true,
            required: false,
            onAccept: function() {
                window.adsbygoogle = window.adsbygoogle || [];
                window.adsbygoogle.requestNonPersonalizedAds = 0;
                gtag('consent', 'update', {
                    'ad_user_data': 'granted',
                    'ad_personalization': 'granted',
                    'ad_storage': 'granted',
                    'analytics_storage': 'granted'
                });
            },
            onDecline: function() {
                window.adsbygoogle = window.adsbygoogle || [];
                window.adsbygoogle.requestNonPersonalizedAds = 1;
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