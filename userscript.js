// ==UserScript==
// @name          LibreGRAB
// @namespace     http://tampermonkey.net/
// @version       2025-01-10
// @description   Download all the booty!
// @author        HeronErin
// @license       MIT
// @supportURL    https://github.com/HeronErin/LibbyRip/issues
// @match         *://*.listen.libbyapp.com/*
// @icon          https://www.google.com/s2/favicons?sz=64&domain=libbyapp.com
// @require       https://cdnjs.cloudflare.com/ajax/libs/jszip/3.7.1/jszip.min.js
// @grant         none
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
    .foldMenu{
        position: absolute;
        width: 100%;
        height: 0%;
        z-index: 1000;

        background-color: grey;

        overflow-x: hidden;
        overflow-y: scroll;

        transition: height 0.3s
    }
    .active{
        height: 40%;
        border: double;
    }
    .pChapLabel{
        font-size: 2em;
    }

    `;
    const newNav = `
        <a class="pLink" id="chap"> <h1> View chapters </h1> </a>
        <a class="pLink" id="dow"> <h1> Download chapters </h1> </a>
        <a class="pLink" id="exp"> <h1> Export audiobook </h1> </a>
    `;
    const chaptersMenu = `
        <h2>This book contains {CHAPTERS} chapters.</h2>
    `;
    let chapterMenuElem;
    let downloadElem;
    function buildPirateUi(){
        // Create the nav
        let nav = document.createElement("div");
        nav.innerHTML = newNav;
        nav.querySelector("#chap").onclick = viewChapters;
        nav.querySelector("#dow").onclick = downloadChapters;
        nav.querySelector("#exp").onclick = exportChapters;
        nav.classList.add("pNav");
        let pbar = document.querySelector(".nav-progress-bar");
        pbar.insertBefore(nav, pbar.children[1]);

        // Create the chapters menu
        chapterMenuElem = document.createElement("div");
        chapterMenuElem.classList.add("foldMenu");
        chapterMenuElem.setAttribute("tabindex", "-1"); // Don't mess with tab key
        const urls = getUrls();

        chapterMenuElem.innerHTML = chaptersMenu.replace("{CHAPTERS}", urls.length);
        document.body.appendChild(chapterMenuElem);

        downloadElem = document.createElement("div");
        downloadElem.classList.add("foldMenu");
        document.body.appendChild(downloadElem);


    }
    function getUrls(){
        let ret = [];

        // New libby version uses a special object for the encoded urls.
        // They use a much more complex alg for calculating the url, but it is exposed (by accedent)
        for (let spine of BIF.objects.spool.components){
            // Delete old fake value
            let old_whereabouts = spine["_whereabouts"];
            delete spine["_whereabouts"];

            // Call the function to decode the true media path
            let true_whereabouts = spine._whereabouts();

            // Reset to original value
            spine["_whereabouts"] = old_whereabouts;

            let data = {
                url: location.origin + "/" + true_whereabouts,
                index : spine.meta["-odread-spine-position"],
                duration: spine.meta["audio-duration"],
                size: spine.meta["-odread-file-bytes"],
                type: spine.meta["media-type"]
            };
            ret.push(data);
        }
        return ret;
    }
    function paddy(num, padlen, padchar) {
        var pad_char = typeof padchar !== 'undefined' ? padchar : '0';
        var pad = new Array(1 + padlen).join(pad_char);
        return (pad + num).slice(-pad.length);
    }
    let firstChapClick = true;
    function viewChapters(){
        // Populate chapters ONLY after first viewing
        if (firstChapClick){
            firstChapClick = false;
            for (let url of getUrls()){
                let span = document.createElement("span");
                span.classList.add("pChapLabel")
                span.textContent = "#" + (1 + url.index);

                let audio = document.createElement("audio");
                audio.setAttribute("controls", "");
                let source = document.createElement("source");
                source.setAttribute("src", url.url);
                source.setAttribute("type", url.type);
                audio.appendChild(source);

                chapterMenuElem.appendChild(span);
                chapterMenuElem.appendChild(document.createElement("br"));
                chapterMenuElem.appendChild(audio);
                chapterMenuElem.appendChild(document.createElement("br"));
            }
        }
        if (chapterMenuElem.classList.contains("active"))
            chapterMenuElem.classList.remove("active")
        else
            chapterMenuElem.classList.add("active")
    }
    async function createMetadata(zip){
        let folder = zip.folder("metadata");

        let spineToIndex = BIF.map.spine.map((x)=>x["-odread-original-path"]);
        let metadata = {
            title: BIF.map.title.main,
            description: BIF.map.description,
            coverUrl: BIF.root.querySelector("image").getAttribute("href"),
            creator: BIF.map.creator,
            spine: BIF.map.spine.map((x)=>{return {
                duration: x["audio-duration"],
                type: x["media-type"],
                bitrate: x["audio-bitrate"],
            }})
        };
        const response = await fetch(metadata.coverUrl);
        const blob = await response.blob();
        const csplit = metadata.coverUrl.split(".");
        folder.file("cover." + csplit[csplit.length-1], blob, { compression: "STORE" });

        if (BIF.map.nav.toc != undefined){
            metadata.chapters = BIF.map.nav.toc.map((rChap)=>{
                return {
                    title: rChap.title,
                    spine: spineToIndex.indexOf(rChap.path.split("#")[0]),
                    offset: 1*(rChap.path.split("#")[1] | 0)
                };
            });
        }
        folder.file("metadata.json", JSON.stringify(metadata, null, 2));
    }

    let downloadState = -1;
    async function createAndDownloadZip(urls, addMeta) {
      const zip = new JSZip();

      // Fetch all files and add them to the zip
      const fetchPromises = urls.map(async (url) => {
        const response = await fetch(url.url);
        const blob = await response.blob();
        const filename = "Chapter " + paddy(url.index + 1, 3) + ".mp3";

        let partElem = document.createElement("div");
        partElem.textContent = "Download of "+ filename + " complete";
        downloadElem.appendChild(partElem);
        downloadElem.scrollTo(0, downloadElem.scrollHeight);

        downloadState += 1;

        zip.file(filename, blob, { compression: "STORE" });
      });
      if (addMeta)
        fetchPromises.push(createMetadata(zip));

      // Wait for all files to be fetched and added to the zip
      await Promise.all(fetchPromises);


      downloadElem.innerHTML += "<br><b>Downloads complete!</b> Now waiting for them to be assembled! (This might take a <b><i>minute</i></b>) <br>";
      downloadElem.innerHTML += "Zip progress: <b id='zipProg'>0</b>%";

      downloadElem.scrollTo(0, downloadElem.scrollHeight);

      // Generate the zip file
      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: "STORE",
        streamFiles: true,
      }, (meta)=>{
        if (meta.percent)
            downloadElem.querySelector("#zipProg").textContent = meta.percent.toFixed(2);

      });

      downloadElem.innerHTML += "Generated zip file! <br>"
      downloadElem.scrollTo(0, downloadElem.scrollHeight);

      // Create a download link for the zip file
      const downloadUrl = URL.createObjectURL(zipBlob);

      downloadElem.innerHTML += "Generated zip file link! <br>"
      downloadElem.scrollTo(0, downloadElem.scrollHeight);

      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = BIF.map.title.main + '.zip';
      document.body.appendChild(link);
      link.click();
      link.remove();

      downloadState = -1;
      downloadElem.innerHTML = ""
      downloadElem.classList.remove("active");

      // Clean up the object URL
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 100);
    }
    function downloadChapters(){
        if (downloadState != -1)
            return;

        downloadState = 0;
        downloadElem.classList.add("active");
        downloadElem.innerHTML = "<b>Starting download</b><br>";
        createAndDownloadZip(getUrls()).then((p)=>{});

    }
    function exportChapters(){
        if (downloadState != -1)
            return;

        downloadState = 0;
        downloadElem.classList.add("active");
        downloadElem.innerHTML = "<b>Starting export</b><br>";
        createAndDownloadZip(getUrls(), true).then((p)=>{});
    }

    // Main entry point for audiobooks
    function bifFound(){
        // New global style info
        let s = document.createElement("style");
        s.innerHTML = CSS;
        document.head.appendChild(s)

        buildPirateUi();
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
