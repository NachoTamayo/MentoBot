const { Client, Intents, Permissions, MessageSelectMenu } = require('discord.js');
const CronJob = require('cron').CronJob;
const { clientId, guildId, token, user, password, host, database, port, adminRole, permisosChannelID, soporteChannelID, roles, userTable, membershipTable, botID } = require('./config.json');
const mysql = require('mysql');
const { RequestManager } = require('@discordjs/rest');

const client = new Client({ intents: ["GUILDS", "GUILD_PRESENCES", "GUILD_MESSAGES", "GUILD_MEMBERS", "DIRECT_MESSAGES"], partials: ["CHANNEL"], fetchAllMembers: true });

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

function quitarRolesAnuncios(guild, member){
   
    member.roles.remove(guild.roles.cache.find(role => role.id === roles.cashBasicAnuncios));
    member.roles.remove(guild.roles.cache.find(role => role.id === roles.cashProAnuncios));
    member.roles.remove(guild.roles.cache.find(role => role.id === roles.cashEliteAnuncios));
    member.roles.remove(guild.roles.cache.find(role => role.id === roles.spinBasicAnuncios));
    member.roles.remove(guild.roles.cache.find(role => role.id === roles.spinProAnuncios));
    member.roles.remove(guild.roles.cache.find(role => role.id === roles.spinEliteAnuncios));
    member.roles.remove(guild.roles.cache.find(role => role.id === roles.torneosBasicAnuncios));
    member.roles.remove(guild.roles.cache.find(role => role.id === roles.torneosProAnuncios));
    member.roles.remove(guild.roles.cache.find(role => role.id === roles.torneosEliteAnuncios));
}

//Este método solo quita roles de suscripción, nada más
function quitarRoles(guild, member){
    
    var roleCB= guild.roles.cache.find(role => role.name === roles.cashBasic);
    if(member.roles.cache.some(role => role.name === roles.cashBasic))
        member.roles.remove(roleCB);

    var roleCP= guild.roles.cache.find(role => role.name === roles.cashPro);
    if(member.roles.cache.some(role => role.name === roles.cashPro))
        member.roles.remove(roleCP);

    var roleCE= guild.roles.cache.find(role => role.name === roles.cashElite);
    if(member.roles.cache.some(role => role.name === roles.cashElite))
        member.roles.remove(roleCE);

    var roleSB= guild.roles.cache.find(role => role.name === roles.spinBasic);
    if(member.roles.cache.some(role => role.name === roles.spinBasic))
        member.roles.remove(roleSB);

    var roleSP= guild.roles.cache.find(role => role.name === roles.spinPro);
    if(member.roles.cache.some(role => role.name === roles.spinPro))
        member.roles.remove(roleSP);

    var roleSE= guild.roles.cache.find(role => role.name === roles.spinElite);
    if(member.roles.cache.some(role => role.name === roles.spinElite))
        member.roles.remove(roleSE);

    var roleTB= guild.roles.cache.find(role => role.name === roles.torneosBasic);
    if(member.roles.cache.some(role => role.name === roles.torneosBasic))
        member.roles.remove(roleTB);

    var roleTP= guild.roles.cache.find(role => role.name === roles.torneosPro);
    if(member.roles.cache.some(role => role.name === roles.torneosPro))
        member.roles.remove(roleTP);

    var roleTE= guild.roles.cache.find(role => role.name === roles.torneosElite);
    if(member.roles.cache.some(role => role.name === roles.torneosElite))
        member.roles.remove(roleTE);
}

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

function getRole(id){
    const guild = client.guilds.cache.get(guildId); 
    return guild.roles.cache.find(role => role.id === id);
}

