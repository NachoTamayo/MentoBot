const { Client, Intents, Permissions } = require('discord.js');
const CronJob = require('cron').CronJob;
const { clientId, guildId, token, user, password, host, database, port, adminRole, supportChannelID, roles, userTable } = require('./config.json');
const mysql = require('mysql');
const { RequestManager } = require('@discordjs/rest');

const client = new Client({ intents: ["GUILDS", "GUILD_MESSAGES", "GUILD_MEMBERS", "DIRECT_MESSAGES"], partials: ["CHANNEL"], fetchAllMembers: true });


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
      
        
        con.query(query, function(error, rows, fields){
            if(!!error){
                console.log(error);
                return callback('error');
            }else{
                
                return callback(rows);
            }
        })
    });
    
    
}

function getRole(id){
    const guild = client.guilds.cache.get(guildId); 
    return guild.roles.cache.find(role => role.id === id);
}

function desasignarRoles(member, guild){
    console.log(member.user.username);
    if(member.roles.cache.has(roles.cashBasic)){
        member.roles.remove(getRole(roles.cashBasic));
        if(!member.roles.cache.has(roles.cashBasicAnuncios)){
            member.roles.add(getRole(roles.cashBasicAnuncios));
        }
    }

    if(member.roles.cache.has(roles.cashPro)){
        member.roles.remove(getRole(roles.cashPro));
        if(!member.roles.cache.has(roles.cashProAnuncios)){
            member.roles.add(getRole(roles.cashProAnuncios));
        }
    }

    if(member.roles.cache.has(roles.cashElite)){
        member.roles.remove(getRole(roles.cashElite));
        if(!member.roles.cache.has(roles.cashEliteAnuncios)){
            member.roles.add(getRole(roles.cashEliteAnuncios));
        }
    }
    
    if(member.roles.cache.has(roles.spinBasic)){
        member.roles.remove(getRole(roles.spinBasic));
        if(!member.roles.cache.has(roles.spinBasicAnuncios)){
            member.roles.add(getRole(roles.spinBasicAnuncios));
        }
    }

    if(member.roles.cache.has(roles.spinPro)){
        member.roles.remove(getRole(roles.spinPro));
        if(!member.roles.cache.has(roles.spinProAnuncios)){
            member.roles.add(getRole(roles.spinProAnuncios));
        }
    }

    if(member.roles.cache.has(roles.spinElite)){
        member.roles.remove(getRole(roles.spinElite));
        if(!member.roles.cache.has(roles.spinEliteAnuncios)){
            member.roles.add(getRole(roles.spinEliteAnuncios));
        }
    }

    if(member.roles.cache.has(roles.torneosBasic)){
        member.roles.remove(getRole(roles.torneosBasic));
        if(!member.roles.cache.has(roles.torneosBasicAnuncios)){
            member.roles.add(getRole(roles.torneosBasicAnuncios));
        }
    }

    if(member.roles.cache.has(roles.torneosPro)){
        member.roles.remove(getRole(roles.torneosPro));
        if(!member.roles.cache.has(roles.torneosProAnuncios)){
            member.roles.add(getRole(roles.torneosProAnuncios));
        }
    }



}

client.once('ready', () => {
	console.log('Ready!');
    new CronJob('0 * * * * *', function(){
        client.guilds.cache.forEach(g => {      
            g.roles.fetch();
        });
        //Hacemos una query para recuperar todos los usuarios con estado de sub experied en la web
        //Necesitamos los IDs, por lo que sus tags los convertimos en IDs.
        createQuery(`SELECT discord FROM ${userTable} WHERE perfil LIKE '%(expired)%'`, async function(response){
                var userTag;
                var arrIDs = new Array();
                console.log(response)
                for(var i=0; i<response.length; i++){
                    tagUser = response[i].discord;
                    const list = client.guilds.cache.get(guildId); 
                    await list.members.fetch({cache:false}).then(members => {
                        var member = members.find(u => u.user.tag === tagUser);
                        desasignarRoles(member, list);
                    });
                    
                }     
        });
    }, null, true, "Europe/Madrid");

});





client.login(token);

