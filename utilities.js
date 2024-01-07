import { Buffer } from "node:buffer";

/**
 * Convert a Base64 string to Uint8Array.
 * This function does strict checking of the Base64 string.
 * @param {string} b64 Base64 string.
 * @returns {Uint8Array}
 */
export const b64ToBytes = (b64) => Uint8Array.from(atob(b64), (m) => m.codePointAt(0));

/**
 * Convert an Uint8Array to a Base64 string.
 * @param {Uint8Array} bytes Uint8Array.
 * @returns {string}
 */
export const bytesTob64 = (bytes) => btoa(String.fromCodePoint(...bytes));

/**
 * Convert a Base64 string to Buffer.
 * @param {string} b64 Base64 string.
 * @returns {Buffer}
 */
export const b64ToBuffer = (b64) => Buffer.from(b64, "base64");

/**
 * Convert a Base64 string to Buffer.
 * @param {Buffer} buf Buffer.
 * @returns {string}
 */
export const bufferTob64 = (buf) => buf.toString("base64");

/**
 * XOR a Buffer (buf) with another Buffer (key) as key material.
 *
 * If key Buffer is larger than the buf Buffer,
 * the key will be truncated to the length of
 * the buf Buffer.
 *
 * If the key Buffer is smaller than the buf Buffer,
 * the key will be "enlarged" to the length of the buf
 * Buffer by repeating the key Buffer byte by byte.
 *
 * The following example assumes that the strings represent the buffers:
 *
 * if buf is "abcd" and key is "12345", key will be truncated to "1234"
 * if buf is "abcd" and key is "12", key will be "enlarged" to "1212"
 *
 * @param {Buffer} buf The content to XOR, as a Buffer
 * @param {Buffer} key The key for XOR operation, as a Buffer
 * @returns {Buffer} buf, XOR'ed with key
 */
export const xor = (buf, key) => {
    let keyToUse;

    if (key.length > buf.length) {
        keyToUse = key.subarray(0, buf.length);
    } else if (key.length < buf.length) {
        keyToUse = Buffer.alloc(buf.length, key);
    } else {
        keyToUse = key;
    }

    return buf.map((byte, index) => byte ^ keyToUse[index]);
};

/**
 * @param {Buffer} buf1
 * @param {Buffer} buf2
 * @returns {boolean}
 */
export const bufferHasOverlappingBits = (buf1, buf2) => {
    const lowestCommon = Math.min(buf1.length, buf2.length);
    for (let index = 0; index < lowestCommon; ++index) {
        if (buf1[index] & buf2[index] !== 0) return true;
    }
    return false;
};
