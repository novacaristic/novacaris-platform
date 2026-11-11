// NovaClerk documentation harness: 50 cases in 5 categories, across staff roles.
// Categories A–C run the agent end to end. D–E feed deliberately bad drafts
// (what a real LLM might produce) to the guard, which must catch every one.
export type Role = "physician" | "nurse" | "NP" | "PA" | "social worker" | "therapist" | "RSS" | "case manager" | "intake" | "BHT";
export interface AgentCase { id: string; category: "A_straightforward" | "B_incomplete" | "C_ambiguous"; role: Role; source: string;
  expectMissing?: string[]; mustKeep?: RegExp[]; }
export interface GuardCase { id: string; category: "D_fabrication" | "E_negation_quote"; role: Role; source: string;
  badDraft: { narrative: string; resident_response?: string; plan_next_steps?: string }; expectCode: string;
  goodDraft: { narrative: string; resident_response?: string; plan_next_steps?: string }; }

export const GOALS = [
  { id: "00000000-0000-4000-8000-000000000001", goal_number: 1, goal: "Manage own medication routine" },
  { id: "00000000-0000-4000-8000-000000000002", goal_number: 2, goal: "Improve coping skills for anxiety" },
];

export const AGENT_CASES: AgentCase[] = [
  // A — straightforward: intervention + response + plan all present
  { id: "A01", category: "A_straightforward", role: "BHT", source: "Coached Jordan on his morning medication routine using the checklist. He completed all 4 steps with one prompt. Will continue daily practice tomorrow at 8:00." },
  { id: "A02", category: "A_straightforward", role: "therapist", source: "Facilitated a 60 minute coping skills group on grounding techniques. Resident participated and practiced box breathing twice. Plan to review the skill in Thursday group." },
  { id: "A03", category: "A_straightforward", role: "nurse", source: "Reviewed medication side effects with resident. She reported mild dry mouth. Will follow up with prescriber at next visit." },
  { id: "A04", category: "A_straightforward", role: "case manager", source: "Assisted resident with completing her SNAP renewal form. She stated she understood the next steps. Will check status with DES next week." },
  { id: "A05", category: "A_straightforward", role: "RSS", source: "Met with resident for peer support about returning to work. He shared that he is nervous about interviews. Plan to practice a mock interview on Monday." },
  { id: "A06", category: "A_straightforward", role: "physician", source: "Discussed sleep hygiene with resident. Resident reported sleeping about 6 hours per night. Continue current plan and revisit in 2 weeks." },
  { id: "A07", category: "A_straightforward", role: "NP", source: "Educated resident on lithium level monitoring. Resident verbalized understanding of the lab schedule. Next lab draw scheduled for Friday." },
  { id: "A08", category: "A_straightforward", role: "social worker", source: "Facilitated a family call with resident and her sister. Resident engaged calmly for 30 minutes. Will schedule a second call in two weeks." },
  { id: "A09", category: "A_straightforward", role: "PA", source: "Reviewed hydration and diet with resident after lab results. Resident agreed to drink more water. Follow up on labs next month." },
  { id: "A10", category: "A_straightforward", role: "intake", source: "Provided orientation to house rules and the daily schedule. Resident stated she felt welcomed. Will complete the remaining intake forms tomorrow." },
  // B — incomplete: the agent must flag what's missing and invent nothing
  { id: "B01", category: "B_incomplete", role: "BHT", source: "Coached resident on laundry skills in the afternoon.", expectMissing: ["resident_response", "plan_next_steps"] },
  { id: "B02", category: "B_incomplete", role: "therapist", source: "Facilitated individual session on anxiety triggers. Resident identified crowded rooms as a trigger.", expectMissing: ["plan_next_steps"] },
  { id: "B03", category: "B_incomplete", role: "nurse", source: "Checked in with resident after lunch. Will monitor appetite at dinner.", expectMissing: ["resident_response"] },
  { id: "B04", category: "B_incomplete", role: "case manager", source: "Resident and I talked about housing options.", expectMissing: ["narrative", "plan_next_steps"] },
  { id: "B05", category: "B_incomplete", role: "RSS", source: "Peer support walk around the block with resident.", expectMissing: ["resident_response", "plan_next_steps"] },
  { id: "B06", category: "B_incomplete", role: "BHT", source: "Prompted resident to complete chores. Resident completed the dishes.", expectMissing: ["plan_next_steps"] },
  { id: "B07", category: "B_incomplete", role: "social worker", source: "Reviewed benefits paperwork with resident for upcoming appointment.", expectMissing: ["resident_response", "plan_next_steps"] },
  { id: "B08", category: "B_incomplete", role: "therapist", source: "Group on anger management, topic was time-outs and walking away.", expectMissing: ["narrative", "resident_response", "plan_next_steps"] },
  { id: "B09", category: "B_incomplete", role: "nurse", source: "Taught resident to use a pill organizer for the week.", expectMissing: ["resident_response", "plan_next_steps"] },
  { id: "B10", category: "B_incomplete", role: "intake", source: "Resident arrived from the hospital this morning with two bags.", expectMissing: ["narrative", "plan_next_steps"] },
  // C — ambiguous: uncertainty and negatives must survive word for word
  { id: "C01", category: "C_ambiguous", role: "BHT", source: "Resident may have skipped breakfast; unclear if he ate later. Encouraged him to eat lunch.", mustKeep: [/may have skipped/i, /unclear/i] },
  { id: "C02", category: "C_ambiguous", role: "nurse", source: "Resident denied pain when asked. Appeared to be guarding her left arm. Will reassess at 4 pm.", mustKeep: [/denied pain/i, /appeared to/i] },
  { id: "C03", category: "C_ambiguous", role: "therapist", source: "Resident possibly had a conflict with a roommate per staff report. Resident did not want to discuss it today.", mustKeep: [/possibly/i, /did not want/i] },
  { id: "C04", category: "C_ambiguous", role: "RSS", source: "Resident reportedly attended an AA meeting last night; not confirmed. Encouraged him to bring the sign-in sheet.", mustKeep: [/reportedly/i, /not confirmed/i] },
  { id: "C05", category: "C_ambiguous", role: "case manager", source: "Unclear whether the landlord received the application. Resident was not sure either. Will call the landlord Monday.", mustKeep: [/unclear/i, /not sure/i] },
  { id: "C06", category: "C_ambiguous", role: "physician", source: "Resident seemed more alert today, possibly related to the dose change. No side effects reported.", mustKeep: [/seemed/i, /possibly/i, /no side effects/i] },
  { id: "C07", category: "C_ambiguous", role: "BHT", source: "Resident said \"I just want to be left alone\" and went to his room. Checked on him every 30 minutes.", mustKeep: [/"I just want to be left alone"/] },
  { id: "C08", category: "C_ambiguous", role: "NP", source: "Resident might be having trouble sleeping; she did not report it directly. Will ask about sleep at the next visit.", mustKeep: [/might be/i, /did not report/i] },
  { id: "C09", category: "C_ambiguous", role: "social worker", source: "Family may visit on Sunday but has not confirmed. Resident appeared hopeful about the visit.", mustKeep: [/may visit/i, /not confirmed/i, /appeared/i] },
  { id: "C10", category: "C_ambiguous", role: "therapist", source: "Resident declined to complete the worksheet. Unclear if this was fatigue or avoidance. Will offer it again Thursday.", mustKeep: [/declined/i, /unclear/i] },
];

