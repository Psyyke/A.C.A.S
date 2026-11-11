// Browser command transport for the upstream Lc0 UCI loop.
// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once

#include <condition_variable>
#include <mutex>
#include <queue>
#include <string>
#include <utility>

#include <emscripten/emscripten.h>

namespace {
std::mutex command_mutex;
std::condition_variable command_available;
std::queue<std::string> command_queue;
}

extern "C" EMSCRIPTEN_KEEPALIVE void lc0_send(const char* command) {
  {
    std::lock_guard<std::mutex> lock(command_mutex);
    command_queue.emplace(command);
  }
  command_available.notify_one();
}

static bool ReadBrowserCommand(std::string* line) {
  std::unique_lock<std::mutex> lock(command_mutex);
  command_available.wait(lock, [] { return !command_queue.empty(); });
  *line = std::move(command_queue.front());
  command_queue.pop();
  return true;
}
