# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

import json
from genlayer import *

ERROR_EXPECTED = "[EXPECTED]"
ERROR_EXTERNAL = "[EXTERNAL]"


def normalize_address(addr: str) -> str:
    s = str(addr).strip().lower()
    if not s.startswith("0x"):
        s = "0x" + s
    return s


class TradeSureEscrow(gl.Contract):
    """
    TradeSure Production Intelligent Milestone Escrow Contract.
    Enforces milestone-based token locking, releases, refunds, dispute freeze,
    and binding settlement directly linked to verified GenLayer dispute arbitration.
    """
    owner: Address
    dispute_contract_address: str
    escrow_count: u256
    escrows: TreeMap[str, str]
    escrow_ids: DynArray[str]

    def __init__(self):
        self.owner = gl.message.sender_address
        self.escrow_count = u256(0)
        self.dispute_contract_address = "0x09ee2561c62cc6e74cf2111d062560422376666c"

    @gl.public.view
    def get_owner(self) -> Address:
        return self.owner

    @gl.public.view
    def get_dispute_contract(self) -> str:
        return self.dispute_contract_address

    @gl.public.view
    def get_total_escrows(self) -> u256:
        return self.escrow_count

    @gl.public.view
    def get_escrow(self, agreement_id: str) -> dict:
        if agreement_id not in self.escrows:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Escrow agreement not found: {agreement_id}")
        return json.loads(self.escrows[agreement_id])

    @gl.public.view
    def get_locked_balance(self, agreement_id: str) -> u256:
        if agreement_id not in self.escrows:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Escrow agreement not found: {agreement_id}")
        data = json.loads(self.escrows[agreement_id])
        total_dep = int(data.get("deposited_amount", 0))
        total_rel = int(data.get("released_amount", 0))
        total_ref = int(data.get("refunded_amount", 0))
        remaining = max(0, total_dep - total_rel - total_ref)
        return u256(remaining)

    @gl.public.write
    def set_dispute_contract(self, new_address: str) -> None:
        caller = normalize_address(str(gl.message.sender_address))
        if caller != normalize_address(str(self.owner)):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Only contract owner can update dispute arbiter")
        self.dispute_contract_address = normalize_address(new_address)

    @gl.public.write
    def create_escrow(
        self,
        agreement_id: str,
        buyer: str,
        seller: str,
        token_address: str,
        terms_hash: str,
        total_amount: u256,
        milestones_json: str,
    ) -> None:
        """
        Initializes an immutable milestone escrow agreement.
        State transition: NONE -> CREATED
        """
        if not agreement_id or agreement_id in self.escrows:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Invalid or duplicate agreement ID: {agreement_id}")

        buyer_norm = normalize_address(buyer)
        seller_norm = normalize_address(seller)
        token_norm = normalize_address(token_address)

        if buyer_norm == seller_norm:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Buyer and seller cannot be the same address")

        if len(terms_hash) < 16:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Invalid terms commitment hash")

        total_int = int(total_amount)
        if total_int <= 0:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Total escrow amount must be positive")

        caller = normalize_address(str(gl.message.sender_address))
        owner_norm = normalize_address(str(self.owner))
        if caller != buyer_norm and caller != seller_norm and caller != owner_norm:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Unauthorized escrow creator: {caller}")

        try:
            milestones = json.loads(milestones_json)
            if not isinstance(milestones, list) or len(milestones) == 0:
                raise gl.vm.UserError(f"{ERROR_EXPECTED} Milestones must be a non-empty list")
        except json.JSONDecodeError:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Malformed milestones JSON")

        milestone_sum = 0
        cleaned_milestones = []
        for idx, m in enumerate(milestones):
            if not isinstance(m, dict):
                raise gl.vm.UserError(f"{ERROR_EXPECTED} Milestone {idx} must be an object")
            m_id = str(m.get("id", f"m-{idx+1}"))
            m_title = str(m.get("title", f"Milestone {idx+1}"))
            m_amount = int(m.get("amount", 0))
            if m_amount <= 0:
                raise gl.vm.UserError(f"{ERROR_EXPECTED} Milestone {m_id} amount must be positive")
            milestone_sum += m_amount

            cleaned_milestones.append({
                "id": m_id,
                "title": m_title,
                "amount": m_amount,
                "deadline": m.get("deadline", ""),
                "acceptance_criteria": str(m.get("acceptance_criteria", "")),
                "status": "PENDING",
                "evidence_hash": "",
                "evidence_summary": "",
            })

        if milestone_sum != total_int:
            raise gl.vm.UserError(
                f"{ERROR_EXPECTED} Sum of milestones ({milestone_sum}) must equal total ({total_int})"
            )

        escrow_data = {
            "agreement_id": agreement_id,
            "buyer": buyer_norm,
            "seller": seller_norm,
            "token_address": token_norm,
            "terms_hash": terms_hash,
            "total_amount": total_int,
            "deposited_amount": 0,
            "released_amount": 0,
            "refunded_amount": 0,
            "status": "CREATED",
            "active_dispute_id": "",
            "disputed_milestone_id": "",
            "milestones": cleaned_milestones,
            "created_by": caller,
        }

        self.escrows[agreement_id] = json.dumps(escrow_data)
        self.escrow_ids.append(agreement_id)
        self.escrow_count = u256(int(self.escrow_count) + 1)

    @gl.public.write
    def deposit(self, agreement_id: str, amount: u256) -> None:
        """
        Locks buyer tokens into escrow contract via ERC-20 transfer_from.
        State transition: CREATED -> FUNDED
        """
        if agreement_id not in self.escrows:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Escrow agreement not found: {agreement_id}")

        escrow = json.loads(self.escrows[agreement_id])
        if escrow["status"] != "CREATED":
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Escrow is already funded or closed: {escrow['status']}")

        caller = normalize_address(str(gl.message.sender_address))
        if caller != escrow["buyer"]:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Only buyer can deposit into escrow")

        amt_int = int(amount)
        if amt_int != int(escrow["total_amount"]):
            raise gl.vm.UserError(
                f"{ERROR_EXPECTED} Deposit must match exact total required: {escrow['total_amount']}"
            )

        # Cross-contract transfer_from to lock funds in this contract
        token_contract = gl.get_contract_at(Address(escrow["token_address"]))
        this_contract = normalize_address(str(gl.message.contract_address))
        token_contract.emit().transfer_from(escrow["buyer"], this_contract, amount)

        escrow["deposited_amount"] = amt_int
        escrow["status"] = "FUNDED"
        self.escrows[agreement_id] = json.dumps(escrow)

    @gl.public.write
    def submit_milestone(
        self,
        agreement_id: str,
        milestone_id: str,
        evidence_hash: str,
        evidence_summary: str,
    ) -> None:
        """
        Seller submits evidence for a completed milestone.
        State transition: Milestone PENDING -> SUBMITTED
        """
        if agreement_id not in self.escrows:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Escrow agreement not found: {agreement_id}")

        escrow = json.loads(self.escrows[agreement_id])
        if escrow["status"] != "FUNDED":
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Escrow must be FUNDED to submit milestone evidence")

        caller = normalize_address(str(gl.message.sender_address))
        if caller != escrow["seller"]:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Only seller can submit milestone evidence")

        found = False
        for m in escrow["milestones"]:
            if m["id"] == milestone_id:
                if m["status"] != "PENDING":
                    raise gl.vm.UserError(f"{ERROR_EXPECTED} Milestone {milestone_id} is already {m['status']}")
                m["status"] = "SUBMITTED"
                m["evidence_hash"] = evidence_hash
                m["evidence_summary"] = evidence_summary
                found = True
                break

        if not found:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Milestone not found: {milestone_id}")

        self.escrows[agreement_id] = json.dumps(escrow)

    @gl.public.write
    def release_milestone(self, agreement_id: str, milestone_id: str) -> None:
        """
        Releases milestone payout to seller upon buyer approval.
        State transition: Milestone SUBMITTED/PENDING -> RELEASED
        """
        if agreement_id not in self.escrows:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Escrow agreement not found: {agreement_id}")

        escrow = json.loads(self.escrows[agreement_id])
        if escrow["status"] != "FUNDED":
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Cannot release in status: {escrow['status']}")

        caller = normalize_address(str(gl.message.sender_address))
        if caller != escrow["buyer"]:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Only buyer can authorize milestone release")

        remaining = int(escrow["deposited_amount"]) - int(escrow["released_amount"]) - int(escrow["refunded_amount"])

        target_milestone = None
        for m in escrow["milestones"]:
            if m["id"] == milestone_id:
                target_milestone = m
                break

        if not target_milestone:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Milestone not found: {milestone_id}")

        if target_milestone["status"] == "RELEASED":
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Milestone already released: {milestone_id}")

        payout_amount = int(target_milestone["amount"])
        if payout_amount > remaining:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Insufficient remaining locked balance for milestone")

        # Cross-contract transfer to seller
        token_contract = gl.get_contract_at(Address(escrow["token_address"]))
        token_contract.emit().transfer(escrow["seller"], u256(payout_amount))

        target_milestone["status"] = "RELEASED"
        escrow["released_amount"] = int(escrow["released_amount"]) + payout_amount

        # Check if all milestones released or balance exhausted
        all_released = all(m["status"] == "RELEASED" for m in escrow["milestones"])
        if all_released or (escrow["released_amount"] + escrow["refunded_amount"] >= escrow["total_amount"]):
            escrow["status"] = "COMPLETED"

        self.escrows[agreement_id] = json.dumps(escrow)

    @gl.public.write
    def open_dispute(self, agreement_id: str, milestone_id: str, dispute_id: str) -> None:
        """
        Freezes escrow milestone funds due to an active dispute.
        State transition: FUNDED -> DISPUTED
        """
        if agreement_id not in self.escrows:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Escrow agreement not found: {agreement_id}")

        escrow = json.loads(self.escrows[agreement_id])
        if escrow["status"] != "FUNDED":
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Cannot open dispute on escrow with status: {escrow['status']}")

        caller = normalize_address(str(gl.message.sender_address))
        if caller != escrow["buyer"] and caller != escrow["seller"]:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Only buyer or seller can open dispute")

        found = False
        for m in escrow["milestones"]:
            if m["id"] == milestone_id:
                if m["status"] == "RELEASED":
                    raise gl.vm.UserError(f"{ERROR_EXPECTED} Cannot dispute already released milestone")
                m["status"] = "DISPUTED"
                found = True
                break

        if not found:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Milestone not found: {milestone_id}")

        escrow["status"] = "DISPUTED"
        escrow["active_dispute_id"] = dispute_id
        escrow["disputed_milestone_id"] = milestone_id
        self.escrows[agreement_id] = json.dumps(escrow)

    @gl.public.write
    def settle_dispute(self, agreement_id: str) -> None:
        """
        Enforces verified GenLayer dispute arbitration decision on locked funds.
        State transition: DISPUTED -> REFUNDED / FUNDED / COMPLETED
        Validates dispute commitment bindings: order_id and terms_hash must match.
        """
        if agreement_id not in self.escrows:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Escrow agreement not found: {agreement_id}")

        escrow = json.loads(self.escrows[agreement_id])
        if escrow["status"] != "DISPUTED":
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Escrow is not in DISPUTED status")

        dispute_id = escrow.get("active_dispute_id", "")
        if not dispute_id:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} No active dispute ID associated with escrow")

        # Synchronously query TradeSureDispute contract state
        dispute_arbiter = gl.get_contract_at(Address(self.dispute_contract_address))
        dispute_data = dispute_arbiter.view().get_dispute(dispute_id)

        # Strict security binding checks
        if str(dispute_data.get("order_id")) != agreement_id:
            raise gl.vm.UserError(
                f"{ERROR_EXPECTED} Dispute order_id ({dispute_data.get('order_id')}) does not match agreement"
            )

        if str(dispute_data.get("agreement_hash")) != str(escrow["terms_hash"]):
            raise gl.vm.UserError(
                f"{ERROR_EXPECTED} Dispute agreement_hash mismatch with escrow terms"
            )

        resolution = dispute_arbiter.view().get_resolution(dispute_id)
        outcome = str(resolution.get("outcome", "")).strip().upper()

        remaining = int(escrow["deposited_amount"]) - int(escrow["released_amount"]) - int(escrow["refunded_amount"])
        token_contract = gl.get_contract_at(Address(escrow["token_address"]))

        disputed_m_id = escrow.get("disputed_milestone_id", "")
        target_m = None
        for m in escrow["milestones"]:
            if m["id"] == disputed_m_id:
                target_m = m
                break

        m_amount = int(target_m["amount"]) if target_m else remaining
        disputed_amount = min(m_amount, remaining)

        if outcome == "BUYER_SUPPORTED":
            # Contractual breach / non-delivery: refund disputed milestone (or remaining balance) to buyer
            refund_amount = disputed_amount
            token_contract.emit().transfer(escrow["buyer"], u256(refund_amount))
            escrow["refunded_amount"] = int(escrow["refunded_amount"]) + refund_amount
            if target_m:
                target_m["status"] = "REFUNDED"

            if (escrow["released_amount"] + escrow["refunded_amount"]) >= escrow["total_amount"]:
                escrow["status"] = "REFUNDED"
            else:
                escrow["status"] = "FUNDED"

        elif outcome == "SELLER_SUPPORTED":
            # Fulfillment proved: release disputed milestone amount to seller
            payout = disputed_amount
            token_contract.emit().transfer(escrow["seller"], u256(payout))
            escrow["released_amount"] = int(escrow["released_amount"]) + payout
            if target_m:
                target_m["status"] = "RELEASED"

            if (escrow["released_amount"] + escrow["refunded_amount"]) >= escrow["total_amount"]:
                escrow["status"] = "COMPLETED"
            else:
                escrow["status"] = "FUNDED"

        elif outcome == "INCONCLUSIVE":
            # Inconclusive proof: 50/50 equitable split of disputed amount
            buyer_share = disputed_amount // 2
            seller_share = disputed_amount - buyer_share

            if buyer_share > 0:
                token_contract.emit().transfer(escrow["buyer"], u256(buyer_share))
            if seller_share > 0:
                token_contract.emit().transfer(escrow["seller"], u256(seller_share))

            escrow["refunded_amount"] = int(escrow["refunded_amount"]) + buyer_share
            escrow["released_amount"] = int(escrow["released_amount"]) + seller_share

            if target_m:
                target_m["status"] = "SETTLED_INCONCLUSIVE"

            if (escrow["released_amount"] + escrow["refunded_amount"]) >= escrow["total_amount"]:
                escrow["status"] = "COMPLETED"
            else:
                escrow["status"] = "FUNDED"

        else:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Unrecognized dispute outcome: {outcome}")

        # Clear active dispute pointer
        escrow["active_dispute_id"] = ""
        escrow["disputed_milestone_id"] = ""
        escrow["last_settlement"] = {
            "dispute_id": dispute_id,
            "outcome": outcome,
            "rationale": resolution.get("rationale", ""),
        }

        self.escrows[agreement_id] = json.dumps(escrow)

    @gl.public.write
    def refund_buyer(self, agreement_id: str) -> None:
        """
        Voluntary cancellation/refund authorized by seller, or buyer cancellation prior to funding.
        Transfers all remaining locked balance back to buyer.
        """
        if agreement_id not in self.escrows:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Escrow agreement not found: {agreement_id}")

        escrow = json.loads(self.escrows[agreement_id])
        if escrow["status"] != "FUNDED":
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Can only refund when FUNDED and not disputed")

        caller = normalize_address(str(gl.message.sender_address))
        if caller != escrow["seller"] and caller != normalize_address(str(self.owner)):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Only seller or contract owner can initiate voluntary refund")

        remaining = int(escrow["deposited_amount"]) - int(escrow["released_amount"]) - int(escrow["refunded_amount"])
        if remaining <= 0:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} No remaining balance to refund")

        token_contract = gl.get_contract_at(Address(escrow["token_address"]))
        token_contract.emit().transfer(escrow["buyer"], u256(remaining))

        escrow["refunded_amount"] = int(escrow["refunded_amount"]) + remaining
        escrow["status"] = "REFUNDED"
        for m in escrow["milestones"]:
            if m["status"] != "RELEASED":
                m["status"] = "REFUNDED"

        self.escrows[agreement_id] = json.dumps(escrow)
