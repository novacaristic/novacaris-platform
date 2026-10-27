# AI WITHOUT FEAR™ — Part 2: Speak AI

*Expanded plain-language draft built on your v0.4 manuscript (lessons L11–L20) and the Production Bible template. Draft v0.3, 2026-10-27. Visual, Today's AI Word, Your Turn, FDE Question and Human in the Loop are carried from v0.4; other sections are new text by Claude. Review for facts and voice.*

**Part 2 promise:** learn ten words that unlock most AI conversations: model, token, API, embedding, vector, RAG, agent, tool calling, evaluation, guardrail.

---

## L11 · Model

**Hook.** A friend says "use the best model." Best for what?

**In plain words.** A model is the engine that turns inputs into outputs. Different models differ in strengths, cost, speed and limits.

**Under the hood.** A model is a trained system for a class of tasks. Some are tuned for speed, some for reasoning, some handle images or audio. Picking one is a trade-off, not a popularity contest.

**Visual.** A row of different futuristic engines labeled FAST, REASONING, VISION and LANGUAGE; the learner chooses the engine based on the job.

**Today's AI Word — Model.** A trained AI system that can perform a particular class of tasks. *Remember: choose the model for the job; do not choose a model just because it is famous.*

**Your Turn.** Describe a task and ask an AI to recommend what model characteristics matter: speed, reasoning, vision, cost or context.

**AI got it wrong.** Use a very small, fast model for a task needing careful reasoning. The answer may be shallow. Match the engine to the job.

**FDE question.** If a customer needs a simple classification task at massive scale, would you automatically choose the largest model? Explain your tradeoff. *(Likely not: cost and speed matter; test a smaller model.)*

**Human in the loop.** Before a model output is used for a consequential decision, define who reviews it, what evidence is required and how an incorrect result is reversed.

**Check yourself.** (1) What is a model? (2) Name two things that differ between models.

**You can now:** explain why model choice depends on the task.
**Words to know:** *Model* (trained engine). *Trade-off* (gaining one thing by giving up another). *Reasoning* (working through steps to an answer).

---

## L12 · Token

**Hook.** A usage page says "12,400 tokens." What are those?

**In plain words.** AI language systems process text in pieces called tokens. Tokens affect how much fits in context, how fast the answer comes and how much it costs.

**Under the hood.** A token is often a word or part of a word. In English, a token averages roughly three-quarters of a word, but this varies by language and model. Longer prompts and longer answers use more tokens.

**Visual.** A sentence passing through a machine that breaks it into colorful puzzle pieces before processing.

**Today's AI Word — Token.** A piece of text processed by a language model. *Remember: tokens are part of the model's working material; more text can mean more processing.*

**Your Turn.** Take a paragraph and ask an AI to estimate what happens when you make the prompt ten times longer.

**AI got it wrong.** Ask an AI to count the letters in a long word or the exact words in a paragraph. It may miscount, because it works in tokens, not letters.

**FDE question.** Your customer says their AI application is suddenly expensive. What would you investigate before changing the model? *(Prompt length, how much context is attached, number of calls, answer length.)*

**Human in the loop.** Have a person review cost-sensitive changes before they are pushed into production; document the expected impact.

**Check yourself.** (1) What is a token? (2) Name two things tokens influence. *(Cost, speed, how much fits.)*

**You can now:** explain why long prompts cost more and run slower.
**Words to know:** *Token* (piece of text). *Usage* (how much you used). *Limit* (the most allowed).

---

## L13 · API

**Hook.** The chat window is one door. How does an app on your phone use AI without opening that window?

**In plain words.** An API lets one piece of software talk to another in a structured way. It turns AI from a chat window into a part inside a real application.

**Under the hood.** A request goes to a service with a secret key; the service sends back a response in a standard format. The key proves who is asking, so it must be kept secret.

**Visual.** A secure service window where one system hands a request to another and receives a standardized response.

**Today's AI Word — API.** A defined way for software systems to communicate. *Remember: APIs turn AI from a chat window into a component inside a real application.*

**Your Turn.** Ask an AI to explain a simple weather API request and response without writing code.

**AI got it wrong.** AI-suggested code may paste a secret key straight into a file that gets published. Keys belong in protected settings (see the Vibe Coding manual).

**FDE question.** What authentication, rate limits, error handling and data restrictions would you need before connecting a customer system to an AI API?

**Human in the loop.** A human owner approves which data may leave the customer's environment and which external services are permitted.

**Check yourself.** (1) What does an API do? (2) Why keep API keys secret?

**You can now:** describe how software asks an AI service for help.
**Words to know:** *API* (software-to-software connection). *Request/response* (ask and answer). *Key* (a secret that proves who you are).

---

