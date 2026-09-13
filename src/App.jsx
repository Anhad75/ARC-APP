import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";
import { loadLocalPath, loadLocalRecords, loadQueuedMutations, removeQueuedMutation, queueMutation, saveLocalPath, saveLocalRecords } from "./storage.js";

const STORAGE_KEY = "field-notes-records";
const PATH_KEY = "field-notes-path";
const SETTINGS_KEY = "field-notes-settings";
const API_URL = import.meta.env.VITE_AUTH_URL || "";
const materials = ["Pottery", "Bone", "Beads", "Lithics", "Metal", "Charcoal"];
const burialTypes = ["Pit", "Cist", "Urn", "Cairn", "Sarcophagus", "Extended"];
const conditions = [
  "Intact",
  "Partially Disturbed",
  "Heavily Eroded",
  "Looted",
];
const emptyForm = {
  siteName: "",
  district: "Kangra",
  state: "Himachal Pradesh",
  date: new Date().toISOString().slice(0, 10),
  burialNo: "BUR-2026-004",
  burialType: "Pit",
  latitude: "32.2436",
  longitude: "77.1892",
  elevation: "1921",
  sizeEW: "",
  sizeNS: "",
  condition: "Intact",
  materials: [],
  remark: "",
  photos: [],
};
const seedRecords = [
  {
    id: "BUR-2026-003",
    siteName: "Terrace 04 / Burial 03",
    burialType: "Cist",
    condition: "Partially Disturbed",
    date: "2026-09-12",
    latitude: 32.2421,
    longitude: 77.1905,
    elevation: 1919,
    materials: ["Bone", "Pottery"],
    synced: true,
  },
  {
    id: "BUR-2026-002",
    siteName: "North Ridge / Burial 02",
    burialType: "Pit",
    condition: "Intact",
    date: "2026-09-11",
    latitude: 32.2444,
    longitude: 77.1877,
    elevation: 1927,
    materials: ["Lithics"],
    synced: true,
  },
  {
    id: "BUR-2026-001",
    siteName: "Lower Field / Burial 01",
    burialType: "Extended",
    condition: "Heavily Eroded",
    date: "2026-09-10",
    latitude: 32.2413,
    longitude: 77.1886,
    elevation: 1916,
    materials: ["Bone", "Beads"],
    synced: true,
  },
];

function distanceBetween(first, second) {
  const earthRadius = 6371;
  const latitudeDelta = (second.lat - first.lat) * Math.PI / 180;
  const longitudeDelta = (second.lng - first.lng) * Math.PI / 180;
  const latitude = first.lat * Math.PI / 180;
  const secondLatitude = second.lat * Math.PI / 180;
  const value = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(latitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function pathDistance(points) {
  return points.slice(1).reduce((total, point, index) => total + distanceBetween(points[index], point), 0);
}

function LeafletMap({ records, path, currentLocation, onLocate, onPick, center }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const initialCenterRef = useRef(center);
  const onPickRef = useRef(onPick);
  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);
  useEffect(() => {
    const map = L.map(containerRef.current, { zoomControl: false }).setView(initialCenterRef.current, 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap contributors" }).addTo(map);
    L.control.zoom({ position: "topright" }).addTo(map);
    map.on("click", (event) => onPickRef.current(event.latlng.lat, event.latlng.lng));
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    return () => map.remove();
  }, []);
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    records.forEach((record) => {
      const latitude = Number(record.latitude);
      const longitude = Number(record.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
      L.circleMarker([latitude, longitude], { radius: 8, color: "#fffdf8", fillColor: "#c8785b", fillOpacity: 1, weight: 2 })
        .bindPopup(`<strong>${record.id}</strong><br>${record.siteName}<br>${record.condition}`)
        .addTo(layer);
    });
    const validPath = path.filter((point) => Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng))).map((point) => [Number(point.lat), Number(point.lng)]);
    if (validPath.length > 1) L.polyline(validPath, { color: "#526b87", weight: 4 }).addTo(layer);
    if (currentLocation) {
      L.circleMarker([currentLocation.latitude, currentLocation.longitude], { radius: 7, color: "#fffdf8", fillColor: "#526b87", fillOpacity: 1, weight: 2 }).bindPopup("Current GPS position").addTo(layer);
      map.setView([currentLocation.latitude, currentLocation.longitude], Math.max(map.getZoom(), 15));
    }
  }, [records, path, currentLocation]);
  return (
    <div className="leaflet-map-wrap">
      <div ref={containerRef} className="leaflet-map" />
      <button type="button" className="map-locate-button" aria-label="Locate me" onClick={onLocate}>⌖</button>
    </div>
  );
}

