#!/usr/bin/env python3
"""Small ctypes wrapper for the libopenmpt APIs needed by the music pipeline."""

from __future__ import annotations

import ctypes
import os
import sys
from ctypes import c_char_p, c_double, c_int, c_int32, c_size_t, c_void_p
from pathlib import Path


class OpenMptError(RuntimeError):
    pass


INTERACTIVE_ID = b"interactive"

_FN_INT_INT = ctypes.CFUNCTYPE(c_int, c_void_p, c_int32)
_FN_INT_DOUBLE = ctypes.CFUNCTYPE(c_int, c_void_p, c_double)
_FN_DOUBLE = ctypes.CFUNCTYPE(c_double, c_void_p)
_FN_INT_INT_DOUBLE = ctypes.CFUNCTYPE(c_int, c_void_p, c_int32, c_double)
_FN_DOUBLE_INT = ctypes.CFUNCTYPE(c_double, c_void_p, c_int32)
_FN_INT_INT_INT = ctypes.CFUNCTYPE(c_int, c_void_p, c_int32, c_int)
_FN_NOTE = ctypes.CFUNCTYPE(c_int32, c_void_p, c_int32, c_int32, c_double, c_double)


class InteractiveInterface(ctypes.Structure):
    _fields_ = [
        ("set_current_speed", _FN_INT_INT),
        ("set_current_tempo", _FN_INT_INT),
        ("set_tempo_factor", _FN_INT_DOUBLE),
        ("get_tempo_factor", _FN_DOUBLE),
        ("set_pitch_factor", _FN_INT_DOUBLE),
        ("get_pitch_factor", _FN_DOUBLE),
        ("set_global_volume", _FN_INT_DOUBLE),
        ("get_global_volume", _FN_DOUBLE),
        ("set_channel_volume", _FN_INT_INT_DOUBLE),
        ("get_channel_volume", _FN_DOUBLE_INT),
        ("set_channel_mute_status", _FN_INT_INT_INT),
        ("get_channel_mute_status", ctypes.CFUNCTYPE(c_int, c_void_p, c_int32)),
        ("set_instrument_mute_status", _FN_INT_INT_INT),
        ("get_instrument_mute_status", ctypes.CFUNCTYPE(c_int, c_void_p, c_int32)),
        ("play_note", _FN_NOTE),
        ("stop_note", _FN_INT_INT),
    ]


def _candidate_library_names() -> list[str]:
    if sys.platform == "win32":
        return ["libopenmpt-0.dll", "libopenmpt.dll", "openmpt.dll"]
    if sys.platform == "darwin":
        return ["libopenmpt.dylib", "libopenmpt.0.dylib"]
    return ["libopenmpt.so", "libopenmpt.so.0"]


def _candidate_paths() -> list[Path]:
    paths: list[Path] = []
    env_path = os.environ.get("LIBOPENMPT_PATH")
    if env_path:
        paths.append(Path(env_path))

    if sys.platform == "win32":
        search_dirs = [
            Path.cwd(),
            Path("C:/msys64/mingw64/bin"),
            Path("C:/msys64/ucrt64/bin"),
            Path("C:/Program Files/OpenMPT"),
        ]
    elif sys.platform == "darwin":
        search_dirs = [
            Path("/opt/homebrew/lib"),
            Path("/usr/local/lib"),
            Path("/usr/lib"),
        ]
    else:
        search_dirs = [
            Path("/usr/local/lib"),
            Path("/usr/lib"),
            Path("/usr/lib/x86_64-linux-gnu"),
        ]

    for directory in search_dirs:
        for name in _candidate_library_names():
            paths.append(directory / name)
    return paths


