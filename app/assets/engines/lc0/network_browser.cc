// SPDX-License-Identifier: GPL-3.0-or-later
#include <atomic>
#include <limits>
#include <memory>
#include <optional>
#include <vector>

#include <emscripten/emscripten.h>
#include <emscripten/threading.h>

#include "neural/factory.h"
#include "utils/bititer.h"
#include "utils/exception.h"

namespace lczero {
namespace {

class BrowserComputation : public NetworkComputation {
 public:
  explicit BrowserComputation(const NetworkCapabilities& caps) : caps_(caps) {}
  void AddInput(InputPlanes&& input) override {
    if (input.size() != kInputPlanes)
      throw Exception("Unexpected browser network input plane count.");
    inputs_.emplace_back(std::move(input));
  }
  int GetBatchSize() const override { return inputs_.size(); }
  void ComputeBlocking() override {
    const int batch = GetBatchSize();
    if (!batch) return;
    if (batch > 1024) throw Exception("Browser network batch exceeds 1024.");
    std::vector<float> planes(batch * kInputPlanes * 64, 0.0f);
    for (int sample = 0; sample < batch; ++sample) {
      for (int plane = 0; plane < kInputPlanes; ++plane) {
        const auto& input = inputs_[sample][plane];
        for (auto bit : IterateBits(input.mask))
          planes[(sample * kInputPlanes + plane) * 64 + bit] = input.value;
      }
    }
    policy_.resize(batch * 1858);
    values_.resize(batch * (caps_.has_wdl() ? 3 : 1));
    moves_left_.resize(caps_.has_mlh() ? batch : 0);
    std::atomic<int> status{0};
    MAIN_THREAD_ASYNC_EM_ASM({
      Module['browserInference']($0, $1, $2, $3, $4, $5, $6, $7, HEAPU8.buffer);
    }, planes.data(), batch, policy_.data(), values_.data(), moves_left_.data(),
       caps_.has_wdl(), caps_.has_mlh(), &status);
    while (status.load(std::memory_order_acquire) == 0) {
      emscripten_futex_wait(&status, 0, std::numeric_limits<double>::infinity());
    }
    if (status.load(std::memory_order_acquire) != 1)
      throw Exception("Browser inference failed. See worker error for details.");
  }
  float GetQVal(int sample) const override {
    return caps_.has_wdl() ? values_[sample * 3] - values_[sample * 3 + 2]
                           : values_[sample];
  }
  float GetDVal(int sample) const override {
    return caps_.has_wdl() ? values_[sample * 3 + 1] : 0.0f;
  }
  float GetPVal(int sample, int move) const override {
    return policy_[sample * 1858 + move];
  }
  float GetMVal(int sample) const override {
    return caps_.has_mlh() ? moves_left_[sample] : 0.0f;
  }

 private:
  NetworkCapabilities caps_;
  std::vector<InputPlanes> inputs_;
  std::vector<float> policy_;
  std::vector<float> values_;
  std::vector<float> moves_left_;
};

class BrowserNetwork : public Network {
 public:
  explicit BrowserNetwork(const WeightsFile& weights)
      : caps_{weights.format().network_format().input(),
              weights.format().network_format().output(),
              weights.format().network_format().moves_left()} {}
  const NetworkCapabilities& GetCapabilities() const override { return caps_; }
  std::unique_ptr<NetworkComputation> NewComputation() override {
    return std::make_unique<BrowserComputation>(caps_);
  }

 private:
  NetworkCapabilities caps_;
};

std::unique_ptr<Network> MakeBrowserNetwork(
    const std::optional<WeightsFile>& weights, const OptionsDict&) {
  if (!weights || weights->has_onnx_model())
    throw Exception("Browser inference requires original Lc0 protobuf weights.");
  return std::make_unique<BrowserNetwork>(*weights);
}

REGISTER_NETWORK("browser-onnx", MakeBrowserNetwork, -100)

}  // namespace
}  // namespace lczero
