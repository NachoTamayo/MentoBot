# MentoBot

#### Description
MentoBot is a Discord Bot that provides a connection of Poker School Website to their Discord server. It made possible using the DiscordJS API.

![](https://i.imgur.com/P1uIipd.png)

#### Technologies Utilized
- [Next.js](nextjs.org) 
- [Vultr](https://www.vultr.com/) (Hosting)
- [MySQL](https://www.mysql.com/) (Web Databse) 
- [Discord API](https://discord.com/developers/docs/reference)
- [DiscordJS](https://discord.js.org/) (JS Library to connect Discord API)

## Getting Started
#### Prerequisites

Node.js installed on your local machine
Configure the Config.json file
Bot needs a Discord server and been authorized
Bot also needs a MySQL database to connect

#### Installation

Just execute `npm install` on the root dir to install all dependencies
Bot has two applications with different tasks. For any of those you can easily run with 'npm start daily'

You need to configure this Config.json file:

```json
{
    "token": "",
    "clientId": "",
    "guildId": "",
    "adminRole": "",
    "permisosChannelID": "",
    "soporteChannelID": "",
    "botID": "",
    "prefix": "",
    "host": "",
    "port": 0,
    "user": "",
    "password": "",
    "database": "",
    "userTable": "",
    "membershipTable": "",
    "roles": {
        "cashBasic": "",
        "cashBasicAnuncios": "",
        "cashPro": "",
        "cashProAnuncios": "",
        "cashElite": "",
        "cashEliteAnuncios": "",
        "spinBasic": "",
        "spinBasicAnuncios": "",
        "spinPro": "",
        "spinProAnuncios": "",
        "spinElite": "",
        "spinEliteAnuncios": "",
        "torneosBasic": "",
        "torneosBasicAnuncios": "",
        "torneosPro": "",
        "torneosProAnuncios": ""
    }
}
```

#### Deployment

This project can be easily deployed to [Vultr](https://www.vultr.com/docs/cloning-a-virtual-server-with-vultr/). Simply connect your Vultr account to your GitHub repository, and Vultr will automatically build and deploy your application with each new push to the main branch.

Alternatively, you can use the Vultr CLI to deploy your application straight from your local machine.

## How it works

MentoBot has two routines. One of them checks daily at 12 PM for any expired subscriptions and subsequently removes granted roles from Discord users

The second routine interacts with the user through Discord to provide assistance when certain commands are used

MentoBot has the capability to send the same message to every user on the Discord server


#### License

[@MIT](https://github.com/BrianRuizy/covid19-dashboard/blob/master/LICENSE.md)