def resolve_libopenmpt(explicit_path: str | None = None) -> str:
    if explicit_path:
        path = Path(explicit_path)
        if not path.exists():
            raise OpenMptError(f"libopenmpt path does not exist: {path}")
        return str(path)

    for name in _candidate_library_names():
        try:
            ctypes.CDLL(name)
            return name
        except OSError:
            pass

    for path in _candidate_paths():
        if path.exists():
            return str(path)

    names = ", ".join(_candidate_library_names())
    raise OpenMptError(
        "Could not find libopenmpt dynamic library. Install libopenmpt for the build machine "
        f"or pass --libopenmpt /path/to/{names}."
    )


class OpenMptLibrary:
    def __init__(self, path: str | None = None):
        self.path = resolve_libopenmpt(path)
        self._dll_directory_handle = self._add_dll_directory(self.path)
        self.lib = ctypes.CDLL(self.path)
        self._bind()

    @staticmethod
    def _add_dll_directory(path: str):
        if sys.platform != "win32" or not hasattr(os, "add_dll_directory"):
            return None

        library_path = Path(path)
        if not library_path.parent or str(library_path.parent) == ".":
            return None

        return os.add_dll_directory(str(library_path.parent))

    def _bind(self) -> None:
        lib = self.lib

        lib.openmpt_free_string.argtypes = [c_char_p]
        lib.openmpt_free_string.restype = None

        lib.openmpt_module_ext_create_from_memory.argtypes = [
            c_void_p,
            c_size_t,
            c_void_p,
            c_void_p,
            c_void_p,
            c_void_p,
            ctypes.POINTER(c_int),
            ctypes.POINTER(c_char_p),
            c_void_p,
        ]
        lib.openmpt_module_ext_create_from_memory.restype = c_void_p

        lib.openmpt_module_ext_destroy.argtypes = [c_void_p]
        lib.openmpt_module_ext_destroy.restype = None

        lib.openmpt_module_ext_get_module.argtypes = [c_void_p]
        lib.openmpt_module_ext_get_module.restype = c_void_p

        lib.openmpt_module_ext_get_interface.argtypes = [c_void_p, c_char_p, c_void_p, c_size_t]
        lib.openmpt_module_ext_get_interface.restype = c_int

        lib.openmpt_module_set_repeat_count.argtypes = [c_void_p, c_int32]
        lib.openmpt_module_set_repeat_count.restype = c_int

        lib.openmpt_module_get_duration_seconds.argtypes = [c_void_p]
        lib.openmpt_module_get_duration_seconds.restype = c_double

        lib.openmpt_module_read_interleaved_stereo.argtypes = [c_void_p, c_int32, c_size_t, c_void_p]
        lib.openmpt_module_read_interleaved_stereo.restype = c_size_t

        lib.openmpt_module_get_num_channels.argtypes = [c_void_p]
        lib.openmpt_module_get_num_channels.restype = c_int32

        lib.openmpt_module_get_num_orders.argtypes = [c_void_p]
        lib.openmpt_module_get_num_orders.restype = c_int32

        lib.openmpt_module_is_order_skip_entry.argtypes = [c_void_p, c_int32]
        lib.openmpt_module_is_order_skip_entry.restype = c_int

        lib.openmpt_module_is_order_stop_entry.argtypes = [c_void_p, c_int32]
        lib.openmpt_module_is_order_stop_entry.restype = c_int

        lib.openmpt_module_get_order_pattern.argtypes = [c_void_p, c_int32]
        lib.openmpt_module_get_order_pattern.restype = c_int32

        lib.openmpt_module_get_pattern_num_rows.argtypes = [c_void_p, c_int32]
        lib.openmpt_module_get_pattern_num_rows.restype = c_int32

        lib.openmpt_module_get_time_at_position.argtypes = [c_void_p, c_int32, c_int32]
        lib.openmpt_module_get_time_at_position.restype = c_double

        lib.openmpt_module_set_position_order_row.argtypes = [c_void_p, c_int32, c_int32]
        lib.openmpt_module_set_position_order_row.restype = c_double

    def open_module(self, path: Path) -> "OpenMptModule":
        return OpenMptModule(self, path)


