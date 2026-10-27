# AI WITHOUT FEAR™ — Part 4: Your First AI Systems

*Expanded plain-language draft built on your v0.4 manuscript (lessons L27–L30) and the Production Bible template. Draft v0.3, 2026-10-27. Visual, Today's AI Word, Your Turn, FDE Question and Human in the Loop are carried from v0.4; other sections are new text by Claude. Review for facts and voice. Use only fake or public data in these projects.*

**Part 4 promise:** build four small projects of rising difficulty, each with evidence, testing and a human checkpoint. Save each as a portfolio artifact (no private data).

---

## L27 · Project Zero — The AI Workbench

**Hook.** Professionals do not start from zero every time. They keep a notebook of what worked.

**In plain words.** Build a personal workbench: a place to compare model answers, save prompts, track results and write down what worked.

**Under the hood.** A simple spreadsheet or document with columns: task, prompt, platform, answer, scores (accuracy, usefulness, clarity, speed, cost awareness) and notes.

**Visual.** A digital workbench with panels for ChatGPT, Claude, Gemini and a local model, with a comparison table in the center.

**Today's AI Word — Workbench.** A place where tools, experiments and results are organized for repeated work. *Remember: professionals keep evidence and reusable patterns instead of starting from zero every time.*

**Your Turn.** Run one task through three platforms and create a simple scorecard: accuracy, usefulness, clarity, speed and cost awareness.

**Build It (30–45 min).** Set up the workbench file. Add three tasks and your best prompt for each.

**AI got it wrong.** Ask an AI to grade its own answers. It tends to be generous. You set the standard.

**FDE question.** What does "better" mean for this particular task?

**Human in the loop.** A human decides the acceptance criteria; the AI does not grade itself without oversight.

**Check yourself.** (1) Why keep a workbench? (2) Who sets the scoring rules?

**Portfolio artifact:** your completed workbench with at least three scored comparisons.
**You can now:** compare tools with evidence instead of impressions.
**Words to know:** *Workbench* (an organized place to experiment). *Scorecard* (a simple scoring table). *Acceptance criteria* (what counts as good enough).

---

## L28 · Project One — Business Document Assistant

**Hook.** A pile of PDFs and emails sits unread. You need the key facts and next steps.

**In plain words.** Build a workflow that turns messy documents into a summary, key facts, action items and questions for review.

**Under the hood.** Input document → extract facts → list action items → attach the supporting quote for each fact → human reviews highlighted evidence.

**Visual.** PDFs and emails flow into a document assistant, then into a human review screen with highlighted evidence.

**Today's AI Word — Extraction.** Pulling specific information from unstructured material. *Remember: document extraction is one of the most practical AI business use cases.*

**Your Turn.** Test the same document with two AI platforms. Compare what each extracted correctly and what each missed.

**Build It (45–60 min).** Use a public or fake document. Write a prompt that returns: summary, five key facts with quotes, action items, open questions.

**AI got it wrong.** The assistant lists a deadline that is not in the document. Requiring a supporting quote for every fact exposes this.

**FDE question.** What evidence should accompany each extracted fact? *(A quote and location from the source.)*

**Human in the loop.** A human checks extracted facts before they become an official record or trigger a consequential action.

**Check yourself.** (1) What is extraction? (2) Why require a quote for each fact?

**Portfolio artifact:** your prompt, a fake sample document, and the reviewed output.
**You can now:** build a simple, checkable document workflow.
**Words to know:** *Extraction* (pulling out specific facts). *Unstructured* (not in neat fields). *Evidence* (support for a claim).

---

## L29 · Project Two — Enterprise Knowledge Assistant

**Hook.** New staff ask the same policy questions every week.

**In plain words.** Build a small RAG assistant around a controlled set of documents (use fake or public ones).

**Under the hood.** Collect 5–10 documents → split into chunks → search → answer with citations. Test retrieval first, then the answer.

**Visual.** A glowing library connects to a retrieval engine, then to an AI answer panel showing source citations.

**Today's AI Word — Retrieval.** Finding relevant information from a collection of data. *Remember: retrieval quality often determines answer quality in knowledge assistants.*

**Your Turn.** Create ten questions from a small document set and test retrieval quality before evaluating the generated answer.

**Build It (60–90 min).** Use a tool that supports document-grounded chat. Require "answer only from the documents and cite the source; otherwise say you do not know."

**AI got it wrong.** Ask something the documents do not cover. A good system says it does not know. A weak one makes something up.

**FDE question.** If the answer is wrong, did retrieval fail or generation fail? *(Look at which passages were retrieved.)*

**Human in the loop.** A human verifies sources for high-impact answers and can reject unsupported responses.

**Check yourself.** (1) What do you test first? *(Retrieval.)* (2) What should the assistant do when the documents have no answer?

**Portfolio artifact:** the document set (fake/public), ten test questions and results.
**You can now:** build and test a document-grounded assistant.
**Words to know:** *Retrieval* (finding the right passage). *Citation* (pointing to the source). *Grounded* (based on supplied documents).

---

## L30 · Project Three — Customer Support Copilot

**Hook.** A support queue grows faster than the team.

**In plain words.** Build an assistant that classifies customer messages, retrieves policy information and drafts a response for a person to approve.

**Under the hood.** Message → classify (topic, urgency) → retrieve policy → draft reply → human approves. The copilot helps; the person owns the reply.

**Visual.** Customer messages arrive in a queue; AI classifies and drafts; a support professional approves the response.

**Today's AI Word — Copilot.** An AI assistant designed to help a human perform a task rather than independently own the task. *Remember: a copilot can increase speed while preserving human responsibility.*

**Your Turn.** Prototype the workflow with one general AI platform and one enterprise productivity AI platform, then compare where each fits.

**Build It (90–120 min).** Use fake messages and a fake policy. Mark which message types may be auto-drafted and which always need human review (refunds, complaints, anything sensitive).

**AI got it wrong.** The copilot drafts a reply that promises a refund the policy does not allow. The approval step catches it.

**FDE question.** Which messages can be auto-drafted and which require mandatory human review?

**Human in the loop.** The support professional remains responsible for final customer communication in the designed workflow.

**Check yourself.** (1) What is a copilot? (2) Name one message type that always needs a person.

**Portfolio artifact:** workflow diagram, fake data, ten sample drafts with your review notes.
**You can now:** design a safe draft-and-approve workflow.
**Words to know:** *Copilot* (AI that helps a person). *Queue* (a waiting line of work). *Escalate* (send to a person).

---

## PART 4 CHECKPOINT

Show your portfolio: workbench, document assistant, knowledge assistant and support copilot, each with test results and a human checkpoint, and no private data. **Pass:** another beginner can follow what each project does and why a person stays in charge.

**Explain it to a 10-year-old.** You built four small helpers, each one a little smarter, and each one has a person who checks the work.
