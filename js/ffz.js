// https://api.frankerfacez.com/docs/
const hchatEmoteProviderFFZ = "ffz"
const hchatEmoteProviderFFZName = "FrankerFaceZ"

const FFZAPIGetUserRoute = "user/{0}"
const FFZAPIGetTwitchUserRoute = "user/id/{0}"
const FFZAPIGetYouTubeUserRoute = "user/yt/{0}"
const FFZAPIGetFFZUserRoute = "user/_id/{0}"

const FFZAPIGetEmoteRoute = "emote/{0}"
const FFZAPIGetBadgesRoute = "_badges"

const FFZAPIGlobalEmoteSetID = "global";
const FFZAPIGetEmoteSet = "set/{0}"

const FFZAPIGetRoomTwitch = "room/id/{0}"
const FFZAPIGetRoomYouTube = "room/id/yt/{0}"

class FFZAPI
{
	baseURL = "api.frankerfacez.com";
	APIVersion = "v1";

	useHTTPS = true;

	buildAPIURL(route) {
		return (this.useHTTPS ? "https" : "http") + "://" +
			this.baseURL + "/" + this.APIVersion + "/" +
			route;
	}

	async getBadges()
	{
		return await getJSON(this.buildAPIURL(FFZAPIGetBadgesRoute));
	}

	/**
	 * 
	 * @param {number|string} set_id 
	 * @returns 
	 */
	async getEmoteSet(set_id)
	{
		return await getJSON(this.buildAPIURL(FFZAPIGetEmoteSet.format(set_id)));
	}

	/**
	 * 
	 * @param {number} id 
	 * @returns 
	 */
	async getRoomTwitch(id)
	{
		return await getJSON(this.buildAPIURL(FFZAPIGetRoomTwitch.format(id)));
	}

	/**
	 * 
	 * @param {string} id 
	 * @returns 
	 */
	async getRoomYouTube(id)
	{
		return await getJSON(this.buildAPIURL(FFZAPIGetRoomYouTube.format(id)));
	}
}