const crypto = require("crypto");
const express = require("express");
const { Client, GatewayIntentBits, Partials } = require("discord.js");
const { token, clientId, guildId, webhookSecret, plans, roles } = require("./config.json");
const fs = require("fs");
const path = require("path");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent, // Necesario para acceder al contenido de mensajes
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User], // Mejor manejo de DM y mensajes parciales
});

// Ruta del archivo donde se guardarán los logs
const logFilePath = path.join(__dirname, "bot.log");

// Método para escribir logs
function log(message) {
  const now = new Date();
  const timestamp = `[${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(
    now.getSeconds()
  ).padStart(2, "0")}]`;

  fs.appendFile(logFilePath, `${timestamp} ${message}\n`, (err) => {
    if (err) console.error("Error al escribir en log:", err);
  });
}

const app = express();

app.use((req, _res, next) => {
  console.log("> Incoming:", req.method, req.originalUrl, "IP:", req.ip, "UA:", req.get("user-agent"));
  next();
});
// Ensure raw body for this path regardless of content-type
app.use("/api/subUpdated", express.raw({ type: "*/*" }));

app.post("/api/subUpdated", async (req, res) => {
  const secret = webhookSecret; // process.env.WC_WEBHOOK_SECRET
  const signature = req.header("x-wc-webhook-signature");

  const contentType = (req.headers["content-type"] || "").toLowerCase();
  const isJson = contentType.startsWith("application/json");

  // Convert body to string for logging/conditional parsing
  const bodyString = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body ?? "");

  // WooCommerce sends a non-JSON ping on save like: "webhook_id=8" with content-type x-www-form-urlencoded
  if (!isJson) {
    // It's likely the webhook validation/ping. Still compute signature, but don't force JSON.
    if (!signature) {
      return res.status(200).send("pong (non-JSON ping, no signature)");
    }
    // If signature exists but you don't want to enforce on pings, you can accept anyway
    return res.status(200).send("pong (non-JSON ping)");
  }

  // From here on, handle real JSON deliveries
  let jsonBody;
  try {
    jsonBody = JSON.parse(bodyString);
    console.log("Received JSON body:", jsonBody);
    const discord = jsonBody.custom && jsonBody.custom.discord;
    const server = client.guilds.cache.get(guildId);
    const member = server.members.cache.find((m) => m.user.username === discord || m.user.id === discord);
    console.log(member);
    const user_id = jsonBody.customer_id;
    const status = jsonBody.status;
    const plan_id = jsonBody.plan_id;

    if (!discord) {
      log(`No hay Discord ID para el usuario ${jsonBody.customer_id}. Número de pedido: ${jsonBody.order_id}`);
      return res.status(200).send("No Discord ID provided; skipping notification");
    }

    if (status === "active") {
      const rolesToAdd = getDiscordRol(plan_id);
      console.log("Roles a añadir:", rolesToAdd);
      for (rol in rolesToAdd) {
        console.log(`Adding role ${rolesToAdd[rol]} to user ${discord}`);
        member.roles.add(rolesToAdd[rol]);
      }

      const rolesToDel = rolesToRemove(plan_id);
      for (rol in rolesToDel) {
        console.log(`Removing role ${rolesToDel[rol]} from user ${discord}`);
        member.roles.remove(rolesToDel[rol]);
      }
      // Notificar al usuario en Discord (opcional)
      //member.send(`¡Hola! Tu suscripción ha sido activada. Gracias por tu apoyo. 🎉`);
      if (rolesToDel.length > 0) {
        log(
          `Suscripción activada para usuario ${user_id} (Discord: ${discord}). Roles añadidos: ${rolesToAdd.join(
            ", "
          )}, Roles eliminados: ${rolesToDel.join(", ")}. Número de pedido: ${jsonBody.order_id}`
        );
      }
    } else if (status === "expired") {
      const rolesToDel = getDiscordRol(plan_id);
      for (rol in rolesToDel) {
        console.log(`Removing role ${rolesToDel[rol]} from user ${discord}`);
        member.roles.remove(rolesToDel[rol]);
      }
      log(`Suscripción expirada para usuario ${user_id} (Discord: ${discord}). Número de pedido: ${jsonBody.order_id}`);
      // Opcionalmente, podrías eliminar roles o notificar al usuario
    }
  } catch (e) {
    console.error("Failed to parse JSON body:", e);
    return res.status(400).send("Invalid JSON");
  }

  if (!Buffer.isBuffer(req.body)) {
    console.error("Incoming body is not a Buffer. Check middleware order and Content-Type.");
    return res.status(400).send("Body must be raw Buffer");
  }

  const computed = crypto
    .createHmac("sha256", secret)
    .update(req.body) // raw Buffer
    .digest("base64");

  if (!signature) {
    // During manual tests (curl/Postman) WooCommerce signature may be absent
    // Return 200 so you can test basic reachability; enable strict check in production
    return res.status(200).send("No signature header; skipped verification (testing mode)");
  }

  if (computed !== signature) {
    return res.status(401).send("Invalid signature");
  }

  // OK: procesa el evento
  return res.sendStatus(200);
});

