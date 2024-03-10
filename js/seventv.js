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

class SevenTVEventAPI
{
	onEvent = (event) => { console.log("<=="); console.log(event); }
	/** @type { WebSocket } */
	ws = new WebSocket("wss://events.7tv.io/v3")

	constructor()
	{
		this.ws.onmessage = (ev) => { this.onEvent(JSON.parse(ev.data));};
		//this.sendMessage();
	}

	sendMessage(op, obj)
	{
		var payload = {"op": op, "t": Date.now().valueOf(), "d": obj };
		console.log("==>");
		console.log(payload);
		this.ws.send()
	}

	subscribe(type,cond)
	{
		this.sendMessage(35, {"type":type,"condition": cond})
	}

	unsubscribe(type)
	{
		this.sendMessage(36, {"type":type,"condition": cond});
	}
}