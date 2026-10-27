# AI Governance in Practice

**Real-Time Visibility, Compliance & Responsible AI**
*A Field Manual for Regulated Organizations Deploying Generative AI*
NovaCarïs Publishing · Rebuilt draft v0.2 (fact-checked 2026-10-26)

> **Status.** This is a rebuilt working draft written from the 11-chapter outline, not a copy of the original 63-page manual. Compare it with your original and keep whichever text you prefer. This is training, not legal advice. Laws, agency guidance and product features change: check every legal and product statement against the current official source and have qualified counsel review before you publish or teach it.
>
> **Fact-check note (2026-10-26).** Legal dates in Chapters 3, 4 and 5 were checked against recent public sources and corrected: the EU AI Act timeline changed in 2026, and Colorado repealed and replaced its AI Act in 2026. Items marked **[verify]** could not be confirmed from a primary source in this review and must be checked before printing.

**How to read this book.** Each chapter has one big idea, a comparison to everyday life, a worked example, an "Explain it to a 10-year-old" box and a **Words to know** footer. Read in order the first time.

---

## Chapter 1. The landscape of generative AI in regulated organizations

**Big idea.** Your staff are probably already using AI. The question is not whether, but whether anyone is in charge of it.

**Everyday comparison.** Think of AI like a new employee who has read a huge library but never worked at your organization. Fast and helpful, sometimes confidently wrong, and needing rules before touching private records.

**What "generative AI" does.** It produces new text, images, audio or code from an instruction (a *prompt*). At its core it predicts likely words rather than looking facts up the way a database does. That is why it can write a smooth answer that is false. Some tools add web search or document lookup on top, which helps but does not remove the need to check.

**Why regulated organizations care.** Healthcare, finance and HR handle information that is private and decisions that change lives. A mistake here can harm a person, trigger a complaint, or break a rule.

**The three ways AI enters an organization**
1. *Bought tools* you approved (an EHR feature, a phone assistant).
2. *Features inside software you already own*, switched on by an update.
3. *Shadow AI*: staff pasting work into free public tools.

**Worked example.** A billing clerk pastes a denial letter into a free chatbot to get a clearer reply. The letter has a client name and diagnosis. No one approved the tool, no agreement protects the data, and nothing was recorded. Nothing "bad" has visibly happened yet, which is exactly why it goes unnoticed.

**Explain it to a 10-year-old.** AI is a super-fast helper that has read a lot but sometimes makes things up. Grown-ups need rules for who can use it and what they can tell it.

**Words to know:** *Generative AI* (AI that creates text, images or code). *Prompt* (the instruction you type). *Hallucination* (a confident answer that is made up). *Shadow AI* (AI used without approval).

---

## Chapter 2. Foundations of AI governance

**Big idea.** Governance means three things written down: who is responsible, what the rules are, and how you check.

**Everyday comparison.** A kitchen has a head cook, a recipe book and a health inspection. Governance is the head cook (owner), the recipe book (policy) and the inspection (review).

**The five building blocks**
1. **Inventory:** a list of every AI tool in use.
2. **Owner:** one named person per tool.
3. **Rules:** a short policy on what is allowed.
4. **Checks:** testing before use and review after.
5. **Records:** proof of what you decided and why.

**Policy versus governance.** A policy is a document. Governance is the habit of using it. A binder nobody opens is not governance.

**Worked example.** A clinic writes a two-page AI policy, then names the compliance officer as owner of every AI tool, sets a quarterly review and starts a log for problems. Three small steps, and they now have governance.

**Explain it to a 10-year-old.** Rules on paper are not enough. Someone has to be the boss of each tool and check that the rules are followed.

**Words to know:** *Governance* (rules, owners and checks). *Inventory* (a list of all tools). *Owner* (the person accountable). *Audit trail* (a record of who did what and when).

---

## Chapter 3. The NIST AI Risk Management Framework

**Big idea.** A free, widely used U.S. framework gives you a simple structure with four functions: **Govern, Map, Measure, Manage.**

**Facts to know.** The framework is the *NIST AI Risk Management Framework (AI RMF 1.0)*, released in January 2023. It is voluntary. NIST also published a companion *Generative AI Profile* (NIST AI 600-1) in July 2024 that applies the four functions to generative AI risks. **[verify]** Check nist.gov for any newer versions before teaching, and use the official names.

