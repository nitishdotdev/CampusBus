# CampusBus interface

CampusBus opens with a shuttle photo and direct links to the three workspaces. The photo is illustrative. Live bus positions are shown only in the authenticated application and come from the tracking API.

## Primitives

- **PortalHeader** keeps the CampusBus mark and a single context-appropriate action in a predictable location across landing, role selection and sign-in.
- **WorkspaceHeading** uses a level-one heading, optional service description and optional actions. Use it once at the top of a workspace.
- **Surface, panel and action styles** share the same indigo navigation accent, slate typography and neutral backgrounds. Keep emergency red and service status colors for their meanings. Pair them with text labels.
- **Workspace shell** provides a keyboard skip link and a stable mobile viewport when supported. Existing maps, menus and operational controls stay on their established routes.

Check 360, 390 and 768 px as well as desktop. Test navigation with a keyboard, prefer stable layouts over scroll-dependent animation, and use actual role and service states in screenshots. Tailwind 3 and the Vite Chrome 109 targets remain the compatibility baseline.

## Reference evaluation

Details and Refero provide pattern references for typography, spacing and restrained card layouts. Google Chrome's modern-web-guidance supports progressive enhancement and accessible focus behavior. Stick It Up, Scrolltide and IslandCN demonstrate illustration, scrolling effects and overlay navigation. The campus portal uses a static photo and conventional navigation to keep account and trip actions easy to find. [Details](https://details.so/mcp) · [Refero](https://styles.refero.design) · [Chrome guidance](https://github.com/googlechrome/modern-web-guidance) · [Stick It Up](https://stickitupx.com) · [Scrolltide](https://scrolltide.co) · [IslandCN](https://github.com/opencoredev/islandcn)
