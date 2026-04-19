import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import PeerService from '../webrtc/PeerService';
import { getCurrentLocation } from '../../utils/geoUtils';
import { importKey, decryptFile } from '../../utils/cryptoUtils';
import Layout from '../../components/Layout';
import axios from 'axios';

// ── Helpers ───────────────────────────────────────────────────────────────────

const formatFileSize = (bytes) => {
  if (!bytes) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

const getFileExt = (name) => {
  if (!name) return 'FILE';
  const ext = name.split('.').pop();
  return ext ? ext.toUpperCase() : 'FILE';
};

/**
 * Decode incoming P2P data as UTF-8 text.
 * simple-peer CDN delivers even string sends as Uint8Array/ArrayBuffer.
 * Using { fatal: true } means invalid UTF-8 (encrypted binary) throws → null.
 */
const tryDecodeText = (data) => {
  if (typeof data === 'string') return data;
  try {
    const bytes = data instanceof Uint8Array
      ? data
      : new Uint8Array(data instanceof ArrayBuffer ? data : data.buffer);
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (e) {
    return null;
  }
};

const concatenateBuffers = (chunks) => {
  const arrays = chunks.map(c =>
    c instanceof Uint8Array ? c : new Uint8Array(c instanceof ArrayBuffer ? c : c.buffer)
  );
  const total = arrays.reduce((sum, a) => sum + a.byteLength, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) { result.set(arr, offset); offset += arr.byteLength; }
  return result.buffer;
};

// ── Terminal log steps ─────────────────────────────────────────────────────────

const STEP_LABELS = {
  init:     'Initializing session...',
  verify:   'Verifying GPS location...',
  unlock:   'Unlocking vault with location proof...',
  connect:  'Connecting to sender peer...',
  receive:  'Receiving encrypted data...',
  decrypt:  'Decrypting file...',
  done:     'File Decrypted! Ready for download.',
};

// ── Component ─────────────────────────────────────────────────────────────────

const RecipientDashboard = () => {
  const { vaultId } = useParams();
  const [status, setStatus] = useState('init');
  const [errorMsg, setErrorMsg] = useState('');
  const [geoError, setGeoError] = useState(null); // { icon, title, message }
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const [decryptedUrl, setDecryptedUrl] = useState(null);
  const [completedSteps, setCompletedSteps] = useState(['init']);

  const receivedChunks = useRef([]);
  const ivRef = useRef(null);

  const advance = (stepKey) => {
    setStatus(stepKey);
    setCompletedSteps(prev => [...prev, stepKey]);
  };

  useEffect(() => {
    const run = async () => {
      try {
        // 1 — key from hash
        const encryptionKeyRaw = window.location.hash.substring(1);
        if (!encryptionKeyRaw) throw new Error('No encryption key found in link!');

        // 2 — verify location
        advance('verify');
        const coords = await getCurrentLocation();
        const verifyRes = await axios.post(`${process.env.REACT_APP_API_URL}/api/vaults/verify`, {
          lat: coords.lat, lon: coords.lon,
        });
        const locationToken = verifyRes.data.token;

        // 3 — unlock vault
        advance('unlock');
        const vaultRes = await axios.get(`${process.env.REACT_APP_API_URL}/api/vaults/${vaultId}`, {
          headers: { 'x-location-proof': locationToken },
        });
        setFileName(vaultRes.data.file_name || '');
        setFileSize(vaultRes.data.file_size || 0);

        // 4 — P2P connect
        advance('connect');
        PeerService.initRecipient(vaultId, async (data) => {
          const asText = tryDecodeText(data);

          if (asText === 'EOF') {
            advance('decrypt');
            try {
              const cryptoKey = await importKey(encryptionKeyRaw);
              const fullBuffer = concatenateBuffers(receivedChunks.current);
              const decryptedBuffer = await decryptFile(fullBuffer, cryptoKey, ivRef.current);
              const blob = new Blob([decryptedBuffer]);
              setDecryptedUrl(URL.createObjectURL(blob));
              advance('done');
            } catch (err) {
              setErrorMsg('Decryption Failed: ' + err.message);
            }
          } else if (asText && asText.startsWith('{')) {
            try {
              const meta = JSON.parse(asText);
              if (meta.type === 'META') {
                ivRef.current = new Uint8Array(meta.iv);
                if (meta.fileName) setFileName(meta.fileName);
                receivedChunks.current = [];
                advance('receive');
              }
            } catch (e) { /* not META */ }
          } else {
            receivedChunks.current.push(data);
          }
        });

      } catch (err) {
        console.error('[Recipient] Error:', err);
        // Read the structured error code from the backend 403 response
        const code = err?.response?.data?.code;
        const serverMsg = err?.response?.data?.error;
        if (code === 'GEO_OUT_OF_RANGE') {
          setGeoError({
            icon: 'location_off',
            title: 'Outside Geo-Fence',
            message: serverMsg || 'You are outside the permitted area. Move within 50 metres of the sender and try again.',
          });
        } else if (code === 'GEO_EXPIRED') {
          setGeoError({
            icon: 'timer_off',
            title: 'Vault Expired',
            message: serverMsg || 'This vault has expired. Ask the sender to create a new link.',
          });
        } else if (code === 'GEO_NOT_FOUND') {
          setGeoError({
            icon: 'search_off',
            title: 'Vault Not Found',
            message: serverMsg || 'This vault does not exist or has already been used.',
          });
        } else if (code === 'GEO_SPOOFING') {
          setGeoError({
            icon: 'gpp_bad',
            title: 'Location Mismatch Detected',
            message: serverMsg || 'Your GPS coordinates do not match your network location.',
          });
        } else {
          setErrorMsg(serverMsg || err.message);
        }
      }
    };

    run();
  }, [vaultId]);

  const isDone = status === 'done';
  const isError = !!errorMsg;

  // Map completed steps → terminal lines
  const terminalLines = completedSteps.map((key, i) => ({
    key,
    label: STEP_LABELS[key] || key,
    isLast: i === completedSteps.length - 1,
    isDone: key === 'done',
  }));

  return (
    <Layout>
      <main className="flex-grow flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-2xl relative">

          {/* Decorative dither */}
          <div className="absolute -inset-4 dither-bg -z-10 pointer-events-none"></div>

          {/* Page heading */}
          <div className="mb-8 flex flex-col gap-2">
            <h1 className="font-headline text-5xl md:text-6xl font-black uppercase tracking-tighter leading-none">
              Secure Retrieval
            </h1>
            <div className="flex items-center gap-2">
              <span className="h-1 w-12 bg-primary"></span>
              <span className="font-label text-xs uppercase tracking-widest text-secondary">
                Node: GV-2025-ALPHA
              </span>
            </div>
          </div>

          {/* ── Geo-Fence Error Card (replaces main window on 403) ── */}
          {geoError && (
            <div className="bg-surface border-2 border-primary rounded-none hard-shadow overflow-hidden">
              {/* Title bar */}
              <div className="bg-primary px-4 py-2 flex items-center justify-between">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full border border-on-primary opacity-60"></div>
                  <div className="w-3 h-3 rounded-full border border-on-primary opacity-60"></div>
                  <div className="w-3 h-3 rounded-full border border-on-primary opacity-60"></div>
                </div>
                <span className="font-label text-xs font-bold text-on-primary uppercase tracking-widest">Access Denied</span>
                <div className="w-12"></div>
              </div>
              {/* Body */}
              <div className="p-8 md:p-12 flex flex-col items-center text-center gap-6">
                <div className="w-24 h-24 border-4 border-black bg-surface-container-low flex items-center justify-center hard-shadow">
                  <span className="material-symbols-outlined text-5xl">{geoError.icon}</span>
                </div>
                <div>
                  <h2 className="font-headline font-black text-2xl uppercase tracking-tighter mb-2">{geoError.title}</h2>
                  <p className="font-body text-sm text-secondary max-w-sm leading-relaxed">{geoError.message}</p>
                </div>
                {/* Terminal-style error line */}
                <div className="w-full bg-surface-container-low border-2 border-primary p-4 text-left">
                  <p className="font-label text-xs uppercase text-secondary">&gt; status: <span className="text-error font-bold">REJECTED</span></p>
                  <p className="font-label text-xs uppercase text-secondary">&gt; reason: <span className="text-primary font-bold">{geoError.title}</span></p>
                </div>
                <button
                  onClick={() => window.location.reload()}
                  className="w-full bg-primary text-on-primary font-label font-bold text-sm py-4 uppercase tracking-widest hard-shadow hard-shadow-active transition-all flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-on-primary text-sm">refresh</span>
                  Try Again
                </button>
              </div>
            </div>
          )}

          {/* ── Main Window ── */}
          {!geoError && <div className="bg-surface border-2 border-primary rounded-none hard-shadow overflow-hidden">

            {/* Window Title Bar */}
            <div className="bg-primary px-4 py-2 flex items-center justify-between border-b-2 border-primary">
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full border border-on-primary opacity-60"></div>
                <div className="w-3 h-3 rounded-full border border-on-primary opacity-60"></div>
                <div className="w-3 h-3 rounded-full border border-on-primary opacity-60"></div>
              </div>
              <span className="font-label text-xs font-bold text-on-primary uppercase tracking-widest">
                {isDone ? 'Transfer Complete' : 'Incoming Transfer...'}
              </span>
              <div className="w-12"></div>
            </div>

            {/* Window Content */}
            <div className="p-8 md:p-12 space-y-8">

              {/* ── File Preview Card (shows once we know the filename) ── */}
              {fileName && (
                <div className="bg-surface-container-lowest border-2 border-primary p-6 flex items-start gap-6">
                  <div className="w-20 h-24 bg-primary flex items-center justify-center relative flex-shrink-0">
                    <span
                      className="material-symbols-outlined text-on-primary text-5xl"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >description</span>
                    <div className="absolute bottom-1 right-1 bg-surface w-4 h-4 border border-primary"></div>
                  </div>
                  <div className="flex flex-col gap-1 overflow-hidden">
                    <span className="font-label text-[10px] text-secondary uppercase tracking-[0.2em]">
                      Package Entity
                    </span>
                    <h2 className="font-headline text-xl md:text-2xl font-bold break-all leading-tight">
                      {fileName}
                    </h2>
                    <div className="flex gap-4 mt-2 flex-wrap">
                      {fileSize > 0 && (
                        <span className="font-label text-[10px] bg-primary text-on-primary px-2 py-0.5">
                          {formatFileSize(fileSize)}
                        </span>
                      )}
                      <span className="font-label text-[10px] border border-primary px-2 py-0.5">
                        {getFileExt(fileName)}/AES-256
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Terminal Status Log ── */}
              <div className="bg-surface-container-low p-4 space-y-2">
                <div className="font-label text-[11px] flex justify-between opacity-50 mb-3">
                  <span>SESSION_ID: {vaultId?.slice(0, 8).toUpperCase()}</span>
                  <span>TIME: {new Date().toLocaleTimeString('en-GB')}</span>
                </div>
                <div className="font-label text-xs uppercase space-y-1">
                  {terminalLines.map(({ key, label, isLast, isDone: stepDone }) => (
                    <p
                      key={key}
                      className={`tracking-tight ${
                        stepDone
                          ? 'font-bold'
                          : isLast && !stepDone
                          ? 'opacity-100'
                          : 'text-secondary'
                      }`}
                    >
                      &gt; {label}
                      {' '}
                      <span className={stepDone ? 'font-bold' : isLast ? 'animate-pulse' : ''}>
                        {stepDone ? '' : isLast ? '...' : 'SUCCESS'}
                      </span>
                    </p>
                  ))}

                  {/* Error line */}
                  {isError && (
                    <p className="text-error font-bold tracking-tight">&gt; {errorMsg}</p>
                  )}

                  {/* Done banner */}
                  {isDone && (
                    <div className="bg-primary text-on-primary p-2 mt-4 font-bold text-center tracking-wider">
                      File Decrypted! Ready for download.
                    </div>
                  )}
                </div>
              </div>

              {/* ── Download Button — only when done ── */}
              {isDone && decryptedUrl && (
                <a
                  href={decryptedUrl}
                  download={fileName || 'download'}
                  className="w-full bg-primary text-on-primary font-label font-bold text-sm md:text-base py-6 uppercase tracking-widest hard-shadow hard-shadow-active transition-all duration-75 flex items-center justify-center gap-3"
                >
                  <span
                    className="material-symbols-outlined text-on-primary"
                    style={{ fontVariationSettings: "'FILL' 0" }}
                  >download</span>
                  Download {fileName}
                </a>
              )}

            </div>
          </div>}

          {/* ── Metadata strip ── */}
          <div className="mt-8 grid grid-cols-2 gap-4">
            <div className="border-t-2 border-primary pt-4">
              <span className="block font-label text-[10px] text-secondary uppercase">Encryption Protocol</span>
              <span className="font-headline text-sm font-bold">AES-256-GCM</span>
            </div>
            <div className="border-t-2 border-primary pt-4">
              <span className="block font-label text-[10px] text-secondary uppercase">Storage Duration</span>
              <span className="font-headline text-sm font-bold">Expires in 10:00</span>
            </div>
          </div>

        </div>
      </main>
    </Layout>
  );
};

export default RecipientDashboard;