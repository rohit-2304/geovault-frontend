import io from 'socket.io-client';

class SignalingClient {
  constructor() {
    this.baseUrl = process.env.REACT_APP_API_URL || "http://localhost:3000";
    this.socket = null;
  }

  /**
   * Connects to the signaling server and joins the vault room.
   * @param {string} vaultId
   * @param {function} onSignalReceived  - called when a WebRTC signal arrives from peer
   * @param {function} [onParticipantsUpdated] - called when someone joins/leaves the room
   */
  connect(vaultId, onSignalReceived, onParticipantsUpdated) {
    // Disconnect any existing socket before creating a new one
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.socket = io(this.baseUrl);

    this.socket.on('connect', () => {
      console.log('[Signaling] Connected, joining vault:', vaultId);
      this.socket.emit('join-vault', vaultId);
    });

    this.socket.on('signal', (data) => {
      console.log('[Signaling] Incoming signal type:', data?.signal?.type);
      onSignalReceived(data.signal);
    });

    if (onParticipantsUpdated) {
      this.socket.on('participants-updated', (participants) => {
        console.log('[Signaling] Participants updated:', participants);
        onParticipantsUpdated(participants);
      });
    }

    this.socket.on('error', (err) => {
      console.error('[Signaling] Socket error:', err);
    });
  }

  /**
   * Sends a WebRTC signal (offer/answer/ICE) to the other peer via the server.
   */
  sendSignal(vaultId, signalData) {
    if (this.socket && this.socket.connected) {
      console.log('[Signaling] Sending signal type:', signalData?.type);
      this.socket.emit('signal', { vaultId, signalData });
    } else {
      console.warn('[Signaling] Cannot send signal — socket not connected');
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export default new SignalingClient();