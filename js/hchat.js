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

	emojiRegex = /\p{RGI_Emoji}/gv;

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