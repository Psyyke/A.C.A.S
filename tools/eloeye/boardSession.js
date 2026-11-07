import { Chessground } from '../../assets/libraries/chessgroundx/chessground.js';
import { Chess } from '../../app/assets/engines/libraries/chessjs/chess.js';
import { channelName, heartbeatMs, revealedHints, TimeoutError } from './sessionProtocol.js';

export { TimeoutError, placementOf } from './sessionProtocol.js';

export class BoardSession {
    constructor(container, { orientation = 'w' } = {}) {
        this.id = crypto.randomUUID();
        this.client = crypto.randomUUID();
        this.statuses = new Set(['board']);
        this.hints = null;
        this.analysis = null;
        this.moves = [];
        this.watchers = new Set();
        this.markings = new Map();
        this.revision = 0;
        this.history = [];
        this.orientation = orientation;
        this.element = document.createElement('div');
        this.element.className = 'board-session staunty';
        this.element.dataset.sessionId = this.id;
        this.element.setAttribute('aria-label', 'EloEye chess board');
        const boardElement = document.createElement('div');
        boardElement.className = 'cg-wrap';
        this.element.append(boardElement);
        container.append(this.element);
        this.board = Chessground(boardElement, {
            coordinates: false, orientation: orientation === 'b' ? 'black' : 'white',
            animation: { enabled: false }, premovable: { enabled: false },
            drawable: { enabled: false, eraseOnClick: false },
            movable: { free: false, color: undefined, dests: new Map(),
                events: { after: (from, to) => { this.moves.push([from, to]); this.notify(); } } }
        });
        this.channel = new BroadcastChannel(channelName);
        this.channel.onmessage = event => this.receive(event.data);
        this.timer = setInterval(() => {
            if(this.gui && Date.now() - this.lastReply > heartbeatMs * 3) {
                this.gui = null;
                this.statuses.delete('connected');
                this.markings.clear();
                this.hints = null;
                this.board.setAutoShapes([]);
            }
            this.sync();
        }, heartbeatMs);
        this.onHide = () => { this.destroy(); };
        window.addEventListener('pagehide', this.onHide);
    }

    notify() {
        for(const check of [...this.watchers]) check();
    }

    post(type, data = {}) {
        this.channel.postMessage({ type, session: this.id, client: this.client, gui: this.gui, ...data });
    }

    sync() {
        if(!this.state || this.destroyed) return;
        if(!this.gui) this.post('discover');
        else this.post('sync', { state: this.state });
    }

    receive(message) {
        if(message?.session !== this.id || message.client !== this.client ||
            typeof message.gui !== 'string' || (this.gui && this.gui !== message.gui)) return;
        if(this.destroyed) {
            if(message.type === 'closed') this.finishClose?.();
            return;
        }
        if(message.type === 'available' && !this.gui) {
            this.gui = message.gui;
            this.lastReply = Date.now();
            this.sync();
            return;
        }
        if(!this.gui) return;
        if(message.type === 'connected') {
            this.lastReply = Date.now();
            this.statuses.add('connected');
        } else if(message.type === 'error') {
            this.error = new Error(message.message);
        } else if(message.type === 'markings') {
            if(!this.gui || message.revision !== this.revision || message.fen !== this.position.fen ||
                !Array.isArray(message.entries)) return;
            const profiles = new Map();
            for(const entry of message.entries) {
                if(entry?.category !== 'move' || typeof entry.profileID !== 'string') continue;
                const list = profiles.get(entry.profileID) || [];
                list.push(entry);
                profiles.set(entry.profileID, list);
            }
            for(const [profile, entries] of profiles) this.markings.set(profile, entries);
            this.updateHints();
        } else if(message.type === 'analysis') {
            if(message.revision !== this.revision || message.fen !== this.position.fen ||
                !Array.isArray(message.profiles) || !Array.isArray(message.completed)) return;
            this.analysis = { profiles: message.profiles, completed: message.completed };
            this.updateHints();
        } else if(message.type === 'concealment') {
            this.concealed = message.concealed;
            this.updateHints();
        }
        this.notify();
    }