function desasignarRoles(member, guild, subCaducada){
    console.log('Tiene una suscripción expirada: '+member.user.username);
    if(member.roles.cache.has(roles.cashBasic) && (subCaducada == '7' || subCaducada == '17' || subCaducada == '16')){
        console.log('Tiene rol Cash Basic');
        member.roles.remove(roles.cashBasic);
        if(!member.roles.cache.has(roles.cashBasicAnuncios)){
            console.log('Le ponemos Rol Cash Casic Anuncios');
            member.roles.add(roles.cashBasicAnuncios);
        }
    }

    if(member.roles.cache.has(roles.cashPro) && (subCaducada == '8' || subCaducada == '18' || subCaducada == '19')){
        console.log('Tiene rol Cash Pro');
        member.roles.remove(roles.cashPro);
        if(!member.roles.cache.has(roles.cashProAnuncios)){
           
            member.roles.add(roles.cashProAnuncios);
        }
    }

    if(member.roles.cache.has(roles.cashElite) && (subCaducada == '9' || subCaducada == '20' || subCaducada == '21')){
        console.log('Tiene rol Cash Elite');
        member.roles.remove(roles.cashElite);
        if(!member.roles.cache.has(roles.cashEliteAnuncios)){
            member.roles.add(roles.cashEliteAnuncios);
        }
    }
    
    if(member.roles.cache.has(roles.spinBasic) && (subCaducada == '1' || subCaducada == '10' || subCaducada == '11')){
        console.log('Tiene rol Spin Basic');
        member.roles.remove(roles.spinBasic);
        if(!member.roles.cache.has(roles.spinBasicAnuncios)){
            member.roles.add(roles.spinBasicAnuncios);
        }
    }

    if(member.roles.cache.has(roles.spinPro) && (subCaducada == '2' || subCaducada == '12' || subCaducada == '13')){
        console.log('Tiene rol Spin Pro');
        member.roles.remove(roles.spinPro);
        if(!member.roles.cache.has(roles.spinProAnuncios)){
            member.roles.add(roles.spinProAnuncios);
        }
    }

    if(member.roles.cache.has(roles.spinElite) && (subCaducada == '3' || subCaducada == '14' || subCaducada == '15')){
        console.log('Tiene rol Spin Elite');
        member.roles.remove(roles.spinElite);
        if(!member.roles.cache.has(roles.spinEliteAnuncios)){
            member.roles.add(roles.spinEliteAnuncios);
        }
    }

    if(member.roles.cache.has(roles.torneosBasic) && (subCaducada == '4' || subCaducada == '22' || subCaducada == '23')){
        console.log('Tiene rol Torneos Basic');
        member.roles.remove(roles.torneosBasic);
        if(!member.roles.cache.has(roles.torneosBasicAnuncios)){
            member.roles.add(roles.torneosBasicAnuncios);
        }
    }

    if(member.roles.cache.has(roles.torneosPro) && (subCaducada == '5' || subCaducada == '24' || subCaducada == '25')){
        console.log('Tiene rol Torneos Pro');
        member.roles.remove(roles.torneosPro);
        if(!member.roles.cache.has(roles.torneosProAnuncios)){
            member.roles.add(roles.torneosProAnuncios);
        }
    }

    if(member.roles.cache.has(roles.torneosElite) && (subCaducada == '27' || subCaducada == '28' || subCaducada == '29')){
        console.log('Tiene rol Torneos Pro');
        member.roles.remove(roles.torneosElite);
        if(!member.roles.cache.has(roles.torneosEliteAnuncios)){
            member.roles.add(roles.torneosEliteAnuncios);
        }
    }


}

