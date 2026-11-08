import {
    defaultSelectionWeights, selectHintMove, validateSelectionWeights
} from '../../../../tools/eloeye/hintSelection.js';
import { filterHintMoves, getHintSettings } from '../misc/learningHints.js';
import { moveSelection } from '../misc/moveSelection.js';

export const suggestionMixKeys = ['suggestionMix', 'suggestionMixWeights', 'suggestionMixPreferBook'];

export function readMixWeights(value) {
    return value == null || value === ''
        ? { ...defaultSelectionWeights }
        : validateSelectionWeights(typeof value === 'string' ? JSON.parse(value) : value);
}

const isFullMove = move => !move.playerHidden && move.hintDetail === 'full';
const isConcealed = () => typeof CONCEAL_ASSISTANCE_ACTIVE !== 'undefined' && CONCEAL_ASSISTANCE_ACTIVE;
const moveKey = move => move.playerUci
    || `${move.player[0]}${move.player[1]}${move.playerPromotion || ''}`;

export default class SuggestionMix {
    constructor(instance) {
        this.instance = instance;
        this.enabled = false;
        this.weights = { ...defaultSelectionWeights };
        this.revision = 0;
        this.state = null;
    }

    async configure() {
        const values = await Promise.all(suggestionMixKeys.map(key =>
            this.instance.getConfigValue(key, false)));
        this.enabled = Boolean(values[0]);
        this.weights = readMixWeights(values[1]);
        this.preferBook = Boolean(values[2]);
        this.revision++;
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
        this.revision++;
        if(this.enabled) this.render(true).catch(console.error);
    }

    markDelivered(profile, fen) {
        if(this.selection?.profile === profile && this.selection.fen === fen) {
            this.selection.delivered = true;
        }
    }

    async collect(profile, variables, fen) {
        const hints = await getHintSettings(this.instance, profile);
        const cached = variables.hintCandidates;
        const opacity = await this.instance.getConfigValue('arrowOpacity', profile);
        const raw = cached?.fen === fen && opacity > 1
            ? cached.moves.slice(0, variables.multiPV ?? 0) : [];
        let moves = filterHintMoves(raw, hints, fen, true);
        const best = moves[0];
        const warningOf = move => this.instance.Interface.getMoveWarning(best, move);
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

        const bookMoves = this.preferBook ? await this.instance.getBookMoves(fen, profile) : [];
        const bookCandidates = opacity > 1
            ? filterHintMoves(bookMoves, hints, fen).filter(isFullMove).map((move, rank) => ({
                profile, rank, category: 'best', best: true, safe: true,
                move: [move.from, move.to, move.promotion || null],
                source: {
                    ...move, player: [move.from, move.to], opponent: [null, null],
                    playerPromotion: move.promotion || null
                }
            })) : [];

        return { profile, variables, hints, moves, bookMoves, bookCandidates,
            candidates: candidates.filter(candidate => moves.includes(candidate.source) && isFullMove(candidate.source)) };
    }

    async render(silent = false) {
        if(isConcealed()) return;
        const instance = this.instance;
        const state = this.state;
        const fen = instance.currentFen;
        const revision = ++this.revision;
        const current = () => this.enabled && !instance.instanceClosed
            && !isConcealed() && instance.currentFen === fen && this.revision === revision;
        const profiles = Object.entries(instance.pV).filter(([profile]) => !instance.isLearningProfile(profile));
        const pools = await Promise.all(profiles.map(([profile, variables]) => this.collect(profile, variables, fen)));
        if(!current()) return;

        const waiting = state?.fen === fen && (state.preparing > 0 || pools.some(pool => {
            const partial = /piece|destination/.test(pool.hints.detail);
            const search = state.searches.get(pool.profile);
            return !partial && search && !search.complete;
        }));
        const bookCandidates = pools.flatMap(pool => pool.bookCandidates);
        const usingBook = bookCandidates.length > 0;
        const candidates = usingBook ? bookCandidates : waiting ? [] : pools.flatMap(pool => pool.candidates);
        const available = candidates.map(candidate => ({
            from: candidate.move[0], to: candidate.move[1], promotion: candidate.move[2]
        }));
        // A redraw must not roll again or repeat speech and Auto Move.
        const saved = this.selection;
        const retained = saved?.fen === fen && candidates.find(candidate =>
            `${candidate.profile}|${moveKey(candidate.source)}` === saved.key);
        const weights = usingBook ? { ...defaultSelectionWeights, best: 100, alternative: 0 } : this.weights;
        const selection = retained ? null : selectHintMove(available, candidates, Math.random, weights);
        const chosen = selection?.move && candidates.find(candidate =>
            candidate.move[0] === selection.move.from && candidate.move[1] === selection.move.to
            && candidate.move[2] === selection.move.promotion);
        const selectionKey = chosen ? `${chosen.profile}|${moveKey(chosen.source)}` : null;
        const pick = retained || chosen;
        const repeated = Boolean(retained && saved.delivered);
        this.selection = pick ? {
            fen, profile: pick.profile, key: retained ? saved.key : selectionKey, delivered: repeated
        } : null;

        if(selection?.fallback && !repeated) {
            toast.warning(TRANS_OBJ?.suggestionMixFallback ?? 'No match in the mix. Using another shown move.', 1000);
        }

        // Clear other profiles before publishing the chosen move to Auto Move.
        const ordered = [...pools.filter(pool => pool.profile !== pick?.profile),
            ...pools.filter(pool => pool.profile === pick?.profile)];
        for(const pool of ordered) {
            if(!current() || instance.pV[pool.profile] !== pool.variables) return;
            if(this.preferBook) {
                await instance.Interface.displayBookMoves(pool.bookMoves, pool.profile);
                if(!current()) return;
            }
            const partial = pool.moves.filter(move => !isFullMove(move));
            const moves = pool.profile === pick?.profile
                ? [{ ...pick.source, suggestionMix: true }, ...partial] : partial;
            const withoutReplies = moves.map(move => ({ ...move, opponent: [null, null] }));
            await instance.displayMoves(withoutReplies, pool.profile, false,
                silent || repeated || !pick, false, current);
        }
    }
}
