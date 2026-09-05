# TheSpecialNone Donations
This is a small single-page site I built for taking Robux donations through Roblox game passes. There's no backend and no database involved, just one HTML file. Upload it wherever you like and it works right away.

## What's on the page

- **Item shop**: Ten donation tiers, ranging from 5 Robux up to 10,000, color-coded like loot rarity (common to legendary). Each tier links directly to the matching Roblox game pass.
- **Goal tracker**: A progress bar showing how close we are to hitting the target.
- **Profile button**: Links out to my Roblox profile.
- **Background music player**: Sits in the bottom-right corner with play/pause and mute controls, and pulls the track title straight from YouTube.

I designed the whole thing with a pixel/arcade theme: chunky borders, hard shadows, retro fonts. There are no frameworks and no build step involved, just plain HTML, CSS, and JS in one file. I kept it this way on purpose so I (or anyone else) can open it up and make changes without needing a toolchain.

## Editing stuff

### Change the goal tracker
Near the bottom of `index.html`, you'll find:

```js
const ROBUX_RAISED = 1153;
const ROBUX_GOAL = 24800;
```

Just change the numbers, save, and redeploy. The bar and percentage update themselves, so there's no other math to do.

### Change the audio
Same area of the script:

```js
const YT_VIDEO_ID = "URtsmOwjVLw";
```

Swap in any YouTube video ID and it will grab the title automatically.

### Change a gamepass tier
Each tier is one `<a class="card ...">` block in the shop section. Update the `href` to the new game pass link and swap the numbers inside.

### Add or remove tiers
Copy an existing `.card` block, change the rarity class (`r-common`, `r-uncommon`, `r-rare`, `r-epic`, `r-legendary`) to match the size of the amount, then update the link and numbers.

## Deploying

This is a static file, so no server is needed. The easiest options I've used are:

- **GitHub Pages**: Push `index.html` to a repo, turn on Pages in Settings, and it's done. It takes a couple of minutes to go live.
- **Cloudflare Pages**: Drag and drop the file, connect a custom domain if you want one, and SSL is included for free.

Either way, all the actual payment handling happens on Roblox's side. This page only links out to it and never touches money itself, which is exactly how I wanted it set up.

## Notes

- The music player will not autoplay with sound. That's a browser rule, not a bug. Visitors need to hit play once themselves.
- The 70% payout split shown in the stats box reflects Roblox's current creator cut, not something this site controls. If Roblox changes that percentage, I'll need to update the number by hand.
