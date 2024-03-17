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

class EmoteInfo {
	/** @type { string } */
	id = null;

	/** @type { string } */
	name = null;
	alias = null;

	/** @type { string } */
	urls = [];

	/** @type { string } */
	provider = null;

	/** @type { boolean } */
	overlay = false;

	getName() {
		return this.alias ?? this.name;
	}

	getImageURL(preferedSize = 3) {
		if (preferedSize in this.urls)
			return this.urls[preferedSize];

		var keys = Object.keys(this.urls);
		return this.urls[keys[keys.length - 1]];
	}
}

class Emote {
	/**
	 * @type { EmoteInfo | null}
	 */
	info;
	overlays = []
}

class Link {
	/**
	 * @type { String }
	 */
	text = ""
	/**
	 * @type { String }
	 */
	url = ""
}

class Mention {
	/**
	 * @type { String }
	 */
	username = ""
}

class CheerMote {
	name
	color
	value
	urls = []
}

// Make a GET request asyncronously and return a JSON
async function getJSON(url, opts = { timeout: 5000 }) {
	return await (await fetch(url, opts)).json();
}

async function getJSONCached(url, opts = { timeout: 5000 }) {
	var ch = await caches.open("hchat");

	var m = await ch.match(url);
	if (m) {
		return await m.json();
	}
	else {
		var r = await fetch(url, opts);
		ch.put(url, r.clone());
		return await r.json();
	}
}

class Badge {
	/** @type {string} */
	id = null
	/** @type {string} */
	title = null
	/** @type {string} */
	description = null

	/** @type {string} */
	provider = null
	/** @type {string} */
	backgroundStyle = null

	/** @type {string[string]} */
	imgs = {}
}

class HChat {
	globalEmotes = {}
	uniToEmoji = {}
	emojis = {}
	tlds = []

	SevenTV = new SevenTVAPI();
	Twitch = new TwitchAPI();
	BTTV = new BTTVAPI();
	FFZ = new FFZAPI();

	/**
	 * @type { Function[] }
	 */
	badgePredictates = [];

	globalCheerMotes = {}
	globalTwitchBadges = {}
	globalFFZBadgeOwners = {}
	globalFFZBadges = {}
	bttvBadges = {}

