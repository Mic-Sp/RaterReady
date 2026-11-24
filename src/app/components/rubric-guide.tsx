/** Public teaching examples explain criteria, never scenario keys or capstone coaching; the caller controls availability. */
export function RubricGuide() {
  return <section className="rubric-guide" aria-labelledby="rubric-guide-heading" id="rubric-guide">
    <h2 id="rubric-guide-heading">Understanding Rubrics &amp; Evaluation Criteria</h2>
    <p>A rubric is a shared set of criteria for judging a response. In AI evaluation (including RLHF, or reinforcement learning from human feedback), it helps evaluators explain why one response meets the task better than another.</p>
    <p>Criteria describe what to check. Weights describe how much each criterion contributes to a score. Priorities describe which requirements take precedence: a supplied safety rule may outweigh a preference for extra detail. Read the task’s own rubric before deciding; do not invent weights or assume every criterion matters equally.</p>
    <p>DEMO - SYNTHETIC: The examples below are fictional teaching examples, not answers to any assessment.</p>
    <dl className="rubric-criteria">
      <div><dt>Factual accuracy</dt><dd>Check whether claims are correct and supported by the supplied evidence. Notice invented facts and acknowledge uncertainty when evidence is missing. Example: a fictional notice lists a deadline of Friday; a response saying Thursday is inaccurate.</dd></div>
      <div><dt>Instruction following</dt><dd>Check whether the response does what was asked, including scope, format and constraints. Example: if the task requests two bullet points using only a supplied notice, a long paragraph adding outside claims does not follow those instructions.</dd></div>
      <div><dt>Safety &amp; stated policy</dt><dd>Check for harmful, unsafe or policy-violating content against the guidelines supplied for that task. Identify the relevant rule and explain how the response follows or violates it; do not substitute personal preferences or assume an unstated employer policy. Example: if the fictional guidelines prohibit sharing private access codes, a response that reveals a code violates that rule. A response that withholds it and suggests the approved access process follows the rule.</dd></div>
    </dl>
    <p>Consider the criteria together and support your judgment with specific evidence. An accurate response can still miss an instruction or violate a stated safety rule. A valid tie may be appropriate when the supplied rubric supports it.</p>
    <p>RaterReady is independent and does not represent an employer’s assessment policy. G1–G6 are RaterReady’s internal Generalist competency identifiers, not an external industry standard.</p>
  </section>;
}
