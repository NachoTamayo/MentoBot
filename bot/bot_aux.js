const { Client, GatewayIntentBits, Partials } = require("discord.js");
const {
  token,
  clientId,
  guildId,
  webhookSecret,
  user,
  password,
  host,
  database,
  port,
  plans,
  roles,
} = require("./config.json");
const fs = require("fs");
const path = require("path");
const mysql = require("mysql");
const { create } = require("domain");

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

async function readChannelMessages(channelId, limit = 50) {
  try {
    const guild = await client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(channelId);
    if (!channel.isTextBased()) {
      log("El canal no es de texto.");
      return;
    }

    const messages = await channel.messages.fetch({ limit });
    log(`Se han leído ${messages.size} mensajes del canal ${channelId}`);

    // Ejemplo: imprimir cada mensaje con su autor
    messages.forEach((msg) => {
      log(`[${msg.author.tag}] ${msg.content}`);
    });

    return messages;
  } catch (err) {
    log(`Error al leer mensajes: ${err.message}`);
  }
}

function createQuery(query, callback) {
  console.log("Creating query:", query);
  var con = mysql.createConnection({
    host: host,
    user: user,
    password: password,
    database: database,
    port: port,
  });

  con.connect(function (err) {
    if (err) throw err;
    log("Connected!");

    log(query);
    con.query(query, function (error, rows, fields) {
      if (error) {
        log(error);
        con.end();
        return callback("error");
      } else {
        con.end();
        return callback(rows);
      }
    });
  });
}

function createQueryPromise(query) {
  return new Promise((resolve, reject) => {
    console.log("Creating query:", query);
    const con = mysql.createConnection({
      host: host,
      user: user,
      password: password,
      database: database,
      port: port,
    });

    con.connect((err) => {
      if (err) {
        log("Connection error: " + err);
        con.end();
        return reject(err);
      }
      log("Connected!");
      log(query);
      con.query(query, (error, rows, fields) => {
        con.end();
        if (error) {
          log(error);
          return reject(error);
        } else {
          return resolve(rows);
        }
      });
    });
  });
}

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

const getDiscordRol = (plan_id) => {
  switch (plan_id) {
    /*"mentoFree": 78301,
      "lifetime": 62614,
      "cashPro": 14142,
      "mentoTotalBasic": 12150,
      "mentoTotalPro": 12151,
      "ploBasic": 8236,
      "ploPro": 8235,
      "cashBasic": 8230,
      "spinBasic": 8185,
      "spinPro": 8195,
      "torneosBasic": 8233,
      "torneosPro": 8234*/
    case 8236: // PLO Basic
      return new Array(roles.ploBasic);
    case 8235: // PLO Pro
      return new Array(roles.ploPro);
    case 12150: // Mento Total Basic
      return new Array(roles.ploBasic, roles.cashBasic, roles.spinBasic, roles.torneosBasic);
    case 12151: // Mento Total Pro
      return new Array(roles.ploPro, roles.cashPro, roles.spinPro, roles.torneosPro);
    case 14142: // Cash Pro
      return new Array(roles.cashPro);
    case 8185: // Spin Basic
      return new Array(roles.spinBasic);
    case 8195: // Spin Pro
      return new Array(roles.spinPro);
    case 8230: // Cash Basic
      return new Array(roles.cashBasic);
    case 8233: // Torneos Basic
      return new Array(roles.torneosBasic);
    case 8234: // Torneos Pro
      return new Array(roles.torneosPro);
    default:
      return [];
  }
};

//var emailRegex =
/^[-!#$%&'*+\/0-9=?A-Z^_a-z{|}~](\.?[-!#$%&'*+\/0-9=?A-Z^_a-z`{|}~])*@[a-zA-Z0-9](-*\.?[a-zA-Z0-9])*\.[a-zA-Z](-?[a-zA-Z0-9])+$/;
const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,})/;
function isEmailValid(email) {
  if (!email) return false;

  if (email.length > 254) return false;

  var valid = emailRegex.test(email);
  if (!valid) return false;

  var parts = email.split("@");
  if (parts[0].length > 64) return false;

  var domainParts = parts[1].split(".");
  if (
    domainParts.some(function (part) {
      return part.length > 63;
    })
  )
    return false;

  return true;
}

function extraerEmail(texto) {
  const match = texto.match(emailRegex);
  return match ? match[1] : null;
}

function contieneEmail(texto) {
  const regex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/;
  return regex.test(texto);
}

const asignarRoles = async (results, message) => {
  let count = 0;
  const promises = results.map(async (row) => {
    return createQueryPromise(
      `SELECT post_parent FROM ngf_posts where post_type =  'wc_user_membership' and post_author = ${row.ID} and post_status in ('wcm-active', 'wcm-cancelled')`
    ).then(async (rows) => {
      if (rows === "error") {
        return { error: true };
      }
      const guild = await client.guilds.fetch(guildId);
      const member = await guild.members.fetch(message.author.id);
      for (const sub of rows) {
        const id_rol = getDiscordRol(sub.post_parent);
        for (const rol of id_rol) {
          await member.roles.add(rol);
        }
        await member.roles.remove("1417758013225435176"); // rol de anuncios
        count++;
      }
    });
  });
  return Promise.all(promises).then(() => count);
};

