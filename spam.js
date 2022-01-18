const { Client, Intents, Permissions } = require('discord.js');
const { clientId, guildId, token, user, password, host, database, port, adminRole, supportChannelID } = require('./config.json');
const mysql = require('mysql');
const { RequestManager } = require('@discordjs/rest');

const client = new Client({ intents: ["GUILDS", "GUILD_MESSAGES", "GUILD_MEMBERS", "DIRECT_MESSAGES"], partials: ["CHANNEL"], fetchAllMembers: true });

var adminArray = new Array();

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

      
        
        con.query(query, function(error, rows, fields){
            if(!!error){
                return callback('error');
            }else{
                
                return callback(rows);
            }
        })
    });
    
    
}

//Este método solo quita roles de suscripción, nada más
function quitarRoles(guild, member){
    
    var roleCB= guild.roles.cache.find(role => role.name === "Cash Basic");
    if(member.roles.cache.some(role => role.name === 'Cash Basic'))
        member.roles.remove(roleCB);

    var roleCP= guild.roles.cache.find(role => role.name === "Cash Pro");
    if(member.roles.cache.some(role => role.name === 'Cash Pro'))
        member.roles.remove(roleCP);

    var roleCE= guild.roles.cache.find(role => role.name === "Cash Elite");
    if(member.roles.cache.some(role => role.name === 'Cash Elite'))
        member.roles.remove(roleCE);

    var roleSB= guild.roles.cache.find(role => role.name === "Spin Basic");
    if(member.roles.cache.some(role => role.name === 'Spin Basic'))
        member.roles.remove(roleSB);

    var roleSP= guild.roles.cache.find(role => role.name === "Spin Pro");
    if(member.roles.cache.some(role => role.name === 'Spin Pro'))
        member.roles.remove(roleSP);

    var roleSE= guild.roles.cache.find(role => role.name === "Spin Elite");
    if(member.roles.cache.some(role => role.name === 'Spin Elite'))
        member.roles.remove(roleSE);

    var roleTB= guild.roles.cache.find(role => role.name === "Torneos Basic");
    if(member.roles.cache.some(role => role.name === 'Torneos Basic'))
        member.roles.remove(roleTB);

    var roleTP= guild.roles.cache.find(role => role.name === "Torneos Elite");
    if(member.roles.cache.some(role => role.name === 'Torneos Elite'))
        member.roles.remove(roleTP);
}


client.once('ready', () => {
	console.log('Ready!');
    

});

