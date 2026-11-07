#pragma once
#include <algorithm>
#include <array>
#include <vector>

namespace pliage {
struct Event { double time; int track, status, a, b; };
struct ChannelState { int program = 0, bank = 0, volume = 127, expression = 127, sustain = 0, pan = 64, bend = 8192; };
using Chase = std::array<ChannelState, 16>;
inline void chaseEvent(Chase& state, const Event& e) {
    if (e.status >= 0xf0) return;
    auto& c = state[e.status & 15];
    if ((e.status & 0xf0) == 0xc0) c.program = e.a;
    if ((e.status & 0xf0) == 0xe0) c.bend = e.a | (e.b << 7);
    if ((e.status & 0xf0) != 0xb0) return;
    switch (e.a) {
        case 0: c.bank = e.b << 7; break;
        case 32: c.bank = (c.bank & 0x3f80) | e.b; break;
        case 7: c.volume = e.b; break;
        case 11: c.expression = e.b; break;
        case 64: c.sustain = e.b; break;
        case 10: c.pan = e.b; break;
    }
}
struct Song {
    std::vector<Event> events;
    std::vector<Chase> checkpoints;
    double duration = 0;
    explicit Song(std::vector<Event> data, double length) : events(std::move(data)), duration(length) {
        std::stable_sort(events.begin(), events.end(), [](const Event& a, const Event& b) { return a.time < b.time; });
        Chase state;
        for (size_t i = 0; i < events.size(); i++) {
            if (i % 256 == 0) checkpoints.push_back(state);
            chaseEvent(state, events[i]);
        }
        if (events.empty() || events.size() % 256 == 0) checkpoints.push_back(state);
    }
    size_t indexAt(double time) const {
        return std::lower_bound(events.begin(), events.end(), time, [](const Event& e, double t) { return e.time < t; }) - events.begin();
    }
    Chase stateAt(size_t index) const {
        Chase state = checkpoints[index / 256];
        for (size_t i = index / 256 * 256; i < index; i++) chaseEvent(state, events[i]);
        return state;
    }
};
}
