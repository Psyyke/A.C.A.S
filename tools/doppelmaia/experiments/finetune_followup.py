"""Post-selection controls: wrong-player weights, rating transfer, input ambiguity."""

import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path

import chess
import numpy as np
import torch

from finetune_model import Maia3
from finetune_study import MODEL, ambiguity, predict, save_json, summarize
from imitation_study import row_metrics, softmax
from native_data import position_key
from native_study import encode, paired_interval


def oracle(keys, targets):
    result = ambiguity(keys, targets)
    groups = defaultdict(Counter)
    for key, target in zip(keys, targets):
        groups[key][int(target)] += 1
    result["empiricalMinimumCE"] = sum(
        -sum(count * np.log(count / sum(counts.values())) for count in counts.values())
        for counts in groups.values()) / len(keys)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", type=Path)
    parser.add_argument("study", type=Path)
    args = parser.parse_args()
    torch.set_num_threads(4)
    torch.backends.cuda.matmul.allow_tf32 = False
    torch.backends.cudnn.allow_tf32 = False
    report = json.loads((args.study / "finetune-report.json").read_text())
    source = json.loads(args.dataset.read_text())
    model = Maia3(MODEL).cuda()
    base_state = {key: value.detach().cpu().clone() for key, value in model.state_dict().items()}
    result = {"source": {key: value for key, value in source.items() if key != "players"},
              "protocol": "Diagnostics only after fixed novel-validation selection; no checkpoint or hyperparameter changes.",
              "wrongPlayerWarning": "Other source players may share generic chess patterns and opening boards; not an independent population trial.",
              "players": []}
    pooled = {group: {"samples": [], "baseCE": [], "adapterCE": [], "baseTop1": [], "adapterTop1": []}
              for group in ["all", "novel", "strictNovel"]}
    for player in report["players"]:
        original = next(p for p in source["players"] if p["name"] == player["name"])
        splits = [original["splits"][name]["samples"] for name in ["train", "validation", "test"]]
        samples = sum(splits, [])
        tokens, legal, targets = encode(samples)
        keys = [position_key(chess.Board(s["fen"])) for s in samples]
        policy_keys = [key + "|" + hashlib.sha256(mask.tobytes()).hexdigest() for key, mask in zip(keys, legal)]
        ntrain, nval, ntest = map(len, splits)
        te = slice(ntrain + nval, None)
        seen, all_seen = set(keys[:ntrain]), set(keys[:ntrain + nval])
        masks = {"all": np.ones(ntest, bool), "novel": np.array([key not in seen for key in keys[te]]),
                 "strictNovel": np.array([key not in all_seen for key in keys[te]])}
        record = {"name": player["name"], "exactNativeInputAmbiguity": oracle(keys, targets),
                  "nativeInputAndLegalMaskAmbiguity": oracle(policy_keys, targets),
                  "ambiguityNote": "Within each player, Elo and wrapper clocks/history are fixed. Native board input omits castling, en-passant and game history. Legal masks are separately conditioned here.",
                  "wrongPlayerControls": [], "ratingTransfer": {}}
        with np.load(args.study / player["name"] / "sealed-test-predictions.npz") as saved:
            baseline = saved["base"].copy()
            own_logits = saved[player["selected"]].copy()
            adapter = saved[f"adapter-{player['selectedAdapterAnchor']}"].copy()
        own_probs, adapter_probs = softmax(own_logits, legal[te]), softmax(adapter, legal[te])
        base_probs = softmax(baseline, legal[te])
        record["selectedVersusFrozenAdapter"] = {}
        for group, mask in masks.items():
            rows = [s for s, yes in zip(splits[2], mask) if yes]
            own_loss = row_metrics(own_probs[mask], targets[te][mask])[1]
            adapter_loss = row_metrics(adapter_probs[mask], targets[te][mask])[1]
            agreement_difference = ((own_probs[mask].argmax(1) == targets[te][mask]).astype(float)
                                    - (adapter_probs[mask].argmax(1) == targets[te][mask]).astype(float))
            base_loss = row_metrics(base_probs[mask], targets[te][mask])[1]
            base_difference = ((own_probs[mask].argmax(1) == targets[te][mask]).astype(float)
                               - (base_probs[mask].argmax(1) == targets[te][mask]).astype(float))
            pooled[group]["samples"].extend(rows)
            for key, values in [("baseCE", own_loss - base_loss), ("adapterCE", own_loss - adapter_loss),
                                ("baseTop1", base_difference), ("adapterTop1", agreement_difference)]:
                pooled[group][key].extend(values.tolist())
            record["selectedVersusFrozenAdapter"][group] = {
                "CEChange95": paired_interval(rows, own_loss - adapter_loss),
                "top1Change95": paired_interval(rows, agreement_difference)}
        for other in report["players"]:
            if other["name"] == player["name"]:
                continue
            chosen = next(c for c in other["candidates"] if c["id"] == other["selected"])
            model.load_state_dict(torch.load(chosen["checkpoint"], map_location="cuda", weights_only=True))
            logits = predict(model, tokens[te], player["rating"])[0]
            values = summarize(logits, baseline, legal[te], targets[te], splits[2], masks)
            for group, mask in masks.items():
                rows = [s for s, yes in zip(splits[2], mask) if yes]
                other_p = softmax(logits[mask], legal[te][mask])
                own_loss = row_metrics(own_probs[mask], targets[te][mask])[1]
                other_loss = row_metrics(other_p, targets[te][mask])[1]
                values[group]["ownMinusWrongPlayerCE95"] = paired_interval(rows, own_loss - other_loss)
                diff = ((own_probs[mask].argmax(1) == targets[te][mask]).astype(float)
                        - (other_p.argmax(1) == targets[te][mask]).astype(float))
                values[group]["ownMinusWrongPlayerTop1_95"] = paired_interval(rows, diff)
            record["wrongPlayerControls"].append({"weightsFrom": other["name"], "metrics": values})
        chosen = next(c for c in player["candidates"] if c["id"] == player["selected"])
        own_state = torch.load(chosen["checkpoint"], map_location="cuda", weights_only=True)
        for rating in [player["rating"] - 200, player["rating"] + 200]:
            model.load_state_dict(base_state)
            reference = predict(model, tokens[te], rating)[0]
            model.load_state_dict(own_state)
            predicted = predict(model, tokens[te], rating)[0]
            record["ratingTransfer"][str(rating)] = {
                "base": summarize(reference, reference, legal[te], targets[te], splits[2], masks),
                "fineTuned": summarize(predicted, reference, legal[te], targets[te], splits[2], masks)}
        result["players"].append(record)
        save_json(args.study / "finetune-followup.json", result)
        print(player["name"], "post-selection controls done", flush=True)
    result["pooledPairedGameIntervals"] = {
        group: {key: paired_interval(values["samples"], np.asarray(difference))
                for key, difference in values.items() if key != "samples"}
        for group, values in pooled.items()}
    save_json(args.study / "finetune-followup.json", result)


if __name__ == "__main__":
    main()