class OpenMptModule:
    def __init__(self, library: OpenMptLibrary, path: Path):
        self.library = library
        self.path = path
        data = path.read_bytes()
        self._buffer = ctypes.create_string_buffer(data)
        error = c_int(0)
        error_message = c_char_p()
        self.ext = library.lib.openmpt_module_ext_create_from_memory(
            self._buffer,
            len(data),
            None,
            None,
            None,
            None,
            ctypes.byref(error),
            ctypes.byref(error_message),
            None,
        )
        if not self.ext:
            message = error_message.value.decode("utf-8", errors="replace") if error_message.value else "unknown error"
            if error_message.value:
                library.lib.openmpt_free_string(error_message)
            raise OpenMptError(f"Failed to load {path}: {message} (error {error.value})")

        self.module = library.lib.openmpt_module_ext_get_module(self.ext)
        if not self.module:
            self.close()
            raise OpenMptError(f"Failed to retrieve module handle for {path}")

        self.interactive = InteractiveInterface()
        ok = library.lib.openmpt_module_ext_get_interface(
            self.ext,
            INTERACTIVE_ID,
            ctypes.byref(self.interactive),
            ctypes.sizeof(self.interactive),
        )
        if not ok:
            self.close()
            raise OpenMptError("libopenmpt interactive interface is unavailable")

        library.lib.openmpt_module_set_repeat_count(self.module, 0)

    def __enter__(self) -> "OpenMptModule":
        return self

    def __exit__(self, *_args: object) -> None:
        self.close()

    def close(self) -> None:
        if getattr(self, "ext", None):
            self.library.lib.openmpt_module_ext_destroy(self.ext)
            self.ext = None
            self.module = None

    @property
    def duration_seconds(self) -> float:
        return float(self.library.lib.openmpt_module_get_duration_seconds(self.module))

    @property
    def channel_count(self) -> int:
        return int(self.library.lib.openmpt_module_get_num_channels(self.module))

    def set_channel_mutes(self, active_channels: set[int]) -> None:
        count = self.channel_count
        missing = [channel for channel in active_channels if channel < 0 or channel >= count]
        if missing:
            raise OpenMptError(
                f"{self.path.name} has {count} channels, cannot enable out-of-range channels: {missing}"
            )

        for channel in range(count):
            muted = 0 if channel in active_channels else 1
            ok = self.interactive.set_channel_mute_status(self.ext, channel, muted)
            if not ok:
                raise OpenMptError(f"Failed to set mute status for channel {channel} in {self.path}")

    def read_interleaved_stereo(self, sample_rate: int, frame_count: int, buffer: ctypes.Array) -> int:
        return int(
            self.library.lib.openmpt_module_read_interleaved_stereo(
                self.module,
                sample_rate,
                frame_count,
                buffer,
            )
        )

    def set_position_order_row(self, order: int, row: int = 0) -> float:
        return float(self.library.lib.openmpt_module_set_position_order_row(self.module, order, row))

    def burst_boundaries_seconds(self, row_group_size: int = 32) -> list[float]:
        duration = self.duration_seconds
        boundaries: list[float] = []
        num_orders = int(self.library.lib.openmpt_module_get_num_orders(self.module))
        for order in range(num_orders):
            if self.library.lib.openmpt_module_is_order_skip_entry(self.module, order):
                continue
            if self.library.lib.openmpt_module_is_order_stop_entry(self.module, order):
                break

            pattern = int(self.library.lib.openmpt_module_get_order_pattern(self.module, order))
            rows = int(self.library.lib.openmpt_module_get_pattern_num_rows(self.module, pattern))
            if rows <= 0:
                continue

            for row in range(0, rows, row_group_size):
                seconds = float(self.library.lib.openmpt_module_get_time_at_position(self.module, order, row))
                if 0.05 < seconds < duration - 0.05:
                    boundaries.append(seconds)

        unique: list[float] = []
        for seconds in sorted(boundaries):
            if not unique or abs(seconds - unique[-1]) > 0.01:
                unique.append(round(seconds, 6))
        return unique
