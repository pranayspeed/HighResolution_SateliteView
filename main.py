#!/usr/bin/env python3
"""Primary launcher for the high-resolution Cesium top-view utility."""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys


ROOT = Path(__file__).resolve().parent


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Preview or capture photorealistic 3D tiles from a vertical camera."
    )
    subparsers = parser.add_subparsers(dest="command")

    serve = subparsers.add_parser("serve", help="Start the interactive local application.")
    serve.add_argument("--port", type=int, default=3300, help="Local web port (default: 3300).")

    capture = subparsers.add_parser("capture", help="Capture a PNG without using the interface.")
    capture.add_argument(
        "--points",
        required=True,
        help='Coordinates separated by semicolons, for example "43.0,-78.7;43.1,-78.8".',
    )
    capture.add_argument("--buffer", type=float, default=500, help="Buffer in meters.")
    capture.add_argument("--width", type=int, default=3840, help="Output width in pixels.")
    capture.add_argument("--height", type=int, default=2160, help="Output height in pixels.")
    capture.add_argument("--name", default="region", help="Output filename prefix.")
    return parser


def check_runtime() -> str:
    node = shutil.which("node")
    if not node:
        raise SystemExit("Node.js 20 or newer is required but was not found.")
    if not (ROOT / "node_modules" / "playwright-core").is_dir():
        raise SystemExit("Dependencies are missing. Run `npm install` once, then try again.")
    return node


def run_server(node: str, port: int) -> int:
    if not 1 <= port <= 65535:
        raise SystemExit("Port must be between 1 and 65535.")
    environment = os.environ.copy()
    environment["PORT"] = str(port)
    print(f"Opening the utility at http://localhost:{port}")
    try:
        return subprocess.call([node, "server.mjs"], cwd=ROOT, env=environment)
    except KeyboardInterrupt:
        return 0


def run_capture(node: str, args: argparse.Namespace) -> int:
    command = [
        node,
        "scripts/capture.mjs",
        f"--points={args.points}",
        f"--buffer={args.buffer}",
        f"--width={args.width}",
        f"--height={args.height}",
        f"--name={args.name}",
    ]
    return subprocess.call(command, cwd=ROOT)


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    node = check_runtime()
    if args.command == "capture":
        return run_capture(node, args)
    return run_server(node, getattr(args, "port", 3300))


if __name__ == "__main__":
    sys.exit(main())
