const clientID = "atu01l1tzhhfpzobn87uwwllq5pt4e";
const gitPage = "https://github.com/Ryhon0/hchat"
const issuesPage = "https://github.com/Ryhon0/hchat/issues/new"

var cachedUserColors = new Map()
var cachedUsernames = new Map()

var sendButton;
/** @type { HTMLTextAreaElement } */
var textInput;

/** @type { ChatClient } */
var anonClient;

var hchat = new HChat();
/** @type { Element } */
var tlbox;
/** @type { Element } */
var channelList;
/** @type { Element } */
var accountButton;
/** @type { Element } */
var currentAccountAvatar;
/** @type { Element } */
var dropZone;
/** @type { Element } */
var scrollToBottomButton;

/** @type { Element } */
var tooltip;
/** @type { Element } */
var contextMenu;

async function selfUpdate() {
	var loading = document.getElementById("loadingScreen");
	var loadingProgress = document.getElementById("loadingScreenInfo");

	loadingProgress.innerText = "Checking for update...";

	var cachedDate = localStorage.getItem("lastUpdated");
	if (!cachedDate) {
		var cached = await fetch("/js/app.js", {
			cache: 'force-cache'
		});
		cachedDate = cached.headers.get("Last-Modified")
	}
	cachedDate = new Date(cachedDate);

	var fresh = await fetch("/js/app.js", {
		cache: 'reload'
	});
	var freshDate = new Date(fresh.headers.get("Last-Modified"));

	if (freshDate > cachedDate) {
		var toUpdate = [];
		for (var s of document.getElementsByTagName("script")) {
			if (s.src) {
				toUpdate.push(s.src);
			}
		}

		for (var l of document.getElementsByTagName("link")) {
			if (l.rel == "stylesheet") {
				toUpdate.push(l.href);
			}
		}

		for (var i = 0; i < toUpdate.length; i++) {
			loadingProgress.innerText = "Updating (" + (i + 1) + "/" + toUpdate.length + ")...";

			var l = toUpdate[i];
			await fetch(l, { cache: 'reload' });
		}


		localStorage.setItem("lastUpdated", freshDate.toGMTString());
		location.reload();
		loadingProgress.innerText = "Reloading...";
		return;
	}

	loadingProgress.innerText = "";
	loading.classList.add("loaded");
}

async function loaded() {
	loadSettings();
	selfUpdate().then(() => { });

	accounts = loadSavedAccounts();

	// OAuth redirect handling
	{
		var atoken = new URLSearchParams(window.location.hash.substring(1)).get("access_token");
		history.pushState("", document.title, window.location.pathname + window.location.search);
		if (atoken) {
			var t = new TwitchAPI();
			t.token = atoken;
			t.clientID = clientID;
			var r = await t.validateToken();

			if (r.user_id) {
				var id = Number(r.user_id);
				var acc = getAccountById(id);

				if (acc == null) {
					acc = new Account();
					acc.name = r.login;
					acc.type = "bearer";
					acc.id = id;

					var ui = await t.getThisUser();

					acc.name = ui.display_name;
					acc.avatarUrl = ui.profile_image_url;

					accounts.push(acc);
				}

				acc.token = atoken;
				acc.state = AccountStateReady;
				onAccountReady(acc);

				saveAccounts();
			}
			else {
				console.error("Failed to validate token");
				console.error(r);
			}
		}
	}
	activeAccount = accounts[0];

	// Verify accounts
	{
		for (var i in accounts) {
			const acc = accounts[i];

			if (acc.state == AccountStateChecking) {
				const t = new TwitchAPI();
				t.clientID = clientID;
				t.token = acc.token;

				t.validateToken().then(async (r) => {
					if (r.login) {
						t.getThisUser().then((u) => {
							acc.name = u.display_name;
							acc.avatarUrl = u.profile_image_url;
							saveAccounts();
						});

						t.state = AccountStateReady;
						onAccountReady(acc);
					}
					else t.state = AccountStateExpired;
				});
			}
		}
	}

	scrollToBottomButton = document.getElementById("scrollToBottom");
	scrollToBottomButton.onclick = () => {
		selectedChannel.autoscroll = true;
	};
	textInput = document.getElementById("textInput");
	sendButton = document.getElementById("sendButton");

	tlbox = document.getElementById("tlbox");
	channelList = document.getElementById("channelList");
	channelList.addEventListener('wheel', (event) => {
		if (!event.deltaY) {
			return;
		}

		event.currentTarget.scrollLeft += event.deltaY + event.deltaX;
		event.preventDefault();
	});
	channelTabber = new Tabber(channelList, tlbox);
	channelTabber.onPageSwitched = (page) => {
		selectedChannel = page.channel;

		setReply(undefined);
		closeEmojiList();

		if (selectedChannel) {
			textInput.parentElement.classList.remove("hidden");
		}
		else {
			closeSuggestionBox();
			textInput.parentElement.classList.add("hidden");
		}
	};

	setInterval(() => {
		if (selectedChannel) {
			if (selectedChannel.autoscroll) {
				scrollToBottomButton.classList.add("hidden");
				selectedChannel.timeline.scrollTop = selectedChannel.timeline.scrollHeight;
			}
			else {
				var diff = selectedChannel.timeline.scrollTop - selectedChannel.timeline.scrollHeight + selectedChannel.timeline.clientHeight;
				if (Math.abs(diff) < 8) selectedChannel.autoscroll = true;
				else scrollToBottomButton.classList.remove("hidden");
			}
		}
	}, 10);

	document.getElementById("addChannelButton").onclick = async () => {
		var name = prompt('Channel name:');
		if (name) {
			await openChannelTab(name, undefined);
			saveChannels();
		}
	};
	accountButton = document.getElementById("accountButton");
	accountButton.onclick = (ev) => {
		const popup = document.createElement("div");
		popup.classList.add("popupMenu");
		popup.style.width = "400px";
		document.body.appendChild(popup);

		setInterval(() => {
			document.addEventListener("click", function f(ev) {
				popup.remove();
				document.removeEventListener("click", f);
			});
		}, 0);

		for (var a of accounts) {
			const ab = document.createElement("button");
			ab.innerText = a.name;
			if (a.state == AccountStateExpired)
				ab.innerText += " (Expired)";

			if (activeAccount == a)
				ab.innerText += " (Active)";

			ab.onclick = () => {
				activeAccount = a;
				onAccountChanged();
			}

			const av = document.createElement("img");
			av.style.maxWidth = "1em";
			av.style.height = "1em";
			av.src = a.avatarUrl;
			ab.appendChild(av);

			popup.appendChild(ab);
		}

		{
			var ab = document.createElement("button");
			ab.classList.add("bi-plus");
			ab.innerText = "Log in";
			ab.onclick = () => {
				authRedirect();
			}

			popup.appendChild(ab);
		}

		var btnRect = accountButton.getBoundingClientRect();
		var popupRect = popup.getBoundingClientRect();

		popup.style.top = btnRect.bottom + "px";
		popup.style.left = (btnRect.right - popupRect.width) + "px";
	}
	currentAccountAvatar = document.getElementById("currentAccountAvatar");
	document.getElementById("settingsButton").onclick = openSettings;

	var uploadButton = document.getElementById("uploadButton");
	uploadButton.onclick = () => {
		var fi = document.createElement("input");
		fi.type = "file";
		fi.addEventListener("change", () => {
			for (const f of fi.files)
				uploadFile(f);
		});
		fi.click();
	};

	document.getElementById("emojiButton").onclick = () => {
		var list = document.getElementById("emojiList");

		if (list.classList.contains("hidden")) {
			openEmojiList();
		}
		else {
			closeEmojiList();
		}
	};

	const emoteTabs = document.getElementById("emoteTabs");
	const emotePages = document.getElementById("emotePages");
	const emoteSearch = document.getElementById("emoteSearch");

	function filterEmotes(query) {
		query = query.toLowerCase();
		const currentPage = emoteTabber.currentPage;

		for (var e of currentPage.children) {
			var matches = false;

			if (query.length != 0) {
				if (e.emote.info.name)
					matches ||= e.emote.info.name.toLowerCase().includes(query);
				if (e.emote.info.alias)
					matches ||= e.emote.info.alias.toLowerCase().includes(query);
			}
			else matches = true;

			if (matches) e.classList.remove("hidden");
			else e.classList.add("hidden");
		}
	}
	emoteSearch.oninput = () => { filterEmotes(emoteSearch.value) };

	emoteTabber = new Tabber(emoteTabs, emotePages);
	emoteTabber.onPageClosed = (page) => { page.innerHTML = "" };
	emoteTabber.onPageSwitched = (page) => {
		for (var ek of page.list.keys()) {
			const ei = page.list.get(ek);
			var e = new Emote();
			e.info = ei;

			var ee = createEmoteElement(e);
			ee.onclick = (ev) => {
				pushInputText(ev.currentTarget.emote.info.getName());
			}
			page.appendChild(ee);
		}
		filterEmotes(emoteSearch.value);
	}

	document.onkeyup = (ev) => {
		if (ev.keyCode == 27) {
			closeEmojiList();
		}
	}

	document.onpaste = (ev) => {
		if (ev.clipboardData.files && ev.clipboardData.files.length) {
			for (const f of ev.clipboardData.files)
				uploadFile(f);
			ev.preventDefault();
		}
		else if (ev.clipboardData.getData("text")) {
			if (!document.activeElement || (document.activeElement.tagName != "input" && document.activeElement.tagName != "textarea")) {
				textInput.focus();
			}
		}
	};

	document.onkeydown = (e) => {
		if (e.code == "PageDown") {
			channelTabber.currentPage.scrollBy(0, channelTabber.pageList.clientHeight);
			e.preventDefault();
			return;
		}
		else if (e.code == "PageUp") {
			channelTabber.currentPage.scrollBy(0, -channelTabber.pageList.clientHeight);
			e.preventDefault();
			return;
		}
		else if (e.code == "Home") {
			channelTabber.currentPage.scrollTo(0, 0);
			e.preventDefault();
			return;
		}
		else if (e.code == "End") {
			channelTabber.currentPage.scrollTo(0, channelTabber.currentPage.scrollHeight);
			e.preventDefault();
			return;
		}
		else if (!document.activeElement || (document.activeElement.tagName.toLowerCase() != "input" && document.activeElement.tagName.toLowerCase() != "textarea")) {
			if (e.ctrlKey) return;

			textInput.focus();
		}
	}

	onAccountChanged();

	// File drag and drop
	{
		dropZone = document.getElementById("dropZone");

		function showDropZone() {
			dropZone.style.display = "flex";
		}
		function hideDropZone() {
			dropZone.style.display = "none";
		}

		function allowDrag(e) {
			if (true) {
				e.dataTransfer.dropEffect = 'copy';
				e.preventDefault();
			}
		}

		/**
		 * @param { DragEvent } e 
		 */
		function handleDrop(e) {
			e.preventDefault();
			hideDropZone();

			if (e.dataTransfer.items) {
				for (const i of e.dataTransfer.items) {
					if (i.kind != "file") continue;

					const f = i.getAsFile();
					uploadFile(f);
				}
			}
		}

		window.addEventListener('dragenter', function (e) {
			showDropZone();
		});

		dropZone.addEventListener('dragenter', allowDrag);
		dropZone.addEventListener('dragover', allowDrag);

		dropZone.addEventListener('dragleave', function (e) {
			hideDropZone();
		});

		dropZone.addEventListener('drop', handleDrop);
	}

	textInput.addEventListener("keydown", (ev) => {
		if (ev.keyCode == 13) {
			if (suggestionBox) {
				suggestionBox.children[suggestionIndex].click();
			}
			else {
				sendMessageFromInputBox(ev.ctrlKey);
			}
			ev.preventDefault();
		}
		else if (ev.keyCode == 38 || ev.keyCode == 9) {
			moveSelectionCursor(-1);
			ev.preventDefault();
		}
		else if (ev.keyCode == 40) {
			moveSelectionCursor(1);
			ev.preventDefault();
		}
		else if (ev.keyCode == 27) {
			if (suggestionBox) {
				closeSuggestionBox();
				ev.preventDefault();
			}
		}
	});

	sendButton.addEventListener("click", (ev) => {
		sendMessageFromInputBox();
	});

	var autocompleteTimeout;
	textInput.addEventListener("input", (ev) => {
		clearTimeout(autocompleteTimeout);
		if (suggestionBox)
			closeSuggestionBox();

		autocompleteTimeout = setTimeout(() => {
			suggestAutocomplete();
		}, 120);
	});

	// HChat badges
	{
		var hchatBadge = new Badge();
		hchatBadge.id = "hchat";
		hchatBadge.title = "HChat user";
		hchatBadge.description = "This message was sent using HChat";
		hchatBadge.img = "/icon.png";
		function getHChatBadges(list, msg, hchannel) {
			var uid = Number(msg.tags["user-id"]);

			if (msg.tags["client-nonce"] && msg.tags["client-nonce"].startsWith("hchat,"))
				list.push(hchatBadge);

			return list;
		};
		hchat.badgePredictates.push(getHChatBadges);
	}

	// Old PogChamp
	if (settings.oldPogChamp) {
		hchat.twitchEmoteOverrides.set("305954156",
			{
				1: "/assets/emotes/twitch/PogChamp/1.png",
				2: "/assets/emotes/twitch/PogChamp/2.png",
				3: "/assets/emotes/twitch/PogChamp/3.png",
			});
	}

	hchat.Twitch.clientID = clientID;
	await hchat.init();

	anonClient = new ChatClient();
	anonClient.onMessage = (msg) => {
		processMessage(msg);
	};

	anonClient.onConnect = (ev) => {
		textInput.classList.add("connected");
		textInput.classList.remove("disconnected");
	};
	anonClient.onDisconnect = (ev) => {
		textInput.classList.add("disconnected");
		textInput.classList.remove("connected");
	};

	hchat.getGlobalCheermotes().then(() => { });

	var savedChannels = getSavedChannels();
	for (var i in savedChannels) {
		var chi = savedChannels[i];

		openChannelTab(chi.name, chi.id).then(() => { });
	}
}

