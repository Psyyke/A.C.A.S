"""Development-only full fine-tuning of a larger, pinned upstream Maia 3 model."""

import argparse
import gc
import json
import math
from pathlib import Path
import zipfile

import numpy as np
import torch
from torch import nn

from context_models import RELEASES, SOURCE_COMMIT, digest, load_release
from context_training import fit_context
from finetune_study import save_json


class ReleasedTrainable(nn.Module):
    def __init__(self, source, weights, size):
        super().__init__()
        self.network = load_release(source, weights, size)
        self.real_history = True
        self.lora_left, self.lora_right = nn.ParameterDict(), nn.ParameterDict()
        for name, parameter in self.network.named_parameters():
            parameter.requires_grad_(not name.startswith(("last_ln.", "fc_value", "fc_ponder")))

    @property
    def weights(self):
        return dict(self.network.named_parameters())

    def forward(self, tokens, self_elo, opponent_elo):
        network = self.network
        width = 12 * network.cfg.history + (3 if network.cfg.include_time_info else 0)
        ratings = [network.interpolate_elo(value).unsqueeze(1).expand(-1, 64, -1)
                   for value in (self_elo, opponent_elo)]
        features = network.token_projection(torch.cat([tokens[:, :, :width], *ratings], dim=-1))
        if hasattr(network, "abs_pe"):
            features = network.abs_pe(features)
        features = network.transformer(features)
        origins, destinations = network.proj_sq_from(features), network.proj_sq_to(features)
        scale = math.sqrt(network.cfg.head_hid_dim)
        scores = torch.einsum("bid,bjd->bij", origins, destinations) / scale
        # Contiguous rank slices avoid CPU index uploads inside CUDA graph capture.
        bias = network.promo_bias_proj(destinations[:, 56:64]) * scale
        promotions = scores[:, 48:56, 56:64, None] + bias[:, None]
        policy = torch.cat([scores.flatten(1), promotions.flatten(1)], dim=1)
        pooled = network.last_ln(features.mean(dim=1))
        value = network.fc_value(torch.relu(network.fc_value_hid(pooled)))
        ponder = network.fc_ponder(torch.relu(network.fc_ponder_hid(pooled))).squeeze(1)
        return policy, value, ponder


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", type=Path)
    parser.add_argument("source", type=Path)
    parser.add_argument("weights", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--players", nargs="+", required=True)
    parser.add_argument("--size", choices=list(RELEASES), default="79m")
    parser.add_argument("--rates", nargs="+", type=float, default=[0.000003, 0.00001])
    parser.add_argument("--epochs", type=int, default=8)
    args = parser.parse_args()
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is required")
    if any(not 0 < rate <= 0.001 for rate in args.rates) or args.epochs < 1:
        raise ValueError("Invalid released-model training settings")
    torch.set_num_threads(8)
    torch.manual_seed(42)
    torch.backends.cuda.matmul.allow_tf32 = False
    torch.backends.cudnn.allow_tf32 = False
    dataset = json.loads(args.dataset.read_text())
    players = [player for player in dataset["players"] if player["name"] in args.players]
    if {player["name"] for player in players} != set(args.players):
        raise ValueError("Unknown development player")
    files = ["released_context_study.py", "context_models.py", "context_training.py", "transformer_workflow.py",
             "finetune_model.py", "finetune_study.py", "native_data.py", "native_study.py", "released_context_test.py"]
    protocol = {"datasetSHA256": digest(args.dataset), "sourceCommit": SOURCE_COMMIT,
        "release": RELEASES[args.size], "size": args.size, "rates": args.rates, "epochs": args.epochs,
        "players": args.players, "purpose": "Novel development validation only. Test samples are not evaluated.",
        "source": {name: digest(Path(__file__).with_name(name)) for name in files}}
    args.output.mkdir(parents=True, exist_ok=True)
    path = args.output / "protocol.json"
    if path.exists() and json.loads(path.read_text()) != protocol:
        raise ValueError("Use a new directory for changed development settings")
    save_json(path, protocol)
    with zipfile.ZipFile(args.output / "source.zip", "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name in files + ["finetune_LICENSE.txt", "native-requirements.txt"]:
            archive.write(Path(__file__).with_name(name), name)
        archive.write(path, "protocol.json")
    for player in players:
        elo = int(np.clip(round(player["medianRating"] / 100) * 100, 600, 2600))
        for rate in args.rates:
            name = f'{player["name"]}-{args.size}-{rate:.6f}'
            target = args.output / f"{name}.json"
            checkpoint = args.output / f"{name}.pt"
            if target.exists():
                if digest(checkpoint) != json.loads(target.read_text())["checkpointSHA256"]:
                    raise ValueError("The completed released-model checkpoint changed")
                continue
            model = ReleasedTrainable(args.source, args.weights, args.size).cuda()
            options = {"epochs": args.epochs, "batchSize": 16, "patience": 3, "baseAnchor": 0.25,
                       "learningRate": rate, "weightDecay": 0.01, "seed": 42}
            report = fit_context(model, player["splits"]["train"]["samples"],
                player["splits"]["validation"]["samples"], elo, options,
                lambda point: print(json.dumps({"candidate": name, **point}), flush=True))
            model.cpu()
            pending = checkpoint.with_suffix(".pending.pt")
            torch.save(model.network.state_dict(), pending)
            pending.replace(checkpoint)
            report.update({"player": player["name"], "elo": elo, "size": args.size,
                           "checkpointSHA256": digest(checkpoint)})
            save_json(target, report)
            del model
            gc.collect()
            torch.cuda.empty_cache()


if __name__ == "__main__":
    main()
