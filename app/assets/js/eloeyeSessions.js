import { createInstance } from './instanceManager.js';
import { channelName, sessionExpiryMs } from '../../../tools/eloeye/sessionProtocol.js';
import { Chess } from '../engines/libraries/chessjs/chess.js';

class SessionTransport {
    constructor(session, send) {
        this.session = session;
        this.send = send;
        this.commands = {};
        this.profiles = new Map();
        this.analysisFen = null;
    }

    expectProfiles(fen, profiles) {
        if(this.closed || fen !== this.session.state[5]) return;
        if(this.analysisFen !== fen) {
            this.analysisFen = fen;
            this.profiles.clear();
        }
        const names = profiles.map(profile => profile.name);
        for(const name of this.profiles.keys()) if(!names.includes(name)) this.profiles.delete(name);
        for(const name of names) if(!this.profiles.has(name)) this.profiles.set(name, { complete: false });
        this.publishAnalysis();
    }

    analysisStarted(profile, calculation) {
        if(this.closed || calculation.fen !== this.analysisFen || !this.profiles.has(profile)) return;
        this.profiles.set(profile, { calculation, complete: false });
        this.publishAnalysis();
    }

    analysisFinished(profile, calculation) {
        const status = this.profiles.get(profile);
        if(this.closed || calculation.fen !== this.session.state[5] || status?.calculation !== calculation) return;
        status.complete = true;
        this.publishAnalysis();
    }

    analysisFailed(profile, calculation, message) {
        if(this.closed || calculation.fen !== this.session.state[5]
            || this.profiles.get(profile)?.calculation !== calculation) return;
        this.send('error', { message: `Profile "${profile}" could not finish: ${message}`,
            stopReason: calculation.stopReason });
    }

    publishAnalysis() {
        if(this.analysisFen !== this.session.state[5]) return;
        this.send('analysis', { revision: this.session.state[1], fen: this.analysisFen,
            profiles: [...this.profiles.keys()],
            completed: [...this.profiles].filter(([, status]) => status.complete).map(([name]) => name) });
    }

    registerSendCommand(name) {
        this.commands[name] = async data => {
            if(this.closed) return false;
            const { state } = this.session;
            switch(name) {
                case 'getBoardState': return state;
                case 'getFen': return state[5];
                case 'ping': return true;
                case 'renderVisualsToSite':
                    if(!Array.isArray(data)) return false;
                    const entries = data.filter(entry => entry.category === 'move' && entry.positionFen === state[5]);
                    if(entries.length) this.send('markings', { entries, revision: state[1], fen: state[5] });
                    return true;
                case 'applyAssistanceConcealment':
                    this.send('concealment', { concealed: Boolean(data) });
                    return true;
                case 'updateDynamicContext':
                case 'updateRestartListener':
                case 'updateConcealAssistanceListener': return true;
                default: throw new Error(`Unsupported EloEye session command: ${name}`);
            }
        };
    }

    registerListener(id, handler) {
        this.receiver = handler;
    }

    kill() {
        this.closed = true;
        this.receiver = null;
    }
}

function validState(state) {
    if(!Array.isArray(state) || state[0] !== 1 || !Number.isSafeInteger(state[1]) || state[1] < 1 ||
        !['w', 'b'].includes(state[2]) || !['w', 'b'].includes(state[3]) ||
        !['w', 'b'].includes(state[4]) || typeof state[5] !== 'string' ||
        !Array.isArray(state[6]) || state[6].length < 1 || state[6].length > 10000) return false;
    const chess = new Chess();
    return chess.validate_fen(state[5]).valid && state[5].split(' ')[1] === state[4] &&
        state[6].at(-1)?.[0] === state[5];
}

export function startEloEyeSessions() {
    const channel = new BroadcastChannel(channelName);
    let stopped = false;
    const gui = crypto.randomUUID();
    const sessions = new Map(), retired = new Map();
    const reply = (message, type, data = {}) => channel.postMessage({
        type, session: message.session, client: message.client, gui, ...data
    });
    const close = session => {
        sessions.delete(session.id);
        retired.set(session.id, Date.now());
        session.closed = true;
        session.instance?.close();
        session.transport.kill();
    };

    channel.onmessage = event => {
        const message = event.data;
        if(message?.type === 'gui-status-request' && typeof message.client === 'string' && message.client.length <= 100) {
            Promise.resolve().then(() => USERSCRIPT.getInfo()).then(info => {
                if(stopped) return;
                channel.postMessage({ type: 'gui-status', client: message.client, gui,
                    manager: typeof info?.scriptHandler === 'string' ? info.scriptHandler : '' });
            }).catch(error => {
                console.error('EloEye manager detection failed:', error);
                if(stopped) return;
                channel.postMessage({ type: 'gui-status', client: message.client, gui, manager: '' });
            });
            return;
        }
        if(!message || typeof message.session !== 'string' || typeof message.client !== 'string' ||
            message.session.length > 100 || message.client.length > 100 ||
            (message.gui && message.gui !== gui)) return;
        const existing = sessions.get(message.session);
        if(existing && existing.client !== message.client) return;
        if(message.type === 'discover') {
            reply(message, 'available');
            return;
        }
        if(message.type === 'close') {
            if(existing) close(existing);
            else retired.set(message.session, Date.now());
            reply(message, 'closed');
            return;
        }
        if(message.type !== 'sync' || message.gui !== gui || retired.has(message.session)) return;
        if(!validState(message.state)) {
            reply(message, 'error', { message: 'Invalid EloEye board state' });
            return;
        }
        if(existing) {
            existing.seen = Date.now();
            const entry = window.AcasInstances.find(entry => entry.id === existing.id);
            if(entry) entry.date = existing.seen;
            if(message.state[1] > existing.state[1]) {
                existing.state = message.state;
                Promise.resolve(existing.transport.receiver?.({ command: 'updateBoardFen', data: existing.state }))
                    .catch(error => {
                        console.error('EloEye position update failed:', error);
                        reply(message, 'error', { message: error.message });
                    });
            }
            if(existing.instance && !existing.instance.instanceClosed) reply(message, 'connected');
            else if(existing.instance?.instanceClosed) {
                close(existing);
                reply(message, 'error', { message: 'The A.C.A.S session was closed' });
            }
            return;
        }
        const session = { id: message.session, client: message.client, state: message.state, seen: Date.now() };
        session.transport = new SessionTransport(session, (type, data) => {
            if(!session.closed) reply(message, type, data);
        });
        sessions.set(session.id, session);
        createInstance('EloEye', session.id, 'chess', session.transport).then(instance => {
            session.instance = instance;
            if(session.closed) { instance?.close(); return; }
            if(!instance) {
                close(session);
                reply(message, 'error', { message: 'A.C.A.S could not create the EloEye session' });
                return;
            }
            reply(message, 'connected');
        }).catch(error => {
            console.error('EloEye session creation failed:', error);
            close(session);
            reply(message, 'error', { message: error.message });
        });
    };
    const timer = setInterval(() => {
        const now = Date.now();
        for(const session of sessions.values())
            if(now - session.seen > sessionExpiryMs) close(session);
        for(const [id, time] of retired)
            if(now - time > sessionExpiryMs * 3) retired.delete(id);
    }, 1000);
    const stop = () => {
        stopped = true;
        clearInterval(timer);
        for(const session of sessions.values()) close(session);
        channel.close();
        window.removeEventListener('pagehide', stop);
    };
    window.addEventListener('pagehide', stop);
    return stop;
}