function toLowerCase(str){
    return str.toLowerCase();
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

function emailFunction(message){
    var emailToValidate = message.content.replace('!email ', '');
    
            if(isEmailValid(emailToValidate)){
                
                //Primero comprobamos si este usuario ya tiene su usuario de Discord en la base de datos
                createQuery(`SELECT * FROM ${userTable} WHERE discord="${message.author.id}"`, function(res){
                    if(res.length > 0){
                        message.author.send('Tu usuario de Discord ya estaba asociado a un mail en nuestra base de datos.').catch(console.error);
                    }else{
                        //Si no hay registro para ese usuario, buscamos si ese mail existe en la base de datos
                        createQuery(`SELECT * FROM ${userTable} WHERE user_email="${emailToValidate}"`, function(res){
                            if(res.length == 0){
                                message.author.send('El email que me has dado no existe en nuestra base de datos. Asegúrate de haberlo escrito bien y vuelve a probar. Recuerda que tiene que ser con el mail que te registraste.').catch(console.error);
                            }else{
                                //Hacemos el update
                                createQuery(`UPDATE ${userTable} SET discord="${message.author.id}" WHERE user_email="${emailToValidate}"`, function(res){
                                    if(res.changedRows){
                                        message.author.send(`Se ha asociado el email ${emailToValidate} con tu usuario ${message.author.id}.\r\n\r\n Muchas gracias :partying_face:`).catch(console.error);
                                    }else{
                                        message.author.send(`Algo en mis sistemas ha fallado :weary:\r\n\r\nSi necesitas ayuda usa el canal '+message.guild.channels.cache.get(soporteChannelID).toString()+' de nuestro Discord.`).catch(console.error);
                                    }
                                });
                            }
                        });
                    }
                });
                
                
            }else{
                message.author.send('Tu email no tiene un formato correcto :confused:\r\n\r\nPero puedes volver a intentarlo :grin:').catch(console.error);
            }
}

//FUNCIONES GENERALES



client.on('messageCreate', async (message) => {
    if(message.author.id == botID)
        return;
    let guild = client.guilds.cache.get(guildId);

    // Verificar si el mensaje se envió en el canal deseado
    if (message.channel.id === "1109017030813810778") {
       
        // Verificar si el autor del mensaje tiene el rol de administrador
        if (message.member.roles.cache.has(adminRole)) {
          // El usuario tiene el rol de administrador, permitir cualquier tipo de mensaje
          return;
        } else {
          // El usuario no tiene el rol de administrador, solo permitir mensajes con imágenes adjuntas
          if (message.attachments.size === 0) {
            // El mensaje no contiene imágenes adjuntas ni contenido de texto
            message.delete();
          }
        }
    }

    // Verificar si el mensaje se envió en el canal deseado
  if (message.channel.id === "1109016862999711774") {
    // Verificar si el autor del mensaje tiene el rol de administrador
    if (message.member.roles.cache.has(adminRole)) {
      // El usuario tiene el rol de administrador, permitir cualquier tipo de mensaje
      return;
    } else {
      // El usuario no tiene el rol de administrador, solo permitir mensajes con enlaces
      if (!containsLink(message.content)) {
        // El mensaje no contiene un enlace
        message.delete();
      }
    }
  }
    
    if(message.channel.id == soporteChannelID && message.author.id != "524180674786230272" ){
        if(message.content.startsWith('!email')){
            message.reply('Eso me lo tienes que escribir por el canal de '+message.guild.channels.cache.get(permisosChannelID).toString()+'');
            return;
        }
        if(message.content.startsWith('!sub')){
            message.reply('Eso me lo tienes que escribir por el canal de '+message.guild.channels.cache.get(permisosChannelID).toString()+'');
            return;
        }
        if(message.content.startsWith('!help')){
            var mensaje = "¿Necesitas ayuda? Estos son mis comandos:\r\n\r\n";
            mensaje+="**!help** -> Bueno, este creo que ya sabes para que es...\r\n";
            mensaje+="**!email [TU EMAIL AQUI]** -> Para validar tu email y tu user de Discord. Te recomiendo que lo uses mandándome un mensaje privado, por el tema de la privacidad.\r\n";
            mensaje+="**!sub** -> Para actualizar tu rol en Discord por si te acabas de registrar o has cambiado de plan. Necesitas tener el mail y user de Discord verificado.\r\n";
            message.reply(mensaje);
            return;
        }
        if(message.content.length > 15)
         message.reply('Hemos recibido tu mensaje, cuando tengas un tick verde ✅ ElmoKof te contactará por mensaje privado, **revisa tu bandeja de entrada**. Acuérdate de **activar la recepción de mensajes privados** en Discord.\r\n\r\nRecuerda que si es por tema de **permisos** tienes que usar el canal '+message.guild.channels.cache.get(permisosChannelID).toString()+' primero.\r\n\r\n🤖  Si pasan 48h sin respuesta no dudes en volver a poner tu mensaje con la duda en el mismo.\r\n\r\n🛌 Recuerda que todos descansamos los fines de semana y puede tardar un poco más.');
        return;
        
    }
 
    if(message.channel.id == "1104058780645335171" && message.content != "Hola" && message.content != "Buenas" && message.author.id != "932377554541752370"){
        message.reply('Hola! Has solicitado información sobre los deals, revisa tu sección de mensajes privados y mira bien que tengas "solicitudes pendientes" y abierta recepción de los mismos.\r\n\r\nkmayor99#8060 te contactará por esa vía, CONFIRMA su nombre de discord para evitar problemas (su número 8060) 😄\r\n\r\nPuedes consultar la página https://mentopoker.com/deals/ y echar un vistazo sobre los deals por si quieres directamente elegir uno.');
    }
    //Comprobamos que el mensaje recibido no es un MP
    if (message.channel.type !== 'DM'){
        //Easter Egg para Miguel
        if(message.author.id == '618456228192059420' && message.content == "!"){
            let canal = message.channel.id;
            canal.message('De locos');
            message.delete();
        }
        if(message.channel.id !== permisosChannelID)
            return;
        //Comando !Help que muestra todos los comandos de los que dispone el bot
        if(toLowerCase(message.content.toString()).startsWith('!help')){
            var mensaje = "¿Necesitas ayuda? Estos son mis comandos:\r\n\r\n";
            mensaje+="**!help** -> Bueno, este creo que ya sabes para que es...\r\n";
            mensaje+="**!email [TU EMAIL AQUI]** -> Para validar tu email y tu user de Discord. Te recomiendo que lo uses mandándome un mensaje privado, por el tema de la privacidad.\r\n";
            mensaje+="**!sub** -> Para actualizar tu rol en Discord por si te acabas de registrar o has cambiado de plan. Necesitas tener el mail y user de Discord verificado.\r\n";
            message.reply(mensaje);
        }else if(toLowerCase(message.content.toString()).startsWith('!email')){
            message.author.send('¡Hola! Esto mejor lo hablamos por aquí para mantener la privacidad de tus datos personales :wink:').catch(console.error);
            
            emailFunction(message);
            message.delete();
        }
        //Comando !sub para actualizar tu rol con lo que hay en la web
        else if(toLowerCase(message.content.toString()).startsWith('!sub')){
            //Esto es la columna membresía
            createQuery(`SELECT m.object_id, m.status from ${userTable} u, ${membershipTable} m where u.ID = m.user_id and u.discord ="${message.author.id}"`, function(res){
                
                if(res.length == 0){
                    message.reply('No hay registro de que tu usuario de Discord tenga perfil en la escuela. ¿Quizás es que no lo has validado con tu mail? Usa el comando **!email** (+ tu email aquí sin paréntesis ni espacio directamente) para incorporarlo a la web :wink:')
                }else{
                    var subActiva = false;
                    quitarRoles(guild, message.member);
                    quitarRolesAnuncios(guild, message.member);
                   for(var i =0; i<res.length; i++){
                    
                   
                    if(res[i].status == 'active'){
                        subActiva = true;
                        
                        switch(res[i].object_id){
                            case 9 : case 20 : case 21: case 48: case 49: case 50:
                                if(!message.member.roles.cache.some(role => role.name === roles.cashElite)){
                                    
                                    var role= guild.roles.cache.find(role => role.id === roles.cashElite);
                                    message.member.roles.add(role);
                                    //quitarRolesAnuncios(guild, message.member);
                                    message.reply('Se te ha incluido en el grupo de Cash Élite. ¡Felicidades!');
                                }else{
                                    message.reply('Está todo correcto. Sigues perteneciendo al grupo de Cash Élite. Si es incorrecto deberías contactar con Soporte en '+message.guild.channels.cache.get(soporteChannelID).toString()+' .');
                                }
                                break;
                            case 8 : case 18 : case 19: case 45: case 46: case 47:
                                if(!message.member.roles.cache.some(role => role.name === roles.cashPro)){
                                    //quitarRoles(guild, message.member);
                                    var role= guild.roles.cache.find(role => role.id === roles.cashPro);
                                    message.member.roles.add(role);
                                    //quitarRolesAnuncios(guild, message.member);
                                    message.reply('Se te ha incluido en el grupo de Cash Pro. ¡Felicidades!');
                                }else{
                                    message.reply('Está todo correcto. Sigues perteneciendo al grupo de Cash Pro. Si es incorrecto deberías contactar con Soporte en '+message.guild.channels.cache.get(soporteChannelID).toString()+' .');
                                }
                                break;
                            case 7 : case 17 : case 16: case 42: case 43: case 44:
                                if(!message.member.roles.cache.some(role => role.name === roles.cashBasic)){
                                    //quitarRoles(guild, message.member);
                                    //quitarRolesAnuncios(guild, message.member);
                                    var role= guild.roles.cache.find(role => role.id === roles.cashBasic);
                                    message.member.roles.add(role);
                                    //quitarRolesAnuncios(guild, message.member);
                                    message.reply('Se te ha incluido en el grupo de Cash Basic ¡Felicidades!');
                                }else{
                                    message.reply('Está todo correcto. Sigues perteneciendo al grupo de Cash Basic. Si es incorrecto deberías contactar con Soporte en '+message.guild.channels.cache.get(soporteChannelID).toString()+' .');
                                }
                                break;
                            case 3 : case 14 : case 15: case 39: case 40: case 41:
                                if(!message.member.roles.cache.some(role => role.name === roles.spinElite)){
                                    //quitarRoles(guild, message.member);
                                    var role= guild.roles.cache.find(role => role.id === roles.spinElite);
                                    message.member.roles.add(role);
                                    //quitarRolesAnuncios(guild, message.member);
                                    message.reply('Se te ha incluido en el grupo de Spin Elite. ¡Felicidades!');
                                }else{
                                    message.reply('Está todo correcto. Sigues perteneciendo al grupo de Spin Elite. Si es incorrecto deberías contactar con Soporte en '+message.guild.channels.cache.get(soporteChannelID).toString()+' .');
                                }
                                break;
                            case 2 : case 13 : case 12: case 36: case 37: case 38:
                                if(!message.member.roles.cache.some(role => role.name === roles.spinPro)){
                                    //quitarRoles(guild, message.member);
                                    var role= guild.roles.cache.find(role => role.id === roles.spinPro);
                                    message.member.roles.add(role);
                                    //quitarRolesAnuncios(guild, message.member);
                                    message.reply('Se te ha incluido en el grupo de Spin Pro. ¡Felicidades!');
                                }else{
                                    message.reply('Está todo correcto. Sigues perteneciendo al grupo de Spin Pro. Si es incorrecto deberías contactar con Soporte en '+message.guild.channels.cache.get(soporteChannelID).toString()+' .');
                                }
                                break;
                            case 1 : case 10 : case 11: case 33: case 34: case 35:
                                if(!message.member.roles.cache.some(role => role.name === roles.spinBasic)){
                                    //quitarRoles(guild, message.member);
                                    var role= guild.roles.cache.find(role => role.id === roles.spinBasic);
                                    message.member.roles.add(role);
                                    //quitarRolesAnuncios(guild, message.member);
                                    message.reply('Se te ha incluido en el grupo de Spin Basic. ¡Felicidades!');
                                }else{
                                    message.reply('Está todo correcto. Sigues perteneciendo al grupo de Spin Basic. Si es incorrecto deberías contactar con Soporte en '+message.guild.channels.cache.get(soporteChannelID).toString()+' .');
                                }
                                break;
                            case 4 : case 22 : case 23: case 51: case 52: case 53: case 54: 
                                if(!message.member.roles.cache.some(role => role.name === roles.torneosBasic)){
                                    //quitarRoles(guild, message.member);
                                    var role= guild.roles.cache.find(role => role.id === roles.torneosBasic);
                                    message.member.roles.add(role);
                                    //quitarRolesAnuncios(guild, message.member);
                                    message.reply('Se te ha incluido en el grupo de Torneos Basic. ¡Felicidades!');
                                }else{
                                    message.reply('Está todo correcto. Sigues perteneciendo al grupo de Torneos Basic. Si es incorrecto deberías contactar con Soporte en '+message.guild.channels.cache.get(soporteChannelID).toString()+' .');
                                }
                                break;
                            case 5 : case 24 : case 25: case 55: case 56: case 57:
                                if(!message.member.roles.cache.some(role => role.name === roles.torneosPro)){
                                    //quitarRoles(guild, message.member);
                                    var role= guild.roles.cache.find(role => role.id === roles.torneosPro);
                                    message.member.roles.add(role);
                                    //quitarRolesAnuncios(guild, message.member);
                                    message.reply('Se te ha incluido en el grupo de Torneos Pro. ¡Felicidades!');
                                }else{
                                    message.reply('Está todo correcto. Sigues perteneciendo al grupo de Torneos Pro. Si es incorrecto deberías contactar con Soporte en '+message.guild.channels.cache.get(soporteChannelID).toString()+' .');
                                }
                                break;
                                case 27 : case 28 : case 29: case 31: case 32: case 30:
                                    if(!message.member.roles.cache.some(role => role.name === roles.torneosElite)){
                                        //quitarRoles(guild, message.member);
                                        var role= guild.roles.cache.find(role => role.id === roles.torneosElite);
                                        message.member.roles.add(role);
                                        //quitarRolesAnuncios(guild, message.member);
                                        message.reply('Se te ha incluido en el grupo de Torneos Élite. ¡Felicidades!');
                                    }else{
                                        message.reply('Está todo correcto. Sigues perteneciendo al grupo de Torneos Élite. Si es incorrecto deberías contactar con Soporte en '+message.guild.channels.cache.get(soporteChannelID).toString()+' .');
                                    }
                                    break;
                        }
                    }
                }
                    
                    if(!subActiva){
                        var msjjj = 'Tu suscripción aparentemente no está activa. Puede ser debido a la migración de la web. Si crees que es un error, deja el siguiente mensaje en el grupo '+message.guild.channels.cache.get(soporteChannelID).toString()+': \r\n\r\n';
                        msjjj+= '--> No me reconoce la suscripción como activa + *escribe tu mail aquí*';
                        message.reply(msjjj);
                    }
                }
            });
        }else if(message.content.startsWith('!')){
            var msj = 'No conozco ese comando, quizás aún no me lo han enseñado. Por el momento, los que me sé son estos:\r\n\r\n';
            msj+='**!email** *tu mail aquí* para validar tu mail.\r\n';
            msj+='**!sub** para validar tu suscripción.\r\n';
            message.reply(msj);
        }else if(!message.content.startsWith('!')){
            var msj = 'Recuerda que en este canal **SOLO** puedes usar estos dos comandos:\r\n\r\n';
            msj+='**!email** *tu mail aquí* para validar tu mail.\r\n';
            msj+='**!sub** para validar tu suscripción.\r\n\r\n';
            msj+='Si tienes cualquier otro problema: deja tu mensaje con tu problema y tu mail en el grupo '+message.guild.channels.cache.get(soporteChannelID).toString()+' .\r\n';
            message.reply(msj);
        }
    }else{
        if(toLowerCase(message.content.toString()).startsWith('!subdoble') && (message.author.id == "524180674786230272" || message.author.id == "269920447439699978")){
            var mailDoble = message.content.replace('!subdoble ', '');
            createQuery(`delete from naw_rcp_memberships where status = "expired" and user_id = (SELECT ID FROM naw_users where user_email = "${mailDoble}")`, function(res){
                if(res != "error")
                message.reply('Se ha borrado la suscripción expirada');

            });
        }else if(toLowerCase(message.content.toString()).startsWith('!email')){
            
            emailFunction(message);

        }else if(message.content.startsWith('!spam1111111')){
            //Comprobamos que el que usa este comando es un admin
            let guild = client.guilds.cache.get(guildId);
             guild.members.fetch(message.author.id).then(members =>{
            if( members.roles.cache.some(role => role.id === adminRole)){
                console.log('Admin mandando spam...');
                const list = client.guilds.cache.get(guildId); 
            
                list.members.fetch({cache:false}).then(members => {
                    
                    for (let [key, value] of members) {
                        
                        //El IF es para que no se lo mande a si mismo y no pete
                        if(members.get(key).user.id != botID){
                            var mensaje = '¡Buenas, soy MentoBot! \r\n\r\nTe escribo para pedirte tu dirección de correo electrónico y añadirla a nuestra base de datos, para tenerla relacionada con tu usuario de Discord.\r\n';
                            mensaje +='Para ello te voy a pedir que me lo escribas usando el comando !email, de la siguiente manera:\r\n\r\n\r\n';
                            mensaje +="!email [DIRECCION_DE_MAIL]\r\n\r\n\r\n";
                            mensaje +="Tiene que ser con la que estás registrado en la web y asegúrate de que está correctamente escrito, si no te lo volveré a pedir.\r\n\r\n\r\n";
                            mensaje +="Gracias por tu colaboración. Beep. Boop. :robot:";
                            members.get(key).user.send(mensaje).catch(console.error);
                        }
                    }
                });
            }else{
                
                return;
            }
            })
        }else if(message.content.startsWith('!')){
            var msj = 'No conozco ese comando, quizás aún no me lo han enseñado. Por el momento, los que me sé son estos:\r\n\r\n';
            msj+='**!email**   *tu mail aquí*    ->    para validar tu mail.\r\n';
            msj+='**!sub**   ->   para validar tu suscripción.\r\n';
            message.reply(msj);
        }else{
            
            return;
        }
    }    
  });

  function containsLink(content) {
    // Expresión regular para verificar si el contenido contiene un enlace
    const linkRegex = /(https?:\/\/[^\s]+)/;
    return linkRegex.test(content);
  }

async function getPlayer(id, subCaducada){
    let server = client.guilds.cache.get("618457893762760714");
    let player = await server.members.fetch(id);
    desasignarRoles(player, server, subCaducada);
}

client.once('ready', () => {
	console.log('Ready!');
    const list = client.guilds.cache.get(guildId);
   

    
    //En orden de asteriscos: Segundos, minutos, horas, dias, meses, años y día de la semana
    new CronJob('0 0 * * *', function(){
        client.guilds.cache.forEach(g => {      
            g.roles.fetch();
        });

       
        getFecha();
        //Hacemos una query para recuperar todos los usuarios con estado de sub experied en la web
        //Necesitamos los IDs, por lo que sus tags los convertimos en IDs.
       createQuery(`select u.discord, m.object_id from ${userTable} as u, ${membershipTable} as m where u.id=m.user_id and m.status = 'expired' and u.discord is not null order by u.discord asc`, async function(response){
                
                var userTag;
                var arrIDs = new Array();
                var subCaducada;
                
                for(var i=0; i<response.length; i++){
                    
                    tagUser = response[i].discord;
                    
                    subCaducada = response[i].object_id;
                   
                    const list = client.guilds.cache.get(guildId); 
                    await list.members.fetch().then(members => {
                        let member = members.find(u => u.user.id === tagUser);
                        if(member == undefined)
                            member = members.find(u => u.user.username+'#'+u.user.discriminator === tagUser);
                        if(member != undefined)
                        getPlayer(member.user.id, subCaducada);
                    });
                    
                }     
        });
    }, null, true, "Europe/Madrid");

});





client.login(token);

