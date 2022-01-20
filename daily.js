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
    console.log('Tiene una suscripción expirada: '+member.user.username);
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

function getFecha(){
    let date_ob = new Date();
let date = ("0" + date_ob.getDate()).slice(-2);
let month = ("0" + (date_ob.getMonth() + 1)).slice(-2);
let year = date_ob.getFullYear();
let hours = date_ob.getHours();
let minutes = date_ob.getMinutes();
let seconds = date_ob.getSeconds();

console.log(year + "-" + month + "-" + date + " " + hours + ":" + minutes + ":" + seconds);

}

client.once('ready', () => {
	console.log('Ready!');
    new CronJob('0 8 * * * *', function(){
        client.guilds.cache.forEach(g => {      
            g.roles.fetch();
        });
        getFecha();
        //Hacemos una query para recuperar todos los usuarios con estado de sub experied en la web
        //Necesitamos los IDs, por lo que sus tags los convertimos en IDs.
        createQuery(`SELECT discord FROM ${userTable} WHERE perfil LIKE '%(expired)%'`, async function(response){
                var userTag;
                var arrIDs = new Array();
                
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

