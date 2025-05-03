/* CommLink.js
 - Version: 1.0.3
 - Author: Haka
 - Description: A userscript library for cross-window communication via the userscript storage
 - GitHub: https://github.com/AugmentedWeb/CommLink
 */

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
        
        this.storage = {
            getValue: async (key) => {
                return await getValueMethod(key);
            },
            setValue: (key, value) => {
                return setValueMethod(key, value);
            },
            deleteValue: (key) => {
                return deleteValueMethod(key);
            },
            listValues: async () => {
                return await listValuesMethod();
            }
        };

        if(typeof GM_info !== 'undefined') {
            const grants = (GM_info?.script?.grant) || [];
            const missingGrants = ['getValue', 'setValue', 'deleteValue', 'listValues']
                .filter(grant => !grants.some(g => g.endsWith(grant)));
    
            if(missingGrants.length > 0 && !this.silentMode)
                alert(`[CommLink] The following userscript grants are missing: ${missingGrants.join(', ')}. CommLink might not work.`);
        }

        this.removeOldPackets();
    }

    async removeOldPackets() {
        const packets = await this.getStoredPackets();

        packets.filter(packet => Date.now() - packet?.date > 2e4)
            .forEach(packet => this.removePacketByID(packet.id));
    }

    setIntervalAsync(callback, interval = this.statusCheckInterval) {
        let running = true;

        async function loop() {
            while(running) {
                try {
                    await callback();

                    await new Promise((resolve) => setTimeout(resolve, interval));
                } catch (e) {
                    continue;
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
                const value = await this.storage.getValue(key);
                storedPackets.push(value);
            }
        }
        
        return storedPackets;
    }
    
    addPacket(packet) {
        this.storage.setValue(this.getCommKey(packet.id), packet);
    }

    removePacketByID(packetID) {
        this.storage.deleteValue(this.getCommKey(packetID));
    }

    async findPacketByID(packetID) {
        return await this.storage.getValue(this.getCommKey(packetID));
    }

    editPacket(newPacket) {
        this.storage.setValue(this.getCommKey(newPacket.id), newPacket);
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

                for(;;) {
                    const poolPacket = await this.findPacketByID(packetID);
                    const packetResult = poolPacket?.result;

                    if(poolPacket && packetResult) {
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
        const listener = {
            sender,
            commandHandler,
            intervalObj: this.setIntervalAsync(async () => {
                await this.receivePackets();
            }, this.statusCheckInterval),
        };
    
        this.listeners.push(listener);
    }

    async receivePackets() {
        const packets = await this.getStoredPackets();

        for(const packet of packets) {
            for(const listener of this.listeners) {
                if(packet.sender === listener.sender && !packet.hasOwnProperty('result')) {
                    try {
                        const result = await listener.commandHandler(packet);
                        packet.result = result;

                        this.editPacket(packet);
                        
                        if(!this.silentMode) {
                            if(packet.result == null)
                                console.log('[CommLink Receiver] Possibly failed to handle packet:', packet);
                            else
                                console.log('[CommLink Receiver] Successfully handled a packet:', packet);
                        }
                    } catch(error) {
                        console.error('[CommLink Receiver] Error handling packet:', error);
                    }
                }
            }
        }
    }    

    kill() {
        this.listeners.forEach(listener => listener.intervalObj.stop());
    }
}