import * as fs from "node:fs";
import { crc16ccitt } from "crc";
import * as path from "node:path";
import * as b64 from "./base64.js";
import { gunzipSync } from "node:zlib";
import { default as xor } from "./xor.js";
import { XMLParser } from "fast-xml-parser";

// some nodejs evasions
import { fileURLToPath as ____fileURLToPath____ } from "node:url";
const __dirname = path.dirname(____fileURLToPath____(import.meta.url));
//

const xmlParserInstance = new XMLParser({ ignoreAttributes: false });

/**
 * Checks if the dump file has the correct checksum.
 * A reimplementation of `Gigaset.Devices.HandsetBackup.ValidateDumpCrc` from `Gigaset.Runtime.dll`
 * @param {*} xml
 * @returns {boolean}
 */
const checkCRC = (xml) => {
    /** @type {string} */
    const str1 = xml["image"]["dump"]["@_family_id"];
    const str2 = str1.substring(str1.length - 4);
    const str3 = str1.substring(0, str1.length - 4);
    const s = xml["image"]["@_version"] + xml["image"]["dump"]["@_device"] + xml["image"]["dump"]["@_sap_id"] + xml["image"]["dump"]["@_name"] + str3;
    return crc16ccitt(Buffer.from(s), 0xAA55) === Buffer.from(str2, "hex").readUint16BE();
};

/**
 * @param {string} b64String
 * @returns {Buffer}
 */
const parseB64 = (b64String) => {
    let strToDecode = b64String;
    if (strToDecode.match(/=(\w{8})$/)) strToDecode = strToDecode.slice(0, -8);
    return Buffer.from(b64.b64ToBytes(strToDecode));
};

const main = () => {
    const targetFile = "demo.hsdat";
    const targetFileFullPath = path.join(__dirname, targetFile);
    const extractedFolder = path.join(__dirname, `_${targetFile}.extracted`);

    if (!fs.existsSync(targetFileFullPath)) throw new Error(`${targetFile} not found`);
    if (fs.existsSync(extractedFolder)) fs.rmSync(extractedFolder, { recursive: true, force: true });
    fs.mkdirSync(extractedFolder);

    let file = fs.readFileSync(targetFileFullPath);
    // Obtained from `Gigaset.Devices.XORSeqBufferedWriter.DEFAULT_SALT` in `Gigaset.Runtime.dll`
    file = gunzipSync(xor(file, Buffer.from("6zYfK06zMNwfvhA")));

    // eslint-disable-next-line no-unused-vars
    const header = file.subarray(0, 3).readUint16LE();
    const restOfTheFuckingOwl = file.subarray(3);
    fs.writeFileSync(path.join(extractedFolder, `${targetFile}.xml`), restOfTheFuckingOwl);

    const xml = xmlParserInstance.parse(restOfTheFuckingOwl);
    const validDump = checkCRC(xml);
    if (!validDump) throw new Error("dump does not have correct CRC");
    console.log("dump is valid, processing");
    console.log("Image Version:", xml["image"]["@_version"]);
    console.log("Dump Version:", xml["image"]["dump"]["@_version"]);
    console.log("Device Name/Model:", xml["image"]["dump"]["@_name"]);
    console.log("Device FW Version:", xml["image"]["dump"]["@_device"]);
    console.log("SAP ID (IPEI?):", xml["image"]["dump"]["@_sap_id"]);
    console.log("\"\"Family ID\"\":", xml["image"]["dump"]["@_family_id"]);
    for (const fsEntry of xml["image"]["ArrayOfFilesystemEntry"]["FilesystemEntry"]) {
        const translated = {
            /** @type {string} */
            kind: fsEntry["Kind"],
            /** @type {string} */
            name: fsEntry["Name"],
            /** @type {number} */
            size: fsEntry["Size"],
            /** @type {string} */
            lastModified: fsEntry["Modified"],
            permissions: {
                /** @type {string} */
                user: fsEntry["UserPerm"],
                /** @type {string} */
                group: fsEntry["GroupPerm"],
            },
            /** @type {number} */
            id: fsEntry["FileId"],
            /** @type {string} */
            path: fsEntry["Path"],
            /** @type {Buffer} */
            content: parseB64(fsEntry["FileContent"]),
        };
        const tPath = path.join(extractedFolder, translated.path);
        const tFile = path.join(extractedFolder, `${translated.path}/${translated.name}`);
        if (!fs.existsSync(tPath)) fs.mkdirSync(tPath);
        fs.writeFileSync(tFile, translated.content);

        console.log("Written", `"${translated.name}"`, "to", `"${tFile}"`);
    }
};

main();
