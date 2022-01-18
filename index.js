const { Client, Intents } = require('discord.js');
const { clientId, guildId, token } = require('./config.json');

const client = new Client({ intents: ["GUILDS", "GUILD_MESSAGES", "GUILD_MEMBERS", "DIRECT_MESSAGES"], partials: ["CHANNEL"], fetchAllMembers: true });

var membersArray = new Array();

client.once('ready', () => {
	console.log('Ready!');
    const list = client.guilds.cache.get(guildId); 
        
    list.members.fetch({cache:false}).then(members => {
        
        for (let [key, value] of members) {
            
            if(members.get(key).user.id != "932377554541752370"){
                members.get(key).user.send('Hello World')
            }
        }
    });
    
});

client.on('messageCreate', async (message) => {
    //Comprobamos que el mensaje recibido no es un MP
    if (message.channel.type !== 'DM')
      return;
    if(!message.content.startsWith('!email'))
        return;
    var email = message.content.replace('!email ', '');
    message.reply(`Tu usuario de Discord ${message.author.username}#${message.author.discriminator} ha sido asociado a la dirección de correo ${email}\n\r holas`)
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

		await interaction.reply('Pong!');
	} 
});

client.login(token);