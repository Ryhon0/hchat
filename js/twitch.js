// https://api.ivr.fi/v2/docs
// https://dev.twitch.tv/docs/api/reference

class TwitchAPI {
	BaseIVRURL = "https://api.ivr.fi";
	BaseHelixURL = "https://api.twitch.tv/helix";
	preferIVR = false;
	/** @type {string|null} */
	token = null;
	clientID = null;

	useIVR() {
		if (this.preferIVR) return this.preferIVR;

		return !this.token;
	}

	async getUserByName(username) {
		return await getJSON(this.BaseIVRURL + "/v2/twitch/user?login=" + username);
	}

	async getUser(id) {
		return await getJSON(this.BaseIVRURL + "/v2/twitch/user?id=" + id);
	}

	async getVIPSAndMods(channel_name) {
		return await getJSON(this.BaseIVRURL + "/v2/twitch/modvip/" + channel_name);
	}

	async getFounders(channel_name) {
		return await getJSON(this.BaseIVRURL + "/v2/twitch/founders/" + channel_name);
	}

	async getClip(slug) {
		return await getJSON(this.BaseIVRURL + "/v2/twitch/clip/" + slug);
	}

	async getSubAge(user, channel) {
		return await getJSON(this.BaseIVRURL + "/v2/twitch/subage/" + user + "/" + channel);
	}

	async getEmote(emote_name) {
		return await getJSON(this.BaseIVRURL + "/v2/twitch/emotes/" + emote_name);
	}

	async getEmoteSet(set_id) {
		if (this.useIVR())
			return await getJSON(this.BaseIVRURL + "/v2/twitch/emotes/sets?set_id=" + set_id);
		else
			return (await this.getJSONAuthenticated(this.BaseHelixURL + "/chat/emotes?broadcaster_id")).data;
	}

	async getGlobalEmotes() {
		if (this.useIVR())
			return await getJSON(this.BaseIVRURL + "/v2/badges/global");
		else
			return (await this.getJSONAuthenticated(this.BaseHelixURL + "/chat/emotes/global")).data;
	}

	async getChannelEmotes(channel_id) {
		if (this.useIVR())
			return await getJSON(this.BaseIVRURL + "/v2/twitch/emotes/channel/" + channel_id + "?id=true");
		else
			return (await this.getJSONAuthenticated(this.BaseHelixURL + "/chat/emotes?broadcaster_id=" + channel_id)).data;
	}

	async getGlobalBadges() {
		if (this.useIVR())
			return await getJSON(this.BaseIVRURL + "/v2/twitch/badges/global");
		else
			return (await this.getJSONAuthenticated(this.BaseHelixURL + "/chat/badges/global")).data;

	}

	async getChannelBadges(channel_id) {
		if (this.useIVR())
			return await getJSON(this.BaseIVRURL + "/v2/twitch/badges/channel?id=" + channel_id);
		else
			return (await this.getJSONAuthenticated(this.BaseHelixURL + "/chat/badges?broadcaster_id=" + channel_id)).data;
	}

	async getCheermotes() {
		return (await this.getJSONAuthenticated(this.BaseHelixURL + "/bits/cheermotes")).data;
	}

	async getChannelCheermotes(channel_id) {
		return (await this.getJSONAuthenticated(this.BaseHelixURL + "/bits/cheermotes?broadcaster_id=" + channel_id)).data;
	}

	async getJSONAuthenticated(url, opts = { timeout: 5000 }) {
		opts.headers =
		{
			"Authorization": "Bearer " + this.token,
			"Client-Id": this.clientID
		};
		return await getJSON(url, opts);
	}
}

function parseTwitchBadges(badges) {
	var list = {};
	for (b of badges) {
		for (v of b.versions) {
			var id = b.set_id + "/" + v.id;
			var vo = new Badge();
			vo.title = v.title;
			vo.id = id;
			vo.img = v.image_url_4x;
			vo.description = v.description;
			vo.provider = "twitch";
			list[id] = vo;
		}
	}
	return list;
}

function parseCheermotes(data, custom = false) {
	var cl = {};
	for (var i in data) {
		var c = data[i];
		var prefix = c.prefix;

		if (custom == (c.type == "channel_custom"))
			for (var ti in c.tiers) {
				var t = c.tiers[ti];

				var ce = new CheerMote();
				ce.value = Number(t.id);
				ce.name = prefix + t.id;
				ce.color = t.color;
				ce.urls = t.images.dark.animated;

				cl[ce.name.toLowerCase()] = ce;
			}
	}
	return cl;
}