    updateHints() {
        const markings = this.concealed ? [] : [...this.markings]
            .filter(([profile]) => !this.analysis || this.analysis.profiles.includes(profile))
            .flatMap(([, entries]) => entries);
        this.hints = { fen: this.position.fen, ...revealedHints(markings) };
        const own = markings.filter(marking => marking.category === 'move' && !marking.isOpponent && !marking.isFuture);
        this.board.setAutoShapes(own.flatMap(marking => {
            if(marking.shapeType === 'arrow') return [{ orig: marking.from, dest: marking.to, brush: 'green' }];
            if(typeof marking.shapeSquare === 'string') return [{ orig: marking.shapeSquare, brush: 'green' }];
            return [];
        }));
    }

    get profilesReady() {
        return Boolean(this.analysis && this.analysis.profiles.every(profile => this.analysis.completed.includes(profile)));
    }

    setPosition({ fen, turn, lastMove = null, movable = false, dests = {} }) {
        if(this.destroyed) throw new Error('EloEye board session is closed');
        const chess = new Chess();
        if(!chess.load(fen) || chess.turn() !== turn) throw new Error('Invalid EloEye position or turn');
        const changed = this.position?.fen !== fen;
        if(changed) {
            let move = null;
            if(this.position) {
                const previous = new Chess(this.position.fen);
                move = previous.moves({ verbose: true }).find(candidate => {
                    if(lastMove && (candidate.from !== lastMove[0] || candidate.to !== lastMove[1])) return false;
                    previous.move(candidate);
                    const matches = previous.fen() === fen;
                    previous.undo();
                    return matches;
                });
                if(!move) throw new Error('EloEye position is not a legal continuation of this session');
            }
            const now = Date.now();
            const opponentMoveTime = this.position?.turn !== this.orientation && this.observedAt
                ? Math.max(1, now - this.observedAt) : null;
            this.observedAt = now;
            this.history.push([fen, move?.from || null, move?.to || null, move?.promotion || null, opponentMoveTime]);
            this.position = { fen, turn };
            this.revision++;
            this.state = [1, this.revision, this.orientation, this.orientation, turn, fen, this.history];
            this.hints = null;
            this.analysis = null;
            this.markings.clear();
            this.board.setAutoShapes([]);
        }
        this.moves.length = 0;
        this.board.set({
            fen, lastMove: lastMove || undefined, turnColor: turn === 'b' ? 'black' : 'white',
            movable: { color: movable ? (turn === 'b' ? 'black' : 'white') : undefined,
                dests: new Map(Object.entries(dests)) }
        });
        this.sync();
    }

    waitFor(predicate, { timeout = 30000, signal, what = 'board' } = {}) {
        return new Promise((resolve, reject) => {
            let timer;
            const finish = (error, value) => {
                clearTimeout(timer);
                this.watchers.delete(check);
                signal?.removeEventListener('abort', onAbort);
                if(error) reject(error);
                else resolve(value);
            };
            const onAbort = () => finish(signal.reason ?? new DOMException('Stopped', 'AbortError'));
            const check = () => {
                if(this.error) return finish(this.error);
                try {
                    const value = predicate();
                    if(value) finish(null, value);
                } catch(error) { finish(error); }
            };
            if(signal?.aborted) return onAbort();
            signal?.addEventListener('abort', onAbort, { once: true });
            timer = setTimeout(() => finish(new TimeoutError(what)), timeout);
            this.watchers.add(check);
            check();
        });
    }

    whenReady() {
        return Promise.resolve(true);
    }

    destroy() {
        if(this.destroyed) return this.destroyed;
        clearInterval(this.timer);
        window.removeEventListener('pagehide', this.onHide);
        this.error = new DOMException('Board closed', 'AbortError');
        this.notify();
        this.watchers.clear();
        this.hints = null;
        this.markings.clear();
        this.moves.length = 0;
        this.board.destroy();
        this.element.remove();
        this.destroyed = new Promise(resolve => {
            const timer = setTimeout(() => this.finishClose(), 1500);
            this.finishClose = () => {
                clearTimeout(timer);
                this.channel.close();
                this.finishClose = null;
                resolve();
            };
            this.post('close');
        });
        return this.destroyed;
    }
}
