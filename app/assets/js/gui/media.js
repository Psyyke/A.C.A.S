export function setMediaMetadata(metadata) {
    if('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            album: 'Chess',
            artwork: [{ src: '../assets/images/logo.png', sizes: '192x192', type: 'image/png' }],
            ...metadata
        });

        navigator.mediaSession.playbackState = 'playing';
    }
}

export function initMediaSession() {
    const audio = document.querySelector('#silence-audio');

    audio.play().catch(() => {
        console.log('Autoplay blocked, waiting for user gesture...');
    });

    function startAudio() {
        audio.play().then(() => {
            toast.message('Playing a silent audiotrack in loop for stability.', 1500);

            window.removeEventListener('click', startAudio);
            window.removeEventListener('keydown', startAudio);
            window.removeEventListener('touchstart', startAudio);
        });
    }

    window.addEventListener('click', startAudio);
    window.addEventListener('keydown', startAudio);
    window.addEventListener('touchstart', startAudio);

    if('mediaSession' in navigator) {
        setMediaMetadata({
            title: 'Ready when you are!',
            artist: 'Waiting for a new match...'
        });

        navigator.mediaSession.playbackState = 'playing';
    }
}