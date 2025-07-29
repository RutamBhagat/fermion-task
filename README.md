# fermion-task

This project was created with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack), a modern TypeScript stack that combines Next.js, Hono, and more.

## Features

- **TypeScript** - For type safety and improved developer experience
- **Next.js** - Full-stack React framework
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **shadcn/ui** - Reusable UI components
- **Hono** - Lightweight, performant server framework
- **Node.js** - Runtime environment
- **Turborepo** - Optimized monorepo build system
- **Biome** - Linting and formatting

## Getting Started

First, install the dependencies:

```bash
npm install
```


Then, run the development server:

```bash
npm run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser to see the web application.
The API is running at [http://localhost:3000](http://localhost:3000).



## Project Structure

```
fermion-task/
├── apps/
│   ├── web/         # Frontend application (Next.js)
│   └── server/      # Backend API (Hono)
```

## Available Scripts

- `npm run dev`: Start all applications in development mode
- `npm run build`: Build all applications
- `npm run dev:web`: Start only the web application
- `npm run dev:server`: Start only the server
- `npm run check-types`: Check TypeScript types across all apps
- `npm run check`: Run Biome formatting and linting
