const app = document.querySelector("#app");
const pointsInput = document.querySelector("#points");
const bufferInput = document.querySelector("#buffer");
const regionNameInput = document.querySelector("#regionName");
const resolutionInput = document.querySelector("#resolution");
const previewButton = document.querySelector("#preview");
const captureButton = document.querySelector("#capture");
const status = document.querySelector("#status");
const errorPanel = document.querySelector(".error");
const params = new URLSearchParams(location.search);

if (params.get("capture") === "1") document.body.classList.add("capture");

const token = window.CESIUM_TOP_VIEW_CONFIG?.ionToken?.trim();
if (!token) {
  errorPanel.hidden = false;
  errorPanel.textContent = "Cesium ion token is not configured.";
  app.dataset.ready = "true";
  throw new Error("Cesium ion token is not configured");
}

Cesium.Ion.defaultAccessToken = token;
const viewer = new Cesium.Viewer("cesiumContainer", {
  animation:false, timeline:false, homeButton:false, geocoder:false,
  baseLayerPicker:false, navigationHelpButton:false, sceneModePicker:false,
  fullscreenButton:false, infoBox:false, selectionIndicator:false,
  terrainProvider:new Cesium.EllipsoidTerrainProvider(), globe:false, baseLayer:false,
  contextOptions:{ webgl:{ preserveDrawingBuffer:true, antialias:true } },
});
viewer.scene.backgroundColor = Cesium.Color.WHITE;
viewer.scene.skyAtmosphere.show = false;
if (viewer.scene.skyBox) viewer.scene.skyBox.show = false;
if (viewer.scene.sun) viewer.scene.sun.show = false;
if (viewer.scene.moon) viewer.scene.moon.show = false;
viewer.scene.screenSpaceCameraController.enableCollisionDetection = false;
viewer.cesiumWidget.creditContainer.style.display = "none";

function parsePoints(value) {
  const rows = value.split(/[;\n]+/).map((row) => row.trim()).filter(Boolean);
  if (!rows.length) throw new Error("Enter at least one latitude, longitude pair.");
  return rows.map((row, index) => {
    const values = row.split(/[\s,]+/).filter(Boolean).map(Number);
    if (values.length !== 2 || !values.every(Number.isFinite)) {
      throw new Error(`Location ${index + 1} must contain latitude and longitude.`);
    }
    const [latitude, longitude] = values;
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      throw new Error(`Location ${index + 1} is outside valid geographic ranges.`);
    }
    return { latitude, longitude };
  });
}

function bufferedBounds(points, bufferMeters) {
  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);
  const centerLatitude = (Math.min(...latitudes) + Math.max(...latitudes)) / 2;
  const latitudeBuffer = bufferMeters / 111320;
  const longitudeBuffer = bufferMeters / Math.max(1, 111320 * Math.cos(Cesium.Math.toRadians(centerLatitude)));
  return {
    west:Math.max(-180, Math.min(...longitudes) - longitudeBuffer),
    south:Math.max(-89.999, Math.min(...latitudes) - latitudeBuffer),
    east:Math.min(180, Math.max(...longitudes) + longitudeBuffer),
    north:Math.min(89.999, Math.max(...latitudes) + latitudeBuffer),
  };
}

function dimensionsMeters(bounds) {
  const meanLatitude = (bounds.south + bounds.north) / 2;
  return {
    width:(bounds.east - bounds.west) * 111320 * Math.cos(Cesium.Math.toRadians(meanLatitude)),
    height:(bounds.north - bounds.south) * 111320,
  };
}

let tileset;
let clippingPolygons;
let loadingTimer;

function waitForTiles(timeoutMs = 30000) {
  return new Promise((resolveReady) => {
    let settled = false;
    let quietTimer;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(quietTimer);
      removeListener();
      resolveReady();
    };
    const removeListener = tileset.loadProgress.addEventListener((pending, processing) => {
      clearTimeout(quietTimer);
      if (pending === 0 && processing === 0) quietTimer = setTimeout(finish, 1800);
    });
    loadingTimer = setTimeout(finish, timeoutMs);
  }).finally(() => clearTimeout(loadingTimer));
}

