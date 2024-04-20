const clientID = "atu01l1tzhhfpzobn87uwwllq5pt4e";

var cachedUserColors = new Map()

var sendButton;
var textInput;

/** @type { ChatClient } */
var anonClient;

var hchat = new HChat();
var tlbox;
var channelList;
var accountButton;
var currentAccountAvatar;
var dropZone;

/** @type { Element } */
var tooltip;

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

	console.log("Cached date: " + cachedDate);
	console.log("Fresh date: " + freshDate);

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

		if (selectedChannel)
			textInput.parentElement.classList.remove("hidden");
		else
			textInput.parentElement.classList.add("hidden");
	};

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
			document.addEventListener("click", (ev) => {
				popup.remove();
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
		if (e.code == "PageDown")
		{
			channelTabber.currentPage.scrollBy(0, 1);
			return;
		}
		else if(e.code == "PageUp") {
			channelTabber.currentPage.scrollBy(0, -1);
			return;
		}
		else if (e.code == "Home")
		{
			channelTabber.currentPage.scrollTo(0, 0);
			return;
		}
		else if(e.code == "End") {
			channelTabber.currentPage.scrollTo(0, channelTabber.currentPage.scrollHeight);
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
			console.log('dragleave');
			hideDropZone();
		});

		dropZone.addEventListener('drop', handleDrop);
	}

	textInput.addEventListener("keydown", (ev) => {
		if (ev.keyCode == 13) {
			var text = textInput.value;
			sendMessage(text);

			if (!ev.ctrlKey) {
				textInput.value = "";
				setReply();
			}
			ev.preventDefault();
		}
	});

	sendButton.addEventListener("click", (ev) => {
		var text = textInput.value;
		sendMessage(text);
		textInput.value = "";
		setReply();
	});

	// HChat buttons
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
	await hchat.init();

	anonClient = new ChatClient();
	anonClient.onMessage = (msg) => {
		processMessage(msg);
	};

	var login = localStorage.getItem("login");
	if (login) {
		login = JSON.parse(login);

		hchat.Twitch.clientID = clientID;
		hchat.Twitch.token = login.token;

		hchat.getGlobalCheermotes().then(() => { });
	}

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

	mi.oncontextmenu = (ev) => {
		var menu = document.createElement("div");
		menu.classList.add("messageMenu");
		document.body.appendChild(menu);

		{
			var copyid = createElementWithText("button", "Copy message ID");
			copyid.onclick = () => {
				navigator.clipboard.writeText(pm.tags.id);
				menu.remove();
			};
			menu.appendChild(copyid);
		}

		{
			var reply = createElementWithText("button", "Reply to message");
			reply.onclick = () => {
				setReply(pm.tags.id);
				menu.remove();
			};
			menu.appendChild(reply);
		}

		setInterval(() => {
			document.addEventListener("click", (ev) => {
				menu.remove();
			});
		}, 0);

		showTooltip([ev.clientX, ev.clientY], menu, true);
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
						timelinePush(channel.time, mi, beforeElem);
						return;
					}
					break;
				case "raid":
					var raidFrom = pm.tags["msg-param-displayName"];
					var raidFromId = pm.tags["user-id"];

					mi.classList.add("raid");
					{
						var text = pm.tags["system-msg"];
						var li = document.createElement("li");
						li.classList.add("raid");
						li.innerText = text.replace("\n", "");

						micon.appendChild(li);
					}
					if (!pm.command.channel) {
						timelinePush(channel.timeline, mi, beforeElem);
						return;
					}
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
				if (mentioned)
					mi.classList.add("mentioned");
			}
		}
	}
	catch (e) {
		micon.appendChild(document.createTextNode("" + e));
		console.error(e);
	}

	timelinePush(channel.timeline, mi, beforeElem);
}

/**
 * @param { Element } tl 
 * @param { Element } msg 
 * @param { Element } before 
 */
function timelinePush(tl, msg, before = undefined) {
	var toBottom = tl.scrollHeight - tl.scrollTop - tl.parentElement.clientHeight;
	if (!before) tl.appendChild(msg);
	else tl.insertBefore(msg, before);

	if (Math.abs(toBottom) < 32)
		msg.scrollIntoView();

	maintainMessageLimit(tl);
}

/**
 * @param { Element } tl 
 */
function maintainMessageLimit(tl) {
	var children = Array.from(tl.children);
	if (children.length > settings.maxMessages) {
		var delta = children.length - settings.maxMessages;

		var toDelete = children.slice(0, delta);

		for (var m of toDelete) {
			var mo = m.message;
			if (mo) delete messagesById[mo.messageId()];
			m.remove();
		}
	}
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
	cachedUserColors.set(pm.user, namecolor);

	var isAction = false;
	// TODO: Don't modify the content
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
	var scopes = encodeURIComponent(["chat:edit", "chat:read", "user:read:chat", "whispers:read", "whispers:edit", "channel:moderate", "user:read:subscriptions", "user:read:follows", "user:manage:whispers", "user:manage:chat_color", "user:manage:blocked_users", "user:read:blocked_users"].join(' '));
	window.location.replace(`https://id.twitch.tv/oauth2/authorize?client_id=${clientID}&redirect_uri=${encodeURIComponent(window.location.href)}&response_type=token&scope=${scopes}`);
}

/**
 * @param { Element } parent 
 * @param { Element } what 
 */
function showTooltip(parent, what, clickable = false) {
	if (tooltip)
		tooltip.remove();

	tooltip = what;
	document.body.appendChild(tooltip);

	what.classList.add("tooltip");
	if (clickable)
		what.classList.add("clickableTooltip");

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

		this.ws = new WebSocket("wss://irc-ws.chat.twitch.tv:443");
		this.ws.onopen = (ev) => {
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

			this.ws.onmessage = (ev) => {
				for (var l of ev.data.split('\n')) {
					var pm = parseMessage(l);
					if (pm && pm.command) {
						if (pm.command.command == "PING") {
							this.send("PONG :tmi.twitch.tv " + pm.content + "\n");
						}
						else if (pm.command.command == "RECONNECT") {
							this.init(user, token);
						}
						else this.onMessage(pm);
					}
				}
			}
			this.ws.onerror = (ev) => {
				this.init(user, token);
			}
		}
	}

	pending = [];
	send(msg) {
		if (this.ws.readyState == 1)
			this.ws.send(msg + "\n");
		else this.pending.push(msg);
	}

	join(channel) {
		this.send("JOIN #" + channel.toLowerCase());
	}

	part(channel) {
		this.send("PART #" + channel.toLowerCase());
	}

	sendMessage(tags, channel, message) {
		this.send(tagsToString(tags) + "PRIVMSG #" + channel.toLowerCase() + " :" + message);
	}
}

