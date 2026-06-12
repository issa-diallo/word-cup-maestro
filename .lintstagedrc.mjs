import path from "node:path";

const quoteFiles = (files) =>
  files.map((file) => `"${path.relative(process.cwd(), file)}"`).join(" ");

const eslintFix = (files) => `eslint --fix --max-warnings=0 ${quoteFiles(files)}`;
const prettierWrite = (files) => `prettier --write --ignore-unknown ${quoteFiles(files)}`;

const lintStagedConfig = {
  "*.{js,jsx,ts,tsx}": [eslintFix, prettierWrite],
  "*.{json,md,css,scss,yml,yaml,mjs,cjs}": [prettierWrite],
};

export default lintStagedConfig;