| Function | Plain question | Example action |
| --- | --- | --- |
| Govern | Who is in charge and what are our rules? | Name an owner; write a policy |
| Map | What is this tool for, and who could be affected? | Describe the use case and people involved |
| Measure | How do we test whether it works and is fair? | Build a test set; track errors |
| Manage | What do we do about the risks we found? | Add a human check; set a stop rule |

**Worked example.** For an AI note-drafting tool: *Govern*, the compliance officer owns it. *Map*, it drafts progress notes for clinicians; clients are affected. *Measure*, test 30 sample notes for invented facts. *Manage*, clinicians must review every line before signing.

**Explain it to a 10-year-old.** Four questions: Who's in charge? What is it for? Does it work? What if it goes wrong?

**Words to know:** *Framework* (a ready-made structure). *Risk* (chance of harm). *Voluntary* (recommended, not required by itself).

---

## Chapter 4. Sector compliance: healthcare, finance, HR

**Big idea.** The AI tool is new; the rules about private data and fair decisions are not.

**Healthcare (U.S.).** Patient information is protected. If a vendor handles it for you, you generally need a signed agreement (a *Business Associate Agreement*, BAA). Share only the minimum necessary. Substance use disorder records can have extra rules. Behavioral health may also fall under state rules.

**Healthcare nondiscrimination.** The 2024 Section 1557 final rule (45 CFR 92.210) tells covered health programs to make reasonable efforts to identify, and take reasonable steps to reduce, discrimination risk from patient care decision support tools that use input such as race, age, sex or disability. **[verify]** Confirm the rule's current status and compliance dates with counsel; federal enforcement priorities have shifted and may change again.

**Substance use records.** Records from federally assisted substance use disorder programs fall under 42 CFR Part 2, which was updated in 2024 to align more closely with HIPAA. **[verify]** Confirm current requirements.

**Finance.** Rules on fair lending (for example the Equal Credit Opportunity Act and Regulation B), explaining adverse decisions and protecting customer data apply even when a model made the recommendation.

**HR.** Using AI to screen or rank people can raise discrimination concerns under existing employment laws. Some places add specific rules, such as New York City's Local Law 144 on automated employment decision tools (bias audits and notices). Keep a person responsible and test for unequal results across groups.

**State AI laws are moving.** Colorado is the example to watch. Its first AI Act (SB 24-205) was repealed and replaced in 2026 by the Automated Decision-Making Technology Act (S.B. 189, signed May 14, 2026), which focuses on notice, disclosure after adverse outcomes, and human review in areas such as employment, lending, health care and housing. It is reported to take effect January 1, 2027 if the attorney general finishes rulemaking by then. **[verify]** Check the bill text and rulemaking status.

**Worked example (healthcare).** A vendor says its tool is "HIPAA compliant." That sentence is a claim, not a contract. Ask for the signed BAA, where data is stored, how long it is kept, and whether your data trains their model.

**Four questions to ask any vendor:** Do you sign a BAA? Where is data stored and for how long? Do you train on my data? How will you tell me when the tool changes?

> Counsel should confirm which federal, state and payer rules apply to you. This chapter is a map, not legal advice.

**Explain it to a 10-year-old.** Old privacy rules still apply to new AI toys. If a helper sees secrets, there must be a signed promise to keep them.

**Words to know:** *PHI* (protected health information). *BAA* (signed promise to protect patient data). *Minimum necessary* (share only what the task needs). *Adverse decision* (a result that harms someone, such as a denial).

---

## Chapter 5. The EU AI Act and the global context

**Big idea.** Other regions regulate AI too. Know whether a rule reaches you before you worry about it.

**Plain summary.** The EU AI Act (Regulation (EU) 2024/1689) sorts AI uses into four levels: **unacceptable risk** (banned), **high risk** (strict duties), **limited risk** (transparency duties, such as telling people they are talking to AI) and **minimal risk** (no new duties). It can reach organizations outside the EU if their AI is used in the EU or its output is used there.

**Timeline (as reported in mid-2026).**
| Date | What applies |
| --- | --- |
| 1 Aug 2024 | The Act entered into force |
| 2 Feb 2025 | Bans on unacceptable-risk practices; AI literacy duty |
| 2 Aug 2025 | Rules for general-purpose AI models |
| 2 Dec 2026 | New bans added by the 2026 omnibus (non-consensual intimate imagery, "nudifier" apps, child sexual abuse material); transparency deadline for older generative systems (Art. 50(2)) |
| 2 Dec 2027 | High-risk (Annex III) obligations, postponed from 2 Aug 2026 |
| 2 Aug 2028 | High-risk obligations for AI built into regulated products (Annex I) |

