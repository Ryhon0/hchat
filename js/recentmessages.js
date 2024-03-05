class RecentMessagesAPI
{
	BaseURL = "https://recent-messages.robotty.de";

	/**
	 * 
	 * @param {string} channel_name 
	 * @param {number|null} limit 
	 * @returns 
	 */
	async getRecentMessages(channel_name, limit = null)
	{
		var url = this.BaseURL + "/api/v2/recent-messages/" + channel_name;
		if(limit != null)
			url += "?limit=" + limit;
		return await getJSON(url);
	}
}