# HighResolution SateliteView

A standalone local utility for capturing a true top-down image of Google
Photorealistic 3D Tiles around one or more geographic locations.

The utility:

- accepts one `latitude, longitude` pair per line;
- expands the complete point-set bounds by a buffer in meters;
- masks all tiles outside the buffered rectangle;
- uses a zero-roll, negative-90-degree top camera;
- supports exact 4K, 5K, 8K, and HD PNG output;
- stores captures in `output/`.

## Interactive use

```bash
cd /Users/pranayspeed/Work/git_repo/HighResolution_SateliteView
npm install
python3 main.py
```

Open <http://localhost:3300>, enter the locations and buffer, preview the
bounds, then select **Capture high-resolution PNG**.

Set a Cesium ion token in `.env.local` before starting the utility:

```text
CESIUM_ION_TOKEN=your_token_here
```

The local `.env.local` file is excluded from Git.

You can choose a different port with `python3 main.py serve --port 3400`.

## Direct capture with Python

```bash
python3 main.py capture \
  --points="34.4750,-116.2800;34.4800,-116.2700" \
  --buffer=500 \
  --width=3840 \
  --height=2160 \
  --name=example-region
```

Buffer distance is applied beyond the minimum and maximum latitude and
longitude of all supplied locations.

The Python entry point manages the application and capture commands. CesiumJS
and a local headless Chrome renderer generate the photorealistic tile image.
