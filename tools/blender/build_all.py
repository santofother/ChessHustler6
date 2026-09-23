"""Build every Grand Theft Chess model: GLBs -> public/models, previews -> docs/models.

    blender --background --factory-startup --python tools/blender/build_all.py
"""
import importlib
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

MODELS = ["pawn", "knight", "bishop", "rook", "queen", "king",
          "palm", "fence", "barrier", "streetlight"]


def main():
    only = [a for a in sys.argv[sys.argv.index("--") + 1:]] if "--" in sys.argv else []
    results = []
    for name in (only or MODELS):
        mod = importlib.import_module(name)
        results.append(mod.build())
    print("\n==== Grand Theft Chess models ====")
    for r in results:
        flag = "" if r["tris"] < 3000 else "  (!) over 3k tris"
        print("%-12s %5d tris  %6.1f KB%s" % (r["name"], r["tris"], r["bytes"] / 1024.0, flag))


main()
