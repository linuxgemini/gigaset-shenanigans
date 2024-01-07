import { crc16ccitt } from "crc";
import { Buffer } from "node:buffer";
import { gunzipSync } from "node:zlib";
import { XMLParser } from "fast-xml-parser";
import { xor, b64ToBuffer, bufferHasOverlappingBits } from "./utilities.js";

const xmlParserInstance = new XMLParser({ ignoreAttributes: false });

const CRC16_SEED = 0xAA55;

/**
 * @typedef {{
 *     "?xml": {
 *         "@_version": string,
 *         "@_encoding": string,
 *     },
 *     image: {
 *         dump: {
 *             nvm: {
 *                 nvm_element: {
 *                     "@_type": string,
 *                     "@_id": string,
 *                     "@_value": string,
 *                 }[],
 *             },
 *             lists: {
 *                 list: {
 *                     entry: ({ any })[],
 *                     "@_list_name": string,
 *                 }[],
 *             },
 *             "@_version": string,
 *             "@_device": string,
 *             "@_sap_id": string,
 *             "@_name": string,
 *             "@_family_id": string,
 *         },
 *         ArrayOfFilesystemEntry: {
 *             FilesystemEntry: {
 *                 Kind: string,
 *                 Name: string,
 *                 Size: number,
 *                 Modified: string,
 *                 UserPerm: string,
 *                 GroupPerm: string,
 *                 FileId: number,
 *                 Path: string,
 *                 FileContent: string,
 *             }[],
 *             "@_xmlns:xsi": string,
 *             "@_xmlns:xsd": string,
 *         },
 *         "@_version": string,
 *  },
 * }} ParsedXML
 */

/**
 * Deobfuscate a given `.hsdat` file.
 * XOR key obtained from `Gigaset.Devices.XORSeqBufferedWriter.DEFAULT_SALT` in `Gigaset.Runtime.dll`.
 * @param {Buffer} buf `.hsdat` file, as a Buffer.
 * @returns {Buffer}
 */
export const deobfuscateHSDAT = (buf) => gunzipSync(xor(buf, Buffer.from("6zYfK06zMNwfvhA")));

/**
 * Calculate CRC16 of buffer, with the Gigaset provided seed.
 * Seed is from `Gigaset.Devices.HandsetBackup.crcSeed` in `Gigaset.Runtime.dll`
 * @param {Buffer} buf
 * @returns {number}
 */
export const calculateCRC16 = (buf) => crc16ccitt(buf, CRC16_SEED);

/**
 * Parse an obfuscated `.hsdat` file.
 * @param {Buffer} buf `.hsdat` file, as a Buffer.
 * @returns {{ zlibHeader: Buffer, unparsed: Buffer, parsed: ParsedXML, isValidDump: boolean, handsetFeatureIDBytes: Buffer }}
 */
export const parseHSDAT = (buf) => {
    const deobfuscated = deobfuscateHSDAT(buf);
    const zlibHeader = deobfuscated.subarray(0, 3);
    const unparsed = deobfuscated.subarray(3);
    const parsed = xmlParserInstance.parse(unparsed);
    const isValidDump = checkCRC(parsed);
    const handsetFeatureIDBytes = getHandsetFeatureIDBytes(parsed);
    return { zlibHeader, unparsed, parsed, isValidDump, handsetFeatureIDBytes };
};

/**
 * Checks if the dump file has the correct checksum.
 * A reimplementation of `Gigaset.Devices.HandsetBackup.ValidateDumpCrc` from `Gigaset.Runtime.dll`
 * @param {ParsedXML} xml
 * @returns {boolean}
 */
export const checkCRC = (xml) => {
    const familyID = xml.image.dump["@_family_id"];
    const providedChecksum = familyID.substring(familyID.length - 4);
    const magicSuffix = familyID.substring(0, familyID.length - 4);
    const magicStringToBeChecked = xml.image["@_version"] + xml.image.dump["@_device"] + xml.image.dump["@_sap_id"] + xml.image.dump["@_name"] + magicSuffix;
    return crc16ccitt(Buffer.from(magicStringToBeChecked), CRC16_SEED) === Buffer.from(providedChecksum, "hex").readUint16BE();
};

/**
 * Parses the feature ID of the handset.
 * A partial reimplementation of `Gigaset.Devices.HandsetBackup.ValidateFeatures` from `Gigaset.Runtime.dll`
 * @param {ParsedXML} xml
 * @returns {Buffer}
 */
export const getHandsetFeatureIDBytes = (xml) => {
    const parsedFamilyID = Buffer.from(xml.image.dump["@_family_id"].replace(/^0x/i, ""), "hex");
    const possibleFID = Buffer.alloc(parsedFamilyID[0], parsedFamilyID.subarray(1));
    return possibleFID;
};

/**
 * Parse Base64 encoded FileContent entries with checksum suffixes.
 * A partial reimplementation of `Gigaset.Devices.HandsetBackup.ValidateAndRemoveFfsFIDAndCrc` from `Gigaset.Runtime.dll`
 * @param {string} base64String Base64 encoded FileContent entry
 * @param {Buffer} handsetFeatureIDBytes Handset FeatureID.
 */
export const parseBase64FileContent = (base64String, handsetFeatureIDBytes) => {
    const checksumCharacterLength = 4;
    const featureIDBytesCharacterLength = (handsetFeatureIDBytes.length + 1) * 2;
    const minimumContentLength = 1 + checksumCharacterLength + featureIDBytesCharacterLength;

    if (base64String.length < minimumContentLength) throw new Error(`Possible corruption, content length is less than ${minimumContentLength}`);

    const b64StringWithoutChecksumButWithFeatureID = base64String.substring(0, base64String.length - checksumCharacterLength);

    const providedChecksum = base64String.substring(base64String.length - checksumCharacterLength);
    const parsedProvidedChecksum = Buffer.from(providedChecksum, "hex").readUint16BE();

    const providedUnparsedFID = b64StringWithoutChecksumButWithFeatureID.substring(b64StringWithoutChecksumButWithFeatureID.length - featureIDBytesCharacterLength);

    const calculatedChecksum = crc16ccitt(Buffer.from(b64StringWithoutChecksumButWithFeatureID), CRC16_SEED);

    if (parsedProvidedChecksum !== calculatedChecksum) throw new Error("CRC mismatch between provided and calculated checksum");

    const b64StringWithoutExtraBits = b64StringWithoutChecksumButWithFeatureID.substring(0, b64StringWithoutChecksumButWithFeatureID.length - providedUnparsedFID.length);

    const parsedRawFID = Buffer.from(providedUnparsedFID, "hex");
    const parsedFID = parsedRawFID.subarray(1);

    if (handsetFeatureIDBytes.length === parsedRawFID[0]) {
        if (!bufferHasOverlappingBits(handsetFeatureIDBytes, parsedFID) && !handsetFeatureIDBytes.equals(parsedFID)) {
            throw new Error("Somehow this file and device is not compatible.");
        }
    }

    return b64ToBuffer(b64StringWithoutExtraBits);
};