client.on('messageCreate', async (message) => {
    //Comprobamos que el mensaje recibido no es un MP
    if (message.channel.type !== 'DM'){
        if(message.channel.id !== supportChannelID)
            return;
        //Comando !Help que muestra todos los comandos de los que dispone el bot
        if(message.content.startsWith('!help')){
            var mensaje = "¿Necesitas ayuda? Estos son mis comandos:\r\n\r\n";
            mensaje+="**!help** -> Bueno, este creo que ya sabes para que es...\r\n";
            mensaje+="**!email [TU EMAIL AQUI]** -> Para validar tu email y tu user de Discord. Te recomiendo que lo uses mandándome un mensaje privado, por el tema de la privacidad.\r\n";
            mensaje+="**!sub** -> Para actualizar tu rol en Discord por si te acabas de registrar o has cambiado de plan. Necesitas tener el mail y user de Discord verificado.\r\n";
            message.reply(mensaje);
        }else if(message.content.startsWith('!email')){
            message.author.send('¡Hola! Esto mejor lo hablamos por aquí para mantener la privacidad de tus datos personales :wink:');
            message.delete();
        }
        //Comando !sub para actualizar tu rol con lo que hay en la web
        else if(message.content.startsWith('!sub')){
            //Esto es la columna membresía
            createQuery(`SELECT perfil FROM MOCK_DATA WHERE DISCORD="${message.author.username}#${message.author.discriminator}"`, function(res){
                if(res.length == 0){
                    message.reply('No hay registro de que tu usuario de Discord tenga perfil en la escuela. ¿Quizás es que no lo has validado con tu mail? Usa el comando **!email** para incorporarlo a la web :wink:')
                }else{
                    console.log(res[0].perfil);
                    if(res[0].perfil.indexOf('(active)') > 1){
                        let guild = client.guilds.cache.get(guildId);
                        var sub = res[0].perfil.replace('(active)', '');
                        
                        switch(sub){
                            case 'Cash Elite':
                                if(!message.member.roles.cache.some(role => role.name === 'Cash Elite')){
                                    quitarRoles(guild, message.member);
                                    var role= guild.roles.cache.find(role => role.name === "Cash Elite");
                                    message.member.roles.add(role);
                                    message.reply('Se te ha incluido en el grupo de Cash Élite. ¡Felicidades!');
                                }else{
                                    message.reply('Está todo correcto. Sigues perteneciendo al grupo de Cash Élite. Si es incorrecto deberías contactar con Soporte.');
                                }
                                break;
                            case 'Cash Pro':
                                if(!message.member.roles.cache.some(role => role.name === 'Cash Pro')){
                                    quitarRoles(guild, message.member);
                                    var role= guild.roles.cache.find(role => role.name === "Cash Pro");
                                    message.member.roles.add(role);
                                    message.reply('Se te ha incluido en el grupo de Cash Pro. ¡Felicidades!');
                                }else{
                                    message.reply('Está todo correcto. Sigues perteneciendo al grupo de Cash Pro. Si es incorrecto deberías contactar con Soporte.');
                                }
                                break;
                            case 'Cash Basic':
                                if(!message.member.roles.cache.some(role => role.name === 'Cash Basic')){
                                    quitarRoles(guild, message.member);
                                    var role= guild.roles.cache.find(role => role.name === "Cash Basic");
                                    message.member.roles.add(role);
                                    message.reply('Se te ha incluido en el grupo de Cash Basic ¡Felicidades!');
                                }else{
                                    message.reply('Está todo correcto. Sigues perteneciendo al grupo de Cash Basic. Si es incorrecto deberías contactar con Soporte.');
                                }
                                break;
                            case 'Spin Elite':
                                if(!message.member.roles.cache.some(role => role.name === 'Spin Elite')){
                                    quitarRoles(guild, message.member);
                                    var role= guild.roles.cache.find(role => role.name === "Spin Elite");
                                    message.member.roles.add(role);
                                    message.reply('Se te ha incluido en el grupo de Spin Elite. ¡Felicidades!');
                                }else{
                                    message.reply('Está todo correcto. Sigues perteneciendo al grupo de Spin Elite. Si es incorrecto deberías contactar con Soporte.');
                                }
                                break;
                            case 'Spin Pro':
                                if(!message.member.roles.cache.some(role => role.name === 'Spin Pro')){
                                    quitarRoles(guild, message.member);
                                    var role= guild.roles.cache.find(role => role.name === "Spin Pro");
                                    message.member.roles.add(role);
                                    message.reply('Se te ha incluido en el grupo de Spin Pro. ¡Felicidades!');
                                }else{
                                    message.reply('Está todo correcto. Sigues perteneciendo al grupo de Spin Pro. Si es incorrecto deberías contactar con Soporte.');
                                }
                                break;
                            case 'Spin Basic':
                                if(!message.member.roles.cache.some(role => role.name === 'Spin Basic')){
                                    quitarRoles(guild, message.member);
                                    var role= guild.roles.cache.find(role => role.name === "Spin Basic");
                                    message.member.roles.add(role);
                                    message.reply('Se te ha incluido en el grupo de Spin Basic. ¡Felicidades!');
                                }else{
                                    message.reply('Está todo correcto. Sigues perteneciendo al grupo de Spin Basic. Si es incorrecto deberías contactar con Soporte.');
                                }
                                break;
                            case 'Torneos Basic':
                                if(!message.member.roles.cache.some(role => role.name === 'Torneos Basic')){
                                    quitarRoles(guild, message.member);
                                    var role= guild.roles.cache.find(role => role.name === "Torneos Basic");
                                    message.member.roles.add(role);
                                    message.reply('Se te ha incluido en el grupo de Torneos Basic. ¡Felicidades!');
                                }else{
                                    message.reply('Está todo correcto. Sigues perteneciendo al grupo de Torneos Basic. Si es incorrecto deberías contactar con Soporte.');
                                }
                                break;
                            case 'Torneos Pro':
                                if(!message.member.roles.cache.some(role => role.name === 'Torneos Pro')){
                                    quitarRoles(guild, message.member);
                                    var role= guild.roles.cache.find(role => role.name === "Torneos Pro");
                                    message.member.roles.add(role);
                                    message.reply('Se te ha incluido en el grupo de Torneos Pro. ¡Felicidades!');
                                }else{
                                    message.reply('Está todo correcto. Sigues perteneciendo al grupo de Torneos Pro. Si es incorrecto deberías contactar con Soporte.');
                                }
                                break;
                        }
                    }else{
                        message.reply('Tu suscripción aparentemente no está activa. Si crees que es un error, contacta con soporte.')
                    }
                }
            });
        }
    }else{
        if(message.content.startsWith('!email')){
            var emailToValidate = message.content.replace('!email ', '');
    
            if(isEmailValid(emailToValidate)){
                
                //Primero comprobamos si este usuario ya tiene su usuario de Discord en la base de datos
                createQuery(`SELECT * FROM MOCK_DATA WHERE DISCORD="${message.author.username}#${message.author.discriminator}"`, function(res){
                    if(res.length > 0){
                        message.reply('Tu usuario de Discord ya estaba asociado a un mail en nuestra base de datos.');
                    }else{
                        //Si no hay registro para ese usuario, buscamos si ese mail existe en la base de datos
                        createQuery(`SELECT * FROM MOCK_DATA WHERE email="${emailToValidate}"`, function(res){
                            if(res.length == 0){
                                message.reply('El email que me has dado no existe en nuestra base de datos. Asegúrate de haberlo escrito bien y vuelve a probar.');
                            }else{
                                //Hacemos el update
                                createQuery(`UPDATE MOCK_DATA SET DISCORD="${message.author.username}#${message.author.discriminator}" WHERE email="${emailToValidate}"`, function(res){
                                    if(res.changedRows){
                                        message.reply(`Se ha asociado el email ${emailToValidate} con tu usuario ${message.author.username}#${message.author.discriminator}.\r\n\r\n Muchas gracias :partying_face:`)
                                    }else{
                                        message.reply(`Algo en mis sistemas ha fallado :weary:\r\n\r\nSi necesitas ayuda usa el canal #Soporte de nuestro Discord.`);
                                    }
                                });
                            }
                        });
                    }
                });
                
                
            }else{
                message.reply('Tu email no tiene un formato correcto :confused:\r\n\r\nPero puedes volver a intentarlo :grin:');
            }
    
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
                
                return;
            }
            })
           
        }else{
            
            return;
        }
    }    
  });



client.login(token);

//FUNCIONES GENERALES

var emailRegex = /^[-!#$%&'*+\/0-9=?A-Z^_a-z{|}~](\.?[-!#$%&'*+\/0-9=?A-Z^_a-z`{|}~])*@[a-zA-Z0-9](-*\.?[a-zA-Z0-9])*\.[a-zA-Z](-?[a-zA-Z0-9])+$/;

function isEmailValid(email) {
    if (!email)
        return false;

    if(email.length>254)
        return false;

    var valid = emailRegex.test(email);
    if(!valid)
        return false;

    // Further checking of some things regex can't handle
    var parts = email.split("@");
    if(parts[0].length>64)
        return false;

    var domainParts = parts[1].split(".");
    if(domainParts.some(function(part) { return part.length>63; }))
        return false;

    return true;
}
function isAdmin(userID){
    let guild = client.guilds.cache.get(guildId);
    guild.members.fetch(userID).then(members =>{
        return members.roles.cache.some(role => role.id === adminRole);
    })
    
    
    
}
///FUNCIONES GENERALES