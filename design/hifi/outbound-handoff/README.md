# Outbound: design handoff for Claude Code

Put this folder in the repo at `docs/design/`, then paste the prompt at the bottom into Claude Code.

```
DESIGN.md     the spec: changes from the current app, tokens, shell, components, every screen and state
tokens.css    colors, type, radii, shadows and layout values as CSS variables
assets/
  outbound-wordmark.svg   logo (white + gold), for maroon backgrounds only
reference/
  mobile/    16 screens at 390 × 844
  desktop/   19 screens at 1440 wide (fluid)
```

## How to read the reference files

They're exports from the design canvas, not runnable pages. Read them as annotated markup.

- **Styles.** Every visual value is an inline `style="…"`. Copy spacing, sizes, colors, shadows and copy from there.
- **Template syntax.** Treat these as pseudo-JSX:
  - `{{name}}` is a template value.
  - `<sc-for list="{{items}}" as="x">` is a loop.
  - `<sc-if value="{{flag}}">` is a conditional.
  - The `<script type="text/x-dc">` block holds the sample data and the interaction logic: the drawer heights, check-in steps, XP count-up, tabs and toggles.
- **Prototype links.** Links between reference files show the navigation between screens. Map them to the routes in DESIGN.md §1.
- **Reusable art.** SVG icons, stamp glyphs, T-line art and the Back Bay scene can be lifted directly. The CSS keyframes in `check-in-success.html` (`ob-drop`, `ob-ring`, `ob-in`) are the celebration animation.
- **Design-only controls.** Some files have props for previewing states, such as `startStep`, `errorKind` and `startHeight`. Don't ship those controls.

## Prompt to paste into Claude Code

> Restyle the Outbound frontend to match the design in `docs/design/`. Read `DESIGN.md` first. §2 lists the structural changes from the current app (5-item nav with a bottom tab bar and a desktop top bar, "Compete" renamed to "Leaderboard", a new Quests tab, an Events placeholder, a desktop breakpoint of 1024 px).
>
> Map every value in `tokens.css` into our theme or shadcn config instead of hard-coding hex values. Use the files in `docs/design/reference/` for exact layout, copy and art.
>
> Keep all existing data, states and behavior unless DESIGN.md says otherwise. Follow the build order in §13, starting with the tokens and shell, then the Stamp component, then the Station hub, Quest detail and the check-in celebration. Light mode only: remove dark mode and its toggle entirely.
>
> Before writing code, list the files you'll change and anything in the spec that conflicts with the current implementation, and wait for my OK.
