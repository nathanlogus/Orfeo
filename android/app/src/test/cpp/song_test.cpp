#include "song.h"
#include <cassert>
#include <iostream>
int main() {
    std::vector<pliage::Event> events;
    events.push_back({0, 0, 0xc0, 3, 0});
    events.push_back({.01, 0, 0xb0, 7, 80});
    for (int i = 0; i < 600; i++) events.push_back({i + 1., 0, 0x90, 60, 50});
    events.push_back({257.5, 0, 0xb0, 11, 45});
    events.push_back({513.5, 0, 0xc0, 8, 0});
    pliage::Song song(std::move(events), 601);
    auto start = song.stateAt(song.indexAt(0));
    assert(start[0].program == 0);
    auto mid = song.stateAt(song.indexAt(300));
    assert(mid[0].program == 3 && mid[0].volume == 80 && mid[0].expression == 45);
    auto late = song.stateAt(song.indexAt(600));
    assert(late[0].program == 8 && late[0].volume == 80 && late[0].expression == 45);
    assert(song.events[song.indexAt(257.5)].time == 257.5);
    pliage::Song empty({}, 0);
    assert(empty.indexAt(1) == 0 && empty.stateAt(0)[0].volume == 127);
    std::vector<pliage::Event> boundary(256, {0, 0, 0xb0, 7, 64});
    pliage::Song exact(std::move(boundary), 1);
    assert(exact.stateAt(exact.indexAt(2))[0].volume == 64);
    std::cout << "Android song: checkpoint/seek checks passed\n";
}
