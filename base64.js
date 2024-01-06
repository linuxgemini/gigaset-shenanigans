/** @param {string} b64 */
export const b64ToBytes = (b64) => Uint8Array.from(atob(b64), (m) => m.codePointAt(0));

/** @param {Uint8Array} bytes */
export const bytesTob64 = (bytes) => btoa(String.fromCodePoint(...bytes));
