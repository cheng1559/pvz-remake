enable_language(C ASM)
set(DEVELOPMENT_TEAM    ""  CACHE STRING "APPLE Developtment Team")
set(RES_DIR             ""  CACHE STRING "Resource path")
set(COCOS_X_PATH        ""  CACHE STRING "Path to engine/native/")

set(TARGET_OSX_VERSION "12.0" CACHE STRING "Target MacOSX version" FORCE)
set(TARGET_IOS_VERSION "11.0"  CACHE STRING "Target iOS version" FORCE)

set(CMAKE_CXX_STANDARD 17)
option(CC_DEBUG_FORCE           "Force enable CC_DEBUG in release mode" OFF)
option(USE_SE_V8                "Use V8 JavaScript Engine"              ON)
option(USE_SE_JSVM              "Use JSVM JavaScript Engine"            OFF)
option(USE_SE_JSC               "Use JavaScriptCore on MacOSX/iOS"      OFF)
option(USE_V8_DEBUGGER          "Compile v8 inspector ws server"        ON)
option(USE_V8_DEBUGGER_FORCE    "Force enable debugger in release mode" OFF)
option(USE_SOCKET               "Enable WebSocket & SocketIO"           ON)
option(USE_AUDIO                "Enable Audio"                          ON)     #Enable AudioEngine
option(USE_EDIT_BOX             "Enable EditBox"                        ON)
option(USE_VIDEO                "Enable VideoPlayer Component"          ON)
option(USE_WEBVIEW              "Enable WebView Component"              ON)
option(USE_MIDDLEWARE           "Enable Middleware"                     ON)
option(USE_DRAGONBONES          "Enable Dragonbones"                    ON)
option(USE_SPINE_3_8            "Enable Spine 3.8"                      ON)
option(USE_SPINE_4_2            "Enable Spine 4.2"                      OFF)
option(USE_WEBSOCKET_SERVER     "Enable WebSocket Server"               OFF)
option(USE_JOB_SYSTEM_TASKFLOW  "Use taskflow as job system backend"    OFF)
option(USE_JOB_SYSTEM_TBB       "Use tbb as job system backend"         OFF)
option(USE_PHYSICS_PHYSX        "Use PhysX Physics"                     ON)
option(USE_OCCLUSION_QUERY      "Use Occlusion Query"                   ON)
option(USE_DEBUG_RENDERER       "Use Debug Renderer"                    ON)
option(USE_GEOMETRY_RENDERER    "Use Geometry Renderer"                 ON)
option(USE_WEBP                 "Use Webp"                              ON)

# Opt-in only: allow profiling the release JS workload without enabling CC_DEBUG.
if(CMAKE_SYSTEM_NAME STREQUAL "iOS" AND "$ENV{PVZ_JS_PROFILE}" STREQUAL "1")
    set(USE_V8_DEBUGGER_FORCE ON)
    add_compile_definitions(PVZ_JS_PROFILE=1)
endif()

if(NOT RES_DIR)
    message(FATAL_ERROR "RES_DIR is not set!")
endif()

include(${RES_DIR}/proj/cfg.cmake)

if(EXISTS ${CMAKE_CURRENT_LIST_DIR}/localCfg.cmake)
    include(${CMAKE_CURRENT_LIST_DIR}/localCfg.cmake)
endif()

if(NOT COCOS_X_PATH)
    message(FATAL_ERROR "COCOS_X_PATH is not set!")
endif()

if(USE_XR OR USE_AR_MODULE)
    include(${CMAKE_CURRENT_LIST_DIR}/xr.cmake)
endif()

include(${COCOS_X_PATH}/CMakeLists.txt)

