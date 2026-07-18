import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  doc,
  onSnapshot,
  setDoc,
  addDoc,
  collection,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "./firebase.js";
import {
  Plane,
  Wallet,
  Receipt,
  Upload,
  Plus,
  X,
  Shield,
  User,
  Clock,
  FileText,
  Image as ImageIcon,
  Check,
  AlertCircle,
  Eye,
  Pencil,
  Settings,
  ChevronRight,
  Loader2,
  WifiOff,
} from "lucide-react";

/* ---------------------------------------------------------
   FIRESTORE LAYOUT
   - config/trip            -> { tripName, members: string[], admin }
   - deposits/{memberName}  -> { amount }            (one doc per person —
                                no two people ever write the same doc, so
                                there's no overwrite race)
   - spends/{autoId}        -> { member, amount, description, type,
                                 timestamp (ISO string), proofData,
                                 proofMime, proofName }
   "me" (which friend you are on this device) is stored in localStorage,
   a real browser API — this is a normal deployed web app now, not a
   Claude artifact, so localStorage is fine here.
--------------------------------------------------------- */

const ME_KEY = "trip-ledger-me";

const fmt = (n) =>
  "₹" + (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

const fmtDateTime = (iso) => {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("Could not read file"));
    r.readAsDataURL(file);
  });
}