	async init() {
		// Run requests concurently
		var emojiShortCodes = {};
		var twitchBadges = {};
		var tldResult = "";
		var sevenTVGlobalSet = {}
		var BTTVGlobalEmotes = {}
		var BTTVBadges = {}
		var FFZGlobalEmotes = {}
		var FFZBadges = {}
		await Promise.allSettled(
			[
				(async () => { emojiShortCodes = await getJSON("/data/emoji_shortcodes.json"); })(),
				(async () => { twitchBadges = await this.Twitch.getGlobalBadges(); })(),
				(async () => { tldResult = (await (await fetch("/data/tlds.txt")).text()).split('\n'); })(),
				(async () => { sevenTVGlobalSet = await this.SevenTV.getGlobalEmoteSet(); })(),
				(async () => { BTTVGlobalEmotes = await this.BTTV.getGlobalEmotes(); })(),
				(async () => { BTTVBadges = await this.BTTV.getBadges(BTTVProvider.Twitch); })(),
				(async () => { FFZGlobalEmotes = await this.FFZ.getGlobalEmoteSet(); })(),
				(async () => { FFZBadges = await this.FFZ.getBadges(); })(),
			]
		);

		// Emojis
		{
			for (var ename in emojiShortCodes) {
				var oguni = emojiShortCodes[ename];
				var euni = oguni;

				{
					var cs = [...euni];
					if (cs.length <= 3 && cs.indexOf('\uFE0F') == 1)
						euni = [cs[0], ...cs.splice(2)].join('');
				}

				function toCodePoint(unicodeSurrogates, sep) {
					var
						r = [],
						c = 0,
						p = 0,
						i = 0;
					while (i < unicodeSurrogates.length) {
						c = unicodeSurrogates.charCodeAt(i++);
						if (p) {
							r.push((0x10000 + ((p - 0xD800) << 10) + (c - 0xDC00)).toString(16));
							p = 0;
						} else if (0xD800 <= c && c <= 0xDBFF) {
							p = c;
						} else {
							r.push(c.toString(16));
						}
					}
					return r.join(sep || '-');
				}

				var ei = new EmoteInfo();
				ei.id = ename;
				ei.name = ename;
				ei.alias = euni;
				ei.provider = "emoji";
				ei.urls =
				{
					4: "/assets/twemoji/" + toCodePoint(euni, '-') + ".svg"
				}

				this.uniToEmoji[euni] = ei;
				this.emojis[ename] = ei;
			}
		}

		// Twitch badge handling
		{
			this.globalTwitchBadges = parseTwitchBadges(twitchBadges);

			/**
			 * @param { Badge[] } list 
			 * @param { Message } msg
			 * @param { HChatChannel } hchannel
			 * @returns { Badge[] }
			 */
			function getTwitchBadges(list, msg, hchannel) {
				if (msg.tags.badges)
					for (b of msg.tags.badges.split(',')) {
						if (!b) continue;

						if (b in hchannel.channelTwitchBadges)
							list.push(hchannel.channelTwitchBadges[b]);
						else if (b in hchannel.hchat.globalTwitchBadges)
							list.push(hchannel.hchat.globalTwitchBadges[b]);
					}
				return list;
			}
			this.badgePredictates.push(getTwitchBadges);
		}

		// Generate TLDs
		{
			for (var i in tldResult) {
				var l = tldResult[i];
				if (l[0] == '#') continue;
				if (l.length == 0) continue;

				var s = l.split(' ');
				var t1 = s[0];
				var t2 = s[1];
				t2 = t2.substring(1, t2.length - 2);

				if (t1 == "zip" || t1 == "mov") continue;

				this.tlds.push(t1);
				if (t1 != t2)
					this.tlds.push(t2);
			}
			this.tlds.push("localhost");
		}

		// Global 7TV emotes
		{
			try {
				this.globalEmotes = { ...this.globalEmotes, ...this.processSevenTVEmotes(sevenTVGlobalSet.emotes) };
			}
			catch (e) {
				console.error("Failed to load global 7TV emotes");
				console.error(e);
			}

			// Here's where I would put the 7TV badge provider
			// IF THEY DOCUMENTED THEIR COSMETICS API
		}

		// Global BTTV emotes
		{
			try {
				this.globalEmotes = { ...this.globalEmotes, ...this.processBTTVEmotes(BTTVGlobalEmotes) };
			}
			catch (e) {
				console.error("Failed to load global BTTV emotes");
				console.error(e);
			}

			// Badges
			{
				for (var i in BTTVBadges) {
					var bo = BTTVBadges[i];
					var uid = Number(bo.providerId);

					var b = new Badge();
					b.provider = hchatEmoteProviderBTTV;
					b.id = bo.id;
					b.title = bo.badge.description;
					b.img = bo.badge.svg;

					this.bttvBadges[uid] = b;
				}

				/**
				 * @param { Badge[] } list 
				 * @param { Message } msg
				 * @param { HChatChannel } hchannel
				 * @returns { Badge[] }
				 */
				function getBTTVBadges(list, msg, hchannel) {
					var uid = Number(msg.tags["user-id"]);

					if (uid in hchannel.hchat.bttvBadges)
						list.push(hchannel.hchat.bttvBadges[uid]);

					return list;
				};
				this.badgePredictates.push(getBTTVBadges);
			}
		}

		// Global FFZ emotes
		{
			try {
				for (var k in FFZGlobalEmotes.sets) {
					this.globalEmotes = { ...this.globalEmotes, ...this.processFFZSet(FFZGlobalEmotes.sets[k].emoticons) };
				}
			}
			catch (e) {
				console.error("Failed to load global FFZ emotes");
				console.error(e);
			}

			// Global badges
			{
				for (var i in FFZBadges.badges) {
					var b = FFZBadges.badges[i];

					var bi = new Badge();
					bi.id = b.name;
					bi.title = b.title;
					bi.backgroundStyle = b.color;
					bi.img = b.urls["4"];
					bi._replaces = b.replaces;

					this.globalFFZBadges[b.id + ""] = bi;
				}

				this.globalFFZBadgeOwners = FFZBadges.users;

				/**
				 * @param { Badge[] } list 
				 * @param { Message } msg
				 * @param { HChatChannel } hchannel
				 * @returns { Badge[] }
				 */
				function getFFZBadges(list, msg, hchannel) {
					var uname = msg.username().toLowerCase();
					var uid = Number(msg.tags["user-id"]);

					var globalbot = false;
					for (var i in hchannel.hchat.globalFFZBadgeOwners) {
						if (i == 2 && hchannel.ffzBotBadgeOwnerIDs.indexOf(uid) != -1)
							list.push(hchannel.hchat.globalFFZBadges[2]);
						else if (hchannel.hchat.globalFFZBadgeOwners[i].indexOf(uname) != -1) {
							list.push(hchannel.hchat.globalFFZBadges[i]);
						}
					}

					if (hchannel.ffzVIPBadge) {
						for (var i in list) {
							if (list[i].id.startsWith("vip/") && list[i].provider == "twitch") {
								list[i] = hchannel.ffzVIPBadge;
								break;
							}
						}
					}
					if (hchannel.ffzModBadge) {
						for (var i in list) {
							if (list[i].id.startsWith("moderator/") && list[i].provider == "twitch") {
								list[i] = hchannel.ffzModBadge;
								break;
							}
						}
					}

					return list;
				};
				this.badgePredictates.push(getFFZBadges);
			}
		}
	}

	/**
	 * @param { Object } elist
	 * @returns { EmoteInfo[String] } 
	 */
	processSevenTVEmotes(elist) {
		var list = {};
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

			list[ee.alias ?? ee.name] = ee;
		}

		return list;
	}

	/**
	 * @param { Object } elist
	 * @returns { EmoteInfo[String] } 
	 */
	processBTTVEmotes(elist) {
		var list = {};
		for (var i = 0; i < elist.length; i++) {
			var e = elist[i];

			var ee = new EmoteInfo();
			ee.id = e.id;
			ee.urls =
			{
				3: "https://cdn.betterttv.net/emote/" + e.id + "/3x",
				2: "https://cdn.betterttv.net/emote/" + e.id + "/2x",
				1: "https://cdn.betterttv.net/emote/" + e.id + "/1x",
			};
			ee.overlay = ["SoSnowy", "IceCold", "SantaHat", "TopHat", "ReinDeer", "CandyCane", "cvMask", "cvHazmat"].indexOf(e.code) != -1;

			ee.name = e.code;
			ee.provider = hchatEmoteProviderBTTV;
			list[ee.name] = ee;
		}
		return list;
	}

	/**
	 * @param { Object } elist
	 * @returns { EmoteInfo[String] } 
	 */
	processFFZSet(elist) {
		var list = {};
		for (var i = 0; i < elist.length; i++) {
			var e = elist[i];

			var ee = new EmoteInfo();
			ee.id = e.id;
			ee.urls = e.urls;
			ee.name = e.name;
			ee.provider = hchatEmoteProviderFFZ;
			list[ee.name] = ee;
		}
		return list;
	}

	async getGlobalCheermotes() {
		this.globalCheerMotes = parseCheermotes(await this.Twitch.getCheermotes(), false);
	}
}

class HChatChannel {
	botList = [];
	channelEmotes = {};
	channelTwitchBadges = {};
	channelCheerMotes = {};
	/**
	 * @type { HChat }
	 */
	hchat;
	channelId = 0;

	ffzBotBadgeOwnerIDs = [];
	ffzVIPBadge;
	ffzModBadge;

