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
- Client-side PDF export for sharing visual studies

## Tech stack

- React + Vite
- TypeScript
- Tailwind CSS
- Zustand for app state
- React Flow for interactive graph rendering
- Framer Motion for interface transitions
- Lucide icons for UI visuals
- pdf-lib for browser-generated PDF exports

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

## Free deployment

Atlas is a static Vite app and can be deployed on the Vercel Hobby plan for a personal, non-commercial showcase. PDF files are generated in the visitor's browser, so the deployment does not require Supabase, a database, authentication, payment setup, or environment variables.

1. Import the GitHub repository into Vercel.
2. Keep the framework preset as `Vite`.
3. Set the build command to `npm run build`.
4. Set the output directory to `dist`.
5. Deploy with no environment variables.

Every push to the production branch can then trigger a new Vercel deployment. GitHub repository analysis uses the public GitHub API and may be subject to its anonymous rate limits.

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

