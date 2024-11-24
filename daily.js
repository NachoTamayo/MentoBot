const { Client, Intents, Permissions, MessageSelectMenu } = require("discord.js");
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
} = require("./config.json");
//Database IDs for roles
const CONST_ROLE_NAMES = {};

const roleMappings = {
  cashElite: [9, 20, 21, 48, 49, 50],
  cashPro: [8, 18, 19, 45, 46, 47],
  cashBasic: [7, 17, 16, 42, 43, 44],
  spinElite: [3, 14, 15, 39, 40, 41],
  spinPro: [2, 13, 12, 36, 37, 38],
  spinBasic: [1, 10, 11, 33, 34, 35],
  torneosBasic: [4, 22, 23, 51, 52, 53, 54],
  torneosPro: [5, 24, 25, 55, 56, 57],
  torneosElite: [27, 28, 29, 30, 31, 32],
  pLOBasic: [61, 62, 63],
  pLOPro: [58, 59, 60],
  totalBasic: [69, 70, 71],
  totalPro: [67, 68, 72],
  totalElite: [64, 65, 66],
};

for (const roleName in roleMappings) {
  const roleIDs = roleMappings[roleName];
  for (const roleID of roleIDs) {
    CONST_ROLE_NAMES[roleID] = roles[roleName];
  }
}

const mysql = require("mysql");
const { RequestManager } = require("@discordjs/rest");

const client = new Client({
  intents: ["GUILDS", "GUILD_PRESENCES", "GUILD_MESSAGES", "GUILD_MEMBERS", "DIRECT_MESSAGES"],
  partials: ["CHANNEL"],
  fetchAllMembers: true,
});

//FUNCIONES GENERALES

