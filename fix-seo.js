const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'dist', 'index.html');
if (!fs.existsSync(file)) process.exit(0);
let html = fs.readFileSync(file, 'utf8');
const ogTags = `
  <title>Tessarc — Multi-Model AI Workspace</title>
  <meta name="description" content="One private, local-first AI workspace for Google Gemini, Claude, OpenAI, and DeepSeek. Live web search, vision, and instant file export." />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://tessarc.vercel.app/" />
  <meta property="og:title" content="Tessarc — Multi-Model AI Workspace" />
  <meta property="og:description" content="One private, local-first AI workspace for Gemini, Claude, OpenAI, and DeepSeek. Free tier supported." />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="Tessarc — Multi-Model AI Workspace" />
  <meta name="twitter:description" content="One private, local-first AI workspace for Gemini, Claude, OpenAI, and DeepSeek." />
`;
html = html.replace(/<title>.*?<\/title>/i, '');
html = html.replace(/<meta name="description"[^>]*>/i, '');
html = html.replace('</head>', ogTags + '\n</head>');
html = html.replace(
  /<noscript>[\s\S]*?<\/noscript>/i,
  '<noscript><h1>Tessarc — Multi-Model AI Workspace</h1><p>One private, local-first AI workspace for Google Gemini, Claude, OpenAI, and DeepSeek. Features live web search, image and 70s video vision, and direct file export.</p></noscript>'
);
fs.writeFileSync(file, html);
console.log('SEO & OpenGraph tags injected!');