var messagesById = {};
/**
 * @param { Message } pm 
 */
function processMessage(pm, beforeElem = undefined) {
	if (!pm || !pm.command) return;

	var channel = getChannelById(pm.roomId());
	if (isNaN(pm.roomId())) {
		channel = selectedChannel;
	}
	else {
		if (!channel) {
			console.error("Recieved message in channel " + pm.roomId() + ", but no chat with this name was opened");
			console.log(pm);
			return;
		}
	}

	var mi = document.createElement("div");
	mi.classList.add("message");
	mi.id = "message#" + pm.tags.id;
	mi.message = pm;

	var uid = pm.userId();
	if (isUserBlocked(uid)) {
		mi.classList.add("blocked");
	}

	mi.oncontextmenu = (ev) => {
		var menu = document.createElement("div");
		menu.classList.add("messageMenu");
		document.body.appendChild(menu);

		{
			var reply = createElementWithText("button", "Reply to message");
			reply.onclick = () => {
				setReply(pm.tags.id);
				menu.remove();
			};
			menu.appendChild(reply);
		}

		{
			var reply = createElementWithText("button", "Copy message content");
			reply.onclick = () => {
				navigator.clipboard.writeText(pm.tcontent ?? pm.content);
				menu.remove();
			};
			menu.appendChild(reply);
		}

		{
			menu.appendChild(document.createElement("hr"));

			{
				var profile = createElementWithText("button", "Open profile");
				profile.onclick = () => {
					window.open("https://twitch.tv/" + pm.username(), '_blank').focus();
					menu.remove();
				};
				menu.appendChild(profile);
			}
			if (!accounts.some(a => pm.userId() == a.id)) {
				var block = createElementWithText("button", "Block " + pm.displayName());
				block.onclick = () => {
					blockUser(pm.userId()).then(() => { });
					menu.remove();
				};
				menu.appendChild(block);
			}
		}

		if (settings.developer) {
			menu.appendChild(document.createElement("hr"));
			{
				var copyid = createElementWithText("button", "Copy message object");
				copyid.onclick = () => {
					navigator.clipboard.writeText(JSON.stringify(pm));
					menu.remove();
				};
				menu.appendChild(copyid);
			}
			{
				var copyid = createElementWithText("button", "Copy message ID");
				copyid.onclick = () => {
					navigator.clipboard.writeText(pm.tags.id);
					menu.remove();
				};
				menu.appendChild(copyid);
			}
			{
				var copyid = createElementWithText("button", "Copy user ID");
				copyid.onclick = () => {
					navigator.clipboard.writeText(pm.userId() + "");
					menu.remove();
				};
				menu.appendChild(copyid);
			}
		}

		setInterval(() => {
			document.addEventListener("click", function f(ev) {
				menu.remove();
				document.removeEventListener("click", f);
			});
		}, 0);

		var zoom = document.body.style.zoom;
		showTooltip([ev.clientX / zoom, ev.clientY / zoom], menu, true);
		ev.preventDefault();
	}

	// Timestamp
	{
		var ts = document.createElement("span");
		ts.classList.add("time");

		var t = new Date(pm.time);
		ts.innerText = t.getHours() + ":" + String(t.getMinutes()).padStart(2, '0');

		mi.appendChild(ts);
	}

	var micon = document.createElement("div");
	mi.appendChild(micon);

	try {

		if (pm.command.command == "CLEARMSG") {
			const mid = pm.tags["target-msg-id"];

			const me = document.getElementById("message#" + mid);
			if (me) me.classList.add("deleted");

			var rm = messagesById[mid] ?? pm;

			{
				mi.classList.add("deletion");

				var c = document.createElement("div");
				c.classList.add("reply");
				c.appendChild(getFullMessageElement(channel, rm));
				micon.appendChild(c);

				var m = document.createElement("div");
				m.innerText += " Message from " + rm.displayName() + " was deleted";
				micon.appendChild(m);

				timelinePush(channel.timeline, mi, beforeElem);
				maintainMessageLimit(channel.timeline);

				micon.onclick = (ev) => {
					const ri = document.getElementById("message#" + mid);
					if (ri) {
						ri.scrollIntoView({ behavior: 'smooth', block: 'center' });
						ri.classList.add('highlight');
						setTimeout(() => {
							ri.classList.remove('highlight');
						}, 1000);
						ev.preventDefault();
					}
				};
			}
			return;
		}
		else if (pm.command.command == "CLEARCHAT") {
			var timedOutUser = pm.tags["target-user-id"];
			if (timedOutUser) {
				timedOutUser = Number(timedOutUser);
				for (var m of channel.timeline.children) {
					var msg = m.message;
					if (msg) {
						if (msg.userId() == timedOutUser)
							m.classList.add("deleted");
					}
				}

				var username = cachedUsernames.get(timedOutUser) ?? (timedOutUser + "");
				if (pm.tags["ban-duration"]) {
					var duration = Number(pm.tags["ban-duration"]);
					{
						var durationText = prettyTime(duration);
						micon.appendChild(document.createTextNode(username + " has been timed out for " + durationText));
					}
				}
				else micon.appendChild(document.createTextNode(username + " has been timed out"));
				timelinePush(channel.timeline, mi, beforeElem);
			}
			else {
				for (var m of channel.timeline.children) {
					var msg = m.message;
					if (msg) {
						m.classList.add("deleted");
					}
				}

				micon.appendChild(document.createTextNode("Chat has been cleared"));
				timelinePush(channel.timeline, mi, beforeElem);
			}
			return;
		}

		if (["PRIVMSG", "USERNOTICE", "NOTICE"].indexOf(pm.command.command) == -1) return;

		if (pm.content[pm.content.length - 1] == '\r')
			pm.content = pm.content.substring(0, pm.content.length - 1);

		// Recent messages deleted tag
		if (pm.tags["rm-deleted"])
			mi.classList.add("deleted");

		// Sub messages, raids
		if (pm.command.command == "USERNOTICE" || pm.command.command == "NOTICE") {
			switch (pm.tags["msg-id"]) {
				case "subgift":
				case "submysterygift":
				case "giftpaidupgrade":
				case "resub":
				case "sub":
				case "standardpayforward":
				case "communitypayforward":
				case "primepaidupgrade":
					var subFrom = pm.tags["display-name"];
					var subFromId = pm.tags["user-id"];

					mi.classList.add("sub");
					{
						var text = pm.tags["system-msg"];
						var li = document.createElement("div");
						li.innerText = text;

						micon.appendChild(li);
					}

					if (!pm.command.channel) {
						timelinePush(channel.timeline, mi, beforeElem);
						return;
					}
					break;
				case "raid":
					var raidFrom = pm.tags["msg-param-displayName"];
					var raidFromId = pm.tags["user-id"];

					mi.classList.add("raid");
					{
						var text = pm.tags["system-msg"];
						var li = document.createElement("div");
						li.classList.add("raid");
						li.innerText = text.replace("\n", "");

						micon.appendChild(li);
					}
					if (!pm.command.channel) {
						timelinePush(channel.timeline, mi, beforeElem);
						return;
					}
					break;
				case "announcement":
					mi.classList.add("announcement");
					pm.content = pm.content ?? pm.tags["system-msg"];
					break;
				default:
					console.log("Unhandled USERNOTICE, msg-id: " + pm.tags["msg-id"]);
					console.log(pm);
				case "msg_ratelimit":
					console.log(pm.tags["msg-id"]);
					mi.appendChild(document.createTextNode(pm.content));

					timelinePush(channel.timeline, mi, beforeElem);
					return;
			}
		}

		// Recent messages duplicates
		if (messagesById[pm.messageId()]) return;

		messagesById[pm.messageId()] = pm;

		var mentioned = false;
		var historical = "historical" in pm.tags;

		// Reply
		const replyId = pm.tags["reply-parent-msg-id"];
		if (replyId) {
			var replyElem = document.createElement("div");
			replyElem.innerHTML = "Replying to ";
			replyElem.classList.add("reply");

			// Remove @mention
			var replyLogin = pm.tags["reply-parent-user-login"];
			if (pm.content.startsWith("ACTION") && pm.content[pm.content.length - 1] == "") {
				pm.tcontent = "ACTION" + pm.content.substring("ACTION".length + 2 + replyLogin.length);
			}
			else pm.tcontent = pm.content.substring(2 + replyLogin.length);

			var rm = messagesById[replyId];
			if (!rm) {
				rm = new Message();
				rm.content = pm.tags["reply-parent-msg-body"];
				rm.tags["display-name"] = pm.tags["reply-parent-display-name"];
				rm.tags["user-id"] = pm.tags["reply-parent-user-id"];
				rm.user = replyLogin;
				rm.tags.login = replyLogin;
				rm.tags.color = cachedUserColors.get(replyLogin);
			}

			// Check if replying to one of the accounts
			{
				for (var a of accounts) {
					if (Number(a.id) == rm.userId()) {
						mentioned = true;
						break;
					}
				}
			}

			replyElem.appendChild(getFullMessageElement(channel, rm));
			replyElem.onclick = (ev) => {
				const ri = document.getElementById("message#" + replyId);
				if (ri) {
					ri.scrollIntoView({ behavior: 'smooth', block: 'center' });
					ri.classList.add('highlight');
					setTimeout(() => {
						ri.classList.remove('highlight');
					}, 1000);
					ev.preventDefault();
				}
			};

			micon.appendChild(replyElem);
		}

		// Content 
		// The actual message sent by the user
		{
			var contentElem = document.createElement("div");
			contentElem.classList.add("content");
			micon.appendChild(contentElem);

			// Full message
			{
				contentElem.appendChild(getFullMessageElement(channel, pm, (name) => {
					if (!mentioned) {
						for (var a of accounts) {
							if (a.name.toLowerCase() == name.toLowerCase()) {
								mentioned = true;
								break;
							}
						}
					}
				}));
			}
		}

		// Highlight colors
		{
			// Redeem
			{
				if (pm.tags["custom-reward-id"] || pm.tags["msg-id"] == "highlighted-message")
					mi.classList.add("redeem");
			}

			// First message
			{
				if (pm.tags["first-msg"] == "1")
					mi.classList.add("first");
			}

			// Mention
			{
				if (mentioned) {
					mi.classList.add("mentioned");

					if (!historical && !isUserBlocked(uid)) {
						channel.mentioningMessages.push(mi);
						channel.observer.observe(mi);

						playMentionSound();
					}
				}
			}
		}
	}
	catch (e) {
		micon.appendChild(document.createTextNode("" + e));
		console.error(e);
	}

	timelinePush(channel.timeline, mi, beforeElem);
}