The delays come from the "Digital Omnibus on AI," published as Regulation (EU) 2026/1744. **[verify]** These dates come from law-firm summaries; confirm each on the official EU Official Journal (EUR-Lex) text before teaching, since details such as other transparency dates were not confirmed in this review.

**Do this.** Ask three questions: Do we serve people in the EU? Do we use AI that affects them or is its output used there? Which risk level is the use? If the answer to the first is no, write one sentence saying so and review yearly. (A U.S. behavioral health agency serving only U.S. clients will usually answer no, but counsel should confirm.)

**Why it still helps if it does not apply.** The risk-tier idea is useful anywhere.

**Explain it to a 10-year-old.** Different countries have different playground rules. Check whether their rules apply to your playground.

**Words to know:** *Risk tier* (a label for how much harm a use could cause). *High-risk* (uses where mistakes can seriously harm people). *Jurisdiction* (the place whose laws apply).

---

## Chapter 6. Responsible AI principles in practice

**Big idea.** Principles are only useful when turned into a habit.

| Principle | Habit |
| --- | --- |
| Fairness | Test results by group, not just overall |
| Transparency | Tell people when AI is used |
| Accountability | A named human owns each tool |
| Privacy | Share the minimum; approved tools only |
| Safety | Stop rules and human review for risky steps |
| Reliability | Re-test after every update |

**Worked example.** A scheduling bot misunderstands callers with strong accents. Overall accuracy looks fine; accuracy for one group does not. Testing by group exposed it.

**Explain it to a 10-year-old.** Being fair means checking that the helper works well for everybody, not just most people.

**Words to know:** *Bias* (worse results for some groups). *Transparency* (being open about AI use). *Accountability* (a person answers for the result).

---

## Chapter 7. Real-time LLM visibility and monitoring

**Big idea.** You cannot manage what you cannot see.

**What to watch**
- Which tools are used, by whom, how often.
- Edit rate: how often people change the AI's draft.
- Escalations and complaints.
- Sensitive words or data appearing where they should not.
- Vendor change notices.

**Everyday comparison.** A dashboard light in a car. You do not need to be a mechanic to notice the light came on.

**Worked example.** A documentation assistant's edit rate climbs from occasional to constant after a vendor update. That is a prompt to re-test, not to blame staff.

**Simple setup.** Weekly review of a short log. Monthly summary to the committee. Quarterly re-test.

**Explain it to a 10-year-old.** Watch the helper's work like a teacher watching a class, so you notice trouble early.

