// tag-manager.js
// Analytics and tag management utilities for A.C.A.S.
// Part of the modular ES6 codebase in assets/js/modules/.
// Used for Google Tag Manager and analytics setup.

// Tag manager utilities for A.C.A.S

export const TAG_MANAGER_CODE = 'GTM-5499BQ4B';

/**
 * Initialize Google Tag Manager and analytics for A.C.A.S.
 */
export function initTagManager() {
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('consent', 'default', {
        'ad_storage': 'denied',
        'ad_user_data': 'denied',
        'ad_personalization': 'denied',
        'analytics_storage': 'denied',
        'wait_for_update': 500
    });
    gtag("js", new Date());
    gtag('set', 'url_passthrough', true);
    gtag("config", TAG_MANAGER_CODE);
    (function(w,d,s,l,i){
        w[l]=w[l]||[];
        w[l].push({'gtm.start': new Date().getTime(), event:'gtm.js'});
        var f=d.getElementsByTagName(s)[0],
            j=d.createElement(s),
            dl=l!='dataLayer' ? '&l='+l : '';
        j.async=true;
        j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;
        f.parentNode.insertBefore(j,f);
    })(window,document,'script','dataLayer', TAG_MANAGER_CODE);
}