function prettyTime(seconds) {
	var text = "";

	var restSecs = seconds % 60;
	var mins = Math.floor(seconds / 60) % 60;
	var hours = Math.floor(seconds / (60 * 60)) % 24;
	var days = Math.floor(seconds / (60 * 60 * 24));

	if (days != 0) {
		if (days == 1) text += "1 day";
		else text += days + " days";
	}

	if (hours != 0) {
		if (text) text += " ";
		if (hours == 1) text += "1 hour";
		else text += hours + " hours";
	}

	if (mins != 0) {
		if (text) text += " ";
		if (mins == 1) text += "1 minute";
		else text += mins + " minutes";
	}

	if (restSecs != 0) {
		if (text) text += " ";
		if (restSecs == 1) text += "1 second";
		else text += restSecs + " seconds";
	}

	return text;
}

/**
 * @param { Element } tl 
 * @param { Element } msg 
 * @param { Element } before 
 */
function timelinePush(tl, msg, before = undefined) {
	if (!before) {
		tl.appendChild(msg);

		/** @type { Channel } */
		var ch = tl.channel;

		if (!msg.classList.contains("blocked")) {
			ch.unread = true;
			ch.observer.observe(msg);
			ch.updateTab();
		}
	}
	else {
		tl.insertBefore(msg, before);
	}

	maintainMessageLimit(tl);
}

