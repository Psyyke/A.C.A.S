import { floatingPanelVideoElem, floatingFloaty } from './elementDeclarations.js';
import { initMediaSession, stopMediaSession } from './media.js';
import {
    createPipRenderer,
    drawPipBoard,
    drawPipEvaluation,
    getPipBoardHeight,
    tracePipRoundedRect,
    pipEvalBarWidth,
    pipContentGap,
    pipHeaderHeight,
    pipHeaderBackground,
    pipProfileHeaderBackground,
    pipContentBackground
} from './pipRenderer.js';
import { captureBoardImage } from './boardCapture.js';

export const pipData = {};
export const pipSettingKeys = ['pip', 'pipBoard', 'pipSharedBoard', 'pipEval', 'pipSan', 'pipQuality'];

const panelWidth = 400;
const profileLabelHeight = 30;
const mainHeaderBorderColor = 'rgba(255, 255, 255, 0.12)';
const sharedEvalBarWidth = 40;
// Set to true to restore stepped bars and expanding headers in shared views.
const useSteppedSharedEvaluation = false;
const layoutStorageKey = 'acas.pip.layout';
const renderers = new Map();

let activeInstance = null;
let idleRenderer = null;
let idleEnabled = true;
let canvas = null;
let video = null;
let starting = false;
let needsOpening = false;
let syncRevision = 0;
let composeTimer = null;
let interactionHandler = null;
let lastLiveLayout = readSavedLayout();

function readSavedLayout() {
    try {
        const layout = JSON.parse(localStorage.getItem(layoutStorageKey));
        if(Number.isFinite(layout?.height) && layout.height >= pipHeaderHeight
            && Number.isFinite(layout.scale) && layout.scale > 0 && layout.scale <= 2) return layout;
    } catch(error) {
        console.warn('[PiP] Could not read the saved layout:', error);
    }

    return null;
}

function rememberLayout(height, scale) {
    if(lastLiveLayout?.height === height && lastLiveLayout.scale === scale) return;
    lastLiveLayout = { height, scale };

    try {
        localStorage.setItem(layoutStorageKey, JSON.stringify(lastLiveLayout));
    } catch(error) {
        console.warn('[PiP] Could not save the layout:', error);
    }
}

function fitProfileStatus(context, renderer, width) {
    const parts = renderer.statusParts;
    if(!parts.length) return renderer.statusText;

    let text = parts.join('  ');
    while(parts.length > 1 && context.measureText(text).width > width) {
        parts.shift();
        text = parts.join('  ');
    }

    return text;
}

function liveInstances() {
    return (window.AcasInstances || []).map(entry => entry.instance).filter(instance => !instance.instanceClosed);
}

function profileRenderers(instance) {
    return renderers.get(instance) || new Map();
}

function visibleRenderers() {
    if(profileRenderers(activeInstance).size) return [...profileRenderers(activeInstance).values()];

    const next = liveInstances().find(instance => profileRenderers(instance).size);
    if(next) {
        activeInstance = next;
        return [...profileRenderers(next).values()];
    }

    return !liveInstances().length && idleEnabled && idleRenderer ? [idleRenderer] : [];
}

function scheduleComposition() {
    if(composeTimer !== null) return;

    composeTimer = setTimeout(() => {
        composeTimer = null;
        refreshPanels().then(() => {
            if(needsOpening && !starting && video?.srcObject) return startPictureInPicture();
        }).catch(console.error);
    }, 0);
}

function panelGroups(panels) {
    const groups = [];

    for(const panel of panels) {
        const board = panel.settings.pipSharedBoard ? panel.renderer.board : null;
        const group = board && !board.animated ? groups.find(group => {
            const first = group[0];
            const other = first.renderer.board;
            return first.settings.pipSharedBoard && other && !other.animated
                && board.fen === other.fen && board.orientation === other.orientation
                && Math.abs(board.aspectRatio - other.aspectRatio) < 0.001;
        }) : null;

        if(group) group.push(panel);
        else groups.push([panel]);
    }

    return groups;
}

function sharedEvaluationLayout(group) {
    const count = group.filter(panel => panel.renderer.evaluation).length;
    // Keep scores readable; unusually large groups retain at least 160px of board.
    const barWidth = count ? Math.min(sharedEvalBarWidth, (panelWidth - 160) / count) : 0;
    return { barWidth, boardWidth: panelWidth - count * barWidth };
}

