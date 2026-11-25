import BoardAnalyzer from '../BoardAnalyzer.js';
import PieceEvaluator from '../PieceEvaluator.js';
import { removeMetricShapes, reconcileMetricShapes } from './metricShapes.js';

const analysisCache = new Map();
const metricKeys = ['renderSquarePlayer', 'renderSquareEnemy', 'renderSquareContested', 'renderSquareSafe',
    'renderSquareAsDots', 'renderPiecePlayerCapture', 'renderPieceEnemyCapture', 'renderPieceLongRange',
    'renderPieceLongRangeStraight', 'renderKnightVision', 'renderVisionSide', 'renderOnExternalSite',
    'enableEveryPieceEvals'];

function getAnalysis(fen, config) {
    if(config.debug) {
        const analyzer = new BoardAnalyzer(fen, config);
        return { analyzer, result: analyzer.analyze() };
    }
    const key = JSON.stringify([fen, config.orientation, config.chessVariant, config.useChess960, config.analyzeCaptures]);
    if(analysisCache.has(key)) {
        const entry = analysisCache.get(key);
        analysisCache.delete(key);
        analysisCache.set(key, entry);
        return entry;
    }
    const analyzer = new BoardAnalyzer(fen, config);
    const entry = { analyzer, result: analyzer.analyze() };
    analysisCache.set(key, entry);
    if(analysisCache.size > 32) analysisCache.delete(analysisCache.keys().next().value);
    return entry;
}

