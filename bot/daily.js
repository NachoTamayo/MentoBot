const {
  Client,
  GatewayIntentBits,
  Partials,
  ApplicationCommandOptionType,
  MessageFlags,
  PermissionFlagsBits,
} = require("discord.js");
const {
  clientId,
  guildId,
  token,
  user,
  password,
  host,
  database,
  port,
  permisosChannelID,
  soporteChannelID,
  roles,
  botID,
} = require("../config/config.json");

const { planRoleMap, managedRoleIds, anunciosRoleId, resolveRoleFamilyConflicts } = require("./planRoleMap");

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
const { linkEmail, getAccess } = require("./v4Client");
const { createRoleHelpers } = require("./roleHelpers");

// Sin intents privilegiados (GuildMembers / MessageContent): Discord los exige revisar al superar 10k usuarios.
// En los canales del servidor message.content llega vacío, así que !email y !sub pasan a ser /email y /sub.
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages],
  partials: [Partials.Channel, Partials.Message, Partials.User], // Mejor manejo de DM y mensajes parciales
});

const slashCommands = [
  {
    name: "email",
    description: "Vincula el email de tu cuenta de MentoPoker con tu usuario de Discord",
    options: [
      {
        type: ApplicationCommandOptionType.String,
        name: "email",
        description: "El email con el que te registraste en mentopoker.com",
        required: true,
      },
    ],
  },
  {
    name: "sub",
    description: "Actualiza tus roles según tu suscripción de MentoPoker",
  },
];

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

// Vincula el email con el usuario de Discord y devuelve el texto de respuesta.
async function linkEmailReply(discordUserId, emailToValidate) {
  if (!isEmailValid(emailToValidate)) {
    return "Tu email no tiene un formato correcto :confused:\r\n\r\nPero puedes volver a intentarlo :grin:";
  }

  //Método para controlar a unos scammers
  if (emailToValidate == "lucia.rivera76@gmail.com") {
    const user = await client.users.fetch("524180674786230272");
    await user.send(`Los scammers han vuelto, esta vez han usado una cuenta con el ID: ${discordUserId}`);
  }

  const result = await linkEmail(discordUserId, emailToValidate);

  if (result.ok) {
    return `Se ha asociado el email ${emailToValidate} con tu usuario.\r\n\r\nYa puedes usar **/sub** para conseguir tus roles.\r\n\r\nMuchas gracias :partying_face:`;
  } else if (result.status === 404) {
    return "El email que me has dado no existe en nuestra base de datos. Asegúrate de haberlo escrito bien y vuelve a probar. Recuerda que tiene que ser con el mail que te registraste.";
  } else if (result.status === 409) {
    return `Ese email ya está vinculado a otra cuenta de Discord. Si crees que es un error contacta con Soporte en <#${soporteChannelID}>.`;
  } else if (result.status === 400) {
    return "El email que me has dado no es válido. Revísalo y vuelve a probar.";
  } else {
    log(`/email fallback discordUserId=${discordUserId} status=${result.status} code=${result.code}`);
    return `Algo en mis sistemas ha fallado :weary:\r\n\r\nSi necesitas ayuda usa el canal <#${soporteChannelID}> de nuestro Discord.`;
  }
}