/**
 * @param { Element } tl 
 */
function maintainMessageLimit(tl) {
	var channel = tl.channel;
	var children = Array.from(tl.children);
	if (children.length > settings.maxMessages) {
		var delta = children.length - settings.maxMessages;

		var toDelete = children.slice(0, delta);

		for (var m of toDelete) {
			channel.oldScroll -= m.clientHeight;

			removeMessage(m);
		}
	}
}

function removeMessage(mi) {
	var mo = mi.message;
	if (mo) delete messagesById[mo.messageId()];
	mi.remove();
}

function playMentionSound() {
	var a = document.createElement("audio");
	a.src = "/assets/sounds/notification/waterdrop.ogg";
	a.autoplay = true;
	a.style.display = "none";
	document.body.appendChild(a);
}

/**
 * @param { Channel } channel 
 * @param { Message } pm 
 */
function getBadgeElement(channel, pm) {
	var bl = document.createElement("span");
	bl.classList.add("badges");

	var blist = channel.hchannel.getBadgesForMessage(pm);
	for (const ba of blist) {
		const bi = document.createElement("img");
		if (ba == undefined) continue;
		bi.src = ba.img;
		bi.classList.add("badge");
		bi.classList.add("badge-" + ba.id);
		// bi.alt = ba.title;
		bi.style.background = ba.backgroundStyle;
		bl.appendChild(bi);

		bi.onmouseover = () => {
			const tex = document.createElement("div");
			tex.classList.add("emoteTooltip");

			const timg = document.createElement("img");
			timg.src = ba.img;

			tex.appendChild(timg);
			tex.appendChild(document.createTextNode(ba.title));
			if (ba.description && ba.description != ba.title) {
				tex.appendChild(document.createElement("br"));
				tex.appendChild(document.createTextNode(ba.description));
			}

			showTooltip(bl, tex);
		};
	}
	return bl;
}

/**
 * @param { Channel } channel 
 * @param { Message } pm 
 */
function getMessageComponentsElement(channel, pm, mentionCb = undefined) {
	var ms = document.createElement("span");

	var comps = channel.hchannel.foldMessageComponents(channel.hchannel.parseMessageComponents(pm.tcontent ?? pm.content, pm));
	for (c of comps) {
		if (c instanceof Emote) {
			ms.appendChild(createEmoteElement(c));
		}
		else if (c instanceof Link) {
			var a = document.createElement("a");
			a.classList.add("link");
			a.href = c.url;
			a.innerText = c.text;
			a.target = "_blank";
			ms.appendChild(a);
		}
		else if (c instanceof Mention) {
			var s = document.createElement("span");
			s.classList.add("mention");
			s.innerText = "@" + c.username;
			s.style.color = cachedUserColors.get(c.username.toLowerCase());
			ms.appendChild(s);

			if (mentionCb) mentionCb(c.username);
		}
		else if (c instanceof CheerMote) {
			var s = document.createElement("span");
			s.classList.add("cheer");
			s.style.color = c.color;

			var imgspan = document.createElement("span");
			imgspan.classList.add("emote");

			var img = document.createElement("img");
			img.src = c.urls[3];
			img.alt = c.name;

			imgspan.appendChild(img);
			s.appendChild(imgspan);
			s.appendChild(document.createTextNode(c.value));

			ms.appendChild(s);
		}
		else {
			ms.appendChild(document.createTextNode(c));
		}
	}

	return ms;
}

/**
 * @param { Channel } channel 
 * @param { Message } pm 
 */
function getFullMessageElement(channel, pm, mentionCb = undefined) {
	var mi = document.createElement("span");

	var namecolor = pm.tags.color;
	cachedUserColors.set(pm.username(), namecolor);
	cachedUsernames.set(pm.userId(), pm.displayName());

	var isAction = false;
	if (pm.content.startsWith("ACTION") && pm.content[pm.content.length - 1] == "") {
		isAction = true;
		if (namecolor) {
			mi.style.color = namecolor;
		}
		mi.classList.add("action");
		pm.tcontent = pm.content.substring("ACTION".length, pm.content.length - 1);
	}

	// Badges
	{
		mi.appendChild(getBadgeElement(channel, pm));
	}

	// Username
	{
		var nameSpan = document.createElement("b");
		nameSpan.classList.add("username");
		nameSpan.innerText = pm.displayName();
		if (!isAction)
			nameSpan.innerText += ": ";
		if (namecolor)
			nameSpan.style.color = namecolor;
		mi.appendChild(nameSpan);
	}

	var comps = getMessageComponentsElement(channel, pm, mentionCb);
	if (isAction && namecolor)
		comps.style.color = namecolor;
	mi.appendChild(comps);

	return mi;
}

/**
 * @param { Emote } e 
 */
function createEmoteElement(c) {
	var info = c.info;

	if (info instanceof Function) {
		debugger;
	}

	const img = document.createElement("img");
	img.src = c.info.getImageURL(settings.emoteSize);
	img.loading = "lazy";
	img.alt = c.info.getName();

	const imgspan = document.createElement("span");
	imgspan.emote = c;
	imgspan.classList.add("emote");
	imgspan.appendChild(img);

	var overlays = c.overlays;

	imgspan.onmouseover = (ev) => {
		const c = ev.currentTarget.emote;
		const info = c.info;
		const overlays = c.overlays;

		var tex = document.createElement("div");
		tex.classList.add("emoteTooltip");

		var timg = document.createElement("img");
		timg.src = info.getImageURL(settings.emoteSize);
		tex.appendChild(timg);
		if (info.provider != "emoji")
			tex.appendChild(document.createTextNode(info.getName()));
		else
			tex.appendChild(document.createTextNode(info.name));

		if (overlays.length) {
			tex.appendChild(document.createElement("br"));
			tex.appendChild(document.createTextNode("Overlays:"));

			for (ov of overlays) {
				const timg = document.createElement("img");
				timg.src = ov.info.getImageURL(settings.emoteSize);
				tex.appendChild(timg);
				tex.appendChild(document.createTextNode(ov.info.getName()));
			}
		}

		showTooltip(imgspan, tex);
	};

	for (ov of overlays) {
		const img = document.createElement("img");
		img.loading = "lazy";
		img.src = ov.info.getImageURL(settings.emoteSize);
		img.alt = c.info.getName();

		imgspan.appendChild(img);
	}

	return imgspan;
}

function authRedirect() {
	var scopes = encodeURIComponent(["user:read:email", "clips:edit", "chat:read", "chat:edit", "channel:moderate", "whispers:read", "whispers:edit", "moderation:read", "channel:read:hype_train", "user:read:blocked_users", "user:manage:blocked_users", "user:read:follows", "channel:manage:polls", "channel:manage:predictions", "channel:read:polls", "channel:read:predictions", "moderator:read:automod_settings", "moderator:manage:automod_settings", "moderator:manage:banned_users", "moderator:read:blocked_terms", "moderator:manage:blocked_terms", "moderator:read:chat_settings", "moderator:manage:chat_settings", "channel:manage:raids", "moderator:manage:announcements", "moderator:manage:chat_messages", "user:manage:chat_color", "channel:manage:moderators", "channel:read:vips", "channel:manage:vips", "user:manage:whispers", "moderator:read:shield_mode", "moderator:manage:shield_mode", "moderator:read:shoutouts", "moderator:manage:shoutouts", "channel:bot", "user:bot", "user:read:chat", "user:read:moderated_channels", "user:write:chat", "user:read:emotes", "moderator:read:unban_requests", "moderator:manage:unban_requests"].join(' '));
	window.location.replace(`https://id.twitch.tv/oauth2/authorize?client_id=${clientID}&redirect_uri=${encodeURIComponent(window.location.href)}&response_type=token&scope=${scopes}`);
}

/**
 * @param { Element } parent 
 * @param { Element } what 
 */
function showTooltip(parent, what, clickable = false) {
	if (clickable) {
		if (contextMenu)
			contextMenu.remove();
		contextMenu = what;
	}
	else {
		if (tooltip)
			tooltip.remove();
		tooltip = what;
	}
	document.body.appendChild(what);

	what.classList.add("tooltip");
	if (clickable)
		what.classList.add("contextMenu");

	var tipBbox = what.getBoundingClientRect();

	var x, y;
	if (parent instanceof Element) {
		var parentBbox = parent.getBoundingClientRect();
		x = (parentBbox.right - (parentBbox.width / 2)) - (tipBbox.width / 2)
		y = parentBbox.bottom;
		parent.onmouseout = () => { what.remove() };
	}
	else {
		x = parent[0];
		y = parent[1];
		document.body.appendChild(what);
	}

	if (y + tipBbox.height > document.body.clientHeight) {
		y = document.body.clientHeight - tipBbox.height - 1;
	}

	if (x < 0) x = 0;
	if (x + tipBbox.width > document.body.clientWidth) {
		x = document.body.clientWidth - tipBbox.width;
	}

	what.style.top = y + "px";
	what.style.left = x + "px";
}