	/**
	 * @param { HChat } hchat 
	 * @param { Number } channelId 
	 */
	constructor(hchat, channelId) {
		this.hchat = hchat;
		this.channelId = channelId;
	}

	async init() {
		// Run requests concurently
		var twitchBadges = {};
		var sevenTVUser = {};
		var bttvUser = {};
		var ffzRoom = {};
		await Promise.allSettled(
			[
				(async () => { twitchBadges = await this.hchat.Twitch.getChannelBadges(this.channelId); })(),
				(async () => { sevenTVUser = await this.hchat.SevenTV.getUserConnection(sevenTVPlatform.Twitch, this.channelId); })(),
				(async () => { bttvUser = await this.hchat.BTTV.getUser(BTTVProvider.Twitch, this.channelId); })(),
				(async () => { ffzRoom = await this.hchat.FFZ.getRoomTwitch(this.channelId); })(),

			]
		);

		this.channelTwitchBadges = parseTwitchBadges(twitchBadges);

		// 7TV channel emotes
		{
			try {
				this.channelEmotes = { ...this.channelEmotes, ...this.hchat.processSevenTVEmotes(sevenTVUser.emote_set.emotes) };
			}
			catch (e) {
				console.error("Failed to load 7TV emotes for channel " + this.channelId);
				console.error(e);
			}
		}

		// BTTV channel emotes
		{
			try {
				this.channelEmotes = { ...this.channelEmotes, ...this.hchat.processBTTVEmotes(bttvUser.channelEmotes) };
				this.botList = this.botList.concat(bttvUser.bots);
			}
			catch (e) {
				console.error("Failed to load BTTV channel " + this.channelId);
				console.error(e);
			}
		}

		// FFZ channel emotes and badges
		{
			try {
				for (var k in ffzRoom.sets) {
					this.channelEmotes = { ...this.channelEmotes, ...this.hchat.processFFZSet(ffzRoom.sets[k].emoticons) };
				}

				if (ffzRoom.room.vip_badge) {
					var vipb = new Badge();
					vipb.title = "VIP";
					vipb.id = "vip";
					vipb.provider = hchatEmoteProviderFFZ;
					vipb.img = ffzRoom.room.vip_badge["4"];
					vipb._replaces = "vip";

					this.ffzVIPBadge = vipb;
				}

				if (ffzRoom.room.mod_urls) {
					var modb = new Badge();
					modb.title = "Moderator";
					modb.id = "moderator";
					modb.provider = hchatEmoteProviderFFZ;
					modb.img = ffzRoom.room.mod_urls["4"];
					modb.backgroundStyle = "#34AE0A";
					modb._replaces = "moderator";

					this.ffzModBadge = modb;
				}

				this.ffzBotBadgeOwnerIDs = ffzRoom.room.user_badge_ids["2"] ?? [];
			}
			catch (e) {
				console.error("Failed to load FFZ emotes for channel " + this.channelId);
				console.error(e);
			}
		}
	}

	/**
	 * @param { Message } msg 
	 * @returns { Badge[] }
	 */
	getBadgesForMessage(msg) {
		var blist = [];
		for (var f of this.hchat.badgePredictates) {
			blist = f(blist, msg, this);
		}
		return blist;
	}

