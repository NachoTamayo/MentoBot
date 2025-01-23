const { Client, GatewayIntentBits } = require('discord.js');
const moment = require('moment'); // Para manejo de fechas
const cron = require('node-cron'); // Para programar tareas
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, // Necesario para leer contenido de mensajes
    ],
});

const { token, soporteCategoriaID } = require('./config.json');

const processChannels = async () => {
    const guild = client.guilds.cache.first(); // Obtén el primer servidor donde está el bot
    if (!guild) {
        console.error('El bot no está en ningún servidor.');
        return;
    }

    const channels = guild.channels.cache.filter(
        channel => channel.parentId === soporteCategoriaID && channel.isTextBased() // Filtra canales de texto de la categoría
    );

    if (channels.size === 0) {
        console.log('No se encontraron canales en la categoría.');
        return;
    }

    for (const [channelId, channel] of channels) {
        try {
            // Obtener el primer mensaje (con paginación)
            let firstMessage = null;
            let lastId = null;
            const lastMessages = await channel.messages.fetch({ limit: 1 });
            const lastMessage = lastMessages.first();

            while (true) {
                const messages = await channel.messages.fetch({ limit: 100, before: lastId });
                if (messages.size === 0) break;

                firstMessage = messages.last(); // El último mensaje del lote es el más antiguo
                lastId = messages.last().id; // Actualiza el ID para la siguiente página
            }

            if (!firstMessage) {
                console.log(`El canal ${channel.name} no tiene mensajes.`);
                continue;
            }

            // Evaluar la antigüedad del primer mensaje
            const messageAge = moment().diff(moment(firstMessage.createdAt), 'days');
            if (messageAge > 3) {
                console.log(`***** CANAL: ${channel.name} *****`);
                console.log(`Primer mensaje: "${firstMessage.content}"`);
                console.log(`Último mensaje: "${lastMessage.content}"`);
                console.log(`Enviado por: ${firstMessage.author.tag}`);

                // Comprobar si el último mensaje es del bot
                if (lastMessage.author.id === client.user.id) {
                    await channel.delete(`El último mensaje fue enviado por el bot (${client.user.tag}) y el ticket lleva más de 3 días sin actividad.`);
                    console.log(`Canal ${channel.name} eliminado porque el último mensaje fue del bot.`);
                    continue;
                }

                // Extraer el ID del mensaje usando una expresión regular
                const userIdMatch = firstMessage.content.match(/<@\d+>/);
                if (userIdMatch) {
                    const userId = userIdMatch[1]; // Captura el ID del usuario
                    await channel.send(`Hola <@${userId}>, este ticket lleva más de 3 días sin actividad. ¿Es posible que el motivo del ticket ya esté resuelto? Si lo está te pediría que lo cierres para el buen funcionamiento del sistema. Si no está resuelto te ánimo a que le hagas seguimiento :).`);
                    console.log(`Mensaje enviado a <@${userId}> en el canal ${channel.name}.`);
                } else {
                    console.log(`No se encontró un ID de usuario en el primer mensaje del canal ${channel.name}.`);
                }
            }
        } catch (error) {
            console.error(`No se pudo procesar el canal ${channel.name}:`, error);
        }
    }
};

client.once('ready', async () => {
    console.log(`Conectado como ${client.user.tag}`);

    // Programar tarea diaria a las 12:00 AM
    cron.schedule('0 0 * * *', async () => {
        console.log('Ejecutando tarea programada a las 12:00 AM');
        await processChannels();
    });
});

client.login(token);
