<img src="icon.svg" height=48 align=right>

# HChat
Web based mobile friendly Twitch chat client with support for all major emote providers.  
Available at [hchat.ryhn.link](https://hchat.ryhn.link)  
## Hosting
For a release server, you will need to change the OAuth app ID, located on the first line of [js/app.js](js/app.js) to one of your own application, which can be found [here](https://dev.twitch.tv/console/apps).  
A development server needs to run at `localhost:5500` with the default app ID.  

A HTTP server with support for the `Last-Modified` header is required for auto update to work.  
Additionally, it's recommended to cache the files in the `data/` and `/assets` directories using the `Expires` header.  

## License
TBD  

You are allowed to read, modify and distribute the source code, but you are not allowed to use any of the source code in other projects or distribute the source code in a non human readable form without an easy way to access the human readable form. (e.g. You may not minify or obfuscate the source code without linking to the source file).

This license is subject to change.

### Third party assets
* [Bootstrap Icons](https://icons.getbootstrap.com/)
* [tld-list](https://github.com/umpirsky/tld-list/blob/master/data/en/tld.txt)
* [emoji-data](https://github.com/iamcal/emoji-data)
* [Twemoji](https://github.com/twitter/twemoji)
* [blobmoji](https://github.com/C1710/blobmoji)
* https://freesound.org/people/Porphyr/sounds/191678/