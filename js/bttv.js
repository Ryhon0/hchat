// https://betterttv.com/developers
const hchatEmoteProviderBTTV = "bttv"
const hchatEmoteProviderBTTVName = "BetterTTV"

const BTTVProvider =
{
	Twitch: "twitch",
	YouTube: "youtube"
}

const BTTVAPIGetUserRoute = "cached/users/{0}/{1}"
const BTTVAPIGetFFZUserRoute = "cached/frankerfacez/users/{0}/{1}"
const BTTVAPIGetGlobalEmotes = "cached/emotes/global"
const BTTVAPIGetBadges = "cached/badges/{0}"

class BTTVAPI {
	baseURL = "api.betterttv.net";
	APIVersion = "3";

	useHTTPS = true;

	buildAPIURL(route) {
		return (this.useHTTPS ? "https" : "http") + "://" +
			this.baseURL + "/" + this.APIVersion + "/" +
			route;
	}

	/**
	 * 
	 * @param { string } provider 
	 * @param { number } user_id 
	 * @returns 
	 */
	async getUser(provider, user_id) {
		return await getJSON(this.buildAPIURL(BTTVAPIGetUserRoute.format(provider, user_id)));
	}

	/**
	 * 
	 * @param { string } provider 
	 * @param { number } user_id 
	 * @returns 
	 */
	async getFFZEmotes(provider, user_id) {
		return await getJSON(this.buildAPIURL(BTTVAPIGetFFZUserRoute.format(provider, user_id)));
	}

	async getGlobalEmotes() {
		return await getJSONCached(this.buildAPIURL(BTTVAPIGetGlobalEmotes));
	}

	/**
	 * 
	 * @param { string } provider 
	 * @returns 
	 */
	async getBadges(provider) {
		return await getJSON(this.buildAPIURL(BTTVAPIGetBadges.format(provider)));
	}
}