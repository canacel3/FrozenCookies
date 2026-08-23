// ==UserScript==
// @name           Frozen Cookies
// @version        github-latest
// @description    Userscript to load Frozen Cookies
// @author         Icehawk78 / erbkaiser
// @homepage       https://canacel3.github.io/FrozenCookies/
// @include        http://orteil.dashnet.org/cookieclicker/
// @include        https://orteil.dashnet.org/cookieclicker/
// @updateURL      https://canacel3.github.io/FrozenCookies/fc_userscript_loader.user.js
// @downloadURL    https://canacel3.github.io/FrozenCookies/fc_userscript_loader.user.js
// ==/UserScript==

// Source:    https://github.com/canacel3/FrozenCookies/main/
// Github.io: https://canacel3.github.io/FrozenCookies/
var loadInterval = setInterval(function () {
    const Game = unsafeWindow.Game;
    if (Game && Game.ready) {
        clearInterval(loadInterval);
        Game.LoadMod("https://canacel3.github.io/FrozenCookies/frozen_cookies.js");
    }
}, 1000);
