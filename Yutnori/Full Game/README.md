# Yutnori — Full Game

The combined, playable app: the **Home entrance** is the landing page, and
picking a mode hands off into the **game**.

## Flow

1. `index.html` — the Home / entrance screen (unchanged design). Choose
   **Local**, **AI**, or **Online** and press **Play →**.
2. The throw animation plays, then it opens `game.html?mode=…&lang=…`.
3. `game.html` opens the **setup** with that mode pre-selected — pick
   players, names, tokens, etc. — then **Start Game** shows the board.
4. The header **⌂ Home** button returns to the entrance at any time.

The EN / 한국어 choice carries across both pages.

## Running it

The game uses JavaScript modules, so open it through a local web server
(opening `index.html` directly with `file://` will block the modules).

```bash
# from this "Full Game" folder
python3 -m http.server 8000
# then visit http://localhost:8000/
```

## Structure

```
Full Game/
├── index.html   # Home entrance (self-contained; base64 art)
├── game.html    # Setup + game board
├── css/         # game styles
└── js/          # game logic (ES modules)
```

The `js/` and `css/` are the original game code; only three files were
wired for the hand-off: `js/main.js` (reads `?mode=`, Home button),
`js/i18n.js` (reads/persists `?lang=`), and `js/ui/setup.js` (pre-selects
the mode). The Home page's markup/styles are untouched — only its Play
buttons were pointed at the game.
