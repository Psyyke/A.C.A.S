let mediaSessionEnabled = false;
let mediaPlaybackVersion = 0;
let latestMediaMetadata = null;
const audioInteractionEvents = ['click', 'keydown', 'touchstart'];

function removeAudioInteractionListeners() {
    audioInteractionEvents.forEach(event => window.removeEventListener(event, startAudio));
}

export function setMediaMetadata(metadata) {
    latestMediaMetadata = metadata;

    if(mediaSessionEnabled && !document.pictureInPictureElement && 'mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            album: 'Chess',
            artwork: [{ src: '../assets/images/logo.png', sizes: '192x192', type: 'image/png' }],
            ...metadata
        });

        navigator.mediaSession.playbackState = 'playing';
    }
}

export function stopMediaSession() {
    mediaSessionEnabled = false;
    mediaPlaybackVersion++;
    removeAudioInteractionListeners();
    document.querySelector('#silence-audio')?.pause();

    if('mediaSession' in navigator) {
        navigator.mediaSession.metadata = null;
        navigator.mediaSession.playbackState = 'none';
    }
}

async function startAudio(event) {
    const audio = document.querySelector('#silence-audio');
    if(!mediaSessionEnabled || document.pictureInPictureElement || !audio) return;

    const version = ++mediaPlaybackVersion;

    try {
        await audio.play();
        if(version !== mediaPlaybackVersion) return;

        // PiP may have opened while the play request was pending.
        if(!mediaSessionEnabled || document.pictureInPictureElement) {
            stopMediaSession();
            return;
        }

        removeAudioInteractionListeners();
        if(event) {
            toast.message(TRANS_OBJ?.playingSilentAudio ?? 'Playing a silent audiotrack for stability!', 1500);
        }
    } catch(error) {
        if(version === mediaPlaybackVersion && mediaSessionEnabled && error.name !== 'AbortError') {
            console.log('Autoplay blocked, waiting for user gesture...');
        }
    }
}

export function initMediaSession() {
    if(document.pictureInPictureElement) {
        stopMediaSession();
        return;
    }

    if(mediaSessionEnabled || !document.querySelector('#silence-audio')) return;
    mediaSessionEnabled = true;

    audioInteractionEvents.forEach(event => window.addEventListener(event, startAudio));
    setMediaMetadata(latestMediaMetadata ?? {
        title: 'Ready when you are!',
        artist: 'Waiting for a new match...'
    });
    startAudio();
}