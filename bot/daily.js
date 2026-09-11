const { Client, GatewayIntentBits, Partials } = require("discord.js");
const CronJob = require("cron").CronJob;
const {
  clientId,
  guildId,
  token,
  user,
  password,
  host,
  database,
  port,
  adminRole,
  permisosChannelID,
  soporteChannelID,
  roles,
  userTable,
  membershipTable,
  botID,
} = require("../config/config.json");

// V4 plan slug -> Discord role IDs. [] means no confirmed role ID yet (TBD).
//
// The old third-tier "Elite" roles (roles.cashElite/spinElite/torneosElite) were
// deleted from Discord; the role formerly named "Pro" was renamed to "Élite"
// (kept its ID, roles.cashPro/spinPro/torneosPro), and a new top tier "Ultra"
// role was created (roles.cashUltra/spinUltra/torneosUltra). -elite plan slugs
// map to the new Ultra roles.
const planRoleMap = {
  "cash-basic": [roles.cashBasic],
  "cash-pro": [roles.cashPro],
  "cash-elite": [roles.cashUltra],
  "spins-basic": [roles.spinBasic],
  "spins-pro": [roles.spinPro],
  "spins-elite": [roles.spinUltra],
  "torneos-basic": [roles.torneosBasic],
  "torneos-pro": [roles.torneosPro],
  "torneos-elite": [roles.torneosUltra],
  "plo-basic": [roles.pLOBasic],
  "plo-pro": [roles.pLOPro],
  // No "plo-elite" plan exists — PLO only has Basic/Pro tiers.
  "mento-total-basic": [roles.cashBasic, roles.spinBasic, roles.torneosBasic, roles.pLOBasic],
  "mento-total-pro": [roles.cashPro, roles.spinPro, roles.torneosPro, roles.pLOPro],
  "mento-total-elite": [roles.cashUltra, roles.spinUltra, roles.torneosUltra, roles.pLOPro],
  "mento-free": [], // Intentionally empty — free plan has no Discord group access
};

// Only roles !sub knows about via planRoleMap are ever added/removed by it.
const managedRoleIds = Array.from(new Set(Object.values(planRoleMap).flat()));

const fs = require("fs");
const path = require("path");

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

const mysql = require("mysql");
const { RequestManager } = require("@discordjs/rest");
const { linkEmail, getAccess } = require("./v4Client");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent, // Necesario para acceder al contenido de mensajes
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User], // Mejor manejo de DM y mensajes parciales
});

//FUNCIONES GENERALES