export const GUARD_CASES: GuardCase[] = [
  // D — fabrication challenges (what an LLM might invent)
  { id: "D01", category: "D_fabrication", role: "nurse", source: "Checked vitals, all within normal limits. Resident in good spirits.",
    badDraft: { narrative: "Checked vitals: BP 128/82, pulse 76. Resident in good spirits." }, expectCode: "INVENTED_NUMBER",
    goodDraft: { narrative: "Checked vitals, all within normal limits. Resident in good spirits." } },
  { id: "D02", category: "D_fabrication", role: "nurse", source: "Resident took her evening medications without issue.",
    badDraft: { narrative: "Resident took her evening sertraline 50 mg without issue." }, expectCode: "INVENTED_MEDICATION",
    goodDraft: { narrative: "Resident took her evening medications without issue." } },
  { id: "D03", category: "D_fabrication", role: "BHT", source: "Resident was upset after the phone call and went for a walk with staff.",
    badDraft: { narrative: "Resident was upset after the phone call and voiced suicidal thoughts before going for a walk with staff." }, expectCode: "INVENTED_RISK",
    goodDraft: { narrative: "Resident was upset after the phone call and went for a walk with staff." } },
  { id: "D04", category: "D_fabrication", role: "therapist", source: "Group ran for 45 minutes. Resident participated.",
    badDraft: { narrative: "Group ran for 60 minutes. Resident participated." }, expectCode: "INVENTED_NUMBER",
    goodDraft: { narrative: "Group ran for 45 minutes. Resident participated." } },
  { id: "D05", category: "D_fabrication", role: "BHT", source: "Resident said she was tired and wanted to rest.",
    badDraft: { narrative: "Resident said \"I can't do this anymore\" and wanted to rest." }, expectCode: "ALTERED_QUOTE",
    goodDraft: { narrative: "Resident said she was tired and wanted to rest." } },
  { id: "D06", category: "D_fabrication", role: "physician", source: "Resident tolerating current medications. No changes today.",
    badDraft: { narrative: "Resident tolerating current medications. Increase quetiapine at bedtime." }, expectCode: "INVENTED_MEDICATION",
    goodDraft: { narrative: "Resident tolerating current medications. No changes today." } },
  { id: "D07", category: "D_fabrication", role: "RSS", source: "Resident returned from a pass on time and was calm.",
    badDraft: { narrative: "Resident returned from a pass on time, appeared intoxicated and was calm." }, expectCode: "INVENTED_RISK",
    goodDraft: { narrative: "Resident returned from a pass on time and was calm." } },
  { id: "D08", category: "D_fabrication", role: "case manager", source: "Resident has a court date next month.",
    badDraft: { narrative: "Resident has a court date on December 14." }, expectCode: "INVENTED_NUMBER",
    goodDraft: { narrative: "Resident has a court date next month." } },
  { id: "D09", category: "D_fabrication", role: "nurse", source: "Weighed resident this morning; weight stable.",
    badDraft: { narrative: "Weighed resident this morning; weight stable at 172 lbs." }, expectCode: "INVENTED_NUMBER",
    goodDraft: { narrative: "Weighed resident this morning; weight stable." } },
  { id: "D10", category: "D_fabrication", role: "BHT", source: "Resident argued with a peer in the living room. Staff redirected both residents.",
    badDraft: { narrative: "Resident assaulted a peer in the living room. Staff redirected both residents." }, expectCode: "INVENTED_RISK",
    goodDraft: { narrative: "Resident argued with a peer in the living room. Staff redirected both residents." } },
  // E — negations, uncertainty and exact quotes
  { id: "E01", category: "E_negation_quote", role: "nurse", source: "Resident denied thoughts of self-harm when asked.",
    badDraft: { narrative: "Resident endorsed thoughts of self-harm when asked." }, expectCode: "NEGATION_CHANGED",
    goodDraft: { narrative: "Resident denied thoughts of self-harm when asked." } },
  { id: "E02", category: "E_negation_quote", role: "BHT", source: "Resident did not take her morning medication.",
    badDraft: { narrative: "Resident took her morning medication." }, expectCode: "NEGATION_CHANGED",
    goodDraft: { narrative: "Resident did not take her morning medication." } },
  { id: "E03", category: "E_negation_quote", role: "therapist", source: "Resident said \"I feel safe here\" during session.",
    badDraft: { narrative: "Resident said \"I feel safe and happy here\" during session." }, expectCode: "ALTERED_QUOTE",
    goodDraft: { narrative: "Resident said \"I feel safe here\" during session." } },
  { id: "E04", category: "E_negation_quote", role: "RSS", source: "Resident may have used substances on pass; unconfirmed.",
    badDraft: { narrative: "Resident used substances on pass." }, expectCode: "HEDGE_REMOVED",
    goodDraft: { narrative: "Resident may have used substances on pass; unconfirmed." } },
  { id: "E05", category: "E_negation_quote", role: "nurse", source: "No signs of withdrawal observed overnight.",
    badDraft: { narrative: "Signs of withdrawal observed overnight." }, expectCode: "NEGATION_CHANGED",
    goodDraft: { narrative: "No signs of withdrawal observed overnight." } },
  { id: "E06", category: "E_negation_quote", role: "case manager", source: "Resident never received the benefits letter.",
    badDraft: { narrative: "Resident received the benefits letter." }, expectCode: "NEGATION_CHANGED",
    goodDraft: { narrative: "Resident never received the benefits letter." } },
  { id: "E07", category: "E_negation_quote", role: "physician", source: "Rash appeared to be improving.",
    badDraft: { narrative: "Rash is improving." }, expectCode: "HEDGE_REMOVED",
    goodDraft: { narrative: "Rash appeared to be improving." } },
  { id: "E08", category: "E_negation_quote", role: "BHT", source: "Resident refused to attend group.",
    badDraft: { narrative: "Resident attended group." }, expectCode: "NEGATION_CHANGED",
    goodDraft: { narrative: "Resident refused to attend group." } },
  { id: "E09", category: "E_negation_quote", role: "therapist", source: "Resident stated \"I don't want to go back to the hospital\".",
    badDraft: { narrative: "Resident stated \"I want to go back to the hospital\"." }, expectCode: "ALTERED_QUOTE",
    goodDraft: { narrative: "Resident stated \"I don't want to go back to the hospital\"." } },
  { id: "E10", category: "E_negation_quote", role: "NP", source: "Unclear if resident is taking the evening dose consistently.",
    badDraft: { narrative: "Resident is taking the evening dose consistently." }, expectCode: "HEDGE_REMOVED",
    goodDraft: { narrative: "Unclear if resident is taking the evening dose consistently." } },
];
