SET /P version= Enter version number:
rm -f zotero-doi-manager-"%version%".xpi
zip -r zotero-doi-manager-"%version%".xpi content/* locale/* skin/* bootstrap.js chrome.manifest install.rdf manifest.json prefs.js options.xhtml zoteroshortdoi.js