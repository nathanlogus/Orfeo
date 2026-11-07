cmake_minimum_required(VERSION 3.22.1)
project(pliage_piano LANGUAGES CXX)
add_library(pliage_piano SHARED piano.cpp)
target_compile_features(pliage_piano PRIVATE cxx_std_17)
target_compile_options(pliage_piano PRIVATE -Wall -Wextra)
target_link_libraries(pliage_piano aaudio android log dl)
# Android's flexible-page-size devices require 16 KB compatible shared objects.
target_link_options(pliage_piano PRIVATE "-Wl,-z,max-page-size=16384")
