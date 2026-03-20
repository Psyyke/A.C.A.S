import { acasInstanceContainer, settingsContainerElem } from '../gui/elementDeclarations.js';
import { incrementUserUsageStat } from '../gui/stats.js';

export default async function setupEnvironment(startpos, dimensions) {
    if(this.environmentSetupRun)
        return;

    this.environmentSetupRun = true;

    try {
        let variant = 'chess';
        let warnedAboutOnlyOwnTurn = false;

        for(const profileName of Object.keys(this.pV)) {
            const profileVariant = FORMAT_VARIANT(this.pV[profileName].chessVariant);

            if(profileVariant !== 'chess')
                variant = profileVariant;

            const onlyCalculateOwnTurn = await this.getConfigValue(this.configKeys.onlyCalculateOwnTurn, profileName);

            if(!warnedAboutOnlyOwnTurn && variant != 'chess' && onlyCalculateOwnTurn) {
                const msg = TRANS_OBJ?.ownTurnMightNotWorkVariants ?? "'Only Own Turn' setting might not work for variants!"
                toast.warning(`${msg} (todo)`, 5000);

                warnedAboutOnlyOwnTurn = true;
            }
        }

        let variantText = variant;
        let chessFont = FORMAT_CHESS_FONT(await this.getConfigValue(this.configKeys.chessFont));

        const formattedChessVariant = FORMAT_VARIANT(variant);
        const shouldSwitchFont = chessFont === 'staunty' && ![
            // Chess variants which don't have special pieces
            "chess", "crazyhouse", "chess960", 
            "kingofthehill", "threecheck", "3check", 
            "antichess", "atomic", "horde", 
            "racingkings", "bughouse", "doublechess",
            "loserschess", "capablanca", "shatranj", 
            "kingscourt", "reversechess", "crazychess", 
            "normal", "fischerandom", "losers", 
            "shako", "knightmate", "perfect"
        ].includes(formattedChessVariant);

        if(shouldSwitchFont)
            chessFont = 'merida';

        this.variantStartPosFen = startpos;

        const currentFen = await USERSCRIPT.instanceVars.fen.get(this.instanceID);
        const fen = currentFen || this.variantStartPosFen;

        const orientation = await this.getPlayerColor();

        const boardDimensions = { 'width': dimensions[0], 'height': dimensions[1] };
        const instanceIdQuery = `[data-instance-id="${this.instanceID}"]`;

        this.currentFen = fen;

        if(this.debugLogsEnabled) console.log(`Variant: "${variantText}"\n\nFen: "${fen}"\n\nDimension: "${boardDimensions.width}x${boardDimensions.height}"`);

        const boardPieceDimensions = GET_PIECE_STYLE_DIMENSIONS(boardDimensions);
        const backgroundSize = GET_BACKGROUND_STYLE_DIMENSION(boardDimensions);

        const oldInstanceElem = this.instanceElem ? this.instanceElem : null;

        const instanceWidth = `${Number(localStorage.getItem(INSTANCE_SIZE_KEY)) * Number(localStorage.getItem(BOARD_SIZE_MODIFIER_KEY))}px`;

        // To avoid XSS do not put data from external sites directly inside the innerHTML string using templates!
        // InstanceIdQuery, boardPieceDimensions and such are safe since they don't contain external data.
        const acasInstanceElem = document.createElement('div');
            acasInstanceElem.classList.add('acas-instance');
            acasInstanceElem.dataset.instanceId = this.instanceID;
            acasInstanceElem.innerHTML = `
            <div class="highlight-indicator hidden"></div>
            <div class="connection-warning hidden">
                <div class="connection-warning-title">${TRANS_OBJ?.losingConnection ?? 'Losing connection'}</div>
                <div class="connection-warning-subtitle">${TRANS_OBJ?.revisitReconnect ?? 'Revisit the page to reconnect'} 👁️</div>
            </div>
            <div class="instance-header">
                <style class="instance-styling">
                ${instanceIdQuery} .cg-wrap piece {
                    width: ${boardPieceDimensions.width}%;
                    height: ${boardPieceDimensions.height}%;
                }
                ${instanceIdQuery} cg-board square {
                    width: ${boardPieceDimensions.width}%;
                    height: ${boardPieceDimensions.height}%;
                }
                ${instanceIdQuery} cg-board {
                    background-size: ${backgroundSize}%;
                }
                </style>
                <div class="instance-basic-info">
                    <div class="instance-basic-info-title">
                        <div class="instance-variant" title="${TRANS_OBJ?.instanceVariant ?? 'Instance Chess Variant'}"></div>
                        <div class="instance-additional-info"></div>
                    </div>
                    <div class="instance-domain" title="${TRANS_OBJ?.instanceDomain ?? 'Instance Domain'}"></div>
                    <div class="instance-fen-container">
                        <div class="instance-fen-btn acas-fancy-button">${TRANS_OBJ?.showFenBtn ?? 'Show FEN'}</div>
                        <div class="instance-fen hidden" title="${TRANS_OBJ?.instanceFen ?? 'Instance Fen'}"></div>
                    </div>
                </div>
                <div class="instance-misc">
                    <div class="instance-settings-btn ${IS_INSTANCE_SETTING_BTN_DISABLED ? 'disabled' : ''} acas-fancy-button" title="${TRANS_OBJ?.openInstanceSettingsBtn ?? 'Open Instance Settings'}">⚙️</div>
                    <div class="instance-info-text"></div>
                </div>
            </div>
            <div class="chessboard-components">
                <div class="eval-bar">
                    <div class="eval-fill"></div>
                </div>
                <div class="chessground-x"></div>
            </div>
            <div class="gas-container" style="display:${window?.SharedArrayBuffer ? 'none' : 'none'};">
                <div class="gas" style="width:${instanceWidth};">
                    <ins class="adsbygoogle"
                    style="display:block"
                    data-ad-client="ca-pub-7248123202489335"
                    data-ad-slot="4278138469"
                    data-ad-format="auto"
                    data-full-width-responsive="true"></ins>
                </div>
            </div>
            <div><div class="pseudoground-x"></div></div>
            `;

        acasInstanceElem.style.width = instanceWidth;

        const instanceChessVariantElem = acasInstanceElem.querySelector('.instance-variant');
        const instanceDomainElem = acasInstanceElem.querySelector('.instance-domain');
        const instanceFenElem = acasInstanceElem.querySelector('.instance-fen');
        const showFenBtn = acasInstanceElem.querySelector('.instance-fen-btn');
        const chessboardComponentsElem = acasInstanceElem.querySelector('.chessboard-components');

        showFenBtn.onclick = function() {
            instanceFenElem.classList.toggle('hidden');

            const didHide = [...instanceFenElem.classList].includes('hidden');

            if(didHide) {
                showFenBtn.innerText = TRANS_OBJ?.showFenBtn ?? 'Show FEN';
            } else {
                showFenBtn.innerText = TRANS_OBJ?.hideFenBtn ?? 'Hide FEN';
            }
        }

        this.activeVariant = FORMAT_VARIANT(variantText);
        instanceChessVariantElem.innerText = variantText;
        instanceDomainElem.innerText = this.domain;
        instanceFenElem.innerText = fen;

        this.instanceElem = acasInstanceElem;

        const settingsBtnElem = this.instanceElem.querySelector('.instance-settings-btn');

        settingsBtnElem.onclick = () => {
            document.querySelector(`.dropdown-item[data-instance-id="${this.instanceID}"]`)?.click();
            
            const highlightIndicator = settingsContainerElem.querySelector('.highlight-indicator');

            highlightIndicator.classList.remove('hidden');

            setTimeout(() => highlightIndicator.classList.add('hidden'), 500);
        };

        const chessgroundElem = this.instanceElem.querySelector('.chessground-x');

        chessboardComponentsElem.classList.add(chessFont);
        
        new ResizeObserver(entries => {
            const width = entries[0].target.getBoundingClientRect().width;

            chessgroundElem.style.height = `${GET_BOARD_HEIGHT_FROM_WIDTH(width, boardDimensions)}px`;
        }).observe(chessgroundElem);

        this.chessground = window.ChessgroundX(chessgroundElem, { 
            disableContextMenu: true,
            selectable: { enabled: false }, 
            draggable: { enabled: false }, 
            drawable: { enabled: false, eraseOnClick: false }, 
            animation: { enabled: false },
            dimensions: boardDimensions, 
            orientation,
            fen, 
            variant
        });

        chessgroundElem.addEventListener("touchmove", () => {}, { passive: true });

        const originalCgSet = this.chessground.set;
        this.chessground.set = (...args) => {
            const allChessgroundElems = [...document.querySelectorAll('.chessground-x')];

            allChessgroundElems.forEach(x => x.dataset.isLatestUpdated = false);
            chessgroundElem.dataset.isLatestUpdated = true;

            return originalCgSet.apply(this.chessground, args);
        };

        if(this.BoardDrawer) {
            this?.BoardDrawer?.terminate();
        }

        this.BoardDrawer = new UniversalBoardDrawer(chessgroundElem, {
            'boardDimensions': [boardDimensions.width, boardDimensions.height],
            'zIndex': 500,
            'prepend': true,
            'debugMode': false,
            'parentElem': document.querySelector('#board-drawings'),
            orientation
        });

        this.BoardDrawer.boardContainerElem.dataset.instanceId = this.instanceID;

        this.Interface.updateBoardOrientation(orientation);

        if(oldInstanceElem) {
            acasInstanceContainer.replaceChild(this.instanceElem, oldInstanceElem);

            if(this.debugLogsEnabled) console.log(`Engine and GUI for variant "${variant}" updated!`);
        } else {
            acasInstanceContainer.appendChild(this.instanceElem);

            if(this.debugLogsEnabled) console.log(`Engine and GUI for variant "${variant}" loaded!`);

            this.onLoadCallbackFunction({ 
                'domain': this.domain, 
                'id': this.instanceID,
                'variant': variant,
                'engine': this.engines,
                'chessground': this.chessground,
                'element': this.instanceElem,
                'dimensions': boardDimensions
            });
        }

        this.instanceReady = true;

        if(fen.includes('8/8/8/8/8/8/8/8') && this.domain === 'chess.com') {
            const msg = TRANS_OBJ?.emptyBoardChesscomWarning ?? 'Oh, the board seems to be empty. This is most likely caused by the site displaying the board as an image which A.C.A.S cannot parse.\n\nPlease disable "Piece Animations: Arcade" on Chess.com settings! (Set to "None")';
            toast.error(msg);
        }

        (adsbygoogle = window.adsbygoogle || []).push({});

        this.startInterfacePolling();

        incrementUserUsageStat('createdInstances');
    } catch(e) { 
        console.error(e);
    }
}