class ChatClient {
	/** @type { WebSocket } */
	ws = null

	/** @type { Function } */
	onMessage = (msg) => { console.log(msg); };
	onConnect = (e) => { };
	onDisconnect = (e) => { };

	pingTimeoutTime = 5000;
	pingIntervalTime = 2000;
	pingTimeout;

	connectionTimeoutTime = 5000;
	connectionTimeout;

	/**
	 * @param { String } user 
	 * @param { String } token 
	 */
	constructor(user, token) {
		this.init(user, token);
	}

	/** @type { String } */
	username

	init(user, token) {
		if (this.ws)
			this.ws.close();

		this.username = user;

		this.connectionTimeout = setTimeout(() => {
			console.log("Could not open WebSocket in " + this.connectionTimeoutTime + "ms, trying again...");
			this.ws.close();
		}, this.connectionTimeoutTime);
		this.ws = new WebSocket("wss://irc-ws.chat.twitch.tv:443");
		this.ws.onopen = (ev) => {
			clearInterval(this.connectionTimeout);

			this.send("CAP REQ :twitch.tv/membership twitch.tv/tags twitch.tv/commands\n");
			if (user && token) {
				this.send("PASS oauth:" + token);
				this.send("NICK " + user);
				this.send("USER " + user);
			}
			else {
				this.send("NICK justinfan1234");
			}

			for (var m of this.pending)
				this.send(m);
			this.pending = [];

			for (var ch of this.joinedChannels) {
				this.send("JOIN #" + ch);
			}

			this.onConnect(ev);

			setTimeout(() => { this.sendPing(); }, this.pingIntervalTime);
		}

		this.ws.onmessage = (ev) => {
			for (var l of ev.data.split('\r\n')) {
				var pm = parseMessage(l);
				if (pm && pm.command) {
					if (pm.command.command == "PING") {
						this.send("PONG :tmi.twitch.tv " + pm.content + "\n");
					}
					if (pm.command.command == "PONG") {
						setTimeout(() => { this.sendPing(); }, this.pingIntervalTime);
					}
					else if (pm.command.command == "RECONNECT") {
						this.ws.close();
					}
					else this.onMessage(pm);
				}
			}
		}

		this.ws.onerror = (ev) => {
			this.ws.close();
		};

		this.ws.onclose = (ev) => {
			this.onDisconnect(ev);
			clearTimeout(this.connectionTimeout);
			clearTimeout(this.pingTimeout);

			setTimeout(() => {
				this.init(user, token);
			}, 1000);
		}
	}

	sendPing() {
		clearTimeout(this.pingTimeout);
		this.ws.send("PING");
		this.pingTimeout = setTimeout(() => {
			console.log("Server did not PONG in " + this.pingTimeoutTime + "ms, trying again...");
			this.ws.close();
		}, this.pingTimeoutTime);
	}

	pending = [];
	send(msg) {
		if (this.ws.readyState == 1)
			this.ws.send(msg + "\n");
		else this.pending.push(msg);
	}

	joinedChannels = [];
	join(channel) {
		channel = channel.toLowerCase();

		this.joinedChannels.push(channel);
		this.send("JOIN #" + channel.toLowerCase());
	}

	part(channel) {
		channel = channel.toLowerCase();

		var idx = this.joinedChannels.indexOf(channel);
		if (idx != -1)
			this.joinedChannels.splice(idx, 1);

		this.send("PART #" + channel.toLowerCase());
	}

	sendMessage(tags, channel, message) {
		this.send(tagsToString(tags) + "PRIVMSG #" + channel.toLowerCase() + " :" + message);
	}
}

async function testMessages() {
	var samples = (await (await fetch("/data/sample_messages.txt")).text()).split('\n');

	for (var i in samples) {
		var msg = parseMessage(samples[i]);
		msg.tags["room-id"] = selectedChannel.id + "";

		processMessage(msg);
	}
}

/**
 * @type { Channel[] }
 */
var channels = [];
/** @type { Channel } */
var selectedChannel = null;
class Channel {
	/** @type { String } */
	name;
	/** @type { Number } */
	id;
	/** @type { Element } */
	timeline;
	/** @type { HChatChannel } */
	hchannel;

	/** @type { Boolean } */
	autoscroll = true;
	/** @type { Boolean } */
	unread = false;
	/** @type { Element[] } */
	mentioningMessages = [];

	/** @type { IntersectionObserver } */
	observer = null;
	/**
	 * @param { IntersectionObserverEntry[] } e 
	 * @param { IntersectionObserver } observer
	 */
	onIntersect(e, observer) {
		var dirty = false;

		var tl = observer.root;
		var channel = tl.channel;

		for (var m of e) {
			if (m.isIntersecting) {
				if (m.target == tl.lastChild) {
					channel.unread = false;
					dirty = true;
				}

				var midx = channel.mentioningMessages.indexOf(m.target);
				if (midx != -1) {
					channel.mentioningMessages.splice(midx, 1);
					dirty = true;
				}

				observer.unobserve(m.target);
			}
		}

		if (dirty) {
			channel.updateTab();

		}
	}
	oldScroll = 0;

	close() {
		anonClient.part(this.name.toLowerCase());
	}

	updateTab() {
		var tab = this.timeline.tab;

		if (this.unread)
			tab.classList.add("unread");
		else tab.classList.remove("unread");

		if (this.mentioningMessages.length)
			tab.classList.add("mentioned");
		else tab.classList.remove("mentioned");
	}
}

/**
 * @param { Number } id
 * @returns { Channel | undefined }
 */
function getChannelById(id) {
	for (var i in channels) {
		var ch = channels[i];

		if (ch.id == id) return ch;
	}

	return undefined;
}

/**
 * @param { String } name 
 * @param { Number | undefined } id 
 * @returns { Channel }
 */
async function openChannelTab(name, id = undefined) {
	const ch = await openChannelChat(name, id);
	channels.push(ch);

	anonClient.join(ch.name.toLowerCase());

	const page = ch.timeline;
	page.channel = ch;
	const tab = document.createElement("button");
	tab.classList.add("channel");

	{
		tab.innerText = ch.name;

		const closeButton = document.createElement("button");
		closeButton.classList.add("closeButton");
		closeButton.classList.add("bi-x-lg");
		closeButton.onclick = () => { closeChannelTab(ch); };
		tab.appendChild(closeButton);

		channelList.appendChild(tab);
	}

	channelTabber.addPage(tab, page);

	ch.hchannel.init().then(async () => {
		ch.hchannel.getChannelCheermotes().then(() => { });

		var stopper = createElementWithText("div", "Loading recent messages...");
		if (ch.timeline.firstChild)
			ch.timeline.appendChild(stopper);
		else ch.timeline.insertBefore(stopper, ch.firstChild);

		new RecentMessagesAPI().getRecentMessages(ch.name.toLowerCase(), settings.recentMessagesLimit).then(msg => {
			if (!msg.erorr) {
				for (var m of msg.messages) {
					processMessage(parseMessage(m), stopper);
				}
				// stopper.scrollIntoView();
				stopper.remove();
			}
			else {
				stopper.innerText = "Failed to load message history" + msg.erorr_code + " - " + msg.erorr;
				// stopper.scrollIntoView();
			}
		});
	});

	for (var acc of accounts) {
		if (acc.state == AccountStateReady) {
			getTwitchEmotesForChannel(acc, ch.id).then(() => { });
		}
	}
}

function closeChannelTab(ch) {
	if (!ch) return;

	channelTabber.removePage(ch.timeline);

	ch.close();

	channels = channels.filter((v) => v != ch);
	saveChannels();
}

function saveChannels() {
	var dat = [];

	for (var i in channels) {
		var c = channels[i];

		var cdat = {
			name: c.name,
			id: c.id
		};
		dat.push(cdat);
	}

	localStorage.setItem("channels", JSON.stringify(dat));
}

function getSavedChannels() {
	var dat = localStorage.getItem("channels");
	if (!dat) return [];

	dat = JSON.parse(dat);
	return dat;
}

