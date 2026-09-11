const axios = require("axios");
const { v4ApiBase, v4ApiKey } = require("../config/config.json");

if (!v4ApiBase || !v4ApiBase.startsWith("https://")) {
  throw new Error("v4ApiBase must be set and start with https://");
}

const client = axios.create({
  baseURL: v4ApiBase,
  timeout: 10000,
  maxRedirects: 0,
  headers: {
    Authorization: `Bearer ${v4ApiKey}`,
    "Content-Type": "application/json",
  },
});

function logCall(method, path, discordUserId, status, code) {
  console.log(
    `[v4Client] ${method} ${path} discordUserId=${discordUserId} status=${status ?? "n/a"} code=${code ?? "n/a"}`
  );
}

function normalizeError(err) {
  if (err.response) {
    const status = err.response.status;
    const code = err.response.data && err.response.data.code;
    return { ok: false, status, code };
  }
  if (err.code === "ECONNABORTED" || err.code === "ETIMEDOUT") {
    return { ok: false, status: null, code: "timeout" };
  }
  return { ok: false, status: null, code: "network_error" };
}

async function linkEmail(discordUserId, email) {
  const path = "/link";
  try {
    const response = await client.post(path, { email, discordUserId });
    logCall("POST", path, discordUserId, response.status, null);
    return { ok: true, data: response.data };
  } catch (err) {
    const result = normalizeError(err);
    logCall("POST", path, discordUserId, result.status, result.code);
    return result;
  }
}

async function getAccess(discordUserId) {
  const path = `/access/${discordUserId}`;
  try {
    const response = await client.get(path);
    logCall("GET", path, discordUserId, response.status, null);
    return { ok: true, data: response.data };
  } catch (err) {
    const result = normalizeError(err);
    logCall("GET", path, discordUserId, result.status, result.code);
    return result;
  }
}

async function getAccessBatch(discordUserIds) {
  const path = "/access/batch";
  try {
    const response = await client.post(path, { discordUserIds });
    logCall("POST", path, `batch(${discordUserIds.length})`, response.status, null);
    return { ok: true, data: response.data };
  } catch (err) {
    const result = normalizeError(err);
    logCall("POST", path, `batch(${discordUserIds.length})`, result.status, result.code);
    return result;
  }
}

module.exports = { linkEmail, getAccess, getAccessBatch };
