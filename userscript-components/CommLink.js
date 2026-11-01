/* CommLink.js
 - Version: 1.1.0
 - Author: Haka
 - Description: A userscript library for cross-window communication via the userscript storage
 - GitHub: https://github.com/AugmentedWeb/CommLink
 */

// How long after the last real (non keep-alive) packet the 1 ms fast polling stays on
const COMMLINK_FAST_POLL_WINDOW_MS = 5000;

class CommLinkHandler {
    constructor(commlinkID, configObj) {
        this.commlinkID = commlinkID;
        this.singlePacketResponseWaitTime = configObj?.singlePacketResponseWaitTime || 1500;
        this.maxSendAttempts = configObj?.maxSendAttempts || 3;
        this.statusCheckInterval = configObj?.statusCheckInterval || 1;
        this.silentMode = configObj?.silentMode || false;

        this.commlinkValueIndicator = 'commlink-packet-';
        this.commands = {};
        this.listeners = [];

        this.greasy = typeof GM === 'object' ? GM : {};

        const getFunction = (funcNames, methodName) => {
            for(const func of funcNames) {
                if(typeof func === 'function') {
                    return func;
                }
            }
        
            if(!this.silentMode) {
                throw new Error(`No valid method found for ${methodName}`);
            }
        };
        
        const getValueMethod = getFunction(
            [
                typeof GM_getValue !== 'undefined' ? GM_getValue : undefined,
                this.greasy?.getValue,
                configObj?.functions?.getValue
            ],
            'getValue'
        );

        const setValueMethod = getFunction(
            [
                typeof GM_setValue !== 'undefined' ? GM_setValue : undefined,
                this.greasy?.setValue,
                configObj?.functions?.setValue
            ],
            'setValue'
        );

        const deleteValueMethod = getFunction(
            [
                typeof GM_deleteValue !== 'undefined' ? GM_deleteValue : undefined,
                this.greasy?.deleteValue,
                configObj?.functions?.deleteValue
            ],
            'deleteValue'
        );

        const listValuesMethod = getFunction(
            [
                typeof GM_listValues !== 'undefined' ? GM_listValues : undefined,
                this.greasy?.listValues,
                configObj?.functions?.listValues
            ],
            'listValues'
        );
        
        // A storage call that never answers must not hang a polling loop forever.
        this.storageTimeoutMs = configObj?.storageTimeoutMs || 3000;

        const withTimeout = (promiseLike) => {
            let timer;

            const timeout = new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error('CommLink storage call timed out')), this.storageTimeoutMs);
            });

            return Promise.race([Promise.resolve(promiseLike), timeout]).finally(() => clearTimeout(timer));
        };

        this.storage = {
            getValue: async (key) => {
                return await withTimeout(getValueMethod(key));
            },
            setValue: (key, value) => {
                return withTimeout(setValueMethod(key, value));
            },
            deleteValue: (key) => {
                return withTimeout(deleteValueMethod(key));
            },
            listValues: async () => {
                return await withTimeout(listValuesMethod());
            }
        };

        this.lastStaleCleanup = Date.now();

        // Event-driven wake-up through a single shared "bell" key, used only if the manager
        // supports value change listeners. Peers without the update never ring the bell, so
        // until a ring is actually seen we keep polling for them (see getPollDelay).
        this.bellKey = 'commlink-bell';
        this.bellConfirmed = false;
        this.pendingWake = false;
        this.wake = null;
        this.lastActivity = 0;
        this.burstMs = configObj?.burstMs || COMMLINK_FAST_POLL_WINDOW_MS;
        this.legacyIdleIntervalMs = configObj?.legacyIdleIntervalMs || 20;
        this.bellFallbackIntervalMs = configObj?.bellFallbackIntervalMs || 250;
        this.receiverRunning = false;
        // Keep-alive traffic must not keep the fast 1 ms polling on forever
        this.keepAliveCommands = configObj?.keepAliveCommands || ['createInstance', 'ping'];

        const addValueChangeListenerMethod = [
            typeof GM_addValueChangeListener !== 'undefined' ? GM_addValueChangeListener : undefined,
            this.greasy?.addValueChangeListener,
            configObj?.functions?.addValueChangeListener
        ].find(func => typeof func === 'function');

        this.hasBell = false;

        if(addValueChangeListenerMethod) {
            try {
                const bell = CommLinkHandler.__bell || (CommLinkHandler.__bell = { subscribers: new Set(), registered: false });

                bell.subscribers.add(this);

                if(!bell.registered) {
                    bell.registered = true;

                    const result = addValueChangeListenerMethod(this.bellKey, () => {
                        bell.subscribers.forEach(handler => handler.onBell());
                    });

                    // Async APIs (GM.addValueChangeListener) may reject
                    if(result && typeof result.catch === 'function') result.catch(() => { bell.registered = false; });
                }

                this.hasBell = true;
            } catch(e) {
                this.hasBell = false;
            }
        }

        if(typeof GM_info !== 'undefined') {
            const grants = (GM_info?.script?.grant) || [];
            const missingGrants = ['getValue', 'setValue', 'deleteValue', 'listValues']
                .filter(grant => !grants.some(g => g.endsWith(grant)));
    
            if(missingGrants.length > 0 && !this.silentMode)
                alert(`[CommLink] The following userscript grants are missing: ${missingGrants.join(', ')}. CommLink might not work.`);
        }

        this.removeOldPackets().catch(() => {});
    }

    async removeOldPackets(packets) {
        packets = packets || await this.getStoredPackets();

        packets.filter(packet => Date.now() - packet?.date > 2e4)
            .forEach(packet => this.removePacketByID(packet.id));
    }

    onBell() {
        this.bellConfirmed = true;
        this.pendingWake = true;

        if(this.wake) this.wake();
    }

    ringBell() {
        if(!this.hasBell) return;

        try {
            Promise.resolve(this.storage.setValue(this.bellKey, { t: Date.now(), r: Math.random() })).catch(() => {});
        } catch(e) {}
    }

    getPollDelay() {
        if(Date.now() - this.lastActivity < this.burstMs) return this.statusCheckInterval;

        // A peer that rings the bell is answered instantly; the timer is only a safety net.
        if(this.bellConfirmed) return this.bellFallbackIntervalMs;

        return Math.max(this.legacyIdleIntervalMs, this.statusCheckInterval);
    }

    startReceiver() {
        if(this.receiverRunning) return;

        this.receiverRunning = true;

        const loop = async () => {
            while(this.receiverRunning) {
                let delay;

                try {
                    this.pendingWake = false;

                    if(await this.receivePackets()) this.lastActivity = Date.now();

                    delay = this.getPollDelay();
                } catch(e) {
                    delay = 50; // back off, never a hot loop
                }

                if(this.pendingWake) continue;

                await new Promise(resolve => {
                    const timer = setTimeout(() => { this.wake = null; resolve(); }, delay);

                    this.wake = () => { clearTimeout(timer); this.wake = null; resolve(); };
                });
            }
        };

        loop();
    }

    setIntervalAsync(callback, interval = this.statusCheckInterval) {
        let running = true;

        async function loop() {
            while(running) {
                try {
                    await callback();

                    await new Promise((resolve) => setTimeout(resolve, interval));
                } catch (e) {
                    // Back off, otherwise a failing callback becomes a hot loop.
                    await new Promise((resolve) => setTimeout(resolve, Math.max(interval, 50)));
                }
            }
        };

        loop();

        return { stop: () => running = false };
    }

    getUniqueID() {
        return ([1e7]+-1e3+4e3+-8e3+-1e11).replace(/[018]/g, c =>
            (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
        )
    }

    getCommKey(packetID) {
        return this.commlinkValueIndicator + packetID;
    }

    async getStoredPackets() {
        const keys = await this.storage.listValues();
        const storedPackets = [];
        
        for(const key of keys) {
            if(key.includes(this.commlinkValueIndicator)) {
                let value;

                try {
                    value = await this.storage.getValue(key);
                } catch(e) {
                    continue;
                }

                if(value && typeof value === 'object') storedPackets.push(value);
            }
        }
        
        return storedPackets;
    }
    
    addPacket(packet) {
        try { Promise.resolve(this.storage.setValue(this.getCommKey(packet.id), packet)).catch(() => {}); } catch(e) {}
    }

    removePacketByID(packetID) {
        try { Promise.resolve(this.storage.deleteValue(this.getCommKey(packetID))).catch(() => {}); } catch(e) {}
    }

    async findPacketByID(packetID) {
        return await this.storage.getValue(this.getCommKey(packetID));
    }

    async editPacket(newPacket) {
        // The sender may have given up and deleted the packet already. Writing
        // the result then would re-create it as a packet nobody ever removes.
        if(!await this.findPacketByID(newPacket.id)) return;

        try { await this.storage.setValue(this.getCommKey(newPacket.id), newPacket); } catch(e) {}
    }

    send(platform, cmd, d) {
        return new Promise(async resolve => {
            const packetWaitTimeMs = this.singlePacketResponseWaitTime;
            const maxAttempts = this.maxSendAttempts;

            let attempts = 0;

            for(;;) {
                attempts++;

                const packetID = this.getUniqueID();
                const attemptStartDate = Date.now();

                const packet = { sender: platform, id: packetID, command: cmd, data: d, date: attemptStartDate };

                if(!this.silentMode)
                    console.log(`[CommLink Sender] Sending packet! (#${attempts} attempt):`, packet);

                this.addPacket(packet);
                this.ringBell();

                if(!this.keepAliveCommands.includes(cmd)) this.lastActivity = Date.now();

                for(;;) {
                    let poolPacket;

                    try {
                        poolPacket = await this.findPacketByID(packetID);
                    } catch(e) {
                        poolPacket = null; // storage unavailable: treat as no reply
                    }
                    const packetResult = poolPacket?.result;

                    // false, 0 and an empty string are replies too, not missing acknowledgements.
                    if(poolPacket && packetResult != null) {
                        if(!this.silentMode)
                            console.log(`[CommLink Sender] Got result for a packet (${packetID}):`, packetResult);

                        resolve(poolPacket.result);

                        attempts = maxAttempts; // stop main loop

                        break;
                    }

                    if(!poolPacket || Date.now() - attemptStartDate > packetWaitTimeMs) {
                        break;
                    }

                    await new Promise(res => setTimeout(res, this.statusCheckInterval));
                }

                this.removePacketByID(packetID);

                if(attempts == maxAttempts) {
                    break;
                }
            }

            return resolve(null);
        });
    }

    registerSendCommand(name, obj) {
        this.commands[name] = async data => await this.send(obj?.commlinkID || this.commlinkID , name, obj?.data || data);
    }

    registerListener(sender, commandHandler) {
        const listener = { sender, commandHandler };

        this.listeners.push(listener);

        // One shared receive loop per handler, not one per listener
        this.startReceiver();
    }

    async receivePackets() {
        const packets = await this.getStoredPackets();

        if(Date.now() - this.lastStaleCleanup > 1e4) {
            this.lastStaleCleanup = Date.now();
            this.removeOldPackets(packets).catch(() => {});
        }

        let handledAmount = 0;

        for(const packet of packets) {
            for(const listener of this.listeners) {
                if(packet.sender === listener.sender && !packet.hasOwnProperty('result')) {
                    try {
                        const result = await listener.commandHandler(packet);
                        packet.result = result === undefined ? null : result;
                        if(!this.keepAliveCommands.includes(packet.command)) handledAmount++;

                        await this.editPacket(packet);
                        
                        if(!this.silentMode) {
                            if(packet.result == null)
                                console.log('[CommLink Receiver] Possibly failed to handle packet:', packet);
                            else
                                console.log('[CommLink Receiver] Successfully handled a packet:', packet);
                        }
                    } catch(error) {
                        if(!this.silentMode) console.error('[CommLink Receiver] Error handling packet:', error);
                    }
                }
            }
        }

        return handledAmount;
    }

    kill() {
        this.receiverRunning = false;

        if(this.wake) this.wake();

        CommLinkHandler.__bell?.subscribers.delete(this);
    }
}