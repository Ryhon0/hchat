const Channel = 76055616;
const ChannelName = "CallMeCarsonLive".toLowerCase();
const clientID = "atu01l1tzhhfpzobn87uwwllq5pt4e";

function suggestEmotes(short) {
	short = short.toLowerCase();

	return emojiKeys.filter((e) => e.includes(short)).map((e) => {
		return {
			short: e,
			uni: emojis[e]
		}
	})
}

document.addEventListener("selectionchange", () => {
	if (textInput && textInput == document.activeElement) {
		textInputChanged();
	}
});

document.onkeydown = (ev) => {
	if (textInput && textInput == document.activeElement) {
		textInputKey(ev);
	}
};

var cachedUserColors = {}
var textInput = null
var emoteSuggestions = null
/** @type { ChatClient } */
var anonClient = null;
/** @type { ChatClient } */
var chatWS = null;
var tl;

var hchat = new HChat();
var hchannel = new HChatChannel(hchat, Channel);

async function loaded() {
	// OAuth redirect handling
	{
		var atoken = new URLSearchParams(window.location.hash.substring(1)).get("access_token");
		if (atoken) {
			var r = await getJSON("https://id.twitch.tv/oauth2/validate", {
				headers: {
					"Authorization": "Bearer " + atoken
				}
			});
			if (r.login) {
				var login =
				{
					username: r.login,
					id: r.user_id,
					token: atoken
				};

				localStorage.setItem("login", JSON.stringify(login));
			}
			else {
				localStorage.removeItem("login");
			}
			window.location.hash = "";
		}
	}

	await hchat.init();
	await hchannel.init();

	textInput = document.getElementById("textInput");
	emoteSuggestions = document.getElementById("emoteSuggestions");
	tl = document.getElementById("timeline");

	userCosmetics = await getJSON("/data/user_cosmetics.json")

	anonClient = new ChatClient();
	anonClient.onMessage = (msg) => {
		console.log(msg);
		processMessage(msg);
	};
	anonClient.join(ChannelName);

	var login = localStorage.getItem("login");
	if (login) {
		login = JSON.parse(login);
		chatWS = new ChatClient(login.username, login.token);
		chatWS.onMessage = (msg) => { };
	}

	var msg = await new RecentMessagesAPI().getRecentMessages(ChannelName, 800);
	if (!msg.erorr) {
		for (var m of msg.messages) {
			processMessage(parseMessage(m));
		}
	}
	else {
		tl.appendChild(document.createTextNode("Failed to load message history" + msg.erorr_code + " - " + msg.erorr));
	}
}

function processMessage(pm) {
	if (!pm || !pm.command || pm.command.command != "PRIVMSG") return;

	var mi = document.createElement("li");
	mi.classList.add("message");
	mi.id = "message#" + pm.tags.id;

	var namecolor = pm.tags.color;
	cachedUserColors[pm.source.nick] = namecolor;

	if(pm.tags["first-msg"] == "1")
		mi.classList.add("first");

	var isAction = false;
	if (pm.content.startsWith("ACTION") && pm.content[pm.content.length - 1] == "") {
		isAction = true;
		if (namecolor)
			mi.style.color = namecolor;
		mi.classList.add("action");
		pm.content = pm.content.substring("ACTION".length, pm.content.length - 1);
	}

	var cosmetics = {};
	// Badges
	{
		var bl = document.createElement("span");
		bl.classList.add("badges");
		
		var blist = hchannel.getBadgesForMessage(pm);
		for (var ba of blist) {
			var bi = document.createElement("img");
			bi.src = ba.img;
			bi.alt = ba.title;
			bi.style.background = ba.backgroundStyle;
			bl.appendChild(bi);
		}

		mi.appendChild(bl);
	}

	var nameSpan = document.createElement("b");
	nameSpan.classList.add("username");
	nameSpan.innerText = pm.displayName();
	if (!isAction)
		nameSpan.innerText += ": ";
	if (namecolor)
		nameSpan.style.color = namecolor;
	if (cosmetics) {
		if (cosmetics["name-background"]) {
			nameSpan.style.background = cosmetics["name-background"];
			nameSpan.style.setProperty("-webkit-background-clip", "text");
			nameSpan.style.setProperty("-webkit-text-fill-color", "transparent");
		}

		if (cosmetics["name-filter"]) {
			nameSpan.style.filter = cosmetics["name-filter"];
		}
	}
	mi.appendChild(nameSpan);

	var mentioned = false;
	var comps = hchannel.foldMessageComponents(hchannel.parseMessageComponents(pm.content, pm));
	for (c of comps) {
		if (c instanceof Emote) {
			var info = c.info;
			var img = document.createElement("img");
			img.src = c.info.getImageURL(3);
			img.alt = c.info.getName();

			var imgspan = document.createElement("span");
			imgspan.classList.add("emote");
			imgspan.appendChild(img);

			for (ov of c.overlays) {
				var img = document.createElement("img");
				img.src = ov.info.getImageURL(3);
				img.alt = c.info.getName();

				imgspan.appendChild(img);
			}

			mi.appendChild(imgspan);
		}
		else if (c instanceof Link)
		{
			var a = document.createElement("a");
			a.classList.add("link");
			a.href = c.url;
			a.innerText = c.url;
			a.target = "_blank";
			mi.appendChild(a);
		}
		else if(c instanceof Mention)
		{
			var s = document.createElement("span");
			s.classList.add("mention");
			s.innerText = "@" + c.username;
			s.style.color = cachedUserColors[c.username.toLowerCase()];
			mi.appendChild(s);

			if(c.username.toLowerCase() == chatWS.username)
				mentioned = true;
		}
		else {
			mi.appendChild(document.createTextNode(c));
		}
	}

	if(mentioned)
		mi.classList.add("mentioned")

	tl.appendChild(mi);
}

