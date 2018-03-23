const Discord = require("discord.js");
const request = require('request');
const Lokka = require('lokka').Lokka;
const Transport = require('lokka-transport-http').Transport;
const schedule = require('node-schedule');
const MongoClient = require('mongodb').MongoClient;
const parseString = require('xml2js').parseString;
const striptags = require('striptags');
const Entities = require('html-entities').AllHtmlEntities;
const config = require("./config.json");


const db_url = "mongodb://localhost/MiraiBot";
const ghql_client = new Lokka({ transport: new Transport("https://graphql.anilist.co/")});
const client = new Discord.Client();
const prefix = config.prefix;
const api_key = config.token;


function addreminder(reminder_date, user_id, anime, callback){
	MongoClient.connect(db_url, function(err, db) {
		if(err){return callback(err,true);}
		
		var database_obj = db.db("MiraiBot");
		database_obj.createCollection("remindlist", function(err,res){		
			if(err){return callback(err, true)}
		});

		var obj = {
			date: reminder_date,
			id: user_id.id,
			username: user_id.username,
			discriminator: user_id.discriminator,
			anime_title: anime 
		};

		database_obj.collection("remindlist").insertOne(obj, function(err, res){
			if(err){return callback(err, true)}
		
			console.log("[i] Added to database!");
			return callback(reminder_date, false);
		});
	}); 
};


client.on('ready', () => {
	console.log(`[i] Logged in as ${client.user.tag}!`);
	client.user.setActivity("Watching anime ~ send " + prefix + "help for commands");

		MongoClient.connect(db_url, function(err, db) {
			if(err){console.log("[e] Can't connect to Mongodb: " + err); return}
			var database_obj = db.db("MiraiBot");
			var cursor = database_obj.collection("remindlist").find();
			cursor.each(function(err, item) {
				if(item == null) {console.log("[i] Database loaded"); db.close(); return;}
				var j = schedule.scheduleJob(item.date, function(){
					client.fetchUser(item.id).then(user => {user.send("Hey!\n**" + item.anime_title + "** is airing right now!\n*INFO:* send again " + prefix + "remindme <animetitle> for the next episode!")})
				});
			});
		});	
});