## L14 · Embedding

**Hook.** You search "how do I reset my login" and find an article titled "Password recovery." No shared words, same meaning.

**In plain words.** An embedding turns information into numbers so a system can compare meaning or similarity.

**Under the hood.** A special model converts text into a list of numbers. Similar meanings end up with similar numbers. This powers semantic search, the engine under many knowledge assistants.

**Visual.** Thousands of documents become points on a glowing map; related ideas cluster together.

**Today's AI Word — Embedding.** A numerical representation of information used to compare similarity. *Remember: embeddings are commonly used for semantic search and retrieval.*

**Your Turn.** Ask an AI to explain the difference between keyword search and semantic search using a library example.

**AI got it wrong.** Similar is not the same as correct. A search for "bank loan" might surface a river bank article if the system is not tuned.

**FDE question.** If the search system retrieves irrelevant documents, what would you test: the data, chunking, embedding model, query or ranking?

**Human in the loop.** A human reviews representative retrieval results before the system is trusted in a high-impact workflow.

**Check yourself.** (1) What is an embedding for? (2) Keyword versus semantic search?

**You can now:** explain meaning-based search in plain words.
**Words to know:** *Embedding* (meaning as numbers). *Semantic* (about meaning). *Chunk* (a small piece of a document).

---

## L15 · Vector

**Hook.** Picture every document as a star in a night sky. Related ones sit close together.

**In plain words.** A vector is a list of numbers. In AI, vectors represent information so software can calculate how close two things are.

**Under the hood.** Two vectors can be compared with simple math. The closer they are, the more similar the meaning. A vector database stores many of these for fast lookup.

**Visual.** Each document becomes a point in a 3D constellation; related documents glow near each other.

**Today's AI Word — Vector.** A numerical list used to represent information or properties. *Remember: vectors are the basic mathematical representation behind many similarity-search systems.*

**Your Turn.** Draw three imaginary points for three documents and explain which two you think should be closest.

**AI got it wrong.** Two documents can be mathematically close and still not answer the question. Math closeness is a clue, not a verdict.

**FDE question.** How would you explain vector search to a nontechnical customer without saying "vector database" five times?

**Human in the loop.** A human checks whether the retrieved results are actually relevant to the business question, not merely mathematically similar.

**Check yourself.** (1) What is a vector? (2) Why isn't "close" always "correct"?

**You can now:** picture how a system finds "nearby" meaning.
**Words to know:** *Vector* (list of numbers). *Similarity* (how alike two things are). *Vector database* (storage built for this lookup).

---

## L16 · RAG

**Hook.** Your assistant must answer from this month's policy, which the model never saw in training.

**In plain words.** RAG means **Retrieval-Augmented Generation.** Instead of relying only on what the model learned, the application finds relevant information and hands it to the model.

**Under the hood.** Question → search your documents → pick the best passages → give them to the model with the question → answer with sources.

**Visual.** A researcher runs into a library, finds three current documents, brings them back to the AI and the AI answers using those documents.

**Today's AI Word — RAG.** A pattern where an AI application retrieves relevant information and gives it to a model to help generate an answer. *Remember: RAG can connect an AI application to changing or private information without pretending the model already knows it.*

**Your Turn.** Create a tiny FAQ file and ask an AI to answer questions using only the supplied information.

**AI got it wrong.** If retrieval brings back the wrong passage, the model can write a smooth answer from the wrong source. Always show the sources.

**FDE question.** What happens if retrieval returns the wrong document? Design a fallback. *(Say "I could not find that," route to a person, log it.)*

**Human in the loop.** High-impact answers should have a human review path and, where appropriate, citations or source evidence.

**Check yourself.** (1) Spell out RAG. (2) What problem does it solve? *(Using current or private information.)*

**You can now:** describe how an assistant answers from your own documents.
**Words to know:** *RAG* (look up first, then answer). *Retrieval* (finding the right passages). *Citation* (pointing to the source).

---

## L17 · Agent

**Hook.** You say "book me a meeting with Sam next week." Something checks calendars, picks a time and sends the invite.

**In plain words.** An agent is an application that pursues a goal through several steps, often using tools and remembering what it did.

**Under the hood.** PLAN → ACT → CHECK, repeated until done or stuck. The more freedom an agent has, the more careful the limits and approvals must be.

**Visual.** A digital worker receives a goal, plans a route, uses tools, checks results and pauses for human approval when needed.

**Today's AI Word — Agent.** An AI-enabled system that can carry out multiple steps toward a goal. *Remember: an agent is more than a chatbot because it can interact with tools and workflows.*

**Your Turn.** Describe a task that truly needs multiple steps. Then identify which steps should remain deterministic.

