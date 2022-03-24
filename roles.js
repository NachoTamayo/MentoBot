const { Client, Intents, Permissions } = require('discord.js');
const CronJob = require('cron').CronJob;
const { clientId, guildId, token, user, password, host, database, port, adminRole, supportChannelID, roles, userTable, membershipTable, botID } = require('./config.json');
const mysql = require('mysql');
const { RequestManager } = require('@discordjs/rest');

const client = new Client({ intents: ["GUILDS", "GUILD_MESSAGES", "GUILD_MEMBERS", "DIRECT_MESSAGES"], partials: ["CHANNEL"], fetchAllMembers: true });


async function rolesF(){
    client.guilds.cache.forEach(g => {      
        g.roles.fetch();
    });

    let server = client.guilds.cache.get("618457893762760714");
    let player = await server.members.fetch('905117065474613249');
    player.roles.remove('815559044022534144');



    console.log(player)
}

client.once('ready', () => {

    rolesF()

    });


client.login(token);