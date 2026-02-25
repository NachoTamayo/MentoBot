const crypto = require("crypto");
const express = require("express");
const { Client, GatewayIntentBits, Partials } = require("discord.js");
const {
  token,
  clientId,
  guildId,
  webhookSecret,
  plans,
  roles,
  mentoDevGuildId,
  pedidosChannelId,
} = require("./config.json");
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
    now.getDate(),
  ).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(
    now.getSeconds(),
  ).padStart(2, "0")}]`;

  fs.appendFile(logFilePath, `${timestamp} ${message}\n`, (err) => {
    if (err) console.error("Error al escribir en log:", err);
  });
}

function validateTimestamp(timestamp, res) {
  if (!timestamp) return true;

  const nowUtcMs = Date.now(); // JS Date.now() ya está en UTC epoch ms
  const tsMs = Date.parse(timestamp); // ISO string -> epoch UTC ms

  if (isNaN(tsMs)) {
    log(`[myCRED] Invalid timestamp format: ${timestamp}`);
    res.status(400).json({ ok: false, error: "Invalid timestamp" });
    return false;
  }

  const diffMinutes = Math.abs(nowUtcMs - tsMs) / (1000 * 60);

  if (diffMinutes > 10) {
    log(`[myCRED] Stale payload rejected (age: ${diffMinutes.toFixed(2)} min)`);
    res.status(400).json({ ok: false, error: "Stale payload" });
    return false;
  }

  return true;
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
        await member.roles.add(rolesToAdd[rol]);
      }

      const rolesToDel = rolesToRemove(plan_id);
      for (rol in rolesToDel) {
        console.log(`Removing role ${rolesToDel[rol]} from user ${discord}`);
        await member.roles.remove(rolesToDel[rol]);
      }
      // Notificar al usuario en Discord (opcional)
      //member.send(`¡Hola! Tu suscripción ha sido activada. Gracias por tu apoyo. 🎉`);
      if (rolesToDel.length > 0) {
        log(
          `Suscripción activada para usuario ${user_id} (Discord: ${discord}). Roles añadidos: ${rolesToAdd.join(
            ", ",
          )}, Roles eliminados: ${rolesToDel.join(", ")}. Número de pedido: ${jsonBody.order_id}`,
        );
      }
    } else if (status === "expired") {
      const rolesToDel = getDiscordRol(plan_id);
      for (rol in rolesToDel) {
        console.log(`Removing role ${rolesToDel[rol]} from user ${discord}`);
        await member.roles.remove(rolesToDel[rol]);
        await member.roles.add("1417758013225435176"); // rol de anuncios
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

const rawJsonRank = express.raw({ type: "application/json" });

app.post("/api/rankUpdated", rawJsonRank, async (req, res) => {
  const signature = req.get("X-Signature") || "";
  const from = req.get("X-Webhook-From");
  const secret = webhookSecret;

  // Ensure raw buffer
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");

  // Log incoming
  console.log("Headers:", req.headers);
  console.log("Raw body len:", raw.length);

  // Parse JSON safely
  let payload = {};
  try {
    payload = raw.length ? JSON.parse(raw.toString("utf8")) : {};
  } catch (e) {
    console.error("Invalid JSON:", e);
    return res.status(400).json({ ok: false, error: "Invalid JSON" });
  }

  // Verify signature in HEX (PHP hash_hmac default output)
  if (signature) {
    const computedHex = crypto.createHmac("sha256", secret).update(raw).digest("hex");
    if (computedHex !== signature) {
      log(`[myCRED] Invalid signature from ${from}`);
      return res.status(401).json({ ok: false, error: "Invalid signature" });
    }
  }

  const { event, user, rank, timestamp, site } = payload;
  console.log("Parsed body:", payload);

  // Anti-replay: reject old payloads (> 10 min)
  //if (!validateTimestamp(timestamp, res)) return;

  try {
    const server = client.guilds.cache.get(guildId);

    switch (event) {
      case "mycred.rank.promoted": {
        log(
          `[myCRED] PROMOTED user=${user?.id} ${user?.login} -> rank=${rank?.new_id} (${rank?.new_name}) from=${from}`,
        );
        const promotedMember = server?.members.cache.find(
          (m) => m.user.username === user?.login || m.user.id === user?.discord_id,
        );
        if (promotedMember && rank?.new_id) {
          const roleToAdd = getRoleByRank(rank.new_id);
          if (roleToAdd) {
            await promotedMember.roles.add(roleToAdd);
            log(`[myCRED] Added role ${roleToAdd} to user ${user?.login}`);
          }
        }
        break;
      }
      case "mycred.rank.demoted": {
        log(
          `[myCRED] DEMOTED user=${user?.id} ${user?.login} -> rank=${rank?.new_id} (${rank?.new_name}) from=${from}`,
        );
        // TODO: remove role if needed
        break;
      }
      default: {
        console.log(`[myCRED] Unhandled event: ${event}`);
        return res.status(204).end();
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Webhook handler error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

app.post("/api/orderUpdated", rawJsonRank, async (req, res) => {
  const signature = req.get("X-Signature") || "";
  const from = req.get("X-Webhook-From");
  const secret = webhookSecret;

  // Ensure raw buffer
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");

  // Log incoming
  console.log("Headers:", req.headers);
  console.log("Raw body len:", raw.length);

  // Parse JSON safely
  let payload = {};
  try {
    payload = raw.length ? JSON.parse(raw.toString("utf8")) : {};
  } catch (e) {
    console.error("Invalid JSON:", e);
    return res.status(400).json({ ok: false, error: "Invalid JSON" });
  }

  // Verify signature in HEX (PHP hash_hmac default output)
  if (signature) {
    const computedHex = crypto.createHmac("sha256", secret).update(raw).digest("hex");
    if (computedHex !== signature) {
      log(`[myCRED] Invalid signature from ${from}`);
      return res.status(401).json({ ok: false, error: "Invalid signature" });
    }
  }

  const { event, user, rank, timestamp, site } = payload;
  //console.log("Parsed body:", payload);

  // Anti-replay: reject old payloads (> 10 min)
  //if (!validateTimestamp(timestamp, res)) return;

  try {
    //Si el payload es {}, no hacer nada
    if (Object.keys(payload).length === 0 && payload.constructor === Object) {
      return res.status(200).json({ ok: true });
    }
    const mentoDev = client.guilds.cache.get(mentoDevGuildId);
    const pedidosChannel = mentoDev.channels.cache.get(pedidosChannelId);

    if (payload.status == "failed") {
      log(`[Pedidos] Pedido fallido. ID de pedido: ${payload.id}`);
      return res.status(200).json({ ok: true });
    }

    const cliente = payload.billing.first_name + " " + payload.billing.last_name;
    const email = payload.billing.email;
    const metodoPago = payload.payment_method_title;
    const userDiscord = payload.meta_data.find((meta) => meta.key === "discord")?.value;
    // Si uno de los pedidos es "Membresía", no enviar notificación
    const tieneMembresia = payload.line_items.some((item) => item.name.toLowerCase().includes("membresía"));
    payload.line_items.forEach((item) => {
      console.log(`Item: ${item.name}, Product ID: ${item.product_id}`);
    });
    const esFree = payload.line_items.some((item) => item.product_id === plans.mentoFree || item.product_id === 78298);
    if (esFree) {
      log(`[Pedidos] Pedido de plan gratuito. ID de pedido: ${payload.id}. No se envía notificación.`);
      return res.status(200).json({ ok: true });
    }
    if (tieneMembresia) {
      log(`[Pedidos] Pedido contiene Membresía. ID de pedido: ${payload.id}. No se envía notificación.`);
      return res.status(200).json({ ok: true });
    }
    const pedido = payload.line_items.map((item) => `${item.name} x${item.quantity}`).join(", ");
    const enlace = `https://mentopoker.com/wp-admin/post.php?post=${payload.id}&action=edit`;
    //La primera linea del mensaje serán 10 emojis de dinero 💰💰💰💰💰💰💰💰💰💰
    // Tabulación a partir de la segunda línea
    const mensaje = `💰💰💰💰💰💰💰💰💰💰\n\nNuevo pedido recibido:\n\t\tCliente: ${cliente} \n\t\tEmail: ${email}\n\t\tDiscord: ${userDiscord}\n\t\tMétodo de pago: ${metodoPago}\n\t\tPedido: ${pedido}\n\t\tEnlace al pedido: ${enlace}\n\n`;

    // Enviar mensaje al canal de pedidos
    if (pedidosChannel) {
      pedidosChannel.send(mensaje);
      log(`[Pedidos] Nuevo pedido de ${cliente} (${email}). Discord: ${userDiscord}`);
    } else {
      log(`[Pedidos] No se encontró el canal de pedidos.`);
    }
  } catch (err) {
    console.error("Webhook handler error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
  res.status(200).json({ ok: true });
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

app.post("/api/orderUpdated", async (req, res) => {
  console.log("Order updated webhook received");
  console.log(req.body);
  // Similar manejo de firma y parsing como en /api/subUpdated
  return res.status(200).send("ok");
});

app.get("/api/subUpdated", (req, res) => res.status(200).send("ok"));
app.get("/api/rankUpdated", (req, res) => res.status(200).send("ok"));
app.get("/api/orderUpdated", (req, res) => res.status(200).send("ok"));
app.get("/healthz", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

client.once("ready", () => {
  console.log(`Discord bot listo como ${client.user.tag}`);
});

app.listen(3010, "0.0.0.0", () => console.log("listening -> 3010"));

client.login(token);
