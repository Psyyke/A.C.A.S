## lila-stockfish-web
Multiple stockfish wasms for use in lichess.org web analysis

## Building
```
# Example: Clean and make all debug builds for node with SAFE_HEAP

  ./build.py --flags='-O0 -g3 -sSAFE_HEAP' --node all clean
```

or to avoid installing or changing your emscripten version, use `./build-with-docker.sh`:

```
./build-with-docker.sh --flags='-O3' all clean
```

omit `--node` for default web builds

use `--flags` to override the default emcc flags which are `-O3 -DNDEBUG --closure=1`

check `./build.py --help` for the latest targets

`./build.py` downloads sources to the `./fishes` folder then applies diffs from the `./patches` folder. 
Edit the Stockfish sources freely. But to contribute your edits, use a patch file

```
# Example: Update `sf16-7.patch` with your source changes: 

  cd fishes/sf16-7
  git diff > ../../patches/sf16-7.patch
```

## Sources

### sfhce (Official Stockfish Classical release)
- repo: https://github.com/official-stockfish/Stockfish
- commit: [9587eee](https://github.com/official-stockfish/Stockfish/commit/9587eee)
- tag: SF_classical

### sf16-40 (Official Stockfish 16 release)
- repo: https://github.com/official-stockfish/Stockfish
- commit: [68e1e9b](https://github.com/official-stockfish/Stockfish/commit/68e1e9b)
- tag: sf_16
- nnue: [nn-5af11540bbfe.nnue](https://tests.stockfishchess.org/nns?network_name=nn-5af11540bbfe)

### sf16-7 (Stockfish 16 linrock)
- repo: https://github.com/linrock/Stockfish
- commit: [c97f5cb](https://github.com/linrock/Stockfish/commit/c97f5cb)
- nnue: [nn-ecb35f70ff2a.nnue](https://tests.stockfishchess.org/nns?network_name=nn-ecb35f70ff2a)

### sf161-70 (Official Stockfish 16.1 release)
- repo: https://github.com/official-stockfish/Stockfish
- commit: [e67cc97](https://github.com/official-stockfish/Stockfish/commit/e67cc97)
- tag: sf_16.1
- big nnue: [nn-b1a57edbea57.nnue](https://tests.stockfishchess.org/nns?network_name=nn-b1a57edbea57)
- small nnue: [nn-baff1ede1f90.nnue](https://tests.stockfishchess.org/nns?network_name=nn-baff1ede1f90)

### sf17-79 (Official Stockfish 17 release)
- repo: https://github.com/official-stockfish/Stockfish
- commit: [e0bfc4b](https://github.com/official-stockfish/Stockfish/commit/e0bfc4b)
- tag: sf_17
- big nnue: [nn-1111cefa1111.nnue](https://tests.stockfishchess.org/api/nn/nn-1111cefa1111.nnue)
- small nnue: [nn-37f18f62d772.nnue](//tests.stockfishchess.org/api/nn/nn-37f18f62d772.nnue)

### fsf14 (Fairy-Stockfish 14)
- repo: https://github.com/fairy-stockfish/Fairy-Stockfish
- commit: [a621470](https://github.com/fairy-stockfish/Fairy-Stockfish/commit/a621470)
- nnues: see repo links