async function openChannelChat(name, id = undefined) {
	var ch = new Channel();
	if (!id) {
		var res = await hchat.Twitch.getUserByName(name);
		var user = res[0];
		name = user.displayName;
		id = Number(user.id);
	}
	ch.name = name;
	ch.id = id;
	ch.hchannel = new HChatChannel(hchat, ch.id);

	ch.timeline = document.createElement("div");
	ch.timeline.classList.add("timeline");

	ch.observer = new IntersectionObserver(ch.onIntersect, { root: ch.timeline });

	ch.oldScroll = ch.timeline.scrollTop;
	ch.timeline.addEventListener("scroll", (e) => {
		var newscroll = e.target.scrollTop;
		var channel = e.target.channel;
		if (newscroll < channel.oldScroll) {
			channel.autoscroll = false;
		}
		else if (newscroll >= channel.oldScroll) {
			var tl = channel.timeline;
			var toBottom = tl.scrollHeight - tl.scrollTop - tl.clientHeight;
			if (Math.abs(toBottom) < 16)
				channel.autoscroll = true;
		}

		channel.oldScroll = newscroll;
	});

	return ch;
}

var replyingToId = undefined;
function setReply(id) {
	replyingToId = id;

	var content = document.getElementById("replyContent");
	content.innerHTML = "";

	var replyingToBar = document.getElementById("replyingToBar");
	if (replyingToId) {
		replyingToBar.classList.remove("hidden");

		var msg = messagesById[replyingToId];
		if (msg) {
			content.appendChild(getFullMessageElement(selectedChannel, msg));
		}
		else {
			content.innerText = "Could not find message with ID " + replyingToId;
		}
	}
	else replyingToBar.classList.add("hidden");
}

var blockedUsers = [];

function isUserBlocked(user_id) {
	return blockedUsers.indexOf(user_id) != -1;
}

async function blockUser(user_id) {
	blockedUsers.push(user_id);
	removeBlockedMessages();
	return await hchat.Twitch.blockUser(user_id);
}

function removeBlockedMessages() {
	for (var ch of channels)
		for (var mi of ch.timeline.children) {
			var msg = mi.message;
			if (msg) {
				if (isUserBlocked(msg.userId()))
					mi.classList.add("blocked");
				else
					mi.classList.remove("blocked");
			}
		}
}

async function unblockUser(user_id) {
	var idx = blockedUsers.indexOf(user_id);

	if (idx != -1)
		blockedUsers.splice(idx, 1);

	removeBlockedMessages();

	return await hchat.Twitch.unblockUser(user_id);
}

function sendMessageFromInputBox(clear = true) {
	var text = textInput.value;
	sendMessage(text);

	if (!clear) {
		textInput.value = "";
		setReply();
		closeSuggestionBox();
	}
}

// Space followed by U+E0000
const spamBypassMagic = " \uDB40\uDC00";
var lastMessage = "";
/**
 * @param { String } msg 
 */
function sendMessage(msg) {
	if (msg == lastMessage)
		msg += spamBypassMagic;

	var ch = selectedChannel.name;

	var tags = {};
	if (!settings.hideHchatNonce) tags["client-nonce"] = "hchat,";
	if (replyingToId) tags["reply-parent-msg-id"] = replyingToId;
	activeAccount.irc.sendMessage(tags, ch, msg);

	lastMessage = msg;
}

const AccountStateChecking = 0;
const AccountStateExpired = -1;
const AccountStateReady = 1;
class Account {
	/** @type { String } */
	name
	/** @type { String } */
	id
	/** @type { String } */
	avatarUrl
	/** @type { String } */
	token
	/** @type { String } */
	type

	/** @type { Number } */
	state = AccountStateChecking
	/** @type { ChatClient } */
	irc
	/** @type { Object.<Number, Map<String, EmoteInfo> } */
	emotesForChannel = {}

	createTwitch() {
		var t = new TwitchAPI();
		t.clientID = clientID;
		t.token = this.token;
		t.userID = this.id;

		return t;
	}
}
/** @type { Account } */
var activeAccount;
/** @type { Account[] } */
var accounts = [];

/**
 * @param { Number } id
 * @returns { Account | undefined }
 */
function getAccountById(id) {
	for (var i in accounts) {
		var a = accounts[i];

		if (a.id == id) return a;
	}

	return null;
}

function loadSavedAccounts() {
	var accs = [];

	var accjson = localStorage.getItem("accounts");
	if (!accjson) return accs;

	accjson = JSON.parse(accjson);

	for (var i in accjson) {
		var aj = accjson[i];

		var a = new Account();
		a.id = aj.id;
		a.name = aj.name;
		a.token = aj.token;
		a.avatarUrl = aj.avatarUrl;
		a.type = aj.type;

		accs.push(a);
	}

	return accs;
}

function saveAccounts() {
	var dat = [];

	for (var i in accounts) {
		var a = accounts[i];

		var aj = {};
		aj.id = a.id;
		aj.name = a.name;
		aj.token = a.token;
		aj.avatarUrl = a.avatarUrl;
		aj.type = a.type;

		dat.push(aj);
	}

	localStorage.setItem("accounts", JSON.stringify(dat));
}

/**
 * @param { Account } acc 
 */
function onAccountReady(acc) {
	acc.irc = new ChatClient(acc.name.toLowerCase(), acc.token);
	acc.irc.onMessage = (msg) => {
		if (msg.command == "CLEARCHAT" || msg.command == "CLEARMSG")
			return;

		if (msg.command == "GLOBALUSERSTATE" && msg.userId() == acc.id) {
			// VIP and mod stuff
		}
		processMessage(msg);
	};

	acc.createTwitch().getBlocklist().then(a => {
		if (a) {
			blockedUsers = [...blockedUsers, ...a.map(o => {
				var id = Number(o.user_id);
				cachedUsernames.set(id, o.display_name);
				return Number(id);
			})];
			removeBlockedMessages();
		}
	});

	for (var ch of channels) {
		getTwitchEmotesForChannel(acc, ch.id).then(() => { });
	}
}

/**
 * @param { Account } account 
 * @param { Number } channel_id 
 */
async function getTwitchEmotesForChannel(account, channel_id) {
	var t = account.createTwitch();

	account.emotesForChannel[channel_id] = new Map();
	var r = await t.getOwnedEmotesWithFollowerEmotes(channel_id);
	if (r) {
		for (var e of r) {
			var ei = new EmoteInfo();
			ei.provider = "twitch";

			ei.id = e.id;
			ei.name = e.name;

			ei.urls = hchat.twitchEmoteOverrides.get(e.id);
			if (!ei.urls) {
				ei.urls = {};
				for (var s in e.scale) {
					var num = Number(s);
					ei.urls[num] = "https://static-cdn.jtvnw.net/emoticons/v2/" + e.id + "/default/dark/" + s + ".0";
				}
			}

			account.emotesForChannel[channel_id].set(ei.id, ei);
		}
	}
}

function onAccountChanged() {
	if (activeAccount) {
		if (activeAccount.state == AccountStateExpired) {
			hchat.Twitch.token = undefined;
			hchat.Twitch.userID = 0;

			textInput.disabled = true;
			textInput.placeholder = "Login for @" + activeAccount.name + " has expired. Please log in again.";
		}
		else {
			hchat.Twitch.token = activeAccount.token;
			hchat.Twitch.userID = activeAccount.id;

			textInput.disabled = false;
			textInput.placeholder = "Send message as @" + activeAccount.name + "...";
		}

		{
			accountButton.classList.remove("bi-person");
			currentAccountAvatar.style.display = "inline";
			currentAccountAvatar.src = activeAccount.avatarUrl;
		}
	}
	else {
		hchat.Twitch.token = undefined;
		hchat.Twitch.userID = 0;

		textInput.disabled = true;
		textInput.placeholder = "You need to log in to send messages.";
		currentAccountAvatar.style.display = "none";
		accountButton.classList.add("bi-person");
	}
}

/**
 * @param { File } f
 */
function uploadFile(f) {
	const fr = new FileReader();
	fr.readAsArrayBuffer(f);
	fr.onload = async () => {
		const uploadMessage = document.createElement("div");
		uploadMessage.classList.add("upload");
		const upText = document.createTextNode("Uploading " + f.name + "...");
		uploadMessage.appendChild(upText);

		timelinePush(selectedChannel.timeline, uploadMessage);

		var uploader = new Uploader();
		uploader.url = settings.uploaderUrl;
		uploader.field = settings.uploaderField;
		uploader.linkFormat = settings.uploaderLinkFormat;
		uploader.deleteFormat = settings.uploaderDeleteFormat;

		var onProgress = undefined;
		if (settings.uploaderUploadProgress) {
			const bar = document.createElement("progress");
			uploadMessage.appendChild(bar);
			onProgress = (e) => {
				bar.max = e.total;
				bar.value = e.loaded;
				var precentage = (e.loaded / e.total) * 100;
				precentage -= precentage % 1;

				upText.textContent = "Uploading " + f.name + "... " + precentage + "%";
			}
		}

		uploader.upload(new Blob([fr.result], { type: f.type }), f.name,
			onProgress,
			(r) => {
				if (r.error) {
					var b = document.createElement("div");
					b.innerText = "Failed to upload " + f.name + ", check dev tools...";
					timelinePush(selectedChannel.timeline, b);
					console.log(r.error);
				}
				else {
					var c = document.createElement("div");
					c.style.flexDirection = "column";
					{
						var b = document.createElement("div");
						b.innerText = "File uploaded to ";

						var a = document.createElement("a");
						a.href = r.link;
						a.innerText = r.link;
						a.target = "_blank";

						b.appendChild(a);
						c.appendChild(b);
					}

					if (r.delete) {
						var b = document.createElement("div");
						b.innerText = "Delete link: ";

						var a = document.createElement("a");
						a.href = r.delete;
						a.innerText = r.delete;
						a.target = "_blank";

						b.appendChild(a);
						c.appendChild(b);
					}

					timelinePush(selectedChannel.timeline, c);
					pushInputText(r.link);
				}
			});
	};
}