function layoutGroup(group, top) {
    const shared = group.length > 1;
    const evaluationLayout = shared ? sharedEvaluationLayout(group) : null;
    const barWidth = shared ? evaluationLayout.barWidth
        : (group[0].renderer.evaluation ? pipEvalBarWidth : 0);
    const width = shared ? evaluationLayout.boardWidth : panelWidth - barWidth;
    const labels = [];
    const contents = [];
    let board = null;
    let bottom = top;

    function addProfile(panel, sourceTop = 0, sourceBottom = 0) {
        const height = panel.renderer.height - sourceTop - sourceBottom;
        const joined = panel.renderer.textMovePanel && height > 0;
        labels.push({ panel, top: bottom, contentHeight: joined ? height : 0 });
        bottom += profileLabelHeight;

        if(height <= 0) return;

        if(!joined) bottom += pipContentGap;
        contents.push({ renderer: panel.renderer, top: bottom, sourceTop, height, joined });
        bottom += height;
    }

    if(!shared) {
        const panel = group[0];
        const profileBoard = panel.renderer.board;
        // Strip the board's outer vertical insets; the compositor supplies them.
        addProfile(panel, profileBoard ? pipContentGap : 0,
            profileBoard && panel.renderer.height <= profileBoard.height ? pipContentGap : 0);
    } else {
        for(const panel of group) {
            if(panel.renderer.height > panel.renderer.board.height) continue;
            labels.push({ panel, top: bottom });
            bottom += profileLabelHeight + pipContentGap;
        }

        const height = getPipBoardHeight(width, group[0].renderer.board.aspectRatio) - pipContentGap * 2;
        board = { top: bottom };
        bottom += height;

        // Keep each feedback footer beside its own profile header.
        for(const panel of group) {
            if(panel.renderer.height <= panel.renderer.board.height) continue;
            bottom += pipContentGap;
            addProfile(panel, panel.renderer.board.height);
        }
    }

    // Shared bars normally span the entire group, with uniform header widths.
    // The optional stepped layout starts each bar at its own header instead.
    const stepped = shared && useSteppedSharedEvaluation;
    const evaluationLabels = stepped ? [...labels].reverse() : labels;
    const evaluations = [];
    let left = width;
    for(const label of evaluationLabels) {
        label.width = stepped ? left : width;

        const evaluation = label.panel.renderer.evaluation;
        if(!evaluation) continue;

        evaluations.push({ evaluation, left, top: stepped ? label.top : top });
        left += barWidth;
    }

    return { group, width, barWidth, labels, contents, board, bottom, evaluations };
}

function drawProfileLabel(context, panel, top, width, contentHeight = 0) {
    const textLeft = pipContentGap * 3;
    const textWidth = width - textLeft * 2;

    context.save();
    context.fillStyle = pipProfileHeaderBackground;
    // A text-move header and body share one outline: no rounded corners or gap
    // at their join, with rounding only at the card's outer top and bottom.
    tracePipRoundedRect(context, pipContentGap, top, width - pipContentGap * 2, profileLabelHeight + contentHeight);
    context.fill();

    if(contentHeight > 0) {
        context.fillStyle = 'rgba(255, 255, 255, 0.08)';
        context.fillRect(pipContentGap, top + profileLabelHeight - 1, width - pipContentGap * 2, 1);
    }

    context.textBaseline = 'middle';
    context.textAlign = 'left';
    context.font = '700 16px "Rubik", "IBM Plex Sans", sans-serif';

    const status = panel.renderer.statusText;
    const name = panel.name.replace(/\p{L}/u, letter => letter.toLocaleUpperCase());
    let nameWidth = status ? Math.min(170, textWidth / 2, context.measureText(name).width) : textWidth;
    if(status) {
        context.font = '600 14px "Rubik", "IBM Plex Sans", sans-serif';
        const parts = panel.renderer.statusParts;
        const minimumStatus = parts.length ? parts[parts.length - 1] : '';
        nameWidth = Math.max(0, Math.min(nameWidth,
            textWidth - pipContentGap * 2 - context.measureText(minimumStatus).width));
        context.font = '700 16px "Rubik", "IBM Plex Sans", sans-serif';
    }
    context.fillStyle = 'rgba(255, 255, 255, 0.75)';
    if(nameWidth > 0) context.fillText(name, textLeft, top + profileLabelHeight / 2, nameWidth);

    if(status) {
        const statusX = textLeft + nameWidth + pipContentGap * 2;
        context.fillStyle = 'rgba(255, 255, 255, 0.6)';
        context.font = '600 14px "Rubik", "IBM Plex Sans", sans-serif';
        const statusWidth = Math.max(0, width - statusX - textLeft);
        const fittedStatus = fitProfileStatus(context, panel.renderer, statusWidth);
        context.textAlign = 'right';
        if(panel.renderer.statusParts.length) {
            context.fillText(fittedStatus, width - textLeft, top + profileLabelHeight / 2);
        } else if(statusWidth > 0) {
            context.fillText(fittedStatus, width - textLeft, top + profileLabelHeight / 2, statusWidth);
        }
    }

    context.restore();
}

