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
	
	/** @type { string } */
	// The alt text of the emote/text to be inserted into input box
	text = null;

	/** @type { string } */
	urls = [];

	/** @type { string } */
	provider = null;

	/** @type { boolean } */
	overlay = false;

	/** @type { Function | undefined } */
	modifierFunction = undefined;

	/** @type { string } */
	infoUrl = null;

	widthRatio = 1;

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

	constructor(inf = undefined) {
		if (inf)
			this.info = inf
	}
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
		const date = new Date(m.headers.get('date'))
		if (Date.now() > date.getTime() + 1000 * 60 * 60 * 24 * 3) {
			ch.delete(url);
			return await getJSONCached(url, opts);
		}
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
	twitchEmoteOverrides = new Map();
	twitchBadgeOverrides = new Map();

	globalEmotes = new Map()
	uniToEmoji = new Map()
	emojis = new Map()
	tlds = []

	SevenTV = new SevenTVAPI();
	Twitch = new TwitchAPI();
	BTTV = new BTTVAPI();
	FFZ = new FFZAPI();

	/**
	 * @type { Function[] }
	 */
	badgePredictates = [];

	globalCheerMotes = new Map()
	globalTwitchBadges = new Map()
	globalFFZBadgeOwners = {}
	globalFFZBadges = new Map()
	bttvBadges = new Map()

	sevenTVEventClient = new SevenTVEventAPI();
	channels = [];

	async init() {
		// Run requests concurently
		var emojiData = {};
		var twitchBadges = {};
		var tldResult = "";
		var sevenTVGlobalSet = {}
		var BTTVGlobalEmotes = {}
		var BTTVBadges = {}
		var FFZGlobalEmotes = {}
		var FFZBadges = {}
		await Promise.allSettled(
			[
				(async () => { emojiData = await getJSON("/data/emojis.json"); })(),
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
			var preferedSet = settings.emojiSet;
			for (var unified in emojiData) {
				var e = emojiData[unified];
				var shorts = e["shorts"];

				var uni = "";
				for (var hex of unified.split("-"))
					uni += String.fromCodePoint(parseInt(hex, 16));

				var ei = new EmoteInfo();
				ei.id = uni;
				ei.infoUrl = "https://emojipedia.org/" + uni;
				ei.text = uni;
				ei.name = shorts[0];
				ei.shorts = shorts;
				ei.provider = "emoji";

				var selectedSet = preferedSet;
				if (!e[selectedSet]) {
					if (!e.twemoji)
						selectedSet = "google";
					else
						selectedSet = "twemoji";
				}
				ei.urls =
				{
					4: "/assets/emotes/" + selectedSet + "/" + unified.toLowerCase() + ".png"
				};

				this.uniToEmoji.set(uni, ei);
				this.emojis.set(ei.name, ei);
			}
		}

		// Twitch badge handling
		{
			this.globalTwitchBadges = parseTwitchBadges(twitchBadges, this.twitchBadgeOverrides);

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

						if (hchannel.channelTwitchBadges.has(b))
							list.push(hchannel.channelTwitchBadges.get(b));
						else if (hchannel.hchat.globalTwitchBadges.has(b))
							list.push(hchannel.hchat.globalTwitchBadges.get(b));
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
				t2 = t2.substring(1, t2.length - 1);

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
				this.globalEmotes = new Map([...this.globalEmotes, ...this.processSevenTVEmotes(sevenTVGlobalSet.emotes)]);
			}
			catch (e) {
				console.warn("Failed to load global 7TV emotes");
				console.warn(e);
			}

			this.sevenTVEventClient.onEvent = e => {
				var type = e.type;
				var body = e.body;

				switch (type) {
					case "emote_set.update":
						var byWho = {
							name: body.actor.display_name ?? body.actor.username,
							id: Number(body.actor.connections.find(c => c.platform == "TWITCH").id)
						}
						var setId = body.id;

						var channel = this.channels.find(c => c.sevenTVEmoteSetID == setId);
						if (!channel) return;

						if (body.pushed) {
							for (var eo of body.pushed) {
								var ei = this.processSevenTVEmote(eo.value);
								channel.onEmoteAdded(byWho, ei);
								channel.channelEmotes.set(ei.name, ei);
							}
						}

						if (body.pulled) {
							for (var eo of body.pulled) {
								var id = eo.old_value.id;

								var e = channel.channelEmotes.entries()
									.find(e => e[1].provider == hchatEmoteProviderSevenTV && e[1].id == id);
								var ei = e[1];
								channel.onEmoteRemoved(byWho, ei);
								channel.channelEmotes.delete(e[0]);
							}
						}
						break;
					default:
						break;
				}
			};
		}

		// Global BTTV emotes
		{
			try {
				this.globalEmotes = new Map([...this.globalEmotes, ...this.processBTTVEmotes(BTTVGlobalEmotes)]);
			}
			catch (e) {
				console.warn("Failed to load global BTTV emotes");
				console.warn(e);
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

					this.bttvBadges.set(uid, b);
				}

				/**
				 * @param { Badge[] } list 
				 * @param { Message } msg
				 * @param { HChatChannel } hchannel
				 * @returns { Badge[] }
				 */
				function getBTTVBadges(list, msg, hchannel) {
					var uid = Number(msg.tags["user-id"]);

					if (hchannel.hchat.bttvBadges.has(uid))
						list.push(hchannel.hchat.bttvBadges.get(uid));

					return list;
				};
				this.badgePredictates.push(getBTTVBadges);
			}
		}

		// Global FFZ emotes
		{
			try {
				for (var k in FFZGlobalEmotes.sets) {
					this.globalEmotes = new Map([...this.globalEmotes, ...this.processFFZSet(FFZGlobalEmotes.sets[k].emoticons)]);
				}
			}
			catch (e) {
				console.warn("Failed to load global FFZ emotes");
				console.warn(e);
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

					this.globalFFZBadges.set(b.id + "", bi);
				}

				this.globalFFZBadgeOwners = FFZBadges.users;

				/**
				 * @param { Badge[] } list 
				 * @param { Message } msg
				 * @param { HChatChannel } hchannel
				 * @returns { Badge[] }
				 */
				function getFFZBadges(list, msg, hchannel) {
					var uid = Number(msg.tags["user-id"]);

					var globalbot = false;
					for (var i in hchannel.hchat.globalFFZBadgeOwners) {
						if (i == "2" && hchannel.ffzBotBadgeOwnerIDs.indexOf(uid) != -1)
							list.push(hchannel.hchat.globalFFZBadges.get(i));
						else if (hchannel.hchat.globalFFZBadgeOwners[i].indexOf(uid) != -1) {
							list.push(hchannel.hchat.globalFFZBadges.get(i));
						}
					}

					if (hchannel.ffzVIPBadge) {
						for (var i in list) {
							if (list[i] == undefined) continue;

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
		var list = new Map();
		if (!elist) {
			console.warn("Emote set does not have any emotes");
			return;
		}

		for (var i = 0; i < elist.length; i++) {
			var e = elist[i];

			var ee = this.processSevenTVEmote(e);

			list.set(ee.name, ee);
		}

		return list;
	}

	processSevenTVEmote(e) {
		var ee = new EmoteInfo();
		ee.id = e.id;
		ee.text = e.name;
		ee.infoUrl = "https://7tv.app/emotes/" + e.id;
		ee.urls = {
			4: "https:" + e.data.host.url + "/4x.webp",
			3: "https:" + e.data.host.url + "/3x.webp",
			2: "https:" + e.data.host.url + "/2x.webp",
			1: "https:" + e.data.host.url + "/1x.webp",
		}
		ee.name = e.name;
		ee.provider = hchatEmoteProviderSevenTV;
		ee.overlay = (e.flags & 1) != 0;
		var w = e.data.host.files[0].width;
		var h = e.data.host.files[0].height;
		ee.widthRatio = w / h;

		return ee;
	}

	/**
	 * @param { Object } elist
	 * @returns { EmoteInfo[String] } 
	 */
	processBTTVEmotes(elist) {
		var list = new Map();
		for (var i = 0; i < elist.length; i++) {
			var e = elist[i];

			var ee = new EmoteInfo();
			ee.id = e.id;
			ee.text = e.code;
			ee.infoUrl = "https://betterttv.com/emotes/" + e.id;
			ee.urls =
			{
				3: "https://cdn.betterttv.net/emote/" + e.id + "/3x",
				2: "https://cdn.betterttv.net/emote/" + e.id + "/2x",
				1: "https://cdn.betterttv.net/emote/" + e.id + "/1x",
			};
			ee.overlay = ["SoSnowy", "IceCold", "SantaHat", "TopHat", "ReinDeer", "CandyCane", "cvMask", "cvHazmat"].indexOf(e.code) != -1;

			ee.name = e.code;
			ee.provider = hchatEmoteProviderBTTV;
			list.set(ee.name, ee);
		}
		return list;
	}

	/**
	 * @param { Object } elist
	 * @returns { EmoteInfo[String] } 
	 */
	processFFZSet(elist) {
		var list = new Map();
		for (var i = 0; i < elist.length; i++) {
			var e = elist[i];

			var ee = new EmoteInfo();
			ee.id = e.id;
			ee.infoUrl = "https://www.frankerfacez.com/emoticon/" + e.id;
			ee.urls = e.urls;
			ee.name = e.name;
			ee.text = e.name;
			ee.provider = hchatEmoteProviderFFZ;
			ee.overlay = !!e.modifier;
			ee.widthRatio = e.width / e.height;

			if (e.modifier_flags & 1) {
				var maskFunctions =
					[
						undefined, // Skip
						// Flip X
						function (img) {
							img.classList.add("emoteEffectFlipX");
							return img;
						},
						// Flip Y
						function (img) {
							img.classList.add("emoteEffectFlipY");
							return img;
						},
						// Wide
						function (img) {
							img.classList.add("emoteEffectWide");
							return img;
						},
						// Slide
						function (img) {
							img.addEventListener("load", () => {
								const emptyImg = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
								img.style.backgroundImage = "url(" + img.src + ")";
								img.src = emptyImg;
								img.classList.add("emoteEffectSlide");
							}, { once: true });
							return img;
						},
						// Arrive
						function (img) {
							img.classList.add("emoteEffectArrive");
							return img;
						},
						// Leave
						function (img) {
							img.classList.add("emoteEffectLeave");
							return img;
						},
						// Spin
						function (img) {
							img.classList.add("emoteEffectSpin");
							return img;
						},
						undefined, // 256
						undefined, // 512
						undefined, // 1024
						// Rainbow
						function (img) {
							img.classList.add("emoteEffectRainbow");
							return img;
						},
						// Hyper red
						function (img) {
							img.classList.add("emoteEffectHyperRed");
							return img;
						},
						// Hyper shake
						function (img) {
							img.classList.add("emoteEffectShake");
							return img;
						},
						// Cursed
						function (img) {
							img.classList.add("emoteEffectCursed");
							return img;
						},
						// Jam
						function (img) {
							img.classList.add("emoteEffectJam");
							return img;
						},
						// Bounce
						function (img) {
							img.classList.add("emoteEffectBounce");
							return img;
						},
					];

				for (let i in maskFunctions) {
					const func = maskFunctions[i];
					if (func == undefined) continue;

					if (e.modifier_flags & (1 << i)) {
						if (ee.modifierFunction) {
							const oldfunc = ee.modifierFunction;
							ee.modifierFunction = function (img) {
								return func(oldfunc(img));
							}
						}
						else
							ee.modifierFunction = func;
					}
				}
			}
			list.set(ee.name, ee);
		}
		return list;
	}

	async getGlobalCheermotes() {
		this.globalCheerMotes = parseCheermotes(await this.Twitch.getCheermotes(), false);
	}
}

class HChatChannel {
	botList = [];
	channelEmotes = new Map();
	channelTwitchBadges = new Map();
	channelCheerMotes = new Map();
	/**
	 * @type { HChat }
	 */
	hchat;
	channelId = 0;

	ffzBotBadgeOwnerIDs = [];
	ffzVIPBadge;
	ffzModBadge;

	sevenTVEmoteSetID;
	onEmoteAdded = (byWho, emoteInfo) => { };
	onEmoteRemoved = (byWho, emoteInfo) => { };

	/**
	 * @param { HChat } hchat 
	 * @param { Number } channelId 
	 */
	constructor(hchat, channelId) {
		this.hchat = hchat;
		this.channelId = channelId;

		hchat.channels.push(this);
	}

	close() {
		if (this.sevenTVEmoteSetID) {
			this.hchat.sevenTVEventClient.unsubscribe("emote_set.update", { "object_id": this.sevenTVEmoteSetID });
		}
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
				this.channelEmotes = new Map([...this.channelEmotes, ...this.hchat.processSevenTVEmotes(sevenTVUser.emote_set.emotes)]);
				this.sevenTVEmoteSetID = sevenTVUser.emote_set.id;
				this.hchat.sevenTVEventClient.subscribe("emote_set.update", { "object_id": this.sevenTVEmoteSetID });
			}
			catch (e) {
				console.warn("Failed to load 7TV emotes for channel " + this.channelId);
				console.warn(e);
			}
		}

		// BTTV channel emotes
		{
			try {
				this.channelEmotes = new Map([...this.channelEmotes, ...this.hchat.processBTTVEmotes(bttvUser.channelEmotes)]);
				this.botList = this.botList.concat(bttvUser.bots);
			}
			catch (e) {
				console.warn("Failed to load BTTV channel " + this.channelId);
				console.warn(e);
			}
		}

		// FFZ channel emotes and badges
		{
			try {
				for (var k in ffzRoom.sets) {
					this.channelEmotes = new Map([...this.channelEmotes, ...this.hchat.processFFZSet(ffzRoom.sets[k].emoticons)]);
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
				console.warn("Failed to load FFZ emotes for channel " + this.channelId);
				console.warn(e);
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
	parseMessageComponents(input, msg, skipEmojis = false) {
		var twitchEmotes = new Map();

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
				e.text = e.name;
				e.urls = this.hchat.twitchEmoteOverrides.get(id) ??
				{
					1: "https://static-cdn.jtvnw.net/emoticons/v2/" + id + "/default/dark/1.0",
					2: "https://static-cdn.jtvnw.net/emoticons/v2/" + id + "/default/dark/2.0",
					3: "https://static-cdn.jtvnw.net/emoticons/v2/" + id + "/default/dark/3.0",
				}
				e.provider = "twitch";
				twitchEmotes.set(name, e);
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

			if (!skipEmojis) {
				var es = this.parseEmojis(s);
				if (es.length > 1) {
					for (var i in es) {
						var e = es[i];
						comps = comps.concat(this.parseMessageComponents(e, msg, true));
					}
					continue;
				}
			}

			if (msg.tags.bits) {
				var ce = this.channelCheerMotes.get(s.toLowerCase()) ?? this.hchat.globalCheerMotes.get(s.toLowerCase());
				if (ce && msg.tags.bits >= ce.value) {
					comps.push(ce);
					continue;
				}
			}

			var emote = this.hchat.uniToEmoji.get(s) ?? this.hchat.uniToEmoji.get(s + '\uFE0F') ?? this.channelEmotes.get(s) ?? this.hchat.globalEmotes.get(s) ?? twitchEmotes.get(s);
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
		{
			function isString(o) {
				return typeof o === 'string' || o instanceof String;
			}

			var folded = [];
			for (var i in comps) {
				var c = comps[i];
				if (isString(c)) {
					var last = folded[folded.length - 1];
					if (isString(last)) {
						folded[folded.length - 1] += c;
					}
					else folded.push(c);
				}
				else folded.push(c);
			}
			comps = folded;
		}

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