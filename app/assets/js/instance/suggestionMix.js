import {
    defaultSelectionWeights, selectHintMove, validateSelectionWeights
} from '../../../../tools/eloeye/hintSelection.js';
import { filterHintMoves, getHintSettings } from '../misc/learningHints.js';
import { moveSelection } from '../misc/moveSelection.js';

export const suggestionMixKeys = ['suggestionMixMode', 'suggestionMixShared', 'suggestionMixWeights', 'suggestionMixPreferBook'];

export function readMixWeights(value) {
    return value == null || value === ''
        ? { ...defaultSelectionWeights }
        : validateSelectionWeights(typeof value === 'string' ? JSON.parse(value) : value);
}

const isFullMove = move => !move.playerHidden && move.hintDetail === 'full';
const isConcealed = () => typeof CONCEAL_ASSISTANCE_ACTIVE !== 'undefined' && CONCEAL_ASSISTANCE_ACTIVE;
const moveKey = move => move.playerUci
    || `${move.player[0]}${move.player[1]}${move.playerPromotion || ''}`;

// Choose a book profile first, then apply that profile's move weights.
export function pickBookCandidate(candidates, random = Math.random) {
    const profiles = new Map();
    for(const candidate of candidates) {
        if(!profiles.has(candidate.profile)) profiles.set(candidate.profile, new Map());
        const moves = profiles.get(candidate.profile);
        const key = candidate.move.join('');
        const previous = moves.get(key);
        moves.set(key, {
            candidate: previous?.candidate ?? candidate,
            weight: (previous?.weight ?? 0) + Math.max(0, Number(candidate.source?.weight) || 0)
        });
    }
    if(!profiles.size) return null;
    const profileEntries = [...profiles];
    const [, profileMoves] = profileEntries.length === 1 ? profileEntries[0]
        : profileEntries[Math.floor(random() * profileEntries.length)];
    let entries = [...profileMoves.values()];
    if(!entries.some(entry => entry.weight > 0))
        entries = entries.map(entry => ({ ...entry, weight: 1 }));
    let roll = random() * entries.reduce((sum, entry) => sum + entry.weight, 0);
    return entries.find(entry => (roll -= entry.weight) < 0)?.candidate || entries.at(-1)?.candidate || null;
}

export default class SuggestionMix {
    constructor(instance) {
        this.instance = instance;
        this.enabled = false;
        this.settings = new Map();
        this.selections = new Map();
        this.revision = 0;
        this.configureRevision = 0;
        this.state = null;
    }

    async configure() {
        const revision = ++this.configureRevision;
        const settings = await Promise.all(Object.keys(this.instance.pV).map(async profile => {
            const values = await Promise.all(suggestionMixKeys.map(key =>
                this.instance.getConfigValue(key, profile)));
            const mode = values[0] ?? 'off';
            if(!['off', 'books', 'all'].includes(mode)) throw new Error(`Invalid Funneling mode: ${mode}`);
            return [profile, { mode, shared: Boolean(values[1]),
                weights: readMixWeights(values[2]), preferBook: Boolean(values[3]) }];
        }));
        if(revision !== this.configureRevision || this.instance.instanceClosed) return;
        for(const [profile, setting] of settings) {
            const previous = this.settings.get(profile);
            if(JSON.stringify(previous) !== JSON.stringify(setting)) {
                if(previous) this.selections.delete(this.groupKey(profile, previous));
                this.selections.delete(this.groupKey(profile, setting));
            }
        }
        this.settings = new Map(settings);
        this.enabled = settings.some(([profile, setting]) =>
            setting.mode !== 'off' && !this.instance.isLearningProfile(profile));
        this.revision++;
    }

    groupKey(profile, settings = this.settings.get(profile)) {
        return settings?.shared ? 'shared' : `profile:${profile}`;
    }

    handles(profile) {
        return !this.instance.isLearningProfile(profile) && this.settings.get(profile)?.mode === 'all';
    }

    filtersBooks(profile) {
        const settings = this.settings.get(profile);
        return !this.instance.isLearningProfile(profile)
            && (settings?.mode === 'books' || settings?.mode === 'all');
    }

    sharedProfiles() {
        return [...this.settings].filter(([profile, settings]) =>
            settings.shared && this.handles(profile)).map(([profile]) => profile);
    }

    profilesFor(profile) {
        return this.sharedProfiles().includes(profile) ? this.sharedProfiles() : [profile];
    }

    get selection() {
        return this.selections.get('shared') ?? null;
    }

    set selection(value) {
        if(value) this.selections.set('shared', value);
        else this.selections.delete('shared');
    }

