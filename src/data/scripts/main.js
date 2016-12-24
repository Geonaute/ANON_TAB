var proxy;
var isLoading = false;
var viewer = document.getElementById('viewer');
var navBar = document.getElementById('navbar');
var hstsList = ['*.wikipedia.org', '*.twitter.com', '*.github.com',
                     '*.facebook.com', '*.torproject.org'];
chrome.storage.local.get({
    proxy: 'https://feedback.googleusercontent.com/gadgets/proxy?container=fbk&url='
}, function(items) {
    proxy = items.proxy;
});

/**
 * Change the viewer's border color.
 * @param color {string}, a color name.
 * @param loadingFlag {boolean}, sets loading status.
 * @return void.
 */
function changeBorderColor(color, loadingFlag) {
    var interval;
    if (loadingFlag) {
        interval = setInterval(function() {
            if (isLoading) {
                changeBorderColor('red');
                setTimeout(function () {
                    if (isLoading) {
                        changeBorderColor('green');
                    }
                }, 400);
            } else {
                clearInterval(interval);
                changeBorderColor('silver');
            }
        }, 800);
    }
    viewer.style.borderColor = color;
}

/**
 * Enforce HSTS for all predefined compatible domains.
 * @param url {object}, a URL object.
 * @return {string}, a URL string.
 */
function mkHstsCompat(url) {
    'use strict';
    /**
     * Assert it's a known HSTS compatible domain.
     * @param domainPtrn {string}, a domain name pattern.
     * @return {boolean}.
     */
    var isHstsCompat = function(domainPtrn) {
        domainPtrn = domainPtrn.replace('*.', '^(?:[\\w.-]+\\.)?');
        domainPtrn = new RegExp(domainPtrn);
        if (domainPtrn.test(url.hostname)) {
            return true;
        }
        return false;
    };
    if (url.protocol === 'http:' && hstsList.some(isHstsCompat)) {
        url.protocol = 'https:';
    }
    return url.href;
}

/**
 * Pass all given data to the viewer.
 * @param type {string}, the type of the data.
 * @param data {string}, the data to pass.
 * @param target {string} optional, an owner page URL.
 * @return void.
 */
function passData(type, data, target) {
    'use strict';
    viewer.contentWindow.receive(
        {proxyUrl: proxy, dataType: type, dataVal: data, targetPage: target}
    );
}

/**
 * Navigate to a given URL.
 * @param linkUrl {string}, a URL to navigate to.
 * @return void.
 */
function navigate(linkUrl) {
    'use strict';
    if (!linkUrl.startsWith('#')) {
        linkUrl = (/^\w+:\/\//.test(linkUrl)) ? linkUrl : 'http://'+linkUrl;
        try {
            linkUrl = new URL(linkUrl);
        } catch(e) {
            alert('Error: "' + linkUrl + '" is not a valid URL.');
            return;
        }
        linkUrl = mkHstsCompat(linkUrl);
    }
    passData('href', linkUrl);
}

/**
 * Load an external Web resource.
 * @param resourceUrl {string}, the URL of the resource.
 * @param type {string} optional, the type of the resource.
 * @return void.
 */
function loadResource(resourceUrl, type) {
    'use strict';
    var url = proxy + encodeURIComponent(resourceUrl);
    var exts = /(?:\.(?:s?html?|php|cgi|txt|(?:j|a)spx?|json|py|pl|cfml?)|\/(?:[^.]*|[^a-z?#]+))(?:[?#].*)?$/i;
    /**
     * Fetch an external resource.
     * @param type {string}, the type of the resource.
     * @return void.
     */
    var fetch = function(type) {
        var xhrReq = new XMLHttpRequest();
        xhrReq.responseType = (type === 'resource') ? 'blob' : 'text';
        xhrReq.onerror = function() {
            alert('NetworkError: A network error occurred.');
            isLoading = false;
        };
        xhrReq.onload = function() {
            var file, assert, reader;
            var responseType = this.getResponseHeader('content-type');
            if (responseType && responseType.indexOf(type) !== 0) {
                responseType = responseType.match(/^\w*/).toString();
                if (responseType === 'text') {
                    fetch('text');
                    return;
                } else if(responseType === 'image') {
                    passData('img', url);
                    return;
                } else if(responseType === 'audio') {
                    passData('audio', url);
                    return;
                } else if(responseType === 'video') {
                    passData('video', url);
                    return;
                } else if(type !== 'resource') {
                    fetch('resource');
                    return;
                }
            }
            // Parse HTML markup.
            var parseDoc = function() {
                var html = proxify(xhrReq.responseText, proxy, resourceUrl);
                // Pass all sanitized markup to the viewer.
                passData('document', html);
                if (/#.+/.test(resourceUrl)) {
                    // Scroll to a given page anchor.
                    navigate('#' + resourceUrl.match(/#.+/));
                }
            };
            if (this.status === 200) {
                if (type === 'text') {
                    parseDoc();
                } else {
                    file = this.response;
                    if (file.size >= 9000000) {
                        assert = confirm('Too large resource! Proceed anyway?');
                        if (!assert) { return; }
                    }
                    reader = new FileReader();
                    reader.readAsDataURL(file);
                    reader.onloadend = function() {
                        passData('resource', reader.result);
                    };
                }
            } else {
                alert('HTTPError: ' + this.status + ' ' + this.statusText);
                parseDoc();
            }
            isLoading = false;
        };
        xhrReq.open('GET', url);
        xhrReq.send();
        isLoading = true;
        changeBorderColor('green', true);
    };
    if (typeof type === 'string') {
        fetch(type);
    // Is it a document?
    } else if (exts.test(resourceUrl)) {
        fetch('text');
    // Perhaps an image?
    } else if(/\.(?:jpe?g|png|gif|bmp)(?:[?#].*)?$/i.test(resourceUrl)) {
        passData('img', url);
    // Maybe some audio file?
    } else if(/\.(?:mp3|wav)(?:[?#].*)?$/i.test(resourceUrl)) {
        passData('audio', url);
    // Probably a video?
    } else if(/\.(?:mp4|webm|ogg)(?:[?#].*)?$/i.test(resourceUrl)) {
        passData('video', url);
    } else {
        fetch('resource');
    }
}

/**
 * A proxy function for `navigate`.
 * @param ev {object} optional, an event object.
 * @return void.
 */
function initNav(ev) {
    'use strict';
    var keyCode = ev.keyCode;
    var linkUrl = ev.linkUrl || navBar.value;
    if (linkUrl && (!keyCode || keyCode === 13)) {
        navigate(linkUrl);
    }
    if (ev.type === 'submit') {
        ev.preventDefault();
    }
}

/**
 * Receive data sent by the viewer.
 * @param data {object}, a data container object.
 * @return void.
 */
function receive(data) {
    'use strict';
    var type = data.type;
    var linkUrl = data.linkUrl;
    try {
        linkUrl = new URL(linkUrl);
        linkUrl = mkHstsCompat(linkUrl);
        loadResource(linkUrl, type);
    } catch(e) {}
    navBar.value = linkUrl;
    // Reset the view.
    passData('', '');
}

// Register event listeners to handle gesture-based navigations.
document.getElementById('navform').onsubmit = initNav;
chrome.runtime.onMessage.addListener(initNav);
