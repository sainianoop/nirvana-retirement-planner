# Nirvana — AI-Powered Retirement Readiness

> Most retirement tools give you a number. Nirvana shows you
> what to do with it — asset by asset, month by month.

## What it does

Nirvana is a retirement readiness tool for American families.
You enter your complete financial picture — assets by account type,
household timeline, healthcare situation — and Nirvana gives you three things:

1. **Asset Outlook** — a sortable table showing every account projected
   to retirement across conservative, moderate, and aggressive scenarios,
   with a one-line action recommendation per asset type and tax treatment categorization

2. **Action Plan** — AI-generated, time-bucketed action items (next 30 days,
   90 days, this year) personalized to your actual numbers and risk profile
   via Claude API. Cached locally so the API is only called when your
   profile changes.

3. **Advisor Brief** — a clean, printable one-page document with your
   household snapshot, portfolio summary, key advisor questions,
   and full action plan. Bring it to your next advisor meeting.

## Features

- 📊 Asset projection table — conservative / moderate / aggressive scenarios
- 🏷️ Tax treatment categorization — Tax-Free, Tax-Deferred, Taxable, Real Estate
- 🤖 Claude-powered action plan — personalized to your numbers, cached for efficiency
- 📄 One-click Advisor Brief — printable and hand-to-advisor ready
- ⚡ Time-bucketed actions — 30 days / 90 days / this year
- 💾 localStorage persistence — profile saved between sessions, no account required
- 📱 Mobile responsive

## Tech stack

React · Vite · Tailwind CSS · Claude API (claude-sonnet-4-20250514)

## Running locally

```bash
npm install
npm run dev
```

Create a `.env.local` file in the project root:

```
VITE_ANTHROPIC_API_KEY=sk-ant-your-key-here
```

## Live demo

[nirvana-retirement.vercel.app](...)

## Background

Nirvana was built out of a recurring frustration seen across personal finance communities like r/fatFIRE and r/ChubbyFIRE — people who are financially ready to retire but paralyzed because they don't know what they're missing or what to ask their advisor. Nirvana optimizes for the one conversation that matters: the one with your financial advisor.

Built as a portfolio project to learn AI-native product development
and vibe coding.

---

*Not financial advice. Always consult a licensed fiduciary advisor.*
