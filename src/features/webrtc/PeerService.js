// simple-peer is loaded via CDN in index.html — use the global instead of the webpack import
// to avoid webpack 5's missing Node.js polyfills (readable-stream, process, Buffer, etc.)
import SignalingClient from './SignalingClient';
const Peer = window.SimplePeer;


const CHUNK_SIZE = 16384; // 16KB chunks

// ICE configuration — STUN servers let WebRTC discover reachable network candidates.
// Trickle ICE (trickle:true) sends candidates as they're gathered so the connection
// doesn't stall waiting for all of them before sending the SDP.
const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.stunprotocol.org:3478' },
  ],
};

class PeerService {
  constructor() {
    this.peer = null;
    this._cachedSignal = null; // stores sender's offer to re-send when recipient joins
  }

  /**
   * Initializes as the SENDER (initiator).
   * Creates the WebRTC offer immediately, caches it, and re-sends it
   * every time participants-updated fires (i.e. when recipient joins the room).
   * File sending begins as soon as the P2P connection is established.
   *
   * @param {string} vaultId
   * @param {function} onConnected - called when P2P link is open and ready to send
   */
  initSender(vaultId, onConnected) {
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    this._cachedSignal = null;

    this.peer = new Peer({ initiator: true, trickle: true, config: ICE_CONFIG });

    // 1. For every signal: forward it immediately.
    //    Additionally, cache the SDP offer so we can re-send it when recipient joins.
    this.peer.on('signal', (data) => {
      console.log('[PeerService/Sender] Signal event, type:', data.type ?? 'ICE candidate');
      // Only cache the SDP offer (not individual ICE candidates)
      if (data.type === 'offer') {
        this._cachedSignal = data;
      }
      SignalingClient.sendSignal(vaultId, data);
    });

    // 2. P2P is fully open — start the file transfer
    this.peer.on('connect', () => {
      console.log('[PeerService/Sender] P2P connected!');
      onConnected();
    });

    this.peer.on('error', (err) => console.error('[PeerService/Sender] Error:', err));

    // 3. Join the signaling room
    //    - onSignalReceived: recipient's SDP answer/ICE candidates arrive → feed to peer
    //    - onParticipantsUpdated: someone joined → re-send our cached SDP offer
    SignalingClient.connect(
      vaultId,
      (incomingSignal) => {
        console.log('[PeerService/Sender] Received signal from recipient, type:', incomingSignal?.type ?? 'ICE');
        this.peer.signal(incomingSignal);
      },
      (participants) => {
        // Re-send the cached SDP offer so the recipient gets it even if they joined late
        if (this._cachedSignal) {
          console.log('[PeerService/Sender] Re-sending cached offer to new participant');
          SignalingClient.sendSignal(vaultId, this._cachedSignal);
        }
      }
    );
  }

  /**
   * Initializes as the RECIPIENT (non-initiator).
   * Joins the room and waits for the sender's offer.
   *
   * @param {string} vaultId
   * @param {function} onDataReceived - called for every chunk/message received
   */
  initRecipient(vaultId, onDataReceived) {
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }

    this.peer = new Peer({ initiator: false, trickle: true, config: ICE_CONFIG });

    // 1. When this peer generates an SDP answer, send it to the sender
    this.peer.on('signal', (data) => {
      console.log('[PeerService/Recipient] Generated answer, sending to sender');
      SignalingClient.sendSignal(vaultId, data);
    });

    // 2. P2P is open
    this.peer.on('connect', () => {
      console.log('[PeerService/Recipient] P2P connected!');
    });

    // 3. Incoming data from sender
    this.peer.on('data', (data) => {
      const preview = typeof data === 'string' ? data.substring(0, 80) : `[binary ${data.byteLength ?? data.length} bytes]`;
      console.log('[PeerService/Recipient] data event — type:', typeof data, '| preview:', preview);
      onDataReceived(data);
    });

    this.peer.on('error', (err) => console.error('[PeerService/Recipient] Error:', err));

    // 4. Join the signaling room and wait for the sender's offer
    SignalingClient.connect(
      vaultId,
      (incomingSignal) => {
        console.log('[PeerService/Recipient] Received offer from sender, signaling peer');
        this.peer.signal(incomingSignal);
      }
    );
  }

  /**
   * Sends the encrypted file over the P2P channel.
   * First sends a JSON META header with the IV and filename,
   * then binary chunks, then 'EOF'.
   */
  sendLargeFile(encryptedData, iv, fileName, onProgress) {
    try {
      console.log('[PeerService/Sender] sendLargeFile called. byteLength:', encryptedData.byteLength, 'iv:', iv, 'fileName:', fileName);
      console.log('[PeerService/Sender] peer.connected:', this.peer && this.peer.connected);

      // Step 1: Send metadata header so recipient knows the IV and filename
      const meta = JSON.stringify({
        type: 'META',
        iv: Array.from(iv),
        fileName: fileName,
      });
      console.log('[PeerService/Sender] Sending META header');
      this.peer.send(meta);

      // Step 2: Send binary chunks
      const totalChunks = Math.ceil(encryptedData.byteLength / CHUNK_SIZE);
      console.log('[PeerService/Sender] Sending', totalChunks, 'chunks');
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, encryptedData.byteLength);
        this.peer.send(encryptedData.slice(start, end));
        if (onProgress) {
          onProgress(Math.round(((i + 1) / totalChunks) * 100));
        }
      }

      // Step 3: Signal end of file
      this.peer.send('EOF');
      console.log('[PeerService/Sender] EOF sent. Transfer complete.');
    } catch (err) {
      console.error('[PeerService/Sender] sendLargeFile ERROR:', err);
    }
  }
}

export default new PeerService();