async function emailFunction(message) {
  const reply = await linkEmailReply(message.author.id, message.content.replace("!email ", ""));
  message.author.send(reply).catch(console.error);
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

const { addRoleSafe, removeRoleSafe } = createRoleHelpers(log);

// Sincroniza los roles del miembro con su suscripción en V4 y devuelve el texto de respuesta.
async function subReply(member) {
  const result = await getAccess(member.id);
  const accessStatus = result.ok ? result.data.status : "unavailable";

  if (!result.ok) {
    log(`/sub call failed discordUserId=${member.id} status=${result.status ?? "n/a"} code=${result.code ?? "n/a"}`);
  }

  if (accessStatus === "unlinked") {
    return "No hay registro de que tu usuario de Discord tenga perfil en la escuela. ¿Quizás es que no lo has validado con tu mail? Usa el comando **/email** para incorporarlo a la web :wink:";
  } else if (accessStatus === "inactive") {
    for (const roleId of managedRoleIds) {
      if (member.roles.cache.has(roleId)) {
        await removeRoleSafe(member, roleId);
      }
    }
    return (
      `Tu suscripción aparentemente no está activa. Si crees que es un error, deja el siguiente mensaje en el grupo <#${soporteChannelID}>` +
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
      log(`/sub unknown plan slug(s) discordUserId=${member.id} slugs=${unknownSlugs.join(",")}`);
    }

    const { resolved: resolvedRoleIds, conflicts } = resolveRoleFamilyConflicts(targetRoleIds);
    for (const conflict of conflicts) {
      log(
        `/sub role family conflict discordUserId=${member.id} family=${conflict.family} kept=${conflict.kept} dropped=${conflict.dropped.join(",")}`
      );
    }

    if (targetRoleIds.size === 0 && unknownSlugs.length === 0 && hasFreePlan) {
      for (const roleId of managedRoleIds) {
        if (member.roles.cache.has(roleId)) {
          await removeRoleSafe(member, roleId);
        }
      }
      return "Con la suscripción gratuita de MentoPoker no tienes derecho a los roles de la escuela que dan acceso a los canales privados, pero te invitamos a suscribirte para descubrirlos :wink:";
    } else if (targetRoleIds.size === 0) {
      log(`/sub unresolved active plan discordUserId=${member.id} planSlugs=${JSON.stringify(planSlugs)}`);
      return `Tu suscripción está activa pero no he podido resolver tu plan. Contacta con Soporte en <#${soporteChannelID}>`;
    }

    if (anunciosRoleId && member.roles.cache.has(anunciosRoleId)) {
      log(`/sub removing Anuncios role discordUserId=${member.id} (paid subscription active)`);
      await removeRoleSafe(member, anunciosRoleId);
    }

    const grantedNames = [];
    const failedRoleIds = [];
    for (const roleId of resolvedRoleIds) {
      if (!member.roles.cache.has(roleId)) {
        const added = await addRoleSafe(member, roleId);
        if (!added) {
          failedRoleIds.push(roleId);
          continue;
        }
      }
      const roleName = getKeyByValue(roles, roleId);
      if (roleName) grantedNames.push(transformarString(roleName));
    }

    for (const roleId of managedRoleIds) {
      if (member.roles.cache.has(roleId) && !resolvedRoleIds.has(roleId)) {
        await removeRoleSafe(member, roleId);
      }
    }

    if (failedRoleIds.length > 0) {
      log(`/sub role grant failed discordUserId=${member.id} roleIds=${failedRoleIds.join(",")}`);
      return (
        "He podido asignarte " +
        (grantedNames.length ? "parte de tus roles (" + grantedNames.join(", ") + ")" : "ninguno de tus roles") +
        `, pero algo ha fallado al aplicar otros. Contacta con Soporte en <#${soporteChannelID}>`
      );
    }
    return (
      "Está todo correcto. Perteneces al grupo de " +
      grantedNames.join(", ") +
      `. ¡Felicidades! Si es incorrecto deberías contactar con Soporte en <#${soporteChannelID}>`
    );
  } else {
    return `No he podido comprobar tu acceso ahora mismo. Inténtalo de nuevo en unos minutos, y si el problema persiste contacta con Soporte en <#${soporteChannelID}>`;
  }
}

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "email" && interaction.commandName !== "sub") return;

  try {
    // Respuesta efímera: solo la ve quien ejecuta el comando, así el email nunca queda a la vista
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const reply =
      interaction.commandName === "email"
        ? await linkEmailReply(interaction.user.id, interaction.options.getString("email", true).trim())
        : await subReply(interaction.member);
    await interaction.editReply(reply);
  } catch (err) {
    log(`/${interaction.commandName} failed discordUserId=${interaction.user.id} error=${err.message}`);
    const text = `Algo en mis sistemas ha fallado :weary:\r\n\r\nSi necesitas ayuda usa el canal <#${soporteChannelID}> de nuestro Discord.`;
    const send = interaction.deferred
      ? interaction.editReply(text)
      : interaction.reply({ content: text, flags: MessageFlags.Ephemeral });
    send.catch(console.error);
  }
});

// Sin MessageContent no sabemos si un mensaje de #soporte es una consulta o un "gracias",
// así que el acuse se manda como mucho una vez cada 12 h por usuario.
const SOPORTE_ACK_COOLDOWN_MS = 12 * 60 * 60 * 1000;
const lastSoporteAck = new Map();

client.on("messageCreate", async (message) => {
  if (message.author.id == botID) return;

  if (message.channel.id == soporteChannelID) {
    //ID de Elmo
    if (message.author.id != "524180674786230272") {
      const lastAck = lastSoporteAck.get(message.author.id) || 0;
      if (Date.now() - lastAck > SOPORTE_ACK_COOLDOWN_MS) {
        lastSoporteAck.set(message.author.id, Date.now());
        message.reply(
          `Hemos recibido tu mensaje, cuando tengas un tick verde ✅ ElmoKof te contactará por mensaje privado, revisa tu bandeja de entrada. Acuérdate de activar la recepción de mensajes privados en Discord.\r\n\r\nRecuerda que si es por tema de permisos tienes que usar el canal <#${permisosChannelID}> primero.
            
🤖  Si pasan 48h sin respuesta no dudes en volver a poner tu mensaje con la duda en el mismo.\r\n

🛌 Recuerda que todos descansamos los fines de semana y puede tardar un poco más.`
        );
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
    if (message.channel.id === permisosChannelID) {
      // El staff puede escribir en el canal sin que el bot intervenga
      if (message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) return;

      // No podemos leer el mensaje y puede ser un "!email tu@mail" escrito por costumbre:
      // lo borramos para no dejar el email a la vista y explicamos los slash commands.
      var msj = `${message.author}, para acceder a los grupos son dos sencillos pasos:\r\n\r\n`;
      msj += "1. Validar tu mail de la web www.mentopoker.com\r\n";
      msj += "Escribe **/email**, elige el comando de MentoBot y pon tu mail\r\n";
      msj += "Ejemplo:\r\n";
      msj += "/email Mentopoker@gmail.es\r\n\r\n";
      msj += "Una vez tienes validado esto, a entrar en los grupos de tu suscripción!\r\n\r\n";
      msj += "2. Validar tu suscripción\r\n";
      msj += "**/sub**\r\n";
      msj += "Te añadirá a los grupos de tu suscripción\r\n\r\n";
      msj += "Las respuestas de MentoBot solo las verás tú. He borrado tu mensaje para proteger tus datos.\r\n\r\n";
      msj += "¡Y ya está! Si tienes cualquier problema, abre un ticket en el canal <#1312015565090459699>";
      message.channel.send(msj).catch(console.error);
      message.delete().catch(console.error);
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

client.once("ready", async () => {
  log("Ready!");
  try {
    await client.guilds.cache.get(guildId).commands.set(slashCommands);
    log("Slash commands /email y /sub registrados");
  } catch (err) {
    log(`Error registrando slash commands: ${err.message}`);
  }
});

client.login(token);