    begin(fen) {
        if(this.state?.fen !== fen) {
            this.state = { fen, preparing: 0, searches: new Map() };
        }
        this.state.preparing++;
        this.revision++;
        return this.state;
    }

    async end(state) {
        state.preparing--;
        if(this.state === state && this.enabled) await this.render();
    }

    started(profile, calculation) {
        if(this.state?.fen !== calculation.fen) return;
        this.state.searches.set(profile, { calculation, complete: false });
        this.revision++;
    }

    async finished(profile, calculation) {
        const search = this.state?.searches.get(profile);
        if(search?.calculation !== calculation) return;
        search.complete = true;
        if(this.enabled) await this.render();
    }

    async failed(profile, calculation) {
        const variables = this.instance.pV[profile];
        if(this.enabled && variables && this.state?.searches.get(profile)?.calculation === calculation) {
            variables.hintCandidates = { fen: calculation.fen, moves: [] };
        }
        await this.finished(profile, calculation);
    }

    remove(profile) {
        this.state?.searches.delete(profile);
        const settings = this.settings.get(profile);
        if(settings) this.selections.delete(this.groupKey(profile, settings));
        this.settings.delete(profile);
        this.revision++;
        if(this.enabled) this.render(true).catch(console.error);
    }

    markDelivered(profile, fen) {
        for(const selection of this.selections.values()) {
            if(selection.profile === profile && selection.fen === fen) selection.delivered = true;
        }
    }

    async collect(profile, variables, fen) {
        const settings = this.settings.get(profile);
        const hints = await getHintSettings(this.instance, profile);
        const onlyTop = await this.instance.getConfigValue('onlyShowTopMoves', profile);
        const cached = variables.hintCandidates;
        const opacity = await this.instance.getConfigValue('arrowOpacity', profile);
        const raw = cached?.fen === fen && opacity > 1
            ? cached.moves.slice(0, variables.multiPV ?? 0) : [];
        let moves = filterHintMoves(raw, hints, fen, true);
        const rawBest = raw[0];
        const best = moves.find(move => move.playerUci && move.playerUci === rawBest?.playerUci)
            || rawBest || moves[0];
        const warningOf = move => rawBest
            ? this.instance.Interface.getMoveWarning(rawBest, move) : null;
        const engine = await this.instance.getEngineName(profile);
        const warnings = await Promise.all(['mistake', 'blunder', 'miss'].map(type =>
            this.instance.getConfigValue(`mark${type[0].toUpperCase()}${type.slice(1)}Moves`, profile)));
        const enabledWarnings = ['mistake', 'blunder', 'miss'].filter((type, index) => warnings[index]);
        const candidates = moves.map((move, rank) => ({
            ...moveSelection(best, move, rank, profile,
                move === best ? null : warningOf(move), isFullMove(move), engine),
            move: [move.player[0], move.player[1], move.playerPromotion || null],
            source: move
        }));

        if(variables.onlyShowWarningMoves) {
            moves = moves.filter(move => move !== best && enabledWarnings.includes(warningOf(move)))
                .slice(0, Math.max(0, variables.suggestionAmount ?? Infinity));
        }

        const ownTurnOnly = await this.instance.getConfigValue('onlyCalculateOwnTurn', profile);
        const bookTurn = await this.instance.getPlayerColor(profile);
        const bookMoves = this.filtersBooks(profile) && (!ownTurnOnly || fen.split(/\s+/)[1] === bookTurn)
            ? await this.instance.getBookMoves(fen, profile) : [];
        const bookOpacity = settings.mode === 'books'
            ? await this.instance.getConfigValue('bookMoveOpacity', profile) : opacity;
        const filteredBookMoves = bookOpacity > 1 ? filterHintMoves(bookMoves, hints, fen) : [];
        const bookCandidates = filteredBookMoves.filter(isFullMove).map((move, rank) => ({
                profile, rank, book: true, category: 'best', best: true, safe: true,
                move: [move.from, move.to, move.promotion || null],
                source: {
                    ...move, profile, player: [move.from, move.to], opponent: [null, null],
                    playerPromotion: move.promotion || null
                }
            }));

        return { profile, variables, settings, hints, onlyTop, moves, bookMoves, filteredBookMoves, bookCandidates,
            candidates: candidates.filter(candidate => moves.includes(candidate.source) && isFullMove(candidate.source)) };
    }