	emojiRegex = /(?:\ud83d\udc68\ud83c\udffb\u200d\u2764\ufe0f\u200d\ud83d\udc8b\u200d\ud83d\udc68\ud83c[\udffb-\udfff]|\ud83d\udc68\ud83c\udffc\u200d\u2764\ufe0f\u200d\ud83d\udc8b\u200d\ud83d\udc68\ud83c[\udffb-\udfff]|\ud83d\udc68\ud83c\udffd\u200d\u2764\ufe0f\u200d\ud83d\udc8b\u200d\ud83d\udc68\ud83c[\udffb-\udfff]|\ud83d\udc68\ud83c\udffe\u200d\u2764\ufe0f\u200d\ud83d\udc8b\u200d\ud83d\udc68\ud83c[\udffb-\udfff]|\ud83d\udc68\ud83c\udfff\u200d\u2764\ufe0f\u200d\ud83d\udc8b\u200d\ud83d\udc68\ud83c[\udffb-\udfff]|\ud83d\udc69\ud83c\udffb\u200d\u2764\ufe0f\u200d\ud83d\udc8b\u200d\ud83d\udc68\ud83c[\udffb-\udfff]|\ud83d\udc69\ud83c\udffb\u200d\u2764\ufe0f\u200d\ud83d\udc8b\u200d\ud83d\udc69\ud83c[\udffb-\udfff]|\ud83d\udc69\ud83c\udffc\u200d\u2764\ufe0f\u200d\ud83d\udc8b\u200d\ud83d\udc68\ud83c[\udffb-\udfff]|\ud83d\udc69\ud83c\udffc\u200d\u2764\ufe0f\u200d\ud83d\udc8b\u200d\ud83d\udc69\ud83c[\udffb-\udfff]|\ud83d\udc69\ud83c\udffd\u200d\u2764\ufe0f\u200d\ud83d\udc8b\u200d\ud83d\udc68\ud83c[\udffb-\udfff]|\ud83d\udc69\ud83c\udffd\u200d\u2764\ufe0f\u200d\ud83d\udc8b\u200d\ud83d\udc69\ud83c[\udffb-\udfff]|\ud83d\udc69\ud83c\udffe\u200d\u2764\ufe0f\u200d\ud83d\udc8b\u200d\ud83d\udc68\ud83c[\udffb-\udfff]|\ud83d\udc69\ud83c\udffe\u200d\u2764\ufe0f\u200d\ud83d\udc8b\u200d\ud83d\udc69\ud83c[\udffb-\udfff]|\ud83d\udc69\ud83c\udfff\u200d\u2764\ufe0f\u200d\ud83d\udc8b\u200d\ud83d\udc68\ud83c[\udffb-\udfff]|\ud83d\udc69\ud83c\udfff\u200d\u2764\ufe0f\u200d\ud83d\udc8b\u200d\ud83d\udc69\ud83c[\udffb-\udfff]|\ud83e\uddd1\ud83c\udffb\u200d\u2764\ufe0f\u200d\ud83d\udc8b\u200d\ud83e\uddd1\ud83c[\udffc-\udfff]|\ud83e\uddd1\ud83c\udffc\u200d\u2764\ufe0f\u200d\ud83d\udc8b\u200d\ud83e\uddd1\ud83c[\udffb\udffd-\udfff]|\ud83e\uddd1\ud83c\udffd\u200d\u2764\ufe0f\u200d\ud83d\udc8b\u200d\ud83e\uddd1\ud83c[\udffb\udffc\udffe\udfff]|\ud83e\uddd1\ud83c\udffe\u200d\u2764\ufe0f\u200d\ud83d\udc8b\u200d\ud83e\uddd1\ud83c[\udffb-\udffd\udfff]|\ud83e\uddd1\ud83c\udfff\u200d\u2764\ufe0f\u200d\ud83d\udc8b\u200d\ud83e\uddd1\ud83c[\udffb-\udffe]|\ud83d\udc68\ud83c\udffb\u200d\u2764\ufe0f\u200d\ud83d\udc68\ud83c[\udffb-\udfff]|\ud83d\udc68\ud83c\udffb\u200d\ud83e\udd1d\u200d\ud83d\udc68\ud83c[\udffc-\udfff]|\ud83d\udc68\ud83c\udffc\u200d\u2764\ufe0f\u200d\ud83d\udc68\ud83c[\udffb-\udfff]|\ud83d\udc68\ud83c\udffc\u200d\ud83e\udd1d\u200d\ud83d\udc68\ud83c[\udffb\udffd-\udfff]|\ud83d\udc68\ud83c\udffd\u200d\u2764\ufe0f\u200d\ud83d\udc68\ud83c[\udffb-\udfff]|\ud83d\udc68\ud83c\udffd\u200d\ud83e\udd1d\u200d\ud83d\udc68\ud83c[\udffb\udffc\udffe\udfff]|\ud83d\udc68\ud83c\udffe\u200d\u2764\ufe0f\u200d\ud83d\udc68\ud83c[\udffb-\udfff]|\ud83d\udc68\ud83c\udffe\u200d\ud83e\udd1d\u200d\ud83d\udc68\ud83c[\udffb-\udffd\udfff]|\ud83d\udc68\ud83c\udfff\u200d\u2764\ufe0f\u200d\ud83d\udc68\ud83c[\udffb-\udfff]|\ud83d\udc68\ud83c\udfff\u200d\ud83e\udd1d\u200d\ud83d\udc68\ud83c[\udffb-\udffe]|\ud83d\udc69\ud83c\udffb\u200d\u2764\ufe0f\u200d\ud83d\udc68\ud83c[\udffb-\udfff]|\ud83d\udc69\ud83c\udffb\u200d\u2764\ufe0f\u200d\ud83d\udc69\ud83c[\udffb-\udfff]|\ud83d\udc69\ud83c\udffb\u200d\ud83e\udd1d\u200d\ud83d\udc68\ud83c[\udffc-\udfff]|\ud83d\udc69\ud83c\udffb\u200d\ud83e\udd1d\u200d\ud83d\udc69\ud83c[\udffc-\udfff]|\ud83d\udc69\ud83c\udffc\u200d\u2764\ufe0f\u200d\ud83d\udc68\ud83c[\udffb-\udfff]|\ud83d\udc69\ud83c\udffc\u200d\u2764\ufe0f\u200d\ud83d\udc69\ud83c[\udffb-\udfff]|\ud83d\udc69\ud83c\udffc\u200d\ud83e\udd1d\u200d\ud83d\udc68\ud83c[\udffb\udffd-\udfff]|\ud83d\udc69\ud83c\udffc\u200d\ud83e\udd1d\u200d\ud83d\udc69\ud83c[\udffb\udffd-\udfff]|\ud83d\udc69\ud83c\udffd\u200d\u2764\ufe0f\u200d\ud83d\udc68\ud83c[\udffb-\udfff]|\ud83d\udc69\ud83c\udffd\u200d\u2764\ufe0f\u200d\ud83d\udc69\ud83c[\udffb-\udfff]|\ud83d\udc69\ud83c\udffd\u200d\ud83e\udd1d\u200d\ud83d\udc68\ud83c[\udffb\udffc\udffe\udfff]|\ud83d\udc69\ud83c\udffd\u200d\ud83e\udd1d\u200d\ud83d\udc69\ud83c[\udffb\udffc\udffe\udfff]|\ud83d\udc69\ud83c\udffe\u200d\u2764\ufe0f\u200d\ud83d\udc68\ud83c[\udffb-\udfff]|\ud83d\udc69\ud83c\udffe\u200d\u2764\ufe0f\u200d\ud83d\udc69\ud83c[\udffb-\udfff]|\ud83d\udc69\ud83c\udffe\u200d\ud83e\udd1d\u200d\ud83d\udc68\ud83c[\udffb-\udffd\udfff]|\ud83d\udc69\ud83c\udffe\u200d\ud83e\udd1d\u200d\ud83d\udc69\ud83c[\udffb-\udffd\udfff]|\ud83d\udc69\ud83c\udfff\u200d\u2764\ufe0f\u200d\ud83d\udc68\ud83c[\udffb-\udfff]|\ud83d\udc69\ud83c\udfff\u200d\u2764\ufe0f\u200d\ud83d\udc69\ud83c[\udffb-\udfff]|\ud83d\udc69\ud83c\udfff\u200d\ud83e\udd1d\u200d\ud83d\udc68\ud83c[\udffb-\udffe]|\ud83d\udc69\ud83c\udfff\u200d\ud83e\udd1d\u200d\ud83d\udc69\ud83c[\udffb-\udffe]|\ud83e\uddd1\ud83c\udffb\u200d\u2764\ufe0f\u200d\ud83e\uddd1\ud83c[\udffc-\udfff]|\ud83e\uddd1\ud83c\udffb\u200d\ud83e\udd1d\u200d\ud83e\uddd1\ud83c[\udffb-\udfff]|\ud83e\uddd1\ud83c\udffc\u200d\u2764\ufe0f\u200d\ud83e\uddd1\ud83c[\udffb\udffd-\udfff]|\ud83e\uddd1\ud83c\udffc\u200d\ud83e\udd1d\u200d\ud83e\uddd1\ud83c[\udffb-\udfff]|\ud83e\uddd1\ud83c\udffd\u200d\u2764\ufe0f\u200d\ud83e\uddd1\ud83c[\udffb\udffc\udffe\udfff]|\ud83e\uddd1\ud83c\udffd\u200d\ud83e\udd1d\u200d\ud83e\uddd1\ud83c[\udffb-\udfff]|\ud83e\uddd1\ud83c\udffe\u200d\u2764\ufe0f\u200d\ud83e\uddd1\ud83c[\udffb-\udffd\udfff]|\ud83e\uddd1\ud83c\udffe\u200d\ud83e\udd1d\u200d\ud83e\uddd1\ud83c[\udffb-\udfff]|\ud83e\uddd1\ud83c\udfff\u200d\u2764\ufe0f\u200d\ud83e\uddd1\ud83c[\udffb-\udffe]|\ud83e\uddd1\ud83c\udfff\u200d\ud83e\udd1d\u200d\ud83e\uddd1\ud83c[\udffb-\udfff]|\ud83d\udc68\u200d\u2764\ufe0f\u200d\ud83d\udc8b\u200d\ud83d\udc68|\ud83d\udc69\u200d\u2764\ufe0f\u200d\ud83d\udc8b\u200d\ud83d[\udc68\udc69]|\ud83e\udef1\ud83c\udffb\u200d\ud83e\udef2\ud83c[\udffc-\udfff]|\ud83e\udef1\ud83c\udffc\u200d\ud83e\udef2\ud83c[\udffb\udffd-\udfff]|\ud83e\udef1\ud83c\udffd\u200d\ud83e\udef2\ud83c[\udffb\udffc\udffe\udfff]|\ud83e\udef1\ud83c\udffe\u200d\ud83e\udef2\ud83c[\udffb-\udffd\udfff]|\ud83e\udef1\ud83c\udfff\u200d\ud83e\udef2\ud83c[\udffb-\udffe]|\ud83d\udc68\u200d\u2764\ufe0f\u200d\ud83d\udc68|\ud83d\udc69\u200d\u2764\ufe0f\u200d\ud83d[\udc68\udc69]|\ud83e\uddd1\u200d\ud83e\udd1d\u200d\ud83e\uddd1|\ud83d\udc6b\ud83c[\udffb-\udfff]|\ud83d\udc6c\ud83c[\udffb-\udfff]|\ud83d\udc6d\ud83c[\udffb-\udfff]|\ud83d\udc8f\ud83c[\udffb-\udfff]|\ud83d\udc91\ud83c[\udffb-\udfff]|\ud83e\udd1d\ud83c[\udffb-\udfff]|\ud83d[\udc6b-\udc6d\udc8f\udc91]|\ud83e\udd1d)|(?:\ud83d[\udc68\udc69]|\ud83e\uddd1)(?:\ud83c[\udffb-\udfff])?\u200d(?:\u2695\ufe0f|\u2696\ufe0f|\u2708\ufe0f|\ud83c[\udf3e\udf73\udf7c\udf84\udf93\udfa4\udfa8\udfeb\udfed]|\ud83d[\udcbb\udcbc\udd27\udd2c\ude80\ude92]|\ud83e[\uddaf-\uddb3\uddbc\uddbd])|(?:\ud83c[\udfcb\udfcc]|\ud83d[\udd74\udd75]|\u26f9)((?:\ud83c[\udffb-\udfff]|\ufe0f)\u200d[\u2640\u2642]\ufe0f)|(?:\ud83c[\udfc3\udfc4\udfca]|\ud83d[\udc6e\udc70\udc71\udc73\udc77\udc81\udc82\udc86\udc87\ude45-\ude47\ude4b\ude4d\ude4e\udea3\udeb4-\udeb6]|\ud83e[\udd26\udd35\udd37-\udd39\udd3d\udd3e\uddb8\uddb9\uddcd-\uddcf\uddd4\uddd6-\udddd])(?:\ud83c[\udffb-\udfff])?\u200d[\u2640\u2642]\ufe0f|(?:\ud83d\udc68\u200d\ud83d\udc68\u200d\ud83d\udc66\u200d\ud83d\udc66|\ud83d\udc68\u200d\ud83d\udc68\u200d\ud83d\udc67\u200d\ud83d[\udc66\udc67]|\ud83d\udc68\u200d\ud83d\udc69\u200d\ud83d\udc66\u200d\ud83d\udc66|\ud83d\udc68\u200d\ud83d\udc69\u200d\ud83d\udc67\u200d\ud83d[\udc66\udc67]|\ud83d\udc69\u200d\ud83d\udc69\u200d\ud83d\udc66\u200d\ud83d\udc66|\ud83d\udc69\u200d\ud83d\udc69\u200d\ud83d\udc67\u200d\ud83d[\udc66\udc67]|\ud83d\udc68\u200d\ud83d\udc66\u200d\ud83d\udc66|\ud83d\udc68\u200d\ud83d\udc67\u200d\ud83d[\udc66\udc67]|\ud83d\udc68\u200d\ud83d\udc68\u200d\ud83d[\udc66\udc67]|\ud83d\udc68\u200d\ud83d\udc69\u200d\ud83d[\udc66\udc67]|\ud83d\udc69\u200d\ud83d\udc66\u200d\ud83d\udc66|\ud83d\udc69\u200d\ud83d\udc67\u200d\ud83d[\udc66\udc67]|\ud83d\udc69\u200d\ud83d\udc69\u200d\ud83d[\udc66\udc67]|\ud83c\udff3\ufe0f\u200d\u26a7\ufe0f|\ud83c\udff3\ufe0f\u200d\ud83c\udf08|\ud83d\ude36\u200d\ud83c\udf2b\ufe0f|\u2764\ufe0f\u200d\ud83d\udd25|\u2764\ufe0f\u200d\ud83e\ude79|\ud83c\udff4\u200d\u2620\ufe0f|\ud83d\udc15\u200d\ud83e\uddba|\ud83d\udc3b\u200d\u2744\ufe0f|\ud83d\udc41\u200d\ud83d\udde8|\ud83d\udc68\u200d\ud83d[\udc66\udc67]|\ud83d\udc69\u200d\ud83d[\udc66\udc67]|\ud83d\udc6f\u200d\u2640\ufe0f|\ud83d\udc6f\u200d\u2642\ufe0f|\ud83d\ude2e\u200d\ud83d\udca8|\ud83d\ude35\u200d\ud83d\udcab|\ud83e\udd3c\u200d\u2640\ufe0f|\ud83e\udd3c\u200d\u2642\ufe0f|\ud83e\uddde\u200d\u2640\ufe0f|\ud83e\uddde\u200d\u2642\ufe0f|\ud83e\udddf\u200d\u2640\ufe0f|\ud83e\udddf\u200d\u2642\ufe0f|\ud83d\udc08\u200d\u2b1b)|[#*0-9]\ufe0f?\u20e3|(?:[©®\u2122\u265f]\ufe0f)|(?:\ud83c[\udc04\udd70\udd71\udd7e\udd7f\ude02\ude1a\ude2f\ude37\udf21\udf24-\udf2c\udf36\udf7d\udf96\udf97\udf99-\udf9b\udf9e\udf9f\udfcd\udfce\udfd4-\udfdf\udff3\udff5\udff7]|\ud83d[\udc3f\udc41\udcfd\udd49\udd4a\udd6f\udd70\udd73\udd76-\udd79\udd87\udd8a-\udd8d\udda5\udda8\uddb1\uddb2\uddbc\uddc2-\uddc4\uddd1-\uddd3\udddc-\uddde\udde1\udde3\udde8\uddef\uddf3\uddfa\udecb\udecd-\udecf\udee0-\udee5\udee9\udef0\udef3]|[\u203c\u2049\u2139\u2194-\u2199\u21a9\u21aa\u231a\u231b\u2328\u23cf\u23ed-\u23ef\u23f1\u23f2\u23f8-\u23fa\u24c2\u25aa\u25ab\u25b6\u25c0\u25fb-\u25fe\u2600-\u2604\u260e\u2611\u2614\u2615\u2618\u2620\u2622\u2623\u2626\u262a\u262e\u262f\u2638-\u263a\u2640\u2642\u2648-\u2653\u2660\u2663\u2665\u2666\u2668\u267b\u267f\u2692-\u2697\u2699\u269b\u269c\u26a0\u26a1\u26a7\u26aa\u26ab\u26b0\u26b1\u26bd\u26be\u26c4\u26c5\u26c8\u26cf\u26d1\u26d3\u26d4\u26e9\u26ea\u26f0-\u26f5\u26f8\u26fa\u26fd\u2702\u2708\u2709\u270f\u2712\u2714\u2716\u271d\u2721\u2733\u2734\u2744\u2747\u2757\u2763\u2764\u27a1\u2934\u2935\u2b05-\u2b07\u2b1b\u2b1c\u2b50\u2b55\u3030\u303d\u3297\u3299])(?:\ufe0f|(?!\ufe0e))|(?:(?:\ud83c[\udfcb\udfcc]|\ud83d[\udd74\udd75\udd90]|[\u261d\u26f7\u26f9\u270c\u270d])(?:\ufe0f|(?!\ufe0e))|(?:\ud83c[\udf85\udfc2-\udfc4\udfc7\udfca]|\ud83d[\udc42\udc43\udc46-\udc50\udc66-\udc69\udc6e\udc70-\udc78\udc7c\udc81-\udc83\udc85-\udc87\udcaa\udd7a\udd95\udd96\ude45-\ude47\ude4b-\ude4f\udea3\udeb4-\udeb6\udec0\udecc]|\ud83e[\udd0c\udd0f\udd18-\udd1c\udd1e\udd1f\udd26\udd30-\udd39\udd3d\udd3e\udd77\uddb5\uddb6\uddb8\uddb9\uddbb\uddcd-\uddcf\uddd1-\udddd\udec3-\udec5\udef0-\udef6]|[\u270a\u270b]))(?:\ud83c[\udffb-\udfff])?|(?:\ud83c\udff4\udb40\udc67\udb40\udc62\udb40\udc65\udb40\udc6e\udb40\udc67\udb40\udc7f|\ud83c\udff4\udb40\udc67\udb40\udc62\udb40\udc73\udb40\udc63\udb40\udc74\udb40\udc7f|\ud83c\udff4\udb40\udc67\udb40\udc62\udb40\udc77\udb40\udc6c\udb40\udc73\udb40\udc7f|\ud83c\udde6\ud83c[\udde8-\uddec\uddee\uddf1\uddf2\uddf4\uddf6-\uddfa\uddfc\uddfd\uddff]|\ud83c\udde7\ud83c[\udde6\udde7\udde9-\uddef\uddf1-\uddf4\uddf6-\uddf9\uddfb\uddfc\uddfe\uddff]|\ud83c\udde8\ud83c[\udde6\udde8\udde9\uddeb-\uddee\uddf0-\uddf5\uddf7\uddfa-\uddff]|\ud83c\udde9\ud83c[\uddea\uddec\uddef\uddf0\uddf2\uddf4\uddff]|\ud83c\uddea\ud83c[\udde6\udde8\uddea\uddec\udded\uddf7-\uddfa]|\ud83c\uddeb\ud83c[\uddee-\uddf0\uddf2\uddf4\uddf7]|\ud83c\uddec\ud83c[\udde6\udde7\udde9-\uddee\uddf1-\uddf3\uddf5-\uddfa\uddfc\uddfe]|\ud83c\udded\ud83c[\uddf0\uddf2\uddf3\uddf7\uddf9\uddfa]|\ud83c\uddee\ud83c[\udde8-\uddea\uddf1-\uddf4\uddf6-\uddf9]|\ud83c\uddef\ud83c[\uddea\uddf2\uddf4\uddf5]|\ud83c\uddf0\ud83c[\uddea\uddec-\uddee\uddf2\uddf3\uddf5\uddf7\uddfc\uddfe\uddff]|\ud83c\uddf1\ud83c[\udde6-\udde8\uddee\uddf0\uddf7-\uddfb\uddfe]|\ud83c\uddf2\ud83c[\udde6\udde8-\udded\uddf0-\uddff]|\ud83c\uddf3\ud83c[\udde6\udde8\uddea-\uddec\uddee\uddf1\uddf4\uddf5\uddf7\uddfa\uddff]|\ud83c\uddf4\ud83c\uddf2|\ud83c\uddf5\ud83c[\udde6\uddea-\udded\uddf0-\uddf3\uddf7-\uddf9\uddfc\uddfe]|\ud83c\uddf6\ud83c\udde6|\ud83c\uddf7\ud83c[\uddea\uddf4\uddf8\uddfa\uddfc]|\ud83c\uddf8\ud83c[\udde6-\uddea\uddec-\uddf4\uddf7-\uddf9\uddfb\uddfd-\uddff]|\ud83c\uddf9\ud83c[\udde6\udde8\udde9\uddeb-\udded\uddef-\uddf4\uddf7\uddf9\uddfb\uddfc\uddff]|\ud83c\uddfa\ud83c[\udde6\uddec\uddf2\uddf3\uddf8\uddfe\uddff]|\ud83c\uddfb\ud83c[\udde6\udde8\uddea\uddec\uddee\uddf3\uddfa]|\ud83c\uddfc\ud83c[\uddeb\uddf8]|\ud83c\uddfd\ud83c\uddf0|\ud83c\uddfe\ud83c[\uddea\uddf9]|\ud83c\uddff\ud83c[\udde6\uddf2\uddfc]|\ud83c[\udccf\udd8e\udd91-\udd9a\udde6-\uddff\ude01\ude32-\ude36\ude38-\ude3a\ude50\ude51\udf00-\udf20\udf2d-\udf35\udf37-\udf7c\udf7e-\udf84\udf86-\udf93\udfa0-\udfc1\udfc5\udfc6\udfc8\udfc9\udfcf-\udfd3\udfe0-\udff0\udff4\udff8-\udfff]|\ud83d[\udc00-\udc3e\udc40\udc44\udc45\udc51-\udc65\udc6a\udc6f\udc79-\udc7b\udc7d-\udc80\udc84\udc88-\udc8e\udc90\udc92-\udca9\udcab-\udcfc\udcff-\udd3d\udd4b-\udd4e\udd50-\udd67\udda4\uddfb-\ude44\ude48-\ude4a\ude80-\udea2\udea4-\udeb3\udeb7-\udebf\udec1-\udec5\uded0-\uded2\uded5-\uded7\udedd-\udedf\udeeb\udeec\udef4-\udefc\udfe0-\udfeb\udff0]|\ud83e[\udd0d\udd0e\udd10-\udd17\udd20-\udd25\udd27-\udd2f\udd3a\udd3c\udd3f-\udd45\udd47-\udd76\udd78-\uddb4\uddb7\uddba\uddbc-\uddcc\uddd0\uddde-\uddff\ude70-\ude74\ude78-\ude7c\ude80-\ude86\ude90-\udeac\udeb0-\udeba\udec0-\udec2\uded0-\uded9\udee0-\udee7]|[\u23e9-\u23ec\u23f0\u23f3\u267e\u26ce\u2705\u2728\u274c\u274e\u2753-\u2755\u2795-\u2797\u27b0\u27bf\ue50a])|\ufe0f/g;

	/**
	 * @param { String } text 
	 * @returns { String[] }
	 */
	parseEmojis(text) {
		var arr = [];
		var rres = [...text.matchAll(this.emojiRegex)];

		if (rres.length == 0) return [text];

		var end = 0;
		for (var i in rres) {
			var r = rres[i];
			var pre = text.substring(end, r.index);
			if (pre.length && pre != '') {
				arr.push(pre);
			}

			end = r.index + r[0].length;
			var euni = text.substring(r.index, end);

			var cs = [...euni];
			if (cs.length <= 3 && cs.indexOf('\uFE0F') == 1)
				euni = [cs[0], ...cs.splice(2)].join('');

			arr.push(euni);
		}
		if (end < text.length) {
			var e = text.substring(end, text.length);
			arr.push(e);
		}

		return arr;
	}

	urlRegex = /^((?<protocol>[a-zA-Z]+):\/\/)?(?<domain>([a-zA-Z0-9.\\-]+)|(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}))(:(?<port>\d{1,5}))?(?<route>\/(\S*)?)?$/;
	urlSubdomainCharacters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-";
	allowedURLProtocols = ["http", "https", "steam"];
	mentionRegex = /^@[a-zA-Z0-9_]{4,25}/;

