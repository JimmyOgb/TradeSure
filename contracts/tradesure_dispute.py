# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

import json
from genlayer import *

ERROR_EXPECTED = "[EXPECTED]"
ERROR_EXTERNAL = "[EXTERNAL]"
ERROR_TRANSIENT = "[TRANSIENT]"
ERROR_LLM = "[LLM_ERROR]"


def _parse_llm_json(raw_text: str) -> dict:
    start = raw_text.find("{")
    end = raw_text.rfind("}")
    if start == -1 or end == -1 or end < start:
        raise gl.vm.UserError(f"{ERROR_LLM} Invalid JSON formatting from evaluator")
    snippet = raw_text[start : end + 1]
    return json.loads(snippet)


class TradeSureDispute(gl.Contract):
    """
    TradeSure Intelligent Dispute Resolution Contract.
    Manages dispute lifecycle, committed agreement & evidence terms,
    and runs GenLayer multi-validator consensus evaluation using comparative verification.
    """
    owner: Address
    dispute_count: u256
    
    # Mappings from dispute_id to serialized dispute data & results
    # We store structured JSON strings in TreeMap to maintain full fidelity while meeting GenLayer storage constraints
    disputes: TreeMap[str, str]
    dispute_resolutions: TreeMap[str, str]
    dispute_ids: DynArray[str]

    def __init__(self):
        self.owner = gl.message.sender_account
        self.dispute_count = u256(0)

    @gl.public.view
    def get_owner(self) -> Address:
        return self.owner

    @gl.public.view
    def get_total_disputes(self) -> u256:
        return self.dispute_count

    @gl.public.view
    def get_dispute(self, dispute_id: str) -> dict:
        if dispute_id not in self.disputes:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Dispute not found: {dispute_id}")
        return json.loads(self.disputes[dispute_id])

    @gl.public.view
    def get_resolution(self, dispute_id: str) -> dict:
        if dispute_id not in self.dispute_resolutions:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Dispute not yet resolved: {dispute_id}")
        return json.loads(self.dispute_resolutions[dispute_id])

    @gl.public.write
    def register_dispute(
        self,
        dispute_id: str,
        order_id: str,
        buyer_id: str,
        seller_id: str,
        agreement_hash: str,
        agreement_terms_summary: str,
        claim_summary: str,
        evidence_manifest_json: str,
    ) -> None:
        """
        Registers a dispute commitment on-chain.
        State transition: DISPUTE_OPEN
        """
        if dispute_id in self.disputes:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Dispute already registered: {dispute_id}")

        if not dispute_id or not order_id or not agreement_hash:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Missing mandatory dispute fields")

        dispute_data = {
            "dispute_id": dispute_id,
            "order_id": order_id,
            "buyer_id": buyer_id,
            "seller_id": seller_id,
            "agreement_hash": agreement_hash,
            "agreement_terms_summary": agreement_terms_summary,
            "claim_summary": claim_summary,
            "evidence_manifest_json": evidence_manifest_json,
            "status": "DISPUTE_OPEN",
            "registered_by": str(gl.message.sender_account),
        }

        self.disputes[dispute_id] = json.dumps(dispute_data)
        self.dispute_ids.append(dispute_id)
        self.dispute_count = u256(int(self.dispute_count) + 1)

    @gl.public.write
    def resolve_dispute(self, dispute_id: str) -> None:
        """
        Executes consensus-backed intelligent evaluation of the dispute.
        State transition: UNDER_REVIEW -> RESOLVED
        Evaluates evidence against agreed terms using comparative GenLayer validator consensus.
        """
        if dispute_id not in self.disputes:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Dispute not found: {dispute_id}")

        dispute_obj = json.loads(self.disputes[dispute_id])
        if dispute_obj["status"] == "RESOLVED":
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Dispute is already resolved: {dispute_id}")

        agreement_terms = dispute_obj.get("agreement_terms_summary", "")
        claim_summary = dispute_obj.get("claim_summary", "")
        evidence_manifest = dispute_obj.get("evidence_manifest_json", "")

        prompt = f"""You are the impartial TradeSure Commerce Dispute Arbiter on GenLayer.
Evaluate this commerce dispute strictly based on the agreed terms and submitted evidence.

=== AGREEMENT TERMS ===
{agreement_terms}

=== DISPUTE CLAIM & RESPONSES ===
{claim_summary}

=== VERIFIED EVIDENCE MANIFEST ===
{evidence_manifest}

DECISION RULES:
1. BUYER_SUPPORTED: Clear, credible evidence demonstrates contractual breach, non-delivery, damaged goods, or material deviation from description as stipulated in agreement.
2. SELLER_SUPPORTED: Clear, credible evidence proves fulfillment of contractual terms, confirmed delivery to verified address, or buyer's claim lacks required evidence specified in the agreement.
3. INCONCLUSIVE: Conflicting, insufficient, or tampered evidence where neither party decisively meets burden of proof.

You MUST respond strictly with a valid JSON object matching this schema:
{{
  "outcome": "BUYER_SUPPORTED" | "SELLER_SUPPORTED" | "INCONCLUSIVE",
  "rationale": "Clear, concise factual reasoning based on terms and evidence",
  "evidence_cited": ["IDs or references of key evidence considered"],
  "limitations": "Any evidentiary limitations, missing proofs, or caveats",
  "criteria_applied": "Specific criteria from the agreement evaluated"
}}
Do NOT include any markdown or text outside the JSON object.
"""

        def leader_fn() -> dict:
            llm_result = gl.nondet.exec_prompt(prompt, response_format="json")
            if isinstance(llm_result, str):
                parsed = _parse_llm_json(llm_result)
            elif isinstance(llm_result, dict):
                parsed = llm_result
            else:
                raise gl.vm.UserError(f"{ERROR_LLM} Invalid LLM response format: {type(llm_result)}")

            outcome = str(parsed.get("outcome", "")).strip().upper()
            if outcome not in ("BUYER_SUPPORTED", "SELLER_SUPPORTED", "INCONCLUSIVE"):
                raise gl.vm.UserError(f"{ERROR_LLM} Invalid outcome: {outcome}")

            rationale = str(parsed.get("rationale", "")).strip()
            limitations = str(parsed.get("limitations", "")).strip()
            criteria_applied = str(parsed.get("criteria_applied", "")).strip()
            
            raw_evidence = parsed.get("evidence_cited", [])
            if isinstance(raw_evidence, list):
                evidence_cited = [str(x) for x in raw_evidence]
            else:
                evidence_cited = [str(raw_evidence)]

            return {
                "outcome": outcome,
                "rationale": rationale,
                "limitations": limitations,
                "criteria_applied": criteria_applied,
                "evidence_cited": evidence_cited,
            }

        def validator_fn(leaders_res: gl.vm.Result) -> bool:
            if not isinstance(leaders_res, gl.vm.Return):
                return False

            # Validator independently re-runs evaluation task and verifies substantive agreement
            try:
                validator_eval = leader_fn()
            except Exception:
                return False

            leader_data = leaders_res.calldata
            
            # The decisive category must strictly match
            if leader_data.get("outcome") != validator_eval.get("outcome"):
                return False

            # Rationale must not be empty
            if not leader_data.get("rationale") or not validator_eval.get("rationale"):
                return False

            return True

        evaluation = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)

        # Record resolution and update status
        dispute_obj["status"] = "RESOLVED"
        self.disputes[dispute_id] = json.dumps(dispute_obj)

        resolution_record = {
            "dispute_id": dispute_id,
            "outcome": evaluation["outcome"],
            "rationale": evaluation["rationale"],
            "limitations": evaluation["limitations"],
            "criteria_applied": evaluation["criteria_applied"],
            "evidence_cited": evaluation["evidence_cited"],
            "resolved_at_block": str(gl.message.contract_address),
        }
        self.dispute_resolutions[dispute_id] = json.dumps(resolution_record)
