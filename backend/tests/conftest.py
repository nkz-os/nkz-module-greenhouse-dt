"""Ensure backend/ is on sys.path when running tests from the project root."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