var settingsPage;
function openSettings() {
	if (settingsPage) {
		channelTabber.switchPage(settingsPage);
		return;
	}

	settingsPage = document.createElement("div");
	settingsPage.classList.add("settings");

	var tab = document.createElement("button");
	tab.innerText = "Settings";

	const closeButton = document.createElement("button");
	closeButton.classList.add("closeButton");
	closeButton.classList.add("bi-x-lg");
	closeButton.onclick = (e) => { channelTabber.removePage(settingsPage); settingsPage = undefined; e.preventDefault(); };
	tab.appendChild(closeButton);
	channelList.appendChild(tab);

	channelTabber.addPage(tab, settingsPage);
	channelTabber.switchPage(settingsPage);

	function getIndexed(path) {
		var split = path.split('.');

		obj = this;
		for (var p of split)
			obj = obj[p];

		return obj;
	}

	function setIndexed(path, value) {
		var split = path.split('.');
		var finalProp = split[split.length - 1];
		split = split.splice(0, split.length - 1);

		obj = this;

		for (var p of split)
			obj = obj[p];

		return obj[finalProp] = value;
	}

	var blockListSelect;
	function createBlockList() {
		blockListSelect.innerHTML = "";

		for (var u of blockedUsers) {
			var o = document.createElement("option");
			o.innerText = cachedUsernames.get(u) ?? u;
			o.value = u;
			blockListSelect.appendChild(o);
		}
	}
	// Content
	{
		var settingsContent = document.createElement("div");
		settingsContent.classList.add("content");
		settingsPage.appendChild(settingsContent);

		function createCheckbox(key, text) {
			const d = document.createElement("div");

			const cb = document.createElement("input");
			cb.type = "checkbox";
			cb.checked = getIndexed(key);

			cb.onchange = () => { setIndexed(key, cb.checked); saveSettings(); };

			const l = document.createElement("label");
			l.innerText = text;
			l.onclick = () => cb.click();

			d.appendChild(cb);
			d.appendChild(l);

			settingsContent.appendChild(d);
		}

		function createNumberInput(key, title, description, min, max, step = 1) {
			settingsContent.appendChild(createElementWithText("h3", title));
			settingsContent.appendChild(createElementWithText("div", description));

			const si = document.createElement("input");
			const ni = document.createElement("input");

			if (min != Infinity && max != Infinity) {
				si.type = "range";
				si.min = min;
				si.max = max;
				si.step = step;
				si.value = getIndexed(key);

				si.oninput = () => {
					var val = si.value;
					if (val < min) {
						val = min;
						si.value = val;
					}
					else if (val > max) {
						val = max;
						si.value = val;
					}

					setIndexed(key, si.value);
					ni.value = si.value;
					saveSettings();
				};
				settingsContent.appendChild(si);
			}

			ni.type = "number";
			ni.classList.add("forSlider");
			ni.min = min;
			ni.max = max;
			ni.step = step;
			ni.value = getIndexed(key);
			ni.oninput = () => {
				var val = ni.value;
				if (val < min) {
					val = min;
					ni.value = val;
				}
				else if (val > max) {
					val = max;
					ni.value = val;
				}

				setIndexed(key, ni.value);
				si.value = ni.value;
				saveSettings();
			};

			settingsContent.appendChild(ni);
		}

		function createTextbox(key, title, description) {
			settingsContent.appendChild(createElementWithText("h3", title));
			settingsContent.appendChild(createElementWithText("div", description));

			const tb = document.createElement("input");
			tb.type = "text";
			tb.id = "setting-" + key;
			tb.value = getIndexed(key);
			tb.onchange = () => { setIndexed(key, tb.value); saveSettings(); };
			settingsContent.appendChild(tb);
		}

		{
			{
				var about = document.createElement("div");
				about.classList.add("about");

				var img = document.createElement("img");
				img.classList.add("icon");
				img.src = "/icon.svg";
				about.appendChild(img);

				{
					var d = document.createElement("div");
					d.appendChild(createElementWithText("h1", "HChat"));
					d.appendChild(createElementWithText("div", "Last updated " + localStorage.getItem("lastUpdated")));
					about.appendChild(d);
				}

				{
					var d = document.createElement("div");
					d.classList.add("links");
					{
						var a = createElementWithText("a", "Source Code");
						a.href = gitPage;
						a.target = "_blank";
						d.appendChild(a);
					}
					{
						var a = createElementWithText("a", "Report an issue");
						a.href = issuesPage;
						a.target = "_blank";
						d.appendChild(a);
					}
					about.appendChild(d);
				}

				settingsContent.appendChild(about);
			}

			settingsContent.appendChild(createElementWithText("h1", "Settings"));

			createNumberInput("settings.zoom", "Zoom", "", 0.5, 2.0, 0.1);
			createCheckbox("settings.hideAppInstallButton", "Hide app install button");
			createCheckbox("settings.hideHchatUserBadge", "Hide HChat user badges");
			createCheckbox("settings.hideHchatNonce", "Hide my HChat user badge");
			createNumberInput("settings.maxMessages", "Max messages", "The maximum amount of message in a timeline. Lower values may improve performacne", 50, 2000);
			createCheckbox("settings.developer", "Developer mode");

			settingsContent.appendChild(createElementWithText("h2", "Emotes"));
			settingsContent.appendChild(createElementWithText("div", "These settings will require an app restart"));
			createNumberInput("settings.emoteSize", "Emote resolution", "The maximum vertical emote resolution multiplier", 1, 4);
			createCheckbox("settings.oldPogChamp", "Return old PogChamp");

			settingsContent.appendChild(createElementWithText("h2", "Account"));
			settingsContent.appendChild(createElementWithText("h3", "Blocked users"));
			{
				blockListSelect = document.createElement("select");
				blockListSelect.size = 6;
				blockListSelect.classList.add("blocklist");
				settingsContent.appendChild(blockListSelect);

				var unblock = createElementWithText("button", "Unblock");
				unblock.onclick = () => {
					unblockUser(Number(blockListSelect.value)).then(() => { });
					blockListSelect.querySelector("option:checked").remove();
				}
				settingsContent.appendChild(unblock);

			}
			settingsContent.appendChild(createElementWithText("h2", "Recent messages"));
			createNumberInput("settings.recentMessagesLimit", "Recent messages limit", "The amount of messages to fecth from the recent messages service", 0, 900);

			settingsContent.appendChild(createElementWithText("h2", "File uploader"));
			createTextbox("settings.uploaderUrl", "Upload URL", "");
			createTextbox("settings.uploaderField", "File field", "");
			createTextbox("settings.uploaderLinkFormat", "Link format", "");
			createTextbox("settings.uploaderDeleteFormat", "Delete format", "");
			createCheckbox("settings.uploaderUploadProgress", "Monitor upload progress");
		}
	}

	createBlockList();

	settingsPage.onShown = createBlockList;
}

function createElementWithText(type, text) {
	var e = document.createElement(type)
	e.innerText = text;
	return e;
}

class Settings {
	constructor() {
		Object.defineProperty(this, "zoom", {
			get: () => { return this._zoom },
			set: (v) => { this._zoom = v; document.body.style.zoom = v },
		})

		Object.defineProperty(this, "hideHchatUserBadge", {
			get: () => { return this._hideHchatUserBadge },
			set: (v) => {
				this._hideHchatUserBadge = v;
				if (v)
					document.body.classList.add("hidehchatuserbadge");
				else
					document.body.classList.remove("hidehchatuserbadge");
			},
		})

		Object.defineProperty(this, "hideAppInstallButton", {
			get: () => { return this._hideAppInstallButton },
			set: (v) => {
				this._hideAppInstallButton = v;
				if (v)
					document.body.classList.add("hideappinstallbutton");
				else
					document.body.classList.remove("hideappinstallbutton");
			},
		})
	}