function testMessages() {
	var samples = [
		"@badge-info=subscriber/4;badges=moderator/1,subscriber/3,sub-gifter/5;bits=2;color=#FF0000;display-name=69_faith_420;emotes=;flags=;id=c5fd49c7-ecbc-46dd-a790-c9f10fdaaa67;mod=1;room-id=111448817;subscriber=1;tmi-sent-ts=1567282184553;turbo=0;user-id=125608098;user-type=mod :69_faith_420!69_faith_420@69_faith_420.tmi.twitch.tv PRIVMSG #pajlada :cheer2 Stop what? I'm not doing anything.",
		"@badge-info=subscriber/4;badges=moderator/1,subscriber/3,sub-gifter/5;bits=2;color=#FF0000;display-name=69_faith_420;emotes=;flags=;id=397f4d2e-cac8-4689-922a-32709b9e8b4f;mod=1;room-id=111448817;subscriber=1;tmi-sent-ts=1567282159076;turbo=0;user-id=125608098;user-type=mod :69_faith_420!69_faith_420@69_faith_420.tmi.twitch.tv PRIVMSG #pajlada :cheer2 Who keeps getting their bits out now?",
		"@badge-info=subscriber/1;badges=subscriber/0,bits/1;bits=2;color=#FF0000;display-name=FlameGodFlann;emotes=;flags=;id=664ddc92-649d-4889-9641-208a6e62ef1e;mod=0;room-id=111448817;subscriber=1;tmi-sent-ts=1567282066199;turbo=0;user-id=56442185;user-type= :flamegodflann!flamegodflann@flamegodflann.tmi.twitch.tv PRIVMSG #pajlada :Cheer2 I'm saving my only can of Stella for your upcoming win, lets go!",
		"@badge-info=subscriber/3;badges=moderator/1,subscriber/3,bits/100;bits=10;color=#008000;display-name=k4izn;emotes=;flags=;id=3919af0b-93e0-412c-b238-d152f92ffea7;mod=1;room-id=111448817;subscriber=1;tmi-sent-ts=1567811485257;turbo=0;user-id=207114672;user-type=mod :k4izn!k4izn@k4izn.tmi.twitch.tv PRIVMSG #pajlada :Cheer1 Cheer1 Cheer1 Cheer1 Cheer1 Cheer1 Cheer1 Cheer1 Cheer1 Cheer1 Kleiner Cheer(s) !",
		"@badge-info=subscriber/12;badges=subscriber/12,bits/1000;bits=20;color=#00CCFF;display-name=YaBoiBurnsy;emotes=;flags=;id=5b53975d-b339-484f-a2a0-3ffbedde0df2;mod=0;room-id=111448817;subscriber=1;tmi-sent-ts=1567529634584;turbo=0;user-id=45258137;user-type= :yaboiburnsy!yaboiburnsy@yaboiburnsy.tmi.twitch.tv PRIVMSG #pajlada :ShowLove20",
		"@badge-info=subscriber/1;badges=moderator/1,subscriber/0,bits-leader/2;bits=1;color=;display-name=jdfellie;emotes=;flags=18-22:A.3/P.5;id=28c8f4b7-b1e3-4404-b0f8-5cfe46411ef9;mod=1;room-id=111448817;subscriber=1;tmi-sent-ts=1567668177856;turbo=0;user-id=137619637;user-type=mod :jdfellie!jdfellie@jdfellie.tmi.twitch.tv PRIVMSG #pajlada :Cheer1 take a bit bitch",
		"@badge-info=;badges=bits-leader/2;bits=30;color=#EC3B83;display-name=Sammay;emotes=;flags=;id=ccf058a6-c1f1-45de-a764-fc8f96f21449;mod=0;room-id=111448817;subscriber=0;tmi-sent-ts=1566719874294;turbo=0;user-id=58283830;user-type= :sammay!sammay@sammay.tmi.twitch.tv PRIVMSG #pajlada :ShowLove30 @Emperor_Zhang",
		"@badge-info=;badges=bits-leader/2;bits=6;color=#97E7FF;display-name=Emperor_Zhang;emotes=;flags=;id=53bab01b-9f6c-4123-a852-9916ab371cf9;mod=0;room-id=111448817;subscriber=0;tmi-sent-ts=1566719803345;turbo=0;user-id=105292882;user-type= :emperor_zhang!emperor_zhang@emperor_zhang.tmi.twitch.tv PRIVMSG #pajlada :uni6",
		"@badge-info=;badges=bits/1;bits=5;color=#97E7FF;display-name=Emperor_Zhang;emotes=;flags=;id=545caec6-8b5f-460a-8b4b-3e407e179689;mod=0;room-id=111448817;subscriber=0;tmi-sent-ts=1566704926380;turbo=0;user-id=105292882;user-type= :emperor_zhang!emperor_zhang@emperor_zhang.tmi.twitch.tv PRIVMSG #pajlada :VoHiYo5",
		"@badge-info=;badges=bits/100;bits=50;color=;display-name=Schmiddi55;emotes=;flags=;id=777f1018-941d-48aa-bf4e-ed8053d556c8;mod=0;room-id=111448817;subscriber=0;tmi-sent-ts=1567708393343;turbo=0;user-id=101444120;user-type= :schmiddi55!schmiddi55@schmiddi55.tmi.twitch.tv PRIVMSG #pajlada :cheer50 sere ihr radlertrinker",
		"@badge-info=subscriber/3;badges=subscriber/3,sub-gifter/10;bits=100;color=#0000FF;display-name=MLPTheChad;emotes=;flags=87-91:P.5;id=ed7db31e-884b-4761-9c88-b1676caa8814;mod=0;room-id=111448817;subscriber=1;tmi-sent-ts=1567681752733;turbo=0;user-id=63179867;user-type= :mlpthechad!mlpthechad@mlpthechad.tmi.twitch.tv PRIVMSG #pajlada :Subway100 bonus10 Statistically speaking, 10 out of 10 constipated people don't give a shit.",
		"@badge-info=subscriber/3;badges=subscriber/3,sub-gifter/10;bits=100;color=#0000FF;display-name=MLPTheChad;emotes=;flags=;id=506b482a-515a-4914-a694-2c69d2add23a;mod=0;room-id=111448817;subscriber=1;tmi-sent-ts=1567681618814;turbo=0;user-id=63179867;user-type= :mlpthechad!mlpthechad@mlpthechad.tmi.twitch.tv PRIVMSG #pajlada :Subway100 bonus10 That's some SUB par gameplay, Dabier.",
		"@badge-info=;badges=premium/1;bits=100;color=;display-name=AkiraKurusu__;emotes=;flags=;id=6e343f5d-0e0e-47f7-bf6d-d5d7bf18b95a;mod=0;room-id=111448817;subscriber=0;tmi-sent-ts=1567765732657;turbo=0;user-id=151679027;user-type= :akirakurusu__!akirakurusu__@akirakurusu__.tmi.twitch.tv PRIVMSG #pajlada :TriHard100",
		"@badge-info=;badges=premium/1;bits=1;color=;display-name=AkiraKurusu__;emotes=;flags=;id=dfdf6c2f-abee-4a4b-99fe-0d0b221f07de;mod=0;room-id=111448817;subscriber=0;tmi-sent-ts=1567765295301;turbo=0;user-id=151679027;user-type= :akirakurusu__!akirakurusu__@akirakurusu__.tmi.twitch.tv PRIVMSG #pajlada :TriHard1",
		"@badge-info=;badges=bits/100;bits=500;color=#0000FF;display-name=Stabbr;emotes=;flags=;id=e28b384e-fb6a-4da5-9a36-1b6153c6089d;mod=0;room-id=111448817;subscriber=0;tmi-sent-ts=1567648284623;turbo=0;user-id=183081176;user-type= :stabbr!stabbr@stabbr.tmi.twitch.tv PRIVMSG #pajlada :cheer500 Gotta be on top",
		"@badge-info=subscriber/1;badges=subscriber/0,bits-leader/1;bits=100;color=;display-name=dbf_sub;emotes=;flags=;id=7cf317b8-6e28-4615-a0ba-e0bbaa0d4b29;mod=0;room-id=111448817;subscriber=1;tmi-sent-ts=1567646349560;turbo=0;user-id=450101746;user-type= :dbf_sub!dbf_sub@dbf_sub.tmi.twitch.tv PRIVMSG #pajlada :EleGiggle100",
		"@badge-info=subscriber/1;badges=subscriber/0,bits/1;bits=1;color=;display-name=dbf_sub;emotes=;flags=;id=43b5fc97-e7cc-4ac1-8d7e-7504c435c3f1;mod=0;room-id=111448817;subscriber=1;tmi-sent-ts=1567643510222;turbo=0;user-id=450101746;user-type= :dbf_sub!dbf_sub@dbf_sub.tmi.twitch.tv PRIVMSG #pajlada :SeemsGood1",
		"@badge-info=;badges=bits-leader/2;bits=100;color=;display-name=RobertsonRobotics;emotes=;flags=;id=598dfa14-23e9-4e45-a2fe-7a0263828817;mod=0;room-id=111448817;subscriber=0;tmi-sent-ts=1567873463820;turbo=0;user-id=117177721;user-type= :robertsonrobotics!robertsonrobotics@robertsonrobotics.tmi.twitch.tv PRIVMSG #pajlada :firstCheer100 This is so cool! Can’t wait for the competition!",
		"@badge-info=;badges=bits/100;bits=18;color=#1E90FF;display-name=Vipacman11;emotes=;flags=;id=07f59664-0c75-459e-b137-26c8d03e44be;mod=0;room-id=111448817;subscriber=0;tmi-sent-ts=1567873210379;turbo=0;user-id=89634839;user-type= :vipacman11!vipacman11@vipacman11.tmi.twitch.tv PRIVMSG #pajlada :Cheer1 Cheer1 Cheer1 Cheer1 Cheer1 Cheer1 Cheer1 Cheer1 Cheer1 Cheer1 Cheer1 Cheer1 Cheer1 Cheer1 Cheer1 Cheer1 Cheer1 Cheer1",
		"@badge-info=;badges=sub-gifter/5;bits=100;color=#FF7F50;display-name=darkside_sinner;emotes=;flags=;id=090102b3-369d-4ce4-ad1f-283849b10de0;mod=0;room-id=111448817;subscriber=0;tmi-sent-ts=1567822075293;turbo=0;user-id=104942909;user-type= :darkside_sinner!darkside_sinner@darkside_sinner.tmi.twitch.tv PRIVMSG #pajlada :Subway100 bonus10",
		"@badge-info=;badges=sub-gifter/5;bits=200;color=#FF7F50;display-name=darkside_sinner;emotes=;flags=;id=2bdf7846-5ffa-4798-a397-997e7209a6d0;mod=0;room-id=111448817;subscriber=0;tmi-sent-ts=1567821695287;turbo=0;user-id=104942909;user-type= :darkside_sinner!darkside_sinner@darkside_sinner.tmi.twitch.tv PRIVMSG #pajlada :Subway200 bonus20",
		"@badge-info=;badges=bits/1;bits=50;color=#0000FF;display-name=SincereBC;emotes=;flags=;id=b8c9236b-aeb9-4c72-a191-593e33c6c3f1;mod=0;room-id=111448817;subscriber=0;tmi-sent-ts=1567818308913;turbo=0;user-id=146097597;user-type= :sincerebc!sincerebc@sincerebc.tmi.twitch.tv PRIVMSG #pajlada :cheer50",
		"@badge-info=;badges=bits/1;bits=1;color=#FF0000;display-name=AngryCh33s3puff;emotes=;flags=;id=6ab62185-ac1b-4ee5-bd93-165009917078;mod=0;room-id=111448817;subscriber=0;tmi-sent-ts=1567474810480;turbo=0;user-id=55399500;user-type= :angrych33s3puff!angrych33s3puff@angrych33s3puff.tmi.twitch.tv PRIVMSG #pajlada :cheer1 for the chair!",
		"@badge-info=subscriber/3;badges=moderator/1,subscriber/0,bits/1000;bits=1500;color=#5F9EA0;display-name=LaurenJW28;emotes=;flags=;id=2403678c-6109-43ac-b3b5-1f5230f91729;mod=1;room-id=111448817;subscriber=1;tmi-sent-ts=1567746107991;turbo=0;user-id=244354979;user-type=mod :laurenjw28!laurenjw28@laurenjw28.tmi.twitch.tv PRIVMSG #pajlada :Cheer1000 Cheer100 Cheer100 Cheer100 Cheer100 Cheer100",
		"@badge-info=;badges=bits/1;bits=5;color=#5F9EA0;display-name=drkwings;emotes=;flags=;id=ad45dae5-b985-4526-9b9e-0bdba2d23289;mod=0;room-id=111448817;subscriber=0;tmi-sent-ts=1567742106689;turbo=0;user-id=440230526;user-type= :drkwings!drkwings@drkwings.tmi.twitch.tv PRIVMSG #pajlada :SeemsGood1 SeemsGood1 SeemsGood1 SeemsGood1 SeemsGood1",
		"@badge-info=subscriber/16;badges=subscriber/12,bits/1000;bits=1;color=;display-name=mustangbugatti;emotes=;flags=;id=ee987ee9-46a4-4c06-bf66-2cafff5d4cdd;mod=0;room-id=111448817;subscriber=1;tmi-sent-ts=1567883658780;turbo=0;user-id=115948494;user-type= :mustangbugatti!mustangbugatti@mustangbugatti.tmi.twitch.tv PRIVMSG #pajlada :(In clarkson accent) Some say...the only number in his contacts is himself..... And...that he is the international butt-dial champion... All we know is.... HES CALLED THE STIG Cheer1",
		"@badge-info=subscriber/2;badges=subscriber/0,bits/1000;bits=1;color=;display-name=derpysaurus1;emotes=;flags=;id=c41c3d8b-c591-4db0-87e7-a78c5536de82;mod=0;room-id=111448817;subscriber=1;tmi-sent-ts=1567883655116;turbo=0;user-id=419221818;user-type= :derpysaurus1!derpysaurus1@derpysaurus1.tmi.twitch.tv PRIVMSG #pajlada :cheer1 OMG ur back yaaaaaaaaaaaaaaaaaaaaayyyyyyyyy",
		"@badge-info=subscriber/5;badges=subscriber/0,premium/1;bits=1;color=#8A2BE2;display-name=sirlordstallion;emotes=;flags=;id=61a87aeb-88b1-42f9-90f5-74429d8bf387;mod=0;room-id=111448817;subscriber=1;tmi-sent-ts=1567882978939;turbo=0;user-id=92145441;user-type= :sirlordstallion!sirlordstallion@sirlordstallion.tmi.twitch.tv PRIVMSG #pajlada :Cheer1 Alex is definetly not putting his eggs in Narreths basket",
		"@badge-info=subscriber/1;badges=subscriber/0,bits/1;bits=1;color=;display-name=xplosivegingerx;emotes=;flags=;id=f8aac1e0-050a-44bf-abcc-c0cf12cbedfc;mod=0;room-id=111448817;subscriber=1;tmi-sent-ts=1567882249072;turbo=0;user-id=151265906;user-type= :xplosivegingerx!xplosivegingerx@xplosivegingerx.tmi.twitch.tv PRIVMSG #pajlada :Cheer1",
		"@badge-info=;badges=bits/100;bits=500;color=;display-name=AlexJohanning;emotes=;flags=;id=4e4229a3-e7f2-4082-8c55-47d42db3b09c;mod=0;room-id=111448817;subscriber=0;tmi-sent-ts=1567881969862;turbo=0;user-id=190390930;user-type= :alexjohanning!alexjohanning@alexjohanning.tmi.twitch.tv PRIVMSG #pajlada :cheer500",
		"@badge-info=;badges=bits-leader/1;bits=245;color=;display-name=undonebunion6;emotes=;flags=;id=331ec583-0a80-4299-9206-0efd9e33d934;mod=0;room-id=111448817;subscriber=0;tmi-sent-ts=1567881553759;turbo=0;user-id=452974274;user-type= :undonebunion6!undonebunion6@undonebunion6.tmi.twitch.tv PRIVMSG #pajlada :cheer245 can I join?",
		"@badge-info=;badges=bits/100;bits=100;color=;display-name=therealruffnix;emotes=;flags=61-67:S.6;id=25f567ad-ac95-45ab-b12e-4d647f6a2345;mod=0;room-id=111448817;subscriber=0;tmi-sent-ts=1567524218162;turbo=0;user-id=55059620;user-type= :therealruffnix!therealruffnix@therealruffnix.tmi.twitch.tv PRIVMSG #pajlada :cheer100 This is the kind of ASMR I'm missing on YouTube and PornHub",
		"@badge-info=;badges=bits/1;bits=1;color=;display-name=BeamMeUpSnotty;emotes=;flags=;id=8022f41f-dcb8-42f2-b46a-04d4a99180bd;mod=0;room-id=111448817;subscriber=0;tmi-sent-ts=1567270037926;turbo=0;user-id=261679182;user-type= :beammeupsnotty!beammeupsnotty@beammeupsnotty.tmi.twitch.tv PRIVMSG #pajlada :SeemsGood1",
		"@badge-info=;badges=bits/1;bits=10;color=#00FF7F;display-name=EXDE_HUN;emotes=;flags=;id=60d8835b-23fa-418c-96ca-5874e5d5e8ba;mod=0;room-id=111448817;subscriber=0;tmi-sent-ts=1566654664248;turbo=0;user-id=129793695;user-type= :exde_hun!exde_hun@exde_hun.tmi.twitch.tv PRIVMSG #pajlada :PogChamp10",
		"@badge-info=;badges=bits-leader/3;bits=5;color=;display-name=slyckity;emotes=;flags=;id=fd6c5507-3a4e-4d24-8f6e-fadf07f520d3;mod=0;room-id=111448817;subscriber=0;tmi-sent-ts=1567824273752;turbo=0;user-id=143114011;user-type= :slyckity!slyckity@slyckity.tmi.twitch.tv PRIVMSG #pajlada :Cheer1 Cheer1 Cheer1 Cheer1 Cheer1",
		"@badge-info=;badges=bits-leader/3;bits=5;color=;display-name=slyckity;emotes=;flags=;id=7003f119-b9a6-4319-a1e8-8e99f96ab01a;mod=0;room-id=111448817;subscriber=0;tmi-sent-ts=1567824186437;turbo=0;user-id=143114011;user-type= :slyckity!slyckity@slyckity.tmi.twitch.tv PRIVMSG #pajlada :Cheer1 Cheer1 Cheer1 Cheer1 Cheer1",
		"@badge-info=;badges=bits-leader/3;bits=10;color=;display-name=slyckity;emotes=;flags=;id=3f7de686-77f6-46d2-919e-404312c6676f;mod=0;room-id=111448817;subscriber=0;tmi-sent-ts=1567824128736;turbo=0;user-id=143114011;user-type= :slyckity!slyckity@slyckity.tmi.twitch.tv PRIVMSG #pajlada :Cheer1 Cheer1 Cheer1 Cheer1 Cheer1 Cheer1 Cheer1 Cheer1 Cheer1 Cheer1",
		"@badge-info=;badges=bits-leader/3;bits=10;color=;display-name=slyckity;emotes=;flags=;id=9e830ed3-8735-4ccb-9a8b-80466598ca19;mod=0;room-id=111448817;subscriber=0;tmi-sent-ts=1567824118921;turbo=0;user-id=143114011;user-type= :slyckity!slyckity@slyckity.tmi.twitch.tv PRIVMSG #pajlada :Cheer1 Cheer1 Cheer1 Cheer1 Cheer1 Cheer1 Cheer1 Cheer1 Cheer1 Cheer1",
		"@badge-info=;badges=bits-leader/1;bits=377;color=#00FF7F;display-name=Baekjoon;emotes=;flags=;id=262f4d54-9b21-4f13-aac3-6d3b1051282f;mod=0;room-id=111448817;subscriber=0;tmi-sent-ts=1567440897074;turbo=0;user-id=73587716;user-type= :baekjoon!baekjoon@baekjoon.tmi.twitch.tv PRIVMSG #pajlada :NotLikeThis377",
		"@badge-info=;badges=bits-leader/1;bits=144;color=#00FF7F;display-name=Baekjoon;emotes=;flags=;id=3556e0ad-b5f8-4190-9c4c-e39c1940d191;mod=0;room-id=111448817;subscriber=0;tmi-sent-ts=1567440861545;turbo=0;user-id=73587716;user-type= :baekjoon!baekjoon@baekjoon.tmi.twitch.tv PRIVMSG #pajlada :bday144",
		"@badge-info=;badges=bits-leader/1;bits=89;color=#00FF7F;display-name=Baekjoon;emotes=;flags=;id=96e380a5-786d-44b8-819a-529b6adb06ac;mod=0;room-id=111448817;subscriber=0;tmi-sent-ts=1567440848361;turbo=0;user-id=73587716;user-type= :baekjoon!baekjoon@baekjoon.tmi.twitch.tv PRIVMSG #pajlada :SwiftRage89",
		"@badge-info=;badges=bits-leader/1;bits=34;color=#00FF7F;display-name=Baekjoon;emotes=;flags=;id=76239011-65fa-4f6a-a6d6-dc5d5dcbd674;mod=0;room-id=111448817;subscriber=0;tmi-sent-ts=1567440816630;turbo=0;user-id=73587716;user-type= :baekjoon!baekjoon@baekjoon.tmi.twitch.tv PRIVMSG #pajlada :MrDestructoid34",
		"@badge-info=;badges=bits-leader/1;bits=21;color=#00FF7F;display-name=Baekjoon;emotes=;flags=;id=4c05c97c-7b6c-4ae9-bc91-04e98240c1d5;mod=0;room-id=111448817;subscriber=0;tmi-sent-ts=1567440806389;turbo=0;user-id=73587716;user-type= :baekjoon!baekjoon@baekjoon.tmi.twitch.tv PRIVMSG #pajlada :TriHard21",
		"@badge-info=;badges=bits-leader/1;bits=8;color=#00FF7F;display-name=Baekjoon;emotes=;flags=;id=3b2ecce7-842e-429e-b6c8-9456c4646362;mod=0;room-id=111448817;subscriber=0;tmi-sent-ts=1567440774009;turbo=0;user-id=73587716;user-type= :baekjoon!baekjoon@baekjoon.tmi.twitch.tv PRIVMSG #pajlada :EleGiggle8",
		"@badge-info=;badges=bits-leader/1;bits=5;color=#00FF7F;display-name=Baekjoon;emotes=;flags=;id=3b8736d1-832d-4152-832a-50c526714fd1;mod=0;room-id=111448817;subscriber=0;tmi-sent-ts=1567440762580;turbo=0;user-id=73587716;user-type= :baekjoon!baekjoon@baekjoon.tmi.twitch.tv PRIVMSG #pajlada :uni5",
		"@badge-info=;badges=bits-leader/1;bits=3;color=#00FF7F;display-name=Baekjoon;emotes=;flags=;id=c13a1540-2a03-4c7d-af50-cb20ed88cefd;mod=0;room-id=111448817;subscriber=0;tmi-sent-ts=1567440750103;turbo=0;user-id=73587716;user-type= :baekjoon!baekjoon@baekjoon.tmi.twitch.tv PRIVMSG #pajlada :Party3",
		"@badge-info=;badges=bits-leader/1;bits=2;color=#00FF7F;display-name=Baekjoon;emotes=;flags=;id=5d889eeb-b6b9-4a4e-91ff-0aecdf297edd;mod=0;room-id=111448817;subscriber=0;tmi-sent-ts=1567440738337;turbo=0;user-id=73587716;user-type= :baekjoon!baekjoon@baekjoon.tmi.twitch.tv PRIVMSG #pajlada :ShowLove2",
		"@badge-info=;badges=bits/1;bits=1;color=#00FF7F;display-name=Baekjoon;emotes=;flags=;id=da47f91a-40d3-4209-ba1c-0219d8b8ecaf;mod=0;room-id=111448817;subscriber=0;tmi-sent-ts=1567440720363;turbo=0;user-id=73587716;user-type= :baekjoon!baekjoon@baekjoon.tmi.twitch.tv PRIVMSG #pajlada :Scoops1",
		"@badge-info=;badges=bits/1;bits=10;color=#8A2BE2;display-name=EkimSky;emotes=;flags=;id=8adea5b4-7430-44ea-a666-5ebaceb69441;mod=0;room-id=111448817;subscriber=0;tmi-sent-ts=1567833047623;turbo=0;user-id=42132818;user-type= :ekimsky!ekimsky@ekimsky.tmi.twitch.tv PRIVMSG #pajlada :Hi Cheer10",
		"@badge-info=;badges=bits-leader/2;bits=500;color=;display-name=godkiller76;emotes=;flags=;id=80e86bcc-d048-44f3-8073-9a1014568e0c;mod=0;room-id=111448817;subscriber=0;tmi-sent-ts=1567753685704;turbo=0;user-id=258838478;user-type= :godkiller76!godkiller76@godkiller76.tmi.twitch.tv PRIVMSG #pajlada :Party100 Party100 Party100 Party100 Party100",
		"@badges=staff/1,broadcaster/1,turbo/1;color=#008000;display-name=ronni;emotes=;id=db25007f-7a18-43eb-9379-80131e44d633;login=ronni;mod=0;msg-id=resub;msg-param-months=6;msg-param-sub-plan=Prime;msg-param-sub-plan-name=Prime;room-id=1337;subscriber=1;system-msg=ronni\\shas\\ssubscribed\\sfor\\s6\\smonths!;tmi-sent-ts=1507246572675;turbo=1;user-id=1337;user-type=staff :tmi.twitch.tv USERNOTICE #pajlada :Great stream -- keep it up!",
		"@badges=staff/1,premium/1;color=#0000FF;display-name=TWW2;emotes=;id=e9176cd8-5e22-4684-ad40-ce53c2561c5e;login=tww2;mod=0;msg-id=subgift;msg-param-months=1;msg-param-recipient-display-name=Mr_Woodchuck;msg-param-recipient-id=89614178;msg-param-recipient-name=mr_woodchuck;msg-param-sub-plan-name=House\\sof\\sNyoro~n;msg-param-sub-plan=1000;room-id=19571752;subscriber=0;system-msg=TWW2\\sgifted\\sa\\sTier\\s1\\ssub\\sto\\sMr_Woodchuck!;tmi-sent-ts=1521159445153;turbo=0;user-id=13405587;user-type=staff :tmi.twitch.tv USERNOTICE #pajlada",
		"@badges=subscriber/0,premium/1;color=#00FF7F;display-name=hyperbolicxd;emotes=;id=b20ef4fe-cba8-41d0-a371-6327651dc9cc;login=hyperbolicxd;mod=0;msg-id=subgift;msg-param-months=1;msg-param-recipient-display-name=quote_if_nam;msg-param-recipient-id=217259245;msg-param-recipient-user-name=quote_if_nam;msg-param-sender-count=1;msg-param-sub-plan-name=Channel\\sSubscription\\s(nymn_hs);msg-param-sub-plan=1000;room-id=62300805;subscriber=1;system-msg=hyperbolicxd\\sgifted\\sa\\sTier\\s1\\ssub\\sto\\squote_if_nam!\\sThis\\sis\\stheir\\sfirst\\sGift\\sSub\\sin\\sthe\\schannel!;tmi-sent-ts=1528190938558;turbo=0;user-id=111534250;user-type= :tmi.twitch.tv USERNOTICE #pajlada",
		"@badges=subscriber/0,premium/1;color=#0000FF;display-name=byebyeheart;emotes=;id=fe390424-ab89-4c33-bb5a-53c6e5214b9f;login=byebyeheart;mod=0;msg-id=sub;msg-param-months=0;msg-param-sub-plan-name=Dakotaz;msg-param-sub-plan=Prime;room-id=39298218;subscriber=0;system-msg=byebyeheart\\sjust\\ssubscribed\\swith\\sTwitch\\sPrime!;tmi-sent-ts=1528190963670;turbo=0;user-id=131956000;user-type= :tmi.twitch.tv USERNOTICE #pajlada",
		"@badges=subscriber/0,premium/1;color=;display-name=vJoeyzz;emotes=;id=b2476df5-fffe-4338-837b-380c5dd90051;login=vjoeyzz;mod=0;msg-id=sub;msg-param-months=0;msg-param-sub-plan-name=Dakotaz;msg-param-sub-plan=Prime;room-id=39298218;subscriber=0;system-msg=vJoeyzz\\sjust\\ssubscribed\\swith\\sTwitch\\sPrime!;tmi-sent-ts=1528190995089;turbo=0;user-id=78945903;user-type= :tmi.twitch.tv USERNOTICE #pajlada",
		"@badges=subscriber/0,premium/1;color=;display-name=Lennydog3;emotes=;id=44feb1eb-df60-45f6-904b-7bf0d5375a41;login=lennydog3;mod=0;msg-id=sub;msg-param-months=0;msg-param-sub-plan-name=Dakotaz;msg-param-sub-plan=Prime;room-id=39298218;subscriber=0;system-msg=Lennydog3\\sjust\\ssubscribed\\swith\\sTwitch\\sPrime!;tmi-sent-ts=1528191098733;turbo=0;user-id=175759335;user-type= :tmi.twitch.tv USERNOTICE #pajlada",
		"@badges=subscriber/0,premium/1;color=#1E90FF;display-name=OscarLord;emotes=;id=376529fd-31a8-4da9-9c0d-92a9470da2cd;login=oscarlord;mod=0;msg-id=resub;msg-param-months=2;msg-param-sub-plan-name=Dakotaz;msg-param-sub-plan=1000;room-id=39298218;subscriber=1;system-msg=OscarLord\\sjust\\ssubscribed\\swith\\sa\\sTier\\s1\\ssub.\\sOscarLord\\ssubscribed\\sfor\\s2\\smonths\\sin\\sa\\srow!;tmi-sent-ts=1528191154801;turbo=0;user-id=162607810;user-type= :tmi.twitch.tv USERNOTICE #pajlada :Hey dk love to watch your streams keep up the good work",
		"@badges=subscriber/0,premium/1;color=;display-name=samewl;emotes=9:22-23;id=599fda87-ca1e-41f2-9af7-6a28208daf1c;login=samewl;mod=0;msg-id=resub;msg-param-months=5;msg-param-sub-plan-name=Channel\\sSubscription\\s(forsenlol);msg-param-sub-plan=Prime;room-id=22484632;subscriber=1;system-msg=samewl\\sjust\\ssubscribed\\swith\\sTwitch\\sPrime.\\ssamewl\\ssubscribed\\sfor\\s5\\smonths\\sin\\sa\\srow!;tmi-sent-ts=1528191317948;turbo=0;user-id=70273207;user-type= :tmi.twitch.tv USERNOTICE #pajlada :lot of love sebastian <3",
		"@badges=subscriber/12;color=#CC00C2;display-name=cspice;emotes=;id=6fc4c3e0-ca61-454a-84b8-5669dee69fc9;login=cspice;mod=0;msg-id=resub;msg-param-months=12;msg-param-sub-plan-name=Channel\\sSubscription\\s(forsenlol):\\s$9.99\\sSub;msg-param-sub-plan=2000;room-id=22484632;subscriber=1;system-msg=cspice\\sjust\\ssubscribed\\swith\\sa\\sTier\\s2\\ssub.\\scspice\\ssubscribed\\sfor\\s12\\smonths\\sin\\sa\\srow!;tmi-sent-ts=1528192510808;turbo=0;user-id=47894662;user-type= :tmi.twitch.tv USERNOTICE #pajlada",
		"@badges=;color=#00AD2B;display-name=Iamme420\\s;emotes=;id=d47a1e4b-a3c6-4b9e-9bf1-51b8f3dbc76e;mod=0;room-id=11148817;subscriber=0;tmi-sent-ts=1529670347537;turbo=0;user-id=56422869;user-type= :iamme420!iamme420@iamme420.tmi.twitch.tv PRIVMSG #pajlada :offline chat gachiBASS",
		"@badge-info=founder/47;badges=moderator/1,founder/0,premium/1;color=#00FF80;display-name=gempir;emotes=;flags=;id=d4514490-202e-43cb-b429-ef01a9d9c2fe;mod=1;room-id=11148817;subscriber=0;tmi-sent-ts=1575198233854;turbo=0;user-id=77829817;user-type=mod :gempir!gempir@gempir.tmi.twitch.tv PRIVMSG #pajlada :offline chat gachiBASS",
		"@badge-info=;badges=glhf-pledge/1;client-nonce=5d2627b0cbe56fa05faf5420def4807d;color=#1E90FF;display-name=oldcoeur;emote-only=1;emotes=84608:0-7;first-msg=1;flags=;id=7412fea4-8683-4cc9-a506-4228127a5c2d;mod=0;room-id=11148817;subscriber=0;tmi-sent-ts=1623429859222;turbo=0;user-id=139147886;user-type= :oldcoeur!oldcoeur@oldcoeur.tmi.twitch.tv PRIVMSG #pajlada :cmonBruh",
		"@badge-info=founder/72;badges=founder/0,bits/5000;color=#FF0000;display-name=TranRed;emotes=;first-msg=0;flags=;id=7482163f-493d-41d9-b36f-fba50e0701b7;mod=0;room-id=11148817;subscriber=0;tmi-sent-ts=1641123773885;turbo=0;user-id=57019243;user-type= :tranred!tranred@tranred.tmi.twitch.tv PRIVMSG #pajlada :GFMP pajaE",
		"@badge-info=subscriber/47;badges=broadcaster/1,subscriber/3012,twitchconAmsterdam2020/1;color=#FF0000;display-name=Supinic;emotes=;flags=;id=8c26e1ab-b50c-4d9d-bc11-3fd57a941d90;login=supinic;mod=0;msg-id=announcement;msg-param-color=PRIMARY;room-id=31400525;subscriber=1;system-msg=;tmi-sent-ts=1648762219962;user-id=31400525;user-type= :tmi.twitch.tv USERNOTICE #supinic :mm test lol",
		"@badge-info=subscriber/3;badges=subscriber/0,bits-charity/1;color=#0000FF;display-name=SnoopyTheBot;emotes=;first-msg=0;flags=;id=8779a9e5-cf1b-47b3-b9fe-67a5b1b605f6;mod=0;pinned-chat-paid-amount=500;pinned-chat-paid-canonical-amount=5;pinned-chat-paid-currency=USD;pinned-chat-paid-exponent=2;returning-chatter=0;room-id=36340781;subscriber=1;tmi-sent-ts=1664505974154;turbo=0;user-id=136881249;user-type= :snoopythebot!snoopythebot@snoopythebot.tmi.twitch.tv PRIVMSG #pajlada :-$5",
		"@pinned-chat-paid-level=ONE;mod=0;flags=;pinned-chat-paid-amount=1400;pinned-chat-paid-exponent=2;tmi-sent-ts=1687970631828;subscriber=1;user-type=;color=#9DA364;emotes=;badges=predictions/blue-1,subscriber/60,twitchconAmsterdam2020/1;pinned-chat-paid-canonical-amount=1400;turbo=0;user-id=26753388;id=e6681ba0-cdc6-4482-93a3-515b74361e8b;room-id=36340781;first-msg=0;returning-chatter=0;pinned-chat-paid-currency=NOK;pinned-chat-paid-is-system-message=0;badge-info=predictions/Day\\s53/53\\sforsenSmug,subscriber/67;display-name=matrHS :matrhs!matrhs@matrhs.tmi.twitch.tv PRIVMSG #pajlada :Title: Beating the record. but who is recordingLOL",
		"@flags=;pinned-chat-paid-amount=8761;turbo=0;user-id=35669184;pinned-chat-paid-level=ONE;user-type=;pinned-chat-paid-canonical-amount=8761;badge-info=subscriber/2;badges=subscriber/2,sub-gifter/1;emotes=;pinned-chat-paid-exponent=2;subscriber=1;mod=0;room-id=36340781;returning-chatter=0;id=289b614d-1837-4cff-ac22-ce33a9735323;first-msg=0;tmi-sent-ts=1687631719188;color=#00FF7F;pinned-chat-paid-currency=RUB;display-name=Danis;pinned-chat-paid-is-system-message=0 :danis!danis@danis.tmi.twitch.tv PRIVMSG #pajlada :-1 lulw",
		"@room-id=36340781;tmi-sent-ts=1687970634371;flags=;id=39a80a3d-c16e-420f-9bbb-faba4976a3bb;badges=subscriber/6,premium/1;emotes=;display-name=rickharrisoncoc;pinned-chat-paid-level=TWO;turbo=0;pinned-chat-paid-amount=500;pinned-chat-paid-is-system-message=0;color=#FF69B4;subscriber=1;user-type=;first-msg=0;pinned-chat-paid-currency=USD;pinned-chat-paid-canonical-amount=500;user-id=518404689;badge-info=subscriber/10;pinned-chat-paid-exponent=2;returning-chatter=0;mod=0 :rickharrisoncoc!rickharrisoncoc@rickharrisoncoc.tmi.twitch.tv PRIVMSG #pajlada :forsen please read my super chat. Please.",
		"@badge-info=subscriber/3;badges=subscriber/3;color=#0000FF;display-name=Linkoping;emotes=25:40-44;flags=17-26:S.6;id=744f9c58-b180-4f46-bd9e-b515b5ef75c1;mod=0;room-id=11148817;subscriber=1;tmi-sent-ts=1566335866017;turbo=0;user-id=91673457;user-type= :linkoping!linkoping@linkoping.tmi.twitch.tv PRIVMSG #pajlada :Då kan du begära skadestånd och förtal Kappa",
		"@badge-info=subscriber/1;badges=subscriber/0;color=;display-name=jhoelsc;emotes=301683486:46-58,60-72,74-86/301683544:88-100;flags=0-4:S.6;id=1f1afcdd-d94c-4699-b35f-d214deb1e11a;mod=0;room-id=11148817;subscriber=1;tmi-sent-ts=1588640587462;turbo=0;user-id=505763008;user-type= :jhoelsc!jhoelsc@jhoelsc.tmi.twitch.tv PRIVMSG #pajlada :pensé que no habría directo que bueno que si staryuukiLove staryuukiLove staryuukiLove staryuukiBits",
		"@badge-info=subscriber/34;badges=moderator/1,subscriber/24;color=#FF0000;display-name=테스트계정420;emotes=41:6-13,16-23;flags=;id=97c28382-e8d2-45a0-bb5d-2305fc4ef139;mod=1;room-id=11148817;subscriber=1;tmi-sent-ts=1590922036771;turbo=0;user-id=117166826;user-type=mod :testaccount_420!testaccount_420@testaccount_420.tmi.twitch.tv PRIVMSG #pajlada :-tags Kreygasm, Kreygasm",
		"@badge-info=subscriber/34;badges=moderator/1,subscriber/24;color=#FF0000;display-name=테스트계정420;emotes=25:24-28/41:6-13,15-22;flags=;id=5a36536b-a952-43f7-9c41-88c829371b7a;mod=1;room-id=11148817;subscriber=1;tmi-sent-ts=1590922039721;turbo=0;user-id=117166826;user-type=mod :testaccount_420!testaccount_420@testaccount_420.tmi.twitch.tv PRIVMSG #pajlada :-tags Kreygasm,Kreygasm Kappa (no space then space)",
		"@badge-info=subscriber/34;badges=moderator/1,subscriber/24;color=#FF0000;display-name=테스트계정420;emotes=25:6-10/1902:12-16/88:18-25;flags=;id=aed9e67e-f8cd-493e-aa6b-da054edd7292;mod=1;room-id=11148817;subscriber=1;tmi-sent-ts=1590922042881;turbo=0;user-id=117166826;user-type=mod :testaccount_420!testaccount_420@testaccount_420.tmi.twitch.tv PRIVMSG #pajlada :-tags Kappa.Keepo.PogChamp.extratext (3 emotes with extra text)",
		"@badge-info=;badges=moderator/1,partner/1;color=#5B99FF;display-name=StreamElements;emotes=86:30-39/822112:73-79;flags=22-27:S.5;id=03c3eec9-afd1-4858-a2e0-fccbf6ad8d1a;mod=1;room-id=11148817;subscriber=0;tmi-sent-ts=1588638345928;turbo=0;user-id=100135110;user-type=mod :streamelements!streamelements@streamelements.tmi.twitch.tv PRIVMSG #pajlada :ACTION A LOJA AINDA NÃO ESTÁ PRONTA BibleThump , AGUARDE... NOVIDADES EM BREVE FortOne",
		"@badge-info=subscriber/20;badges=moderator/1,subscriber/12;color=#19E6E6;display-name=randers;emotes=25:39-43;flags=;id=3ea97f01-abb2-4acf-bdb8-f52e79cd0324;mod=1;room-id=11148817;subscriber=1;tmi-sent-ts=1588837097115;turbo=0;user-id=40286300;user-type=mod :randers!randers@randers.tmi.twitch.tv PRIVMSG #pajlada :Då kan du begära skadestånd och förtal Kappa",
		"@badge-info=subscriber/34;badges=moderator/1,subscriber/24;color=#FF0000;display-name=테스트계정420;emotes=41:6-13,15-22;flags=;id=a3196c7e-be4c-4b49-9c5a-8b8302b50c2a;mod=1;room-id=11148817;subscriber=1;tmi-sent-ts=1590922213730;turbo=0;user-id=117166826;user-type=mod :testaccount_420!testaccount_420@testaccount_420.tmi.twitch.tv PRIVMSG #pajlada :-tags Kreygasm,Kreygasm (no space)",
		"@badge-info=subscriber/43;badges=subscriber/42;color=#1E90FF;custom-reward-id=313969fe-cc9f-4a0a-83c6-172acbd96957;display-name=Cranken1337;emotes=;flags=;id=3cee3f27-a1d0-44d1-a606-722cebdad08b;mod=0;room-id=11148817;subscriber=1;tmi-sent-ts=1594756484132;turbo=0;user-id=91800084;user-type= :cranken1337!cranken1337@cranken1337.tmi.twitch.tv PRIVMSG #pajlada :wow, amazing reward",

		"@badge-info=;badges=premium/1;color=;display-name=HellbirDza;emotes=;flags=;id=d0e4a1d9-75c7-406d-8423-cfa3dfb514b5;login=hellbirdza;mod=0;msg-id=submysterygift;msg-param-mass-gift-count=5;msg-param-origin-id=ee\\se2\\s3f\\s01\\s75\\s45\\se1\\sfa\\s24\\s47\\s29\\s08\\sdb\\sf8\\sab\\se1\\s56\\s27\\s83\\s2e;msg-param-sender-count=15;msg-param-sub-plan=1000;room-id=26261471;subscriber=0;system-msg=HellbirDza\\sis\\sgifting\\s5\\sTier\\s1\\sSubs\\sto\\sAsmongold's\\scommunity!\\sThey've\\sgifted\\sa\\stotal\\sof\\s15\\sin\\sthe\\schannel!;tmi-sent-ts=1671302976346;user-id=28678305;user-type= :tmi.twitch.tv USERNOTICE #asmongold",
		"@badge-info=;badges=premium/1;color=;display-name=HellbirDza;emotes=;flags=;id=182675e7-db1b-49d3-9650-54c31d938203;login=hellbirdza;mod=0;msg-id=subgift;msg-param-gift-months=1;msg-param-months=1;msg-param-origin-id=ee\\se2\\s3f\\s01\\s75\\s45\\se1\\sfa\\s24\\s47\\s29\\s08\\sdb\\sf8\\sab\\se1\\s56\\s27\\s83\\s2e;msg-param-recipient-display-name=buddyunique1;msg-param-recipient-id=431251927;msg-param-recipient-user-name=buddyunique1;msg-param-sender-count=0;msg-param-sub-plan-name=Channel\\sSubscription\\s(asmongold);msg-param-sub-plan=1000;room-id=26261471;subscriber=0;system-msg=HellbirDza\\sgifted\\sa\\sTier\\s1\\ssub\\sto\\sbuddyunique1!;tmi-sent-ts=1671302976704;user-id=28678305;user-type= :tmi.twitch.tv USERNOTICE #asmongold",
		"@badge-info=;badges=premium/1;color=;display-name=HellbirDza;emotes=;flags=;id=594ce86d-f956-43cd-8b5d-1b7e8499dca1;login=hellbirdza;mod=0;msg-id=subgift;msg-param-gift-months=1;msg-param-months=1;msg-param-origin-id=ee\\se2\\s3f\\s01\\s75\\s45\\se1\\sfa\\s24\\s47\\s29\\s08\\sdb\\sf8\\sab\\se1\\s56\\s27\\s83\\s2e;msg-param-recipient-display-name=tartarin_e;msg-param-recipient-id=144049812;msg-param-recipient-user-name=tartarin_e;msg-param-sender-count=0;msg-param-sub-plan-name=Channel\\sSubscription\\s(asmongold);msg-param-sub-plan=1000;room-id=26261471;subscriber=0;system-msg=HellbirDza\\sgifted\\sa\\sTier\\s1\\ssub\\sto\\startarin_e!;tmi-sent-ts=1671302976722;user-id=28678305;user-type= :tmi.twitch.tv USERNOTICE #asmongold",
		"@badge-info=;badges=premium/1;color=;display-name=HellbirDza;emotes=;flags=;id=527abc39-e599-4c1d-a480-e724a9c69823;login=hellbirdza;mod=0;msg-id=subgift;msg-param-gift-months=1;msg-param-months=1;msg-param-origin-id=ee\\se2\\s3f\\s01\\s75\\s45\\se1\\sfa\\s24\\s47\\s29\\s08\\sdb\\sf8\\sab\\se1\\s56\\s27\\s83\\s2e;msg-param-recipient-display-name=haaryho_stracene_vlasy;msg-param-recipient-id=96664018;msg-param-recipient-user-name=haaryho_stracene_vlasy;msg-param-sender-count=0;msg-param-sub-plan-name=Channel\\sSubscription\\s(asmongold);msg-param-sub-plan=1000;room-id=26261471;subscriber=0;system-msg=HellbirDza\\sgifted\\sa\\sTier\\s1\\ssub\\sto\\shaaryho_stracene_vlasy!;tmi-sent-ts=1671302976759;user-id=28678305;user-type= :tmi.twitch.tv USERNOTICE #asmongold",
		"@badge-info=;badges=premium/1;color=;display-name=HellbirDza;emotes=;flags=;id=f694b0fc-0b5e-4adf-8002-03dae340e9b5;login=hellbirdza;mod=0;msg-id=subgift;msg-param-gift-months=1;msg-param-months=1;msg-param-origin-id=ee\\se2\\s3f\\s01\\s75\\s45\\se1\\sfa\\s24\\s47\\s29\\s08\\sdb\\sf8\\sab\\se1\\s56\\s27\\s83\\s2e;msg-param-recipient-display-name=corette0;msg-param-recipient-id=149790291;msg-param-recipient-user-name=corette0;msg-param-sender-count=0;msg-param-sub-plan-name=Channel\\sSubscription\\s(asmongold);msg-param-sub-plan=1000;room-id=26261471;subscriber=0;system-msg=HellbirDza\\sgifted\\sa\\sTier\\s1\\ssub\\sto\\scorette0!;tmi-sent-ts=1671302976767;user-id=28678305;user-type= :tmi.twitch.tv USERNOTICE #asmongold",
		"@badge-info=;badges=premium/1;color=;display-name=HellbirDza;emotes=;flags=;id=5893d8a8-5eb3-46d6-9737-f1b2b76400d4;login=hellbirdza;mod=0;msg-id=subgift;msg-param-gift-months=1;msg-param-months=2;msg-param-origin-id=ee\\se2\\s3f\\s01\\s75\\s45\\se1\\sfa\\s24\\s47\\s29\\s08\\sdb\\sf8\\sab\\se1\\s56\\s27\\s83\\s2e;msg-param-recipient-display-name=yo_adg;msg-param-recipient-id=465861822;msg-param-recipient-user-name=yo_adg;msg-param-sender-count=0;msg-param-sub-plan-name=Channel\\sSubscription\\s(asmongold);msg-param-sub-plan=1000;room-id=26261471;subscriber=0;system-msg=HellbirDza\\sgifted\\sa\\sTier\\s1\\ssub\\sto\\syo_adg!;tmi-sent-ts=1671302976798;user-id=28678305;user-type= :tmi.twitch.tv USERNOTICE #asmongold",
		"@badges=;color=;emotes=;id=123;login=channame;mod=0;msg-id=subgift;msg-param-months=1;msg-param-recipient-display-name=user2;msg-param-recipient-id=44452165;msg-param-recipient-user-name=user2;msg-param-sub-plan-name=Channel\\sSubscription\\s(LIRIK);msg-param-sub-plan=1000;room-id=123;subscriber=0;system-msg=An\\sanonymous\\suser\\sgifted\\sa\\sTier\\s1\\ssub\\sto\\sabc!\\s;tmi-sent-ts=123;turbo=0;user-id=123;user-type= :tmi.twitch.tv USERNOTICE #test",
		"@badge-info=;badges=;color=;display-name=AnAnonymousGifter;emotes=;flags=;id=1234;login=ananonymousgifter;mod=0;msg-id=subgift;msg-param-fun-string=FunStringTwo;msg-param-gift-months=3;msg-param-months=22;msg-param-origin-id=da\\s39\\sa3\\see\\s5e\\s6b\\s4b\\s0d\\s32\\s55\\sbf\\sef\\s95\\s60\\s18\\s90\\saf\\sd8\\s07\\s09;msg-param-recipient-display-name=USERNAME;msg-param-recipient-id=1234;msg-param-recipient-user-name=username;msg-param-sub-plan-name=StreamName\\sSub;msg-param-sub-plan=1000;room-id=1234;subscriber=0;system-msg=An\\sanonymous\\suser\\sgifted\\sa\\sTier\\s1\\ssub\\sto\\sUSERNAME!\\s;tmi-sent-ts=1234;user-id=1234;user-type= :tmi.twitch.tv USERNOTICE #test",
		"@badge-info=subscriber/14;badges=subscriber/12;color=#00FF7F;display-name=USERNAME;emotes=;flags=;id=1234;login=username;mod=0;msg-id=resub;msg-param-cumulative-months=14;msg-param-months=0;msg-param-multimonth-duration=0;msg-param-multimonth-tenure=0;msg-param-should-share-streak=0;msg-param-sub-plan-name=StreamName\\sSub;msg-param-sub-plan=Prime;msg-param-was-gifted=false;room-id=1234;subscriber=1;system-msg=USERNAME\\ssubscribed\\swith\\sTwitch\\sPrime.\\sThey've\\ssubscribed\\sfor\\s14\\smonths!;tmi-sent-ts=1234;user-id=1234;user-type= :tmi.twitch.tv USERNOTICE #test :F1 subscription fee",
		"@badge-info=subscriber/1;badges=subscriber/1,premium/1;color=#5D12F3;display-name=USERNAME;emotes=;flags=;id=1234;login=username;mod=0;msg-id=sub;msg-param-cumulative-months=1;msg-param-months=0;msg-param-multimonth-duration=3;msg-param-multimonth-tenure=0;msg-param-should-share-streak=1;msg-param-streak-months=1;msg-param-sub-plan-name=Channel\\sSubscription\\s(channel);msg-param-sub-plan=1000;msg-param-was-gifted=false;room-id=1234;subscriber=1;system-msg=USERNAME\\ssubscribed\\sat\\sTier\\s1.;tmi-sent-ts=1234;user-id=1234;user-type= :tmi.twitch.tv USERNOTICE #test :Message",
		"@badges=turbo/1;color=#9ACD32;display-name=TestChannel;emotes=;id=3d830f12-795c-447d-af3c-ea05e40fbddb;login=testchannel;mod=0;msg-id=raid;msg-param-displayName=TestChannel;msg-param-login=testchannel;msg-param-viewerCount=15;room-id=56379257;subscriber=0;system-msg=15\\sraiders\\sfrom\\sTestChannel\\shave\\sjoined\\n!;tmi-sent-ts=1507246572675;tmi-sent-ts=1507246572675;turbo=1;user-id=123456;user-type= :tmi.twitch.tv USERNOTICE #test",
		"@badges=turbo/1;color=#9ACD32;display-name=TestChannel;emotes=;id=3d830f12-795c-447d-af3c-ea05e40fbddb;login=testchannel;mod=0;msg-id=raid;msg-param-displayName=TestChannel;msg-param-login=testchannel;msg-param-viewerCount=15;room-id=56379257;subscriber=0;system-msg=15\\sraiders\\sfrom\\sTestChannel\\shave\\sjoined\\n!;tmi-sent-ts=1507246572675;tmi-sent-ts=1507246572675;turbo=1;user-id=123456;user-type= :tmi.twitch.tv USERNOTICE #test :Hyyyype! \\o/"
	];

	for (var i in samples) {
		processMessage(parseMessage(samples[i]));
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

	close() {
		anonClient.part(this.name.toLowerCase());
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
				stopper.scrollIntoView();
				stopper.remove();
			}
			else {
				stopper.innerText = "Failed to load message history" + msg.erorr_code + " - " + msg.erorr;
				stopper.scrollIntoView();
			}
		});
	});
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
	ch.timeline = document.createElement("div");
	ch.timeline.classList.add("timeline");
	ch.hchannel = new HChatChannel(hchat, ch.id);
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