**AI got it wrong.** An agent follows a hidden instruction inside an email and forwards private data. This is why approvals and limits matter (see L25).

**FDE question.** When would a normal workflow be safer and easier than an autonomous agent? *(When the steps never change and the stakes are high.)*

**Human in the loop.** Define approval gates before an agent can send messages, move money, change records or make other consequential actions.

**Check yourself.** (1) What makes an agent more than a chatbot? (2) Name one action that always needs approval.

**You can now:** tell an agent from a simple chat.
**Words to know:** *Agent* (a system that takes steps toward a goal). *Deterministic* (always does the same thing). *Approval gate* (a stop where a person says yes).

---

## L18 · Tool Calling

**Hook.** Asked "what's the weather?", a good assistant calls a weather service instead of guessing.

**In plain words.** Tool calling lets a model ask software to do a specific job, like searching a database or creating a ticket.

**Under the hood.** The model proposes a tool and its inputs; the application runs it and returns the result. Each tool should have narrow permissions.

**Visual.** The AI reaches a control panel and selects a clearly labeled tool rather than inventing the action itself.

**Today's AI Word — Tool.** A software capability an AI system can invoke. *Remember: tools let an AI application interact with the real world.*

**Your Turn.** List five tools a customer-support AI might need and identify the data each tool can access.

**AI got it wrong.** A tool with broad "delete" access plus a confused model can erase real records. Give each tool the least access it needs.

**FDE question.** What permissions should each tool have? What happens if a malicious prompt tries to misuse one?

**Human in the loop.** A human approves sensitive tool permissions and defines actions the agent is never allowed to take automatically.

**Check yourself.** (1) What does tool calling let a model do? (2) What is "least privilege"? *(Only the access needed.)*

**You can now:** explain how AI safely does things in the real world.
**Words to know:** *Tool* (a software action AI can request). *Permission* (what a tool is allowed to touch). *Least privilege* (only the access needed).

---

## L19 · Evaluation

**Hook.** "It seems good" is how many failed AI projects started.

**In plain words.** Evaluation means testing an AI system against the job it is supposed to do.

**Under the hood.** Build a set of test questions with known good answers, run them, score the results, and repeat after every change.

**Visual.** A quality-control lab tests hundreds of AI outputs against an answer key, safety checklist and business metrics.

**Today's AI Word — Evaluation.** A structured process for measuring whether an AI system performs well enough for its intended use. *Remember: without evaluation, "it seems good" is not a production standard.*

**Your Turn.** Create ten test questions for the AI system from Project 01 and score the answers.

**AI got it wrong.** A system aced the five demo questions and failed the first real customer. Demos hide hard cases.

**FDE question.** What metric would prove this AI actually improved the customer's workflow? *(Time saved, errors reduced, response time, satisfaction, measured against a baseline.)*

**Human in the loop.** A human reviews failures and decides whether the system is safe to continue, needs improvement or should be stopped.

**Check yourself.** (1) What is evaluation? (2) Why use more than one test case?

**You can now:** explain how to tell whether an AI system works.
**Words to know:** *Evaluation* (testing against the job). *Test case* (one question with a known good answer). *Baseline* (how things were before).

---

## L20 · Guardrail

**Hook.** A highway has barriers not because drivers are bad, but because mistakes are costly.

**In plain words.** A guardrail is a technical, procedural or policy control that prevents unsafe, unauthorized or unacceptable behavior.

**Under the hood.** Guardrails can live in code (block certain actions), in policy (what staff may do) or in review (a person approves). Use more than one layer.

**Visual.** A futuristic highway with AI vehicles traveling between bright safety barriers, with a human operator monitoring the road.

**Today's AI Word — Guardrail.** A control that limits or catches unwanted AI behavior. *Remember: guardrails turn risk awareness into system behavior.*

**Your Turn.** Design three guardrails for an AI assistant that handles customer information.

**AI got it wrong.** A guardrail that only blocks one phrase is easy to get around. No single guardrail is perfect.

**FDE question.** Which guardrail belongs in code, which belongs in policy, and which requires human review?

**Human in the loop.** Every critical guardrail needs an accountable human owner and a tested escalation path.

**Check yourself.** (1) Give an example of a guardrail. (2) Why use several layers?

**You can now:** name the controls that keep AI inside safe limits.
**Words to know:** *Guardrail* (a limiting control). *Policy* (a written rule). *Escalation* (passing a problem to a person).

---

## PART 2 CHECKPOINT

Explain each word in one sentence to a friend: model, token, API, embedding, vector, RAG, agent, tool calling, evaluation, guardrail. **Pass:** your friend can repeat the idea back.

**Explain it to a 10-year-old.** These are the ten words people use to talk about AI. Once you know them, the conversation stops sounding like a secret code.
