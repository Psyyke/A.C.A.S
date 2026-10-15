// Commands for one engine run in order. Closing engines waits for every lane
// and holds later commands until the close completes.
export default class CommandQueue {
    constructor() {
        this.commands = new Map();
        this.pendingBarrier = Promise.resolve();
    }

    run(key, execute) {
        const operation = (this.commands.get(key) ?? this.pendingBarrier).then(execute);
        const settled = operation.catch(() => {});
        this.commands.set(key, settled);
        return operation.finally(() => {
            if(this.commands.get(key) === settled) this.commands.delete(key);
        });
    }

    barrier(execute) {
        const operation = Promise.all([this.pendingBarrier, ...this.commands.values()]).then(execute);
        this.pendingBarrier = operation.catch(() => {});
        this.commands.clear();
        return operation;
    }
}
