/****************************************************************************
 Copyright (c) 2017-2018 Xiamen Yaji Software Co., Ltd.

 http://www.cocos.com

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated engine source code (the "Software"), a limited,
 worldwide, royalty-free, non-assignable, revocable and non-exclusive license
 to use Cocos Creator solely to develop games on your target platforms. You
 shall not use Cocos Creator software for developing other software or tools
 that's used for developing games. You are not granted to publish, distribute,
 sublicense, and/or sell copies of Cocos Creator.

 The software or tools in this License Agreement are licensed, not sold.
 Xiamen Yaji Software Co., Ltd. reserves all rights not expressly granted to
 you.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
 ****************************************************************************/
#include "Game.h"
#include "bindings/jswrapper/SeApi.h"

bool registerPvzKernel(se::Object* global);

#ifndef SCRIPT_XXTEAKEY
#define SCRIPT_XXTEAKEY "";
#endif

#if CC_PLATFORM == CC_PLATFORM_WINDOWS || CC_PLATFORM == CC_PLATFORM_MACOS
#define PVZ_REMEMBER_WINDOW 1
#include <SDL2/SDL.h>
#include <cstdio>
#include "platform/FileUtils.h"
#include "platform/interfaces/modules/ISystemWindow.h"

namespace {
// Like the original's PreferredX/PreferredY registry values; the remake's window can also be resized.
struct WindowPlacement {
  int x{0}, y{0}, width{0}, height{0};
};
WindowPlacement placement; // The last normal placement this run.
bool placementChanged{false};

ccstd::string placementFile(cc::FileUtils *files) { return files->getWritablePath() + "window.txt"; }

/** The saved placement, if its top edge is still on a display: monitors can change between runs. */
bool loadPlacement(WindowPlacement &saved) {
  // The window is created before Engine::init makes FileUtils; createFileUtils() returns that same instance later.
  cc::FileUtils *files = cc::createFileUtils();
  const auto text = files->getStringFromFile(placementFile(files));
  if (std::sscanf(text.c_str(), "%d %d %d %d", &saved.x, &saved.y, &saved.width, &saved.height) != 4 ||
      saved.width <= 0 || saved.height <= 0) {
    return false;
  }
  const SDL_Point top{saved.x + saved.width / 2, saved.y};
  for (int display = 0; display < SDL_GetNumVideoDisplays(); ++display) {
    SDL_Rect bounds;
    if (SDL_GetDisplayUsableBounds(display, &bounds) == 0 && SDL_PointInRect(&top, &bounds)) return true;
  }
  return false;
}

/** Follows moves and resizes in memory; fullscreen, maximized and minimized windows keep the last normal placement. */
int SDLCALL trackPlacement(void * /*userData*/, SDL_Event *event) {
  if (event->type != SDL_WINDOWEVENT || event->window.windowID != cc::ISystemWindow::mainWindowId ||
      (event->window.event != SDL_WINDOWEVENT_MOVED && event->window.event != SDL_WINDOWEVENT_SIZE_CHANGED)) {
    return 0;
  }
  SDL_Window *window = SDL_GetWindowFromID(event->window.windowID);
  if (!window || (SDL_GetWindowFlags(window) & (SDL_WINDOW_FULLSCREEN | SDL_WINDOW_MAXIMIZED | SDL_WINDOW_MINIMIZED))) {
    return 0;
  }
  SDL_GetWindowPosition(window, &placement.x, &placement.y);
  SDL_GetWindowSize(window, &placement.width, &placement.height);
  placementChanged = true;
  return 0;
}

/** Written on close (the window's close button, in-game quit, or Cmd+Q, which macOS turns into a close event). */
void savePlacement() {
  // The engine may already have released FileUtils when the app is destroyed.
  cc::FileUtils *files = cc::FileUtils::getInstance();
  if (!placementChanged || !files) return;
  placementChanged = false;
  char text[64];
  std::snprintf(text, sizeof(text), "%d %d %d %d", placement.x, placement.y, placement.width, placement.height);
  files->writeStringToFile(text, placementFile(files));
}
} // namespace
#endif

Game::Game() = default;

#if PVZ_REMEMBER_WINDOW
Game::~Game() {
  SDL_DelEventWatch(trackPlacement, nullptr);
  savePlacement(); // In case the app ends without a close event.
}
#else
Game::~Game() = default;
#endif

int Game::init() {
  _windowInfo.title = "Plants vs. Zombies";
#if PVZ_REMEMBER_WINDOW
  // Reopen where the window was last left; otherwise the engine centres an 800x600 window.
  WindowPlacement saved;
  if (loadPlacement(saved)) {
    _windowInfo.x = saved.x;
    _windowInfo.y = saved.y;
    _windowInfo.width = saved.width;
    _windowInfo.height = saved.height;
  }
  SDL_AddEventWatch(trackPlacement, nullptr);
#endif

#if CC_DEBUG || defined(PVZ_JS_PROFILE)
  _debuggerInfo.enabled = true;
#else
  _debuggerInfo.enabled = false;
#endif
  _debuggerInfo.port = 6086;
  _debuggerInfo.address = "0.0.0.0";
  _debuggerInfo.pauseOnStart = false;

  _xxteaKey = SCRIPT_XXTEAKEY;

  se::ScriptEngine::getInstance()->addPermanentRegisterCallback(registerPvzKernel);

  BaseGame::init();
  return 0;
}

void Game::onPause() { BaseGame::onPause(); }

void Game::onResume() { BaseGame::onResume(); }

void Game::onClose() {
#if PVZ_REMEMBER_WINDOW
  savePlacement();
#endif
  BaseGame::onClose();
}

CC_REGISTER_APPLICATION(Game);
