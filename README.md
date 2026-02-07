# SeeReal - Real-time News Transparency & 3D Insights

**Our Inspiration**

In an era of rapid information flow and polarized media, understanding the *context* behind a news story is often harder than reading the story itself. SeeReal was born from the need to provide readers with a **sophisticated, AI-augmented research layer** that lives directly on the page—transforming passive news consumption into active, critical analysis.

---

**What SeeReal Does**

SeeReal is a high-performance Chrome extension that injects a 3D transparency overlay into news articles. It utilizes a multi-layered AI architecture to perform semantic analysis, visualizing metrics through interactive 3D charts and providing professional-grade research tools.

### Key Features & Technical Depth

#### 1. 3D-Visualized Bias Metrics (Three.js Radar)
Explore article nuance through a **3D Radar Chart** implemented with `@react-three/fiber`.
- **Dimensionality**: Maps 6 critical semantic axes including Authoritarian/Libertarian, Nationalist/Globalist, and Sensationalism.
- **Mapping Algorithm**: Normalizes bipolar model outputs (-100 to 100) into radar-ready vertex coordinates in real-time.
- **Aesthetics**: Custom HSL-tailored luminosity scales and glassmorphic design tokens.

#### 2. AI-Powered "Debate Cards" (Evidence Extraction)
A specialized tool for debaters and researchers to extract evidence.
- **NLP Orchestration**: Uses structured prompt engineering to identify specific claims based on user-defined "purposes."
- **Markup Injection**: Dynamically highlights evidence in the article's body text using a regex-based token matching system that preserves original DOM structure.
- **Output**: Generates Policy-style cards with tags and automated citations.

#### 3. Intelligent Author Profiling
Aggregates professional background data using Gemini-powered searches.
- **Entity Resolution**: Identifies authors and fetches bio, occupation, and publication history.
- **Metadata Indexing**: Correlates current article bias with the author's historical output to identify long-term patterns.

#### 4. Google Veo 3.1 Video Synthesis
Generates <15s visual recaps of article insights.
- **Asynchronous Processing**: Implements a REST client for Google's **Veo 3.1** model, handling long-running operation polling with exponential backoff.
- **Data Marshalling**: Processes large video blobs into Base64 for efficient message passing between service workers and the content script.
- **Recursive URI Extraction**: A robust parsing engine that extracts generation URIs from deeply nested API response structures.

#### 5. Persistent Storage & Schema Versioning
- **Architecture**: Built on top of `chrome.storage.local` with a custom `StorageService` layer.
- **Optimization**: Maintains lightweight metadata indexes for O(1) list views while lazy-loading full analysis records.
- **Lifecycle Management**: Automated 30-day TTL (Time To Live) cleanup to minimize storage footprint.

---

## Technical Stack & Infrastructure

- **Languages**: TypeScript (Strict Mode), GLSL (for 3D shaders).
- **Frontend Framework**: **React 18** with **Zustand** for global state and **Framer Motion** for orchestrating complex UI entry/exit states.
- **3D Engine**: **Three.js** with a custom rendering pipeline for the transparency overlay.
- **AI Core**: **Google Gemini 1.5 Flash & 2.0 Pro** with a dynamic model fallback system (ensuring high availability).
- **Build System**: **Webpack 5** with custom loaders for `.env` integration and asset optimization.

---

## Setup & Configuration

### Installation & Build

```bash
npm install
npm run build
```

### Deployment

Load the unpacked extension from the `dist` folder via `chrome://extensions`.

### API Access

Gemini API keys are configured via the extension popup or `.env.local`. The extension handles restricted keys by providing a direct link to Google AI Studio for proper configuration.

---

## Advanced Roadmap (Phase 4+)

- **Cross-Source Differential Analysis**: Quantify the "information gap" between two news outlets covering the same event using cosine similarity on extracted embeddings.
- **Real-time LLM Verification**: Active factual cross-referencing against trusted knowledge bases during the analysis phase.
- **Agentic Research Mode**: Let SeeReal autonomously expand the research graph by fetching related articles and summarizing entire topics into slide decks or briefs.
- **Custom Bias Modeling**: Allow users to define their own metrics and prompt templates for specialized research needs.

---

**Built With**
- React / TypeScript / Zustand
- Three.js / WebGL
- Google Gemini & Veo APIs
- Chrome Extension V3 Architecture
