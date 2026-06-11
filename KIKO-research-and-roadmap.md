# Making Kiko the ultimate personal assistant — research + roadmap 🦊❄️

Deep research on best-in-class agentic personal AI assistants (2023–2026), verified across multiple sources, then mapped onto Kiko's actual architecture as a concrete, prioritized build plan.

---

## Part A — What the research says (the seven pillars)

### 1. Agent architecture & reliable tool orchestration
The biggest reliability failures in modern agents come from **orchestration** (wrong order, bad dependencies, half-finished multi-step jobs), not individual tool calls. Two patterns dominate:
- **ReAct** (Thought → Action → Observation, looping) is flexible but can get *stuck repeating a failed action*.
- **Plan-and-Execute** front-loads a plan, then executes, and — critically — **re-plans when reality deviates from the plan**. This recovers from failures far more gracefully and is cheaper for long tasks.
- **Self-healing orchestrators** treat reliability as a runtime control problem: detect a failure signal, classify it, pick a targeted recovery action — instead of failing silently.

Takeaway for a personal hub: for anything multi-step, *plan → execute → verify → re-plan on failure*, and **never report success for an action that didn't actually happen**.
Sources: [ReAct vs Plan-and-Execute (byaiteam)](https://byaiteam.com/blog/2025/12/09/ai-agent-planning-react-vs-plan-and-execute-for-reliability/), [The 4 single-agent patterns](https://theaiengineer.substack.com/p/the-4-single-agent-patterns), [Self-Healing Agentic Orchestrators](https://arxiv.org/html/2606.01416v1), [Secure Plan-then-Execute](https://arxiv.org/pdf/2509.08646), [LLM Agents enterprise guide](https://aisera.com/blog/llm-agents/)

### 2. Memory systems
The field has converged on **tiered, typed memory**, borrowed from how operating systems and humans work:
- **MemGPT**: an OS "virtual memory" analogy — a small *main context* (system prompt + recent messages + currently-relevant records) backed by a large external store the agent pages in/out.
- **Generative Agents** (Park et al.): a chronological **memory stream** with retrieval scored by **recency × importance × relevance**, plus periodic **reflection** that distills raw events into higher-level insights.
- Modern stacks (Mem0, Zep, A-Mem, MIRIX) separate memory into types: **episodic** ("what happened in this case"), **semantic** ("what tends to hold across cases"), **procedural** ("how to do X"), plus core/profile facts.
- **Reflection must be grounded**: each distilled insight should cite the specific episodes it came from, or the agent invents baseless generalizations.
Sources: [Memory mechanisms in LLM agents](https://www.emergentmind.com/topics/memory-mechanisms-in-llm-based-agents), [Memory for Autonomous LLM Agents (survey)](https://arxiv.org/html/2603.07670v1), [Memory OS of AI Agent](https://arxiv.org/pdf/2506.06326), [7 Steps to Mastering Memory](https://machinelearningmastery.com/7-steps-to-mastering-memory-in-agentic-ai-systems/)

### 3. Personalized learning *without* retraining the model
You can't fine-tune a model per user — it's the wrong tool. The state of the art personalizes through **context, not weights**:
- **In-context learning + retrieval-augmented generation + persistent user memory** injected into the system prompt each session.
- **Session-level reflection**: after interactions, the agent analyzes what happened, extracts durable *preferences* ("she likes gentle framing", "collabs default to 4pm"), and **persists them** so the user never has to repeat themselves.
- **Corrections are gold**: when a user corrects the agent, that's a labeled training signal — it means the agent retrieved the wrong memory, had none, or ignored the right one. Capture it.
- **Preference-aware updating** with *change detection* (so evolving preferences overwrite stale ones instead of piling up duplicates), blending short-term and long-term signals.
Sources: [PersonalLLM (ICLR 2025)](https://proceedings.iclr.cc/paper_files/paper/2025/file/a730abbcd6cf4a371ca9545db5922442-Paper-Conference.pdf), [MultiSessionCollab](https://arxiv.org/pdf/2601.02702), [Preference-Aware Memory Update](https://arxiv.org/pdf/2510.09720), [Hindsight is 20/20](https://arxiv.org/html/2512.12818v1)

### 4. Reflection & self-improvement (Reflexion)
**Reflexion** turns outcome feedback into *verbal lessons*: after an attempt, the agent writes a short self-assessment of what went wrong and how to do better, stores it in episodic memory, and **prepends those lessons next time**. A growing plain-language "lessons learned" log biases future behavior toward success — no weight updates required.
Sources: [Reflexion (original)](https://ar5iv.labs.arxiv.org/html/2303.11366), [Reflection in AI agents (HuggingFace)](https://huggingface.co/blog/Kseniase/reflection)

### 5. Proactivity & anticipation
The hard part isn't *what* to suggest, it's *when* — the **"Goldilocks time window."** Interrupt wrong and you erode trust. Best practices:
- **Scheduled "noticing" passes** (cron-style) that run on their own — a morning briefing, an evening review — are the safest proactivity, because the user opts into the cadence.
- Proactivity **requires persistent memory**: you can't notice something is unusual without a baseline to compare against. Anomaly/pattern detection over the user's own history is the engine.
- **Let the user set the autonomy/interruption threshold.** Mixed-initiative research consistently finds users want *collaborative* proactivity, not an agent that barges in — surface one relevant, well-timed thing, not ten.
Sources: [ProActLLM](https://proactllm.github.io/), [Designing Proactive AI Assistants (CHI 2025)](https://arxiv.org/pdf/2410.04596), [When Should an AI Act?](https://arxiv.org/pdf/2602.22814), [How Users Perceive Mixed-Initiative AI](https://arxiv.org/html/2602.01481v1), [Proactive AI agent guide](https://www.emilingemarkarlsson.com/blog/proactive-ai-agents-guide-2025/)

### 6. Trust, safety & human-in-the-loop for side-effectful actions
- **Gate writes, auto-run reads.** The standard pattern: read/lookup/logging executes automatically; anything that **creates, deletes, sends, or changes external state** passes through a confirmation step.
- **HITL is necessary but not sufficient** — humans rubber-stamp. So *also* enforce guardrails in-system: validate before executing, bound what the agent can touch, and make destructive actions reversible (you already have undo).
- **Verify outputs before acting** ("guardrail-first"): check generated values against the real data store before they take effect.
Sources: [HITL best practices (Permit.io)](https://www.permit.io/blog/human-in-the-loop-for-ai-agents-best-practices-frameworks-use-cases-and-demo), [Why HITL isn't enough](https://www.indykite.ai/blogs/why-human-in-the-loop-isnt-enough-for-securing-ai-agents), [HITL in MCP](https://bytebridge.medium.com/human-in-the-loop-in-mcp-safeguarding-autonomous-ai-with-oversight-and-policy-e8f7dbe98aee), [Agentic AI pitfalls](https://medium.com/@amitkharche/agentic-ai-pitfalls-loops-hallucinations-ethical-failures-fixes-77bd97805f9f)

### 7. Grounding & evaluation
- **Grounding:** answer only from the retrieved data; if a value isn't there, say so rather than confabulate. (You've already moved this direction with the full data snapshot.)
- **Evaluation:** the emerging standard is **LLM-as-judge** — a separate model scores the assistant on *task success, personalization, and coherence*. PersonaLens shows judge ratings align well with human ratings, so you can build a small self-test suite to catch regressions.
Sources: [PersonaLens (ACL 2025)](https://aclanthology.org/2025.findings-acl.927/), [Benchmarking LLM robustness for personalized generation](https://arxiv.org/pdf/2509.19358), [MAPLE sub-agent memory/personalization](https://arxiv.org/pdf/2602.13258)

---

## Part B — How this maps onto Kiko (what Kiko already has vs. the gaps)

**Kiko already does well:** strict `{reply, actions}` agent loop with a ~40-action catalog mirrored in `execAgentAction`; a now-comprehensive live data snapshot (`kikoDataSummary`); manual long-term facts (`kikoMemory` via "remember that…"); rolling conversation history; adaptive fast/smart model routing; web search; voice in/out; a pet + full-tab surface; morning briefing + evening nudge; cron-driven email/push reminders + Sunday digest; undo on everything.

**The gaps the research highlights:**
| Pillar | Gap in Kiko today |
|---|---|
| Memory/learning | Facts are **only** captured when Mifu explicitly says "remember." Kiko never *learns* preferences on its own, and has no episodic log of what it's done. |
| Reflection/reliability | The agent runs actions once; failed actions silently produce no ✓ (no re-plan, no honest "that didn't work"). No verify step before irreversible actions. |
| Proactivity | Briefings are templated, not *insight-driven* — Kiko doesn't yet notice anomalies/correlations ("hydration down + nausea up", "meds missed 3 days", "weight plateau", "no journal in a week") and surface them. |
| Autonomy policy | No explicit tiers — what Kiko may do silently vs. must confirm isn't user-configurable. |
| Evaluation | No way to measure whether Kiko's answers are actually good/personalized over time. |

---

## Part C — The upgrade roadmap (tranches)

### Tranche 1 — Memory & learning core (highest leverage)
1. **Auto-learned preferences via session reflection.** A new Edge mode `reflect`: given recent conversation + current memory, it extracts durable preferences/corrections and returns `add/update/remove` memory ops (with change-detection so it updates rather than duplicates). Run it when Mifu clears a chat, nightly via cron, and after long conversations. *(Reflexion + preference-aware memory.)*
2. **A living "About Mifu" user model.** One maintained profile (rhythms, what helps her, sensitivities, defaults like "streams at 3pm", "gentle framing") that reflection keeps current and that's fed into every prompt. *(Persistent user memory in system prompt.)*
3. **Episodic action log.** Persist the last N things Kiko did (with date + outcome) and surface recent ones in context, so "undo what we changed yesterday" and "what did you log for me this week" work. *(Episodic memory.)*
4. **Grounding hardening.** Prompt + self-check so Kiko flags uncertainty and never fabricates a number not in the snapshot.

### Tranche 2 — Reliability (make every action trustworthy)
5. **Verify-before-irreversible.** Before delete/external/destructive actions, Kiko re-checks the target against real data and only proceeds if it matches; otherwise asks.
6. **Failure-aware re-planning + honest reporting.** Collect action failures, attempt one targeted repair, and tell Mifu plainly when something didn't happen (no fake ✓). *(Self-healing orchestrators.)*
7. **Plan-execute for compound requests.** For big asks ("plan my whole week", "set up everything for the collab"), Kiko drafts a short plan, executes step-by-step, and re-plans on deviation.

### Tranche 3 — Proactivity engine (the "ultimate assistant" feel)
8. **Nightly "noticing" pass.** A cron job that scans her data for anomalies & correlations (missed-meds streak, hydration↓ vs nausea↑, energy trend down, weight plateau, dose-day tomorrow, sponsor/tax deadline, no journal in N days, habit slipping) and stores **one** gentle, well-timed insight for the next briefing or a soft push. *(Anomaly detection + Goldilocks timing.)*
9. **Insight-driven briefings.** The morning greeting leads with the single most relevant noticed insight instead of a template.
10. **User-set proactivity dial.** A setting: *Quiet* (only when asked) / *Gentle* (a nudge or two a day — default) / *Active* (notices more, still never spammy).

### Tranche 4 — Depth of control
11. **Action-catalog audit → 100% coverage.** Verify every data operation in the OS has a matching agent action; add any missing (e.g. set body-comp targets, edit a logged shot, manage schedule weeks, toggle any setting), so "control everything" is literally true.
12. **Compound/batch commands** in one turn ("log my shot, mark meds done, and remind me to weigh in tomorrow").

### Tranche 5 — Evaluation (keep it the best over time)
13. **LLM-as-judge self-test.** A small fixed suite of representative questions + a judge pass scoring task-success/personalization/grounding, so regressions are caught when the prompt or model changes. *(PersonaLens.)*

---

## The one decision that gates the build: **how autonomous should Kiko be?**
The research is unanimous that *trust* is the scarce resource, and that the same feature delights or alarms depending on autonomy level. This is a values/safety call only Mifu (via you) can make — so it's the first thing to pin down. Three coherent settings:

- **Propose-first (safest):** Kiko notices and *suggests*, but every change waits for a tap. Nothing happens behind her back.
- **Act-then-tell (balanced):** Kiko silently does *safe* things (logging, reminders, surfacing insights) and reports them; anything destructive/external still asks.
- **Trusted-buddy (most autonomous):** Kiko acts on most things proactively within bounds; only truly irreversible/external actions (sending email, deleting data) confirm.

Across all three, the non-negotiable guardrails stay: destructive/external actions confirm, everything's undoable, and Kiko never invents data.
