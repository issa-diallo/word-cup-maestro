import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ecosystem = require("../deploy/ecosystem.config.cjs") as {
  apps?: Array<Record<string, unknown>>;
};

const app = ecosystem.apps?.find((candidate) => candidate.name === "worldcup-api");

if (!app) throw new Error("worldcup-api PM2 app is missing.");
if (app.exec_mode !== "fork") throw new Error("worldcup-api must use PM2 fork mode.");
if (app.instances !== 1) throw new Error("worldcup-api must run one PM2 instance.");

console.log("PASS pm2 config");