client.on("messageCreate", async (message) => {
  if (message.author.bot) return; // Ignorar mensajes de bots

  if (!message.content) return; // Ignorar mensajes sin contenido
  if (message.channel.id !== "935193136664309851") return; // Reemplaza con el ID de tu canal
  console.log(`Mensaje de ${message.author.tag}: ${message.content}`);
  if (
    !message.content.startsWith("!sub") &&
    !message.content.startsWith("!email") &&
    !message.content.startsWith("!mail") &&
    !contieneEmail(message.content)
  ) {
    message.reply(
      "Usa `!sub` para obtener tu rol según tu suscripción o `!email tu@email.com` para vincular tu cuenta."
    );
    return;
  }
  if (message.content.startsWith("!email") || message.content.startsWith("!mail") || contieneEmail(message.content)) {
    //const email = message.content.split(" ")[1];
    const email = extraerEmail(message.content);
    if (!isEmailValid(email)) {
      message.author.send(
        "El email proporcionado no es válido. Por favor, inténtalo de nuevo. Si el problema persiste, abre un ticket en Soporte."
      );
      try {
        message.delete();
      } catch (e) {
        console.error("No se pudo borrar el mensaje:", e);
      }
      return;
    }
    const check = createQuery(`SELECT discord FROM ngf_users where user_email = "${email}"`, async (rows) => {
      if (rows.length == 0) {
        message.author.send("Este email no está asociado a ningún usuario de Discord.");
        try {
          message.delete();
        } catch (e) {
          console.error("No se pudo borrar el mensaje:", e);
        }
        return;
      }
      console.log(rows);
      if (rows[0].discord != undefined && rows[0].discord != null && rows[0].discord != "") {
        if (rows[0].discord == message.author.id) {
          message.author.send("Este email ya está asociado a tu usuario de Discord.");
          try {
            message.delete();
          } catch (e) {
            console.error("No se pudo borrar el mensaje:", e);
          }
        } else {
          message.author.send(
            "Este email ya está asociado a otro usuario de Discord. Si es tuyo y deseas cambiar la cuenta asociada, Contacta con Soporte abriendo un ticket en <#1312015565090459699>"
          );
          try {
            message.delete();
          } catch (e) {
            console.error("No se pudo borrar el mensaje:", e);
          }
        }
      } else {
        const response = createQuery(
          `UPDATE ngf_users SET discord = '${message.author.id}' where user_email = "${email}";`,
          async (rows) => {
            if (rows === "error") {
              message.author.send(
                "Error al actualizar tu usuario en la base de datos. Contacta con Soporte abriendo un ticket en <#1312015565090459699>"
              );

              return;
            }
            message.author.send("Tu usuario ha sido actualizado correctamente!");
            try {
              message.delete();
            } catch (e) {
              console.error("No se pudo borrar el mensaje:", e);
            }
            return;
          }
        );

        const res = createQuery(
          `UPDATE ngf_usermeta SET meta_value = '${message.author.id}' where meta_key = 'discord' and user_id = (SELECT id FROM ngf_users where user_email = '${email}');`,
          async (rows) => {
            if (rows === "error") {
              message.author.send(
                "Error al actualizar tu usuario en la base de datos. Contacta con Soporte abriendo un ticket en <#1312015565090459699>"
              );

              return;
            }
            message.author.send("Tu usuario ha sido actualizado correctamente.");
            message.delete();
            return;
          }
        );
      }
    });

    return;
  }

  if (message.content.startsWith("!sub")) {
    try {
      await createQueryPromise(`SELECT ID FROM ngf_users where discord = '${message.author.id}'`, async (rows) => {
        if (rows === "error") {
          message.reply(
            "Error al buscar tu usuario en la base de datos. Contacta con Soporte abriendo un ticket en <#1312015565090459699>"
          );
          return;
        }
      }).then(async (rows) => {
        if (rows.length === 0) {
          message.reply(
            "Tu cuenta de Discord no está vinculada a ninguna cuenta. Usa `!email <tu_email>` para vincular tu cuenta."
          );
          return;
        }
        await asignarRoles(rows, message).then((count) => {
          if (count === 1) {
            message.reply("Tu rol ha sido actualizado según tu suscripción. ¡Disfruta de la escuela!");
          } else if (count > 1) {
            message.reply(
              "Se han encontrado varias suscripciones asociadas a tu cuenta. Se han aplicado todos los roles correspondientes. ¡Disfruta de la escuela!"
            );
          } else
            message.reply(
              "Tu suscripción parece que no está activa. Contacta con Soporte si crees que es un error abriendo un ticket en <#1312015565090459699>"
            );
        });
      });
    } catch (err) {
      console.error(err);
      message.reply(
        "Error al obtener tu suscripción. Contacta con Soporte abriendo un ticket en <#1312015565090459699>"
      );
      return;
    }
  }
});
client.once("ready", async () => {
  console.log(`Discord bot listo como ${client.user.tag}`);

  const channelId = "1416122179338371092";
  await readChannelMessages(channelId, 20); // lee los últimos 20 mensajes
});

client.login(token);