function drawGroup(context, layout) {
    const { group, width, barWidth, labels, contents, board, bottom, evaluations } = layout;
    for(const label of labels) {
        drawProfileLabel(context, label.panel, label.top, label.width, label.contentHeight);
    }

    if(board) {
        const source = group[0].renderer.board;
        const overlays = CONCEAL_ASSISTANCE_ACTIVE ? [] : group.map(panel => panel.renderer.board.overlay);
        drawPipBoard(context, source.bitmap, overlays, board.top - pipContentGap, width, source.aspectRatio);
    }

    for(const content of contents) {
        const { renderer, top, sourceTop, height, joined } = content;
        const scale = renderer.canvas.height / renderer.height;
        const sourceWidth = renderer.canvas.width * (renderer.evaluation ? panelWidth - pipEvalBarWidth : panelWidth) / panelWidth;
        context.save();
        if(joined) {
            tracePipRoundedRect(context, pipContentGap, top - profileLabelHeight,
                width - pipContentGap * 2, profileLabelHeight + height);
            context.clip();
        }
        context.drawImage(renderer.canvas, 0, sourceTop * scale, sourceWidth, height * scale,
            0, top, width, height);
        context.restore();
    }

    for(const { evaluation, left, top } of evaluations) {
        drawPipEvaluation(context, evaluation, left, top, barWidth, bottom - top);
    }
}

function composePanels() {
    if(!canvas || !video) return;

    const visible = visibleRenderers();
    // Keep the previous layout until every shared capture matches its current
    // target, both at startup and when profiles finish refreshing out of order.
    if(visible.some(panel => panel.renderer.waitingForBoard)) return;

    const panels = visible.filter(panel => panel.renderer.ready);
    if(!panels.length) return;

    const idle = panels[0] === idleRenderer;
    const groups = idle ? [] : panelGroups(panels);
    let bottom = pipHeaderHeight + pipContentGap;
    const layouts = groups.map(group => {
        const layout = layoutGroup(group, bottom);
        bottom = layout.bottom + pipContentGap;
        return layout;
    });
    const height = idle ? panels[0].renderer.height : bottom;
    const scale = idle && lastLiveLayout ? lastLiveLayout.scale
        : Math.max(...panels.map(panel => panel.renderer.canvas.width / panelWidth));
    const width = Math.max(1, Math.round(panelWidth * scale));
    const pixelHeight = Math.max(1, Math.round(height * scale));

    if(!idle) rememberLayout(height, scale);

    if(canvas.width !== width || canvas.height !== pixelHeight) {
        canvas.width = width;
        canvas.height = pixelHeight;
    }

    video.width = panelWidth / 2;
    video.height = height / 2;

    const context = canvas.getContext('2d');
    context.setTransform(width / panelWidth, 0, 0, pixelHeight / height, 0, 0);
    context.fillStyle = pipContentBackground;
    context.fillRect(0, 0, panelWidth, height);

    if(idle) {
        context.drawImage(panels[0].renderer.canvas, 0, 0, panelWidth, height);
    } else {
        context.fillStyle = pipHeaderBackground;
        context.fillRect(0, 0, panelWidth, pipHeaderHeight);
        context.fillStyle = 'white';
        context.font = '900 26px "Mona Sans", sans-serif';
        context.textBaseline = 'middle';
        context.textAlign = 'left';
        context.strokeStyle = 'white';
        context.lineWidth = 0.5;
        context.lineJoin = 'round';
        context.strokeText('A.C.A.S', 12, pipHeaderHeight / 2);
        context.fillText('A.C.A.S', 12, pipHeaderHeight / 2);

        context.save();
        context.font = '600 16px "Rubik", "IBM Plex Sans", sans-serif';
        context.fillStyle = 'rgba(255, 255, 255, 0.3)';
        context.textAlign = 'right';
        context.fillText(activeInstance?.domain || '', panelWidth - 12, pipHeaderHeight / 2, panelWidth - 150);
        context.restore();

        layouts.forEach(layout => drawGroup(context, layout));
    }

    // One gentle, full-width divider for both live and waiting-screen headers.
    context.fillStyle = mainHeaderBorderColor;
    context.fillRect(0, pipHeaderHeight - 1, panelWidth, 1);

    // Resize the captured canvas, not the video source. Replacing srcObject can
    // exit native PiP when an instance arrives or the profile layout changes.
    if(!video.srcObject) video.srcObject = canvas.captureStream();
}

