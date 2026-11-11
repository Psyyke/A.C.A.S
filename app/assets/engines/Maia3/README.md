Original source: https://github.com/CSSLab/maia-platform-frontend
License: GPLv3
Changes: Modified to JS and implemented it into a basic UCI chess engine to function with A.C.A.S :)

The engine waits for its worker's cache check before requesting a download, so concurrent `init()` calls share one model/session. Inference uses the bundled WASM provider with one thread per worker. `MaiaEngine.dispose()` (and the underlying `Maia.dispose()`) terminates the worker and rejects outstanding initialization, download and inference requests; callers should invoke it when abandoning an engine. Input/output tensors are released after each inference, and cache database connections are closed after use.

Personalized models use a separate path. The app passes a profile's
`maia3Model` and `maia3Provider` to the UCI wrapper. `personal-models.js` stores
complete ONNX files in `acas-maia3-personal-models`, separate from the default
model cache. The worker loads the selected bytes with the current shared Lc0
ONNX Runtime distribution and the explicitly selected WASM or WebGPU provider.
Missing or incompatible files produce errors, never default-model fallback.
No custom selection leaves the existing default engine behavior unchanged.

Choose Maia 3, then open the cog beside Maia 3 Weights to upload an ONNX network
and choose its runtime. Each profile selects one network at a time. Uploading
replaces that selection and the remove button restores default Maia 3.
The `?shl=maia3Model` app link waits for profile settings, opens this floaty
and highlights the network upload.
If another engine is selected, it shows guidance without changing your engine.
The weights dialogs and engine-selection guidance follow the app language,
including language changes while the page is open. DoppelMaia's Use in A.C.A.S
link confirms with a toast after saving the network, runtime, both player and enemy Elo, and engine
selection for the active profile. This confirms selection, not successful
inference or playing strength.

Full DoppelMaia exports can use actual board history. The worker reads the
ONNX input metadata and reports whether the model expects 12 or 96 channels.
Existing default and adapter models keep their 12 channel input unchanged.
An unsupported shape produces an error before inference.

The 96 channel layout has eight boards from oldest to newest. Each board is
mirrored for its own side to move. Missing earlier boards repeat the earliest
known board. They are never guessed from a future position. UCI `position`
commands replay their legal continuation and retain the last eight positions.
`ucinewgame` and standalone FEN commands reset that history.
Learning mode also includes the candidate move in its child position history.

Direct `evaluate` and `bestMove` calls accept an optional fourth argument with
current first FEN history. `evaluateBatch` accepts a fourth argument containing
one history array per board. Without supplied history, an independent FEN uses
the documented earliest board padding. The app already sends its legally
replayed move history when available.

The [DoppelMaia technical notes](../../../../tools/doppelmaia/README.md)
document full transformer training, the frozen residual adapter, export formats,
goals, measured benchmarks and native CUDA validation. Maia 3 ONNX weights are not
interchangeable with Lc0 protobuf weights.