var emailRegex =
  /^[-!#$%&'*+\/0-9=?A-Z^_a-z{|}~](\.?[-!#$%&'*+\/0-9=?A-Z^_a-z`{|}~])*@[a-zA-Z0-9](-*\.?[a-zA-Z0-9])*\.[a-zA-Z](-?[a-zA-Z0-9])+$/;

function isEmailValid(email) {
  if (!email) return false;

  if (email.length > 254) return false;

  var valid = emailRegex.test(email);
  if (!valid) return false;

  // Further checking of some things regex can't handle
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

function quitarRolesAnuncios(guild, member) {
  for (roleId in roles) {
    const role = guild.roles.cache.find((role) => role.id === roleId);
    if (role) {
      member.roles.remove(role);
    }
  }
}

//Este método solo quita roles de suscripción, nada más
function quitarRoles(guild, member) {
  for (roleName in roles) {
    const role = guild.roles.cache.find((role) => role.name === roleName);
    if (role && member.roles.cache.some((memberRole) => memberRole.name === roleName)) {
      member.roles.remove(role);
    }
  }
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
    console.log("Connected!");

    console.log(query);
    con.query(query, function (error, rows, fields) {
      if (error) {
        console.log(error);
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
      console.log(`El usuario ${member.user.username} tiene rol ${role}`);
      member.roles.remove(role);
      createQuery(`UPDATE ${membershipTable} SET checked = 1 where id = ${idSub}`, () => {
        console.log("Usuario actualizado en tabla membership");
        const anunciosRole = roles[getKeyByValue(roles, role) + "Anuncios"];
        console.log(`El usuario ${member.user.username} tiene rol ${anunciosRole}`);
        if (!member.roles.cache.has(anunciosRole)) {
          console.log(`Le ponemos Rol ${anunciosRole}`);
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

  console.log(year + "-" + month + "-" + date + " " + hours + ":" + minutes + ":" + seconds);
}

function emailFunction(message) {
  const emailToValidate = message.content.replace("!email ", "");

  if (!isEmailValid(emailToValidate)) {
    message.author
      .send("Tu email no tiene un formato correcto :confused:\r\n\r\nPero puedes volver a intentarlo :grin:")
      .catch(console.error);
    return;
  }

  // Comprobar si el usuario ya tiene su usuario de Discord en la base de datos
  createQuery(`SELECT * FROM ${userTable} WHERE discord="${message.author.id}"`, function (res) {
    if (res.length > 0) {
      message.author
        .send("Tu usuario de Discord ya estaba asociado a un mail en nuestra base de datos.")
        .catch(console.error);
    } else {
      // Si no hay registro para ese usuario, buscar si ese mail existe en la base de datos
      createQuery(`SELECT * FROM ${userTable} WHERE user_email="${emailToValidate}"`, function (res) {
        if (res.length == 0) {
          message.author
            .send(
              "El email que me has dado no existe en nuestra base de datos. Asegúrate de haberlo escrito bien y vuelve a probar. Recuerda que tiene que ser con el mail que te registraste."
            )
            .catch(console.error);
        } else {
          // Hacer el update
          createQuery(
            `UPDATE ${userTable} SET discord="${message.author.id}" WHERE user_email="${emailToValidate}"`,
            function (res) {
              if (res.changedRows) {
                message.author
                  .send(
                    `Se ha asociado el email ${emailToValidate} con tu usuario ${message.author.id}.\r\n\r\n Muchas gracias :partying_face:`
                  )
                  .catch(console.error);
              } else {
                message.author
                  .send(
                    `Algo en mis sistemas ha fallado :weary:\r\n\r\nSi necesitas ayuda usa el canal '${message.guild.channels.cache
                      .get(soporteChannelID)
                      .toString()}' de nuestro Discord.`
                  )
                  .catch(console.error);
              }
            }
          );
        }
      });
    }
  });
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

client.on("messageCreate", async (message) => {
  if (message.author.id == botID) return;
  let guild = client.guilds.cache.get(guildId);

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
        console.log("Sub");
        createQuery(
          `SELECT m.object_id, m.status from ${userTable} u, ${membershipTable} m where u.ID = m.user_id and u.discord ="${message.author.id}"`,
          function (res) {
            if (res.length == 0) {
              message.reply(
                "No hay registro de que tu usuario de Discord tenga perfil en la escuela. ¿Quizás es que no lo has validado con tu mail? Usa el comando **!email** para incorporarlo a la web :wink:"
              );
            } else {
              var subActiva = false;
              quitarRoles(guild, message.member);
              quitarRolesAnuncios(guild, message.member);
              for (var i = 0; i < res.length; i++) {
                //Ambas subscripciones están activas
                if (res[i].status == "active" || res[i].status == "cancelled") {
                  subActiva = true;
                  const object_id = res[i].object_id;

                  const roleName = CONST_ROLE_NAMES[object_id];
                  console.log(object_id);
                  if (object_id > 63 && object_id < 73) {
                    var role = guild.roles.cache.find((role) => role.id === roleName);
                    let tier = "";
                    switch (object_id) {
                      case 69:
                      case 70:
                      case 71:
                        message.member.roles.add("825664157998514176");
                        message.member.roles.add("825664144324952104");
                        message.member.roles.add("825664164512923659");
                        tier = "Basic";
                        break;
                      case 67:
                      case 68:
                      case 72:
                        message.member.roles.add("825664160141672458");
                        message.member.roles.add("825664152508563456");
                        message.member.roles.add("825664166945620039");
                        message.member.roles.add("1190616657232658483");
                        tier = "Pro";
                        break;
                      case 64:
                      case 65:
                      case 66:
                        message.member.roles.add("825664162575024172");
                        message.member.roles.add("825664154475036683");
                        message.member.roles.add("1064895184992743424");
                        message.member.roles.add("1190616803676782603");
                        tier = "Elite";
                        break;
                    }
                    message.reply(
                      "Wow! ¡Alguien con Sub Total!... Eso no se ve todos los días. Se te ha incluido en los diferentes grupos de " +
                        tier +
                        ". ¡Felicidades!"
                    );
                  } else if (roleName) {
                    if (!message.member.roles.cache.some((role) => role.id === roleName)) {
                      var role = guild.roles.cache.find((role) => role.id === roleName);
                      message.member.roles.add(role);
                      message.reply(
                        "Se te ha incluido en el grupo de " +
                          transformarString(getKeyByValue(roles, roleName)) +
                          ". ¡Felicidades!"
                      );
                    } else {
                      message.reply(
                        "Está todo correcto. Sigues perteneciendo al grupo de " +
                          transformarString(getKeyByValue(roles, roleName)) +
                          ". Si es incorrecto deberías contactar con Soporte en " +
                          message.guild.channels.cache.get(soporteChannelID).toString()
                      );
                    }
                  } else {
                    message.reply(
                      "Con la suscripción gratuita no puedes tener acceso a los grupos de Discord. Te animo a que te suscribas a Basic/Pro/Élite para descubrir la de cosas que hacemos en MentoPoker :)."
                    );
                  }
                }
              }

              if (!subActiva) {
                var msjjj =
                  "Tu suscripción aparentemente no está activa. Puede ser debido a la migración de la web. Si crees que es un error, deja el siguiente mensaje en el grupo " +
                  message.guild.channels.cache.get(soporteChannelID).toString() +
                  ": \r\n\r\n";
                msjjj += "--> No me reconoce la suscripción como activa + *escribe tu mail aquí*";
                message.reply(msjjj);
              }
            }
          }
        );
      } else if (message.content.startsWith("!")) {
        var msj =
          "No conozco ese comando, quizás aún no me lo han enseñado. Por el momento, los que me sé son estos:\r\n\r\n";
        msj += "**!email** *tu mail aquí* para validar tu mail.\r\n";
        msj += "**!sub** para validar tu suscripción.\r\n";
        message.reply(msj);
      } else if (!message.content.startsWith("!")) {
        var msj = "Recuerda que en este canal **SOLO** puedes usar estos dos comandos:\r\n\r\n";
        msj += "**!email** *tu mail aquí* para validar tu mail.\r\n";
        msj += "**!sub** para validar tu suscripción.\r\n\r\n";
        msj +=
          "Si tienes cualquier otro problema: deja tu mensaje con tu problema y tu mail en el grupo " +
          message.guild.channels.cache.get(soporteChannelID).toString() +
          " .\r\n";
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
          console.log("Admin mandando spam...");
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
  console.log("Ready!");
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
      createQuery(
        `SELECT u.discord, m.object_id, m.id FROM ${userTable}  AS u, ${membershipTable} AS m WHERE u.id = m.user_id AND( ( m.status IN('expired') AND m.checked IS NULL ) OR( m.status IN('active') AND m.expiration_date < CURRENT_DATE AND m.checked IS NULL ) OR( m.status IN('active') AND m.expiration_date IS NULL AND m.checked IS NULL ) ) AND u.discord IS NOT NULL AND m.object_id != 26 ORDER BY u.discord ASC;`,
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
            console.log("Usuario " + tagUser + " procesado");
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
