// Piece colors follow the player's identity, not a flipped board or Reverse Side.
export function initializeHintPieceFilters() {
    const dialog = document.querySelector('#learning-hints-floaty');
    if(!dialog) return;
    let revision = 0;

    const update = async () => {
        const request = ++revision;
        const instanceID = SETTING_FILTER_OBJ.instanceID;
        const instances = window.AcasInstances ?? [];
        const instance = (instanceID ? instances.find(item => item.id === instanceID)
            : instances.find(item => !item.instance.instanceClosed))?.instance;
        const playerColor = await instance?.getPlayerColor() ?? 'w';
        if(request !== revision || instanceID !== SETTING_FILTER_OBJ.instanceID) return;

        dialog.querySelectorAll('[data-hint-side]').forEach(group => {
            const isWhite = (playerColor !== 'b') === (group.dataset.hintSide === 'own');
            group.querySelectorAll('piece').forEach(piece => {
                piece.classList.toggle('white', isWhite);
                piece.classList.toggle('black', !isWhite);
            });
        });
    };

    const refresh = () => update().catch(error => console.error('Could not update piece filter colors:', error));
    document.addEventListener('acas-settings-updated', refresh);
    new MutationObserver(() => { if(dialog.open) refresh(); })
        .observe(dialog, { attributes: true, attributeFilter: ['open'] });
    // Player identity may arrive after the board, without an orientation change.
    setInterval(() => { if(dialog.open) refresh(); }, 750);
    refresh();
}