import { crc16ccitt } from "crc";
import { Buffer } from "node:buffer";
import { gunzipSync } from "node:zlib";
import { XMLParser } from "fast-xml-parser";
import { xor, b64ToBuffer, bufferHasOverlappingBits } from "./utilities.js";

const xmlParserInstance = new XMLParser({ ignoreAttributes: false });

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
 *                     entry: Array<Object.<string, string>>,
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
 * Calculate CRC16 of `Buffer`, with the Gigaset provided seed.
 *
 * Seed is from `Gigaset.Devices.HandsetBackup.crcSeed` in
 * `Gigaset.Runtime.dll`.
 * @param {Buffer} buf
 * @returns {number} CRC16 checksum as `number`.
 */
export const calculateCRC16 = (buf) => crc16ccitt(buf, 0xAA55);

/**
 * Deobfuscate a given `.hsdat` file.
 *
 * The result will include a 3 byte Gzip header
 * you may want to remove.
 *
 * XOR key obtained from
 * `Gigaset.Devices.XORSeqBufferedWriter.DEFAULT_SALT`
 * in `Gigaset.Runtime.dll`.
 * @param {Buffer} buf `.hsdat` file, as a Buffer.
 * @returns {Buffer} Deobfuscated file
 */
export const deobfuscateHSDAT = (buf) => gunzipSync(xor(buf, Buffer.from("6zYfK06zMNwfvhA")));

/**
 * Checks if the dump file has the correct checksum.
 *
 * A reimplementation of
 * `Gigaset.Devices.HandsetBackup.ValidateDumpCrc`
 * from `Gigaset.Runtime.dll`.
 * @param {ParsedXML} xml Parsed XML Object.
 * @returns {boolean}
 */
export const checkDumpIsValid = (xml) => {
    const familyID = xml.image.dump["@_family_id"];

    const checksumCharacterLength = 4;
    const providedChecksum = familyID.slice(-checksumCharacterLength);

    // magic suffix is 0x{featureid}
    const magicSuffix = familyID.slice(0, -checksumCharacterLength);

    const magicStringToBeChecked = xml.image["@_version"] + xml.image.dump["@_device"] + xml.image.dump["@_sap_id"] + xml.image.dump["@_name"] + magicSuffix;

    return calculateCRC16(Buffer.from(magicStringToBeChecked)) === Buffer.from(providedChecksum, "hex").readUint16BE();
};

/**
 * Parses the feature ID of the handset.
 *
 * A partial reimplementation of
 * `Gigaset.Devices.HandsetBackup.ValidateFeatures`
 * from `Gigaset.Runtime.dll`.
 * @param {ParsedXML} xml Parsed XML Object.
 * @returns {Buffer} Handset Feature ID as `Buffer`.
 */
export const getHandsetFeatureIDBytes = (xml) => {
    const parsedFamilyID = Buffer.from(xml.image.dump["@_family_id"].replace(/^0x/i, ""), "hex");
    const featureID = Buffer.alloc(parsedFamilyID[0], parsedFamilyID.subarray(1));
    return featureID;
};

/**
 * Parse Base64 encoded FileContent entries with checksum suffixes.
 *
 * A partial reimplementation of
 * `Gigaset.Devices.HandsetBackup.ValidateAndRemoveFfsFIDAndCrc`
 * from `Gigaset.Runtime.dll`.
 * @param {string} base64String Base64 encoded FileContent entry.
 * @param {Buffer} handsetFeatureIDBytes Handset Feature ID as `Buffer`.
 * @returns {Buffer} Parsed Base64 content as `Buffer`.
 */
export const parseBase64FileContent = (base64String, handsetFeatureIDBytes) => {
    const checksumCharacterLength = 4;
    const featureIDBytesCharacterLength = (handsetFeatureIDBytes.length + 1) * 2;
    const totalSuffixLength = checksumCharacterLength + featureIDBytesCharacterLength;
    const minimumContentLength = 1 + totalSuffixLength;

    if (base64String.length < minimumContentLength) throw new Error(`Possible corruption, content length is less than ${minimumContentLength}`);

    const b64StringToBeValidated = base64String.slice(0, -checksumCharacterLength);
    const actualBase64String = base64String.slice(0, -totalSuffixLength);

    const providedChecksum = base64String.slice(-checksumCharacterLength);
    const parsedProvidedChecksum = Buffer.from(providedChecksum, "hex").readUint16BE();

    const calculatedChecksum = calculateCRC16(Buffer.from(b64StringToBeValidated));

    if (parsedProvidedChecksum !== calculatedChecksum) throw new Error("CRC mismatch between provided and calculated checksum");

    const providedUnparsedFID = b64StringToBeValidated.slice(-featureIDBytesCharacterLength);
    const parsedRawFID = Buffer.from(providedUnparsedFID, "hex");
    const parsedFID = parsedRawFID.subarray(1);

    if (handsetFeatureIDBytes.length !== parsedRawFID[0] || (!bufferHasOverlappingBits(handsetFeatureIDBytes, parsedFID) && !handsetFeatureIDBytes.equals(parsedFID))) {
        throw new Error("Somehow this file and device is not compatible.");
    }

    return b64ToBuffer(actualBase64String);
};

/**
 * Parse an obfuscated `.hsdat` file.
 * @param {Buffer} buf `.hsdat` file, as a `Buffer`.
 * @returns {{ zlibHeader: Buffer, unparsed: Buffer, parsed: ParsedXML, isValidDump: boolean, handsetFeatureIDBytes: Buffer }}
 */
export const parseHSDAT = (buf) => {
    const deobfuscated = deobfuscateHSDAT(buf);
    const zlibHeader = deobfuscated.subarray(0, 3);
    const unparsed = deobfuscated.subarray(3);
    const parsed = xmlParserInstance.parse(unparsed);
    const isValidDump = checkDumpIsValid(parsed);
    const handsetFeatureIDBytes = getHandsetFeatureIDBytes(parsed);
    return { zlibHeader, unparsed, parsed, isValidDump, handsetFeatureIDBytes };
};
