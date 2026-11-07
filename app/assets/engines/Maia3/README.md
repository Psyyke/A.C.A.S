Original source: https://github.com/CSSLab/maia-platform-frontend
License: GPLv3
Changes: Modified to JS and implemented it into a basic UCI chess engine to function with A.C.A.S :)

The engine waits for its worker's cache check before requesting a download, so concurrent `init()` calls share one model/session. Inference uses the bundled WASM provider with one thread per worker. `MaiaEngine.dispose()` (and the underlying `Maia.dispose()`) terminates the worker and rejects outstanding initialization, download and inference requests; callers should invoke it when abandoning an engine. Input/output tensors are released after each inference, and cache database connections are closed after use.