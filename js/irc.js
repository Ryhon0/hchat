// https://dev.twitch.tv/docs/irc/example-parser/

class Message {
	tags = {}
	command = { channel: "", command: "" }
	source = ""
	content = ""
	time = 0

	displayName() {
		if (this.tags && this.tags["display-name"] && this.tags["display-name"].length > 0)
			return this.tags["display-name"];
		else return this.user;
	}

	username() {
		return this.user ?? this.tags.login;
	}

	userId()
	{
		return Number(this.tags["user-id"]);
	}

	roomId()
	{
		return Number(this.tags["room-id"]);
	}
}

function parseMessage(message) {
	let parsedMessage = new Message();
	let idx = 0;
	let rawTagsComponent = null;
	let rawSourceComponent = null;
	let rawCommandComponent = null;
	let rawParametersComponent = null;
	if (message[idx] === '@') {
		let endIdx = message.indexOf(' ');
		rawTagsComponent = message.slice(1, endIdx);
		idx = endIdx + 1;
	}

	if (message[idx] === ':') {
		idx += 1;
		let endIdx = message.indexOf(' ', idx);
		rawSourceComponent = message.slice(idx, endIdx);
		idx = endIdx + 1;
	}

	let endIdx = message.indexOf(':', idx);
	if (-1 == endIdx || message[endIdx - 1] != ' ') {
		endIdx = message.lastIndexOf(' ');
		if (-1 == endIdx)
			endIdx = message.length;
	}

	rawCommandComponent = message.slice(idx, endIdx).trim();
	if (endIdx != message.length) {
		idx = endIdx + 1;
		rawParametersComponent = message.slice(idx);
	}
	parsedMessage.command = parseCommand(rawCommandComponent);
	if (null == parsedMessage.command) {
		return null;
	}
	else {
		if (null != rawTagsComponent) {
			parsedMessage.tags = parseTags(rawTagsComponent);
		}

		var src = parseSource(rawSourceComponent);
		parsedMessage.source = src;
		if (src && src.nick)
			parsedMessage.user = src.nick;

		parsedMessage.content = rawParametersComponent;
		if (rawParametersComponent && rawParametersComponent[0] === '!') {
			parsedMessage.command = parseParameters(rawParametersComponent, parsedMessage.command);
		}
	}

	if (parsedMessage.tags)
		parsedMessage.time = parseInt(parsedMessage.tags["tmi-sent-ts"]);

	return parsedMessage;
}
function parseTags(tags) {
	let dictParsedTags = {};
	let parsedTags = tags.split(';');

	parsedTags.forEach(tag => {
		let parsedTag = tag.split('=');
		var tagValue = unescapeTagValue(parsedTag[1]);

		dictParsedTags[parsedTag[0]] = tagValue;
	});

	return dictParsedTags;
}

function parseCommand(rawCommandComponent) {
	let parsedCommand = null;
	commandParts = rawCommandComponent.split(' ');

	switch (commandParts[0]) {
		case 'JOIN':
		case 'PART':
		case 'NOTICE':
		case 'CLEARCHAT':
		case 'CLEARMSG':
		case 'HOSTTARGET':
		case 'PRIVMSG':
		case 'WHISPER':
		case 'USERSTATE':
		case 'ROOMSTATE':
			parsedCommand = {
				command: commandParts[0],
				channel: commandParts[1]
			}
			break;
		case 'USERNOTICE':
			if (commandParts.length == 1) {
				parsedCommand = {
					command: commandParts[0],
				}
			}
			else {
				parsedCommand = {
					command: commandParts[0],
					channel: commandParts[1]
				}
			}
			break;
		case 'PING':
			parsedCommand = {
				command: commandParts[0]
			}
			break;
		case 'CAP':
			parsedCommand = {
				command: commandParts[0],
				isCapRequestEnabled: (commandParts[2] === 'ACK') ? true : false,
			}
			break;
		case 'GLOBALUSERSTATE':
			parsedCommand = {
				command: commandParts[0]
			}
			break;
		case 'RECONNECT':
			console.log('The Twitch IRC server is about to terminate the connection for maintenance.')
			parsedCommand = {
				command: commandParts[0]
			}
			break;
		case '421':
			console.log(`Unsupported IRC command: ${commandParts[2]}`)
			return null;
		case '001':
		case '002':
		case '003':
		case '004':
		case '353':  // Tells you who else is in the chat room you're joining.
		case '366':
		case '372':
		case '375':
		case '376':
			return null;
			parsedCommand = {
				command: commandParts[0],
				channel: commandParts[1]
			}
			break;
		default:
			if (commandParts[0])
				console.log(`\nUnexpected command: '${commandParts[0]}'\n`);
			return null;
	}

	return parsedCommand;
}

function parseSource(rawSourceComponent) {
	if (null == rawSourceComponent) {
		return null;
	}
	else {
		let sourceParts = rawSourceComponent.split('!');
		return {
			nick: (sourceParts.length == 2) ? sourceParts[0] : null,
			host: (sourceParts.length == 2) ? sourceParts[1] : sourceParts[0]
		}
	}
}

function parseParameters(rawParametersComponent, command) {
	let idx = 0
	let commandParts = rawParametersComponent.slice(idx + 1).trim();
	let paramsIdx = commandParts.indexOf(' ');

	if (-1 == paramsIdx) { // no parameters
		command.botCommand = commandParts.slice(0);
	}
	else {
		command.botCommand = commandParts.slice(0, paramsIdx);
		command.botCommandParams = commandParts.slice(paramsIdx).trim();
	}

	return command;
}

function unescapeTagValue(str) {
	return str
		.replaceAll('\\'+':', ';')
		.replaceAll('\\s', ' ')
		.replaceAll('\\r', '\r')
		.replaceAll('\\n', '\n')
		.replaceAll('\\\\', '\\');
}

function escapeTag(str)
{
	return str
		.replaceAll('\\', '\\\\')
		.replaceAll(';', '\\'+':')
		.replaceAll(' ', '\\s')
		.replaceAll('\r', '\\r')
		.replaceAll('\n', '\\n');
}

function tagsToString(tags)
{
	var s = "@";
	var first = true;
	for(var k in tags)
	{
		var v = tags[k];

		if(first)
			first = false;
		else s += ";";

		s += escapeTag(String(k));
		s += "=";
		s += escapeTag(String(v));
	}
	return s;
}