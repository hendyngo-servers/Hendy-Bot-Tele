import { scanConfigurationLocations } from "../src/services/configScanner.js";

const report = await scanConfigurationLocations();
console.log(JSON.stringify(report, null, 2));
if (!report.complete) process.exitCode = 1;
