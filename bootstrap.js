if (typeof Zotero == 'undefined') {
    var Zotero;
}
var ShortDOI;
var chromeHandle;

let mainWindowListener;

function log(msg) {
    Zotero.debug("DOI Manager: " + msg);
}

// In Zotero 6, bootstrap methods are called before Zotero is initialized, and using include.js
// to get the Zotero XPCOM service would risk breaking Zotero startup. Instead, wait for the main
// Zotero window to open and get the Zotero object from there.
//
// In Zotero 7, bootstrap methods are not called until Zotero is initialized, and the 'Zotero' is
// automatically made available.
async function waitForZotero() {
    if (typeof Zotero != 'undefined') {
        await Zotero.initializationPromise;
        return;
    }

    var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
    var windows = Services.wm.getEnumerator('navigator:browser');
    var found = false;
    while (windows.hasMoreElements()) {
        let win = windows.getNext();
        if (win.Zotero) {
            Zotero = win.Zotero;
            found = true;
            break;
        }
    }
    if (!found) {
        await new Promise((resolve) => {
            var listener = {
                onOpenWindow: function (aWindow) {
                    // Wait for the window to finish loading
                    let domWindow = aWindow
                        .QueryInterface(Ci.nsIInterfaceRequestor)
                        .getInterface(
                            Ci.nsIDOMWindowInternal || Ci.nsIDOMWindow
                        );
                    domWindow.addEventListener(
                        "load",
                        function () {
                            domWindow.removeEventListener(
                                "load",
                                arguments.callee,
                                false
                            );
                            if (domWindow.Zotero) {
                                Services.wm.removeListener(listener);
                                Zotero = domWindow.Zotero;
                                resolve();
                            }
                        },
                        false
                    );
                },
            };
            Services.wm.addListener(listener);
        });
    }
    await Zotero.initializationPromise;
}

// Adds main window open/close listeners in Zotero 6
function listenForMainWindowEvents() {
    mainWindowListener = {
        onOpenWindow: function (aWindow) {
            let domWindow = aWindow
                .QueryInterface(Ci.nsIInterfaceRequestor)
                .getInterface(Ci.nsIDOMWindowInternal || Ci.nsIDOMWindow);
            async function onload() {
                domWindow.removeEventListener("load", onload, false);
                if (
                    domWindow.location.href !==
                    "chrome://zotero/content/standalone/standalone.xul"
                ) {
                    return;
                }
                onMainWindowLoad({ window: domWindow });
            }
            domWindow.addEventListener("load", onload, false);
        },
        onCloseWindow: async function (aWindow) {
            let domWindow = aWindow
                .QueryInterface(Ci.nsIInterfaceRequestor)
                .getInterface(Ci.nsIDOMWindowInternal || Ci.nsIDOMWindow);
            if (
                domWindow.location.href !==
                "chrome://zotero/content/standalone/standalone.xul"
            ) {
                return;
            }
            onMainWindowUnload({ window: domWindow });
        },
    };
    Services.wm.addListener(mainWindowListener);
}

function removeMainWindowListener() {
    if (mainWindowListener) {
        Services.wm.removeListener(mainWindowListener);
    }
}

// Loads default preferences from prefs.js in Zotero 6
function setDefaultPrefs(rootURI) {
    var branch = Services.prefs.getDefaultBranch("");
    var obj = {
        pref(pref, value) {
            switch (typeof value) {
                case 'boolean':
                    branch.setBoolPref(pref, value);
                    break;
                case 'string':
                    branch.setStringPref(pref, value);
                    break;
                case 'number':
                    branch.setIntPref(pref, value);
                    break;
                default:
                    Zotero.logError(`Invalid type '${typeof (value)}' for pref '${pref}'`);
            }
        },
    };
    Services.scriptloader.loadSubScript(rootURI + "prefs.js", obj);
}

async function install() {
    await waitForZotero();

    log("Installed");
}

async function startup({ id, version, resourceURI, rootURI = resourceURI.spec }) {
    await waitForZotero();

    log("Starting");

    // 'Services' may not be available in Zotero 6
    if (typeof Services == 'undefined') {
        var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
    }

    if (Zotero.platformMajorVersion < 102) {
        // Listen for window load/unload events in Zotero 6, since onMainWindowLoad/Unload don't
        // get called
        listenForMainWindowEvents();
        // Read prefs from prefs.js in Zotero 6
        setDefaultPrefs(rootURI);
    }

    var aomStartup = Cc[
        "@mozilla.org/addons/addon-manager-startup;1"
    ].getService(Ci.amIAddonManagerStartup);
    var manifestURI = Services.io.newURI(rootURI + "manifest.json");
    chromeHandle = aomStartup.registerChrome(manifestURI, [
        ["locale", "zoteroshortdoi", "en-US", "locale/en-US/"],
        ["locale", "zoteroshortdoi", "de", "locale/de/"],
    ]);

    Services.scriptloader.loadSubScript(rootURI + "zoteroshortdoi.js");

    ShortDOI.init({ id, version, rootURI });

    if (Zotero.platformMajorVersion >= 102) {
        Zotero.PreferencePanes.register({
            pluginID: 'zoteroshortdoi@wiernik.org',
            src: rootURI + 'content/options.xhtml',
            //scripts: ['prefs.js'],
            //stylesheets: ['prefs.css'],
        });
    }

    ShortDOI.addToAllWindows();
}

function onMainWindowLoad({ window }) {
    ShortDOI.addToWindow(window);
}

function onMainWindowUnload({ window }) {
    ShortDOI.removeFromWindow(window);

    window.addEventListener(
        "unload",
        function (e) {
            Zotero.Notifier.unregisterObserver(ShortDOI.notifierID);
        },
        false
    );
}

function shutdown() {
    log("Shutting down");

    if (Zotero.platformMajorVersion < 102) {
        removeMainWindowListener();
    }

    chromeHandle.destruct();
    chromeHandle = null;

    ShortDOI.removeFromAllWindows();
    ShortDOI = undefined;
}

function uninstall() {
    // `Zotero` object isn't available in `uninstall()` in Zotero 6, so log manually
    if (typeof Zotero == 'undefined') {
        dump("DOI Manager: Uninstalled\n\n");
        return;
    }

    log("Uninstalled");
}
