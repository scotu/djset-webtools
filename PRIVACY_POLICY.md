# Privacy Policy — djset-webtools

*Last updated: April 2026*

## Summary

djset-webtools does not collect, store, or share any personal information. The only data sent outside your browser is the title of the YouTube video you are watching, forwarded to 1001tracklists.com solely to search for a matching tracklist.

---

## What data is transmitted and why

When you open a YouTube video longer than 30 minutes, the extension takes the video's title, strips common noise words (e.g. "Official Video", "HD", hashtags), and sends that cleaned-up title as a search query to:

```
https://www.1001tracklists.com/search/result.php
```

This is a POST request to 1001tracklists.com's own search endpoint — the same search you would perform manually on the site. The query contains only the video title text; no account information, no YouTube cookies, and no identifiers of any kind are included.

The response (a list of matching tracklist pages) is used to display a link below the video title. Nothing from the response is stored anywhere other than your own browser.

**This is the only network request the extension makes on its own behalf.**

---

## Local storage

Search results are cached in your browser's local extension storage (`browser.storage.local`) so that revisiting the same video does not require a new network request. This cache:

- never leaves your device,
- is limited to 200 entries (oldest entries are evicted automatically),
- can be cleared at any time by removing the extension.

---

## What is not collected

- No personal information (name, email, account details).
- No browsing history beyond the single video title sent per search.
- No usage statistics or analytics.
- No data is sent to the extension's developer or any third party other than 1001tracklists.com as described above.

---

## Third-party service

The search query is sent to **1001tracklists.com**, a third-party website operated independently of this extension. Their handling of that request is governed by their own privacy policy. The extension has no control over and takes no responsibility for how 1001tracklists.com processes incoming search requests.

---

## Changes to this policy

If the extension's data practices change in a future version, this document will be updated and the *Last updated* date will be revised.

---

## Contact

If you have questions about this policy, open an issue in the project repository.
