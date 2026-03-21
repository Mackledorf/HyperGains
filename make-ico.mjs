import { readFileSync, writeFileSync } from 'fs';

const png = readFileSync('client/public/favicon.png');
const pngSize = png.length;

// ICO format with embedded PNG (supported by all modern browsers)
const buf = Buffer.alloc(22 + pngSize);

// ICONDIR header
buf.writeUInt16LE(0, 0);        // reserved
buf.writeUInt16LE(1, 2);        // type: 1 = ICO
buf.writeUInt16LE(1, 4);        // image count: 1

// ICONDIRENTRY
buf.writeUInt8(0, 6);           // width (0 means 256)
buf.writeUInt8(0, 7);           // height (0 means 256)
buf.writeUInt8(0, 8);           // color count
buf.writeUInt8(0, 9);           // reserved
buf.writeUInt16LE(1, 10);       // planes
buf.writeUInt16LE(32, 12);      // bit count
buf.writeUInt32LE(pngSize, 14); // size of image data
buf.writeUInt32LE(22, 18);      // offset of image data

// PNG data
png.copy(buf, 22);

writeFileSync('client/public/favicon.ico', buf);
console.log('favicon.ico created:', buf.length, 'bytes');
