const { Client, GatewayIntentBits } = require("discord.js");
const fs = require("fs");
const path = require("path");
const mysql = require("mysql");
const cron = require("node-cron");
const { user, password, host, database, port } = require("./config.json");

// Carga la configuración desde config.json
const config = JSON.parse(fs.readFileSync("./config.json", "utf8"));
const TOKEN = config.token;
const GUILD_ID = config.guildId;

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

// Ruta del archivo donde se guardarán los logs
const logFilePath = path.join(__dirname, "bot_removeRoles.log");

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

const rolesToRemove = (sub) => {
  /*
  "ploBasic": "1190616657232658483",
   "ploPro": "1190616803676782603",
   "cashBasic": "825664157998514176",
   "cashPro": "825664160141672458",
   "spinBasic": "825664144324952104",
   "spinPro": "825664152508563456",
   "torneosBasic": "825664164512923659",
   "torneosPro": "825664166945620039",
   "mentoFree": "1354795115507351667",
   "anuncios": "1415359602043650099"
     
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
  switch (sub.post_parent) {
    case 14142: // cashPro
      return ["825664160141672458"];
    case 12150: // mentoTotalBasic
      return [
        "1190616657232658483",
        "825664157998514176",
        "825664144324952104",
        "825664164512923659",
        "1354795115507351667",
      ];
    case 12151: // mentoTotalPro
      return [
        "1190616803676782603",
        "825664160141672458",
        "825664152508563456",
        "825664166945620039",
        "1354795115507351667",
      ];
    case 8236: // ploBasic
      return ["1190616657232658483"];
    case 8235: // ploPro
      return ["1190616803676782603"];
    case 8230: // cashBasic
      return ["825664157998514176"];
    case 8185: // spinBasic
      return ["825664144324952104"];
    case 8195: // spinPro
      return ["825664152508563456"];
    case 8233: // torneosBasic
      return ["825664164512923659"];
    case 8234: // torneosPro
      return ["825664166945620039"];
    default:
      return [];
  }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runBot() {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });

  client.once("ready", async () => {
    console.log(`Bot conectado como ${client.user.tag}`);

    const guild = await client.guilds.fetch(GUILD_ID);
    if (!guild) {
      console.log("No se encontró el servidor.");
      client.destroy();
      return;
    }

    const members = await guild.members.fetch();

    createQuery(
      "SELECT sub.post_date, sub.post_parent, users.discord FROM `ngf_posts` as sub, ngf_users as users WHERE `post_status` LIKE '%wcm_expired%' AND `post_type` LIKE '%wc_user_membership%' and users.id = sub.post_author and users.discord is not null and users.discord != '' and post_parent != '78301' order by sub.post_date desc",
      async (result) => {
        if (result === "error") {
          console.log("Error en la consulta SQL.");
          client.destroy();
          return;
        }

        for (const sub of result) {
          const member = members.find(
            (m) => m.user.username === sub.discord || m.user.id === sub.discord || m.user.tag === sub.discord,
          );
          if (member) {
            const roles = rolesToRemove(sub);
            if (roles.length > 0) {
              try {
                for (const roleId of roles) {
                  if (member.roles.cache.has(roleId)) {
                    await member.roles.remove(roleId);
                    log(`Se han eliminado los roles ${roles.join(", ")} de ${member.user.username}`);
                  }
                }
                await member.roles.add("1417758013225435176"); // rol de anuncios
              } catch (e) {
                log(`Error al procesar ${member.user.tag}: ${e}`);
              }
            }
          }
        }

        log("Proceso de eliminación de roles completado. Bot desconectado.");
        console.log("Proceso de eliminación de roles completado. Bot desconectado.");
        client.destroy();
      },
    );
  });

  client.login(TOKEN);
}

// Ejecutar inmediatamente al arrancar
runBot();

// Ejecutar cada 2 horas (minuto 0 de cada hora par)
cron.schedule("0 */2 * * *", () => {
  log("Iniciando ejecución programada de removeRoles...");
  console.log("Iniciando ejecución programada de removeRoles...");
  runBot();
});