client.on('message', message => {

	if (!message.content.startsWith(prefix) || message.author.bot) return;

	const args = message.content.slice(prefix.length).trim().split(/ +/g);
	const command = args.shift().toLowerCase();

	switch (command) { 
		case "anime":
			var title = args.slice(0).join(" ").replace(/[^\w\s]/gi, '');

			console.log("[r] Someone requested (Anime): " + title);

			APISearch("anime", title, function(res, err){

				if(err){
					console.log(err);
					message.channel.send("*Sumimasen!*\nI couldn't get your request done.."); 
					return;
				}


				if(res == undefined || res.title == undefined){
					message.channel.send("*Sumimasen!*\nI couldn't find your anime.."); 
					return;
				}

				const embed = new Discord.RichEmbed()
					.setTitle("**" + res.english + "**" + "  (JPN: " + res.title + ")")
					.setColor(Math.random() * (16777215))
					.setDescription(Entities.decode(striptags(res.synopsis)))
					.setThumbnail(res.image)
					.setURL("https://myanimelist.net/anime/" + res.id + "\n")
					.setFooter("Aired: " + res.start_date + " | Episodes: " + res.episodes + " | Status: " + res.status + " | Score on MyAnimeList.net: " + res.score)
					message.channel.send({embed});
			});
			break;

		case "manga":
			var title = args.slice(0).join(" ").replace(/[^\w\s]/gi, '');
			console.log("[r] Someone requested (Manga): " + title);
			APISearch("manga", title, function(res, err){

				if(err){
					message.channel.send("*Sumimasen!*\nI couldn't get your request done.."); 
					return;
				}

				if(res == undefined || res.title == undefined){
					message.channel.send("*Sumimasen!*\nI couldn't find your manga.."); 
					return;
				}

			const embed = new Discord.RichEmbed()
				.setTitle("**" + res.english + "**" + "  (JPN: " + res.title + ")")
				.setColor(Math.random() * (16777215))
				.setDescription(Entities.decode(striptags(res.synopsis)))
				.setThumbnail(res.image)
				.setURL("https://myanimelist.net/manga/" + res.id + "\n")
				.setFooter("Start date: " + res.start_date + " | Volumes: " + res.volumes + " | Status: " + res.status + " | Score on MyAnimeList.net: " + res.score)
				message.channel.send({embed});
				
			});
			break;

		case "next":
		//Next must use anilist.co API since they are the only w/ release date for episodes
		var title = args.slice(0).join(" ").replace(/[^\w\s]/gi, '');
		var air_req = `query ($query: String) { Media (search: $query, type: ANIME) { title { romaji } nextAiringEpisode { airingAt episode timeUntilAiring } } }`;
		var vars = {query: title};

		ghql_client.query(air_req, vars).then(result => {
			airing_time = new Date(0);
			if(result.Media.nextAiringEpisode == null){message.channel.send("*Sumimasen!*\nThe anime you are looking for is ended or I don't have enough infos!"); return;}
			airing_time.setUTCSeconds(result.Media.nextAiringEpisode.airingAt);
			message.channel.send(result.Media.title.romaji + " (Episode " + result.Media.nextAiringEpisode.episode +") will air at: " + airing_time.toISOString().replace(/T/, ' ').replace(/\..+/, ''));
		}).catch(error => {message.channel.send("*Sumimasen!*\nI couldn't find what are you looking for..");});
		break;
	
		case "remindme":
		var title = args.slice(0).join(" ").replace(/[^\w\s]/gi, '');
		if(title == "debug"){
			airing_time = new Date;
			airing_time.setUTCSeconds(airing_time.getSeconds() + 10);
			addreminder(airing_time, message.author, "Debug anime!");
			message.channel.send("Debug anime is going to be airing soon! (2 minutes!)");
			var j = schedule.scheduleJob(airing_time, function(){
				message.author.send("Hey!\n**" + title + "** is airing right now!\n*INFO:* send again !remindme <animetitle> for the next episode!")});
			return;
		}
		var air_req = `query ($query: String) { Media (search: $query, type: ANIME) { title { romaji } nextAiringEpisode { airingAt episode timeUntilAiring } } }`;
		var vars = {query: title};
		ghql_client.query(air_req, vars).then(result => {
			airing_time = new Date(0);
			if(result.Media.nextAiringEpisode == null){message.channel.send("*Sumimasen!*\nThe anime you are looking for is ended or I don't have enough infos!"); return;}
			airing_time.setUTCSeconds(result.Media.nextAiringEpisode.airingAt);
			message.channel.send("I will remind you about **" + result.Media.title.romaji + "**! Just for an episode (Because Deoke is lazy af)");
			addreminder(airing_time, message.author, result.Media.title.romaji,  function(res, err){
				if(err){message.channel.send("Something got wrong and I couldn't add it to the reminder list!"); return;}
				var j = schedule.scheduleJob(airing_time, function(){
					message.author.send("Hey!\n**" + result.Media.title.romaji + "** is airing right now!\n*INFO:* to send again " + prefix + "remindme <animetitle> for the next episode!")});
			});	
		}).catch(error => {message.channel.send("*Sumimasen!*\nI couldn't find what are you looking for..");});
		break;

		case "help":
		message.channel.send("List of available commands: \n" + prefix + "help - This message\n" + prefix + "anime <anime> - Get infos about an anime\n" + prefix + "manga <manga> - Get infos about a manga\n" + prefix + "next <anime> - gets next episode airing time\n" + prefix + "remindme <anime> - Will send you a message when the next episode is airing\n" + prefix + "pat - :3");
		break;

		case "pat":
		message.channel.send({ file: "http://1.bp.blogspot.com/-xafwCCN8Zfk/UxZEwWjXRjI/AAAAAAAAI9w/eoakrZBVSdg/s1600/tumblr_my0kjlGpOn1r2pvg2o1_r1_500.gif" });
		break;

	}
});

client.login(api_key);

//That is really bad, added just because some event triggers an Uncaught Exception and I wasn't able to debug it
//If you can please get rid of this atrocity
process.on('uncaughtException', function(err) {
	console.log('Caught exception: ' + err);
  });

  //TODO: integrate both providers in a unique function
  //myanimelist.net API search (Experimental)
  function APISearch(type, title, callback){
	if(config.myanimelist_password == "" || config.myanimelist_username == "")
		return callback("No username or password provided!", true);
	request(("https://" + config.myanimelist_username + ":" + config.myanimelist_password + "@myanimelist.net/api/" + type + "/search.xml?q=" + title), function(error, response, body){	
	if(error){ return callback(error); };
		parseString(body, {trim: true, explicitArray: false}, function (err, result) {
			if(err){ return callback(err, true); };
			//I will get the first result, usually the correct one
			if(type == "manga")
				callback(result.manga.entry[0], false);
			if(type == "anime"){
				callback(result.anime.entry[0], false);
			}
		});
	});
  };


