// Launches bot/daily.js as an isolated test instance against config/config.test.json,
// WITHOUT ever touching or overwriting the real config/config.json.
//
// How: pre-populate Node's require cache for the exact path daily.js resolves
// ("../config/config.json" from bot/) so daily.js's own require() call returns
// config.test.json's content instead of reading the real file.
//
// Usage: node bot/run-test-instance.cjs

const path = require("path");
const fs = require("fs");

const realConfigPath = path.resolve(__dirname, "../config/config.json");
const testConfigPath = path.resolve(__dirname, "../config/config.test.json");

if (!fs.existsSync(testConfigPath)) {
  console.error(`No existe ${testConfigPath}. Rellena config/config.test.json primero.`);
  process.exit(1);
}

const testConfig = JSON.parse(fs.readFileSync(testConfigPath, "utf8"));
function findTodo(value, pathSoFar) {
  if (typeof value === "string" && value.startsWith("TODO")) return pathSoFar;
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      const found = findTodo(nested, pathSoFar ? `${pathSoFar}.${key}` : key);
      if (found) return found;
    }
  }
  return null;
}
const missing = findTodo(testConfig, "");
if (missing) {
  console.error(`config/config.test.json: falta rellenar "${missing}"`);
  process.exit(1);
}

require.cache[realConfigPath] = {
  id: realConfigPath,
  filename: realConfigPath,
  loaded: true,
  exports: testConfig,
};

const entryFile = process.argv[2] || "daily.js";
const entryPath = path.resolve(__dirname, entryFile);
if (!fs.existsSync(entryPath)) {
  console.error(`No existe ${entryPath}.`);
  process.exit(1);
}

console.log(`Instancia de PRUEBAS: cargando ${entryFile} con config/config.test.json (no se toca config.json real).`);
const moduleExports = require(entryPath);

// If the module exports a start function, call it explicitly.
// This is needed for modules like roleSync.js that don't auto-start on require(),
// unlike daily.js which calls client.login() as a side effect of loading.
if (moduleExports && typeof moduleExports.start === "function") {
  moduleExports.start();
}