# libopenmpt for the module player: the sources its Makefile builds the library from, with minimp3 and stb_vorbis for
# samples a module keeps compressed (tools/music/build.ts builds the same for the web).
set(PVZ_OPENMPT_DIR ${CMAKE_CURRENT_LIST_DIR}/third_party/libopenmpt)
set(PVZ_OPENMPT_SOURCES)
foreach(directory src/openmpt/all src/openmpt/base src/openmpt/logging src/openmpt/random common src/openmpt/fileformat_base
        src/openmpt/soundbase src/openmpt/soundfile_data soundlib soundlib/plugins soundlib/plugins/dmo sounddsp libopenmpt)
    file(GLOB sources CONFIGURE_DEPENDS ${PVZ_OPENMPT_DIR}/${directory}/*.cpp)
    list(APPEND PVZ_OPENMPT_SOURCES ${sources})
endforeach()
add_library(pvz_openmpt STATIC ${PVZ_OPENMPT_SOURCES}
    ${PVZ_OPENMPT_DIR}/include/minimp3/minimp3.c
    ${PVZ_OPENMPT_DIR}/include/stb_vorbis/stb_vorbis.c
)
# Its archive goes under the build folder, as the engine's does: the app links it by that path, also when an Xcode build
# puts its products elsewhere (SYMROOT).
set_target_properties(pvz_openmpt PROPERTIES CXX_STANDARD 17 CXX_STANDARD_REQUIRED ON POSITION_INDEPENDENT_CODE ON
    ARCHIVE_OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/archives)
target_compile_definitions(pvz_openmpt PRIVATE LIBOPENMPT_BUILD MPT_WITH_MINIMP3 MPT_WITH_STBVORBIS STB_VORBIS_NO_PULLDATA_API STB_VORBIS_NO_STDIO
    $<$<PLATFORM_ID:Windows>:UNICODE _UNICODE>)
target_include_directories(pvz_openmpt PRIVATE ${PVZ_OPENMPT_DIR}/src ${PVZ_OPENMPT_DIR}/common ${PVZ_OPENMPT_DIR}/include PUBLIC ${PVZ_OPENMPT_DIR})
target_compile_options(pvz_openmpt PRIVATE $<$<CXX_COMPILER_ID:MSVC>:/bigobj /utf-8 /W0 /Zc:preprocessor /Zc:__cplusplus> $<$<NOT:$<CXX_COMPILER_ID:MSVC>>:-w>)
# The app's target is made after this file, in the platform's CMakeLists.
link_libraries(pvz_openmpt)

list(APPEND CC_COMMON_SOURCES
    ${CMAKE_CURRENT_LIST_DIR}/Classes/Game.h
    ${CMAKE_CURRENT_LIST_DIR}/Classes/Game.cpp
    ${CMAKE_CURRENT_LIST_DIR}/Classes/KernelBindings.cpp
    ${CMAKE_CURRENT_LIST_DIR}/Classes/MusicBindings.cpp
    ${CMAKE_CURRENT_LIST_DIR}/music/pvz_music.h
    ${CMAKE_CURRENT_LIST_DIR}/music/pvz_music.cpp
    ${CMAKE_CURRENT_LIST_DIR}/kernel/pvz_kernel.cpp
    ${CMAKE_CURRENT_LIST_DIR}/kernel/pvz_particles.cpp
    ${CMAKE_CURRENT_LIST_DIR}/kernel/pvz_png.cpp
)

if(CMAKE_SYSTEM_NAME STREQUAL "iOS")
    add_link_options("SHELL:-weak_framework CoreHaptics")
endif()

# Match the WebAssembly build of the same sources. Fused multiply-add can change the tick at
# which a fractional spawn accumulator reaches the next integer.
set_source_files_properties(${CMAKE_CURRENT_LIST_DIR}/kernel/pvz_kernel.cpp ${CMAKE_CURRENT_LIST_DIR}/kernel/pvz_particles.cpp PROPERTIES
    COMPILE_OPTIONS "$<$<CXX_COMPILER_ID:MSVC>:/fp:strict>;$<$<NOT:$<CXX_COMPILER_ID:MSVC>>:-ffp-contract=off>"
)
