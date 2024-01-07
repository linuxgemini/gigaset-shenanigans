import * as fs from "node:fs";
import * as path from "node:path";
import { parseHSDAT, parseBase64FileContent } from "./gigaset_hsdat_lib.js";

// some nodejs evasions
import { fileURLToPath as ____fileURLToPath____ } from "node:url";
const __dirname = path.dirname(____fileURLToPath____(import.meta.url));
//

const main = () => {
    const targetFile = "demo.hsdat";
    const targetFileFullPath = path.join(__dirname, targetFile);
    const extractedFolder = path.join(__dirname, `_${targetFile}.extracted`);

    if (!fs.existsSync(targetFileFullPath)) throw new Error(`${targetFile} not found`);
    if (fs.existsSync(extractedFolder)) fs.rmSync(extractedFolder, { recursive: true, force: true });
    fs.mkdirSync(extractedFolder);

    const { unparsed, parsed, isValidDump, handsetFeatureIDBytes } = parseHSDAT(fs.readFileSync(targetFileFullPath));

    fs.writeFileSync(path.join(extractedFolder, `${targetFile}.xml`), unparsed);

    if (!isValidDump) throw new Error("dump does not have correct CRC");
    console.log("dump is valid, processing");
    console.log("Image Version:", parsed.image["@_version"]);
    console.log("Dump Version:", parsed.image.dump["@_version"]);
    console.log("Device Name/Model:", parsed.image.dump["@_name"]);
    console.log("Device FW Version:", parsed.image.dump["@_device"]);
    console.log("SAP ID (IPEI?):", parsed.image.dump["@_sap_id"]);
    console.log("\"\"Family ID\"\":", parsed.image.dump["@_family_id"]);
    for (const fsEntry of parsed.image.ArrayOfFilesystemEntry.FilesystemEntry) {
        const translated = {
            kind: fsEntry.Kind,
            name: fsEntry.Name,
            size: fsEntry.Size,
            lastModified: fsEntry.Modified,
            permissions: {
                user: fsEntry.UserPerm,
                group: fsEntry.GroupPerm,
            },
            id: fsEntry.FileId,
            path: fsEntry.Path,
            content: parseBase64FileContent(fsEntry.FileContent, handsetFeatureIDBytes),
        };
        const tPath = path.join(extractedFolder, translated.path);
        const tFile = path.join(extractedFolder, `${translated.path}/${translated.name}`);
        if (!fs.existsSync(tPath)) fs.mkdirSync(tPath);
        fs.writeFileSync(tFile, translated.content);

        console.log("Written", `"${translated.name}"`, "to", `"${tFile}"`);
    }
};

main();
