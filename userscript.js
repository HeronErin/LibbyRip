// ==UserScript==
// @name          LibreGRAB
// @namespace     http://tampermonkey.net/
// @version       2025-02-25
// @description   Download all the booty!
// @author        HeronErin
// @license       MIT
// @supportURL    https://github.com/HeronErin/LibbyRip/issues
// @match         *://*.listen.libbyapp.com/*
// @match         *://*.listen.overdrive.com/*
// @match         *://*.read.libbyapp.com/?*
// @match         *://*.read.overdrive.com/?*
// @run-at        document-start
// @icon          https://www.google.com/s2/favicons?sz=64&domain=libbyapp.com
// @require       https://cdnjs.cloudflare.com/ajax/libs/jszip/3.7.1/jszip.min.js
// @grant         none
// ==/UserScript==

(()=>{

    let downloadElem;
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
        color: white;

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
    }`;
    /* =========================================
              BEGIN AUDIOBOOK SECTION!
       =========================================
    */


    // Libby, somewhere, gets the crypto stuff we need for mp3 urls, then removes it before adding it to the BIF.
    // here, we simply hook json parse to get it for us!

    const old_parse = JSON.parse;
    let odreadCmptParams = null;
    JSON.parse = function(...args){
        let ret = old_parse(...args);
        if (typeof(ret) == "object" && ret["b"] != undefined && ret["b"]["-odread-cmpt-params"] != undefined){
            odreadCmptParams = Array.from(ret["b"]["-odread-cmpt-params"]);
        }

        return ret;
    }



    const audioBookNav = `
        <a class="pLink" id="chap"> <h1> View chapters </h1> </a>
        <a class="pLink" id="dow"> <h1> Download chapters </h1> </a>
        <a class="pLink" id="exp"> <h1> Export audiobook </h1> </a>
    `;
    const chaptersMenu = `
        <h2>This book contains {CHAPTERS} chapters.</h2>
    `;
    let chapterMenuElem;

    function buildPirateUi(){
        // Create the nav
        let nav = document.createElement("div");
        nav.innerHTML = audioBookNav;
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
        downloadElem.setAttribute("tabindex", "-1"); // Don't mess with tab key
        document.body.appendChild(downloadElem);


    }
    function getUrls(){
        let ret = [];
        for (let spine of BIF.objects.spool.components){
            let data = {

                url: location.origin + "/" + spine.meta.path + "?" + odreadCmptParams[spine.spinePosition],
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
        const filename = "Part " + paddy(url.index + 1, 2) + ".mp3";

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
      const authors = BIF.map.creator.filter(creator => creator.role === 'author').map(creator => creator.name);
      link.download = authors.join(', ') + ' - ' + BIF.map.title.main + '.zip';
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
    function bifFoundAudiobook(){
        // New global style info
        let s = document.createElement("style");
        s.innerHTML = CSS;
        document.head.appendChild(s)
        if (odreadCmptParams == null){
            alert("odreadCmptParams not set, so cannot resolve book urls! Libby changed their site again!")
            return;
        }

        buildPirateUi();
    }



    /* =========================================
              END AUDIOBOOK SECTION!
       =========================================
    */

    /* =========================================
              BEGIN BOOK SECTION!
       =========================================
    */
    const bookNav = `
        <div style="text-align: center; width: 100%;">
           <a class="pLink" id="download"> <h1> Download EPUB </h1> </a>
        </div>
    `;
    window.pages = {};

    // Libby used the bind method as a way to "safely" expose
    // the decryption module. THIS IS THEIR DOWNFALL.
    // As we can hook bind, allowing us to obtain the
    // decryption function
    const originalBind = Function.prototype.bind;
    Function.prototype.bind = function(...args) {
        const boundFn = originalBind.apply(this, args);
        boundFn.__boundArgs = args.slice(1); // Store bound arguments (excluding `this`)
        return boundFn;
    };


    async function waitForChapters(callback){
        let components = getBookComponents();
        // Force all the chapters to load in.
        components.forEach(page =>{
            if (undefined != window.pages[page.id]) return;
            page._loadContent({callback: ()=>{}})
        });
        // But its not instant, so we need to wait until they are all set (see: bifFound())
        while (components.filter((page)=>undefined==window.pages[page.id]).length){
            await new Promise(r => setTimeout(r, 100));
            callback();
            console.log(components.filter((page)=>undefined==window.pages[page.id]).length);
        }
    }
    function getBookComponents(){
        return BIF.objects.reader._.context.spine._.components.filter(p => "hidden" != (p.block || {}).behavior)
    }
    function truncate(path){
        return path.substring(path.lastIndexOf('/') + 1);
    }
    function goOneLevelUp(url) {
        let u = new URL(url);
        if (u.pathname === "/") return url; // Already at root

        u.pathname = u.pathname.replace(/\/[^/]*\/?$/, "/");
        return u.toString();
    }
    function getFilenameFromURL(url) {
        const parsedUrl = new URL(url);
        const pathname = parsedUrl.pathname;
        return pathname.substring(pathname.lastIndexOf('/') + 1);
    }
    async function createContent(oebps, imgAssests){

        let cssRegistry = {};

        let components = getBookComponents();
        let totComp = components.length;
        downloadElem.innerHTML += `Gathering chapters <span id="chapAcc"> 0/${totComp} </span><br>`
        downloadElem.scrollTo(0, downloadElem.scrollHeight);

        let gc = 0;
        await waitForChapters(()=>{
            gc+=1;
            downloadElem.querySelector("span#chapAcc").innerHTML = ` ${components.filter((page)=>undefined!=window.pages[page.id]).length}/${totComp}`;
        });

        downloadElem.innerHTML += `Chapter gathering complete<br>`
        downloadElem.scrollTo(0, downloadElem.scrollHeight);

        let idToIfram = {};
        let idToMetaId = {};
        components.forEach(c=>{
            // Nothing that can be done here...
            if (c.sheetBox.querySelector("iframe") == null){
                console.warn("!!!" + window.pages[c.id]);
                return;
            }
            c.meta.id = c.meta.id || crypto.randomUUID()
            idToMetaId[c.id] = c.meta.id;
            idToIfram[c.id] = c.sheetBox.querySelector("iframe");

            c.sheetBox.querySelector("iframe").contentWindow.document.querySelectorAll("link").forEach(link=>{
                cssRegistry[c.id] = cssRegistry[c.id] || [];
                cssRegistry[c.id].push(link.href);

                if (imgAssests.includes(link.href)) return;
                imgAssests.push(link.href);


            });
        });
        let url = location.origin;
        for (let i of Object.keys(window.pages)){
            if (idToIfram[i])
                url = idToIfram[i].src;
            oebps.file(truncate(i), fixXhtml(idToMetaId[i], url, window.pages[i], imgAssests, cssRegistry[i] || []));
        }

        downloadElem.innerHTML += `Downloading assets <span id="assetGath"> 0/${imgAssests.length} </span><br>`
        downloadElem.scrollTo(0, downloadElem.scrollHeight);


        gc = 0;
        await Promise.all(imgAssests.map(name=>(async function(){
            const response = await fetch(name.startsWith("http") ? name : location.origin + "/" + name);
            if (response.status != 200) {
                downloadElem.innerHTML += `<b>WARNING:</b> Could not fetch ${name}<br>`
                downloadElem.scrollTo(0, downloadElem.scrollHeight);
                return;
            }
            const blob = await response.blob();

            oebps.file(name.startsWith("http") ? getFilenameFromURL(name) : name, blob, { compression: "STORE" });

            gc+=1;
            downloadElem.querySelector("span#assetGath").innerHTML = ` ${gc}/${imgAssests.length} `;
        })()));
    }
    function enforceEpubXHTML(metaId, url, htmlString, assetRegistry, links) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlString, 'text/html');
        const bod = doc.querySelector("body");
        if (bod){
            bod.setAttribute("id", metaId);
        }

        // Convert all elements to lowercase tag names
        const elements = doc.getElementsByTagName('*');
        for (let el of elements) {
            const newElement = doc.createElement(el.tagName.toLowerCase());

            // Copy attributes to the new element
            for (let attr of el.attributes) {
                newElement.setAttribute(attr.name, attr.value);
            }

            // Move child nodes to the new element
            while (el.firstChild) {
                newElement.appendChild(el.firstChild);
            }

            // Replace old element with the new one
            el.parentNode.replaceChild(newElement, el);
        }

        for (let el of elements) {
            if (el.tagName.toLowerCase() == "img" || el.tagName.toLowerCase() == "image"){
                let src = el.getAttribute("src") || el.getAttribute("xlink:href");
                if (!src) continue;

                if (!(src.startsWith("http://") ||  src.startsWith("https://"))){
                    src = (new URL(src, new URL(url))).toString();
                }
                if (!assetRegistry.includes(src))
                    assetRegistry.push(src);

                if (el.getAttribute("src"))
                    el.setAttribute("src", truncate(src));
                if (el.getAttribute("xlink:href"))
                    el.setAttribute("xlink:href", truncate(src));
            }
        }


          // Ensure the <head> element exists with a <title>
        let head = doc.querySelector('head');
        if (!head) {
            head = doc.createElement('head');
            doc.documentElement.insertBefore(head, doc.documentElement.firstChild);
        }

        let title = head.querySelector('title');
        if (!title) {
            title = doc.createElement('title');
            title.textContent = BIF.map.title.main; // Default title
            head.appendChild(title);
        }

        for (let link of links){
            let linkElement = doc.createElement('link');
            linkElement.setAttribute("href", link);
            linkElement.setAttribute("rel", "stylesheet");
            linkElement.setAttribute("type", "text/css");
            head.appendChild(linkElement);
        }

        // Get the serialized XHTML string
        const serializer = new XMLSerializer();
        let xhtmlString = serializer.serializeToString(doc);

        // Ensure proper namespaces (if not already present)
        if (!xhtmlString.includes('xmlns="http://www.w3.org/1999/xhtml"')) {
            xhtmlString = xhtmlString.replace('<html>', '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xmlns:m="http://www.w3.org/1998/Math/MathML" xmlns:pls="http://www.w3.org/2005/01/pronunciation-lexicon" xmlns:ssml="http://www.w3.org/2001/10/synthesis" xmlns:svg="http://www.w3.org/2000/svg">');
        }

        return xhtmlString;
    }
    function fixXhtml(metaId, url, html, assetRegistry, links){
        html = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
` + enforceEpubXHTML(metaId, url, `<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xmlns:m="http://www.w3.org/1998/Math/MathML" xmlns:pls="http://www.w3.org/2005/01/pronunciation-lexicon" xmlns:ssml="http://www.w3.org/2001/10/synthesis" xmlns:svg="http://www.w3.org/2000/svg">`
            + html + `</html>`, assetRegistry, links);



        return html;
    }
    function getMimeTypeFromFileName(fileName) {
        const mimeTypes = {
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            png: 'image/png',
            gif: 'image/gif',
            bmp: 'image/bmp',
            webp: 'image/webp',
            mp4: 'video/mp4',
            mp3: 'audio/mp3',
            pdf: 'application/pdf',
            txt: 'text/plain',
            html: 'text/html',
            css: 'text/css',
            json: 'application/json',
            // Add more extensions as needed
        };

        const ext = fileName.split('.').pop().toLowerCase();
        return mimeTypes[ext] || 'application/octet-stream';
}
    function makePackage(oebps, assetRegistry){
        const doc = document.implementation.createDocument(
            'http://www.idpf.org/2007/opf', // default namespace
            'package', // root element name
            null // do not specify a doctype
        );

        // Step 2: Set attributes for the root element
        const packageElement = doc.documentElement;
        packageElement.setAttribute('version', '2.0');
        packageElement.setAttribute('xml:lang', 'en');
        packageElement.setAttribute('unique-identifier', 'pub-identifier');
        packageElement.setAttribute('xmlns', 'http://www.idpf.org/2007/opf');
        packageElement.setAttribute('xmlns:dc', 'http://purl.org/dc/elements/1.1/');
        packageElement.setAttribute('xmlns:dcterms', 'http://purl.org/dc/terms/');

        // Step 3: Create and append child elements to the root
        const metadata = doc.createElementNS('http://www.idpf.org/2007/opf', 'metadata');
        packageElement.appendChild(metadata);

        // Create child elements for metadata
        const dcIdentifier = doc.createElementNS('http://purl.org/dc/elements/1.1/', 'dc:identifier');
        dcIdentifier.setAttribute('id', 'pub-identifier');
        dcIdentifier.textContent = "" + BIF.map["-odread-buid"];
        metadata.appendChild(dcIdentifier);

        // Language
        if (BIF.map.language.length){
            const dcLanguage = doc.createElementNS('http://purl.org/dc/elements/1.1/', 'dc:language');
            dcLanguage.setAttribute('xsi:type', 'dcterms:RFC4646');
            dcLanguage.textContent = BIF.map.language[0];
            packageElement.setAttribute('xml:lang', BIF.map.language[0]);
            metadata.appendChild(dcLanguage);
        }

        // Identifier
        const metaIdentifier = doc.createElementNS('http://www.idpf.org/2007/opf', 'meta');
        metaIdentifier.setAttribute('id', 'meta-identifier');
        metaIdentifier.setAttribute('property', 'dcterms:identifier');
        metaIdentifier.textContent = "" + BIF.map["-odread-buid"];
        metadata.appendChild(metaIdentifier);

        // Title
        const dcTitle = doc.createElementNS('http://purl.org/dc/elements/1.1/', 'dc:title');
        dcTitle.setAttribute('id', 'pub-title');
        dcTitle.textContent = BIF.map.title.main;
        metadata.appendChild(dcTitle);


          // Creator (Author)
        if(BIF.map.creator.length){
            const dcCreator = doc.createElementNS('http://purl.org/dc/elements/1.1/', 'dc:creator');
            dcCreator.textContent = BIF.map.creator[0].name;
            metadata.appendChild(dcCreator);
        }

        // Description
        if(BIF.map.description){
            // Remove HTML tags
            let p = document.createElement("p");
            p.innerHTML = BIF.map.description.full;


            const dcDescription = doc.createElementNS('http://purl.org/dc/elements/1.1/', 'dc:description');
            dcDescription.textContent = p.textContent;
            metadata.appendChild(dcDescription);
        }

        // Step 4: Create the manifest, spine, guide, and other sections...
        const manifest = doc.createElementNS('http://www.idpf.org/2007/opf', 'manifest');
        packageElement.appendChild(manifest);

        const spine = doc.createElementNS('http://www.idpf.org/2007/opf', 'spine');
        spine.setAttribute("toc", "ncx");
        packageElement.appendChild(spine);


        const item = doc.createElementNS('http://www.idpf.org/2007/opf', 'item');
        item.setAttribute('id', 'ncx');
        item.setAttribute('href', 'toc.ncx');
        item.setAttribute('media-type', 'application/x-dtbncx+xml');
        manifest.appendChild(item);


        // Generate out the manifest
        let components = getBookComponents();
        components.forEach(chapter =>{
            const item = doc.createElementNS('http://www.idpf.org/2007/opf', 'item');
            item.setAttribute('id', chapter.meta.id);
            item.setAttribute('href', truncate(chapter.meta.path));
            item.setAttribute('media-type', 'application/xhtml+xml');
            manifest.appendChild(item);


            const itemref = doc.createElementNS('http://www.idpf.org/2007/opf', 'itemref');
            itemref.setAttribute('idref', chapter.meta.id);
            itemref.setAttribute('linear', "yes");
            spine.appendChild(itemref);
        });

        assetRegistry.forEach(asset => {
            const item = doc.createElementNS('http://www.idpf.org/2007/opf', 'item');
            let aname = asset.startsWith("http") ? getFilenameFromURL(asset) : asset;
            item.setAttribute('id', aname.split(".")[0]);
            item.setAttribute('href', aname);
            item.setAttribute('media-type', getMimeTypeFromFileName(aname));
            manifest.appendChild(item);
        });

        // Step 5: Serialize the document to a string
        const serializer = new XMLSerializer();
        const xmlString = serializer.serializeToString(doc);

        oebps.file("content.opf", `<?xml version="1.0" encoding="utf-8" standalone="no"?>\n` + xmlString);
    }
    function makeToc(oebps){
        // Step 1: Create the document with a default namespace
        const doc = document.implementation.createDocument(
            'http://www.daisy.org/z3986/2005/ncx/', // default namespace
            'ncx', // root element name
            null // do not specify a doctype
        );

        // Step 2: Set attributes for the root element
        const ncxElement = doc.documentElement;
        ncxElement.setAttribute('version', '2005-1');

        // Step 3: Create and append child elements to the root
        const head = doc.createElementNS('http://www.daisy.org/z3986/2005/ncx/', 'head');
        ncxElement.appendChild(head);

        const uidMeta = doc.createElementNS('http://www.daisy.org/z3986/2005/ncx/', 'meta');
        uidMeta.setAttribute('name', 'dtb:uid');
        uidMeta.setAttribute('content', "" + BIF.map["-odread-buid"]);
        head.appendChild(uidMeta);

        // Step 4: Create docTitle and add text
        const docTitle = doc.createElementNS('http://www.daisy.org/z3986/2005/ncx/', 'docTitle');
        ncxElement.appendChild(docTitle);

        const textElement = doc.createElementNS('http://www.daisy.org/z3986/2005/ncx/', 'text');
        textElement.textContent = BIF.map.title.main;
        docTitle.appendChild(textElement);

        // Step 5: Create navMap and append navPoint elements
        const navMap = doc.createElementNS('http://www.daisy.org/z3986/2005/ncx/', 'navMap');
        ncxElement.appendChild(navMap);


        let components = getBookComponents();

        components.forEach(chapter =>{
            // First navPoint
            const navPoint1 = doc.createElementNS('http://www.daisy.org/z3986/2005/ncx/', 'navPoint');
            navPoint1.setAttribute('id', chapter.meta.id);
            navPoint1.setAttribute('playOrder', '' + (1+chapter.index));
            navMap.appendChild(navPoint1);

            const navLabel1 = doc.createElementNS('http://www.daisy.org/z3986/2005/ncx/', 'navLabel');
            navPoint1.appendChild(navLabel1);

            const text1 = doc.createElementNS('http://www.daisy.org/z3986/2005/ncx/', 'text');
            text1.textContent = BIF.map.title.main;
            navLabel1.appendChild(text1);

            const content1 = doc.createElementNS('http://www.daisy.org/z3986/2005/ncx/', 'content');
            content1.setAttribute('src', truncate(chapter.meta.path));
            navPoint1.appendChild(content1);
        });


        // Step 6: Serialize the document to a string
        const serializer = new XMLSerializer();
        const xmlString = serializer.serializeToString(doc);

        oebps.file("toc.ncx", `<?xml version="1.0" encoding="utf-8" standalone="no"?>\n` + xmlString);
    }
    async function downloadEPUB(){
        let imageAssets = new Array();


        const zip = new JSZip();
        zip.file("mimetype", "application/epub+zip", {compression: "STORE"});
        zip.folder("META-INF").file("container.xml", `<?xml version="1.0" encoding="UTF-8"?>
                <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
                    <rootfiles>
                        <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
                    </rootfiles>
                </container>
        `);

        let oebps = zip.folder("OEBPS");
        await createContent(oebps, imageAssets);

        makePackage(oebps, imageAssets);
        makeToc(oebps);


      downloadElem.innerHTML += "<br><b>Downloads complete!</b> Now waiting for them to be assembled! (This might take a <b><i>minute</i></b>) <br>";
      downloadElem.innerHTML += "Zip progress: <b id='zipProg'>0</b>%<br>";


        // Generate the zip file
        const zipBlob = await zip.generateAsync({
            type: 'blob',
            compression: "DEFLATE",
            streamFiles: true,
        }, (meta)=>{
            if (meta.percent)
               downloadElem.querySelector("#zipProg").textContent = meta.percent.toFixed(2);

        });


        downloadElem.innerHTML += `EPUB generation complete! Starting download<br>`
        downloadElem.scrollTo(0, downloadElem.scrollHeight);

        const downloadUrl = URL.createObjectURL(zipBlob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = BIF.map.title.main + '.epub';
        link.click();



        // Clean up the object URL
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 100);

        downloadState = -1;
    }

    // Main entry point for audiobooks
    function bifFoundBook(){
        // New global style info
        let s = document.createElement("style");
        s.innerHTML = CSS;
        document.head.appendChild(s)

        if (!window.__bif_cfc1){
            alert("Injection failed! __bif_cfc1 not found");
            return;
        }
        const old_crf1 = window.__bif_cfc1;
        window.__bif_cfc1 = (win, edata)=>{
            // If the bind hook succeeds, then the first element of bound args
            // will be the decryption function. So we just passivly build up an
            // index of the pages!
            pages[win.name] = old_crf1.__boundArgs[0](edata);
            return old_crf1(win, edata);
        };

        buildBookPirateUi();
    }

    function downloadEPUBBBtn(){
        if (downloadState != -1)
            return;

        downloadState = 0;
        downloadElem.classList.add("active");
        downloadElem.innerHTML = "<b>Starting download</b><br>";

        downloadEPUB().then(()=>{});
    }
    function buildBookPirateUi(){
        // Create the nav
        let nav = document.createElement("div");
        nav.innerHTML = bookNav;
        nav.querySelector("#download").onclick = downloadEPUBBBtn;
        nav.classList.add("pNav");
        let pbar = document.querySelector(".nav-progress-bar");
        pbar.insertBefore(nav, pbar.children[1]);



        downloadElem = document.createElement("div");
        downloadElem.classList.add("foldMenu");
        downloadElem.setAttribute("tabindex", "-1"); // Don't mess with tab key
        document.body.appendChild(downloadElem);
    }

    /* =========================================
              END BOOK SECTION!
       =========================================
    */

    /* =========================================
              BEGIN INITIALIZER SECTION!
       =========================================
    */


    // The "BIF" contains all the info we need to download
    // stuff, so we wait until the page is loaded, and the
    // BIF is present, to inject the pirate menu.
    let intr = setInterval(()=>{
        if (window.BIF != undefined && document.querySelector(".nav-progress-bar") != undefined){
            clearInterval(intr);
            let mode = location.hostname.split(".")[1];
            if (mode == "listen"){
                bifFoundAudiobook();
            }else if (mode == "read"){
                bifFoundBook();
            }
        }
    }, 25);
})();
