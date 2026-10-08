# NovaCarïs Intellectual Property Registry

**Purpose:** Canonical index of NovaCarïs project IP and source artifacts available in the ChatGPT project/library and incorporated into the repository roadmap.

**Owner designation:** NovaCarïs / project owner, subject to applicable contracts, licenses, authorship records, and counsel review.

**Important:** This registry is an internal provenance and organization record. It is not a legal opinion about copyright, patentability, trademark ownership, work-for-hire status, or third-party rights.

## A. Core brand / ecosystem

### A1. NovaCarïs
Parent ecosystem / operating platform concept for behavioral-health technology, regulated operations, training, consulting, AI and intelligence products.

### A2. Mr. NOVA
NovaCarïs-wide AI agent/persona and controlled operating intelligence layer. Applies across NovaClerk, EHR, Academy, ChoreKey-related ecosystem interfaces and future products, subject to product-specific permissions.

### A3. NovaCarïs Behavioral Health Operating System
Ecosystem-level concept combining workflow, documentation, compliance intelligence, automation, trust/governance and organizational intelligence.

## B. Flagship technology

### B1. NovaClerk
AI-assisted behavioral-health documentation and workflow product.

Known concept areas:
- documentation assistance
- workflow support
- compliance intelligence
- controlled AI operations
- supervised agent workflows
- evidence/auditability

### B2. NovaCarïs EHR
Behavioral-health operational/EHR product concept with workflow, documentation, dashboards, evidence-oriented operations and population-management capabilities.

## C. Trust / AI control IP

### C1. NOVA Trust Layer
Controlled AI operating architecture.

Core concepts:
- identity
- OIDC/MFA
- session identity
- patient/client assignment enforcement
- voice authorization
- Privacy Hold
- background NOVA worker
- task queue
- event processing
- agent registry
- permission registry
- execution gateway
- approval engine
- evidence ledger
- auditability

### C2. Agent Registry
Registry describing each agent's:
- identity
- purpose
- risk class
- model/provider policy
- action ceiling
- provenance requirements

### C3. Permission Registry
Separate authorization plane defining:
- resource
- action
- scope
- decision
- human approval requirement
- expiration

### C4. Human Authorization
Consequential agent actions can require explicit human authorization.

### C5. Evidence Ledger
Evidence-first operational model recording:
- source
- provenance
- timestamps
- validity
- hashes
- assessment
- authorization
- execution

## D. Regulatory intelligence IP

### D1. Regulatory Graph
Organization → Site → Service → Requirement → Evidence → Risk → Action → Verification.

### D2. Maryland COMAR Intelligence
Productized intelligence around Maryland behavioral-health regulatory requirements, including status-aware treatment of proposed/current/effective/guidance material.

### D3. MPRIME Readiness Check
Operational readiness product for Maryland Medicaid's MPRIME transition.

Core assessment areas:
- NPI/entity identity
- provider type
- sites/services
- account association
- enrollment state
- revalidation
- identity/license/ownership/site/service evidence
- human review

### D4. NovaCompliance
Regulatory change → applicability → readiness → evidence → corrective action workflow.

## E. Funding intelligence

### E1. NovaGrant / Government Opportunity Intelligence
Funding intelligence product concept.

Core pipeline:
Opportunity → Eligibility → Mission → Geography → Capability → Evidence → Activity → Timing → Recommendation.

Outputs:
- pursue
- partner
- monitor
- do not pursue
- missing evidence
- readiness gaps
- deadline urgency

## F. Family technology

### F1. ChoreKey
Distinct NovaCarïs family/parenting technology product.

Core model:
family → child → chore → mission → proof → approval → reward → rule → schedule → achievement → learning → challenge.

### F2. ChoreKey enforcement architecture
iOS:
- Family Controls
- Managed Settings
- Device Activity
- Screen Time extensions
- CloudKit for paired flows

Android:
- Accessibility Service
- foreground location service
- home-state/geofence logic
- local storage
- local proof/PIN
- overlay/blocking mechanisms

### F3. ChoreKey bounded agents
Child-facing agents include guide, responsibility coach, learning coach, assignment coach, creative coach, motivator, rule explainer/referee and parent-escalation agent.

Control rule:
child-facing AI does not directly grant minutes, remove restrictions, change parent rules, approve its own evidence, or directly mutate the database.

