#!/usr/bin/rdmd

import std.uni;
import std.json;
import std.file;
import std.conv;
import std.array;
import std.stdio;
import std.string;

void main()
{
	int total, twemoji, apple, google, facebook, blob, fluent, serenity;

	File f = File("../data/emoji-data.json", "r");
	char[] jstr;
	jstr.length = f.size();
	JSONValue emojiData = parseJSON(f.rawRead!char(jstr));
	JSONValue outData = JSONValue.emptyObject;

	void processEmoji(string unified, JSONValue shorts)
	{
		dstring uni = "";
		foreach (string ch; unified.split("-"))
		{
			uni ~= cast(dchar) parse!int(ch, 16);
		}
		writeln(uni);

		JSONValue jv = JSONValue.emptyObject;
		jv["twemoji"] = exists("../assets/emotes/twemoji/" ~ unified.toLower ~ ".png");
		jv["apple"] = exists("../assets/emotes/apple/" ~ unified.toLower ~ ".png");
		jv["google"] = exists("../assets/emotes/google/" ~ unified.toLower ~ ".png");
		jv["facebook"] = exists("../assets/emotes/facebook/" ~ unified.toLower ~ ".png");
		jv["blob"] = exists("../assets/emotes/blob/" ~ unified.toLower ~ ".png");
		jv["fluent"] = exists("../assets/emotes/fluent/" ~ unified.toLower ~ ".png");
		jv["serenity"] = exists("../assets/emotes/serenity/" ~ unified.toLower ~ ".png");

		jv["shorts"] = shorts;
		outData[unified.toLower] = jv;

		total += 1;
		if (jv["twemoji"].boolean)
			twemoji++;
		if (jv["apple"].boolean)
			apple++;
		if (jv["google"].boolean)
			google++;
		if (jv["facebook"].boolean)
			facebook++;
		if (jv["blob"].boolean)
			blob++;
		if (jv["fluent"].boolean)
			fluent++;
		if (jv["serenity"].boolean)
			serenity++;
	}

	foreach (JSONValue emoji; emojiData.array)
	{
		string unified = emoji["unified"].str;
		JSONValue shorts = JSONValue.emptyArray;
		foreach (JSONValue name; emoji["short_names"].array())
			shorts.array ~= name;

		processEmoji(unified, shorts);
		if("skin_variations" in emoji)
			foreach(string key, JSONValue skin; emoji["skin_variations"])
				processEmoji(skin["unified"].str, shorts);
	}

	File outf = File("../data/emojis.json", "w");
	outf.write(outData.toJSON());

	writeln("Total emojis: ", total);
	writeln("Twemoji: ", twemoji, " (", (twemoji / cast(float) total) * 100, "%)");
	writeln("Apple: ", apple, " (", (apple / cast(float) total) * 100, "%)");
	writeln("Google: ", google, " (", (google / cast(float) total) * 100, "%)");
	writeln("Facebook: ", facebook, " (", (facebook / cast(float) total) * 100, "%)");
	writeln("Blob: ", blob, " (", (blob / cast(float) total) * 100, "%)");
	writeln("Fluent: ", fluent, " (", (fluent / cast(float) total) * 100, "%)");
	writeln("Serenity: ", serenity, " (", (serenity / cast(float) total) * 100, "%)");
}
