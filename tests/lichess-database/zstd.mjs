import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createZstdDecompress } from 'node:zlib';

// Node 24's native decoder stops after one frame. Delimit frames before feeding
// it, rather than silently ignoring a concatenated archive's remaining games.
// Zstandard framing: https://datatracker.ietf.org/doc/html/rfc8878
export async function* decompressZstd(chunks) {
    const iterator = chunks[Symbol.asyncIterator]();
    let buffer = Buffer.alloc(0), offset = 0;
    async function available() {
        while(offset === buffer.length) {
            const next = await iterator.next();
            if(next.done) return false;
            buffer = next.value;
            offset = 0;
        }
        return true;
    }
    async function* take(length) {
        while(length) {
            if(!await available()) throw new Error('Truncated Zstandard frame');
            const count = Math.min(length, buffer.length - offset, 64 * 1024);
            const part = buffer.subarray(offset, offset + count);
            offset += count;
            length -= count;
            yield part;
        }
    }
    async function bytes(length) {
        const parts = [];
        for await(const part of take(length)) parts.push(part);
        return parts.length === 1 ? parts[0] : Buffer.concat(parts, length);
    }
    try {
        while(await available()) {
            const magic = await bytes(4), value = magic.readUInt32LE();
            if((value & 0xFFFFFFF0) >>> 0 === 0x184D2A50) {
                const length = (await bytes(4)).readUInt32LE();
                for await(const part of take(length)) { void part; }
                continue;
            }
            if(value !== 0xFD2FB528) throw new Error('Invalid Zstandard frame magic');
            const descriptor = await bytes(1), flags = descriptor[0];
            if(flags & 8) throw new Error('Reserved Zstandard frame header bit is set');
            const singleSegment = Boolean(flags & 32), sizeFlag = flags >>> 6;
            const contentSizeBytes = sizeFlag === 0 ? singleSegment ? 1 : 0 : [0, 2, 4, 8][sizeFlag];
            const header = await bytes((singleSegment ? 0 : 1) + [0, 1, 2, 4][flags & 3] + contentSizeBytes);
            async function* frame() {
                yield magic; yield descriptor;
                if(header.length) yield header;
                for(;;) {
                    const block = await bytes(3);
                    yield block;
                    const bits = block.readUIntLE(0, 3), type = (bits >>> 1) & 3, size = bits >>> 3;
                    if(type === 3 || size > 128 * 1024) throw new Error('Invalid Zstandard block header');
                    yield* take(type === 1 ? 1 : size);
                    if(bits & 1) break;
                }
                if(flags & 4) yield* take(4);
            }
            const input = Readable.from(frame()), decoder = createZstdDecompress();
            const done = pipeline(input, decoder);
            // The consumer below and `await done` observe errors; attach a
            // handler now to avoid a rejection before the first output arrives.
            done.catch(() => {});
            let consumerReturned = true;
            try {
                yield* decoder;
                consumerReturned = false;
                await done;
            } catch(error) {
                consumerReturned = false;
                throw error;
            } finally {
                input.destroy();
                decoder.destroy();
                try { await done; }
                catch(error) {
                    // A bounded corpus run intentionally stops inside a frame.
                    // Decoder/input errors during normal iteration still propagate.
                    if(!consumerReturned ||
                        !['ABORT_ERR', 'ERR_STREAM_PREMATURE_CLOSE'].includes(error.code)) throw error;
                }
            }
        }
    } finally { await iterator.return?.(); }
}
