// https://7tv.io/docs

const hchatEmoteProviderSevenTV = "seventv";
const hchatEmoteProviderSevenTVName = "7TV";

const sevenTVPlatform =
{
	Twitch: "twitch",
	YouTube: "youtube",
	Discord: "discord"
}

const sevenTVEmoteSetGlobalID = "global";

const sevenTVAPIGetUserRoute = "users/{0}";
const sevenTVAPIGetUserConnectionRoute = "users/{0}/{1}";
const sevenTVAPIGetEmoteSetsRoute = "emote-sets/{0}";
const sevenTVAPIEmoteRoute = "emotes/{0}";

const sevenTVEventAPIURL = "wss://events.7tv.io/v3";

class SevenTVAPI {
	baseURL = "7tv.io";
	APIVersion = "v3";

	useHTTPS = true;

	buildAPIURL(route) {
		return (this.useHTTPS ? "https" : "http") + "://" +
			this.baseURL + "/" + this.APIVersion + "/" +
			route;
	}

	/**
	 * 
	 * @param {string} platform 
	 * @param {string|number} user_id 
	 * @returns 
	 */
	async getUserConnection(platform, user_id) {
		return await getJSON(this.buildAPIURL(sevenTVAPIGetUserConnectionRoute.format(platform, user_id)));
	}

	/**
	 * 
	 * @param {string} user_id 
	 * @returns 
	 */
	async getUser(user_id) {
		return await getJSON(this.buildAPIURL(sevenTVAPIGetUserRoute.format(user_id)));
	}

	/**
	 * 
	 * @param {string} set_id 
	 * @returns 
	 */
	async getEmoteSet(set_id) {
		return await getJSON(this.buildAPIURL(sevenTVAPIGetEmoteSetsRoute.format(set_id)));
	}

	async getGlobalEmoteSet() {
		return await getJSONCached(this.buildAPIURL(sevenTVAPIGetEmoteSetsRoute.format(sevenTVEmoteSetGlobalID)));
	}


	/**
	 * 
	 * @param {string} emote_id 
	 * @returns 
	 */
	async getEmote(emote_id) {
		return await getJSON(this.buildAPIURL(sevenTVAPIEmoteRoute.format(emote_id)));
	}
}

class SevenTVEventAPI {
	onEvent = (event) => { }
	/** @type { WebSocket } */
	ws = new WebSocket(sevenTVEventAPIURL)
	pending = [];
	sessionId;

	constructor() {
		this.ws.onmessage = (ev) => {
			var o = JSON.parse(ev.data);
			if (o.op == 1) {
				// Hello
				if (!this.sessionId)
					this.sessionId = o.d.session_id;
			}
			else if (o.op == 4 || o.op == 7) {
				// Reconnect
				this.ws.close();
			}
			else if (o.op == 6) {
				// Error
				console.error(o);
			}
			// Other events
			else if (o.op == 0) {
				this.onEvent(o.d);
			}
		};
		this.ws.onopen = (ev) => {
			if (this.sessionId)
				this.sendMessage(34, { "session_id": this.sessionId });

			for (var payload of this.pending)
				this.sendObject(payload);
			this.pending = [];
		};
	}

	sendMessage(op, obj) {
		var payload = { "op": op, "t": Date.now().valueOf(), "d": obj };

		if (this.ws.readyState == 1)
			this.sendObject(payload);
		else this.pending.push(payload);
	}

	sendObject(obj) {
		this.ws.send(JSON.stringify(obj));
	}

	subscribe(type, cond) {
		this.sendMessage(35, { "type": type, "condition": cond })
	}

	unsubscribe(type, cond) {
		this.sendMessage(36, { "type": type, "condition": cond });
	}
}