function makePanel(instance, profile, settings) {
    const name = profile === 'default'
        ? FULL_TRANS_OBJ?.domTranslations?.['.tab-item[data-value="default"] p'] || 'Default Profile'
        : GET_HUMAN_READABLE_PROFILE_NAME(profile);
    const renderer = createPipRenderer(instance, profile, settings, scheduleComposition);
    if(!instance && lastLiveLayout) renderer.setIdleHeight(lastLiveLayout.height);
    renderer.update({ ...pipData, ...instance?.pV[profile]?.pipData });
    renderer.update({ idle: !instance });
    if(instance) renderer.updateHints(instance, profile);
    return { name, profile, settings, renderer };
}

async function refreshPanels(force = false) {
    if(!video) return;
    await Promise.all(visibleRenderers().filter(panel => force || !panel.renderer.ready || panel.renderer.waitingForBoard).map(panel =>
        panel.renderer.refresh().catch(error => console.warn(`[PiP] Could not render ${panel.name}:`, error))));
    composePanels();
}

export async function syncPictureInPicture() {
    const revision = ++syncRevision;
    const instances = liveInstances();
    const scopes = instances.length ? instances : [null];
    const profilesByInstance = await Promise.all(scopes.map(async instance => ({
        instance,
        profiles: (await GET_PROFILES(instance?.instanceID ?? null)).filter(Boolean)
    })));

    if(revision !== syncRevision) return;

    for(const [instance, panels] of renderers) {
        if(instances.includes(instance)) continue;
        panels.forEach(panel => panel.renderer.destroy());
        renderers.delete(instance);
    }

    for(const { instance, profiles } of profilesByInstance) {
        if(!instance) {
            const enabled = profiles.filter(profile => profile.config.engineEnabled !== false && profile.config.pip !== false);
            idleEnabled = enabled.length > 0;
            const profile = enabled[0];
            if(profile && idleRenderer?.profile === profile.name) {
                idleRenderer.settings = profile.config;
                idleRenderer.renderer.setSettings(profile.config);
            } else if(profile) {
                idleRenderer?.renderer.destroy();
                idleRenderer = makePanel(null, profile.name, profile.config);
            } else {
                idleRenderer?.renderer.destroy();
                idleRenderer = null;
            }
            continue;
        }

        const panels = profileRenderers(instance);
        renderers.set(instance, panels);
        const enabled = new Set();

        for(const profile of profiles) {
            const variables = instance.pV[profile.name];
            if(variables) {
                for(const key of pipSettingKeys) variables[key] = profile.config[key];
            }
            if(profile.config.engineEnabled === false || profile.config.pip === false) continue;
            enabled.add(profile.name);

            const panel = panels.get(profile.name);
            if(panel) {
                panel.settings = profile.config;
                panel.renderer.setSettings(profile.config);
            }
            else panels.set(profile.name, makePanel(instance, profile.name, profile.config));
        }

        for(const [profile, panel] of panels) {
            if(enabled.has(profile)) continue;
            panel.renderer.destroy();
            panels.delete(profile);
        }

        // Map insertion order must follow the saved profile order after a drag,
        // without destroying captures or restarting existing renderers.
        renderers.set(instance, new Map(profiles
            .filter(profile => panels.has(profile.name))
            .map(profile => [profile.name, panels.get(profile.name)])));
    }

    if(instances.length) {
        idleRenderer?.renderer.destroy();
        idleRenderer = null;
    }

    if(!visibleRenderers().length) {
        if(video && document.pictureInPictureElement === video) {
            await document.exitPictureInPicture().catch(console.error);
        }
        if(revision !== syncRevision) return;
        video?.pause();
        video?.srcObject?.getTracks().forEach(track => track.stop());
        if(video) video.srcObject = null;
        needsOpening = false;
        clearInteractionHandler();
        initMediaSession();
        return;
    }

    if(!video || (video.paused && !starting)) await startPictureInPicture();
    else await refreshPanels();
}

