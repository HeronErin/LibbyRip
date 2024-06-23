// ==UserScript==
// @name         LibreGRAB
// @namespace    http://tampermonkey.net/
// @version      2024-06-22
// @description  Download all the booty!
// @author       HeronErin
// @match        *://*.listen.libbyapp.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=libbyapp.com
// @grant        none
// ==/UserScript==

(()=>{
    const CSS = `
    .pNav{
        background-color: red;
        width: 100%;
        display: flex;
        justify-content: space-between;
    }
    .pLink{
        color: blue;
        text-decoration-line: underline;
        padding: .25em;
        font-size: 1em;
    }

    `;
    const newNav = `
        <a class="pLink" id="chap"> <h1> View chapters </h1> </a>
        <a class="pLink" id="dow"> <h1> Download chapters </h1> </a>
        <a class="pLink" id="exp"> <h1> Export audiobook </h1> </a>
    `;

    function buildPirateNav(){
        let nav = document.createElement("div");
        nav.innerHTML = newNav;
        nav.querySelector("#chap").onclick = viewChapters;
        nav.querySelector("#dow").onclick = downloadChapters;
        nav.querySelector("#exp").onclick = exportChapters;
        nav.classList.add("pNav");
        let pbar = document.querySelector(".nav-progress-bar");
        pbar.insertBefore(nav, pbar.children[1]);
    }
    function repairSplinePath(s, si){
        s = window.origin + "/" + s;
        const spline = btoa(JSON.stringify({spine: si}));
        const ssplit = s.split("?cmpt=");
        return  ssplit[0] + "?cmpt=" + spline + "--" + ssplit[1].split("--")[1].substring(0, 40);
    }
    function getUrls(){
        let ret = [];
        for (spine of BIF.map.spine){
            let data = {
                url: repairSplinePath(spine.path, spine["-odread-spine-position"]),
                index : spine["-odread-spine-position"],
                duration: spine["audio-duration"],
                size: spine["-odread-file-bytes"]
            };
            ret.push(data);
        }
        return ret;
    }
    function viewChapters(){
        console.log(JSON.stringify(getUrls()));
    }
    function downloadChapters(){
        
    }
    function exportChapters(){
        
    }

    // Main entry point for audiobooks
    function bifFound(){
        // New global style info
        let s = document.createElement("style");
        s.innerHTML = CSS;
        document.head.appendChild(s)

        buildPirateNav();
    }

    // The "BIF" contains all the info we need to download
    // stuff, so we wait until the page is loaded, and the
    // BIF is present, to inject the pirate menu.
    let intr = setInterval(()=>{
        if (window.BIF != undefined){
            clearInterval(intr);
            bifFound();
        }
    }, 25);
})();