**Words to know:** *Monitoring* (watching over time). *Edit rate* (how often drafts are changed). *Drift* (slow change in a tool's behavior). *Log* (a record of events).

---

## Chapter 8. Designing an AI governance program

**Big idea.** Start small, with a program that someone will actually run.

**Roles**
- **Executive sponsor:** gives the program authority.
- **Governance lead:** runs it day to day.
- **Tool owners:** accountable for each tool.
- **Privacy/security reviewer:** checks data and access.
- **Frontline champion:** speaks for the people using the tools.

**Three lines of defense (simple version).** First, the people using the tool check their own work. Second, a compliance or quality person reviews. Third, an independent look (audit) happens periodically.

**First 90 days**
| Days | Do this |
| --- | --- |
| 1-15 | Build the inventory |
| 16-30 | Rank tools by risk; pause unclear tools on private data |
| 31-45 | Name owners; form a small committee |
| 46-60 | Write a short policy; choose a pilot |
| 61-75 | Train staff: use, check, report |
| 76-90 | Review; decide expand, adjust or stop |

**Explain it to a 10-year-old.** A team where everyone knows their job beats a rulebook nobody reads.

**Words to know:** *Charter* (a short document giving the committee its job). *Sponsor* (a leader who backs the program). *Pilot* (a small trial first).

---

## Chapter 9. Risk assessment and classification

**Big idea.** Not every tool needs the same care. Match checking to the stakes.

| Tier | Meaning | Example | Typical controls |
| --- | --- | --- | --- |
| High | Could affect health, safety, money, jobs or legal rights | Triage or eligibility support | Human approval, testing, monitoring, owner sign-off |
| Medium | Touches private data but a person reviews | Note drafting | Approved tool, BAA, review step |
| Low | No private data, low stakes | Brainstorming public marketing ideas | Basic use rules |

**Seven impact questions**: What is the tool for? Who is affected? What data does it touch? What is the worst realistic mistake? Who checks? How will we know it is working? What is the stop rule?

**Worked example.** An AI phone assistant for scheduling is medium. Add the ability to hear a client in crisis, and it is high until a crisis hand-off to a human is built and tested.

**Explain it to a 10-year-old.** Wear a helmet for a bike, not for walking. More danger, more protection.

**Words to know:** *Classification* (sorting by risk). *Impact assessment* (a written look at what could go wrong). *Risk register* (a list of risks with owners).

---

## Chapter 10. Case studies

Each case is a composite example for teaching. Ask: What went wrong? Which control would have helped? What would you do?

1. **The free chatbot.** Staff paste client details into a free tool for months. *Controls:* approved tool list, simple "stoplight" rule, easy reporting.
2. **The invented dose.** An AI-drafted note adds a medication the client was not on; a signer did not read closely. *Controls:* line-by-line review, edit-rate tracking, chart audit.
3. **The silent update.** A vendor swaps its model; answers change. *Controls:* change-notice clause, re-testing, monitoring.
4. **The after-hours crisis.** An AI assistant offers "the next business day" to a caller in distress. *Controls:* crisis keywords trigger a human hand-off outside the AI's judgment.
5. **The biased screener.** A resume tool ranks one group lower. *Controls:* group-level testing, human decision-makers, documentation.
6. **The hidden instruction.** An agent obeys hidden text in an email and forwards data. *Controls:* least privilege, approval for external sending, logs.

---

## Chapter 11. Building your compliance toolkit

Four ready-to-use templates (full text in the appendices).

1. **AI Tool Approval Form:** purpose, owner, data touched, vendor answers, risk tier, review date.
2. **AI System Inventory:** tool, owner, tier, data, review date.
3. **Incident Report:** what happened, when, tool, who was told, fix, lesson.
4. **90-Day Rollout Plan:** the table in Chapter 8.

**Keep documents in version control** (for example a private GitHub repository) so you can show who changed what and when. See Appendix C.

---

## Appendix A. Glossary

| Word | Plain meaning |
| --- | --- |
| Agent | AI that takes steps on its own within limits |
| Audit trail | Record of who did what and when |
| BAA | Signed promise to protect patient data |
| Bias | Worse results for some groups |
| Drift | A tool slowly changing behavior |
| Edit rate | How often drafts are changed |
| Governance | Rules, owners and checks |
| Hallucination | Confident but made-up answer |
| Human in the loop | A person approves important steps |
| Inventory | List of all AI tools |
| PHI | Protected health information |
| Prompt | Instruction given to AI |
| Risk tier | Label for potential harm |
| Vendor | Company that sells the tool |

## Appendix B. Further reading

NIST AI Risk Management Framework (nist.gov); HHS Office for Civil Rights guidance on health information; your state's behavioral health and privacy rules; the EU AI Act official text. Confirm each link and version before printing.

## Appendix C. Putting governance documents in GitHub (how-to)

1. Create a **private** repository named `ai-governance`.
2. Add folders `policies/`, `inventory/`, `incidents/`, `reviews/`.
3. Save each document as a text or Markdown file.
4. Make changes on a branch; a second person approves before merging.
5. Never store patient data or passwords in the repository.

## Appendix D. Sample AI Use and Governance Policy (skeleton for counsel review)

1. **Purpose.** To use AI safely, fairly and lawfully.
2. **Scope.** All staff, contractors and tools.
3. **Approved tools only.** Only tools on the inventory may be used with organizational data.
4. **No private data in unapproved tools.**
5. **Human responsibility.** A person reviews and is accountable for every AI output used in work.
6. **Risk tiers.** Tools are classified and controls applied accordingly.
7. **Reporting.** Staff report problems immediately; no blame for prompt reporting.
8. **Review.** The committee reviews quarterly.
9. **Vendors.** Contracts must cover data use, retention, breach notice and change notice.
10. **Updates.** Reviewed at least yearly.

*Skeleton only. Have qualified counsel review before adoption.*

## Appendix E. Cheat sheets

**Stoplight.** *Go:* public information, approved tool. *Check:* internal information, ask your owner. *Stop:* private or patient data in an unapproved tool.
**Five habits.** Ask clearly. Check. Protect. Own it. Report.

## Appendix F. FAQ

**Do we need governance if we only use a chat tool?** Yes: that is when shadow AI happens.
**Is a vendor's "compliant" claim enough?** No. Ask for the signed agreement and answers in writing.
**Who should own governance in a small agency?** One named person, supported by a leader; it can be part of an existing role.
**How often do we review?** At least quarterly for high-risk tools, and after any vendor change.
