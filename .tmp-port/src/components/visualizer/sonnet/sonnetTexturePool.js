export class SonnetTexturePool {
    constructor(load, unload, unloadDelayMs = 750) {
        this.load = load;
        this.unload = unload;
        this.unloadDelayMs = unloadDelayMs;
        this.entries = new Map();
    }
    async acquire(url) {
        let entry = this.entries.get(url);
        if (!entry) {
            entry = {
                refs: 0,
                promise: this.load(url),
                unloadTimer: null,
            };
            this.entries.set(url, entry);
        }
        entry.refs += 1;
        if (entry.unloadTimer) {
            clearTimeout(entry.unloadTimer);
            entry.unloadTimer = null;
        }
        try {
            return await entry.promise;
        }
        catch (error) {
            if (this.entries.get(url) === entry)
                this.entries.delete(url);
            throw error;
        }
    }
    release(url) {
        const entry = this.entries.get(url);
        if (!entry)
            return;
        entry.refs = Math.max(0, entry.refs - 1);
        if (entry.refs > 0 || entry.unloadTimer)
            return;
        entry.unloadTimer = setTimeout(() => {
            if (entry.refs > 0 || this.entries.get(url) !== entry)
                return;
            this.entries.delete(url);
            void this.unload(url).catch(() => undefined);
        }, this.unloadDelayMs);
    }
}
const pixiPools = new WeakMap();
export const getSonnetTexturePool = (pixi) => {
    const assets = pixi.Assets;
    const cached = pixiPools.get(assets);
    if (cached)
        return cached;
    const pool = new SonnetTexturePool(url => pixi.Assets.load(url), url => pixi.Assets.unload(url));
    pixiPools.set(assets, pool);
    return pool;
};
