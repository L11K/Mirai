
//APISearch - gets two types "manga" and "anime" and a title
function APISearch(type, title, callback){
	if(config.myanimelist_password == "" || config.myanimelist_username == "")
		return callback("No username or password provided!", true);
	request(("https://" + config.myanimelist_username + ":" + config.myanimelist_password + "@myanimelist.net/api/" + type + "/search.xml?q=" + title), function(error, response, body){	
	if(error){ return callback(error); };
		parseString(body, function (err, result) {
			if(err){ return callback(err, true); };
			//I will get the first result, usually the correct one
			if(type == "manga")
				callback(result.manga.entry[0], false);
			if(type == "anime")
				callback(result.anime.entry[0], false);
		});
	});
  };