app.post("/api/rankUpdated", async (req, res) => {
  const signature = req.get("X-Signature");
  const from = req.get("X-Webhook-From");
  const secret = webhookSecret; // process.env.MYCRED_WEBHOOK_SECRET

  if (!verifySignature(req.rawBody || Buffer.from(""), signature, secret)) {
    return res.status(400).json({ ok: false, error: "Invalid signature" });
  }

  const payload = req.body || {};
  const { event, user, rank, timestamp, site } = payload;

  // (Opcional) Anti-replay simple: rechaza payloads muy antiguos (p.ej. > 10 min)
  if (timestamp) {
    const ageMs = Math.abs(Date.now() - Date.parse(timestamp));
    if (ageMs > 10 * 60 * 1000) {
      return res.status(400).json({ ok: false, error: "Stale payload" });
    }
  }

  // Procesa el evento
  try {
    switch (event) {
      case "mycred.rank.promoted":
        // 👉 tu lógica aquí (guardar en BD, enviar email, etc.)
        console.log(
          `[myCRED] PROMOTED user=${user?.id} ${user?.login} -> rank=${rank?.new_id} (${rank?.new_name}) from=${from}`
        );
        break;
      case "mycred.rank.demoted":
        // 👉 tu lógica aquí
        console.log(
          `[myCRED] DEMOTED  user=${user?.id} ${user?.login} -> rank=${rank?.new_id} (${rank?.new_name}) from=${from}`
        );
        break;
      default:
        console.log(`[myCRED] Unhandled event: ${event}`);
        // Puedes devolver 204 para eventos desconocidos
        return res.status(204).end();
    }

    // Responde rápido para no bloquear el remitente
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Webhook handler error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

app.post("/api/customerUpdated", async (req, res) => {
  console.log("Customer updated webhook received");
  // Similar manejo de firma y parsing como en /api/subUpdated
  return res.status(200).send("ok");
});

const getDiscordRol = (plan_id) => {
  const planNum = parseInt(String(plan_id).trim(), 10);

  console.log("Valor original:", JSON.stringify(plan_id));
  console.log("Tipo original:", typeof plan_id);
  console.log("PlanNum:", planNum, typeof planNum);

  if (planNum === 8236) {
    return [roles.ploBasic];
  } else if (planNum === 8235) {
    return [roles.ploPro];
  } else if (planNum === 12150) {
    return [roles.ploBasic, roles.cashBasic, roles.spinBasic, roles.torneosBasic];
  } else if (planNum === 12151) {
    return [roles.ploPro, roles.cashPro, roles.spinPro, roles.torneosPro];
  } else if (planNum === 14142) {
    return [roles.cashPro];
  } else if (planNum === 8185) {
    return [roles.spinBasic];
  } else if (planNum === 8195) {
    return [roles.spinPro];
  } else if (planNum === 8230) {
    return [roles.cashBasic];
  } else if (planNum === 8233) {
    return [roles.torneosBasic];
  } else if (planNum === 8234) {
    return [roles.torneosPro];
  } else {
    console.log("No match, devolviendo default");
    return [""];
  }
};

const rolesToRemove = (plan_id) => {
  switch (plan_id) {
    case 8236: // PLO Basic
      return new Array(roles.ploPro);
    case 8235: // PLO Pro
      return new Array(roles.ploBasic);
    default:
      return [];
  }
};

app.get("/api/subUpdated", (req, res) => res.status(200).send("ok"));
app.get("/api/rankUpdated", (req, res) => res.status(200).send("ok"));
app.get("/healthz", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

client.once("ready", () => {
  console.log(`Discord bot listo como ${client.user.tag}`);
});

app.listen(3010, "0.0.0.0", () => console.log("listening -> 3010"));

client.login(token);
