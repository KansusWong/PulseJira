/**
 * Demo signals — provides mock trending data when no external sources are configured.
 *
 * Used in development or when Supabase / platform API keys are not set.
 */

import crypto from 'crypto';

export interface DemoSignal {
  id: string;
  content: string;
  source_url: string;
  status: 'DRAFT';
  platform: 'reddit' | 'twitter' | 'youtube';
  metadata: {
    screening?: {
      relevant: boolean;
      score: number;
      title: string;
      summary: string;
      reason: string;
    };
    demo: true;
  };
  received_at: string;
}

const DEMO_POOL: Omit<DemoSignal, 'id' | 'received_at'>[] = [
  {
    content: 'I wish there was a tool that could automatically turn my Figma designs into production-ready React components with proper state management. Current tools only do visual conversion but miss all the logic.',
    source_url: 'https://reddit.com/r/reactjs/comments/demo1',
    status: 'DRAFT',
    platform: 'reddit',
    metadata: {
      screening: { relevant: true, score: 82, title: 'Figma to React with Logic', summary: 'Auto-convert Figma designs into React components with state management, not just visual markup', reason: 'High demand for design-to-code with logic preservation, underserved by current tools' },
      demo: true,
    },
  },
  {
    content: 'We spend 40% of our sprint time on code reviews. Would love an AI reviewer that understands our coding standards and can do a first pass, flagging real issues instead of just style nits.',
    source_url: 'https://reddit.com/r/programming/comments/demo2',
    status: 'DRAFT',
    platform: 'reddit',
    metadata: {
      screening: { relevant: true, score: 78, title: 'AI-Powered Code Review Assistant', summary: 'AI code reviewer that learns team coding standards and flags substantive issues in PRs', reason: 'Strong pain point, clear demand, technically feasible with current LLM capabilities' },
      demo: true,
    },
  },
  {
    content: 'Hot take: the next big thing in DevTools is going to be AI agents that can monitor your production app, detect anomalies, and automatically create fix PRs. We need self-healing software.',
    source_url: 'https://twitter.com/devtools_guru/status/demo3',
    status: 'DRAFT',
    platform: 'twitter',
    metadata: {
      screening: { relevant: true, score: 71, title: 'Self-Healing Production Software', summary: 'AI agents that monitor production, detect anomalies, and auto-generate fix PRs', reason: 'Ambitious but trending concept, aligns with autonomous software engineering direction' },
      demo: true,
    },
  },
  {
    content: 'Just published: "Building Multi-Agent Systems for Enterprise" — how we used 12 specialized AI agents to automate our entire SDLC from requirements to deployment. Full architecture breakdown.',
    source_url: 'https://youtube.com/watch?v=demo4',
    status: 'DRAFT',
    platform: 'youtube',
    metadata: {
      screening: { relevant: true, score: 65, title: 'Enterprise Multi-Agent SDLC', summary: 'Architecture for multi-agent system automating the full software development lifecycle', reason: 'Relevant reference architecture, educational value, moderate novelty' },
      demo: true,
    },
  },
  {
    content: 'Is anyone else frustrated by how hard it is to set up proper E2E testing for mobile apps? We need a tool that can understand the app visually and generate test scenarios automatically.',
    source_url: 'https://reddit.com/r/mobiledev/comments/demo5',
    status: 'DRAFT',
    platform: 'reddit',
    metadata: {
      screening: { relevant: true, score: 74, title: 'Visual E2E Test Generator for Mobile', summary: 'Tool that visually understands mobile apps and auto-generates E2E test scenarios', reason: 'Clear pain point in mobile development, visual AI approach is novel and feasible' },
      demo: true,
    },
  },
  {
    content: 'Thread: Why every SaaS company should build an API-first AI integration layer. Your users want to plug AI into their workflows, not switch to a new tool. The opportunity is huge.',
    source_url: 'https://twitter.com/saas_weekly/status/demo6',
    status: 'DRAFT',
    platform: 'twitter',
    metadata: {
      screening: { relevant: true, score: 58, title: 'API-First AI Integration Layer', summary: 'Build AI integration APIs so users can embed AI into existing workflows', reason: 'Valid market insight but more strategic than product-specific' },
      demo: true,
    },
  },
  {
    content: 'We built an internal tool that converts natural language specs into database schemas, migrations, and CRUD APIs. Saves us 2-3 days per feature. Thinking of open-sourcing it.',
    source_url: 'https://reddit.com/r/webdev/comments/demo7',
    status: 'DRAFT',
    platform: 'reddit',
    metadata: {
      screening: { relevant: true, score: 85, title: 'NL-to-Schema API Generator', summary: 'Convert plain-language feature specs into DB schemas, migrations, and CRUD endpoints', reason: 'High practical value, strong time savings, significant open-source potential' },
      demo: true,
    },
  },
  {
    content: 'Deep dive: How Cursor, Windsurf, and Copilot compare in real-world pair programming. We tested all three on the same 10 tasks. Results will surprise you.',
    source_url: 'https://youtube.com/watch?v=demo8',
    status: 'DRAFT',
    platform: 'youtube',
    metadata: {
      screening: { relevant: true, score: 72, title: 'AI Coding Assistants Head-to-Head', summary: 'Benchmark of Cursor vs Windsurf vs Copilot across 10 practical tasks', reason: 'High relevance for understanding competitive landscape in AI-native dev tools' },
      demo: true,
    },
  },
  {
    content: 'Unpopular opinion: The biggest bottleneck in software teams isn\'t coding speed — it\'s requirements clarity. We need AI PMs that can turn vague stakeholder asks into precise specs with acceptance criteria.',
    source_url: 'https://twitter.com/pm_insights/status/demo9',
    status: 'DRAFT',
    platform: 'twitter',
    metadata: {
      screening: { relevant: true, score: 80, title: 'AI Product Manager for Requirements', summary: 'AI-powered PM that converts vague requests into precise specs with acceptance criteria', reason: 'Directly aligned with RebuilD vision, addresses root cause of project failures' },
      demo: true,
    },
  },
  {
    content: 'Just launched: An open-source framework for building AI agent workflows with built-in observability, retry logic, and human-in-the-loop checkpoints. Already 2k stars in 3 days.',
    source_url: 'https://reddit.com/r/machinelearning/comments/demo10',
    status: 'DRAFT',
    platform: 'reddit',
    metadata: {
      screening: { relevant: true, score: 76, title: 'AI Agent Workflow Framework', summary: 'Open-source framework for agent orchestration with observability and human checkpoints', reason: 'Rapidly growing OSS project, relevant to multi-agent architecture patterns' },
      demo: true,
    },
  },
  {
    content: 'Tutorial: Building a real-time collaborative design system with AI-generated components. From Storybook to production in 30 minutes. React + Tailwind + GPT-4.',
    source_url: 'https://youtube.com/watch?v=demo11',
    status: 'DRAFT',
    platform: 'youtube',
    metadata: {
      screening: { relevant: true, score: 68, title: 'AI-Generated Design System', summary: 'Build a collaborative design system with AI-generated React+Tailwind components', reason: 'Practical tutorial, relevant tech stack, demonstrates AI-assisted UI development' },
      demo: true,
    },
  },
  {
    content: 'Our startup pivoted from building yet another project management tool to building an AI layer on top of existing tools. Revenue 5x in 6 months. Here\'s what we learned.',
    source_url: 'https://twitter.com/startup_lessons/status/demo12',
    status: 'DRAFT',
    platform: 'twitter',
    metadata: {
      screening: { relevant: true, score: 69, title: 'AI Layer vs. New Tool: Startup Pivot', summary: 'Startup pivoted from standalone PM tool to AI integration layer, saw 5x revenue growth', reason: 'Strategic insight about product positioning in AI-native project management space' },
      demo: true,
    },
  },
];