	/**
	 * @param { String } input 
	 * @param { Message } msg 
	 * @returns { String[] | Emote[] | Link[] | Mention[] | CheerMote[] }
	 */
	parseMessageComponents(input, msg,) {
		var twitchEmotes = {};

		if (msg.tags && msg.tags.emotes) {
			var twitchEmotesStr = msg.tags.emotes;
			var twitchEmotesSplit = twitchEmotesStr.split('/');
			for (let i = 0; twitchEmotesSplit.length; i++) {
				var s = twitchEmotesSplit[i];
				if (s === undefined || s == '') break;

				var colonPos = s.indexOf(':');
				var dashPos = s.indexOf('-', colonPos + 1);

				var start = Number.parseInt(s.substring(colonPos + 1, dashPos));
				var end = Number.parseInt(s.substring(dashPos + 1, s.length));
				var id = s.substring(0, colonPos);

				// Workaround around Twitch using UTF-16
				var name = [...msg.content].slice(start, end + 1).join('');

				var e = new EmoteInfo();
				e.id = id;
				e.name = name;
				e.urls =
				{
					1: "https://static-cdn.jtvnw.net/emoticons/v2/" + id + "/default/dark/1.0",
					2: "https://static-cdn.jtvnw.net/emoticons/v2/" + id + "/default/dark/2.0",
					3: "https://static-cdn.jtvnw.net/emoticons/v2/" + id + "/default/dark/3.0",
					4: "https://static-cdn.jtvnw.net/emoticons/v2/" + id + "/default/dark/4.0",
				}
				e.provider = "twitch";
				twitchEmotes[name] = e;
			}
		}

		var comps = [];
		for (s of input.split(/(\s+)/)) {
			var link = this.parseLink(s);
			if (link) {
				var l = new Link();
				l.text = s;
				l.url = s;
				if (!link.protocol)
					l.url = "https://" + l.url;
				comps.push(l);
				continue;
			}

			if (s[0] == '@') {
				var match = s.match(this.mentionRegex);
				if (match) {
					var mention = match[0];

					var mentionComp = new Mention();
					mentionComp.username = mention.substring(1, mention.length);

					comps.push(mentionComp);

					var rest = s.substring(mention.length, s.length);
					comps = comps.concat(this.parseMessageComponents(rest, msg));

					continue;
				}
			}

			var es = this.parseEmojis(s);
			if (es.length > 1) {
				for (var i in es) {
					var e = es[i];
					comps = comps.concat(this.parseMessageComponents(e, msg));
				}
				continue;
			}

			if (msg.tags.bits) {
				var ce = this.channelCheerMotes[s.toLowerCase()] ?? this.hchat.globalCheerMotes[s.toLowerCase()];
				if (ce && msg.tags.bits >= ce.value) {
					comps.push(ce);
					continue;
				}
			}

			var emote = this.hchat.uniToEmoji[s] ?? this.channelEmotes[s] ?? this.hchat.globalEmotes[s] ?? twitchEmotes[s];
			if (emote) {
				var e = new Emote();
				e.info = emote;
				comps.push(e);

				continue;
			}

			comps.push(s);
		}
		return comps;
	}