var emailRegex =
  /^[-!#$%&'*+\/0-9=?A-Z^_a-z{|}~](\.?[-!#$%&'*+\/0-9=?A-Z^_a-z`{|}~])*@[a-zA-Z0-9](-*\.?[a-zA-Z0-9])*\.[a-zA-Z](-?[a-zA-Z0-9])+$/;

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

function createQuery(query, callback) {
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

function getKeyByValue(object, value) {
  for (const key in object) {
    if (object[key] === value) {
      return key;
    }
  }
  return null; // Retorna null si no se encuentra el valor en el objeto
}

function desasignarRoles(member, guild, subCaducada, idSub) {
  const rolesConditions = {
    [roles.cashBasic]: [7, 17, 16, 42, 43, 44],
    [roles.cashPro]: [8, 18, 19, 45, 46, 47],
    [roles.cashElite]: [9, 20, 21, 48, 49, 50],
    [roles.spinBasic]: [1, 10, 11, 33, 34, 35],
    [roles.spinPro]: [2, 12, 13, 36, 37, 38],
    [roles.spinElite]: [3, 14, 15, 39, 40, 41],
    [roles.torneosBasic]: [4, 22, 23, 51, 52, 53, 54],
    [roles.torneosPro]: [5, 24, 25, 55, 56, 57],
    [roles.torneosElite]: [27, 28, 29, 30, 31, 32],
    [roles.pLOBasic]: [61, 62, 63],
    [roles.pLOPro]: [58, 59, 60],
    [roles.totalBasic]: [69, 70, 71],
    [roles.totalPro]: [67, 68, 72],
    [roles.totalElite]: [64, 65, 66],
  };

  for (const [role, conditions] of Object.entries(rolesConditions)) {
    if (member.roles.cache.has(role) && conditions.includes(subCaducada)) {
      log(`El usuario ${member.user.username} tiene rol ${role}`);
      member.roles.remove(role);
      createQuery(`UPDATE ${membershipTable} SET checked = 1 where id = ${idSub}`, () => {
        const anunciosRole = roles[getKeyByValue(roles, role) + "Anuncios"];
        log(`El usuario ${member.user.username} tiene rol ${anunciosRole}`);
        if (!member.roles.cache.has(anunciosRole)) {
          log(`Le ponemos Rol ${anunciosRole}`);
          member.roles.add(anunciosRole);
        }
      });
    }
  }
}

function getFecha() {
  let date_ob = new Date();
  let date = ("0" + date_ob.getDate()).slice(-2);
  let month = ("0" + (date_ob.getMonth() + 1)).slice(-2);
  let year = date_ob.getFullYear();
  let hours = date_ob.getHours();
  let minutes = date_ob.getMinutes();
  let seconds = date_ob.getSeconds();

  log(year + "-" + month + "-" + date + " " + hours + ":" + minutes + ":" + seconds);
}

async function emailFunction(message) {
  const emailToValidate = message.content.replace("!email ", "");

  if (!isEmailValid(emailToValidate)) {
    message.author
      .send("Tu email no tiene un formato correcto :confused:\r\n\r\nPero puedes volver a intentarlo :grin:")
      .catch(console.error);
    return;
  }

  //Método para controlar a unos scammers
  if (emailToValidate == "lucia.rivera76@gmail.com") {
    const user = await client.users.fetch("524180674786230272");
    await user.send("Los scammers han vuelto, esta vez han usado una cuenta con el ID: ${message.author.id}");
  }

  const result = await linkEmail(message.author.id, emailToValidate);

  if (result.ok) {
    message.author
      .send(
        `Se ha asociado el email ${emailToValidate} con tu usuario.\r\n\r\nYa puedes usar **!sub** para conseguir tus roles.\r\n\r\nMuchas gracias :partying_face:`
      )
      .catch(console.error);
  } else if (result.status === 404) {
    message.author
      .send(
        "El email que me has dado no existe en nuestra base de datos. Asegúrate de haberlo escrito bien y vuelve a probar. Recuerda que tiene que ser con el mail que te registraste."
      )
      .catch(console.error);
  } else if (result.status === 409) {
    message.author
      .send(
        `Ese email ya está vinculado a otra cuenta de Discord. Si crees que es un error contacta con Soporte en '${message.guild.channels.cache
          .get(soporteChannelID)
          .toString()}'.`
      )
      .catch(console.error);
  } else if (result.status === 400) {
    message.author
      .send("El email que me has dado no es válido. Revísalo y vuelve a probar.")
      .catch(console.error);
  } else {
    log(`!email fallback discordUserId=${message.author.id} status=${result.status} code=${result.code}`);
    message.author
      .send(
        `Algo en mis sistemas ha fallado :weary:\r\n\r\nSi necesitas ayuda usa el canal '${message.guild.channels.cache
          .get(soporteChannelID)
          .toString()}' de nuestro Discord.`
      )
      .catch(console.error);
  }
}

//FUNCIONES GENERALES

function transformarString(inputString) {
  // Dividir el string en palabras separadas por mayúsculas
  const words = inputString.split(/(?=[A-Z])/);

  // Capitalizar la primera letra de cada palabra
  const transformedWords = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());

  // Unir las palabras con un espacio en blanco
  const result = transformedWords.join(" ");

  return result;
}

// Discord role add/remove can reject (missing permissions, role hierarchy, rate
// limits...); an unawaited rejection here would crash the whole bot process.
async function addRoleSafe(member, roleId) {
  try {
    await member.roles.add(roleId);
    return true;
  } catch (err) {
    log(`role add failed discordUserId=${member.id} roleId=${roleId} error=${err.message}`);
    return false;
  }
}

async function removeRoleSafe(member, roleId) {
  try {
    await member.roles.remove(roleId);
    return true;
  } catch (err) {
    log(`role remove failed discordUserId=${member.id} roleId=${roleId} error=${err.message}`);
    return false;
  }
}

client.on("messageCreate", async (message) => {
  if (message.author.id == botID) return;

  if (message.channel.id == soporteChannelID) {
    //ID de Elmo
    if (message.author.id != "524180674786230272") {
      if (message.content.startsWith("!email") || message.content.startsWith("!sub")) {
        message.reply(
          `Eso me lo tienes que escribir por el canal de ${message.guild.channels.cache
            .get(permisosChannelID)
            .toString()}`
        );
        return;
      }
      if (message.content.startsWith("!help")) {
        const mensaje =
          "¿Necesitas ayuda? Estos son mis comandos:\r\n\r\n" +
          "**!help** -> Bueno, este creo que ya sabes para qué es...\r\n" +
          "**!email [TU EMAIL AQUI]** -> Para validar tu email y tu usuario de Discord. Te recomiendo que lo uses mandándome un mensaje privado, por el tema de la privacidad.\r\n" +
          "**!sub** -> Para actualizar tu rol en Discord por si te acabas de registrar o has cambiado de plan. Necesitas tener el mail y usuario de Discord verificado.\r\n";
        message.reply(mensaje);
        return;
      }
      if (message.content.length > 15) {
        message.reply(
          `Hemos recibido tu mensaje, cuando tengas un tick verde ✅ ElmoKof te contactará por mensaje privado, revisa tu bandeja de entrada. Acuérdate de activar la recepción de mensajes privados en Discord.\r\n\r\nRecuerda que si es por tema de permisos tienes que usar el canal ${message.guild.channels.cache
            .get(permisosChannelID)
            .toString()} primero.
            
🤖  Si pasan 48h sin respuesta no dudes en volver a poner tu mensaje con la duda en el mismo.\r\n

🛌 Recuerda que todos descansamos los fines de semana y puede tardar un poco más.`
        );
        return;
      }
    }
  } else if (message.channel.id == "1104058780645335171") {
    if (message.author.id != "524180674786230272") {
      message.reply(
        `Hola! Has solicitado información sobre los deals, revisa tu sección de mensajes privados y mira bien que tengas "solicitudes pendientes" y abierta recepción de los mismos.

kmayor99 te contactará por esa vía, CONFIRMA su nombre de discord para evitar problemas (kmayor99, tal cual, tiene que se exactamente así) 😄

Puedes consultar la página https://mentopoker.com/deals/ y echar un vistazo sobre los deals por si quieres directamente elegir uno.`
      );
    }
  }
  if (message.channel.type !== "DM") {
    if (message.author.id == "618456228192059420" && message.content == "!") {
      message.channel.send("De locos");
      message.delete();
      return;
    }

    if (message.channel.id === permisosChannelID) {
      if (message.content.toLowerCase().startsWith("!help")) {
        const mensaje =
          "¿Necesitas ayuda? Estos son mis comandos:\r\n\r\n" +
          "**!help** -> Bueno, este creo que ya sabes para qué es...\r\n" +
          "**!email [TU EMAIL AQUI]** -> Para validar tu email y tu usuario de Discord. Te recomiendo que lo uses mandándome un mensaje privado, por el tema de la privacidad.\r\n" +
          "**!sub** -> Para actualizar tu rol en Discord por si te acabas de registrar o has cambiado de plan. Necesitas tener el mail y usuario de Discord verificado.\r\n";
        message.reply(mensaje);
      } else if (message.content.toLowerCase().startsWith("!email")) {
        message.author
          .send("¡Hola! Esto mejor lo hablamos por aquí para mantener la privacidad de tus datos personales :wink:")
          .catch(console.error);
        emailFunction(message);
        message.delete();
      } else if (message.content.toLowerCase().startsWith("!sub")) {
        const result = await getAccess(message.author.id);
        const accessStatus = result.ok ? result.data.status : "unavailable";

        if (!result.ok) {
          log(
            `!sub call failed discordUserId=${message.author.id} status=${result.status ?? "n/a"} code=${
              result.code ?? "n/a"
            }`
          );
        }

        if (accessStatus === "unlinked") {
          message.reply(
            "No hay registro de que tu usuario de Discord tenga perfil en la escuela. ¿Quizás es que no lo has validado con tu mail? Usa el comando **!email** para incorporarlo a la web :wink:"
          );
        } else if (accessStatus === "inactive") {
          for (const roleId of managedRoleIds) {
            if (message.member.roles.cache.has(roleId)) {
              await removeRoleSafe(message.member, roleId);
            }
          }
          message.reply(
            "Tu suscripción aparentemente no está activa. Si crees que es un error, deja el siguiente mensaje en el grupo " +
              message.guild.channels.cache.get(soporteChannelID).toString() +
              ": \r\n\r\n--> No me reconoce la suscripción como activa + *escribe tu mail aquí*"
          );
        } else if (accessStatus === "active") {
          const planSlugs = result.data.planSlugs || [];
          const targetRoleIds = new Set();
          const unknownSlugs = [];
          let hasFreePlan = false;

          for (const slug of planSlugs) {
            const mappedRoleIds = planRoleMap[slug];
            if (mappedRoleIds && mappedRoleIds.length > 0) {
              mappedRoleIds.forEach((roleId) => targetRoleIds.add(roleId));
            } else if (slug === "mento-free") {
              hasFreePlan = true;
            } else {
              unknownSlugs.push(slug);
            }
          }

          if (unknownSlugs.length > 0) {
            log(`!sub unknown plan slug(s) discordUserId=${message.author.id} slugs=${unknownSlugs.join(",")}`);
          }

          if (targetRoleIds.size === 0 && unknownSlugs.length === 0 && hasFreePlan) {
            for (const roleId of managedRoleIds) {
              if (message.member.roles.cache.has(roleId)) {
                await removeRoleSafe(message.member, roleId);
              }
            }
            message.reply(
              "Con la suscripción gratuita de MentoPoker no tienes derecho a los roles de la escuela que dan acceso a los canales privados, pero te invitamos a suscribirte para descubrirlos :wink:"
            );
          } else if (targetRoleIds.size === 0) {
            log(
              `!sub unresolved active plan discordUserId=${message.author.id} planSlugs=${JSON.stringify(planSlugs)}`
            );
            message.reply(
              "Tu suscripción está activa pero no he podido resolver tu plan. Contacta con Soporte en " +
                message.guild.channels.cache.get(soporteChannelID).toString()
            );
          } else {
            const grantedNames = [];
            const failedRoleIds = [];
            for (const roleId of targetRoleIds) {
              if (!message.member.roles.cache.has(roleId)) {
                const added = await addRoleSafe(message.member, roleId);
                if (!added) {
                  failedRoleIds.push(roleId);
                  continue;
                }
              }
              const roleName = getKeyByValue(roles, roleId);
              if (roleName) grantedNames.push(transformarString(roleName));
            }

            for (const roleId of managedRoleIds) {
              if (message.member.roles.cache.has(roleId) && !targetRoleIds.has(roleId)) {
                await removeRoleSafe(message.member, roleId);
              }
            }

            if (failedRoleIds.length > 0) {
              log(
                `!sub role grant failed discordUserId=${message.author.id} roleIds=${failedRoleIds.join(",")}`
              );
              message.reply(
                "He podido asignarte " +
                  (grantedNames.length ? "parte de tus roles (" + grantedNames.join(", ") + ")" : "ninguno de tus roles") +
                  ", pero algo ha fallado al aplicar otros. Contacta con Soporte en " +
                  message.guild.channels.cache.get(soporteChannelID).toString()
              );
            } else {
              message.reply(
                "Está todo correcto. Perteneces al grupo de " +
                  grantedNames.join(", ") +
                  ". ¡Felicidades! Si es incorrecto deberías contactar con Soporte en " +
                  message.guild.channels.cache.get(soporteChannelID).toString()
              );
            }
          }
        } else {
          message.reply(
            "No he podido comprobar tu acceso ahora mismo. Inténtalo de nuevo en unos minutos, y si el problema persiste contacta con Soporte en " +
              message.guild.channels.cache.get(soporteChannelID).toString()
          );
        }
      } else if (message.content.startsWith("!")) {
        var msj = "¿Has utilizado ya el comando !email? Si no es así:\r\n\r\n";
        msj += "**!email** *tu mail aquí* para validar tu mail.\r\n";
        msj += "**!sub** para validar tu suscripción.\r\n";
        message.reply(msj);
      } else if (!message.content.startsWith("!")) {
        var msj = "Hola para acceder a los grupos son dos sencillos pasos:\r\n\r\n";
        msj += "1. Validar tu mail de la web www.mentopoker.com\r\n";
        msj += "!email (espacio) + (tu mail)\r\n";
        msj += "Ejemplo:\r\n";
        msj += "!email Mentopoker@gmail.es\r\n\r\n";
        msj += "Una vez tienes validado esto, a entrar en los grupos de tu suscripción!\r\n\r\n";
        msj += "2. Validar tu suscripción\r\n";
        msj += "!sub\r\n";
        msj += "Te añadirá a los grupos de tu suscripción\r\n\r\n";
        msj +=
          "¡Y ya está! Si tienes cualquier problema, abre un ticket en el canal " +
          message.guild.channels.cache.get("1312015565090459699").toString();
        message.reply(msj);
      }
    } else {
      return;
    }
  } else {
    //IDs de Elmo y Nacho
    if (
      message.content.toLowerCase().startsWith("!subdoble") &&
      (message.author.id == "524180674786230272" || message.author.id == "269920447439699978")
    ) {
      var mailDoble = message.content.replace("!subdoble ", "");
      createQuery(
        `delete from naw_rcp_memberships where status = "expired" and user_id = (SELECT ID FROM naw_users where user_email = "${mailDoble}")`,
        function (res) {
          if (res != "error") message.reply("Se ha borrado la suscripción expirada");
        }
      );
    } else if (message.content.toLowerCase().startsWith("!email")) {
      emailFunction(message);
    } else if (message.content.startsWith("!spam1111111")) {
      let guild = client.guilds.cache.get(guildId);
      guild.members.fetch(message.author.id).then((members) => {
        if (members.roles.cache.some((role) => role.id === adminRole)) {
          log("Admin mandando spam...");
          const list = client.guilds.cache.get(guildId);

          list.members.fetch({ cache: false }).then((members) => {
            for (let [key, value] of members) {
              if (members.get(key).user.id != botID) {
                var mensaje =
                  "¡Buenas, soy MentoBot! \r\n\r\nTe escribo para pedirte tu dirección de correo electrónico y añadirla a nuestra base de datos, para tenerla relacionada con tu usuario de Discord.\r\n";
                mensaje +=
                  "Para ello te voy a pedir que me lo escribas usando el comando !email, de la siguiente manera:\r\n\r\n\r\n";
                mensaje += "!email [DIRECCION_DE_MAIL]\r\n\r\n\r\n";
                mensaje +=
                  "Tiene que ser con la que estás registrado en la web y asegúrate de que está correctamente escrito, si no te lo volveré a pedir.\r\n\r\n\r\n";
                mensaje += "Gracias por tu colaboración. Beep. Boop. :robot:";
                members.get(key).user.send(mensaje).catch(console.error);
              }
            }
          });
        } else {
          return;
        }
      });
    } else if (message.content.startsWith("!")) {
      var msj =
        "No conozco ese comando, quizás aún no me lo han enseñado. Por el momento, los que me sé son estos:\r\n\r\n";
      msj += "**!email**   *tu mail aquí*    ->    para validar tu mail.\r\n";
      msj += "**!sub**   ->   para validar tu suscripción.\r\n";
      message.reply(msj);
    } else {
      return;
    }
  }
});

async function getPlayer(id, subCaducada, idSub) {
  let server = client.guilds.cache.get(guildId);
  let player = await server.members.fetch(id);
  desasignarRoles(player, server, subCaducada, idSub);
}

client.once("ready", () => {
  log("Ready!");
  const list = client.guilds.cache.get(guildId);
  //En orden de asteriscos: Segundos, minutos, horas, dias, meses, años y día de la semana
  new CronJob(
    "0 2 * * *",
    function () {
      client.guilds.cache.forEach((g) => {
        g.roles.fetch();
      });

      getFecha();
      //Hacemos una query para recuperar todos los usuarios con estado de sub experied en la web
      //Necesitamos los IDs, por lo que sus tags los convertimos en IDs.
      //SELECT u.discord, m.object_id FROM ${userTable}  AS u, ${membershipTable} AS m WHERE u.id = m.user_id AND( ( m.status IN('expired') AND m.checked IS NULL ) OR( m.status IN('active') AND m.expiration_date < CURRENT_DATE AND m.checked IS NULL ) OR( m.status IN('active') AND m.expiration_date IS NULL AND m.checked IS NULL ) ) AND u.discord IS NOT NULL AND m.object_id != 26 ORDER BY u.discord ASC;
      createQuery(
        `SELECT u.discord, m.object_id, m.id FROM ${userTable}  AS u, ${membershipTable} AS m WHERE u.id = m.user_id AND( ( m.status IN('expired') AND( m.checked IS NULL OR m.checked LIKE 0 ) ) OR( m.status IN('active', 'pending', 'cancelled') AND m.expiration_date < CURRENT_DATE AND( m.checked IS NULL OR m.checked LIKE 0 ) ) OR( m.status IN('active', 'pending', 'cancelled') AND m.expiration_date IS NULL AND( m.checked IS NULL OR m.checked LIKE 0 ) ) ) AND u.discord IS NOT NULL AND m.object_id != 26 ORDER BY u.discord ASC;`,
        async function (response) {
          let subCaducada;

          for (let i = 0; i < response.length; i++) {
            const tagUser = response[i].discord;
            subCaducada = response[i].object_id;
            idSub = response[i].id;

            const list = client.guilds.cache.get(guildId);
            await list.members.fetch().then((members) => {
              let member = members.find((u) => u.user.id === tagUser);

              if (member === undefined) {
                member = members.find((u) => u.user.username + "#" + u.user.discriminator === tagUser);
              }
              if (member != undefined) getPlayer(member.user.id, subCaducada, idSub);
            });
            //Nos aseguramos de que se pone como procesado aunque no haya tenido rol alguno
            createQuery(`UPDATE ${membershipTable} SET checked = 1 where id = ${idSub}`, () => {
              log("Usuario actualizado en tabla membership");
            });
          }
        }
      );
    },
    null,
    true,
    "Europe/Madrid"
  );
});

client.login(token);