	_zoom = 1
	_hideAppInstallButton = false
	_hideHchatUserBadge = false
	hideHchatNonce = false

	developer = false

	emoteSize = 3
	oldPogChamp = true

	maxMessages = 1000

	recentMessagesLimit = 900

	uploaderUrl = "https://kappa.lol/api/upload"
	uploaderField = "file"
	// uploaderHeaders
	uploaderLinkFormat = "{link}"
	uploaderDeleteFormat = "{delete}"
	uploaderUploadProgress = true
}
var settings = new Settings();

function saveSettings() {
	localStorage.setItem("settings", JSON.stringify(settings));
}

function loadSettings() {
	var s = localStorage.getItem("settings");
	if (!s) return;

	var j = JSON.parse(s);
	settings = Object.assign(settings, j);
	settings.zoom = settings.zoom;
	settings.hideHchatUserBadge = settings.hideHchatUserBadge;
	settings.hideAppInstallButton = settings.hideAppInstallButton;
}

class Tabber {
	/** @type { Element } */
	tabList
	/** @type { Element } */
	pageList
	/** @type { Element } */
	currentPage
	onPageClosed = (page) => { }
	onPageSwitched = (page) => { }

	constructor(tabs, pages) {
		this.tabList = tabs
		this.pageList = pages

		setInterval(() => {
			if (!this.pageList.contains(this.currentPage)) {
				var tab = this.tabList.children[0];
				if (tab && tab.page)
					this.switchPage(tab.page);
			}
		}, 100);
	}

	addPage(tab, page) {
		tab.page = page;
		page.tab = tab;

		tab.onclick = (e) => {
			this.switchPage(page);
			e.preventDefault();
		};

		this.tabList.appendChild(tab);
		this.pageList.appendChild(page);

		page.classList.add("hidden");

		if (!this.currentPage)
			this.switchPage(page);
	}

	removePage(page) {
		if (page.tab)
			page.tab.remove();

		page.remove();

		if (page == this.currentPage) {
			this.currentPage = null;
			if (this.tabList.children[0]) {
				this.switchPage(this.tabList.children[0].page);
			}
			else this.switchPage(this.pageList.children[0]);
		}
	}

	removeAllPages() {
		for (var t of this.tabList.children) {
			this.removePage(t.page);
		}
	}

	switchPage(page) {
		if (page == this.currentPage) return;

		if (this.currentPage) this.onPageClosed(this.currentPage);

		this.currentPage = page;
		this.onPageSwitched(page);
		if (page.onShown) page.onShown();

		for (var p of this.pageList.children) {
			if (p == page) {
				p.classList.remove("hidden");
				if (p.tab)
					p.tab.classList.add("active");
			}
			else {
				p.classList.add("hidden");
				if (p.tab)
					p.tab.classList.remove("active");
			}
		}

		if (page.tab) {
			page.tab.scrollIntoView({ behavior: 'smooth', block: 'center' });
		}
	}
}
/** @type { Tabber } */
var channelTabber;
/** @type { Tabber } */
var emoteTabber;

function openEmojiList() {
	closeEmojiList();

	var list = document.getElementById("emojiList");
	tlbox.classList.add("hidden");

	if (selectedChannel) {
		{
			var btn = document.createElement("button");
			btn.innerText = "Twitch Emotes";

			var page = document.createElement("div");
			page.list = activeAccount.emotesForChannel[selectedChannel.id] ?? new Map();
			emoteTabber.addPage(btn, page);
		}

		{
			var btn = document.createElement("button");
			btn.innerText = "Channel Emotes";

			var page = document.createElement("div");
			page.list = selectedChannel.hchannel.channelEmotes;
			emoteTabber.addPage(btn, page);
		}
	}

	{
		var btn = document.createElement("button");
		btn.innerText = "Global Emotes";

		var page = document.createElement("div");
		page.list = selectedChannel.hchannel.hchat.globalEmotes;
		emoteTabber.addPage(btn, page);
	}

	{
		var btn = document.createElement("button");
		btn.innerText = "Emojis";

		var page = document.createElement("div");
		page.list = selectedChannel.hchannel.hchat.uniToEmoji;
		emoteTabber.addPage(btn, page);
	}

	list.classList.remove("hidden");
}

function closeEmojiList() {
	var list = document.getElementById("emojiList");

	tlbox.classList.remove("hidden");
	list.classList.add("hidden");

	emoteTabber.tabList.innerHTML = "";
	emoteTabber.pageList.innerHTML = "";
}

function pushInputText(tx) {
	if (textInput.value && textInput.value[textInput.value.length - 1] != ' ') {
		textInput.value += ' ';
	}
	textInput.value += tx;
}

class AutocompleteSuggestion {
	image = ""
	text = ""
}

var suggestionBox;
var suggestionIndex = 0;
function suggestAutocomplete() {
	if (suggestionBox)
		suggestionBox.remove();
	suggestionIndex = 0;

	var text = textInput.value;

	text = text.slice(0, textInput.selectionStart);
	{
		var idx = text.lastIndexOf(' ');
		if (idx != -1)
			text = text.slice(idx + 1);
	}
	if (text.length <= 2) return;

	if (text.length) {
		text = text.toLowerCase();

		/** @type { Iterator } */
		var it;

		if (text[0] == ':')
			it = getEmoteSuggestions(text.slice(1));
		else if (text[0] == '@')
			it = getMentionSuggestions(text.slice(1));
		else
			it = getEmoteOrMentionSuggestions(text);

		var suggs = [];
		var res = it.next();
		while (!res.done) {
			var v = res.value;
			if (v)
				suggs.push(v);

			res = it.next();
		}

		if (suggs.length) {
			suggestionBox = document.createElement("div");
			suggestionBox.classList.add("autocomplete");
			suggestionBox.classList.add("contextMenu");
			suggestionBox.classList.add("tooltip");
			document.body.appendChild(suggestionBox);

			for (const s of suggs) {
				var c = document.createElement("div");

				if (s.image) {
					var img = document.createElement("img");
					img.src = s.image;
					c.appendChild(img);
				}

				c.appendChild(document.createTextNode(s.text));

				c.onclick = () => { suggestionPush(s.text); };
				suggestionBox.appendChild(c);
			}

			var rect = textInput.getBoundingClientRect();
			var x = rect.left;
			var y = rect.top - suggestionBox.clientHeight;

			suggestionBox.style.top = y + "px";
			suggestionBox.style.left = x + "px";

			moveSelectionCursor(-1);
		}
	}
}

function moveSelectionCursor(by) {
	if (!suggestionBox) return;

	var old = suggestionIndex;

	suggestionIndex += by;
	if (suggestionIndex == -1)
		suggestionIndex = suggestionBox.children.length - 1;
	else suggestionIndex %= suggestionBox.children.length;

	var oldElem = suggestionBox.children[old];
	if (oldElem) oldElem.classList.remove("active");

	var newElem = suggestionBox.children[suggestionIndex];
	if (newElem) {
		newElem.classList.add("active");
		newElem.scrollIntoView();
	}
}

function suggestionPush(text) {
	var pre = "";

	var idx = textInput.value.lastIndexOf(' ', textInput.selectionStart);
	if (idx != -1) pre = textInput.value.slice(0, idx + 1);

	var post = textInput.value.slice(textInput.selectionStart, textInput.value.length);

	textInput.value = pre + text + " " + post;
	textInput.selectionStart = pre.length + text.length + 1;
	textInput.focus();

	closeSuggestionBox();
}

function closeSuggestionBox() {
	suggestionBox.remove();
	suggestionBox = undefined;
}

function* getEmoteSuggestions(text) {
	for (var map of [
		activeAccount.emotesForChannel[selectedChannel.id],
		selectedChannel.hchannel.channelEmotes,
		hchat.globalEmotes,
		hchat.emojis]) {

		for (var u of map.values()) {
			if (u.getName().toLowerCase().includes(text)) {
				var sug = new AutocompleteSuggestion();
				sug.text = u.getName();
				sug.image = u.getImageURL(settings.emoteSize);

				yield sug;
			}
			else yield;
		}
	}
}

function* getMentionSuggestions(text) {
	for (var u of cachedUsernames.values()) {
		if (u.toLowerCase().includes(text)) {
			var sug = new AutocompleteSuggestion();
			sug.text = "@" + u;
			yield sug;
		}
		else yield;
	}
}

function* getEmoteOrMentionSuggestions(text) {
	var it = getEmoteSuggestions(text);

	var res = it.next();
	while (!res.done) {
		yield res.value;
		res = it.next();
	}

	it = getMentionSuggestions(text);
	res = it.next();
	while (!res.done) {
		yield res.value;
		res = it.next();
	}
}
