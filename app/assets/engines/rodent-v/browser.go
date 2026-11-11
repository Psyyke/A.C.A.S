//go:build js && wasm

package main

import (
	"bytes"
	"fmt"
	"io"
	"sort"
	"strings"
	"syscall/js"
	"time"
)

type commandReader struct {
	lines   chan string
	pending string
}

func (r *commandReader) Read(p []byte) (int, error) {
	if r.pending == "" {
		r.pending = <-r.lines
	}
	n := copy(p, r.pending)
	r.pending = r.pending[n:]
	return n, nil
}

var browserInput = &commandReader{lines: make(chan string, 256)}
var browserLastYield time.Time
var browserRootMoves map[string]bool
var browserOverrides = map[string][]string{}
var browserDefaultSingles [NofSingleOptions]int
var browserDefaultColors [2][EvalComponentN]int

const browserDefaultNetwork = "nets/rodent_8kb_512pw_multilayer_v8.bin"

func main() {
	readPersonalityFiles = false
	if !nnueInitEmbedded() {
		panic("Rodent embedded NNUE is invalid")
	}
	browserDefaultSingles = singleOptionValue
	browserDefaultColors = optionPerColorValues
	command := js.FuncOf(func(this js.Value, args []js.Value) any {
		select {
		case browserInput.lines <- args[0].String() + "\n":
			return true
		default:
			return false
		}
	})
	defer command.Release()
	js.Global().Set("rodentCommand", command)
	js.Global().Call("postMessage", true)
	uciLoop()
}

// Go's WASM scheduler cannot preempt a CPU-bound search to run worker messages.
func browserYield() {
	if time.Since(browserLastYield) >= 8*time.Millisecond {
		browserLastYield = time.Now()
		time.Sleep(time.Millisecond)
	}
}

func browserReadFile(path string) ([]byte, error) {
	if path == browserEmbeddedNetwork {
		return embeddedNet, nil
	}
	type result struct {
		data []byte
		err  error
	}
	done := make(chan result, 1)
	callback := js.FuncOf(func(this js.Value, args []js.Value) any {
		if args[0].Type() == js.TypeString {
			done <- result{err: fmt.Errorf("%s", args[0].String())}
		} else {
			data := make([]byte, args[1].Get("byteLength").Int())
			js.CopyBytesToGo(data, args[1])
			done <- result{data: data}
		}
		return nil
	})
	defer callback.Release()
	js.Global().Call("rodentReadAsset", path, callback)
	r := <-done
	// Native preset parsing swallows failed dependent files. Never report a
	// personality as loaded with an old network or a missing book in the app.
	if r.err != nil {
		panic(r.err)
	}
	return r.data, nil
}

func browserOpen(path string) (io.ReadCloser, error) {
	data, err := browserReadFile(path)
	return io.NopCloser(bytes.NewReader(data)), err
}

func browserValidateNetwork(path string) {
	expected := "_512"
	if NNUEHiddenSize == 768 {
		expected = "_768"
	}
	found := false
	for _, name := range browserNetworks {
		found = found || name == path
	}
	if !found || !strings.Contains(path, expected) {
		panic(fmt.Errorf("network %q does not match the %d-neuron runtime", path, NNUEHiddenSize))
	}
}

func browserSync(id string) {
	js.Global().Call("postMessage", map[string]any{"type": "sync", "id": id})
}

func browserClearHashes() {
	clearTT()
	clearEvalHash()
	clearPawnHash()
}

func browserPresetOption(tokens []string) {
	if len(tokens) > 1 && strings.EqualFold(tokens[1], "nnuePath") && browserOverrides["nnuepath"] != nil {
		return
	}
	parseSetOption(tokens)
}

func browserPrintAssetOptions() {
	fmt.Println("option name PersonalityFile type string default <empty>")
	fmt.Print("option name Personality type combo default default var default")
	for _, name := range browserPersonalities {
		fmt.Print(" var ", name)
	}
	fmt.Println()
	for _, option := range []struct {
		name   string
		value  string
		values []string
	}{
		{"NnuePath", browserDefaultNetwork, browserNetworks},
		{"MainBook", "books/empty.bin", browserBooks},
		{"GuideBook", "books/empty.bin", browserBooks},
	} {
		fmt.Printf("option name %s type combo default %s", option.name, option.value)
		for _, value := range option.values {
			fmt.Print(" var ", value)
		}
		fmt.Println()
	}
}

func browserSetOption(tokens []string) {
	valueAt := len(tokens)
	for i, token := range tokens {
		if strings.EqualFold(token, "value") {
			valueAt = i
			break
		}
	}
	nameTokens := tokens[:valueAt]
	if len(nameTokens) > 0 && strings.EqualFold(nameTokens[0], "name") {
		nameTokens = nameTokens[1:]
	}
	name := strings.ToLower(strings.Join(nameTokens, " "))
	value := ""
	if valueAt < len(tokens) {
		value = strings.Join(tokens[valueAt+1:], " ")
	}
	if name == "personality" {
		browserLoadPersonality(value)
		return
	}
	// Explicit edits remain overrides of the selected base preset, including
	// edits equal to the engine defaults. This is independent of command order.
	isStyle := name == "nnuepath" || name == "mainbook" || name == "guidebook"
	for _, optionName := range singleOptionName {
		if strings.EqualFold(name, optionName) && name != "multipv" && name != "nodeslimit" {
			isStyle = true
		}
	}
	isStyle = isStyle || strings.HasPrefix(name, "own") && name != "ownbook" || strings.HasPrefix(name, "opp")
	if isStyle {
		browserOverrides[name] = append([]string(nil), tokens...)
	}
	parseSetOption(tokens)
	if isStyle {
		browserClearHashes()
	}
}

func browserLoadPersonality(name string) {
	found := name == "default"
	for _, candidate := range browserPersonalities {
		found = found || name == candidate
	}
	if !found {
		panic(fmt.Errorf("unknown Rodent personality %q", name))
	}
	multiPV := singleOptionValue[MultiPV]
	singleOptionValue = browserDefaultSingles
	singleOptionValue[MultiPV] = multiPV
	optionPerColorValues = browserDefaultColors
	if !nnueInitEmbedded() {
		panic("Rodent embedded NNUE is invalid")
	}
	nnuePath = browserDefaultNetwork
	mainBookPath, guideBookPath = "books/empty.bin", "books/empty.bin"
	mainBook.close()
	guideBook.close()
	if name != "default" {
		if err := readOptions("personalities/" + name + ".txt"); err != nil {
			panic(err)
		}
	}
	keys := make([]string, 0, len(browserOverrides))
	for key := range browserOverrides {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		parseSetOption(browserOverrides[key])
	}
	browserClearHashes()
	fmt.Printf("info string Rodent personality: %s (%d explicit style overrides)\n", name, len(keys))
}

func browserSetSearchMoves(tokens []string) {
	browserRootMoves = nil
	for i, token := range tokens {
		if token != "searchmoves" {
			continue
		}
		browserRootMoves = map[string]bool{}
		for _, move := range tokens[i+1:] {
			if len(move) < 4 || len(move) > 5 || move[0] < 'a' || move[0] > 'h' {
				break
			}
			browserRootMoves[move] = true
		}
		break
	}
}

func browserRootMoveAllowed(move int) bool {
	return browserRootMoves == nil || browserRootMoves[moveToStr(move)]
}
