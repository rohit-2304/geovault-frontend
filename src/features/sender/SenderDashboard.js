import React, { useState } from 'react';
import Layout from '../../components/Layout';
import { generateEncryptionKey, exportKey, encryptFile } from '../../utils/cryptoUtils';
import { getCurrentLocation } from '../../utils/geoUtils';
import PeerService from '../webrtc/PeerService';
import axios from 'axios';

// ── Helpers ──────────────────────────────────────────────────────────────────

const formatFileSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

const formatMime = (file) => {
  if (file.type) return file.type.split('/').pop().toUpperCase();
  const ext = file.name.split('.').pop();
  return ext ? ext.toUpperCase() : 'FILE';
};

// ── Component ─────────────────────────────────────────────────────────────────

const SenderDashboard = () => {
  const [file, setFile] = useState(null);
  const [shareLink, setShareLink] = useState('');
  const [status, setStatus] = useState('Idle');
  const [progress, setProgress] = useState(0);
  const [copied, setCopied] = useState(false);

  const handleFileSelect = (f) => {
    if (!f) return;
    setFile(f);
    setShareLink('');
    setStatus('Idle');
    setProgress(0);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    handleFileSelect(e.dataTransfer.files[0]);
  };

  const startVaultProcess = async () => {
    try {
      setStatus('Pinpointing Location...');
      const coords = await getCurrentLocation();

      setStatus('Encrypting Locally...');
      const key = await generateEncryptionKey();
      const { encryptedData, iv } = await encryptFile(file, key);
      const encodedKey = await exportKey(key);

      setStatus('Creating Geo-Anchor...');
      const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/vaults/anchor`, {
        lat: coords.lat,
        lon: coords.lon,
        fileName: file.name,
        fileSize: file.size,
      });

      const { vaultId } = response.data;
      const link = `${window.location.origin}/v/${vaultId}#${encodedKey}`;
      setShareLink(link);
      setStatus('Vault Active. Waiting for recipient...');

      PeerService.initSender(vaultId, () => {
        setStatus('Transferring...');
        PeerService.sendLargeFile(encryptedData, iv, file.name, (p) => setProgress(p));
      });
    } catch (err) {
      setStatus('Error: ' + err.message);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hasStarted    = status !== 'Idle';
  const isTransferring = status === 'Transferring...';
  const isError       = status.startsWith('Error');

  return (
    <Layout>
      <div className="min-h-[calc(100vh-160px)] p-4 md:p-12 max-w-6xl mx-auto flex flex-col items-center justify-center">

        {/* ── Main Window ── */}
        <div className="w-full max-w-3xl bg-surface border-2 border-primary rounded-none brutalist-shadow relative overflow-hidden">

          {/* Window Title Bar */}
          <div className="bg-primary text-on-primary h-10 flex items-center justify-between px-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full border border-on-primary opacity-60"></div>
              <div className="w-3 h-3 rounded-full border border-on-primary opacity-60"></div>
              <div className="w-3 h-3 rounded-full border border-on-primary opacity-60"></div>
            </div>
            <span className="font-label uppercase text-xs tracking-widest font-bold">System — Secure File Anchor</span>
            <div className="w-12"></div>
          </div>

          {/* Window Body */}
          <div className="p-6 md:p-10 relative">
            {/* Decorative dither overlay */}
            <div className="absolute inset-0 pixel-dither pointer-events-none"></div>

            <div className="relative z-10">
              {/* Heading */}
              <header className="mb-8">
                <h2 className="text-4xl md:text-5xl font-headline font-black uppercase tracking-tighter leading-none mb-4">
                  Secure File Anchor
                </h2>
                <p className="text-lg font-body max-w-xl border-l-4 border-primary pl-4 py-1 italic">
                  Your file never touches our server. It stays on your device until a geo-verified peer connects.
                </p>
              </header>

              {/* ── Drop Zone ── */}
              <div
                className="border-4 border-black bg-surface-container-lowest p-8 md:p-12 mb-6 flex flex-col items-center justify-center text-center"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
              >
                {file ? (
                  /* State B — file selected */
                  <>
                    <div className="w-20 h-24 border-2 border-black bg-white mb-4 flex items-center justify-center relative brutalist-shadow">
                      <span className="material-symbols-outlined text-5xl">description</span>
                      <div className="absolute -bottom-2 -right-2 bg-primary text-white p-1">
                        <span
                          className="material-symbols-outlined text-sm"
                          style={{ fontVariationSettings: "'FILL' 1" }}
                        >check_circle</span>
                      </div>
                    </div>
                    <p className="font-label text-xl font-bold uppercase tracking-tight mb-1 break-all max-w-xs">
                      {file.name}
                    </p>
                    <p className="text-xs font-label opacity-60 uppercase">
                      {formatFileSize(file.size)} · {formatMime(file)}
                    </p>
                    {!hasStarted && (
                      <button
                        onClick={() => setFile(null)}
                        className="mt-4 text-xs font-label uppercase underline hover:bg-black hover:text-white px-2 py-1 transition-colors"
                      >
                        Replace File
                      </button>
                    )}
                  </>
                ) : (
                  /* State A — no file */
                  <>
                    <input
                      type="file"
                      id="fileInput"
                      className="hidden"
                      onChange={(e) => handleFileSelect(e.target.files[0])}
                    />
                    <label htmlFor="fileInput" className="cursor-pointer flex flex-col items-center">
                      <span className="material-symbols-outlined text-6xl mb-4 opacity-40">upload_file</span>
                      <p className="font-label text-xl font-bold uppercase tracking-tight mb-2">
                        Drag & Drop or Click to Upload
                      </p>
                      <p className="text-xs font-label opacity-60 uppercase">
                        Files are encrypted locally. No server storage.
                      </p>
                    </label>
                  </>
                )}
              </div>

              {/* ── Action Button — only when file ready, before process starts ── */}
              {file && !hasStarted && (
                <button
                  onClick={startVaultProcess}
                  className="w-full bg-primary text-on-primary font-headline font-black text-2xl py-6 uppercase tracking-widest brutalist-shadow brutalist-shadow-hover transition-all mb-8"
                >
                  Lock &amp; Share File
                </button>
              )}

              {/* ── Status Card — appears after process starts ── */}
              {hasStarted && (
                <div className="border-2 border-black bg-white p-6 brutalist-shadow">
                  {/* Status indicator */}
                  <div className="flex items-center gap-3 mb-6">
                    <div className={`w-3 h-3 flex-shrink-0 ${isError ? 'bg-error' : 'bg-primary animate-pulse'}`}></div>
                    <span className={`font-label text-sm font-bold uppercase tracking-widest ${isError ? 'text-error' : ''}`}>
                      {status}
                    </span>
                  </div>

                  {/* Progress bar — only during transfer */}
                  {isTransferring && (
                    <div className="mb-6">
                      <div className="flex justify-between font-label text-xs uppercase mb-2">
                        <span>Transferring P2P...</span>
                        <span>{progress}%</span>
                      </div>
                      <div className="w-full bg-surface-container-high border-2 border-black h-4">
                        <div
                          className="bg-primary h-full transition-all duration-300"
                          style={{ width: `${progress}%` }}
                        ></div>
                      </div>
                    </div>
                  )}

                  {/* Share link — once vault is created */}
                  {shareLink && (
                    <div className="space-y-2">
                      <label className="font-label text-xs uppercase font-bold tracking-widest opacity-60">
                        Share this Geo-Locked link
                      </label>
                      <div className="flex flex-col md:flex-row gap-2">
                        <input
                          readOnly
                          value={shareLink}
                          className="flex-grow bg-surface-container-low border-2 border-primary px-4 py-3 font-label text-sm focus:ring-0 focus:outline-none rounded-none"
                        />
                        <button
                          onClick={handleCopy}
                          className="bg-primary text-white px-8 py-3 font-headline font-bold uppercase text-sm brutalist-shadow-hover transition-all"
                        >
                          {copied ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Window Status Bar */}
          <div className="bg-surface-container-high h-8 border-t-2 border-primary flex items-center px-4 justify-between font-label text-[10px] uppercase tracking-tighter">
            <span>Encryption: AES-256-GCM</span>
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">wifi_tethering</span>
              Local Peer Discovery Active
            </span>
          </div>
        </div>

        {/* ── Feature Info Cards (decorative) ── */}
        <div className="w-full max-w-3xl mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="border-2 border-black p-4 bg-white brutalist-shadow">
            <span className="material-symbols-outlined text-3xl mb-2 block">location_searching</span>
            <h4 className="font-headline font-bold uppercase text-sm mb-1">Geo-Fence</h4>
            <p className="text-xs font-body leading-tight">Restrict download access to specific GPS coordinates.</p>
          </div>
          <div className="border-2 border-black p-4 bg-white brutalist-shadow">
            <span className="material-symbols-outlined text-3xl mb-2 block">history_toggle_off</span>
            <h4 className="font-headline font-bold uppercase text-sm mb-1">Self-Destruct</h4>
            <p className="text-xs font-body leading-tight">Link automatically expires after peer disconnection.</p>
          </div>
          <div className="border-2 border-black p-4 bg-white brutalist-shadow">
            <span className="material-symbols-outlined text-3xl mb-2 block">fingerprint</span>
            <h4 className="font-headline font-bold uppercase text-sm mb-1">Peer Verification</h4>
            <p className="text-xs font-body leading-tight">Recipients must pass local identity handshake.</p>
          </div>
        </div>

      </div>
    </Layout>
  );
};

export default SenderDashboard;