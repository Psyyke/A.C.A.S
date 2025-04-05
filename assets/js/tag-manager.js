const TAG_MANAGER_CODE = 'GTM-5499BQ4B';

// Initialize the dataLayer
window.dataLayer = window.dataLayer || [];

// Define the gtag function
function gtag(){dataLayer.push(arguments);}

// Deny personalization by default
gtag('consent', 'default', {
    'ad_storage': 'denied',
    'ad_user_data': 'denied',
    'ad_personalization': 'denied',
    'analytics_storage': 'denied',
    'wait_for_update': 500
});

// Load the gtag.js library
gtag("js", new Date());
gtag('set', 'url_passthrough', true);
gtag("config", TAG_MANAGER_CODE);

// Load the GTM script
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