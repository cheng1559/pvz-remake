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
#include "PvzNativeBridge.h"
#include "platform/interfaces/modules/ISystemWindow.h"
#include "storage/local-storage/LocalStorage.h"

#if CC_PLATFORM == CC_PLATFORM_WINDOWS
#include <shlobj.h>
#include <windows.h>

#include <string>
#elif CC_PLATFORM == CC_PLATFORM_MACOS
#include <cstdlib>
#endif

#ifndef PVZ_APP_DISPLAY_NAME
#define PVZ_APP_DISPLAY_NAME "Plants vs. Zombies"
#endif

#ifndef SCRIPT_XXTEAKEY
#define SCRIPT_XXTEAKEY "";
#endif

namespace {
constexpr const char* SETTINGS_KEY = "pvz-remake:settings:options";
constexpr int DEFAULT_WINDOW_WIDTH = 800;
constexpr int DEFAULT_WINDOW_HEIGHT = 600;

ccstd::string startupLocalStoragePath() {
#if CC_PLATFORM == CC_PLATFORM_WINDOWS
  wchar_t fullPath[MAX_PATH + 1] = {};
  const DWORD length = GetModuleFileNameW(nullptr, fullPath, MAX_PATH);
  if (length == 0 || length >= MAX_PATH) return "";

  std::wstring path;
  wchar_t* baseName = wcsrchr(fullPath, L'\\');
  if (baseName) {
    wchar_t appDataPath[MAX_PATH + 1] = {};
    if (SUCCEEDED(SHGetFolderPathW(nullptr, CSIDL_LOCAL_APPDATA, nullptr, SHGFP_TYPE_CURRENT, appDataPath))) {
      path = appDataPath;
      path += baseName;

      const auto extension = path.rfind(L".");
      if (extension != std::wstring::npos) path = path.substr(0, extension);
      path += L"\\";
      if (FAILED(SHCreateDirectoryExW(nullptr, path.c_str(), nullptr))) path.clear();
    }
  }

  if (path.empty()) {
    path = fullPath;
    path = path.substr(0, path.rfind(L"\\") + 1);
  }

  char sqlitePath[(MAX_PATH + 1) * 4] = {};
  const int sqlitePathLength = WideCharToMultiByte(
      CP_UTF8, 0, path.c_str(), -1, sqlitePath, sizeof(sqlitePath), nullptr, nullptr);
  if (sqlitePathLength <= 0) return "";

  return ccstd::string(sqlitePath) + "jsb.sqlite";
#elif CC_PLATFORM == CC_PLATFORM_MACOS
  const char* home = std::getenv("HOME");
  if (!home || !home[0]) return "";
  return ccstd::string(home) + "/Documents/jsb.sqlite";
#else
  return "";
#endif
}

#if CC_PLATFORM == CC_PLATFORM_WINDOWS
void centerStartupWindow(int width, int height, int* x, int* y) {
  RECT workArea = {};
  if (!SystemParametersInfoW(SPI_GETWORKAREA, 0, &workArea, 0)) return;

  RECT windowRect = {0, 0, width, height};
  AdjustWindowRect(&windowRect, WS_OVERLAPPEDWINDOW & ~(WS_THICKFRAME | WS_MAXIMIZEBOX), FALSE);

  const int windowWidth = windowRect.right - windowRect.left;
  const int windowHeight = windowRect.bottom - windowRect.top;
  *x = workArea.left + ((workArea.right - workArea.left) - windowWidth) / 2;
  *y = workArea.top + ((workArea.bottom - workArea.top) - windowHeight) / 2;
}
#endif

bool isStartupFullScreenEnabled() {
#if CC_PLATFORM == CC_PLATFORM_WINDOWS || CC_PLATFORM == CC_PLATFORM_MACOS
  const ccstd::string storagePath = startupLocalStoragePath();
  if (storagePath.empty()) return false;

  localStorageInit(storagePath);

  ccstd::string settings;
  return localStorageGetItem(SETTINGS_KEY, &settings) &&
         settings.find("\"fullScreen\":true") != ccstd::string::npos;
#else
  return false;
#endif
}
}  // namespace

Game::Game() = default;

int Game::init() {
  _windowInfo.title = PVZ_APP_DISPLAY_NAME;
  // configurate window size
  // _windowInfo.height = 600;
  // _windowInfo.width  = 800;

  _windowInfo.width = _windowInfo.width == -1 ? DEFAULT_WINDOW_WIDTH : _windowInfo.width;
  _windowInfo.height = _windowInfo.height == -1 ? DEFAULT_WINDOW_HEIGHT : _windowInfo.height;

  if (isStartupFullScreenEnabled()) {
    _windowInfo.flags = cc::ISystemWindow::CC_WINDOW_SHOWN |
                        cc::ISystemWindow::CC_WINDOW_INPUT_FOCUS |
                        cc::ISystemWindow::CC_WINDOW_FULLSCREEN_DESKTOP;
#if CC_PLATFORM == CC_PLATFORM_WINDOWS
    _windowInfo.flags |= cc::ISystemWindow::CC_WINDOW_RESIZABLE;
#endif
  } else {
    _windowInfo.flags = cc::ISystemWindow::CC_WINDOW_SHOWN |
                        cc::ISystemWindow::CC_WINDOW_INPUT_FOCUS;
#if CC_PLATFORM == CC_PLATFORM_WINDOWS
    centerStartupWindow(_windowInfo.width, _windowInfo.height, &_windowInfo.x, &_windowInfo.y);
#endif
  }

#if CC_DEBUG
  _debuggerInfo.enabled = true;
#else
  _debuggerInfo.enabled = false;
#endif
  _debuggerInfo.port = 6086;
  _debuggerInfo.address = "0.0.0.0";
  _debuggerInfo.pauseOnStart = false;

  _xxteaKey = SCRIPT_XXTEAKEY;

  RegisterPvzNativeBindings();
  BaseGame::init();
  ApplyPvzWindowStyle();
  return 0;
}

void Game::onPause() { BaseGame::onPause(); }

void Game::onResume() { BaseGame::onResume(); }

void Game::onClose() { BaseGame::onClose(); }

CC_REGISTER_APPLICATION(Game);
