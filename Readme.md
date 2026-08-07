# HighResolution SateliteView

A standalone local utility for capturing a true top-down image of Google
Photorealistic 3D Tiles around one or more geographic locations.

The utility:

- accepts one `latitude, longitude` pair per line;
- displays every target as a numbered, clickable marker in the interactive Cesium view;
- expands the complete point-set bounds by a buffer in meters;
- masks all tiles outside the buffered rectangle;
- uses a zero-roll, negative-90-degree top camera;
- supports exact 4K, 5K, 8K, and HD PNG or PDF output;
- preserves Cesium/provider credits and adds a clear acknowledgment at the image edge;
- stores captures in `output/`.

## Interactive use

```bash
cd /Users/pranayspeed/Work/git_repo/HighResolution_SateliteView
npm install
python3 main.py
```

Open <http://localhost:3300>, enter the locations and buffer, preview the
bounds, choose PNG or PDF, then select **Save top view**.

Create or copy an access token from the official
[Cesium ion Access Tokens guide](https://cesium.com/learn/ion/cesium-ion-access-tokens/).
For this viewer, the token needs the public `assets:read` scope. Then set the
token in `.env.local` before starting the utility:

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
  --format=pdf \
  --name=example-region
```

Buffer distance is applied beyond the minimum and maximum latitude and
longitude of all supplied locations.

The Python entry point manages the application and capture commands. CesiumJS
and a local headless Chrome renderer generate the photorealistic tile image.

## Citing this software

If this utility contributes to published work, please cite the archived release
used in the study. GitHub also reads [`CITATION.cff`](CITATION.cff) and provides
a **Cite this repository** button with downloadable citation formats.

```bibtex
@software{pranayspeed_high_resolution_satellite_view_2026,
  author  = {Meshram, Pranay},
  title   = {High-Resolution Satellite View},
  year    = {2026},
  version = {1.0.0},
  url     = {https://github.com/pranayspeed/HighResolution_SateliteView}
}
```

Plain-text citation:

> Meshram, P. (2026). *High-Resolution Satellite View* (Version 1.0.0)
> [Computer software].
> https://github.com/pranayspeed/HighResolution_SateliteView

The CesiumJS and imagery-provider credits shown by the application acknowledge
the visualization platform and map data; they do not replace citation of this
repository as software.
