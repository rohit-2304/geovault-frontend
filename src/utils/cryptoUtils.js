/**
 * Generates a high-entropy AES-256-GCM key.
 * GCM mode is preferred because it provides both encryption and integrity.
 */

export const generateEncryptionKey = async () => {
    return await window.crypto.subtle.generateKey(
        {
            name:"AES-GCM",
            length : 256,
        },
        true,
        ["encrypt","decrypt"]
    );
};

/**
 * Converts a CryptoKey to a Base64 string for URL sharing.
 */

export const exportKey = async (key) => {
    const exported = await window.crypto.subtle.exportKey("raw",key);
    return btoa(String.fromCharCode(...new Uint8Array(exported)));
};

/**
 * Encrypts a file (Blob/File) using the provided key.
 * We also generate a random 12-byte IV (Initialization Vector) per file.
 */

export const encryptFile = async (file, key) => {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const fileBuffer = await file.arrayBuffer();

    const encryptedBuffer = await window.crypto.subtle.encrypt(
        {
            name:"AES-GCM",
            iv: iv,
        },
        key,
        fileBuffer
    );

    return{
        encryptedData : encryptedBuffer,
        iv: iv,
    };
};

/**
 * Converts a Base64 string (from the URL hash) back into a CryptoKey object.
 */
export const importKey = async (base64Key) => {
    const rawKey = Uint8Array.from(atob(base64Key), c => c.charCodeAt(0));
    return await window.crypto.subtle.importKey(
        "raw",
        rawKey,
        { name: "AES-GCM" },
        true,
        ["encrypt", "decrypt"]
    );
};

/**
 * Decrypts the encrypted buffer using the key and the IV sent by the sender.
 */
export const decryptFile = async (encryptedData, key, iv) => {
    try {
        const decryptedBuffer = await window.crypto.subtle.decrypt(
            {
                name: "AES-GCM",
                iv: iv, // The 12-byte IV received from the sender
            },
            key,
            encryptedData
        );
        return decryptedBuffer;
    } catch (error) {
        console.error("Decryption failed:", error);
        throw new Error("Invalid key or corrupted data.");
    }
};