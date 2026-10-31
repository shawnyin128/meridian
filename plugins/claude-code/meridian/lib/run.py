"""Runs a module of the Meridian core bundled beside this file: `python run.py <module> [args...]`.

The bundled core and PyYAML come first on the import path, so neither an installed core nor the
active project's virtual environment can replace them.
"""

import runpy
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
module = sys.argv[1]
sys.argv = [sys.argv[0], *sys.argv[2:]]
runpy.run_module(module, run_name="__main__", alter_sys=True)