function sendMessage(msg) {
	var ch = selectedChannel.name;

	var tags = {};
	if (!settings.hideHchatNonce) tags["client-nonce"] = "hchat,";
	if (replyingToId) tags["reply-parent-msg-id"] = replyingToId;
	activeAccount.irc.sendMessage(tags, ch, msg);
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

function onAccountReady(acc) {
	acc.irc = new ChatClient(acc.name.toLowerCase(), acc.token);
	acc.irc.onMessage = (msg) => {
		processMessage(msg);
	};
}

function onAccountChanged() {
	if (activeAccount) {
		if (activeAccount.state == AccountStateExpired) {
			textInput.disabled = false;
			textInput.placeholder = "Login for @" + activeAccount.name + " has expired. Please log in again.";
		}
		else {
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
					{
						var b = document.createElement("div");
						b.innerText = "File uploaded to ";

						var a = document.createElement("a");
						a.href = r.link;
						a.innerText = r.link;
						a.target = "_blank";

						b.appendChild(a);
						timelinePush(selectedChannel.timeline, b);
					}

					pushInputText(r.link);

					if (r.delete) {
						var b = document.createElement("div");
						b.innerText = "Delete link: ";

						var a = document.createElement("a");
						a.href = r.delete;
						a.innerText = r.delete;
						a.target = "_blank";

						b.appendChild(a);
						timelinePush(selectedChannel.timeline, b);
					}
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

	// Content
	{
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

			settingsPage.appendChild(d);
		}

		function createNumberInput(key, title, description, min, max, step = 1) {
			settingsPage.appendChild(createElementWithText("h3", title));
			settingsPage.appendChild(createElementWithText("div", description));

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
				settingsPage.appendChild(si);
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

			settingsPage.appendChild(ni);
		}

		function createTextbox(key, title, description) {
			settingsPage.appendChild(createElementWithText("h3", title));
			settingsPage.appendChild(createElementWithText("div", description));

			const tb = document.createElement("input");
			tb.type = "text";
			tb.id = "setting-" + key;
			tb.value = getIndexed(key);
			tb.onchange = () => { setIndexed(key, tb.value); saveSettings(); };
			settingsPage.appendChild(tb);
		}

		{
			settingsPage.appendChild(createElementWithText("h1", "Settings"));

			createNumberInput("settings.zoom", "Zoom", "", 0.5, 2.0, 0.1);
			createCheckbox("settings.hideAppInstallButton", "Hide app install button");
			createCheckbox("settings.hideHchatUserBadge", "Hide HChat user badges");
			createCheckbox("settings.hideHchatNonce", "Hide my HChat user badge");
			createNumberInput("settings.maxMessages", "Max messages", "The maximum amount of message in a timeline", 50, Infinity);
			createNumberInput("settings.emoteSize", "Emote resolution", "The maximum vertical emote resolution", 1, 4);

			settingsPage.appendChild(createElementWithText("h2", "Recent messages"));
			createNumberInput("settings.recentMessagesLimit", "Recent messages limit", "The amount of messages to fecth from the recent messages service", 0, 900);

			settingsPage.appendChild(createElementWithText("h2", "File uploader"));
			createTextbox("settings.uploaderUrl", "Upload URL", "");
			createTextbox("settings.uploaderField", "File field", "");
			createTextbox("settings.uploaderLinkFormat", "Link format", "");
			createTextbox("settings.uploaderDeleteFormat", "Delete format", "");
			createCheckbox("settings.uploaderUploadProgress", "Monitor upload progress");
		}
	}
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

	emoteSize = 3

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
			this.switchPage(this.tabList.children[0].page);
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
		var btn = document.createElement("button");
		btn.innerText = "Channel Emotes";

		var page = document.createElement("div");
		page.list = selectedChannel.hchannel.channelEmotes;
		emoteTabber.addPage(btn, page);
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

	emoteTabber.removeAllPages();
}

function pushInputText(tx) {
	if (textInput.value && textInput.value[textInput.value.length - 1] != ' ') {
		textInput.value += ' ';
	}
	textInput.value += tx;
}