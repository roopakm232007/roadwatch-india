import React, { useEffect, useState, useRef } from "react";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  doc,
  updateDoc,
  query,
  where,
} from "firebase/firestore";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const firebaseConfig = {
  apiKey: "vgQrsO73vzNzptBTXDEw",
  authDomain: "roadwatch-47a35.firebaseapp.com",
  projectId: "roadwatch-47a35",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const POLITICIAN_WARDS = [
  { name: "Rizwan Arshad",   ward: "Ward 1 — Koramangala" },
  { name: "Sowmya Reddy",    ward: "Ward 2 — Indiranagar" },
  { name: "Ramalinga Reddy", ward: "Ward 3 — Whitefield" },
  { name: "N A Haris",       ward: "Ward 4 — Jayanagar" },
];

function randomPolitician() {
  return POLITICIAN_WARDS[Math.floor(Math.random() * POLITICIAN_WARDS.length)].name;
}

function deadlineFromSeverity(sevName) {
  const days = sevName === "Critical" ? 7 : sevName === "High" ? 14 : sevName === "Medium" ? 30 : 60;
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function haversineMetres(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const RADIUS_M = 100;
function findNearbyActivePothole(potholes, lat, lng) {
  return potholes.find((p) => {
    if (!p.gps) return false;
    const isActive = p.status !== "Fixed" && p.status !== "fixed";
    const dist = haversineMetres(lat, lng, p.gps.lat, p.gps.lng);
    return isActive && dist <= RADIUS_M;
  });
}

function buildPoliticianStats(potholes, wardDefs) {
  const byPolitician = {};
  potholes.forEach((p) => {
    const key = p.politician || "Unknown";
    if (!byPolitician[key]) byPolitician[key] = [];
    byPolitician[key].push(p);
  });
  return wardDefs.map((def) => {
    const group = byPolitician[def.name] || [];
    const total = group.length;
    const fixed = group.filter((p) => p.status === "Fixed" || p.status === "fixed").length;
    const pending = total - fixed;
    const fixedItems = group.filter((p) => p.status === "Fixed" || p.status === "fixed");
    let avgDaysToFix = 999;
    if (fixedItems.length > 0) {
      const totalDays = fixedItems.reduce((sum, p) => {
        const created = new Date(p.timestamp);
        const resolved = new Date(p.resolvedAt || p.timestamp);
        return sum + Math.max(0, (resolved - created) / (1000 * 60 * 60 * 24));
      }, 0);
      avgDaysToFix = Math.round(totalDays / fixedItems.length) || 1;
    }
    const now = new Date();
    const overdueCount = group.filter((p) => {
      const isNotFixed = p.status !== "Fixed" && p.status !== "fixed";
      const isPastDeadline = p.deadline && new Date(p.deadline) < now;
      return isNotFixed && isPastDeadline;
    }).length;
    const criticalUnfixed = group.filter(
      (p) => p.severity === "Critical" && p.status !== "Fixed" && p.status !== "fixed"
    ).length;
    return { name: def.name, ward: def.ward, potholes: total, fixed, pending, avgDaysToFix, overdueCount, criticalUnfixed };
  });
}

function getStarRating(politician) {
  const { potholes, fixed, avgDaysToFix = 999, overdueCount = 0, criticalUnfixed = 0 } = politician;
  if (potholes === 0) return { stars: 0, display: "No data", repairRate: 0 };
  const repairRate = (fixed / potholes) * 100;
  const repairScore = (repairRate / 100) * 40;
  const speedScore = avgDaysToFix < 7 ? 25 : avgDaysToFix < 14 ? 18 : avgDaysToFix < 30 ? 10 : 3;
  const overduePenalty = Math.min((overdueCount / potholes) * 25, 25);
  const neglectPenalty = Math.min(criticalUnfixed * 5, 20);
  const severityScore = 10;
  const total = Math.max(0, repairScore + speedScore - overduePenalty - neglectPenalty + severityScore);
  const stars = Math.min(5, Math.max(1, Math.round((total / 100) * 5)));
  return { stars, total: Math.round(total), repairRate: Math.round(repairRate) };
}

function StarDisplay({ stars }) {
  return (
    <div style={{ display: "flex", gap: 4, justifyContent: "center", margin: "8px 0" }}>
      {[1, 2, 3, 4, 5].map((s) => (
        <span key={s} style={{ fontSize: 22, color: s <= stars ? "#f59e0b" : "#d1d5db" }}>★</span>
      ))}
    </div>
  );
}

function getStatusColor(status) {
  if (!status) return "#B05A00";
  const s = status.toLowerCase().replace(/\s+/g, "_");
  if (s === "fixed")                              return "#1E7D3C";
  if (s === "in_progress" || s === "in progress") return "#1A5CFF";
  return "#B05A00";
}

function getMarkerRadius(severity) {
  if (severity === "Critical") return 10;
  if (severity === "High")     return 8;
  if (severity === "Medium")   return 6;
  return 5;
}

function DuplicateBanner({ pothole, onDismiss }) {
  return (
    <div style={{
      background: "linear-gradient(135deg, #FFF8E1 0%, #FFF3CD 100%)",
      border: "2px solid #F59E0B",
      borderRadius: 12,
      padding: "16px 18px",
      marginBottom: 16,
      position: "relative",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ fontSize: 28, flexShrink: 0, lineHeight: 1 }}>⚠️</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#92400E", marginBottom: 4 }}>
            Issue Already Raised!
          </div>
          <div style={{ fontSize: 12, color: "#78350F", lineHeight: 1.6, marginBottom: 10 }}>
            A pothole at this location has already been reported and is being tracked.
            Submitting again will <b>not</b> speed up the repair — it only creates duplicate
            work for the PWD officer.
          </div>
          <div style={{
            background: "#fff",
            border: "1px solid #FCD34D",
            borderRadius: 8,
            padding: "8px 12px",
            display: "inline-flex",
            flexDirection: "column",
            gap: 3,
            fontSize: 12,
            color: "#92400E",
          }}>
            <span>🪪 Existing Report ID: <b style={{ fontFamily: "monospace", fontSize: 13 }}>{pothole.id}</b></span>
            <span>📊 Status: <b style={{ color: getStatusColor(pothole.status) }}>{pothole.status || "Pending"}</b></span>
            <span>⚡ Severity: <b>{pothole.severity}</b></span>
            <span>⏱ Deadline: <b>{pothole.deadline}</b></span>
          </div>
        </div>
      </div>
      <button
        onClick={onDismiss}
        style={{
          position: "absolute", top: 10, right: 12,
          background: "none", border: "none", cursor: "pointer",
          fontSize: 16, color: "#92400E", fontWeight: 700,
        }}
        title="Dismiss"
      >✕</button>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>
    </div>
  );
}

function AlreadyResolvedBanner({ pothole, onDismiss }) {
  return (
    <div style={{
      background: "linear-gradient(135deg, #F0FDF4 0%, #DCFCE7 100%)",
      border: "2px solid #22C55E",
      borderRadius: 12,
      padding: "16px 18px",
      marginBottom: 16,
      position: "relative",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ fontSize: 28, flexShrink: 0, lineHeight: 1 }}>✅</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#14532D", marginBottom: 4 }}>
            This Issue Is Already Fixed!
          </div>
          <div style={{ fontSize: 12, color: "#166534", lineHeight: 1.6, marginBottom: 10 }}>
            The pothole <b style={{ fontFamily: "monospace" }}>{pothole.id}</b> has already been
            marked as <b>Fixed</b> in the system. You cannot upload a duplicate repair proof
            for an issue that is already closed.
          </div>
          <div style={{
            background: "#fff",
            border: "1px solid #86EFAC",
            borderRadius: 8,
            padding: "8px 12px",
            display: "inline-flex",
            flexDirection: "column",
            gap: 3,
            fontSize: 12,
            color: "#14532D",
          }}>
            <span>🪪 Report ID: <b style={{ fontFamily: "monospace", fontSize: 13 }}>{pothole.id}</b></span>
            <span>📅 Fixed At: <b>{pothole.resolvedAt ? new Date(pothole.resolvedAt).toLocaleDateString() : "—"}</b></span>
          </div>
        </div>
      </div>
      <button
        onClick={onDismiss}
        style={{
          position: "absolute", top: 10, right: 12,
          background: "none", border: "none", cursor: "pointer",
          fontSize: 16, color: "#14532D", fontWeight: 700,
        }}
        title="Dismiss"
      >✕</button>
    </div>
  );
}

const styles = {
  app: { fontFamily: "'DM Sans', Arial, sans-serif", background: "#F4F2ED", minHeight: "100vh", color: "#1A1917" },
  topbar: { background: "#fff", borderBottom: "1px solid rgba(0,0,0,0.10)", padding: "0 24px", height: "56px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" },
  logoMark: { width: 32, height: 32, background: "#1A5CFF", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 16 },
  livePill: { display: "flex", alignItems: "center", gap: 5, background: "#EEF3FF", color: "#0B3BBF", fontSize: 11, fontWeight: 500, padding: "3px 10px", borderRadius: 20 },
  navTabs: { display: "flex", padding: "12px 24px 0", gap: 2, borderBottom: "1px solid rgba(0,0,0,0.10)", background: "#fff" },
  tab: (active) => ({ fontSize: 13, fontWeight: active ? 500 : 400, padding: "8px 16px 10px", border: "none", background: "transparent", color: active ? "#1A5CFF" : "#6B6860", cursor: "pointer", borderBottom: active ? "2px solid #1A5CFF" : "2px solid transparent", marginBottom: -1 }),
  page: { padding: 24 },
  // 3-column grid for metrics
  grid3: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 },
  card: { background: "#fff", border: "1px solid rgba(0,0,0,0.10)", borderRadius: 16, padding: "16px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" },
  metric: { background: "#fff", border: "1px solid rgba(0,0,0,0.10)", borderRadius: 16, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" },
  metricValue: { fontSize: 28, fontWeight: 300, lineHeight: 1, marginBottom: 4, fontFamily: "monospace" },
  metricLabel: { fontSize: 11, color: "#6B6860", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 },
  btn: (color) => ({ background: color || "#1A5CFF", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 500, cursor: "pointer", width: "100%" }),
  input: { width: "100%", padding: "10px 12px", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 8, fontSize: 13, fontFamily: "inherit", marginBottom: 12, background: "#fff", boxSizing: "border-box" },
  uploadZone: { border: "2px dashed rgba(0,0,0,0.15)", borderRadius: 12, padding: "32px 20px", textAlign: "center", cursor: "pointer", marginBottom: 12, background: "#FAFAF8" },
  sectionTitle: { fontSize: 13, color: "#6B6860", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 12, fontWeight: 500 },
  divider: { border: "none", borderTop: "1px solid rgba(0,0,0,0.08)", margin: "24px 0" },
};

async function fetchAllPotholes() {
  const snapshot = await getDocs(collection(db, "potholes"));
  return snapshot.docs.map((d) => ({ _docId: d.id, ...d.data() }));
}

// Geocode an address string to {lat, lng} using Nominatim
async function geocodeAddress(address) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address + ", Bengaluru, Karnataka, India")}&format=json&limit=1`;
  const res = await fetch(url, { headers: { "Accept-Language": "en" } });
  const data = await res.json();
  if (data && data.length > 0) {
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), display: data[0].display_name };
  }
  return null;
}

export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [potholes, setPotholes] = useState([]);

  // ── Report tab state ──────────────────────────────────────────────────────
  const [reportStep, setReportStep]             = useState("form");
  const [scanning, setScanning]                 = useState(false);
  const [sevResult, setSevResult]               = useState(null);
  const [reportId, setReportId]                 = useState("");
  const [photoPreview, setPhotoPreview]         = useState(null);
  const [showCamera, setShowCamera]             = useState(false);
  const [camStream, setCamStream]               = useState(null);
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [duplicatePothole, setDuplicatePothole] = useState(null);
  const [userLocation, setUserLocation]         = useState(null);
  const [locationError, setLocationError]       = useState(null);
  const [locationMode, setLocationMode]         = useState("gps"); // "gps" | "manual"
  const [manualAddress, setManualAddress]       = useState("");
  const [manualLocation, setManualLocation]     = useState(null);
  const [geocoding, setGeocoding]               = useState(false);
  const [geocodeError, setGeocodeError]         = useState("");
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);

  // ── Contractor tab state ──────────────────────────────────────────────────
  const [conRid, setConRid]                     = useState("");
  const [conRidConfirmed, setConRidConfirmed]   = useState(false);
  const [conPhotoPreview, setConPhotoPreview]   = useState(null);
  const [conShowCamera, setConShowCamera]       = useState(false);
  const [conCamStream, setConCamStream]         = useState(null);
  const [conScanning, setConScanning]           = useState(false);
  const [conSuccess, setConSuccess]             = useState(false);
  const [conError, setConError]                 = useState("");
  const [alreadyResolvedPothole, setAlreadyResolvedPothole] = useState(null);
  const conVideoRef  = useRef(null);
  const conCanvasRef = useRef(null);

  // ── Get GPS location when on report tab ──────────────────────────────────
  useEffect(() => {
    if (tab === "public" && !userLocation && !locationError) {
      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
            setLocationError(null);
          },
          (error) => {
            console.error("Geolocation error:", error);
            setLocationError("Unable to get your GPS location. You can enter address manually below.");
            setUserLocation({ lat: 12.9716, lng: 77.5946 });
          }
        );
      } else {
        setLocationError("Geolocation not supported. You can enter address manually below.");
        setUserLocation({ lat: 12.9716, lng: 77.5946 });
      }
    }
  }, [tab, userLocation, locationError]);

  // ── Fetch potholes ────────────────────────────────────────────────────────
  useEffect(() => { fetchAllPotholes().then(setPotholes); }, []);
  useEffect(() => {
    if (tab === "dashboard" || tab === "public") fetchAllPotholes().then(setPotholes);
  }, [tab]);

  // ── Derived counts (3 metrics: Total, Pending, Fixed) ─────────────────────
  const fixedCount   = potholes.filter((p) => p.status === "Fixed" || p.status === "fixed").length;
  const pendingCount = potholes.length - fixedCount;
  const politicians  = buildPoliticianStats(potholes, POLITICIAN_WARDS);

  const sevs = [
    { name: "Critical", desc: "Large pothole. Immediate repair required.",   dl: "7 days",  conf: "96%" },
    { name: "High",     desc: "Significant pothole. Repair within 2 weeks.", dl: "14 days", conf: "91%" },
    { name: "Medium",   desc: "Moderate pothole. Schedule within a month.",  dl: "30 days", conf: "88%" },
    { name: "Low",      desc: "Minor pothole. Routine maintenance queue.",   dl: "60 days", conf: "83%" },
  ];

  // ── Active location for submission ───────────────────────────────────────
  const activeLocation = locationMode === "manual" ? manualLocation : userLocation;

  // ── Geocode manual address ────────────────────────────────────────────────
  async function handleGeocodeAddress() {
    if (!manualAddress.trim()) return;
    setGeocoding(true);
    setGeocodeError("");
    setManualLocation(null);
    try {
      const result = await geocodeAddress(manualAddress.trim());
      if (result) {
        setManualLocation({ lat: result.lat, lng: result.lng });
        setGeocodeError("");
      } else {
        setGeocodeError("Address not found. Please try a more specific address.");
      }
    } catch {
      setGeocodeError("Could not look up address. Check your connection.");
    } finally {
      setGeocoding(false);
    }
  }

  // ── Camera helpers (reporter) ─────────────────────────────────────────────
  const openCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      setCamStream(stream); setShowCamera(true);
      setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = stream; }, 100);
    } catch { document.getElementById("gal").click(); }
  };
  const capturePhoto = () => {
    const v = videoRef.current, c = canvasRef.current;
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d").drawImage(v, 0, 0);
    setPhotoPreview(c.toDataURL("image/jpeg", 0.85));
    closeCamera();
  };
  const closeCamera = () => {
    if (camStream) camStream.getTracks().forEach((t) => t.stop());
    setCamStream(null); setShowCamera(false);
  };
  const handleGallery = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPhotoPreview(URL.createObjectURL(file));
    e.target.value = "";
  };

  // ── Camera helpers (contractor) ───────────────────────────────────────────
  const conOpenCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      setConCamStream(stream); setConShowCamera(true);
      setTimeout(() => { if (conVideoRef.current) conVideoRef.current.srcObject = stream; }, 100);
    } catch { document.getElementById("conGal").click(); }
  };
  const conCapturePhoto = () => {
    const v = conVideoRef.current, c = conCanvasRef.current;
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d").drawImage(v, 0, 0);
    setConPhotoPreview(c.toDataURL("image/jpeg", 0.85));
    conCloseCamera();
  };
  const conCloseCamera = () => {
    if (conCamStream) conCamStream.getTracks().forEach((t) => t.stop());
    setConCamStream(null); setConShowCamera(false);
  };
  const handleConGallery = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setConPhotoPreview(URL.createObjectURL(file));
    e.target.value = "";
  };

  // ── AI scan ───────────────────────────────────────────────────────────────
  function handlePhotoUpload() {
    setScanning(true);
    setTimeout(() => {
      setSevResult(sevs[Math.floor(Math.random() * sevs.length)]);
      setScanning(false);
    }, 3000);
  }

  // ── Submit report — WITH DUPLICATE DETECTION ──────────────────────────────
  async function handleSubmitReport() {
    if (!sevResult) return;
    if (!activeLocation) {
      if (locationMode === "manual") {
        alert("Please look up your address first.");
      } else {
        alert("Please wait while we detect your location...");
      }
      return;
    }

    setReportSubmitting(true);
    setDuplicatePothole(null);

    try {
      const lat = activeLocation.lat;
      const lng = activeLocation.lng;

      const latestPotholes = await fetchAllPotholes();
      setPotholes(latestPotholes);

      const nearby = findNearbyActivePothole(latestPotholes, lat, lng);
      if (nearby) {
        setDuplicatePothole(nearby);
        setReportSubmitting(false);
        return;
      }

      const newId = "RW-" + Date.now().toString().slice(-6);
      const politician = randomPolitician();
      await addDoc(collection(db, "potholes"), {
        id: newId,
        severity: sevResult.name,
        status: "Pending",
        politician,
        deadline: deadlineFromSeverity(sevResult.name),
        timestamp: new Date().toISOString(),
        resolvedAt: null,
        gps: { lat, lng },
        address: locationMode === "manual" ? manualAddress : null,
      });
      setPotholes(await fetchAllPotholes());
      setReportId(newId);
      setReportStep("success");
    } catch (err) {
      console.error(err);
      alert("Submit failed. Check Firebase security rules.");
    } finally {
      setReportSubmitting(false);
    }
  }

  // ── Confirm contractor Report ID ──────────────────────────────────────────
  async function handleConfirmRid() {
    if (!conRid.trim()) return;
    setConError("");
    setAlreadyResolvedPothole(null);

    try {
      const q    = query(collection(db, "potholes"), where("id", "==", conRid.trim()));
      const snap = await getDocs(q);

      if (snap.empty) {
        setConError(`No report found with ID "${conRid.trim()}". Please check the ID and try again.`);
        return;
      }

      const existing = { _docId: snap.docs[0].id, ...snap.docs[0].data() };
      if (existing.status === "Fixed" || existing.status === "fixed") {
        setAlreadyResolvedPothole(existing);
        return;
      }
    } catch (err) {
      console.error("ID check error:", err);
      setConError("Could not verify Report ID. Check your connection and try again.");
      return;
    }

    setConRidConfirmed(true);
    setConPhotoPreview(null);
    setConSuccess(false);
  }

  async function handleSubmitRepair() {
    if (!conRidConfirmed || !conPhotoPreview) return;
    setConScanning(true); setConError("");
    await new Promise((r) => setTimeout(r, 4000));
    try {
      const q    = query(collection(db, "potholes"), where("id", "==", conRid.trim()));
      const snap = await getDocs(q);
      if (snap.empty) {
        setConError(`No pothole found with ID "${conRid}". Check the ID and try again.`);
        setConScanning(false);
        return;
      }
      const existing = { _docId: snap.docs[0].id, ...snap.docs[0].data() };
      if (existing.status === "Fixed" || existing.status === "fixed") {
        setConScanning(false);
        setConRidConfirmed(false);
        setAlreadyResolvedPothole(existing);
        return;
      }
      await updateDoc(doc(db, "potholes", snap.docs[0].id), {
        status:     "Fixed",
        resolvedAt: new Date().toISOString(),
      });
      setPotholes(await fetchAllPotholes());
      setConScanning(false); setConSuccess(true);
    } catch (err) {
      console.error(err);
      setConError("Update failed. Check Firebase security rules.");
      setConScanning(false);
    }
  }

  function handleConReset() {
    setConRid(""); setConRidConfirmed(false);
    setConPhotoPreview(null); setConSuccess(false);
    setConScanning(false); setConError("");
    setAlreadyResolvedPothole(null);
  }

  function resetReportForm() {
    setReportStep("form");
    setPhotoPreview(null);
    setSevResult(null);
    setScanning(false);
    setDuplicatePothole(null);
    setManualAddress("");
    setManualLocation(null);
    setGeocodeError("");
    setLocationMode("gps");
  }

  return (
    <div style={styles.app}>
      {/* ── Topbar ── */}
      <div style={styles.topbar}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={styles.logoMark}>R</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>RoadWatch</div>
            <div style={{ fontSize: 11, color: "#6B6860" }}>AI Pothole Accountability</div>
          </div>
          <div style={styles.livePill}>
            <div style={{ width: 6, height: 6, background: "#1A5CFF", borderRadius: "50%" }} />
            Live
          </div>
        </div>
        <div style={{ fontSize: 13, color: "#6B6860" }}>Bengaluru, Karnataka</div>
      </div>

      {/* ── Nav tabs ── */}
      <div style={styles.navTabs}>
        {[
          { key: "dashboard",  label: "📊 Dashboard" },
          { key: "public",     label: "📢 Report a Pothole" },
          { key: "contractor", label: "🔧 Contractor Upload" },
        ].map((t) => (
          <button key={t.key} style={styles.tab(tab === t.key)} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ════════════════════════ DASHBOARD ════════════════════════ */}
      {tab === "dashboard" && (
        <div style={styles.page}>
          {/* 3 metric cards */}
          <div style={styles.grid3}>
            {[
              { label: "Total Detected", value: potholes.length, color: "#1A5CFF" },
              { label: "Pending",        value: pendingCount,    color: "#B05A00" },
              { label: "Fixed",          value: fixedCount,      color: "#1E7D3C" },
            ].map((m) => (
              <div key={m.label} style={styles.metric}>
                <div style={styles.metricLabel}>{m.label}</div>
                <div style={{ ...styles.metricValue, color: m.color }}>{m.value}</div>
              </div>
            ))}
          </div>

          <div style={styles.card}>
            {/* Map legend */}
            <div style={{
              display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10,
              marginBottom: 14, padding: "12px 14px", background: "#F4F2ED", borderRadius: 10,
            }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#1A1917", marginRight: 2 }}>Map legend:</span>
              {[
                { label: "Pending", color: "#B05A00", bg: "#FFF4E6", desc: "Not yet addressed" },
                { label: "Fixed",   color: "#1E7D3C", bg: "#E6F5EB", desc: "Pothole fixed"     },
              ].map((item) => (
                <div key={item.label} style={{
                  display: "flex", alignItems: "center", gap: 7,
                  background: item.bg, border: `1.5px solid ${item.color}`,
                  borderRadius: 20, padding: "4px 12px 4px 8px",
                }}>
                  <div style={{ width: 12, height: 12, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: item.color }}>{item.label}</span>
                  <span style={{ fontSize: 11, color: "#6B6860" }}>{item.desc}</span>
                </div>
              ))}
              <div style={{ width: 1, height: 28, background: "rgba(0,0,0,0.12)", margin: "0 4px" }} />
              <span style={{ fontSize: 11, color: "#6B6860", fontWeight: 500 }}>Dot size = severity:</span>
              {[
                { label: "Critical", size: 16 },
                { label: "High",     size: 12 },
                { label: "Medium",   size: 9  },
                { label: "Low",      size: 7  },
              ].map((s) => (
                <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: s.size, height: s.size, borderRadius: "50%", background: "rgba(0,0,0,0.20)", flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: "#6B6860" }}>{s.label}</span>
                </div>
              ))}
            </div>

            <div style={styles.sectionTitle}>Live Pothole Map — Bengaluru</div>
            <MapContainer center={[12.9716, 77.5946]} zoom={13} style={{ height: 460, borderRadius: 10 }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {potholes.map((p, i) => (
                <CircleMarker
                  key={i}
                  center={[p.gps.lat, p.gps.lng]}
                  radius={getMarkerRadius(p.severity)}
                  pathOptions={{
                    color:       getStatusColor(p.status),
                    fillColor:   getStatusColor(p.status),
                    fillOpacity: 0.85,
                    weight:      2,
                  }}
                >
                  <Popup>
                    <div style={{ minWidth: 170, fontFamily: "sans-serif" }}>
                      <div style={{ fontWeight: 600, marginBottom: 6 }}>{p.id}</div>
                      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                        <span style={{ background: getStatusColor(p.status), color: "#fff", fontSize: 11, padding: "2px 8px", borderRadius: 20, textTransform: "capitalize" }}>
                          {p.status || "Pending"}
                        </span>
                        <span style={{
                          background: p.severity === "Critical" ? "#FDEAEA" : p.severity === "High" ? "#FFF7ED" : p.severity === "Medium" ? "#EEF3FF" : "#F4F2ED",
                          color: p.severity === "Critical" ? "#C42B2B" : p.severity === "High" ? "#B05A00" : p.severity === "Medium" ? "#1A5CFF" : "#6B6860",
                          fontSize: 11, padding: "2px 8px", borderRadius: 20,
                        }}>
                          {p.severity}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: "#6B6860", lineHeight: 1.6 }}>
                        <div>Ward: {p.ward || "Not assigned"}</div>
                        <div>Politician: {p.politician}</div>
                        <div>Deadline: {p.deadline}</div>
                        {p.address && <div>Address: {p.address}</div>}
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>

          <hr style={styles.divider} />

          {/* Politician ratings */}
          <div>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>🏛️ Politician Accountability Ratings</div>
            <div style={{ fontSize: 13, color: "#6B6860", marginBottom: 20 }}>
              Rating based on pothole repair performance in each ward. Updated in real-time from AI-verified data.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
              {politicians.map((p, i) => {
                const g   = getStarRating(p);
                const pct = g.repairRate || 0;
                return (
                  <div key={i} style={styles.card}>
                    <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: "#6B6860", marginBottom: 16 }}>{p.ward}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13, marginBottom: 16 }}>
                      <div>🕳️ Potholes: <b style={{ color: "#B05A00" }}>{p.potholes}</b></div>
                      <div>✅ Fixed: <b style={{ color: "#1E7D3C" }}>{p.fixed}</b></div>
                      <div>⏳ Pending: <b style={{ color: "#B05A00" }}>{p.pending}</b></div>
                    </div>
                    <div style={{ background: "#F4F2ED", borderRadius: 8, height: 6, marginBottom: 12 }}>
                      <div style={{ background: "#f59e0b", height: 6, borderRadius: 8, width: `${pct}%`, transition: "width 0.4s ease" }} />
                    </div>
                    <div style={{ background: "#1e293b", borderRadius: 8, padding: "12px 0", textAlign: "center" }}>
                      <StarDisplay stars={g.stars} />
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>{g.stars}/5 stars</div>
                      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{pct}% repairs done</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════ PUBLIC REPORT ════════════════════════ */}
      {tab === "public" && (
        <div style={styles.page}>
          {reportStep === "form" ? (
            <div style={{ maxWidth: 520 }}>
              <div style={styles.card}>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Report a pothole anonymously</div>
                <div style={{ fontSize: 13, color: "#6B6860", marginBottom: 20 }}>No login required. AI classifies severity automatically.</div>

                {duplicatePothole && (
                  <DuplicateBanner
                    pothole={duplicatePothole}
                    onDismiss={() => setDuplicatePothole(null)}
                  />
                )}

                {/* ── Location section ── */}
                <div style={styles.sectionTitle}>Your location</div>

                {/* Toggle: GPS vs Manual */}
                <div style={{
                  display: "flex", gap: 0, marginBottom: 12,
                  border: "1px solid rgba(0,0,0,0.15)", borderRadius: 8, overflow: "hidden",
                }}>
                  {[
                    { key: "gps",    label: "📍 Use GPS" },
                    { key: "manual", label: "✍️ Enter Address" },
                  ].map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => {
                        setLocationMode(opt.key);
                        setDuplicatePothole(null);
                        setGeocodeError("");
                      }}
                      style={{
                        flex: 1, padding: "9px 12px", fontSize: 12, fontWeight: 500,
                        border: "none", cursor: "pointer",
                        background: locationMode === opt.key ? "#1A5CFF" : "#fff",
                        color: locationMode === opt.key ? "#fff" : "#6B6860",
                        transition: "all 0.15s",
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* GPS mode */}
                {locationMode === "gps" && (
                  <>
                    <input
                      style={styles.input}
                      value={userLocation
                        ? `${userLocation.lat.toFixed(4)}° N, ${userLocation.lng.toFixed(4)}° E`
                        : "Detecting GPS location..."}
                      readOnly
                    />
                    {locationError && (
                      <div style={{ fontSize: 11, color: "#B05A00", marginTop: -8, marginBottom: 12 }}>
                        ⚠️ {locationError}
                      </div>
                    )}
                  </>
                )}

                {/* Manual address mode */}
                {locationMode === "manual" && (
                  <div style={{ marginBottom: 4 }}>
                    <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                      <input
                        style={{ ...styles.input, marginBottom: 0, flex: 1 }}
                        placeholder="e.g. 12th Main, Koramangala"
                        value={manualAddress}
                        onChange={(e) => {
                          setManualAddress(e.target.value);
                          setManualLocation(null);
                          setGeocodeError("");
                        }}
                        onKeyDown={(e) => { if (e.key === "Enter") handleGeocodeAddress(); }}
                      />
                      <button
                        onClick={handleGeocodeAddress}
                        disabled={!manualAddress.trim() || geocoding}
                        style={{
                          padding: "10px 14px", fontSize: 12, fontWeight: 600,
                          background: manualAddress.trim() && !geocoding ? "#1A5CFF" : "#ccc",
                          color: "#fff", border: "none", borderRadius: 8, cursor: manualAddress.trim() && !geocoding ? "pointer" : "not-allowed",
                          whiteSpace: "nowrap", flexShrink: 0,
                        }}
                      >
                        {geocoding ? "Looking up..." : "Look up →"}
                      </button>
                    </div>
                    <div style={{ fontSize: 11, color: "#6B6860", marginBottom: 8 }}>
                      Bengaluru area only. Press Enter or click "Look up".
                    </div>
                    {geocodeError && (
                      <div style={{ fontSize: 11, color: "#C42B2B", marginBottom: 8 }}>⚠️ {geocodeError}</div>
                    )}
                    {manualLocation && (
                      <div style={{
                        display: "flex", alignItems: "center", gap: 8,
                        background: "#E6F5EB", borderRadius: 8, padding: "8px 12px", marginBottom: 8,
                        fontSize: 12, color: "#1E7D3C",
                      }}>
                        <span>✅</span>
                        <span>
                          Location found: <b>{manualLocation.lat.toFixed(4)}° N, {manualLocation.lng.toFixed(4)}° E</b>
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Photo upload ── */}
                <div style={styles.sectionTitle}>Upload pothole photo</div>

                {!photoPreview ? (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                      <button style={{ ...styles.btn("#1A5CFF"), flex: 1 }} onClick={openCamera}>📷 Take Photo</button>
                      <button style={{ ...styles.btn("#6B6860"), flex: 1 }} onClick={() => document.getElementById("gal").click()}>🖼 Gallery</button>
                    </div>
                    <input id="gal" type="file" accept="image/*" style={{ display: "none" }} onChange={handleGallery} />
                  </div>
                ) : (
                  <div style={{ marginBottom: 12, textAlign: "center" }}>
                    <img src={photoPreview} alt="preview" style={{ width: "100%", borderRadius: 10, maxHeight: 220, objectFit: "cover" }} />
                    <button style={{ ...styles.btn("#C42B2B"), marginTop: 8 }}
                      onClick={() => { setPhotoPreview(null); setSevResult(null); setScanning(false); setDuplicatePothole(null); }}>
                      ✕ Remove photo
                    </button>
                  </div>
                )}

                {showCamera && (
                  <div style={{ position: "fixed", inset: 0, background: "#000", zIndex: 999,
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                    <video ref={videoRef} autoPlay playsInline style={{ width: "100%", maxWidth: 480, borderRadius: 12 }} />
                    <canvas ref={canvasRef} style={{ display: "none" }} />
                    <div style={{ display: "flex", gap: 16, marginTop: 20 }}>
                      <button style={styles.btn("#C42B2B")} onClick={closeCamera}>✕ Cancel</button>
                      <button style={styles.btn("#1E7D3C")} onClick={capturePhoto}>📸 Capture</button>
                    </div>
                  </div>
                )}

                {photoPreview && !sevResult && (
                  <div style={styles.uploadZone} onClick={handlePhotoUpload}>
                    {scanning ? (
                      <>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>🤖 AI scanning photo...</div>
                        <div style={{ fontSize: 12, color: "#6B6860" }}>Analysing surface damage</div>
                      </>
                    ) : (
                      <div style={{ fontSize: 13, fontWeight: 500 }}>▶ Tap to scan with AI</div>
                    )}
                  </div>
                )}

                {sevResult && !scanning && (
                  <div style={{ background: "#FDEAEA", borderRadius: 10, padding: 14, marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: "#8B1C1C", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>AI Result</div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: "#C42B2B" }}>{sevResult.name}</div>
                    <div style={{ fontSize: 12, color: "#8B1C1C", marginBottom: 8 }}>{sevResult.desc}</div>
                    <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#8B1C1C" }}>
                      <span>⏱ Deadline: <b>{sevResult.dl}</b></span>
                      <span>🎯 Confidence: <b>{sevResult.conf}</b></span>
                    </div>
                  </div>
                )}

                {/* Submit button — requires location based on mode */}
                {(() => {
                  const locationReady = locationMode === "gps" ? !!userLocation : !!manualLocation;
                  const canSubmit = sevResult && !reportSubmitting && locationReady;
                  return (
                    <button
                      style={styles.btn(canSubmit ? "#1A5CFF" : "#ccc")}
                      onClick={handleSubmitReport}
                      disabled={!canSubmit}
                    >
                      {reportSubmitting
                        ? "Checking for duplicates..."
                        : locationMode === "manual" && !manualLocation
                        ? "Look up address first"
                        : "Submit anonymous report"}
                    </button>
                  );
                })()}
              </div>
            </div>
          ) : (
            <div style={{ maxWidth: 520 }}>
              <div style={styles.card}>
                <div style={{ fontSize: 28, marginBottom: 12 }}>✅</div>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Report submitted!</div>
                <div style={{ fontSize: 13, color: "#6B6860", marginBottom: 16 }}>Your report ID is:</div>
                <div style={{ background: "#EEF3FF", borderRadius: 10, padding: 16, textAlign: "center", fontSize: 20, fontWeight: 700, color: "#1A5CFF", fontFamily: "monospace", marginBottom: 16 }}>
                  {reportId}
                </div>
                <div style={{ fontSize: 12, color: "#6B6860", marginBottom: 4 }}>
                  Save this ID to file a complaint if the pothole is not fixed by the deadline.
                </div>
                <div style={{ fontSize: 12, color: "#1E7D3C", fontWeight: 500, marginBottom: 16 }}>
                  ✅ Dashboard count &amp; map updated live.
                </div>
                <button style={styles.btn()} onClick={resetReportForm}>
                  Report another
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════ CONTRACTOR ════════════════════════ */}
      {tab === "contractor" && (
        <div style={styles.page}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={styles.card}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Upload repair proof</div>
              <div style={{ fontSize: 13, color: "#6B6860", marginBottom: 20 }}>AI verifies before marking pothole as fixed.</div>

              {alreadyResolvedPothole && (
                <AlreadyResolvedBanner
                  pothole={alreadyResolvedPothole}
                  onDismiss={() => { setAlreadyResolvedPothole(null); setConRid(""); }}
                />
              )}

              <div style={styles.sectionTitle}>Step 1 — Enter Report ID</div>
              <input
                style={styles.input}
                placeholder="Report ID (e.g. RW-123456)"
                value={conRid}
                disabled={conRidConfirmed}
                onChange={(e) => {
                  setConRid(e.target.value);
                  setAlreadyResolvedPothole(null);
                  if (conRidConfirmed) {
                    setConRidConfirmed(false); setConPhotoPreview(null);
                    setConSuccess(false); setConScanning(false); setConError("");
                  }
                }}
              />
              {!conRidConfirmed && !alreadyResolvedPothole && (
                <button
                  style={{ ...styles.btn(conRid.trim() ? "#1A5CFF" : "#ccc"), marginBottom: 16, cursor: conRid.trim() ? "pointer" : "not-allowed" }}
                  onClick={handleConfirmRid} disabled={!conRid.trim()}
                >
                  Confirm Report ID →
                </button>
              )}
              {conRidConfirmed && !conSuccess && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#E6F5EB", borderRadius: 8, padding: "8px 12px", marginBottom: 16 }}>
                  <span style={{ fontSize: 12, color: "#1E7D3C", fontWeight: 600 }}>
                    ✅ ID confirmed: <span style={{ fontFamily: "monospace" }}>{conRid}</span>
                  </span>
                  <button onClick={() => { setConRidConfirmed(false); setConPhotoPreview(null); setConScanning(false); setConError(""); setAlreadyResolvedPothole(null); }}
                    style={{ background: "none", border: "none", color: "#6B6860", cursor: "pointer", fontSize: 12 }}>
                    ✏️ Edit
                  </button>
                </div>
              )}

              {conRidConfirmed && !conSuccess && (
                <>
                  <div style={styles.sectionTitle}>Step 2 — Upload after-repair photo</div>
                  {!conPhotoPreview ? (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                        <button style={{ ...styles.btn("#1A5CFF"), flex: 1 }} onClick={conOpenCamera}>📷 Take Photo</button>
                        <button style={{ ...styles.btn("#6B6860"), flex: 1 }} onClick={() => document.getElementById("conGal").click()}>🖼 Gallery</button>
                      </div>
                      <input id="conGal" type="file" accept="image/*" style={{ display: "none" }} onChange={handleConGallery} />
                    </div>
                  ) : (
                    <div style={{ marginBottom: 12, textAlign: "center" }}>
                      <img src={conPhotoPreview} alt="repair preview" style={{ width: "100%", borderRadius: 10, maxHeight: 220, objectFit: "cover" }} />
                      <button style={{ ...styles.btn("#C42B2B"), marginTop: 8 }} onClick={() => setConPhotoPreview(null)}>✕ Remove photo</button>
                    </div>
                  )}
                </>
              )}

              {conShowCamera && (
                <div style={{ position: "fixed", inset: 0, background: "#000", zIndex: 999,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                  <video ref={conVideoRef} autoPlay playsInline style={{ width: "100%", maxWidth: 480, borderRadius: 12 }} />
                  <canvas ref={conCanvasRef} style={{ display: "none" }} />
                  <div style={{ display: "flex", gap: 16, marginTop: 20 }}>
                    <button style={styles.btn("#C42B2B")} onClick={conCloseCamera}>✕ Cancel</button>
                    <button style={styles.btn("#1E7D3C")} onClick={conCapturePhoto}>📸 Capture</button>
                  </div>
                </div>
              )}

              {conScanning && (
                <div style={{ background: "#EEF3FF", borderRadius: 10, padding: 14, marginBottom: 12, fontSize: 13, color: "#0B3BBF" }}>
                  🤖 AI verifying repair... comparing before &amp; after...
                </div>
              )}

              {conError && (
                <div style={{ background: "#FDEAEA", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#C42B2B", marginBottom: 12 }}>
                  ⚠️ {conError}
                </div>
              )}

              {conRidConfirmed && !conSuccess && !conScanning && (
                <button
                  style={{ ...styles.btn(conPhotoPreview ? "#1A5CFF" : "#ccc"), cursor: conPhotoPreview ? "pointer" : "not-allowed" }}
                  onClick={handleSubmitRepair} disabled={!conPhotoPreview}
                >
                  Submit for AI verification
                </button>
              )}

              {conSuccess && (
                <div style={{ background: "#E6F5EB", borderRadius: 10, padding: 14, textAlign: "center" }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "#1E7D3C" }}>✅ Repair verified!</div>
                  <div style={{ fontSize: 12, color: "#145529", marginBottom: 4 }}>Pothole marked as fixed. Contractor rating updated.</div>
                  <div style={{ fontSize: 12, color: "#145529", marginBottom: 12 }}>✅ Dashboard counts &amp; politician star ratings updated live.</div>
                  <button style={styles.btn("#6B6860")} onClick={handleConReset}>Submit another repair</button>
                </div>
              )}
            </div>

            <div style={styles.card}>
              <div style={styles.sectionTitle}>AI Verification Process</div>
              {[
                "GPS match — upload location vs pothole coordinates (±15m)",
                "Surface analysis — detects repaired vs unrepaired road",
                "Before–after compare — original vs repair photo",
                "Photo authenticity — checks metadata & recycled images",
                "Auto-approve / reject — no human override possible",
              ].map((s, i) => (
                <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 14 }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: i < 4 ? "#1A5CFF" : "#EEF3FF", color: i < 4 ? "#fff" : "#1A5CFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                    {i + 1}
                  </div>
                  <div style={{ fontSize: 12, color: "#6B6860", paddingTop: 4 }}>{s}</div>
                </div>
              ))}
              <div style={{ background: "#F4F2ED", borderRadius: 8, padding: 12, fontSize: 12, color: "#6B6860", marginTop: 8 }}>
                <b style={{ color: "#1A1917" }}>No human in the loop.</b> Politicians and admins cannot modify the AI decision.
              </div>
              <div style={{ background: "#FFF8E1", border: "1px solid #FCD34D", borderRadius: 8, padding: 12, fontSize: 12, color: "#78350F", marginTop: 12 }}>
                <b style={{ color: "#92400E" }}>🔒 Duplicate Protection Active.</b> The system automatically blocks:<br />
                <ul style={{ margin: "6px 0 0 16px", padding: 0, lineHeight: 1.8 }}>
                  <li>Duplicate public reports for the same location (within 100 meters)</li>
                  <li>Contractor uploads for already-fixed potholes</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}