function installClipping(bounds) {
  if (!Cesium.ClippingPolygonCollection.isSupported(viewer.scene)) return;
  if (clippingPolygons && !clippingPolygons.isDestroyed?.()) {
    tileset.clippingPolygons = undefined;
    clippingPolygons.destroy();
  }
  clippingPolygons = new Cesium.ClippingPolygonCollection({
    polygons:[new Cesium.ClippingPolygon({
      positions:Cesium.Cartesian3.fromDegreesArray([
        bounds.west,bounds.south,
        bounds.east,bounds.south,
        bounds.east,bounds.north,
        bounds.west,bounds.north,
      ]),
    })],
    inverse:true, enabled:true, quality:2,
  });
  tileset.clippingPolygons = clippingPolygons;
}

async function applyRegion(points, bufferMeters) {
  window.__CESIUM_CAPTURE_READY = false;
  const bounds = bufferedBounds(points, bufferMeters);
  installClipping(bounds);
  viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  viewer.camera.setView({
    destination:Cesium.Rectangle.fromDegrees(bounds.west,bounds.south,bounds.east,bounds.north),
    orientation:{ heading:0, pitch:Cesium.Math.toRadians(-90), roll:0 },
  });
  viewer.scene.requestRender();
  const size = dimensionsMeters(bounds);
  status.textContent = `${points.length} location${points.length === 1 ? "" : "s"} · ${Math.round(size.width).toLocaleString()} × ${Math.round(size.height).toLocaleString()} m · ${bufferMeters.toLocaleString()} m buffer`;
  window.__CESIUM_CAPTURE_BOUNDS = bounds;
  await waitForTiles(params.get("capture") === "1" ? 45000 : 30000);
  viewer.render();
  window.__CESIUM_CAPTURE_READY = true;
  return bounds;
}

function currentConfig() {
  const points = parsePoints(pointsInput.value);
  const buffer = Math.max(0, Number(bufferInput.value) || 0);
  const [width, height] = resolutionInput.value.split("x").map(Number);
  return { points, buffer, width, height, name:regionNameInput.value.trim() || "region" };
}

previewButton.addEventListener("click", async () => {
  try {
    previewButton.disabled = true;
    status.textContent = "Loading the buffered region…";
    const config = currentConfig();
    await applyRegion(config.points, config.buffer);
  } catch (error) {
    status.textContent = error.message;
  } finally {
    previewButton.disabled = false;
  }
});

captureButton.addEventListener("click", async () => {
  try {
    const config = currentConfig();
    captureButton.disabled = true;
    captureButton.textContent = "Capturing…";
    status.textContent = `Rendering ${config.width} × ${config.height} pixels. This can take up to a minute.`;
    const response = await fetch("/capture", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body:JSON.stringify({
        points:config.points.map((point) => `${point.latitude},${point.longitude}`).join(";"),
        buffer:config.buffer, width:config.width, height:config.height, name:config.name,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Capture failed");
    const anchor = document.createElement("a");
    anchor.href = result.downloadUrl;
    anchor.download = result.filename;
    anchor.click();
    status.textContent = `Saved ${result.filename}`;
  } catch (error) {
    status.textContent = error.message;
  } finally {
    captureButton.disabled = false;
    captureButton.textContent = "Capture high-resolution PNG";
  }
});

tileset = await Cesium.createGooglePhotorealistic3DTileset();
tileset.maximumScreenSpaceError = params.get("capture") === "1" ? 2 : 8;
tileset.dynamicScreenSpaceError = false;
tileset.preloadWhenHidden = true;
tileset.preloadFlightDestinations = true;
viewer.scene.primitives.add(tileset);

const initialPointsText = params.get("points") || "34.4750,-116.2800;34.4800,-116.2700";
const initialBuffer = Math.max(0, Number(params.get("buffer")) || 500);
pointsInput.value = initialPointsText.replaceAll(";", "\n");
bufferInput.value = String(initialBuffer);
if (params.get("name")) regionNameInput.value = params.get("name");
const initialResolution = `${params.get("width") || 3840}x${params.get("height") || 2160}`;
if ([...resolutionInput.options].some((option) => option.value === initialResolution)) resolutionInput.value = initialResolution;

try {
  await applyRegion(parsePoints(pointsInput.value), initialBuffer);
  app.dataset.ready = "true";
} catch (error) {
  app.dataset.ready = "true";
  errorPanel.hidden = false;
  errorPanel.textContent = error.message;
}