function textInputChanged() {
	var v = textInput.value;
	var end = textInput.selectionStart;

	var subsstr = v.substring(0, end)
	var space = subsstr.lastIndexOf(' ');
	var colon = subsstr.lastIndexOf(':');

	var shouldSuggest = colon != -1 ? space < colon : false;
	emoteSuggestions.innerHTML = "";
	if (!shouldSuggest) return;
	var code = v.substring(colon + 1, textInput.selectionStart);
	if (code.length < 3) return;

	var suggested = []
	suggested = suggested.concat(
		Object.values(emotes)
			.filter((e) => e.getName().toLowerCase().includes(code))
			.map((e) => { return { insert: e.getName(), html: '<img loading="lazy" height=32 src="' + e.urls[2] + '"> ' + e.getName() } }));
	suggested = suggested.concat(
		suggestEmotes(code)
			.map((e) => { return { insert: e.uni, html: e.uni + " " + e.short } }))

	for (var s of suggested) {
		var b = document.createElement("button");
		b.setAttribute("onclick", "insertText(\"" + s.insert + "\")")
		b.innerHTML = s.html;
		emoteSuggestions.appendChild(b);
		emoteSuggestions.appendChild(document.createElement("br"));
	}
}

function insertText(text) {
	var v = textInput.value;
	var subsstr = v.substring(0, textInput.selectionStart)
	var space = subsstr.lastIndexOf(' ');
	var colon = subsstr.lastIndexOf(':');
	v = v.substring(0, colon);
	v += text;
	var cursorpos = v.length;
	v += textInput.value.substring(textInput.selectionStart, textInput.value.length);

	emoteSuggestions.innerHTML = "";

	textInput.value = v;
	textInput.focus();
	textInput.selectionStart = cursorpos;
	textInput.selectionEnd = cursorpos;
}

function textInputKey(ev) {
	// Up / Down Arrow
	if (ev.keyCode == 38 || ev.keyCode == 40) {
		ev.preventDefault();
	}
	// Enter
	if (ev.keyCode == 13) {
		chatWS.sendMessage(ChannelName, textInput.value)
		textInput.value = "";
	}
}

function authRedirect() {
	var scopes = encodeURIComponent(["chat:edit", "chat:read", "user:read:chat", "whispers:read", "whispers:edit", "channel:moderate", "user:read:subscriptions", "user:read:follows", "user:manage:whispers", "user:manage:chat_color", "user:manage:blocked_users", "user:read:blocked_users"].join(' '));
	window.open(`https://id.twitch.tv/oauth2/authorize?client_id=${clientID}&redirect_uri=${encodeURIComponent(window.location.href)}&response_type=token&scope=${scopes}`);
}

class ChatClient {
	/** @type { WebSocket } */
	ws = null

	/** @type { Function } */
	onMessage = (msg) => { console.log(msg); };

	/**
	 * @param { String } user 
	 * @param { String } token 
	 */
	constructor(user, token) {
		this.init(user, token);
	}

	/** @type { String } */
	username

	init(user, token) {
		if (this.ws)
		this.ws.close();

		this.username = user;

		this.ws = new WebSocket("wss://irc-ws.chat.twitch.tv:443");
		this.ws.onopen = (ev) => {
			this.send("CAP REQ :twitch.tv/membership twitch.tv/tags twitch.tv/commands\n");
			if (user && token) {
				this.send("PASS oauth:" + token);
				this.send("NICK " + user);
				this.send("USER " + user);
			}
			else {
				this.send("NICK justinfan1234");
			}

			for (var m of this.pending)
				this.send(m);
			this.pending = [];

			this.ws.onmessage = (ev) => {
				for (var l of ev.data.split('\n')) {
					var pm = parseMessage(l);
					if (pm && pm.command) {
						if (pm.command.command == "PING") {
							this.send("PONG :tmi.twitch.tv " + pm.content + "\n");
						}
						else if (pm.command.command == "RECONNECT") {
							this.init(user, token);
						}
						else this.onMessage(pm);
					}
				}
			}
			this.ws.onerror = (ev) => {
				this.init(user, token);
			}
		}
	}

	pending = [];
	send(msg) {
		if (this.ws.readyState == 1)
			this.ws.send(msg + "\n");
		else this.pending.push(msg);
	}

	join(chanel) {
		this.send("JOIN #" + chanel.toLowerCase());
	}

	part(channel) {
		this.send("PART #" + chanel.toLowerCase());
	}

	sendMessage(channel, message) {
		this.send("PRIVMSG #" + channel.toLowerCase() + " :" + message);
	}
}