    pickFromPools(pools, booksOnly = false, random = Math.random) {
        const eligible = pools.filter(pool => pool.bookCandidates.length
            || !booksOnly && pool.settings.mode === 'all' && pool.candidates.length);
        if(!eligible.length) return {};
        const pool = eligible.length === 1 ? eligible[0] : eligible[Math.floor(random() * eligible.length)];
        if(pool.bookCandidates.length && (booksOnly || pool.settings.mode === 'books'
            || !pool.candidates.length || random() < 0.5)) {
            return { pick: pickBookCandidate(pool.bookCandidates, random) };
        }
        const available = pool.candidates.map(candidate => ({
            from: candidate.move[0], to: candidate.move[1], promotion: candidate.move[2]
        }));
        const selection = selectHintMove(available, pool.candidates, random, pool.settings.weights);
        const pick = selection.move && pool.candidates.find(candidate =>
            candidate.move[0] === selection.move.from && candidate.move[1] === selection.move.to
            && candidate.move[2] === selection.move.promotion);
        return { pick, fallback: selection.fallback };
    }

    async render(silent = false) {
        if(isConcealed()) return;
        const instance = this.instance;
        const state = this.state;
        const fen = instance.currentFen;
        const revision = ++this.revision;
        const current = () => this.enabled && !instance.instanceClosed
            && !isConcealed() && instance.currentFen === fen && this.revision === revision;
        const profiles = Object.entries(instance.pV).filter(([profile]) =>
            !instance.isLearningProfile(profile) && this.settings.get(profile)?.mode !== 'off'
            && this.settings.has(profile));
        const pools = await Promise.all(profiles.map(([profile, variables]) => this.collect(profile, variables, fen)));
        if(!current()) return;

        const groups = new Map();
        for(const pool of pools) {
            const key = this.groupKey(pool.profile, pool.settings);
            if(!groups.has(key)) groups.set(key, []);
            groups.get(key).push(pool);
        }
        for(const [key, group] of groups) {
            const waiting = group.some(pool => {
                if(!pool.onlyTop) return false;
                if(pool.variables.pendingCalculationRequest?.fen === fen) return true;
                if(state?.fen !== fen) return false;
                if(state.preparing > 0) return true;
                const search = state.searches.get(pool.profile);
                return !/piece|destination/.test(pool.hints.detail) && search && !search.complete;
            });
            const preferBooks = group.some(pool => pool.settings.mode === 'all' && pool.settings.preferBook);
            const bookCandidates = preferBooks ? group.flatMap(pool => pool.bookCandidates) : [];
            const usingBook = bookCandidates.length > 0;
            const candidates = waiting ? [] : usingBook ? bookCandidates
                : group.flatMap(pool => [...(pool.settings.mode === 'all' ? pool.candidates : []), ...pool.bookCandidates]);
            const saved = this.selections.get(key);
            const retained = saved?.fen === fen && candidates.find(candidate =>
                `${candidate.profile}|${moveKey(candidate.source)}` === saved.key
                && Boolean(candidate.book) === saved.book);
            const selection = retained || waiting ? {}
                : this.pickFromPools(group, usingBook);
            const pick = retained || selection.pick;
            const repeated = Boolean(retained && saved.delivered);
            if(pick) this.selections.set(key, {
                fen, profile: pick.profile, key: `${pick.profile}|${moveKey(pick.source)}`,
                book: Boolean(pick.book), delivered: repeated
            });
            else this.selections.delete(key);
            if(selection.fallback && !repeated) {
                toast.warning(TRANS_OBJ?.suggestionMixFallback ?? 'No match in the mix. Using another shown move.', 1000);
            }
            // Clear the other participants before delivering the pooled pick.
            const ordered = [...group.filter(pool => pool.profile !== pick?.profile),
                ...group.filter(pool => pool.profile === pick?.profile)];
            for(const pool of ordered) {
                if(!current() || instance.pV[pool.profile] !== pool.variables) return;
                if(this.filtersBooks(pool.profile)) {
                    const books = pool.settings.mode === 'books'
                        ? [...pool.filteredBookMoves.filter(move => !isFullMove(move)),
                            ...(pool.profile === pick?.profile && pick.book ? [pick.source] : [])]
                        : pool.filteredBookMoves.filter(move => !isFullMove(move));
                    await instance.Interface.displayBookMoves(books, pool.profile, current);
                    if(!current()) return;
                    if(pool.settings.mode === 'books' && pool.profile === pick?.profile)
                        this.markDelivered(pool.profile, fen);
                }
                if(pool.settings.mode !== 'all') continue;
                const partial = pool.moves.filter(move => !isFullMove(move));
                const moves = pool.profile === pick?.profile
                    ? [{ ...pick.source, suggestionMix: true }, ...partial] : partial;
                const withoutReplies = moves.map(move => ({ ...move, opponent: [null, null] }));
                await instance.displayMoves(withoutReplies, pool.profile, false,
                    silent || repeated || !pick, false, current);
            }
        }
    }
}
