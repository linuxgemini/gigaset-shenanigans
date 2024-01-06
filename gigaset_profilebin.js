import fetch from "node-fetch";
import { Buffer } from "node:buffer";

/*
 * An experimentation of A31008-M2212-R910-5-7643_en_INTERNATIONAL.pdf
 */

const gigasetDeviceURL = "http://profile.gigaset.net/device";
const gigasetDeviceIDmap = {
    DX800A: "41",
    C610_IP: "42/1",
    N300: "42/1",
    N510_IP_PRO: "42/2",
    DE900_IP_PRO: "60",
    DE700_IP_PRO: "61",
    DE410_IP_PRO: "62",
    DE310_IP_PRO: "63",
    N720_DM_PRO: "70",
    N720_IP_PRO: "71",
};

/**
 * @param {Buffer[]} bufArr
 * @returns {{ "type": number, "data": Buffer }[]}
 */
const objectifyParsedTLVBasedFormat = (bufArr) => {
    const actualResult = [];

    for (const buf of bufArr) {
        if (typeof buf === "undefined") continue;

        const result = [];
        let byteOffset = 0;

        while (byteOffset < buf.length) {
            const itemType = buf[byteOffset++];
            const itemLength = buf[byteOffset++];
            const item = buf.subarray(byteOffset, (byteOffset + itemLength));
            result.push({ data: item, type: itemType });

            byteOffset += itemLength;
        }

        actualResult.push(...result);
    }

    return actualResult;
};

/**
 * @param {Buffer} buf
 * @param {boolean} detailedParse
 * @returns {{ "type": number, "data": Buffer }[]}
 */
const parseTLVBasedFormat = (buf, detailedParse = false) => {
    if (buf[0] !== 0x01) throw new Error("are you sure this is in the correct binary format?");

    const result = [];
    let byteOffset = 0;

    while (byteOffset < buf.length) {
        const itemIndex = (buf[byteOffset++] - 1);
        const itemLength = buf[byteOffset++];
        const item = buf.subarray(byteOffset, (byteOffset + itemLength));
        result[itemIndex] = item;

        byteOffset += itemLength;
    }

    return (detailedParse ? objectifyParsedTLVBasedFormat(result) : result);
};

const main = async () => {
    const currentDevice = gigasetDeviceIDmap.N510_IP_PRO;
    const req = await fetch(`${gigasetDeviceURL}/${currentDevice}/master.bin`);
    const master = Buffer.from(await req.arrayBuffer());

    for (const item of parseTLVBasedFormat(master, true)) {
        const itemName = item.data.subarray(0, -1).toString();
        if (!itemName.toLowerCase().endsWith(".bin")) continue;
        console.log(itemName);

        const itemReq = await fetch(`${gigasetDeviceURL}/${currentDevice}/${itemName}`);
        const itemFile = Buffer.from(await itemReq.arrayBuffer());
        if (itemFile[0] === 0x01) {
            console.log(parseTLVBasedFormat(itemFile));
        } else {
            console.log(itemFile);
        }
    }
};

main();
