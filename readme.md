<div align="center">

# Cross-Functional Review Board (CFRB)

### AI-Powered Multi-Agent Enterprise Decision Governance

Review business proposals like a real enterprise before they become expensive mistakes.

Built with **NitroStack**, **Model Context Protocol (MCP)**, **Google Gemini**, **React**, **Node.js**, and **TypeScript**.

---

![React](https://img.shields.io/badge/Frontend-React-61DAFB)
![TypeScript](https://img.shields.io/badge/Backend-TypeScript-blue)
![NitroStack](https://img.shields.io/badge/MCP-NitroStack-purple)
![Gemini](https://img.shields.io/badge/LLM-Google%20Gemini-orange)
![Status](https://img.shields.io/badge/Status-Hackathon%20Project-success)

</div>

---

# Overview

Large organisations rarely approve important proposals after a single review.

Instead, Product, Engineering, Security, Legal, Compliance, Finance, and Operations independently analyse the proposal before leadership makes a decision.

Today this process often takes days.

**Cross-Functional Review Board (CFRB)** recreates this entire workflow using specialized AI agents.

Instead of asking one LLM for an opinion, CFRB launches multiple domain-specific agents simultaneously. Each agent reviews the proposal from its own perspective, debates disagreements with other agents, and sends its findings to a Moderator agent that produces a final enterprise-ready decision.

The result is an explainable, auditable, and structured review process rather than a simple chatbot response.

---

# Problem Statement

Businesses often face questions such as:

- Should we launch this feature?
- Is this legally compliant?
- Are there security risks?
- How expensive will implementation be?
- Does engineering agree with product?
- Are there hidden operational concerns?

Traditional reviews involve multiple meetings across departments.

CFRB automates this process.

---

# Solution

A proposal is submitted into the system.

Multiple AI agents independently analyse it.

Each agent applies its own policies, company knowledge, prompts, and evaluation framework.

Agents challenge one another through a structured debate protocol before a Moderator produces the final recommendation.

This mirrors how enterprise governance actually works.

---

# Features

- Multi-Agent AI architecture
- Independent Product review
- Engineering feasibility analysis
- Security risk assessment
- Legal & compliance evaluation
- Structured inter-agent debate
- Moderator synthesis
- Explainable reasoning
- Standardized output schema
- MCP-compatible architecture
- React dashboard
- NitroStack backend
- Google Gemini integration
- Enterprise policy knowledge base
- Sample proposals and test scenarios

---

# AI Agent Architecture

```
                    Business Proposal
                            │
                            ▼
        ┌─────────────────────────────────────┐
        │     Workflow Orchestrator (MCP)     │
        └─────────────────────────────────────┘
               │        │        │        │
               ▼        ▼        ▼        ▼

        Product   Engineering Security  Legal
          Agent       Agent      Agent    Agent

               │        │        │        │
               └────────┴────────┴────────┘
                           │
                   Debate Protocol
                           │
                           ▼
                  Moderator Agent
                           │
                           ▼
             Enterprise Review Report
```

---

# Review Workflow

1. User submits a business proposal.

2. Workflow module distributes the proposal to every department.

3. Product Agent evaluates business value.

4. Engineering Agent estimates implementation effort.

5. Security Agent detects security vulnerabilities.

6. Legal Agent reviews compliance and policy issues.

7. Agents debate conflicting viewpoints.

8. Moderator analyses all responses.

9. Final enterprise report is generated.

---

# Repository Structure

```
cross-functional-review-board/

├── frontend/
│   ├── React + Vite UI
│
├── server/
│   ├── MCP Server
│   ├── Workflow Module
│   ├── Product Agent
│   ├── Engineering Agent
│   ├── Security Agent
│   ├── Legal Agent
│   ├── Debate Module
│   └── Moderator Module
│
├── docs/
│   Sample proposals
│   Company policies
│   Documentation
│
├── prompts/
│   Agent prompts
│
├── knowledge/
│   Department knowledge bases
│
├── workflow/
│   Debate protocol
│
├── deployment/
│   Deployment notes
│
└── schema.md
```

---

# Tech Stack

## Frontend

- React
- Vite
- JavaScript

## Backend

- Node.js
- TypeScript
- Express
- NitroStack

## AI

- Google Gemini
- Model Context Protocol (MCP)

## Validation

- Zod

---

# Project Modules

## Product Agent

Evaluates

- Business impact
- Product value
- Opportunity cost
- Feature prioritization

---

## Engineering Agent

Evaluates

- Technical feasibility
- Development effort
- Complexity
- Architecture concerns

---

## Security Agent

Evaluates

- Authentication
- Privacy
- Vulnerabilities
- Data protection
- Enterprise security policies

---

## Legal Agent

Evaluates

- Regulatory compliance
- Legal obligations
- Policy conflicts
- Risk exposure

---

## Debate Module

Instead of accepting the first answer, agents review each other's findings.

Conflicts are resolved before reaching the moderator.

This improves decision quality and reduces hallucinations.

---

## Moderator Agent

Combines:

- all agent reports
- disagreements
- risks
- recommendations

into one final enterprise decision.

Possible outcomes include:

- Approved
- Approved with Conditions
- Blocked

---

# Output Schema

The project uses a canonical schema (`schema.md`) to guarantee consistent communication between agents.

Each review includes:

- Verdict
- Confidence
- Findings
- Risks
- Required actions
- Supporting evidence
- Moderator decision

This makes responses machine-readable and easy to integrate into enterprise systems.

---

# Sample Review Flow

Business Proposal

↓

Product Review

↓

Engineering Review

↓

Security Review

↓

Legal Review

↓

Inter-Agent Debate

↓

Moderator Decision

↓

Enterprise Report

---

# Installation

Clone the repository

```bash
git clone https://github.com/vaishnavi-tallada/cross-functional-review-board.git
```

Backend

```bash
cd server
npm install
npm run dev
```

Frontend

```bash
cd frontend
npm install
npm run dev
```

---

# Future Improvements

- Finance Agent
- Operations Agent
- Compliance Agent
- HR Agent
- Risk Scoring Dashboard
- Slack Integration
- Jira Integration
- Email Notifications
- Approval Workflow
- Real Enterprise Policy Import
- Persistent Review History
- Multi-Organization Support

---

# Why CFRB?

Unlike traditional AI assistants that generate a single response, CFRB simulates an actual enterprise review board.

Multiple specialized agents analyse the proposal independently, challenge one another through structured debate, and produce an explainable, auditable decision that resembles real cross-functional governance.

---

# Contributors

4Forces Team

- Vaishnavi Tallada
- (Add remaining team members)

---

# License

This project was developed as part of a Hackathon.
<div align="center">

# Cross-Functional Review Board (CFRB)

### AI-Powered Multi-Agent Enterprise Decision Governance

Review business proposals like a real enterprise before they become expensive mistakes.

Built with **NitroStack**, **Model Context Protocol (MCP)**, **Google Gemini**, **React**, **Node.js**, and **TypeScript**.

---

![React](https://img.shields.io/badge/Frontend-React-61DAFB)
![TypeScript](https://img.shields.io/badge/Backend-TypeScript-blue)
![NitroStack](https://img.shields.io/badge/MCP-NitroStack-purple)
![Gemini](https://img.shields.io/badge/LLM-Google%20Gemini-orange)
![Status](https://img.shields.io/badge/Status-Hackathon%20Project-success)

</div>

---

# Overview

Large organisations rarely approve important proposals after a single review.

Instead, Product, Engineering, Security, Legal, Compliance, Finance, and Operations independently analyse the proposal before leadership makes a decision.

Today this process often takes days.

**Cross-Functional Review Board (CFRB)** recreates this entire workflow using specialized AI agents.

Instead of asking one LLM for an opinion, CFRB launches multiple domain-specific agents simultaneously. Each agent reviews the proposal from its own perspective, debates disagreements with other agents, and sends its findings to a Moderator agent that produces a final enterprise-ready decision.

The result is an explainable, auditable, and structured review process rather than a simple chatbot response.

---

# Problem Statement

Businesses often face questions such as:

- Should we launch this feature?
- Is this legally compliant?
- Are there security risks?
- How expensive will implementation be?
- Does engineering agree with product?
- Are there hidden operational concerns?

Traditional reviews involve multiple meetings across departments.

CFRB automates this process.

---

# Solution

A proposal is submitted into the system.

Multiple AI agents independently analyse it.

Each agent applies its own policies, company knowledge, prompts, and evaluation framework.

Agents challenge one another through a structured debate protocol before a Moderator produces the final recommendation.

This mirrors how enterprise governance actually works.

---

# Features

- Multi-Agent AI architecture
- Independent Product review
- Engineering feasibility analysis
- Security risk assessment
- Legal & compliance evaluation
- Structured inter-agent debate
- Moderator synthesis
- Explainable reasoning
- Standardized output schema
- MCP-compatible architecture
- React dashboard
- NitroStack backend
- Google Gemini integration
- Enterprise policy knowledge base
- Sample proposals and test scenarios

---

# AI Agent Architecture

```
                    Business Proposal
                            │
                            ▼
        ┌─────────────────────────────────────┐
        │     Workflow Orchestrator (MCP)     │
        └─────────────────────────────────────┘
               │        │        │        │
               ▼        ▼        ▼        ▼

        Product   Engineering Security  Legal
          Agent       Agent      Agent    Agent

               │        │        │        │
               └────────┴────────┴────────┘
                           │
                   Debate Protocol
                           │
                           ▼
                  Moderator Agent
                           │
                           ▼
             Enterprise Review Report
```

---

# Review Workflow

1. User submits a business proposal.

2. Workflow module distributes the proposal to every department.

3. Product Agent evaluates business value.

4. Engineering Agent estimates implementation effort.

5. Security Agent detects security vulnerabilities.

6. Legal Agent reviews compliance and policy issues.

7. Agents debate conflicting viewpoints.

8. Moderator analyses all responses.

9. Final enterprise report is generated.

---

# Repository Structure

```
cross-functional-review-board/

├── frontend/
│   ├── React + Vite UI
│
├── server/
│   ├── MCP Server
│   ├── Workflow Module
│   ├── Product Agent
│   ├── Engineering Agent
│   ├── Security Agent
│   ├── Legal Agent
│   ├── Debate Module
│   └── Moderator Module
│
├── docs/
│   Sample proposals
│   Company policies
│   Documentation
│
├── prompts/
│   Agent prompts
│
├── knowledge/
│   Department knowledge bases
│
├── workflow/
│   Debate protocol
│
├── deployment/
│   Deployment notes
│
└── schema.md
```

---

# Tech Stack

## Frontend

- React
- Vite
- JavaScript

## Backend

- Node.js
- TypeScript
- Express
- NitroStack

## AI

- Google Gemini
- Groq
- Model Context Protocol (MCP)

## Validation

- Zod

---

# Project Modules

## Product Agent

Evaluates

- Business impact
- Product value
- Opportunity cost
- Feature prioritization

---

## Engineering Agent

Evaluates

- Technical feasibility
- Development effort
- Complexity
- Architecture concerns

---

## Security Agent

Evaluates

- Authentication
- Privacy
- Vulnerabilities
- Data protection
- Enterprise security policies

---

## Legal Agent

Evaluates

- Regulatory compliance
- Legal obligations
- Policy conflicts
- Risk exposure

---

## Debate Module

Instead of accepting the first answer, agents review each other's findings.

Conflicts are resolved before reaching the moderator.

This improves decision quality and reduces hallucinations.

---

## Moderator Agent

Combines:

- all agent reports
- disagreements
- risks
- recommendations

into one final enterprise decision.

Possible outcomes include:

- Approved
- Approved with Conditions
- Blocked

---

# Output Schema

The project uses a canonical schema (`schema.md`) to guarantee consistent communication between agents.

Each review includes:

- Verdict
- Confidence
- Findings
- Risks
- Required actions
- Supporting evidence
- Moderator decision

This makes responses machine-readable and easy to integrate into enterprise systems.

---

# Sample Review Flow

Business Proposal

↓

Product Review

↓

Engineering Review

↓

Security Review

↓

Legal Review

↓

Inter-Agent Debate

↓

Moderator Decision

↓

Enterprise Report

---

# Installation

Clone the repository

```bash
git clone https://github.com/vaishnavi-tallada/cross-functional-review-board.git
```

Backend

```bash
cd server
npm install
npm run dev
```

Frontend

```bash
cd frontend
npm install
npm run dev
```

---

# Future Improvements

- Finance Agent
- Operations Agent
- Compliance Agent
- HR Agent
- Risk Scoring Dashboard
- Slack Integration
- Jira Integration
- Email Notifications
- Approval Workflow
- Real Enterprise Policy Import
- Persistent Review History
- Multi-Organization Support

---

# Why CFRB?

Unlike traditional AI assistants that generate a single response, CFRB simulates an actual enterprise review board.

Multiple specialized agents analyse the proposal independently, challenge one another through structured debate, and produce an explainable, auditable decision that resembles real cross-functional governance.

---

# Contributors

4Forces Team

- Manesh Vuyyala
- Vaishnavi Tallada
- Himabindu Masabathula
- T Saumiya

---

# License

This project was developed as part of a Hackathon.
