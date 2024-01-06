import { Buffer } from "node:buffer";

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
const xor = (buf, key) => {
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

export default xor;
