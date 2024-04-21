SET /P version= Enter version number:
rm -f zotero-doi-manager-"%version%".xpi
zip -r zotero-doi-manager-"%version%".xpi chrome/* bootstrap.js chrome.manifest install.rdf manifest.json prefs.js zoteroshortdoi.js