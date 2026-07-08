import sys
from pathlib import Path


def base_dir() -> Path:
    """Directory where the app's data should live: next to the exe when
    frozen by PyInstaller, next to this source file otherwise."""
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent.parent


def db_path() -> Path:
    return base_dir() / "suivi_cyclisme.db"
