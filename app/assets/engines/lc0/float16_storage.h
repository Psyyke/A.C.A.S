// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once

#include <cstdint>
#include <cstring>
#include <iterator>
#include <string>
#include <utility>

#include "neural/onnx/onnx.pb.h"
#include "utils/exception.h"

namespace lczero {

// Keep compact weights on disk, but never round activations or reductions to f16.
inline void PromoteFloat16Weights(pblczero::ModelProto* model) {
  auto* graph = model->mutable_graph();
  auto nodes = std::move(*graph->mutable_node());
  graph->mutable_node()->clear();
  for (auto& tensor : *graph->mutable_initializer()) {
    if (tensor.data_type() != pblczero::TensorProto::FLOAT16) continue;
    const std::string name(tensor.name());
    const auto& bytes = tensor.raw_data();
    if (bytes.size() % sizeof(uint16_t))
      throw Exception("Invalid float16 initializer: " + name);
    for (size_t i = 0; i < bytes.size(); i += sizeof(uint16_t)) {
      uint16_t value;
      std::memcpy(&value, bytes.data() + i, sizeof(value));
      if ((value & 0x7c00) == 0x7c00)
        throw Exception("Non-finite float16 weight: " + name);
    }
    tensor.set_name(name + "/acas_fp16_storage");
    auto* cast = graph->add_node();
    cast->set_name(name + "/acas_fp32_cast");
    cast->set_op_type("Cast");
    cast->add_input(tensor.name());
    cast->add_output(name);
    auto* type = cast->add_attribute();
    type->set_name("to");
    type->set_type(pblczero::AttributeProto::INT);
    type->set_i(pblczero::TensorProto::FLOAT);
  }
  auto* output = graph->mutable_node();
  output->insert(output->end(), std::make_move_iterator(nodes.begin()),
                 std::make_move_iterator(nodes.end()));
}

}  // namespace lczero