function App({ user, onSignOut }) {
  const [records, setRecords] = useState([]);
  const [path, setPath] = useState([]);
  const [storageReady, setStorageReady] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [activeView, setActiveView] = useState("field");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("Ready for field capture");
  const [settings, setSettings] = useState(() => JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null") || { fontSize: "medium", font: "trebuchet", theme: "light" });
  const watchId = useRef(null);
  const syncInProgress = useRef(false);

  async function syncQueuedChanges() {
    if (!navigator.onLine || syncInProgress.current) return;
    syncInProgress.current = true;
    try {
      const mutations = await loadQueuedMutations();
      for (const mutation of mutations) {
        const endpoint = mutation.kind === "delete"
          ? `${API_URL}/api/records/${encodeURIComponent(mutation.recordId)}`
          : mutation.kind === "update"
            ? `${API_URL}/api/records/${encodeURIComponent(mutation.recordId)}`
            : `${API_URL}/api/records`;
        const response = await fetch(endpoint, {
          method: mutation.kind === "delete" ? "DELETE" : mutation.kind === "update" ? "PUT" : "POST",
          headers: mutation.kind === "delete" ? undefined : { "Content-Type": "application/json" },
          credentials: "include",
          body: mutation.kind === "delete" ? undefined : JSON.stringify(mutation.payload),
        });
        if (!response.ok) throw new Error("Sync request failed");
        await removeQueuedMutation(mutation.sequence);
      }
      if (mutations.length) {
        const response = await fetch(`${API_URL}/api/records`, { credentials: "include" });
        if (response.ok) setRecords(await response.json());
        setNotice("Offline changes synced to the cloud");
      }
    } catch {
      setNotice("Some offline changes are waiting for the next connection");
    } finally {
      syncInProgress.current = false;
    }
  }

  useEffect(() => {
    let active = true;
    Promise.all([loadLocalRecords(), loadLocalPath()]).then(([localRecords, localPath]) => {
      if (!active) return;
      const legacyRecords = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      const legacyPath = JSON.parse(localStorage.getItem(PATH_KEY) || "[]");
      const recordsToUse = localRecords.length ? localRecords : legacyRecords || seedRecords;
      const pathToUse = localPath.length ? localPath : legacyPath;
      setRecords(recordsToUse);
      setPath(pathToUse);
      setStorageReady(true);
      if (!localRecords.length) {
        saveLocalRecords(recordsToUse);
        saveLocalPath(pathToUse);
      }
    }).catch(() => setNotice("Local storage could not be opened"));
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (storageReady) saveLocalRecords(records);
  }, [records, storageReady]);
  useEffect(() => {
      if (storageReady) saveLocalPath(path);
  }, [path, storageReady]);
  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);
  useEffect(() => {
    if (!storageReady) return;
    async function loadCloudRecords() {
      await syncQueuedChanges();
      const queued = await loadQueuedMutations();
      if (queued.length) return;
      const response = await fetch(`${API_URL}/api/records`, { credentials: "include" });
      if (!response.ok) throw new Error("Records could not be loaded");
      setRecords(await response.json());
    }
    loadCloudRecords().catch(() => setNotice("Cloud records unavailable - local records remain available"));
  }, [storageReady]);
  useEffect(() => {
    const onlineHandler = () => {
      setOnline(true);
      setNotice("Connection restored - local queue ready to sync");
      syncQueuedChanges();
    };
    const offlineHandler = () => {
      setOnline(false);
      setNotice("Offline mode - records stay safely on this device");
    };
    window.addEventListener("online", onlineHandler);
    window.addEventListener("offline", offlineHandler);
    return () => {
      window.removeEventListener("online", onlineHandler);
      window.removeEventListener("offline", offlineHandler);
      if (watchId.current) navigator.geolocation?.clearWatch(watchId.current);
    };
  }, []);

  const filteredRecords = useMemo(
    () =>
      records.filter((record) =>
        `${record.id} ${record.siteName} ${record.condition}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [records, search],
  );
  const syncedCount = records.filter((record) => record.synced).length;
  function updateForm(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }
  function toggleMaterial(material) {
    setForm({
      ...form,
      materials: form.materials.includes(material)
        ? form.materials.filter((item) => item !== material)
        : [...form.materials, material],
    });
  }
  function captureLocation() {
    if (!navigator.geolocation) {
      setNotice("Geolocation is not available in this browser");
      return;
    }
    setNotice("Reading GPS location...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const accuracy = Math.round(position.coords.accuracy);
        setForm({
          ...form,
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6),
          elevation: position.coords.altitude
            ? Math.round(position.coords.altitude).toString()
            : form.elevation,
        });
        setCurrentLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy });
        setNotice(`Coordinates captured with ±${accuracy}m accuracy`);
      },
      (error) => {
        const message = error.code === error.TIMEOUT
          ? "GPS took too long - move outdoors and try again"
          : "GPS permission unavailable - allow precise location and try again";
        setNotice(message);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  }
  function autoFillFieldDetails() {
    if (!navigator.geolocation) {
      setNotice("Geolocation is not available in this browser");
      return;
    }
    setNotice("Reading GPS and resolving district/state...");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude, altitude, accuracy } = position.coords;
        const date = new Date().toISOString().slice(0, 10);
        setCurrentLocation({ latitude, longitude, accuracy });
        setForm((current) => ({
          ...current,
          date,
          latitude: latitude.toFixed(6),
          longitude: longitude.toFixed(6),
          elevation: altitude ? Math.round(altitude).toString() : current.elevation,
        }));
        try {
          const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=10&addressdetails=1`);
          if (!response.ok) throw new Error("Reverse geocoding failed");
          const result = await response.json();
          const address = result.address || {};
          const district = address.state_district || address.district || address.county || address.city_district;
          setForm((current) => ({ ...current, district: district || current.district, state: address.state || current.state }));
          setNotice(`Details filled with ±${Math.round(accuracy)}m GPS accuracy`);
        } catch {
          setNotice(`GPS and date filled, but district/state lookup failed (±${Math.round(accuracy)}m)`);
        }
      },
      (error) => setNotice(error.code === error.TIMEOUT ? "GPS took too long - move outdoors and try again" : "GPS permission unavailable - allow precise location and try again"),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  }
  function toggleTracking() {
    if (tracking) {
      if (watchId.current) navigator.geolocation?.clearWatch(watchId.current);
      watchId.current = null;
      setTracking(false);
      setNotice("Pathway saved locally");
      return;
    }
    if (!navigator.geolocation) {
      setNotice("Geolocation is not available in this browser");
      return;
    }
    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        setCurrentLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy });
        setPath((current) => {
          const nextPoint = { lat: position.coords.latitude, lng: position.coords.longitude, timestamp: new Date().toISOString(), elevation: position.coords.altitude };
          const previousPoint = current[current.length - 1];
          return previousPoint && distanceBetween(previousPoint, nextPoint) < 0.002 ? current : [...current, nextPoint];
        });
      },
      () => {
        setTracking(false);
        watchId.current = null;
        setNotice("GPS tracking needs location permission");
      },
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
    setTracking(true);
    setNotice("Tracking pathway in the background");
  }
  function pickMapLocation(latitude, longitude) {
    setCurrentLocation((current) => current || { latitude, longitude, accuracy: 0 });
    setForm((current) => ({ ...current, latitude: latitude.toFixed(6), longitude: longitude.toFixed(6) }));
    setNotice(`Map coordinate selected: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
  }
  async function handlePhotos(event) {
    const compressed = await Promise.all(
      [...event.target.files].map((file) => compressImage(file)),
    );
    setForm({ ...form, photos: [...form.photos, ...compressed] });
    setNotice(
      `${compressed.length} photo${compressed.length > 1 ? "s" : ""} compressed and queued locally`,
    );
  }
  function compressImage(file) {
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1, 1920 / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = image.width * scale;
        canvas.height = image.height * scale;
        canvas
          .getContext("2d")
          .drawImage(image, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          const reader = new FileReader();
          reader.onload = () => resolve({ name: file.name.replace(/\.[^.]+$/, ".webp"), size: blob?.size || file.size, url: reader.result });
          reader.readAsDataURL(blob || file);
        }, "image/webp", 0.75);
      };
      image.src = URL.createObjectURL(file);
    });
  }
  function openNewForm() {
    setEditingId(null);
    setForm({
      ...emptyForm,
      burialNo: `BUR-2026-${String(records.length + 4).padStart(3, "0")}`,
    });
    setShowForm(true);
  }
  function openEditForm(record) {
    setEditingId(record.id);
    setForm({
      ...emptyForm,
      ...record,
      burialNo: record.id,
      latitude: String(record.latitude),
      longitude: String(record.longitude),
      elevation: String(record.elevation),
      photos: record.photos || [],
    });
    setShowForm(true);
  }
  async function deleteRecord(record) {
    if (!window.confirm(`Delete ${record.id}? This cannot be undone.`)) return;
    let savedOnline = online;
    if (savedOnline) {
      try {
        const response = await fetch(`${API_URL}/api/records/${encodeURIComponent(record.id)}`, { method: "DELETE", credentials: "include" });
        if (!response.ok) { setNotice("Record could not be deleted from the database"); return; }
      } catch {
        savedOnline = false;
      }
    }
    if (!savedOnline) {
      await queueMutation("delete", record.id);
    }
    setRecords((current) => current.filter((item) => item.id !== record.id));
    setNotice(savedOnline ? `${record.id} deleted` : `${record.id} removed locally and queued for sync`);
  }
  async function saveRecord(event) {
    event.preventDefault();
    if (!form.siteName || !form.burialNo) {
      setNotice("Site name and burial number are required");
      return;
    }
    const savedRecord = {
      ...form,
      id: form.burialNo,
      latitude: Number(form.latitude),
      longitude: Number(form.longitude),
      elevation: Number(form.elevation),
      synced: online,
    };
    let savedOnline = online;
    if (savedOnline) {
      const endpoint = editingId ? `${API_URL}/api/records/${encodeURIComponent(editingId)}` : `${API_URL}/api/records`;
      try {
        const response = await fetch(endpoint, { method: editingId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(savedRecord) });
        if (!response.ok) { setNotice("Record could not be saved to the database"); return; }
      } catch {
        savedOnline = false;
        savedRecord.synced = false;
      }
    }
    if (!savedOnline) {
      await queueMutation(editingId ? "update" : "create", editingId || savedRecord.id, savedRecord);
    }
    setRecords((current) => editingId ? current.map((record) => record.id === editingId ? savedRecord : record) : [savedRecord, ...current]);
    setForm({
      ...emptyForm,
      burialNo: `BUR-2026-${String(records.length + 4).padStart(3, "0")}`,
    });
    setEditingId(null);
    setShowForm(false);
    setNotice(
      editingId
        ? savedOnline ? `${savedRecord.id} updated` : `${savedRecord.id} updated locally and queued for sync`
        : savedOnline
          ? "Record saved and marked for cloud sync"
          : "Record saved to offline queue",
    );
  }
  function download(filename, content, type) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([content], { type }));
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }
  function exportCSV() {
    const headings = [
      "Burial No.",
      "Site Name",
      "Date",
      "Burial Type",
      "Condition",
      "Latitude",
      "Longitude",
      "Elevation",
      "Materials",
    ];
    const rows = records.map((r) => [
      r.id,
      r.siteName,
      r.date,
      r.burialType,
      r.condition,
      r.latitude,
      r.longitude,
      r.elevation,
      r.materials.join("; "),
    ]);
    download(
      "field-notes-records.csv",
      [headings, ...rows]
        .map((row) =>
          row
            .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
            .join(","),
        )
        .join("\n"),
      "text/csv",
    );
  }
  function exportKML() {
    const placemarks = records
      .map(
        (r) =>
          `<Placemark><name>${r.id} - ${r.siteName}</name><description>${r.condition}, ${r.burialType}</description><Point><coordinates>${r.longitude},${r.latitude},${r.elevation}</coordinates></Point></Placemark>`,
      )
      .join("");
    download(
      "field-notes-records.kml",
      `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Field Notes</name>${placemarks}</Document></kml>`,
      "application/vnd.google-earth.kml+xml",
    );
  }
  const mapCenter = records.length
    ? [Number(records[0].latitude) || 32.2436, Number(records[0].longitude) || 77.1892]
    : [32.2436, 77.1892];

  return (
    <div className={`app-shell theme-${settings.theme} font-${settings.font} size-${settings.fontSize}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">FN</span>
          <span>
            <strong>FIELD NOTES</strong>
            <small>Archaeological archive</small>
          </span>
        </div>
        <nav>
          <button
            className={activeView === "field" ? "nav-item active" : "nav-item"}
            onClick={() => setActiveView("field")}
          >
            <span>⊙</span> Field workspace
          </button>
          <button
            className={
              activeView === "records" ? "nav-item active" : "nav-item"
            }
            onClick={() => setActiveView("records")}
          >
            <span>▤</span> Records archive <em>{records.length}</em>
          </button>
          <button
            className="nav-item"
            onClick={() =>
              setNotice(
                "Map downloads will be connected to Leaflet tile caching next",
              )
            }
          >
            <span>⌁</span> Offline maps
          </button>
          <button className={activeView === "profile" ? "nav-item active" : "nav-item"} onClick={() => setActiveView("profile")}>
            <span>◎</span> My profile
          </button>
          <button className={activeView === "settings" ? "nav-item active" : "nav-item"} onClick={() => setActiveView("settings")}>
            <span>⚙</span> Settings
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="sync-box">
            <span
              className={online ? "status-dot online" : "status-dot"}
            ></span>
            <div>
              <strong>{online ? "Online" : "Offline mode"}</strong>
              <small>
                {online
                  ? `${syncedCount} records synced`
                  : "Local capture enabled"}
              </small>
            </div>
          </div>
          <div className="profile">
            <span className="avatar">{(user?.name || user?.email || "FN").slice(0, 2).toUpperCase()}</span>
            <div>
              <strong>{user?.name || user?.phone || "Field archaeologist"}</strong>
              <small>{user?.phone || "Mobile account"}</small>
            </div>
            <button type="button" className="sign-out-button" onClick={onSignOut}>Sign out</button>
          </div>
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <div>
            <span className="eyebrow">FIELD WORKSPACE</span>
            <h1>
              {activeView === "records" ? "Records archive" : activeView === "profile" ? "My profile" : activeView === "settings" ? "Settings" : `Good morning, ${user?.name?.split(" ")[0] || "there"}`}
            </h1>
            <p>
              {activeView === "records" ? "Review, search and export your field observations." : activeView === "profile" ? "Your account and complete field record history." : activeView === "settings" ? "Personalize how Field Notes looks and feels." : "Your field log is ready. Capture the next observation."}
            </p>
          </div>
          <div className="top-actions">
            <span className="last-sync">
              <span className="status-dot online"></span> Last sync 08:42
            </span>
            <button className="icon-btn" aria-label="Notifications">
              ♢<i></i>
            </button>
            <button
              className="primary-button"
              onClick={openNewForm}
            >
              ＋ New record
            </button>
          </div>
        </header>
        <div className="notice">
          <span>✦</span>
          {notice}
          <button onClick={() => setNotice("Ready for field capture")}>
            ×
          </button>
        </div>
        {activeView === "field" ? (
          <>
            <section className="stats-grid">
              <div className="stat-card">
                <span className="stat-label">SITE RECORDS</span>
                <strong>{records.length}</strong>
                <small>
                  <b className="green-text">↑ 3</b> this field season
                </small>
                <span className="stat-icon ochre">⌖</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">PATHWAY DISTANCE</span>
                <strong>
                  {pathDistance(path).toFixed(2)} <small>km</small>
                </strong>
                <small>
                  <b className="green-text">● Live</b> GPS session
                </small>
                <span className="stat-icon blue">⌁</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">LOCAL QUEUE</span>
                <strong>
                  {records.filter((record) => !record.synced).length || 0}
                </strong>
                <small>
                  <b className="ochre-text">Waiting</b> for network sync
                </small>
                <span className="stat-icon coral">↥</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">FIELD DAYS</span>
                <strong>04</strong>
                <small>
                  <b className="green-text">↑ 12%</b> vs last week
                </small>
                <span className="stat-icon violet">◷</span>
              </div>
            </section>
            <section className="workspace-grid">
              <div className="panel map-panel">
                <div className="panel-heading">
                  <div>
                    <span className="section-kicker">SPATIAL OVERVIEW</span>
                    <h2>Excavation area</h2>
                  </div>
                  <button
                    className="text-button"
                    onClick={() =>
                      setNotice("Map area download queued for offline use")
                    }
                  >
                    Download area ↧
                  </button>
                </div>
                <div className="map-canvas">
                  <LeafletMap records={records} path={path} currentLocation={currentLocation} onLocate={captureLocation} onPick={pickMapLocation} center={mapCenter} />
                </div>
              </div>
              <div className="panel tracking-panel">
                <div className="panel-heading">
                  <div>
                    <span className="section-kicker">PATHWAY TRACKING</span>
                    <h2>Today's route</h2>
                  </div>
                  <span
                    className={tracking ? "live-badge tracking" : "live-badge"}
                  >
                    <i></i>
                    {tracking ? "Recording" : "Ready"}
                  </span>
                </div>
                <div className="route-summary">
                  <strong>
                    {pathDistance(path).toFixed(2)} <small>km</small>
                  </strong>
                  <span>Estimated distance</span>
                  <div className="route-line">
                    <i></i>
                    <i></i>
                    <i></i>
                    <i></i>
                    <i></i>
                  </div>
                  <div className="route-meta">
                    <span>
                      08:14 <small>Start</small>
                    </span>
                    <span>
                      {tracking ? "Now" : "08:42"} <small>Latest point</small>
                    </span>
                  </div>
                  <div className="live-coordinate">
                    {currentLocation
                      ? `Live: ${currentLocation.latitude.toFixed(6)}, ${currentLocation.longitude.toFixed(6)} (±${Math.round(currentLocation.accuracy)}m)`
                      : "Live coordinates appear after GPS permission is granted"}
                  </div>
                </div>
                <button
                  className={
                    tracking ? "tracking-button stop" : "tracking-button"
                  }
                  onClick={toggleTracking}
                >
                  {tracking ? "■ Stop tracking" : "▶ Start tracking"}
                </button>
                <p className="helper-text">
                  GPS points are saved locally every 3–5 seconds.
                </p>
              </div>
            </section>
            <section className="lower-grid">
              <div className="panel records-panel">
                <div className="panel-heading">
                  <div>
                    <span className="section-kicker">RECENT OBSERVATIONS</span>
                    <h2>
                      Field records{" "}
                      <span className="count-pill">{records.length}</span>
                    </h2>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => setActiveView("records")}
                  >
                    View archive →
                  </button>
                </div>
                <div className="record-list">
                  {records.slice(0, 3).map((record) => (
                    <div className="record-row" key={record.id}>
                      <span className="record-marker">⌖</span>
                      <div className="record-main">
                        <strong>{record.siteName}</strong>
                        <span>
                          {record.id} <i>·</i> {record.date}
                        </span>
                      </div>
                      <span className="type-tag">{record.burialType}</span>
                      <span className="condition">
                        <i></i>
                        {record.condition}
                      </span>
                      <span className="record-coords">
                        {Number(record.latitude).toFixed(4)}° N<br />
                        {Number(record.longitude).toFixed(4)}° E
                      </span>
                      <div className="record-actions">
                        <button className="row-action" onClick={() => openEditForm(record)}>Edit</button>
                        <button className="row-action danger" onClick={() => deleteRecord(record)}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="panel capture-panel">
                <div className="section-kicker">QUICK CAPTURE</div>
                <h2>Log what you see.</h2>
                <p>
                  Create a complete burial record with coordinates, dimensions,
                  materials and compressed photographs.
                </p>
                <button
                  className="primary-button full"
                  onClick={openNewForm}
                >
                  Open site form <span>→</span>
                </button>
                <div className="capture-note">
                  <span>◎</span>
                  <div>
                    <strong>Works offline</strong>
                    <small>
                      Every field note is stored on this device first.
                    </small>
                  </div>
                </div>
              </div>
            </section>
          </>
        ) : activeView === "records" ? (
          <section className="panel archive-panel">
            <div className="archive-toolbar">
              <div className="search-box">
                ⌕
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search records, sites or conditions"
                />
              </div>
              <button className="secondary-button" onClick={exportCSV}>
                Export CSV ↓
              </button>
              <button className="secondary-button" onClick={exportKML}>
                Export KML ↓
              </button>
            </div>
            <div className="archive-table">
              <div className="table-head">
                <span>RECORD</span>
                <span>LOCATION</span>
                <span>TYPE</span>
                <span>CONDITION</span>
                <span>SYNC</span>
              </div>
              {filteredRecords.map((record) => (
                <div className="table-row" key={record.id}>
                  <div>
                    <strong>{record.id}</strong>
                    <small>{record.siteName}</small>
                  </div>
                  <span>
                    {Number(record.latitude).toFixed(4)}° N<br />
                    {Number(record.longitude).toFixed(4)}° E
                  </span>
                  <span className="type-tag">{record.burialType}</span>
                  <span className="condition">
                    <i></i>
                    {record.condition}
                  </span>
                  <span className={record.synced ? "synced" : "queued"}>
                    {record.synced ? "Synced" : "Queued"}
                  </span>
                  <div className="record-actions">
                    <button className="row-action" onClick={() => openEditForm(record)}>Edit</button>
                    <button className="row-action danger" onClick={() => deleteRecord(record)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : activeView === "profile" ? (
          <section className="profile-view">
            <div className="profile-hero panel">
              <span className="avatar large">{(user?.name || user?.email || "FN").slice(0, 2).toUpperCase()}</span>
              <div><span className="section-kicker">SIGNED-IN ACCOUNT</span><h2>{user?.name || "Field researcher"}</h2><p>{user?.phone || "Mobile account"}</p></div>
              <button type="button" className="secondary-button" onClick={onSignOut}>Log out</button>
            </div>
            <div className="panel profile-records"><div className="panel-heading"><div><span className="section-kicker">YOUR ARCHIVE</span><h2>All your records <span className="count-pill">{records.length}</span></h2></div></div>{records.map((record) => <div className="profile-record" key={record.id}><div><strong>{record.id}</strong><small>{record.siteName} · {record.date}</small></div><span className="type-tag">{record.burialType}</span><button className="row-action" onClick={() => openEditForm(record)}>Edit</button></div>)}</div>
          </section>
        ) : (
          <section className="settings-view">
            <div className="panel settings-panel"><span className="section-kicker">APPEARANCE</span><h2>Workspace settings</h2><label>Font size<select value={settings.fontSize} onChange={(event) => setSettings({ ...settings, fontSize: event.target.value })}><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select></label><label>Font format<select value={settings.font} onChange={(event) => setSettings({ ...settings, font: event.target.value })}><option value="trebuchet">Trebuchet</option><option value="georgia">Georgia</option><option value="verdana">Verdana</option></select></label><label>Theme<select value={settings.theme} onChange={(event) => setSettings({ ...settings, theme: event.target.value })}><option value="light">Light</option><option value="dusk">Dusk</option><option value="contrast">High contrast</option></select></label></div>
            <div className="panel settings-panel"><span className="section-kicker">ACCOUNT</span><h2>{user?.name || user?.phone}</h2><p className="helper-text">Records are stored in MongoDB under your signed-in mobile account.</p><button type="button" className="secondary-button" onClick={onSignOut}>Log out</button></div>
          </section>
        )}
      </main>
      {showForm && (
        <div className="modal-backdrop">
          <form className="record-form" onSubmit={saveRecord}>
            <div className="form-header">
              <div>
                <span className="section-kicker">{editingId ? "EDIT FIELD OBSERVATION" : "NEW FIELD OBSERVATION"}</span>
                <h2>{editingId ? "Edit burial record" : "Burial & site form"}</h2>
                <button type="button" className="location-button auto-fill-button" onClick={autoFillFieldDetails}>⌖ Auto-fill date, district and state</button>
              </div>
              <button
                type="button"
                className="close-button"
                onClick={() => setShowForm(false)}
              >
                ×
              </button>
            </div>
            <div className="form-scroll">
              <div className="form-grid">
                <label>
                  Site name
                  <input
                    required
                    name="siteName"
                    value={form.siteName}
                    onChange={updateForm}
                    placeholder="e.g. Terrace 05 / Burial 04"
                  />
                </label>
                <label>
                  Burial number
                  <input
                    required
                    name="burialNo"
                    value={form.burialNo}
                    onChange={updateForm}
                  />
                </label>
                <label>
                  District
                  <input
                    name="district"
                    value={form.district}
                    onChange={updateForm}
                  />
                </label>
                <label>
                  State / province
                  <input
                    name="state"
                    value={form.state}
                    onChange={updateForm}
                  />
                </label>
                <label>
                  Date
                  <input
                    type="date"
                    name="date"
                    value={form.date}
                    onChange={updateForm}
                  />
                </label>
                <label>
                  Burial type
                  <select
                    name="burialType"
                    value={form.burialType}
                    onChange={updateForm}
                  >
                    {burialTypes.map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="form-section">
                <div className="form-section-title">
                  Coordinates{" "}
                  <button
                    type="button"
                    className="location-button"
                    onClick={captureLocation}
                  >
                    ⌖ Capture from GPS
                  </button>
                </div>
                <div className="form-grid three">
                  <label>
                    Latitude
                    <input
                      type="number"
                      step="any"
                      name="latitude"
                      value={form.latitude}
                      onChange={updateForm}
                    />
                  </label>
                  <label>
                    Longitude
                    <input
                      type="number"
                      step="any"
                      name="longitude"
                      value={form.longitude}
                      onChange={updateForm}
                    />
                  </label>
                  <label>
                    Elevation (m)
                    <input
                      type="number"
                      name="elevation"
                      value={form.elevation}
                      onChange={updateForm}
                    />
                  </label>
                </div>
              </div>
              <div className="form-grid three">
                <label>
                  Size east-west
                  <input
                    type="number"
                    step="any"
                    name="sizeEW"
                    value={form.sizeEW}
                    onChange={updateForm}
                    placeholder="m / cm"
                  />
                </label>
                <label>
                  Size north-south
                  <input
                    type="number"
                    step="any"
                    name="sizeNS"
                    value={form.sizeNS}
                    onChange={updateForm}
                    placeholder="m / cm"
                  />
                </label>
                <label>
                  Condition
                  <select
                    name="condition"
                    value={form.condition}
                    onChange={updateForm}
                  >
                    {conditions.map((condition) => (
                      <option key={condition}>{condition}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="form-section">
                <div className="form-section-title">
                  Associated material remains
                </div>
                <div className="chip-list">
                  {materials.map((material) => (
                    <button
                      type="button"
                      key={material}
                      className={
                        form.materials.includes(material)
                          ? "chip selected"
                          : "chip"
                      }
                      onClick={() => toggleMaterial(material)}
                    >
                      {form.materials.includes(material) ? "✓ " : ""}
                      {material}
                    </button>
                  ))}
                </div>
              </div>
              <label>
                Remarks
                <textarea
                  name="remark"
                  value={form.remark}
                  onChange={updateForm}
                  rows="3"
                  placeholder="Detailed stratigraphy notes and observations"
                />
              </label>
              <div className="photo-drop">
                <input
                  id="photo-input"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handlePhotos}
                />
                <label htmlFor="photo-input">
                  <span>▧</span>
                  <strong>Choose photos from gallery or album</strong>
                  <small>Select existing photos from your device</small>
                </label>
                <label className="camera-upload" htmlFor="camera-input">⌖ Capture with camera</label>
                <input id="camera-input" className="camera-input" type="file" accept="image/*" capture="environment" multiple onChange={handlePhotos} />
                {form.photos.length > 0 && (
                  <div className="photo-count">
                    {form.photos.length} photo
                    {form.photos.length > 1 ? "s" : ""} ready
                  </div>
                )}
              </div>
            </div>
            <div className="form-footer">
              <span>
                <i className={online ? "status-dot online" : "status-dot"}></i>
                {online ? "Will sync when saved" : "Will save to offline queue"}
              </span>
              <div>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </button>
                <button className="primary-button" type="submit">
                  {editingId ? "Update field record" : "Save field record"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default App;
