const { Client, Intents, Permissions } = require('discord.js');
const { clientId, guildId, token, user, password, host, database, port, adminRole } = require('./config.json');
const mysql = require('mysql');
const { RequestManager } = require('@discordjs/rest');

const client = new Client({ intents: ["GUILDS", "GUILD_MESSAGES", "GUILD_MEMBERS", "DIRECT_MESSAGES"], partials: ["CHANNEL"], fetchAllMembers: true });

var adminArray = new Array();

function createQuery(query){
    var con = mysql.createConnection({
        host: host, 
        user: user,
        password: password,
        database : database,
        port : port
      });

      con.connect(function(err){
        if(err) throw err; 

        console.log('Conectado a la base de datos!');

        con.query(query, function(error, rows, fields){
            if(!!error){
                console.log('Error in the query');
            }else{
                return rows;
            }
        })
    });
  
    
}

function isAdmin(userID){
    let guild = client.guilds.cache.get(guildId);
    guild.members.fetch(userID).then(members =>{
        return members.roles.cache.some(role => role.id === adminRole);
    })
    
    
    
}


client.once('ready', () => {
	console.log('Ready!');
    
    //adminArray
});

client.on('messageCreate', async (message) => {
    //Comprobamos que el mensaje recibido no es un MP
    if (message.channel.type !== 'DM')
      return;
    if(message.content.startsWith('!email')){
        var email = message.content.replace('!email ', '');
        message.reply(`Tu usuario de Discord ${message.author.username}#${message.author.discriminator} ha sido asociado a la dirección de correo ${email}\n\r holas`);
    }else if(message.content.startsWith('!spam')){
        //Comprobamos que el que usa este comando es un admin
        let guild = client.guilds.cache.get(guildId);
         guild.members.fetch(message.author.id).then(members =>{
        if( members.roles.cache.some(role => role.id === adminRole)){
            console.log('Admin mandando spam...');
            const list = client.guilds.cache.get(guildId); 
        
            list.members.fetch({cache:false}).then(members => {
                
                for (let [key, value] of members) {
                    
                    //El IF es para que no se lo mande a si mismo y no pete
                    if(members.get(key).user.id != "932377554541752370"){
                        var mensaje = '¡Buenas, soy MentoBot! \r\n\r\nTe escribo para pedirte tu dirección de correo electrónico y añadirla a nuestra base de datos, para tenerla relacionada con tu usuario de Discord.\r\n';
                        mensaje +='Para ello te voy a pedir que me lo escribas usando el comando !email, de la siguiente manera:\r\n\r\n\r\n';
                        mensaje +="!email [DIRECCION_DE_MAIL]\r\n\r\n\r\n";
                        mensaje +="Tiene que ser con la que estás registrado en la web y asegúrate de que está correctamente escrito, si no te lo volveré a pedir.\r\n\r\n\r\n";
                        mensaje +="Gracias por tu colaboración. Beep. Boop. :robot:";
                        members.get(key).user.send(mensaje)
                    }
                }
            });
        }else{
            console.log('No es admin');
            return;
        }
        })
       
    }else{
        console.log(message.content);
        return;
    }
       
    
  });

client.on('interactionCreate', async interaction => {
    
    
    console.log(interaction);

	if (!interaction.isCommand()) return;

	const { commandName } = interaction;

	if (commandName === 'email') {
        //Si el bot manda el mensaje lo ignoramos
        if (interaction.user.bot) return false;
        
        if (interaction.channelId == null) { // Checkeamos si lo que hemos recibido es un mensaje privado
            
            console.log('MP recibido');
        };

		
	}
});

client.login(token);