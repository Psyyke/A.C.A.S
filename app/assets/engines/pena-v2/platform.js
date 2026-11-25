export function isMobileDevice(nav = navigator) {
    return nav.userAgentData?.mobile === true
        || /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(nav.userAgent || '')
        || nav.platform === 'MacIntel' && nav.maxTouchPoints > 1;
}
