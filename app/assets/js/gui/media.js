import { silenceAudioElem, floatingFloaty } from './elementDeclarations.js';

const audioInteractionEvents = ['click', 'keydown', 'touchstart'];
const mediaSessionActions = ['play', 'pause', 'stop', 'previoustrack', 'nexttrack', 'seekbackward', 'seekforward', 'seekto'];

let mediaSessionEnabled = false;
let mediaPlaybackVersion = 0;
let latestMediaMetadata = null;

// While the floating panel is visible (real PiP or the modal fallback), the silent track must not hold the media keys.
function isFloatingPanelVisible() {
    return Boolean(document.pictureInPictureElement || floatingFloaty?.open);
}

function removeAudioInteractionListeners() {
    audioInteractionEvents.forEach(event => window.removeEventListener(event, startAudio));
}

export function setMediaMetadata(metadata) {
    latestMediaMetadata = metadata;

    if(mediaSessionEnabled && !isFloatingPanelVisible() && 'mediaSession' in navigator) {
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
    silenceAudioElem?.pause();

    if('mediaSession' in navigator) {
        navigator.mediaSession.metadata = null;
        navigator.mediaSession.playbackState = 'none';
        mediaSessionActions.forEach(action => {
            try { navigator.mediaSession.setActionHandler(action, null); } catch { /* Action unsupported in this browser. */ }
        });
    }
}

async function startAudio(event) {
    const audio = silenceAudioElem;

    if(!mediaSessionEnabled || isFloatingPanelVisible() || !audio) return;

    const version = ++mediaPlaybackVersion;

    try {
        await audio.play();

        if(version !== mediaPlaybackVersion) return;

        // PiP may have opened while the play request was pending.
        if(!mediaSessionEnabled || isFloatingPanelVisible()) {
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
    if(isFloatingPanelVisible()) {
        stopMediaSession();
        return;
    }

    if(mediaSessionEnabled || !silenceAudioElem) return;

    mediaSessionEnabled = true;

    audioInteractionEvents.forEach(event => window.addEventListener(event, startAudio));
    setMediaMetadata(latestMediaMetadata ?? {
        title: 'Ready when you are!',
        artist: 'Waiting for a new match...'
    });
    startAudio();
}