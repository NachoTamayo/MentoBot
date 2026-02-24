const { Client, GatewayIntentBits } = require("discord.js");
const fs = require("fs");
const path = require("path");
const mysql = require("mysql");
const { user, password, host, database, port } = require("./config.json");

// Carga la configuración desde config.json
const config = JSON.parse(fs.readFileSync("./config.json", "utf8"));
const TOKEN = config.token;
const GUILD_ID = config.guildId;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

function createQuery(query) {
  console.log("Creating query:", query);
  return new Promise((resolve, reject) => {
    var con = mysql.createConnection({
      host: host,
      user: user,
      password: password,
      database: database,
      port: port,
    });

    con.connect(function (err) {
      if (err) {
        log("Connection error: " + err);
        con.end();
        return reject(err);
      }
      log("Connected!");

      log(query);
      con.query(query, function (error, rows, fields) {
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
const logFilePath = path.join(__dirname, "bot_removeRoles.log");

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

const rolesAnuncios = [
  "1065916498276786237",
  "815188108509315093",
  "814501427564511282",
  "814501364935426080",
  "814790326891446272",
  "815559130407239690",
  "814151636347125780",
  "815188031819743252",
  "815559044022534144",
  "1190616518409597038",
  "1190616722336649229",
];

const getRoles = (sub) => {
  switch (sub) {
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const addRoles = async (member) => {
  return new Promise(async (resolve) => {
    await member.roles.add("1417758013225435176"); // rol de anuncios
    resolve();
  });
};
client.once("ready", async () => {
  console.log(`Bot conectado como ${client.user.tag}`);

  const guild = await client.guilds.fetch(GUILD_ID);
  if (!guild) {
    console.log("No se encontró el servidor.");
    return;
  }
  const members = await guild.members.fetch(); // Carga todos los miembros del servidor

  // Carga solo los miembros con un rol, que es el @everyone
  const membersWithRoles = members.filter((member) => member.roles.cache.size == 1);
  console.log(`Miembros con solo @everyone: ${membersWithRoles.size}`);

  membersWithRoles.forEach(async (member) => {
    try {
      await addRoles(member).then(() => {
        console.log(`Se ha añadido el rol de anuncios a ${member.user.username}`);
      });
    } catch (e) {
      log(`Error al procesar ${member.user.tag}: ${e}`);
    }
  });
});

client.login(TOKEN);
