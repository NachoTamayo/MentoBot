const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
const FormData = require('form-data');
const { token, coachRoles, guildId, userTable, user,
    password,
    host,
    database,
    port,
endPoint, access_key } = require('./config_dev.json');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent
    ],
    partials: ['MESSAGE', 'CHANNEL', 'REACTION'] // 🔹 Esto permitirá manejar reacciones en mensajes antiguos
});

const mysql = require("mysql");

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

function addPoints(id, points, razon, callback) {
    console.log(access_key)

    const formData = new FormData();
    formData.append('access_key', access_key);
    formData.append('user_id', id);
    formData.append('type', 'add');
    formData.append('reference', razon);
    formData.append('amount', points);
    formData.append('entry', razon);


    axios.post(endPoint+"points", formData, {
        headers: formData.getHeaders()
    })
    .then(response => {
        console.log('Respuesta:', response.data);
    })
    .catch(error => {
        console.error('Error en la petición:', error.response ? error.response.data : error.message);
    });
}


function buscarUsuario(id, callback) {
  var query = `SELECT * FROM ${userTable} WHERE discord = ${id}`;
  createQuery(query, callback);
}

client.once('ready', () => {
    console.log(`Conectado como ${client.user.tag}`);
});

client.on('messageReactionAdd', async (reaction, user) => {
    console.log(`El usuario ${user.tag} reaccionó con ${reaction.emoji.name} al mensaje: "${reaction.message.content}"`);

    const guild = reaction.message.guild;
    if (!guild || guild.id !== guildId) return;
    const member = await guild.members.fetch(user.id); 

    const hasSpecialRole = member.roles.cache.some(role => coachRoles.includes(role.id));

    if (hasSpecialRole) {
        console.log(`🟢 [ESPECIAL] El usuario ${user.tag} (con rol especial) reaccionó con ${reaction.emoji.name} al mensaje: "${reaction.message.content}"`);

        buscarUsuario(reaction.message.author.id, (rows) => {
            let userId;
            if (rows.length > 0) {
               userId = rows[0].ID;
            } else {
                console.log(`El usuario ${user.tag} no existe en la base de datos.`);
                // Aquí puedes agregar lógica para insertar el usuario en la base de datos si es necesario
                userId = null;
            }
            let points = 0;
            let razon = null;
            console.log(reaction.emoji.name)
            if (reaction.emoji.name === 'monedabronce') {
                razon = 'Respuesta Buena/Relevante';
                points = 25;
            } else if (reaction.emoji.name === 'monedaplata') {
                razon = 'Respuesta Perfecta';
                points = 50;
            } else if (reaction.emoji.name === 'monedaoro') {
                razon = 'Participar en Revisión';
                points = 100;
            } else if (reaction.emoji.name === 'monedaverdee') {
                razon = 'Ganador de ranking mensual';
                points = 250;
            }else if (reaction.emoji.name === 'monedaesmeralda') {
                razon = 'Premio al mejor blog';
                points = 1000;
            }else{
                return; // Si la reacción no es una de las monedas, no hacemos nada
            }

            console.log(points, razon, userId);

            addPoints(userId, points, razon, (response) => {
                console.log(`Puntos añadidos: ${response}`);
            });


        });

    } 

    console.log(reaction.message.author.id);
});

client.login(token);
