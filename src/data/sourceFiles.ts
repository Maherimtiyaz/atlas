/* Embeds the entire project's source via Vite `?raw` imports so the app can
   export itself as a ZIP. package-lock.json is intentionally excluded —
   `npm install` regenerates it (noted in the README). */

import indexHtml from "../../index.html?raw";
import pkgJson from "../../package.json?raw";
import tsconfig from "../../tsconfig.json?raw";
import viteConfig from "../../vite.config.js?raw";
import readme from "../../README.md?raw";
import envExample from "../../.env.example?raw";
import gitignore from "../../.gitignore?raw";

import mainTsx from "../main.tsx?raw";
import appTsx from "../App.tsx?raw";
import indexCss from "../index.css?raw";
import modelTs from "../model.ts?raw";
import storeTs from "../store.ts?raw";
import viteEnv from "../vite-env.d.ts?raw";

import landing from "../components/Landing.tsx?raw";
import analyzing from "../components/Analyzing.tsx?raw";
import mapScreen from "../components/MapScreen.tsx?raw";
import graphBits from "../components/graphBits.tsx?raw";
import explorer from "../components/Explorer.tsx?raw";
import inspector from "../components/Inspector.tsx?raw";
import commandPalette from "../components/CommandPalette.tsx?raw";
import codeViewer from "../components/CodeViewer.tsx?raw";

import codeData from "./code.ts?raw";
import pulseboard from "./pulseboard.ts?raw";

import engine from "../lib/engine.ts?raw";
import repoAnalyzer from "../lib/repoAnalyzer.ts?raw";
import zipLib from "../lib/zip.ts?raw";
import self from "./sourceFiles.ts?raw";

import engineTest from "../__tests__/engine.test.ts?raw";
import zipTest from "../__tests__/zip.test.ts?raw";
import pulseboardTest from "../__tests__/pulseboard.test.ts?raw";

export const SOURCE_FILES: { path: string; content: string }[] = [
  { path: "atlas/index.html", content: indexHtml },
  { path: "atlas/package.json", content: pkgJson },
  { path: "atlas/tsconfig.json", content: tsconfig },
  { path: "atlas/vite.config.js", content: viteConfig },
  { path: "atlas/README.md", content: readme },
  { path: "atlas/.env.example", content: envExample },
  { path: "atlas/.gitignore", content: gitignore },
  { path: "atlas/src/main.tsx", content: mainTsx },
  { path: "atlas/src/App.tsx", content: appTsx },
  { path: "atlas/src/index.css", content: indexCss },
  { path: "atlas/src/model.ts", content: modelTs },
  { path: "atlas/src/store.ts", content: storeTs },
  { path: "atlas/src/vite-env.d.ts", content: viteEnv },
  { path: "atlas/src/components/Landing.tsx", content: landing },
  { path: "atlas/src/components/Analyzing.tsx", content: analyzing },
  { path: "atlas/src/components/MapScreen.tsx", content: mapScreen },
  { path: "atlas/src/components/graphBits.tsx", content: graphBits },
  { path: "atlas/src/components/Explorer.tsx", content: explorer },
  { path: "atlas/src/components/Inspector.tsx", content: inspector },
  { path: "atlas/src/components/CommandPalette.tsx", content: commandPalette },
  { path: "atlas/src/components/CodeViewer.tsx", content: codeViewer },
  { path: "atlas/src/data/code.ts", content: codeData },
  { path: "atlas/src/data/pulseboard.ts", content: pulseboard },
  { path: "atlas/src/data/sourceFiles.ts", content: self },
  { path: "atlas/src/lib/engine.ts", content: engine },
  { path: "atlas/src/lib/repoAnalyzer.ts", content: repoAnalyzer },
  { path: "atlas/src/lib/zip.ts", content: zipLib },
  { path: "atlas/src/__tests__/engine.test.ts", content: engineTest },
  { path: "atlas/src/__tests__/zip.test.ts", content: zipTest },
  { path: "atlas/src/__tests__/pulseboard.test.ts", content: pulseboardTest },
];