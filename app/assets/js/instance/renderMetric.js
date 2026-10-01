import BoardAnalyzer from '../BoardAnalyzer.js';
import PieceEvaluator from '../PieceEvaluator.js';

export default async function renderMetric(fen, profile) {
    if(!this.pV[profile]) return;
    const profileVariables = this.pV[profile];
    // Remove all previous metrics
    const previousMetrics = this.pV[profile].activeMetrics;

    if(previousMetrics.length) {
        previousMetrics.forEach(x => {
            if(x.elem) x.elem.remove();
        });

        this.pV[profile].activeMetrics = [];
    }

    // Get config variables
    const renderSquarePlayer        = await this.getConfigValue(this.configKeys.renderSquarePlayer, profile);
    const renderSquareEnemy         = await this.getConfigValue(this.configKeys.renderSquareEnemy, profile);
    const renderSquareContested     = await this.getConfigValue(this.configKeys.renderSquareContested, profile);
    const renderSquareSafe          = await this.getConfigValue(this.configKeys.renderSquareSafe, profile);
    const renderPiecePlayerCapture  = await this.getConfigValue(this.configKeys.renderPiecePlayerCapture, profile);
    const renderPieceEnemyCapture   = await this.getConfigValue(this.configKeys.renderPieceEnemyCapture, profile);
    const renderOnExternalSite      = await this.getConfigValue(this.configKeys.renderOnExternalSite, profile);
    const enableEveryPieceEvals     = await this.getConfigValue(this.configKeys.enableEveryPieceEvals, profile);
    if(this.pV[profile] !== profileVariables || this.instanceClosed || this.currentFen !== fen) return;
    if(!enableEveryPieceEvals && this.pV[profile]) {
        profileVariables.pieceEvalRequest = (profileVariables.pieceEvalRequest || 0) + 1;
        this.BoardPiecesEval?.cancelStaleRequests();
        this.pV[profile].activePieceEvalDisplays?.forEach(marking => marking.elem?.remove());
        this.pV[profile].activePieceEvalDisplays = [];
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
        enableEveryPieceEvals
    )) {
        return;
    }

    const playerColor = await this.getPlayerColor(profile);
    if(this.pV[profile] !== profileVariables || this.instanceClosed || this.currentFen !== fen) return;
    const addedMetrics = [];

    // Orthodox attack-map rules must not interfere with Fairy contribution analysis.
    const standardMetrics = (!profileVariables.chessVariant || profileVariables.chessVariant === 'chess')
        && !profileVariables.useChess960;
    const hasAttackMetrics = standardMetrics && (renderSquarePlayer || renderSquareEnemy || renderSquareContested
        || renderSquareSafe || renderPiecePlayerCapture || renderPieceEnemyCapture);
    const BoardAnal = hasAttackMetrics ? new BoardAnalyzer(fen, {
        orientation: playerColor,
        debug: this.debugLogsEnabled
    }) : null;

    const BoardDrawer = this.BoardDrawer;

    if(!BoardDrawer) return;

    function fillSquare(pos, style) {
        const shapeType = 'rectangle';
        const shapeSquare = BoardAnal.indexToFen(pos);
        const shapeConfig = { style };

        const rect = BoardDrawer.createShape(
            shapeType,
            shapeSquare,
            shapeConfig
        );

        addedMetrics.push(CREATE_BOARD_DRAWER_MOVE_OBJ(rect, {
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

        const textElem = BoardDrawer.createShape(
            shapeType,
            shapeSquare,
            shapeConfig
        );

        addedMetrics.push(CREATE_BOARD_DRAWER_MOVE_OBJ(textElem, {
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
        fillSquare(pos, `opacity: 0.30; fill: green;`);
    }

    function renderEnemyOnly(pos) {
        fillSquare(pos, `opacity: 0.30; fill: red;`);
    }

    function renderContested(obj) {
        const pos = obj.square;
        const { playerCount, enemyCount } = obj.counts;

        const rating = Math.floor((playerCount + enemyCount) / 2);
        const opacity = Math.min(0.1 + rating / 12, 0.85);

        const squareFen = BoardAnal.indexToFen(pos);
        const countDifference = playerCount - enemyCount;

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

    const analResult = BoardAnal?.analyze();

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

    this.pV[profile].activeMetrics.push(...addedMetrics);

    const addedPieceEvals = await renderPieceEvals.call(
        this,
        fen,
        profile
    );
    if(this.pV[profile] !== profileVariables || this.instanceClosed || this.currentFen !== fen) return;

    if(renderOnExternalSite) {
        const allMetrics = [
            ...addedMetrics,
            ...addedPieceEvals
        ];

        this.CommLink.commands.renderVisualsToSite(FORMAT_MOVE_OBJ_TO_EXTERNAL_SITE(allMetrics));
    }
}


async function renderPieceEvals(fen, profile) {
    if(!fen) return [];
    if(!this.pV[profile]) return [];
    const profileVariables = this.pV[profile];

    const enabled = await this.getConfigValue(
        this.configKeys.enableEveryPieceEvals,
        profile
    );

    if(!enabled || this.pV[profile] !== profileVariables || this.instanceClosed || this.currentFen !== fen) return [];

    profileVariables.pieceEvalRequest = (profileVariables.pieceEvalRequest || 0) + 1;

    const requestId = profileVariables.pieceEvalRequest;

    const isStale = () =>
        requestId !== profileVariables.pieceEvalRequest || this.pV[profile] !== profileVariables
        || this.instanceClosed || this.currentFen !== fen;

    if(isStale()) return [];

    if(this.BoardPiecesEval) {
        this.BoardPiecesEval.cancel();
    }

    const clearDisplay = () => {
        this.pV[profile].activePieceEvalDisplays ??= [];

        this.pV[profile].activePieceEvalDisplays.forEach(x => {
            if(x.elem) x.elem.remove();
        });

        this.pV[profile].activePieceEvalDisplays = [];
    };

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

            clearDisplay();

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

                const elem = BoardDrawer.createShape(
                    shapeType,
                    shapeSquare,
                    shapeConfig
                );

                addedDisplays.push(CREATE_BOARD_DRAWER_MOVE_OBJ(elem, {
                    shapeType,
                    shapeSquare,
                    shapeConfig
                }, profile, 'metric'));
            }

            this.pV[profile].activePieceEvalDisplays.push(
                ...addedDisplays
            );

            resolve(addedDisplays);
        }, { fen, chessVariant: profileVariables.chessVariant || this.activeVariant,
            useChess960: profileVariables.useChess960, isCurrent: () => !isStale() })
            .catch(error => {
                console.warn('[PieceEvaluator] Could not render contributions:', error);
                resolve([]);
            });
    });
}