#include "effects.h"
#include <cassert>
#include <chrono>
#include <iostream>
#include <cstdlib>
#include <new>
static bool inProcess = false;
void* operator new(std::size_t n) { assert(!inProcess); if (auto p = std::malloc(n)) return p; throw std::bad_alloc(); }
void operator delete(void* p) noexcept { std::free(p); }
void operator delete(void* p, std::size_t) noexcept { std::free(p); }
int main() {
    for (int rate : {44100, 48000, 96000}) {
        pliage::Effects fx; fx.prepare(rate);
        float dry[192]{}; dry[0] = .5f; dry[1] = -.25f;
        inProcess = true; fx.process(dry, 96); inProcess = false;
        assert(dry[0] == .5f && dry[1] == -.25f); // dry attack is not delayed
        for (int i = 2; i < 192; i++) assert(dry[i] == 0);
        fx.setReverb(1); fx.setChorus(1); fx.setTone(12); fx.setCompressor(true, 4);
        double energy = 0; auto begin = std::chrono::steady_clock::now();
        for (int block = 0; block < 1500; block++) {
            float audio[192]{};
            if (block < 500) for (int i = 0; i < 96; i++) audio[i * 2] = audio[i * 2 + 1] = .4f * std::sin((block * 96 + i) * .057f);
            inProcess = true; fx.process(audio, 96); inProcess = false;
            for (float x : audio) { assert(std::isfinite(x) && std::fabs(x) < 8); if (block >= 500) energy += x * x; }
        }
        assert(energy > .0001); // room/chorus continue after note release
        std::cout << rate << " Hz: 3s processing in " << std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - begin).count() << " ms\n";
    }
}
