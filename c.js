const login = require("fb-chat-api-temp");
const fs = require("fs");

// Create simple echo bot
login({appState: JSON.parse(fs.readFileSync('c.json', 'utf8'))}, (err, api) => {
		if(err) return console.error(err);
		console.log("Logged in!");

		api.listen((err, message) => {
				api.sendMessage(message.body, message.threadID);
		});
});
