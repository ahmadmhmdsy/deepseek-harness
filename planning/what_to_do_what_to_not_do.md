The core principle

The single most repeated lesson across all these sources: you don't need a better model, you need better system design — prompt structure, context management, sandboxing, and a good test harness are what separate a working app builder from a demo. And on safety: never rely on "the model will be careful" as a control, and never use approval prompts as a substitute for least privilege.



What to do

Architecture \& design



Use a planning/orchestrator agent that breaks a prompt into a plan, then worker agents execute — this is how Bolt/Lovable get reliable output, not by throwing a bigger model at it.



Validate and sanitize every tool input from the LLM before it touches files, shell, or APIs — treat all model output as untrusted data.



Use structured outputs with schema validation for tool results (your Zod schemas from the plugin sketch do exactly this).



Design tools defensively — in-tool guardrails that enforce policy (e.g., a preview tool only binds to localhost, a scaffold tool only writes under the project dir).



Permissions \& identity



Apply least privilege per tool: decide which tools an agent may call for each class of task, and evaluate each invocation before it runs.



Scope credentials — the agent should never inherit your full local environment. Give it a non-privileged identity with only the repo and tools it needs.



Separate reads from writes, and use different tool sets for different trust levels (internal vs. user-facing agents).



Build the ToolPolicy permission manifest we discussed — every tool declares what it may touch (files, shell, network, credentials), enforced at the tool-call level, not just in the prompt.



Isolation \& secrets



Run agents in isolated, disposable sandboxes as a non-privileged user, with restricted outbound network access.



Keep secrets outside the agent's filesystem — no SSH keys, cloud master credentials, or production secrets reachable by the agent.



Isolate memory and context between users/sessions — this is the multi-user linchpin.



Observability \& control



Log everything with traceability — every tool call with timestamp + actor, so you can replay what happened (your event-sourced session log does this natively).



Add deterministic pipeline gates — SAST, dependency/SCA scanning, and secrets detection on generated code before deploy.



Put human approval in front of deployments, credential changes, destructive operations, and production systems.



Enforce cost controls — token, cost, retry, and tool-chain limits, so an unbounded loop can't drain your DeepSeek bill (remember the new peak pricing).



Test and evaluate the agent — a test harness and tracing of which tools/strategies it picks, so you can measure quality, not just vibes.



What not to do

Don't give agents wildcard/unrestricted tool access or global permissions.



Don't trust external content (websites, uploaded files, user messages) — it can carry prompt injection; sanitize before it enters agent context.



Don't let agents execute arbitrary code without sandboxing, and never in full-access mode.



Don't store sensitive data in agent memory without encryption/redaction, and never log PII or credentials in plain text.



Don't let agents make high-impact decisions without human oversight, and don't separate decision from execution for irreversible operations.



Don't pass unsanitized data between agents in a multi-agent setup — that's how injection propagates.



Don't permit unlimited recursion, retries, or tool chaining — bound every loop.



Don't connect production tools or deploy before you have a staging path.



Don't let tool output modify the security policy, and don't accept "the model will be careful" as a control.



Don't install agent skills/MCP servers/plugins without inventory, versioning, and review — unsigned dsh plugins are exactly this risk.



Don't skip adversarial testing after any prompt, tool, memory, or model change.



How this maps to your phases

Phase 1 (single-user): the non-negotiables are sandboxing, approvals on, secrets out of the sandbox, and cost limits. Everything else can be light.



Phase 2 (control plane): build the ToolPolicy manifest, per-tool least privilege, input validation, and structured outputs — this is where safety gets baked in so you don't retrofit it.



Phase 3 (multi-user): memory isolation between users, per-user quotas/rate limits, scoped per-project credentials, and the approval gates on deploy.



The through-line: safety is a system property, not a model property. Design the tool layer defensively and you can scale to real users; design it trusting the model and you'll hit a security incident the moment someone else uses it.
