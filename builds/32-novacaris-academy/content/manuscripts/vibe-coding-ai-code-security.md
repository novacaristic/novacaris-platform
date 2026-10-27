# Vibe Coding & AI Code Security Assessment

**Training manual with a one-page checklist**
NovaCarïs Academy · Rebuilt draft v0.1 · 2026-10-26

> **Status.** Rebuilt from the outline (failure patterns, security review framework, exercises, three tiers). Not a copy of your original 10-page manual. Teach safe practice only; do not teach attack techniques beyond what defenders need. Check current tool names and security guidance before teaching. Independent training; not affiliated with any certification body.

## 1. What "vibe coding" is

Vibe coding means building software by describing what you want to an AI tool and accepting the code it writes. It is fast and it lets non-programmers build. The risk: code you did not read is code nobody has checked.

**Everyday comparison.** A contractor you never inspected built your porch. It may be fine. Would you let strangers stand on it before an inspection?

**Words to know:** *Vibe coding* (building by describing to an AI). *Review* (reading and testing before use). *Dependency* (outside code your project relies on).

## 2. Where AI-written code goes wrong

1. **Secrets in code.** Keys and passwords pasted into files that get published.
2. **Weak input checks.** The app trusts whatever a user types.
3. **Injection.** Untrusted text is treated as commands (for example into a database query).
4. **Unsafe or invented packages ("slopsquatting").** The AI suggests a library that is outdated, risky or does not exist. Attackers can publish a real package under a name AI tools tend to invent, so installing it blindly can install malware.
5. **Missing access control.** Anyone logged in can see anyone's data.
6. **No logging.** Nobody can tell what happened after a problem.
7. **Over-broad permissions.** The app or key can do far more than needed.
8. **Confident but wrong logic.** It runs, but handles edge cases badly.

**Worked example.** A signup page works. In the file is `DATABASE_KEY = "live-key-here"`. The founder publishes the repository. Anyone can read the key. Fix: remove it, rotate (replace) the key, store secrets in environment settings, add a scan before publishing.

**Explain it to a 10-year-old.** Don't tape your house key to the front door. And don't trust a helper's building without looking inside.

## 3. The security review framework (five passes)

| Pass | Question | Look for |
| --- | --- | --- |
| 1. Secrets | Are any keys or passwords in the code? | Strings that look like keys; `.env` files committed |
| 2. Access | Who can do what? | Missing login checks; users reaching others' data |
| 3. Inputs | What if someone types something odd? | Unvalidated fields; text placed into queries or commands |
| 4. Packages | What outside code is used? | Unknown, old or suspicious libraries |
| 5. Records | Can we see what happened? | Logging, error handling, no private data in logs |

Then run the tests, read the changed code, and have a second person look at anything touching private data.

**Words to know:** *Secret* (a password or key). *Input validation* (checking what users submit). *Least privilege* (only the access needed). *Rotate* (replace a key that may be exposed).

## 4. Prompt injection (defender's view)

Prompt injection is hidden text that steers an AI tool to do something unintended. An email, web page or document might contain instructions an AI agent reads and follows.

**Defenses.** Limit what the tool can access; require human approval before sending data outside; treat outside text as data, not commands; keep logs; test in a sandbox with no real data.

## 5. Exercises

1. **Find the secrets.** Given a small sample project, list every exposed secret and how to fix each.
2. **Read the login.** Review an AI-written login form; list three weaknesses.
3. **Package check.** For five suggested packages, decide: keep, replace, or investigate; say why.
4. **Prompt injection drill.** Given a sample email with hidden text, decide what limits would have stopped the harm.
5. **Run the checklist** (below) on your own project.

## 6. Three-tier curriculum

| Tier | Who | Skills | Capstone |
| --- | --- | --- | --- |
| Foundations | Non-coders using AI tools | Spot secrets, understand risk, safe-use rules | Mark up a sample project |
| Practitioner | Can read simple code | Run the five-pass review; fix common flaws | Fix a planted-flaw sample app |
| Specialist | Developers/security staff | Threat modeling, dependency review, agent security, review leadership | Written security assessment of an AI feature |

## 7. Mapping to broader security knowledge

The five passes line up with the OWASP families of risk (for example the OWASP Top 10 for web applications and the OWASP Top 10 for LLM Applications, where prompt injection is listed first) and with common security topics: secrets management, access control, input validation, supply chain (packages), logging and monitoring. **[verify]** Check the current OWASP list versions before teaching.

Security+-style domains (general security concepts; threats, vulnerabilities and mitigations; security architecture; security operations; program management and oversight) map roughly as: secrets and access to *architecture*; inputs and packages to *threats and mitigations*; records to *operations*; the human review gate to *oversight*. **[verify]** Confirm against the current CompTIA objectives. This course is independent training, not affiliated with CompTIA, OWASP or any certification body, and does not claim to prepare for any named exam.

## 8. Tooling list (examples; verify current names)

Secret scanners (for example gitleaks or GitHub secret scanning), dependency audit tools (for example npm audit, pip-audit), static analysis, and a test runner. Choose tools your team can maintain.

## 9. Red-flag phrases in AI answers

"This should work, I haven't tested it." "Just disable the check." "Use this package (not found in the registry)." "Hardcode the key for now." "Run this with administrator rights." Any of these means stop and review.

## 10. Glossary

*Dependency:* outside code you rely on. *Injection:* untrusted text treated as a command. *Least privilege:* only the access needed. *Rotate:* replace an exposed key. *Sandbox:* a safe test area. *Secret:* a password or key. *Slopsquatting:* attacks that exploit package names AI invents. *Supply chain:* everything your code depends on.

---

# One-page checklist: before you publish AI-written code

- [ ] No passwords, keys or tokens in any file (search the project).
- [ ] Any exposed key has been replaced (rotated).
- [ ] Secrets live in protected settings, not in code.
- [ ] Login required where needed; users see only their own data.
- [ ] All user inputs are checked; no input becomes a command.
- [ ] Every package is known, current and needed.
- [ ] The app and its keys have only the access they need.
- [ ] Errors are handled; logs exist; logs hold no private data.
- [ ] Tests exist and pass.
- [ ] A human read the code that touches private data.
- [ ] Tried it in a safe test area with fake data first.
- [ ] Someone can switch it off quickly.

*Training material, not a guarantee of security.*