## G. Academy / education

### G1. NovaCarïs Academy
Education and enablement ecosystem converting books/materials into lectures, labs, projects, assessments, portfolio evidence and professional pathways.

Defined commercial layers:
- free intelligence
- courses
- applied labs
- professional certificates
- enterprise academy

Initial curriculum domains include AI literacy, behavioral-health operations, COMAR/regulatory readiness, MPRIME readiness, evidence management, Medicaid operations, and AI governance.

Known course/product concept:
- AI Without Fear

Additional Academy IP should be indexed as source artifacts are recovered.

## H. Commercial / business products

### H1. AI Business Factory
Productized service/business model for packaging, implementing and distributing AI-enabled business solutions.

### H2. NovaCarïs Consulting
AI readiness, workflow analysis, intelligent-organization design and implementation.

Defined service lines:
- readiness assessment
- regulatory/compliance transformation
- AI transformation
- NovaCarïs implementation
- funding intelligence
- growth/operating strategy

Commercial model: assessment → implementation → verification → recurring advisory, with Academy training available as a capability-enablement layer.

### H3. NovaCarïs Outreach
Community engagement concept.

### H4. NovaCarïs Cultural Competence
Gap-bridging/cultural-competence methodology and training concept.

## I. Sports / intelligence

### I1. Football AgentOS
Concept for agent intelligence and controlled agent-system applications in football/sports.

Regulatory research is treated as external/reference material; proprietary product architecture is tracked separately.

## J. Commercial operating IP

Known internal concepts include:
- funnel matrix
- partner tiers
- lead registration and attribution
- controlled exposure / need-to-know rings
- customer ownership rules
- product commercialization stages
- implementation packages
- 50 → 150 → 250 → 500 participant/client scale milestones
- separate treatment of technology, training, consulting, implementation and regulated healthcare economics

## K. Existing source artifacts located in project/library

The following source artifacts were located and should be retained as provenance references:

- NovaCaris_Agent_Intelligence_Build_01.md
- NovaCaris_Agent_Intelligence_Build_Blueprint_v1.0.md
- NovaCaris_Maryland_Provider_Acquisition_Sprint_v1.xlsx
- NovaCaris_45_Day_Strategic_Channel_Partner_Packet.docx
- NovaCaris_Package_4_Agency_Term_Sheet_MOU_EHR_IP_Compensation_Framework.docx
- Pasted markdown ecosystem/funnel materials
- NovaCarïs website/index product-universe material
- related ChoreKey architecture materials
- related NovaClerk/EHR/compliance materials recovered through project search

These are source artifacts, not automatically merged verbatim into production source code.

## L. Provenance / classification policy

Every future artifact should be classified as one of:

1. NOVACARIS_ORIGINAL — project-created IP
2. NOVACARIS_DERIVATIVE — project IP incorporating permitted source material
3. THIRD_PARTY_REFERENCE — external law, regulation, API/vendor material, research or facts
4. USER_PROVIDED — material supplied by the owner but origin not independently established
5. LICENSED — third-party material used under a known license
6. UNKNOWN_REVIEW — requires provenance/legal review

## M. Repository rule

The repository is the canonical engineering source of truth.

Do not:
- place secrets in the repository
- copy PHI into the repository
- copy API keys or credentials
- represent proposed regulations as effective law
- incorporate third-party copyrighted text without a permitted basis
- overwrite source provenance
- silently convert research into claimed proprietary invention

Do:
- preserve source filenames and dates
- preserve provenance
- version product specifications
- version regulatory rules separately from code
- record material authorship/licensing status
- keep confidential implementation details in restricted repositories/branches as appropriate
- maintain an IP changelog

## N. Next consolidation target

The next repository layer should organize the above into:

/ip
  /01-ecosystem
  /02-mr-nova
  /03-novacloud? 
  /04-novaclerk
  /05-ehr
  /06-trust-layer
  /07-regulatory-intelligence
  /08-mprime
  /09-compliance
  /10-novagrant
  /11-chorekey
  /12-academy
  /13-ai-business-factory
  /14-consulting
  /15-football-agentos
  /16-commercial
  /17-source-provenance
  /18-legal-review

The exact product naming should remain versioned; this registry is the controlling index until a formal legal/IP schedule is prepared.