export default async function renderMetric(fen, profile, externalOnly = false) {
    if(!this.pV[profile]) return;
    const profileVariables = this.pV[profile];
    if(!externalOnly && this.learningMode) fen = this.displayFen;
    const liveFen = this.currentFen;
    const matchesPosition = () => this.currentFen === liveFen
        && (externalOnly ? this.currentFen : this.learningMode ? this.displayFen : this.currentFen) === fen;
    if(!matchesPosition()) return;
    const revisionKey = externalOnly ? 'externalMetricRevision' : 'metricRevision';
    const revision = profileVariables[revisionKey] = (profileVariables[revisionKey] || 0) + 1;
    const isCurrentPosition = () => profileVariables[revisionKey] === revision && matchesPosition();
    // Reuse the renderer without drawing live metrics over the review board.
    if(!externalOnly && this.learningMode && (fen !== liveFen || !this.learningReviewFen))
        renderMetric.call(this, liveFen, profile, true).catch(console.error);
    if(!externalOnly && this.learningMode && !this.learningReviewFen) {
        removeMetricShapes(this.BoardDrawer, profileVariables.activeMetrics);
        profileVariables.activeMetrics = [];
        removeMetricShapes(this.BoardDrawer, profileVariables.activePieceEvalDisplays);
        profileVariables.activePieceEvalDisplays = [];
        return;
    }

    const keys = metricKeys.map(key => this.configKeys[key]);
    const settings = this.getConfigValues
        ? await this.getConfigValues(keys, profile)
        : Object.fromEntries(await Promise.all(keys.map(async key => [key, await this.getConfigValue(key, profile)])));
    const value = key => settings[this.configKeys[key]];
    const renderSquarePlayer = value('renderSquarePlayer'), renderSquareEnemy = value('renderSquareEnemy');
    const renderSquareContested = value('renderSquareContested'), renderSquareSafe = value('renderSquareSafe');
    const renderSquareAsDots = value('renderSquareAsDots');
    const renderPiecePlayerCapture = value('renderPiecePlayerCapture'), renderPieceEnemyCapture = value('renderPieceEnemyCapture');
    const renderPieceLongRange = value('renderPieceLongRange'), renderPieceLongRangeStraight = value('renderPieceLongRangeStraight');
    const renderKnightVision = value('renderKnightVision');
    const renderVisionSide = value('renderVisionSide') || 'both';
    const showOwnVision             = renderVisionSide !== 'enemy';
    const showEnemyVision           = renderVisionSide !== 'own';
    const renderOnExternalSite = value('renderOnExternalSite');
    const enableEveryPieceEvals = value('enableEveryPieceEvals');
    if(this.pV[profile] !== profileVariables || this.instanceClosed || !isCurrentPosition()) return;
    const publishMetrics = (markings = []) => {
        if(!externalOnly && this.learningMode && fen !== this.currentFen) return;
        if(!renderOnExternalSite && !profileVariables.metricsDisplayedExternally) return;
        const entries = renderOnExternalSite ? FORMAT_MOVE_OBJ_TO_EXTERNAL_SITE(markings) : [];
        // Empty arrays are ignored by the userscript. Identify the profile/category
        // even when the last vulnerable piece has become safely defended.
        this.CommLink.commands.renderVisualsToSite(entries.length ? entries : [{ profileID: profile, category: 'metric' }]);
        profileVariables.metricsDisplayedExternally = Boolean(renderOnExternalSite && entries.length);
    };
    if(!enableEveryPieceEvals && this.pV[profile]) {
        profileVariables.pieceEvalRequest = (profileVariables.pieceEvalRequest || 0) + 1;
        this.BoardPiecesEval?.cancelStaleRequests();
        if(!externalOnly) {
            removeMetricShapes(this.BoardDrawer, profileVariables.activePieceEvalDisplays);
            profileVariables.activePieceEvalDisplays = [];
        }
    }

    const onlyRenderSquarePlayer = renderSquarePlayer && !(renderSquareEnemy || renderSquareContested);
    const onlyRenderSquareEnemy = renderSquareEnemy && !(renderSquarePlayer || renderSquareContested);

    // If none exist, do not analyze
    if(!(
        renderSquarePlayer ||
        renderSquareEnemy ||
        renderSquareContested ||
        renderSquareSafe ||
        renderPiecePlayerCapture ||
        renderPieceEnemyCapture ||
        renderPieceLongRange ||
        renderPieceLongRangeStraight ||
        renderKnightVision ||
        enableEveryPieceEvals
    )) {
        if(!externalOnly) {
            removeMetricShapes(this.BoardDrawer, profileVariables.activeMetrics);
            profileVariables.activeMetrics = [];
        }
        publishMetrics();
        return;
    }
    if(externalOnly && !renderOnExternalSite) {
        publishMetrics();
        return;
    }

    const playerColor = await this.getPlayerColor(profile);
    if(this.pV[profile] !== profileVariables || this.instanceClosed || !isCurrentPosition()) return;
    const addedMetrics = [];

    const hasAttackMetrics = renderSquarePlayer || renderSquareEnemy || renderSquareContested
        || renderSquareSafe || renderPiecePlayerCapture || renderPieceEnemyCapture
        || renderPieceLongRange || renderPieceLongRangeStraight || renderKnightVision;
    const analysis = hasAttackMetrics ? getAnalysis(fen, {
        orientation: playerColor,
        chessVariant: profileVariables.chessVariant || this.activeVariant,
        useChess960: profileVariables.useChess960,
        analyzeCaptures: Boolean(renderPiecePlayerCapture || renderPieceEnemyCapture),
        debug: this.debugLogsEnabled
    }) : null;
    const BoardAnal = analysis?.analyzer;

    const BoardDrawer = this.BoardDrawer;

    if(!BoardDrawer) return;

    function fillSquare(pos, style, dotStyle = '') {
        if(renderSquareAsDots) {
            // Use the existing text protocol so external boards need no userscript update.
            addText(BoardAnal.indexToFen(pos), 1.3, '●',
                `${style} opacity: 0.9; font-family: Arial, sans-serif; stroke: rgb(0 0 0 / 65%); stroke-width: 0.06em; paint-order: stroke; ${dotStyle}`,
                [0, 0]);
            return;
        }

        const shapeType = 'rectangle';
        const shapeSquare = BoardAnal.indexToFen(pos);
        const shapeConfig = { style };

        addedMetrics.push(CREATE_BOARD_DRAWER_MOVE_OBJ(null, {
            shapeType,
            shapeSquare,
            shapeConfig
        }, profile, 'metric'));
    }

    function addText(squareFen, size, text, style, position) {
        const shapeType = 'text';
        const shapeSquare = squareFen;
        const shapeConfig = {
            size,
            text,
            style,
            position
        };

        addedMetrics.push(CREATE_BOARD_DRAWER_MOVE_OBJ(null, {
            shapeType,
            shapeSquare,
            shapeConfig
        }, profile, 'metric'));
    }

    function addTextWithBorder(squareFen, size, text, style, position) {
        addText(squareFen, size, text, style, position);

        addText(
            squareFen,
            size + 0.35,
            text,
            `opacity: 0.75; filter: sepia(2) brightness(4);`,
            position
        );
    }

    function renderDanger(piece, emoji) {
        if(piece.captureDanger) {
            const squareFen = BoardAnal.indexToFen(piece.position);

            addTextWithBorder(
                squareFen,
                1.5,
                emoji,
                `opacity: 1;`,
                [0.3, 0.1]
            );
        }
    }

    function renderSafe(pos) {
        fillSquare(pos, `opacity: 0.30; fill: cyan;`);
    }

    function renderPlayerOnly(pos) {
        fillSquare(pos, `opacity: 0.30; fill: ${renderSquareAsDots ? 'lawngreen' : 'green'};`);
    }

    function renderEnemyOnly(pos) {
        fillSquare(pos, `opacity: 0.30; fill: red;`);
    }

    function renderContested(obj) {
        const pos = obj.square;
        const { playerCount, enemyCount } = obj.counts;
        const countDifference = playerCount - enemyCount;
        if(renderSquareAsDots) {
            fillSquare(pos, 'fill: orange;', countDifference < 0 ? 'stroke: red; stroke-width: 0.12em;' : '');
            return;
        }

        const rating = Math.floor((playerCount + enemyCount) / 2);
        const opacity = Math.min(0.1 + rating / 12, 0.85);

        const squareFen = BoardAnal.indexToFen(pos);

        if(countDifference !== 0) {
            addText(
                squareFen,
                0.8,
                `${countDifference >= 0 ? '+' : ''}${countDifference}`,
                `opacity: 1; font-weight: 900;`,
                [-0.8, 0.8]
            );
        }

        for(let i = 0; i < rating; i++) {
            addTextWithBorder(
                squareFen,
                1.5,
                '🔥',
                `opacity: 1;`,
                [-0.8, 0.8 - i / 10]
            );
        }

        fillSquare(
            pos,
            `opacity: ${opacity}; fill: orange;`
        );
    }

    // Faint lines along slider paths, with contested segments alternating by square.
    const LONG_RANGE_MIN_LENGTH = 3;

    const DIAGONALS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    const STRAIGHTS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

    function getRangeLinePosition(from, to) {
        const [fromY, fromX] = from;
        const [toY, toX] = to;

        if(fromY === toY) return { line: `rank:${fromY}`, index: Math.min(fromX, toX) };
        if(fromX === toX) return { line: `file:${fromX}`, index: Math.min(fromY, toY) };
        if((toX - fromX) === (toY - fromY))
            return { line: `diagonal:positive:${fromX - fromY}`, index: Math.min(fromY, toY) };

        return { line: `diagonal:negative:${fromX + fromY}`, index: Math.min(fromY, toY) };
    }

    function collectLongRangeEdges(pieces, side, directions, edges) {
        pieces.forEach(piece => {
            const [y, x] = piece.position;
            const seen = new Set(piece.paths.map(pos => pos.join(',')));

            for(const [dy, dx] of directions) {
                let length = 0;
                while(seen.has(`${y + dy * (length + 1)},${x + dx * (length + 1)}`)) length++;
                if(length < LONG_RANGE_MIN_LENGTH) continue;

                for(let step = 0; step < length; step++) {
                    const first = [y + dy * step, x + dx * step];
                    const second = [y + dy * (step + 1), x + dx * (step + 1)];
                    const [from, to] = first[0] < second[0]
                        || (first[0] === second[0] && first[1] < second[1])
                        ? [first, second] : [second, first];
                    const edgeKey = `${from.join(',')}|${to.join(',')}`;
                    let edge = edges.get(edgeKey);

                    if(!edge) {
                        edge = { from, to, sides: new Set(), ...getRangeLinePosition(from, to) };
                        edges.set(edgeKey, edge);
                    }

                    edge.sides.add(side);
                }
            }
        });
    }

    function drawRangeLine(from, to, color, shared = false) {
        const shapeType = 'arrow';
        const shapeSquare = [BoardAnal.indexToFen(from), BoardAnal.indexToFen(to)];
        const scale = (BoardDrawer.singleSquareSize || 100) / 100;
        const shapeConfig = {
            lineWidth: 0.01, arrowheadWidth: 0.01, arrowheadHeight: 0.01,
            startOffset: shared ? 14 : 0.01,
            style: `fill: ${color}; stroke: ${color}; stroke-width: ${6 * scale}; stroke-linejoin: round; stroke-linecap: round; opacity: ${shared ? 0.75 : 0.3}; pointer-events: none;`
        };
        addedMetrics.push(CREATE_BOARD_DRAWER_MOVE_OBJ(null, {
            shapeType, shapeSquare, shapeConfig
        }, profile, 'metric'));
    }

    function renderLongRange(piecesBySide, directions) {
        const edges = new Map();
        collectLongRangeEdges(piecesBySide.player, 'lime', directions, edges);
        collectLongRangeEdges(piecesBySide.enemy, 'red', directions, edges);

        const soloLines = new Map();

        edges.forEach(edge => {
            if(edge.sides.size === 2) {
                drawRangeLine(edge.from, edge.to, edge.index % 2 === 0 ? 'lime' : 'red', true);
                return;
            }

            const color = edge.sides.has('lime') ? 'lime' : 'red';
            const key = `${edge.line}|${color}`;
            if(!soloLines.has(key)) soloLines.set(key, []);
            soloLines.get(key).push(edge);
        });

        soloLines.forEach(lineEdges => {
            lineEdges.sort((a, b) => a.index - b.index);
            let run = [];

            const drawRun = () => {
                if(!run.length) return;
                drawRangeLine(run[0].from, run[run.length - 1].to,
                    run[0].sides.has('lime') ? 'lime' : 'red');
                run = [];
            };

            lineEdges.forEach(edge => {
                if(run.length && edge.index !== run[run.length - 1].index + 1) drawRun();
                run.push(edge);
            });
            drawRun();
        });
    }

    const analResult = analysis?.result;

    if(analResult && renderPieceLongRange) {
        renderLongRange({
            player: showOwnVision ? analResult.player : [],
            enemy: showEnemyVision ? analResult.enemy : []
        }, DIAGONALS);
    }

    if(analResult && renderPieceLongRangeStraight) {
        renderLongRange({
            player: showOwnVision ? analResult.player : [],
            enemy: showEnemyVision ? analResult.enemy : []
        }, STRAIGHTS);
    }

    if(analResult && renderKnightVision) {
        const renderKnightDirections = (pieces, color) => {
            pieces.filter(piece => /^[nN]$/.test(piece.piece)).forEach(piece => {
                piece.paths.forEach(target => {
                    const shapeType = 'arrow';
                    const shapeSquare = [
                        BoardAnal.indexToFen(piece.position),
                        BoardAnal.indexToFen(target)
                    ];
                    const scale = (BoardDrawer.singleSquareSize || 100) / 100;
                    const arrowheadWidth = 26;
                    const arrowheadHeight = arrowheadWidth * Math.sqrt(3) / 2;
                    const arrowheadShaftLength = 4;
                    const shapeConfig = {
                        lineWidth: 13,
                        arrowheadWidth,
                        arrowheadHeight,
                        startOffset: Math.sqrt(5) * 100 - arrowheadHeight - arrowheadShaftLength,
                        style: `fill: ${color}; stroke: rgb(0 0 0 / 45%); stroke-width: ${3 * scale}; stroke-linejoin: round; stroke-linecap: round; opacity: 0.65; pointer-events: none;`
                    };
                    addedMetrics.push(CREATE_BOARD_DRAWER_MOVE_OBJ(null, {
                        shapeType, shapeSquare, shapeConfig
                    }, profile, 'metric'));
                });
            });
        };

        if(showOwnVision) renderKnightDirections(analResult.player, 'lime');
        if(showEnemyVision) renderKnightDirections(analResult.enemy, 'red');
    }

    if(analResult && renderPiecePlayerCapture) {
        analResult.player.forEach(piece =>
            renderDanger(piece, '💧')
        );
    }

    if(analResult && renderPieceEnemyCapture) {
        analResult.enemy.forEach(piece =>
            renderDanger(piece, '🩸')
        );
    }

    if(analResult && renderSquarePlayer) {
        analResult.squares.playerOnly
            .forEach(pos => renderPlayerOnly(pos));

        if(onlyRenderSquarePlayer) {
            analResult.squares.contested
                .forEach(obj => renderPlayerOnly(obj.square));
        }
    }

    if(analResult && renderSquareEnemy) {
        analResult.squares.enemyOnly
            .forEach(pos => renderEnemyOnly(pos));

        if(onlyRenderSquareEnemy) {
            analResult.squares.contested
                .forEach(obj => renderEnemyOnly(obj.square));
        }
    }

    if(analResult && renderSquareContested) {
        analResult.squares.contested
            .forEach(obj => renderContested(obj));
    }

    if(analResult && renderSquareSafe) {
        analResult.squares.safe
            .forEach(pos => renderSafe(pos));
    }

    if(!externalOnly) {
        const previous = profileVariables.activeMetrics || [];
        profileVariables.activeMetrics = reconcileMetricShapes(BoardDrawer, previous, addedMetrics);
        const changed = previous.length !== addedMetrics.length
            || addedMetrics.some((marking, index) => marking.elem !== previous[index]?.elem);
        if(changed && BoardDrawer.usePrepend && BoardDrawer.boardContainerElem) {
            for(const marking of profileVariables.activePieceEvalDisplays || []) {
                if(marking.elem) BoardDrawer.boardContainerElem.prepend(marking.elem);
            }
        }
    }

    publishMetrics(addedMetrics);
    if(!enableEveryPieceEvals) return;
    const addedPieceEvals = await renderPieceEvals.call(this, fen, profile, externalOnly, isCurrentPosition);
    if(this.pV[profile] !== profileVariables || this.instanceClosed || !isCurrentPosition()) return;

    publishMetrics([...addedMetrics, ...addedPieceEvals]);
}


