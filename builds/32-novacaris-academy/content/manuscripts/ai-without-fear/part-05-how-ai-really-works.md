# AI WITHOUT FEAR™ — Part 5: How AI Really Works

*Expanded plain-language draft built on your v0.4 manuscript (lessons L31–L35) and the Production Bible template. Draft v0.3, 2026-10-27. Visual, Today's AI Word, Your Turn, FDE Question and Human in the Loop are carried from v0.4; other sections are new text by Claude. Review for facts and voice. Do not quote prices or model names; they change quickly.*

**Part 5 promise:** understand the trade-offs behind real AI systems: which model, how fast, how much, how good, and how you know.

---

## L31 · Models Are Not All the Same

**Hook.** Three providers, same question, three different answers, speeds and bills.

**In plain words.** Models differ in reasoning, speed, image or audio ability, coding, context size, cost and where they can run.

**Under the hood.** Compare on: quality for your task, speed, cost, context size, privacy and deployment options (cloud or local), and support. Test with your own examples, not marketing pages.

**Visual.** A futuristic garage contains several AI engines with labels for speed, reasoning, vision, coding and local deployment.

**Today's AI Word — Model Selection.** Choosing a model based on the requirements of the task. *Remember: the best model is the one that meets the requirements, not necessarily the biggest model.*

**Your Turn.** Run the same task across three providers and create a tradeoff table.

**AI got it wrong.** A model that tops a public leaderboard may do poorly on your specific documents. Test your own task.

**FDE question.** What would make you choose a smaller model? *(Simple task, high volume, tight budget, speed, privacy needs.)*

**Human in the loop.** A human approves model changes for production systems after testing against agreed acceptance criteria.

**Check yourself.** (1) Name three ways models differ. (2) How should you compare them?

**You can now:** compare models on the requirements that matter.
**Words to know:** *Model selection* (choosing a model for the job). *Deployment* (where and how it runs). *Local model* (one that runs on your own machine).

---

## L32 · Inference

**Hook.** The model was trained months ago. What is happening right now when you press enter?

**In plain words.** Inference is using a trained model to produce an output from an input.

**Under the hood.** Training is the long, expensive learning phase done in advance. Inference is the everyday use, and it is what you pay for in each request. Hardware, model size and prompt length affect speed and cost.

**Visual.** A trained AI engine receives a request and produces a response on a live production line.

**Today's AI Word — Inference.** Using a trained model to generate a result. *Remember: training and inference are different activities with different engineering considerations.*

**Your Turn.** Ask two platforms to explain training versus inference using a restaurant kitchen analogy.

**AI got it wrong.** Some people think the AI is "learning" from their chat in real time. Usually it is not. Check the tool's data and memory settings before assuming.

**FDE question.** What affects inference cost and latency in your application? *(Model size, prompt and answer length, number of calls, hardware.)*

**Human in the loop.** A human reviews performance and cost thresholds before changing production model routing.

**Check yourself.** (1) Training versus inference? (2) Which one happens each time you ask a question?

**You can now:** explain what happens when you send a prompt.
**Words to know:** *Training* (learning ahead of time). *Inference* (using what was learned). *Latency* (wait time).

---

## L33 · Latency, Cost & Quality

**Hook.** A customer wants answers instantly, perfectly and nearly free. Pick two.

**In plain words.** AI systems involve trade-offs. A slower, more expensive answer may be unnecessary for a simple job.

**Under the hood.** Three dials: QUALITY, SPEED and COST. Set targets from the customer's real need: a chat reply may need speed; a legal summary may need quality.

**Visual.** Three dials (QUALITY, SPEED and COST) balance around a customer workflow.

**Today's AI Word — Latency.** The time between a request and a response. *Remember: a good AI product optimizes for the customer's real requirement.*

**Your Turn.** Create a fictional customer requirement and choose acceptable latency and cost targets.

**AI got it wrong.** A team picked the highest-quality setting for every call and the bill tripled with no customer benefit.

**FDE question.** Which metric is truly tied to customer value?

**Human in the loop.** A human product owner approves the tradeoff when quality, speed and cost conflict.

**Check yourself.** (1) Name the three dials. (2) How do you choose targets?

**You can now:** balance speed, cost and quality for a real need.
**Words to know:** *Latency* (response delay). *Cost per request* (what each call costs). *Target* (the goal you set).

---

## L34 · Evaluation Sets

**Hook.** One impressive example proves nothing.

**In plain words.** Build a representative set of cases, normal and difficult, so you can measure the system and compare versions.

**Under the hood.** Include four kinds: *normal*, *ambiguous*, *adversarial* (tries to trick it) and *unsupported* (it should say it does not know). Keep the set fixed so you can compare versions fairly.

**Visual.** A testing lab displays 100 representative customer cases, edge cases and failure cases.

**Today's AI Word — Evaluation Set.** A collection of test cases used to measure system performance. *Remember: a repeatable test set lets you compare versions rather than relying on impressions.*

**Your Turn.** Build 25 test cases for Project Three: normal, ambiguous, adversarial and unsupported questions.

**AI got it wrong.** A demo with five clean examples looked perfect. A test set with unusual questions exposed three failures.

**FDE question.** What cases would a demo hide but a production system eventually encounter?

**Human in the loop.** A human domain expert reviews a sample of results and signs off on acceptance criteria.

**Check yourself.** (1) Name the four kinds of test cases. (2) Why keep the set fixed?

**You can now:** build a test set that finds real weaknesses.
**Words to know:** *Evaluation set* (a fixed group of test cases). *Edge case* (an unusual situation). *Adversarial* (designed to trick it).

---

## L35 · Observability

**Hook.** A customer says the AI got slow yesterday. Can you see why?

**In plain words.** Production AI needs visibility into what it is doing: errors, speed, tool calls, retrieval, costs and failures.

**Under the hood.** Collect logs (what happened), metrics (numbers over time) and traces (the path of one request through retrieval, model and tools). Keep private data out of logs.

**Visual.** A mission-control dashboard shows traces from user request through retrieval, model call, tool call and final response.

**Today's AI Word — Observability.** The ability to understand system behavior through logs, metrics and traces. *Remember: you cannot reliably improve a system you cannot inspect.*

**Your Turn.** Design the dashboard you would want after a customer reports that the AI suddenly became slow.

**AI got it wrong.** A system logged full customer messages and exposed private information in its logs. Observability must protect privacy.

**FDE question.** What would you need to see to reproduce the problem?

**Human in the loop.** A human operations owner reviews alerts and can pause or roll back a system when thresholds are exceeded.

**Check yourself.** (1) Name logs, metrics and traces in one line each. (2) What must stay out of logs?

**You can now:** describe what you would monitor in a live AI system.
**Words to know:** *Observability* (being able to see inside). *Trace* (the path of one request). *Rollback* (returning to the previous version).

---

## PART 5 CHECKPOINT

Pick a fictional customer. Choose a model and justify it, set latency and cost targets, write 25 test cases, and sketch the monitoring dashboard. **Pass:** you can defend each choice in plain words.

**Explain it to a 10-year-old.** Different AI engines are good at different jobs. You pick the right one, check it with lots of tests, and watch it while it works.
