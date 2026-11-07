// Supplies a fake direct GUI session endpoint, without a userscript on EloEye.
// No script is injected into game boards. Real GUI/engine coverage lives in
// eloeye-sessions.test.mjs; this fixture exercises full EloEye runs economically.
export function mockUserscript({ behaviour, delayMs = 50 }) {
    const channel = new BroadcastChannel('acas-eloeye-sessions-v2');
    const sessions = new Map(), retired = new Set();
    window.mockGuiSessions = sessions;
    const load = import('/app/assets/engines/libraries/chessjs/chess.js');
    channel.onmessage = async ({ data }) => {
        if(data?.type === 'gui-status-request') {
            channel.postMessage({ type: 'gui-status', client: data.client, gui: 'mock-gui', manager: 'Tampermonkey' });
            return;
        }
        if(!data || !['discover', 'sync', 'close'].includes(data.type)) return;
        const reply = (type, extra = {}) => channel.postMessage({
            type, session: data.session, client: data.client, gui: 'mock-gui', ...extra
        });
        if(data.type === 'discover') { reply('available'); return; }
        if(data.type === 'close') {
            sessions.delete(data.session);
            retired.add(data.session);
            reply('closed');
            return;
        }
        if(retired.has(data.session)) return;
        let session = sessions.get(data.session);
        if(!session) {
            const number = Number(sessionStorage.getItem('mockFrames') || 0) + 1;
            sessionStorage.setItem('mockFrames', String(number));
            session = { number, firstFen: data.state[5], positions: new Set() };
            sessions.set(data.session, session);
        }
        reply('connected');
        session.fen = data.state[5];
        session.positions.add(data.state[5].split(' ')[0]);
        session.orientation = data.state[3];
        if(data.state[1] === session.revision) return;
        session.revision = data.state[1];
        if(behaviour === 'silent' || (behaviour === 'flaky' && session.number === 3)) return;
        const { Chess } = await load;
        const chess = new Chess(data.state[5]);
        if(chess.turn() !== data.state[2] || chess.game_over()) return;
        const legal = chess.moves({ verbose: true });
        const picks = legal.slice().sort(() => Math.random() - 0.5).slice(0, behaviour === 'multi' ? 3 : 1);
        const entries = picks.map((move, rank) => ({
            category: 'move', profileID: 'test', from: move.from, to: move.to, playerPromotion: move.promotion,
            shapeType: behaviour === 'partial' ? 'rectangle' : 'arrow', shapeSquare: move.from,
            selection: { profile: 'test', rank, best: rank === 0, safe: rank < 2,
                ...(behaviour === 'blunders' ? { category: 'blunder', best: false, safe: false } : {}) }
        }));
        if(behaviour === 'illegal') entries.unshift({
            ...entries[0], from: 'a1', to: 'a8', selection: null
        });
        const announce = entries => {
            if(!retired.has(data.session)) {
                reply('markings', { entries, revision: data.state[1], fen: data.state[5] });
                reply('analysis', { revision: data.state[1], fen: data.state[5], profiles: ['test'], completed: ['test'] });
            }
        };
        if(behaviour === 'unsafe-first') {
            setTimeout(() => announce(entries.map(entry => ({
                ...entry, selection: { ...entry.selection, best: false, safe: false }
            }))), delayMs);
            setTimeout(() => announce(entries), delayMs + 300);
        } else {
            setTimeout(() => announce(entries), delayMs);
            setTimeout(() => announce(entries), delayMs + 150);
        }
    };
}