	/**
	 * @param { String[] | Emote[] | Link[] | Mention[] | CheerMote[] } comps 
	 * @returns { String[] | Emote[] | Link[] | Mention[] | CheerMote[] }
	 */
	foldMessageComponents(comps) {
		// Overlay emotes
		{
			var folded = [];
			for (var i in comps) {
				var c = comps[i];

				if (c instanceof Emote) {
					if (c.info.overlay) {
						let lastEmoteId = folded.length - 1;
						let lastEmote = folded[lastEmoteId];

						if (lastEmote == " ") {
							lastEmoteId -= 1;
							lastEmote = folded[lastEmoteId];
						}

						if (lastEmote instanceof Emote) {
							lastEmote.overlays.push(c);

							if (folded[lastEmoteId + 1] == " ") {
								folded = folded.slice(0, -1);
							}

							continue;
						}
					}
				}

				folded.push(c);
			}
			comps = folded;
		}

		return comps;
	}

	async getChannelCheermotes() {
		this.channelCheerMotes = parseCheermotes(await this.hchat.Twitch.getCheermotes(this.channelId), true);
	}

	parseLink(text) {
		var urlMatch = text.match(this.urlRegex);
		if (urlMatch) {
			var protocol = urlMatch.groups.protocol;
			var domain = urlMatch.groups.domain;
			var port = urlMatch.groups.port;
			var route = urlMatch.groups.route;

			if (protocol != undefined) {
				if (this.allowedURLProtocols.indexOf(protocol.toLowerCase()) == -1) return undefined;
			}
			if (port != undefined) {
				var portn = Number(port);
				if (portn < 0 && portn <= 65535) return undefined;
			}

			if (this.isDomainValid(domain)) {
				return {
					protocol: protocol,
					domain: domain,
					port: port,
					route: route
				};
			}
		}

		return undefined;
	}

	isDomainValid(d) {
		if (this.isIP(d))
			return true;

		var lastpos = d.lastIndexOf('.');
		var pos = d.indexOf('.');


		// No subdomains, assuming TLD only domain
		if (pos == -1) {
			return d.toLowerCase() == "localhost";
		}

		var doms = d.split('.');
		for (let i = 0; i < doms.length - 1; i++) {
			// Two dots in a row
			if (doms[i] == '') return false;

			for (let j = 0; j < doms[i].length - 1; j++) {
				if (this.urlSubdomainCharacters.indexOf(doms[i][j]) == -1)
					return false;
			}
		}

		var tld = doms[doms.length - 1];
		return this.isTLD(tld);
	}

	ipRegex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
	isIP(d) {
		var m = d.match(this.ipRegex);
		if (m) {
			for (let i = 1; i < 5; i++) {
				var n = Number(m[i]);
				if (n < 0 && n <= 255) return false;
			}
			return true;
		}

		return false;
	}

	isTLD(tld) {
		return this.hchat.tlds.indexOf(tld.toLowerCase()) != -1;
	}
}