"""Build the arena props (docs/arenas/ARENAS_SPEC.md "Blender asset list").

    blender --background --factory-startup --python tools/blender/arenas/build_arenas.py
    blender ... --python tools/blender/arenas/build_arenas.py -- car_tuner ferris_wheel   (subset)

GLBs -> public/models/props/ and public/models/arenas/<district>/, previews -> docs/models/arenas/,
stats -> tools/blender/arenas/build_report.json (used for docs/arenas/PROPS.md).
"""
import importlib
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))

MODULES = ["shared_props", "strand", "docks", "trap", "crown", "tower", "neon"]


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    builders = {}
    for mod in MODULES:
        try:
            m = importlib.import_module(mod)
        except ModuleNotFoundError as e:
            if e.name == mod:
                continue
            raise
        builders.update(m.BUILDERS)
    rp = os.path.join(HERE, "build_report.json")
    report = json.load(open(rp)) if os.path.exists(rp) else {}
    for name in (argv or list(builders)):
        report[name] = builders[name]()
        json.dump(report, open(rp, "w"), indent=1)
    print("\n==== arena props ====")
    for n, r in report.items():
        print("%-18s %5d tris %7.1f KB  %s" % (n, r["tris"], r["bytes"] / 1024, r["path"]))


main()
