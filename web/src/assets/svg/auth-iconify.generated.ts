/* Minimal auth icon data extracted from the pinned Remix Icon and Solar icon sets. */

interface LocalIconData {
  body: string
  width: number
  height: number
}

export const authIconData = {
  "ri:check-fill": {
    "body": "<path fill=\"currentColor\" d=\"m10 15.17l9.192-9.191l1.414 1.414L10 17.999l-6.364-6.364l1.414-1.414z\"/>",
    "width": 24,
    "height": 24
  },
  "ri:moon-line": {
    "body": "<path fill=\"currentColor\" d=\"M10 7a7 7 0 0 0 12 4.9v.1c0 5.523-4.477 10-10 10S2 17.523 2 12S6.477 2 12 2h.1A6.98 6.98 0 0 0 10 7m-6 5a8 8 0 0 0 15.062 3.762A9 9 0 0 1 8.238 4.938A8 8 0 0 0 4 12\"/>",
    "width": 24,
    "height": 24
  },
  "ri:palette-line": {
    "body": "<path fill=\"currentColor\" d=\"M12 2c5.522 0 10 3.978 10 8.889a5.56 5.56 0 0 1-5.556 5.555h-1.966c-.922 0-1.667.745-1.667 1.667c0 .422.167.811.422 1.1c.267.3.434.689.434 1.122C13.667 21.256 12.9 22 12 22C6.478 22 2 17.522 2 12S6.478 2 12 2m-1.189 16.111a3.664 3.664 0 0 1 3.667-3.667h1.966A3.56 3.56 0 0 0 20 10.89C20 7.139 16.468 4 12 4a8 8 0 0 0-.676 15.972a3.65 3.65 0 0 1-.513-1.86M7.5 12a1.5 1.5 0 1 1 0-3a1.5 1.5 0 0 1 0 3m9 0a1.5 1.5 0 1 1 0-3a1.5 1.5 0 0 1 0 3M12 9a1.5 1.5 0 1 1 0-3a1.5 1.5 0 0 1 0 3\"/>",
    "width": 24,
    "height": 24
  },
  "ri:sun-fill": {
    "body": "<path fill=\"currentColor\" d=\"M12 18a6 6 0 1 1 0-12a6 6 0 0 1 0 12M11 1h2v3h-2zm0 19h2v3h-2zM3.515 4.929l1.414-1.414L7.05 5.636L5.636 7.05zM16.95 18.364l1.414-1.414l2.121 2.121l-1.414 1.414zm2.121-14.85l1.414 1.415l-2.121 2.121l-1.414-1.414zM5.636 16.95l1.414 1.414l-2.121 2.121l-1.414-1.414zM23 11v2h-3v-2zM4 11v2H1v-2z\"/>",
    "width": 24,
    "height": 24
  },
  "ri:translate-2": {
    "body": "<path fill=\"currentColor\" d=\"m18.5 10l4.4 11h-2.155l-1.201-3h-4.09l-1.199 3h-2.154L16.5 10zM10 2v2h6v2h-1.968a18.2 18.2 0 0 1-3.62 6.301a15 15 0 0 0 2.335 1.707l-.75 1.878A17 17 0 0 1 9 13.725a16.7 16.7 0 0 1-6.201 3.548l-.536-1.929a14.7 14.7 0 0 0 5.327-3.042A18 18 0 0 1 4.767 8h2.24A16 16 0 0 0 9 10.877a16.2 16.2 0 0 0 2.91-4.876L2 6V4h6V2zm7.5 10.885L16.253 16h2.492z\"/>",
    "width": 24,
    "height": 24
  },
  "solar:double-alt-arrow-right-linear": {
    "body": "<g fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"><path d=\"M11 19L17 12L11 5\"/><path d=\"M7 19L13 12L7 5\"/></g>",
    "width": 24,
    "height": 24
  }
} as const satisfies Record<string, LocalIconData>