async function renderPieceEvals(fen, profile, externalOnly, isMetricCurrent) {
    if(!fen) return [];
    if(!this.pV[profile]) return [];
    const profileVariables = this.pV[profile];
    const liveFen = this.currentFen;
    const isCurrentPosition = () => this.currentFen === liveFen
        && (externalOnly ? this.currentFen : this.learningMode ? this.displayFen : this.currentFen) === fen;

    if(this.pV[profile] !== profileVariables || this.instanceClosed || !isCurrentPosition() || !isMetricCurrent()) return [];

    const requestKey = externalOnly ? 'externalPieceEvalRequest' : 'pieceEvalRequest';
    const requestId = profileVariables[requestKey] = (profileVariables[requestKey] || 0) + 1;

    const isStale = () =>
        requestId !== profileVariables[requestKey] || this.pV[profile] !== profileVariables
        || this.instanceClosed || !isCurrentPosition() || !isMetricCurrent();

    if(isStale()) return [];

    this.BoardPiecesEval?.cancelStaleRequests();

    if(!this.BoardPiecesEval) {
        this.BoardPiecesEval = new PieceEvaluator(fen);
    }

    this.BoardPiecesEval.fen = fen;

    return await new Promise(resolve => {
        this.BoardPiecesEval.eval(values => {
            if(isStale()) {
                resolve([]);
                return;
            }

            if(!this.pV[profile]) {
                resolve([]);
                return;
            }

            const BoardDrawer = this.BoardDrawer;

            if(!BoardDrawer) {
                resolve([]);
                return;
            }

            const addedDisplays = [];

            for(const [square, value] of Object.entries(values)) {
                const val = value.eval;
                const text = Math.abs(val) >= 10 ? val.toFixed(0) : val.toFixed(1);

                const shapeType = 'text';
                const shapeSquare = square;

                const shapeConfig = {
                    size: 1,
                    text,
                    style: 'opacity: 0.5; font-weight: 800;',
                    position: [0.67, 0.8]
                };

                addedDisplays.push(CREATE_BOARD_DRAWER_MOVE_OBJ(null, {
                    shapeType,
                    shapeSquare,
                    shapeConfig
                }, profile, 'metric'));
            }

            if(!externalOnly)
                profileVariables.activePieceEvalDisplays = reconcileMetricShapes(BoardDrawer,
                    profileVariables.activePieceEvalDisplays || [], addedDisplays);

            resolve(addedDisplays);
        }, { fen, chessVariant: profileVariables.chessVariant || this.activeVariant,
            useChess960: profileVariables.useChess960, variantText: profileVariables.variantText, isCurrent: () => !isStale() })
            .catch(error => {
                console.warn('[PieceEvaluator] Could not render contributions:', error);
                resolve([]);
            });
    });
}