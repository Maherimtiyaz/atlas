# Atlas

Atlas is a visual product-map interface for understanding a codebase. Instead of browsing folders and files linearly, Atlas turns a repository into a living map of features, pages, APIs, services, database tables, and integrations so you can see how the system fits together.

> "Google Maps for understanding software." Atlas is designed to help teams reason about architecture, dependencies, and product flow at a glance.

## What Atlas does

- Maps a codebase into a spatial product graph
- Groups code by product structure: feature, page, API, service, database, and external dependency
- Highlights relationships and flow between system parts
- Supports exploration by selection, focus, trace paths, and history mode
- Lets you import a GitHub repo, upload a graph export, or explore the included Pulseboard demo
- Provides plain-language explanations and a searchable command palette for navigation

## Key features

- Demo repository mode for an immediate product walkthrough
- GitHub import flow for public repositories
- JSON graph upload for local analysis exports
- Flow tracing to follow a path between nodes
- Complexity and history views for architecture analysis
- Code viewer for inspecting relevant source files
- Archive export to download the project source as a zip

## Tech stack

- React + Vite
- TypeScript
- Tailwind CSS
- Zustand for app state
- React Flow for interactive graph rendering
- Framer Motion for interface transitions
- Lucide icons for UI visuals

## Prerequisites

- Node.js 18+
- npm

## Quick start

```bash
npm install
npm run dev
```

Then open the local app in your browser:

- http://localhost:3000

## Available scripts

```bash
npm run dev      # start the Vite development server
npm run build    # run TypeScript checks and produce a production build in dist/
npm run preview  # preview the production build locally
npm test         # run the Vitest test suite
```

## Project structure

```text
Atlas/
├── src/
│   ├── components/
│   ├── data/
│   ├── lib/
│   ├── __tests__/
│   ├── App.tsx
│   ├── index.css
│   ├── model.ts
│   ├── store.ts
│   └── main.tsx
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.js
├── README.md
└── dist/ (generated after build)
```

## How to use Atlas

### 1. Try the demo

From the landing screen, choose the demo repository to load the included Pulseboard sample project and explore the map immediately.

### 2. Import a GitHub repository

Use the GitHub import option and enter an owner/repo pair or a full GitHub URL. Atlas fetches the repository metadata and performs local analysis in the browser.

### 3. Upload a graph export

Upload a JSON graph file containing nodes and edges to inspect a precomputed map structure.

### 4. Explore the map

- Select a node to inspect its details
- Trace flows between connected nodes
- Switch between overview, complexity, and history modes
- Open the command palette to search or ask about the graph
- Open the code viewer to inspect the underlying files for selected nodes

## Notes

- GitHub analysis depends on the public GitHub API and repository accessibility.
- Local uploads are intended for JSON graph exports rather than raw zipped repositories.
- The app is designed for architectural understanding and product mapping, not as a general-purpose source-code editor.

## License

This project is intended for internal product exploration and codebase understanding workflows. Add your preferred license text if you plan to distribute or publish it publicly.

