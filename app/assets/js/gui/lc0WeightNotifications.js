const pending = new Map();

export function trackLc0WeightUpload(id, name) {
    cancelLc0WeightUpload(id);
    pending.set(id, {
        name,
        waiting: toast.instance(((typeof TRANS_OBJ === 'undefined' ? null : TRANS_OBJ)?.lc0WeightsLoading ?? 'Loading Lc0 weights: {name}')
            .replace('{name}', () => name), undefined,
            (typeof TRANS_OBJ === 'undefined' ? null : TRANS_OBJ)?.lc0WeightsWaiting
                ?? 'Large weights can take a while to prepare. Confirmation waits until analysis starts.')
    });
}

export function cancelLc0WeightUpload(id) {
    pending.get(id)?.waiting.close();
    pending.delete(id);
}

export function confirmLc0WeightLoaded(id) {
    if(!pending.has(id)) return;
    const { name } = pending.get(id);
    cancelLc0WeightUpload(id);
    toast.success(((typeof TRANS_OBJ === 'undefined' ? null : TRANS_OBJ)?.lc0WeightsLoaded ?? 'Lc0 weights uploaded and loaded: {name}')
        .replace('{name}', () => name), 5000);
}
