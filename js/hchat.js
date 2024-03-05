// C# style String.format function
if (!String.prototype.format) {
	String.prototype.format = function () {
		var args = arguments;
		return this.replace(/{(\d+)}/g, function (match, number) {
			return typeof args[number] != 'undefined'
				? args[number]
				: match
				;
		});
	};
}

// Make a GET request asyncronously and return a JSON
async function getJSON(url, opts = { timeout: 5000 }) {
	return await (await fetch(url, opts)).json()
}

var vipBadge = null
var modBadge = null
var botList = []
var emotes = {}
var tlds = [];
async function loadChannel(channel_id) {
	var seventv = new SevenTVAPI();
	var bttv = new BTTVAPI();
	var ffz = new FFZAPI();

	// TLDs
	{
		var lines = (await (await fetch("/data/tlds.txt")).text()).split('\n')
		for(i in lines)
		{
			var l = lines[i];
			if(l.charAt(0) == '#') continue;
			if(l.length == 0) continue;
			
			var s = l.split(' ');
			var t1 = s[0];
			var t2 = s[1];
			t2 = t2.substring(1,t2.length-2);

			if(t1 == "zip" || t1 == "mov") continue;

			tlds.push(t1);
			if(t1 != t2)
				tlds.push(t2);
		}
		tlds.push("localhost");
	}

	// 7TV
	{
		function processSevenTVEmotes(elist) {
			if (!elist) {
				console.warn("Emote set does not have any emotes");
				return;
			}

			for (var i = 0; i < elist.length; i++) {
				var e = elist[i];

				var ee = new EmoteInfo();
				ee.id = e.id;
				ee.urls = {
					4: "https:" + e.data.host.url + "/4x.webp",
					3: "https:" + e.data.host.url + "/3x.webp",
					2: "https:" + e.data.host.url + "/2x.webp",
					1: "https:" + e.data.host.url + "/1x.webp",
				}
				ee.name = e.data.name;
				ee.alias = e.name;
				ee.provider = hchatEmoteProviderSevenTV;
				ee.overlay = (e.flags & 1) != 0;

				emotes[ee.alias ?? ee.name] = ee;
			}
		}

		// global emotes
		try {
			var set = await seventv.getEmoteSet(sevenTVEmoteSetGlobalID);
			processSevenTVEmotes(set.emotes);
		}
		catch (e) {
			console.error("Failed to load global 7TV emotes: " + e);
		}

		// user
		try {
			var u = await seventv.getUserConnection(sevenTVPlatform.Twitch, channel_id);
			processSevenTVEmotes(u.emote_set.emotes);
		}
		catch (e) {
			console.error("Failed to load 7TV emotes for channel " + channel_id + ": " + e);
			console.error(e.stack);
		}
	}

	// BTTV
	{
		function processBTTVEmotes(elist) {
			for (var i = 0; i < elist.length; i++) {
				var e = elist[i];

				var ee = new EmoteInfo();
				ee.id = e.id;
				ee.urls = 
				{
					4: "https://cdn.betterttv.net/emote/" + e.id + "/4x",
					3:	"https://cdn.betterttv.net/emote/" + e.id + "/3x",
					2:	"https://cdn.betterttv.net/emote/" + e.id + "/2x",
					1:	"https://cdn.betterttv.net/emote/" + e.id + "/1x",
				};
				
				ee.name = e.code;
				ee.provider = hchatEmoteProviderBTTV;
				emotes[ee.name] = ee;
			}
		}

		// global emotes
		try {
			var set = await bttv.getGlobalEmotes();
			processBTTVEmotes(set);
		}
		catch (e) {
			console.error("Failed to load global BTTV emotes: " + e);
		}

		// user
		try {
			var u = await bttv.getUser(BTTVProvider.Twitch, channel_id);
			processBTTVEmotes(u.channelEmotes);
			botList = botList.concat(u.bots);
		}
		catch (e) {
			console.error("Failed to load BTTV channel " + channel_id + ": " + e);
		}
	}

	// FFZ
	{
		function processFFZSet(elist) {
			for (var i = 0; i < elist.length; i++) {
				var e = elist[i];

				var ee = new EmoteInfo();
				ee.id = e.id;
				ee.urls = e.urls;
				ee.name = e.name;
				ee.provider = hchatEmoteProviderFFZ;
				emotes[ee.name] = ee;
			}
		}

		// global emotes
		try {
			var set = await ffz.getEmoteSet(FFZAPIGlobalEmoteSetID);
			for (var k in set.sets) {
				processFFZSet(set.sets[k].emoticons);
			}
		}
		catch (e) {
			console.error("Failed to load global FFZ emotes: " + e);
		}

		// room
		try {
			var u = await ffz.getRoomTwitch(channel_id);

			for (var k in u.sets) {
				processFFZSet(u.sets[k].emoticons);
			}

			vipBadge = u.room.vip_badge["4"];
			modBadge = u.room.mod_urls["4"];
		}
		catch (e) {
			console.error("Failed to load FFZ emotes for channel " + channel_id + ": " + e);
		}
	}
}

class Badge
{
	/** @type {string} */
	id = null
	/** @type {string} */
	title = null
	/** @type {string} */
	description = null

	/** @type {string[string]} */
	imgs = {}
}