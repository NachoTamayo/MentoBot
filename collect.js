const { Client, Intents, Permissions } = require('discord.js');
const CronJob = require('cron').CronJob;
const { clientId, guildId, token, user, password, host, database, port, adminRole, supportChannelID, roles, userTable, membershipTable, botID } = require('./config.json');
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

function init(){
    const list = client.guilds.cache.get(guildId); 

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

        list.members.fetch({cache:false}).then(async members => {
        
            for (let [key, value] of members) {
                await sleep(100);
                if(members.get(key).user.id != botID){
                    console.log(`UPDATE ${userTable} SET discord="${members.get(key).user.username}#${members.get(key).user.discriminator}" WHERE user_login="${members.get(key).user.username}"`);
                    con.query(`UPDATE ${userTable} SET discord="${members.get(key).user.username}#${members.get(key).user.discriminator}" WHERE user_login="${members.get(key).user.username}"`, function(error, rows, fields){
                        
                    })
                }
            }
            con.end();
        });
      
        
        
    });
}

function sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

client.once('ready', () => {
	console.log('Ready!');
    
    init();
        
    

});





client.login(token);