function compressImage(dataUrl, maxWidth = 900, quality = 0.7) {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// Proofs are stored as base64 text directly inside the Firestore document
// (no separate file storage / billing plan needed). Firestore caps a whole
// document at 1MB, so this keeps each proof comfortably under that.
async function processProofFile(file) {
  const raw = await readFileAsDataUrl(file);
  let dataUrl = raw;
  if (file.type.startsWith("image/")) {
    dataUrl = await compressImage(raw);
  }
  if (dataUrl.length > 700 * 1024) {
    throw new Error(
      file.type === "application/pdf"
        ? "This PDF is too large (over ~500KB). Try a smaller/scanned-lighter file."
        : "This file is too large even after compression. Try a different photo.",
    );
  }
  return {
    dataUrl,
    mime: file.type || "application/octet-stream",
    name: file.name,
  };
}

/* ---------------------------------------------------------
   STYLES (same travel-ledger look as before)
--------------------------------------------------------- */
const GlobalStyle = () => (
  <style>{`
    

    * { box-sizing: border-box; }
    body { margin:0; }
    .tl-root { font-family: 'Inter', sans-serif; background: #F7F2E7; color: #2A2520; min-height: 100vh; }
    .tl-mono { font-family: 'IBM Plex Mono', monospace; }
    .tl-display { font-family: 'Bitter', serif; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .tl-header { background:#16243A; color:#F7F2E7; padding:22px 20px 28px; position:relative; overflow:hidden; }
    .tl-header::after { content:""; position:absolute; inset:0; background-image: radial-gradient(circle, rgba(247,242,231,0.06) 1px, transparent 1px); background-size:14px 14px; pointer-events:none; }
    .tl-header-row { display:flex; align-items:center; justify-content:space-between; gap:12px; position:relative; z-index:1; }
    .tl-title { font-family:'Bitter',serif; font-weight:800; font-size:22px; display:flex; align-items:center; gap:10px; }
    .tl-sub { font-size:12.5px; color:#C8BFA8; margin-top:4px; }

    .tl-identity-chip { background:rgba(247,242,231,0.1); border:1px solid rgba(247,242,231,0.25); color:#F7F2E7; padding:7px 12px; border-radius:999px; font-size:13px; display:flex; align-items:center; gap:6px; cursor:pointer; }
    .tl-identity-chip:hover { background:rgba(247,242,231,0.18); }
    .tl-live-dot { width:7px; height:7px; border-radius:50%; background:#5FBE8A; display:inline-block; box-shadow:0 0 0 0 rgba(95,190,138,0.6); animation:pulse 2s infinite; }
    @keyframes pulse { 0%{box-shadow:0 0 0 0 rgba(95,190,138,0.5);} 70%{box-shadow:0 0 0 6px rgba(95,190,138,0);} 100%{box-shadow:0 0 0 0 rgba(95,190,138,0);} }
    .tl-sync-text { font-size:10.5px; color:#9AA6B8; display:flex; align-items:center; gap:6px; margin-top:8px; }

    .tl-offline-banner { background:#B5402E; color:#fff; font-size:12.5px; text-align:center; padding:7px 10px; display:flex; align-items:center; justify-content:center; gap:6px; }

    .tl-container { max-width:880px; margin:0 auto; padding:18px 16px 100px; }

    .tl-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-top:-34px; position:relative; z-index:2; }
    .tl-stat-card { background:#fff; border-radius:14px; padding:14px 12px; box-shadow:0 6px 18px rgba(22,36,58,0.12); border:1px solid #EAE1CC; }
    .tl-stat-label { font-size:11px; text-transform:uppercase; letter-spacing:0.6px; color:#8A8067; font-weight:600; }
    .tl-stat-value { font-family:'IBM Plex Mono',monospace; font-weight:600; font-size:19px; margin-top:4px; color:#16243A; }
    .tl-stat-value.green { color:#3F6652; }
    .tl-stat-value.rust { color:#B5402E; }

    .tl-section-title { font-family:'Bitter',serif; font-weight:700; font-size:16px; margin:28px 0 12px; display:flex; align-items:center; gap:8px; color:#16243A; }

    .tl-tag-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:14px; }
    .tl-tag { position:relative; background:#FBF6EA; border:1.5px solid #D9CCA8; border-radius:10px; padding:16px 14px 14px; box-shadow:2px 3px 0 rgba(182,141,64,0.18); }
    .tl-tag::before { content:""; position:absolute; top:-7px; left:14px; width:14px; height:14px; border-radius:50%; background:#F7F2E7; border:1.5px solid #D9CCA8; }
    .tl-tag-name { font-weight:700; font-size:14.5px; display:flex; align-items:center; gap:6px; color:#16243A; }
    .tl-tag-admin-badge { display:inline-flex; align-items:center; gap:3px; background:#B5402E; color:#fff; font-size:9.5px; font-weight:700; padding:2px 6px; border-radius:5px; letter-spacing:0.4px; text-transform:uppercase; }
    .tl-tag-row { display:flex; justify-content:space-between; align-items:baseline; margin-top:10px; font-size:12px; color:#7C7158; }
    .tl-tag-amt { font-family:'IBM Plex Mono',monospace; font-weight:600; font-size:14px; color:#3F6652; }
    .tl-tag-edit { display:flex; gap:6px; margin-top:10px; }
    .tl-tag-edit input { width:100%; border:1px solid #D9CCA8; border-radius:6px; padding:6px 8px; font-family:'IBM Plex Mono',monospace; font-size:13px; }
    .tl-icon-btn { background:#16243A; color:#fff; border:none; border-radius:6px; padding:0 9px; cursor:pointer; display:flex; align-items:center; }
    .tl-pencil { position:absolute; top:10px; right:10px; background:none; border:none; color:#B68D40; cursor:pointer; padding:4px; }

    .tl-feed-item { background:#fff; border:1px solid #EAE1CC; border-radius:10px; padding:13px 14px; margin-bottom:10px; display:flex; gap:12px; align-items:flex-start; border-left:4px solid #3F6652; }
    .tl-feed-item.pool { border-left-color:#B5402E; }
    .tl-feed-main { flex:1; min-width:0; }
    .tl-feed-top { display:flex; justify-content:space-between; gap:8px; align-items:flex-start; }
    .tl-feed-who { font-weight:700; font-size:13.5px; color:#16243A; display:flex; align-items:center; gap:6px; }
    .tl-feed-badge { font-size:9.5px; font-weight:700; text-transform:uppercase; letter-spacing:0.4px; padding:2px 6px; border-radius:5px; }
    .tl-feed-badge.personal { background:#E4EFE9; color:#3F6652; }
    .tl-feed-badge.pool { background:#F6E3DE; color:#B5402E; }
    .tl-feed-amt { font-family:'IBM Plex Mono',monospace; font-weight:700; font-size:15px; color:#16243A; white-space:nowrap; }
    .tl-feed-desc { font-size:13.5px; color:#3A352B; margin-top:4px; }
    .tl-feed-bottom { display:flex; justify-content:space-between; align-items:center; margin-top:8px; }
    .tl-feed-time { font-size:11px; color:#9A9078; display:flex; align-items:center; gap:4px; }
    .tl-proof-btn { font-size:11.5px; color:#16243A; background:#F1EADA; border:1px solid #D9CCA8; padding:4px 9px; border-radius:6px; cursor:pointer; display:flex; align-items:center; gap:4px; }
    .tl-empty { text-align:center; padding:30px 10px; color:#9A9078; font-size:13.5px; }

    .tl-fab { position:fixed; bottom:22px; right:22px; background:#B5402E; color:#fff; border:none; border-radius:999px; padding:14px 20px; font-weight:700; font-size:14.5px; box-shadow:0 8px 20px rgba(181,64,46,0.4); cursor:pointer; display:flex; align-items:center; gap:8px; z-index:30; }

    .tl-overlay { position:fixed; inset:0; background:rgba(22,18,12,0.55); display:flex; align-items:flex-end; justify-content:center; z-index:50; animation:tlfade .15s ease-out; }
    @media (min-width:640px){ .tl-overlay{ align-items:center; } }
    @keyframes tlfade { from{opacity:0} to{opacity:1} }
    .tl-modal { background:#FBF6EA; width:100%; max-width:480px; border-radius:16px 16px 0 0; padding:20px; max-height:88vh; overflow-y:auto; border:1px solid #D9CCA8; }
    @media (min-width:640px){ .tl-modal{ border-radius:16px; } }
    .tl-modal-title { font-family:'Bitter',serif; font-weight:700; font-size:18px; display:flex; justify-content:space-between; align-items:center; color:#16243A; margin-bottom:14px; }
    .tl-field { margin-bottom:14px; }
    .tl-label { font-size:12px; font-weight:600; color:#5C5340; margin-bottom:5px; display:block; text-transform:uppercase; letter-spacing:0.3px; }
    .tl-input, .tl-textarea, .tl-select { width:100%; border:1.5px solid #D9CCA8; border-radius:8px; padding:10px 11px; font-family:'Inter',sans-serif; font-size:14.5px; background:#fff; color:#2A2520; }
    .tl-input:focus, .tl-textarea:focus, .tl-select:focus { outline:2px solid #16243A; outline-offset:1px; border-color:#16243A; }
    .tl-textarea { resize:vertical; min-height:64px; }
    .tl-radio-row { display:flex; gap:10px; }
    .tl-radio-opt { flex:1; border:1.5px solid #D9CCA8; border-radius:8px; padding:10px; text-align:center; cursor:pointer; font-size:13px; font-weight:600; color:#5C5340; }
    .tl-radio-opt.active { border-color:#16243A; background:#16243A; color:#fff; }
    .tl-upload-box { border:1.5px dashed #C8B9A8; border-radius:10px; padding:18px; text-align:center; cursor:pointer; color:#7C7158; font-size:13px; }
    .tl-upload-box.has-file { border-style:solid; border-color:#3F6652; color:#3F6652; }
    .tl-submit-btn { width:100%; background:#16243A; color:#fff; border:none; border-radius:9px; padding:12px; font-weight:700; font-size:14.5px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; margin-top:6px; }
    .tl-submit-btn:disabled { background:#9A9078; cursor:not-allowed; }
    .tl-error { color:#B5402E; font-size:12.5px; margin-top:6px; display:flex; gap:5px; align-items:center; }
    .tl-helptext { font-size:11.5px; color:#9A9078; margin-top:5px; }

    .tl-setup-input-row { display:flex; gap:8px; align-items:center; margin-bottom:9px; }
    .tl-setup-input-row input { flex:1; }

    .tl-id-list { display:flex; flex-direction:column; gap:8px; margin-top:6px; }
    .tl-id-opt { border:1.5px solid #D9CCA8; border-radius:9px; padding:11px 13px; cursor:pointer; font-weight:600; font-size:14px; color:#16243A; display:flex; justify-content:space-between; align-items:center; }
    .tl-id-opt:hover { background:#F1EADA; }

    .tl-loading-screen { display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; gap:10px; color:#16243A; }
    .tl-link-btn { background:none; border:none; color:#C8BFA8; font-size:12px; cursor:pointer; text-decoration:underline; padding:0; }
  `}</style>
);

/* ---------------------------------------------------------
   SETUP SCREEN
--------------------------------------------------------- */
function SetupScreen({ initial, onSave, onCancel }) {
  const [tripName, setTripName] = useState(initial?.tripName || "");
  const [names, setNames] = useState(
    initial?.members || ["", "", "", "", "", ""],
  );
  const [admin, setAdmin] = useState(initial?.admin || "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const updateName = (i, v) => {
    const next = [...names];
    next[i] = v;
    setNames(next);
  };

  const submit = async () => {
    const cleaned = names.map((n) => n.trim()).filter(Boolean);
    if (cleaned.length !== 6) {
      setErr("Enter all 6 friends' names.");
      return;
    }
    if (new Set(cleaned.map((n) => n.toLowerCase())).size !== 6) {
      setErr("Names must be unique.");
      return;
    }
    if (!admin || !cleaned.includes(admin)) {
      setErr("Pick who's holding the money (admin) from the list.");
      return;
    }
    if (!tripName.trim()) {
      setErr("Give the trip a name.");
      return;
    }
    setErr("");
    setBusy(true);
    const ok = await onSave({
      tripName: tripName.trim(),
      members: cleaned,
      admin,
    });
    setBusy(false);
    if (!ok)
      setErr("Couldn't save — check your internet connection and try again.");
  };

  return (
    <div className="tl-container" style={{ paddingTop: 26 }}>
      <h2
        className="tl-display"
        style={{
          fontSize: 20,
          fontWeight: 800,
          color: "#16243A",
          marginBottom: 4,
        }}
      >
        Set up the trip
      </h2>
      <p style={{ fontSize: 13, color: "#7C7158", marginBottom: 18 }}>
        Saved once, shared with everyone who opens this site.
      </p>

      <div className="tl-field">
        <label className="tl-label">Trip name</label>
        <input
          className="tl-input"
          value={tripName}
          onChange={(e) => setTripName(e.target.value)}
          placeholder="e.g. Goa 2026"
        />
      </div>

      <label className="tl-label">The 6 friends</label>
      {names.map((n, i) => (
        <div className="tl-setup-input-row" key={i}>
          <input
            className="tl-input"
            value={n}
            onChange={(e) => updateName(i, e.target.value)}
            placeholder={`Friend ${i + 1}`}
          />
        </div>
      ))}

      <div className="tl-field" style={{ marginTop: 14 }}>
        <label className="tl-label">Who's holding the money? (admin)</label>
        <select
          className="tl-select"
          value={admin}
          onChange={(e) => setAdmin(e.target.value)}
        >
          <option value="">Choose admin</option>
          {names
            .filter((n) => n.trim())
            .map((n, i) => (
              <option key={i} value={n.trim()}>
                {n.trim()}
              </option>
            ))}
        </select>
      </div>

      {err && (
        <div className="tl-error">
          <AlertCircle size={14} />
          {err}
        </div>
      )}

      <button className="tl-submit-btn" onClick={submit} disabled={busy}>
        {busy ? (
          <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
        ) : (
          <Check size={16} />
        )}
        Save trip setup
      </button>
      {onCancel && (
        <button
          className="tl-link-btn"
          style={{ color: "#7C7158", marginTop: 12, display: "block" }}
          onClick={onCancel}
        >
          Cancel
        </button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   IDENTITY PICKER MODAL
--------------------------------------------------------- */
function IdentityModal({ members, onPick, onClose, dismissible }) {
  return (
    <div
      className="tl-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && dismissible) onClose();
      }}
    >
      <div className="tl-modal">
        <div className="tl-modal-title">
          Who are you?
          {dismissible && (
            <button
              className="tl-pencil"
              style={{ position: "static" }}
              onClick={onClose}
            >
              <X size={18} />
            </button>
          )}
        </div>
        <p style={{ fontSize: 12.5, color: "#7C7158", marginBottom: 10 }}>
          This just tags entries as yours on this device — no password needed.
        </p>
        <div className="tl-id-list">
          {members.map((m) => (
            <div key={m} className="tl-id-opt" onClick={() => onPick(m)}>
              {m} <ChevronRight size={16} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   SPEND FORM MODAL
--------------------------------------------------------- */
function SpendFormModal({ me, isAdmin, onClose, onSubmit }) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("personal");
  const [file, setFile] = useState(null);
  const [fileLabel, setFileLabel] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef(null);

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setFileLabel(f.name);
  };

  const submit = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      setErr("Enter a valid amount.");
      return;
    }
    if (!description.trim()) {
      setErr("Add a short description.");
      return;
    }
    setErr("");
    setBusy(true);
    try {
      let proof = null;
      if (file) proof = await processProofFile(file);
      const ok = await onSubmit({
        amount: amt,
        description: description.trim(),
        type: isAdmin ? type : "personal",
        proof,
      });
      if (!ok) {
        setErr("Couldn't save — check your connection and try again.");
        setBusy(false);
        return;
      }
    } catch (e) {
      setErr(e.message || "Something went wrong saving this spend.");
      setBusy(false);
      return;
    }
    setBusy(false);
  };

  return (
    <div
      className="tl-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="tl-modal">
        <div className="tl-modal-title">
          Add a spend
          <button
            className="tl-pencil"
            style={{ position: "static" }}
            onClick={onClose}
            disabled={busy}
          >
            <X size={18} />
          </button>
        </div>

        <div className="tl-field">
          <label className="tl-label">Amount spent (₹)</label>
          <input
            className="tl-input tl-mono"
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
          />
        </div>

        <div className="tl-field">
          <label className="tl-label">What was it for?</label>
          <textarea
            className="tl-textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Auto fare from airport to hotel"
          />
        </div>

        {isAdmin && (
          <div className="tl-field">
            <label className="tl-label">Where did this money come from?</label>
            <div className="tl-radio-row">
              <div
                className={`tl-radio-opt ${type === "personal" ? "active" : ""}`}
                onClick={() => setType("personal")}
              >
                My own money
              </div>
              <div
                className={`tl-radio-opt ${type === "pool" ? "active" : ""}`}
                onClick={() => setType("pool")}
              >
                Trip pool (collected)
              </div>
            </div>
          </div>
        )}

        <div className="tl-field">
          <label className="tl-label">
            Proof (photo, bill screenshot or PDF)
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf,application/pdf"
            style={{ display: "none" }}
            onChange={handleFile}
          />
          <div
            className={`tl-upload-box ${file ? "has-file" : ""}`}
            onClick={() => fileInputRef.current?.click()}
          >
            {file ? (
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                {file.type === "application/pdf" ? (
                  <FileText size={16} />
                ) : (
                  <ImageIcon size={16} />
                )}{" "}
                {fileLabel}
              </span>
            ) : (
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                <Upload size={16} /> Tap to upload proof
              </span>
            )}
          </div>
          <div className="tl-helptext">
            Optional, but recommended. Images are compressed automatically; PDFs
            should be under ~500KB.
          </div>
        </div>

        <div className="tl-helptext" style={{ marginBottom: 4 }}>
          Logged as: <strong>{me}</strong> · timestamp added automatically
        </div>

        {err && (
          <div className="tl-error">
            <AlertCircle size={14} />
            {err}
          </div>
        )}

        <button className="tl-submit-btn" onClick={submit} disabled={busy}>
          {busy ? (
            <Loader2
              size={16}
              style={{ animation: "spin 1s linear infinite" }}
            />
          ) : (
            <Plus size={16} />
          )}
          {busy ? "Saving..." : "Save spend"}
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   PROOF VIEWER MODAL — data already lives on the spend record
   (no extra fetch needed, it came down with the real-time listener)
--------------------------------------------------------- */
function ProofModal({ record, onClose }) {
  return (
    <div
      className="tl-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="tl-modal">
        <div className="tl-modal-title">
          Proof
          <button
            className="tl-pencil"
            style={{ position: "static" }}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        {record.proofMime === "application/pdf" ? (
          <a
            className="tl-submit-btn"
            style={{ textDecoration: "none" }}
            href={record.proofData}
            download={record.proofName || "proof.pdf"}
          >
            <FileText size={16} /> Open / download {record.proofName || "PDF"}
          </a>
        ) : (
          <img
            src={record.proofData}
            alt="Proof"
            style={{
              width: "100%",
              borderRadius: 10,
              border: "1px solid #EAE1CC",
            }}
          />
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   MAIN APP
--------------------------------------------------------- */
export default function App() {
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState(null);
  const [deposits, setDeposits] = useState({});
  const [spends, setSpends] = useState([]);
  const [me, setMe] = useState(null);

  const [showSetup, setShowSetup] = useState(false);
  const [showIdentity, setShowIdentity] = useState(false);
  const [showSpendForm, setShowSpendForm] = useState(false);
  const [viewProof, setViewProof] = useState(null);
  const [editingDepositFor, setEditingDepositFor] = useState(null);
  const [depositDraft, setDepositDraft] = useState("");
  const [depositError, setDepositError] = useState("");
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  // Identity lives in this browser only.
  useEffect(() => {
    const saved = localStorage.getItem(ME_KEY);
    if (saved) setMe(saved);
  }, []);

  // Real-time Firestore subscriptions — every connected friend sees
  // updates within roughly a second, no polling involved.
  useEffect(() => {
    let unsubConfig = () => {};
    let unsubDeposits = () => {};
    let unsubSpends = () => {};

    const startSubscriptions = () => {
      try {
        unsubConfig = onSnapshot(
          doc(db, "config", "trip"),
          (snap) => {
            setConfig(snap.exists() ? snap.data() : null);
            setLoading(false);
          },
          () => setLoading(false),
        );

        unsubDeposits = onSnapshot(collection(db, "deposits"), (snap) => {
          const obj = {};
          snap.forEach((d) => {
            obj[d.id] = d.data().amount || 0;
          });
          setDeposits(obj);
        });

        const spendsQuery = query(
          collection(db, "spends"),
          orderBy("timestamp", "desc"),
        );
        unsubSpends = onSnapshot(spendsQuery, (snap) => {
          setSpends(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        });
      } catch (err) {
        console.error("Could not connect to Firestore:", err);
        setLoading(false);
      }
    };

    const timer = window.setTimeout(startSubscriptions, 0);

    return () => {
      window.clearTimeout(timer);
      unsubConfig();
      unsubDeposits();
      unsubSpends();
    };
  }, []);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const saveConfig = async (cfg) => {
    try {
      await setDoc(doc(db, "config", "trip"), cfg);
      setShowSetup(false);
      return true;
    } catch {
      return false;
    }
  };

  const pickIdentity = (name) => {
    localStorage.setItem(ME_KEY, name);
    setMe(name);
    setShowIdentity(false);
  };

  const requireIdentity = (then) => {
    if (!me) {
      setShowIdentity(true);
      return;
    }
    then();
  };

  const submitSpend = async ({ amount, description, type, proof }) => {
    try {
      await addDoc(collection(db, "spends"), {
        member: me,
        amount,
        description,
        type,
        proofData: proof?.dataUrl || null,
        proofMime: proof?.mime || null,
        proofName: proof?.name || null,
        timestamp: new Date().toISOString(),
      });
      setShowSpendForm(false);
      return true;
    } catch {
      return false;
    }
  };

  const saveDepositEdit = async (name) => {
    const val = parseFloat(depositDraft) || 0;
    setDepositError("");
    try {
      await setDoc(doc(db, "deposits", name), { amount: val }, { merge: true });
      setEditingDepositFor(null);
    } catch {
      setDepositError("Couldn't save — check your connection and try again.");
    }
  };

  if (loading) {
    return (
      <div className="tl-root">
        <GlobalStyle />
        <div className="tl-loading-screen">
          <Loader2 size={26} style={{ animation: "spin 1s linear infinite" }} />
          <div style={{ fontSize: 13.5 }}>Loading trip ledger…</div>
        </div>
      </div>
    );
  }

  if (!config || showSetup) {
    return (
      <div className="tl-root">
        <GlobalStyle />
        <div className="tl-header">
          <div className="tl-header-row">
            <div className="tl-title">
              <Plane size={20} /> Trip Ledger
            </div>
          </div>
        </div>
        <SetupScreen
          initial={config}
          onSave={saveConfig}
          onCancel={config ? () => setShowSetup(false) : null}
        />
      </div>
    );
  }

  const isAdmin = me === config.admin;
  const totalCollected = config.members.reduce(
    (s, m) => s + (deposits[m] || 0),
    0,
  );
  const poolSpends = spends.filter((s) => s.type === "pool");
  const totalPoolSpent = poolSpends.reduce((s, r) => s + r.amount, 0);
  const poolRemaining = totalCollected - totalPoolSpent;

  const memberPersonalTotal = (m) =>
    spends
      .filter((s) => s.member === m && s.type === "personal")
      .reduce((a, r) => a + r.amount, 0);

  return (
    <div className="tl-root">
      <GlobalStyle />

      {!online && (
        <div className="tl-offline-banner">
          <WifiOff size={13} /> Offline — your entries will save automatically
          once you're back online
        </div>
      )}

      <div className="tl-header">
        <div className="tl-header-row">
          <div>
            <div className="tl-title">
              <Plane size={20} /> {config.tripName}
            </div>
            <div className="tl-sub">
              {config.members.length} travelers · {config.admin} is holding the
              pool
            </div>
          </div>
          <div
            className="tl-identity-chip"
            onClick={() => setShowIdentity(true)}
          >
            <User size={14} /> {me || "Pick you"}
          </div>
        </div>
        <div className="tl-sync-text">
          <span className="tl-live-dot" /> Live — updates from everyone appear
          automatically
        </div>
      </div>

      <div className="tl-container">
        <div className="tl-stats">
          <div className="tl-stat-card">
            <div className="tl-stat-label">Pool collected</div>
            <div className="tl-stat-value">{fmt(totalCollected)}</div>
          </div>
          <div className="tl-stat-card">
            <div className="tl-stat-label">Spent from pool</div>
            <div className="tl-stat-value rust">{fmt(totalPoolSpent)}</div>
          </div>
          <div className="tl-stat-card">
            <div className="tl-stat-label">Pool remaining</div>
            <div className="tl-stat-value green">{fmt(poolRemaining)}</div>
          </div>
        </div>

        <div className="tl-section-title">
          <Wallet size={16} /> Travelers
        </div>
        <div className="tl-tag-grid">
          {config.members.map((m) => {
            const canEdit = me === m || isAdmin;
            return (
              <div className="tl-tag" key={m}>
                {canEdit && (
                  <button
                    className="tl-pencil"
                    onClick={() => {
                      setEditingDepositFor(m);
                      setDepositDraft(String(deposits[m] || ""));
                      setDepositError("");
                    }}
                  >
                    <Pencil size={13} />
                  </button>
                )}
                <div className="tl-tag-name">
                  {m}
                  {m === config.admin && (
                    <span className="tl-tag-admin-badge">
                      <Shield size={9} /> Admin
                    </span>
                  )}
                </div>

                {editingDepositFor === m ? (
                  <div>
                    <div className="tl-tag-edit">
                      <input
                        className="tl-mono"
                        type="number"
                        value={depositDraft}
                        onChange={(e) => setDepositDraft(e.target.value)}
                        autoFocus
                      />
                      <button
                        className="tl-icon-btn"
                        onClick={() => saveDepositEdit(m)}
                      >
                        <Check size={14} />
                      </button>
                      <button
                        className="tl-icon-btn"
                        style={{ background: "#9A9078" }}
                        onClick={() => {
                          setEditingDepositFor(null);
                          setDepositError("");
                        }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                    {depositError && (
                      <div className="tl-error" style={{ marginTop: 6 }}>
                        <AlertCircle size={12} />
                        {depositError}
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="tl-tag-row">
                      <span>Deposited to pool</span>
                      <span className="tl-tag-amt">
                        {fmt(deposits[m] || 0)}
                      </span>
                    </div>
                    <div className="tl-tag-row">
                      <span>Personal spends</span>
                      <span className="tl-tag-amt" style={{ color: "#16243A" }}>
                        {fmt(memberPersonalTotal(m))}
                      </span>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div className="tl-section-title">
          <Receipt size={16} /> All spends
        </div>
        {spends.length === 0 && (
          <div className="tl-empty">
            No spends logged yet. Add the first one below.
          </div>
        )}
        {spends.map((r) => (
          <div className={`tl-feed-item ${r.type}`} key={r.id}>
            <div className="tl-feed-main">
              <div className="tl-feed-top">
                <div className="tl-feed-who">
                  {r.member}
                  <span className={`tl-feed-badge ${r.type}`}>
                    {r.type === "pool" ? "From pool" : "Personal"}
                  </span>
                </div>
                <div className="tl-feed-amt">{fmt(r.amount)}</div>
              </div>
              <div className="tl-feed-desc">{r.description}</div>
              <div className="tl-feed-bottom">
                <div className="tl-feed-time">
                  <Clock size={11} /> {fmtDateTime(r.timestamp)}
                </div>
                {r.proofData && (
                  <button
                    className="tl-proof-btn"
                    onClick={() => setViewProof(r)}
                  >
                    <Eye size={12} /> Proof
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}

        {isAdmin && (
          <button
            className="tl-link-btn"
            style={{ color: "#7C7158", marginTop: 18 }}
            onClick={() => setShowSetup(true)}
          >
            <Settings size={11} style={{ marginRight: 4, verticalAlign: -1 }} />{" "}
            Edit trip setup
          </button>
        )}
      </div>

      <button
        className="tl-fab"
        onClick={() => requireIdentity(() => setShowSpendForm(true))}
      >
        <Plus size={18} /> Add spend
      </button>

      {showIdentity && (
        <IdentityModal
          members={config.members}
          onPick={pickIdentity}
          onClose={() => setShowIdentity(false)}
          dismissible={!!me}
        />
      )}

      {showSpendForm && me && (
        <SpendFormModal
          me={me}
          isAdmin={isAdmin}
          onClose={() => setShowSpendForm(false)}
          onSubmit={submitSpend}
        />
      )}

      {viewProof && (
        <ProofModal record={viewProof} onClose={() => setViewProof(null)} />
      )}
    </div>
  );
}
