"""Ensure the backend app package is importable when running tests from the project root.

The _datak_gateway.pth file in the user site-packages adds DaTaK/backend to sys.path,
which shadows this module's app package unless backend/ is explicitly on sys.path.
"""
import sys
from pathlib import Path

BACKEND_DIR = str(Path(__file__).resolve().parent.parent)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)