/**
 * Generate a batch of demo signals with randomized timestamps.
 * Each call produces unique IDs so they're always "fresh".
 */
export function generateDemoSignals(count: number = 3): DemoSignal[] {
  const shuffled = [...DEMO_POOL].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, Math.min(count, shuffled.length));

  return selected.map((s, i) => ({
    ...s,
    id: `demo-${crypto.randomUUID().slice(0, 8)}`,
    received_at: new Date(Date.now() - i * 60_000).toISOString(),
  }));
}

/**
 * Shared in-memory store for demo signals.
 * Both /api/signals and /api/cron/collect-signals use this module-level array.
 */
export const demoSignalStore: DemoSignal[] = [];

/** Populate the store if it has fewer than `count` signals (mutates in-place). */
export function ensureDemoStore(count: number = 6): void {
  if (demoSignalStore.length < count) {
    const needed = count - demoSignalStore.length;
    const existingContent = new Set(demoSignalStore.map((s) => s.content));
    const candidates = generateDemoSignals(needed + 3)
      .filter((s) => !existingContent.has(s.content));
    demoSignalStore.push(...candidates.slice(0, needed));
  }
}

export function isDemoMode(): boolean {
  const explicit = process.env.ENABLE_DEMO_SIGNALS;
  if (explicit) {
    return explicit === '1' || explicit.toLowerCase() === 'true';
  }

  // Safe default: production never auto-falls back to demo unless explicitly enabled.
  if (process.env.NODE_ENV === 'production') {
    return false;
  }

  const hasPlatformKeys = !!(
    process.env.REDDIT_CLIENT_ID ||
    process.env.TWITTER_BEARER_TOKEN ||
    process.env.YOUTUBE_API_KEY
  );

  return !hasPlatformKeys;
}
