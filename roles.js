const { Client, Intents, Permissions } = require('discord.js');
const CronJob = require('cron').CronJob;
const { clientId, guildId, token, user, password, host, database, port, adminRole, supportChannelID, roles, userTable, membershipTable, botID } = require('./config.json');
const mysql = require('mysql');
const { RequestManager } = require('@discordjs/rest');

const client = new Client({ intents: ["GUILDS", "GUILD_MESSAGES", "GUILD_PRESENCES", "GUILD_MEMBERS"] , partials: ["CHANNEL"], fetchAllMembers: false });

function createQuery(query, callback){
    var result;
    var con = mysql.createConnection({
        host: host, 
        user: user,
        password: password,
        database : database,
        port : port
      });

      con.connect(function(err){
        if(err) throw err; 
        console.log('Connected!');
      
        console.log(query);
        con.query(query, function(error, rows, fields){
            if(!!error){
                console.log(error);
                con.end();
                return callback('error');
            }else{
                con.end();
                return callback(rows);
            }
        })
    });
    
    
}


async function rolesF(){
    client.guilds.cache.forEach(g => {      
        g.roles.fetch();
    });

    let server = client.guilds.cache.get("618457893762760714");
    //let player = await server.members.fetch('398163287948132373');
    
    
    await server.members.fetch().then(members => {
        members.forEach((member) =>{
            console.log(member.user.tag);
        })
        
       
    });


    //console.log(player)
}

client.on('ready', async () => {
    console.log(`Bot is ready!`);
  
    // Obtener la guild por su ID
    const guildId = '618457893762760714';
    const guild = client.guilds.cache.get(guildId);

    var con = mysql.createConnection({
        host: host, 
        user: user,
        password: password,
        database : database,
        port : port
      });
  
    // Verificar si se pudo obtener la guild
    if (!guild) {
      console.log(`No se pudo encontrar la guild con ID: ${guildId}`);
      return;
    }
  
    try {
      await guild.members.fetch().then(async ()=>{
        const roles = await guild.roles.fetch();
        const miembrosConRol = guild.members.cache.filter((miembro) => {
          // Verificar si el miembro tiene al menos un rol asignado
          return miembro.roles.cache.some((rol) => roles.has(rol.id));
        });
        con.connect(function(err){
            if(err) throw err; 
            console.log('Connected!');
        for (const miembro of miembrosConRol.values()) {
          
                console.log(`UPDATE ${userTable} SET discord="${miembro.user.id}" WHERE discord="${miembro.user.username}#${miembro.user.discriminator}"`);
                /*con.query(`UPDATE ${userTable} SET discord="${miembro.user.id}" WHERE discord="${miembro.user.username}#${miembro.user.discriminator}"`, function(error, rows, fields){
                    console.log(error)
                });*/
          }
          con.end();
        });
      });
  
      
    } catch (error) {
      console.log(`Error al obtener los miembros de la guild: ${error}`);
    }
  });
  
  
  
  
  
  

    function sleep(ms) {
        return new Promise((resolve) => {
          setTimeout(resolve, ms);
        });
      }

client.login(token);