export function updatePipData(data, instance, profile) {
    if(instance && profile) {
        const variables = instance.pV[profile];
        if(!variables) return;
        Object.assign(variables.pipData ??= {}, data);
        profileRenderers(instance).get(profile)?.renderer.update(data);
        return;
    }

    if(instance) {
        Object.values(instance.pV).forEach(variables => Object.assign(variables.pipData ??= {}, data));
        profileRenderers(instance).forEach(panel => panel.renderer.update(data));
    } else {
        Object.assign(pipData, data);
        renderers.forEach(panels => panels.forEach(panel => panel.renderer.update(data)));
        idleRenderer?.renderer.update(data);
    }
}

export function updatePipHints(instance, profile, result) {
    const variables = instance.pV[profile];
    if(result && variables && !instance.instanceClosed) {
        const previous = variables.pipHints;
        const messages = TRANS_OBJ?.moveFeedback?.[`${result.terminalOutcome}Messages`];
        variables.pipHints = {
            ...result,
            fen: variables.learningMode ? instance.displayFen : instance.currentFen,
            terminalMessageIndex: previous?.fen === instance.currentFen && previous.terminalOutcome === result.terminalOutcome
                ? previous.terminalMessageIndex : Math.floor(Math.random() * (messages?.length || 1))
        };
        if(profileRenderers(instance).has(profile)) {
            const changedInstance = activeInstance !== instance;
            activeInstance = instance;
            if(changedInstance) refreshPanels().catch(console.error);
        }
    }

    if(instance.instanceClosed) {
        profileRenderers(instance).forEach(panel => panel.renderer.destroy());
        renderers.delete(instance);
        if(activeInstance === instance) activeInstance = null;
        syncPictureInPicture().catch(console.error);
        return;
    }

    profileRenderers(instance).forEach((panel, name) => panel.renderer.updateHints(instance, name));
}

export function resetPipHints(instance) {
    Object.values(instance.pV).forEach(variables => { delete variables.pipHints; });
    profileRenderers(instance).forEach(panel => panel.renderer.resetHints(instance));
    syncPictureInPicture().catch(console.error);
}

export function updatePipFeedback(instance) {
    if(instance.instanceClosed) return;
    profileRenderers(instance).forEach(panel => panel.renderer.updateFeedback(instance));
}

export function updatePipOpening(instance) {
    profileRenderers(instance).forEach(panel => panel.renderer.updateOpening(instance));
}

export function updatePipEvaluation(instance) {
    profileRenderers(instance).forEach(panel => panel.renderer.updateEvaluation(instance));
}

function clearInteractionHandler() {
    if(!interactionHandler) return;
    document.removeEventListener('click', interactionHandler);
    document.removeEventListener('keydown', interactionHandler);
    interactionHandler = null;
}

export async function startPictureInPicture() {
    if(starting || !visibleRenderers().length) return;
    starting = true;
    needsOpening = true;

    if(!video) {
        canvas = document.createElement('canvas');
        video = document.createElement('video');
        video.muted = true;
        video.addEventListener('enterpictureinpicture', stopMediaSession);
        video.addEventListener('leavepictureinpicture', initMediaSession);
        floatingPanelVideoElem.replaceChildren(video);
    }

    try {
        await refreshPanels();
        if(!visibleRenderers().length) return;
        if(!video.srcObject) return;
        await video.play();
        if(!visibleRenderers().length) return;
        if(document.pictureInPictureEnabled && video.requestPictureInPicture) {
            if(document.pictureInPictureElement !== video) await video.requestPictureInPicture();
        } else {
            if(!floatingFloaty.open) floatingFloaty.showModal();
            initMediaSession();
        }
        needsOpening = false;
        clearInteractionHandler();
    } catch(error) {
        needsOpening = false;
        initMediaSession();
        if(error.name === 'NotAllowedError' && !interactionHandler) {
            interactionHandler = () => {
                clearInteractionHandler();
                startPictureInPicture().catch(console.error);
            };
            document.addEventListener('click', interactionHandler);
            document.addEventListener('keydown', interactionHandler);
        } else if(error.name !== 'AbortError') {
            console.error('[PiP] Could not open the floating panel:', error);
        }
    } finally {
        starting = false;
    }
}

window.REFRESH_PIP_DISPLAY = () => syncPictureInPicture()
    .then(() => refreshPanels(true)).catch(console.error);
window.CAPTURE_BOARD_IMAGE = captureBoardImage;
document.addEventListener('acas-translations-updated', () => {
    renderers.forEach(panels => panels.forEach(panel => {
        if(panel.profile === 'default') {
            panel.name = FULL_TRANS_OBJ?.domTranslations?.['.tab-item[data-value="default"] p'] || 'Default Profile';
        }
    }));
    refreshPanels(true).catch(console.error);
});
document.addEventListener('acas-settings-updated', () => syncPictureInPicture().catch(console.error));