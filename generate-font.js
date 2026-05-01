import fs from "fs";

const font = fs.readFileSync("./public/fonts/DejaVuSans.ttf");
const base64 = font.toString("base64");

fs.writeFileSync(
  "./src/fonts/DejaVuSans.js",
  `export default "${base64}";`
);