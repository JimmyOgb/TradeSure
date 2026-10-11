import json
import pytest

def test_contract_deployment_and_registration(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/tradesure_dispute.py")
    direct_vm.sender = direct_alice

    # Verify owner
    assert str(contract.get_owner()).lower() == str(direct_alice).lower()
    assert contract.get_total_disputes() == 0

    # Register dispute as buyer
    manifest = json.dumps([
        {"id": "ev-01", "type": "carrier_tracking", "sha256": "0xabc12345678901234567", "summary": "Delivered to front door"}
    ])
    
    contract.register_dispute(
        "disp-1001",
        "ord-501",
        str(direct_alice),
        str(direct_bob),
        "0xagreementhash1234567890",
        "Electronics in original packaging, 3-day return policy",
        "Item arrived with cracked screen",
        manifest
    )

    assert contract.get_total_disputes() == 1
    dispute = contract.get_dispute("disp-1001")
    assert dispute["order_id"] == "ord-501"
    assert dispute["status"] == "DISPUTE_OPEN"


def test_dispute_registration_authorization_and_validations(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = direct_deploy("contracts/tradesure_dispute.py")
    
    # Missing mandatory parameters
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("[EXPECTED] Missing mandatory dispute fields"):
        contract.register_dispute("", "ord-1", str(direct_alice), str(direct_bob), "0xhash123456789012", "terms", "claim", "[]")

    # Unauthorized party (Charlie is neither owner, buyer, nor seller)
    with direct_vm.prank(direct_charlie):
        with direct_vm.expect_revert("[EXPECTED] Unauthorized dispute registrant:"):
            contract.register_dispute("disp-1", "ord-1", str(direct_alice), str(direct_bob), "0xhash123456789012", "terms", "claim", "[]")

    # Invalid short agreement hash
    with direct_vm.expect_revert("[EXPECTED] Invalid agreement hash commitment"):
        contract.register_dispute("disp-1", "ord-1", str(direct_alice), str(direct_bob), "short", "terms", "claim", "[]")

    # Malformed manifest
    with direct_vm.expect_revert("[EXPECTED] Evidence manifest is not valid JSON"):
        contract.register_dispute("disp-1", "ord-1", str(direct_alice), str(direct_bob), "0xhash123456789012", "terms", "claim", "{invalid}")

    # Register valid dispute
    contract.register_dispute("disp-1", "ord-1", str(direct_alice), str(direct_bob), "0xhash123456789012", "terms", "claim", "[]")
    
    # Duplicate registration
    with direct_vm.expect_revert("[EXPECTED] Dispute already registered: disp-1"):
        contract.register_dispute("disp-1", "ord-1", str(direct_alice), str(direct_bob), "0xhash123456789012", "terms", "claim", "[]")


def test_resolve_dispute_buyer_supported(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/tradesure_dispute.py")
    direct_vm.sender = direct_alice

    evidence_manifest = json.dumps([
        {
            "id": "EV-PHOTO-DAMAGED",
            "type": "product_condition_photo",
            "sha256": "4a7d1234567890abcdef1234567890",
            "description": "High-resolution photo showing completely cracked screen upon unboxing",
            "timestamp": "2026-10-10T12:00:00Z"
        }
    ])

    contract.register_dispute(
        "disp-buyer-win",
        "ord-701",
        str(direct_alice),
        str(direct_bob),
        "0xtermscommitment1234567890",
        "Condition: Brand New, undamaged screen required. Delivery within 5 days.",
        "Buyer claims phone arrived severely cracked on delivery. Seller claims carrier fault.",
        evidence_manifest
    )

    mock_llm_response = {
        "outcome": "BUYER_SUPPORTED",
        "rationale": "Evidence shows verified photo of cracked screen upon delivery, violating agreed Brand New condition.",
        "evidence_cited": ["EV-PHOTO-DAMAGED"],
        "limitations": "Carrier transit log not submitted by seller to counter breach of delivery condition.",
        "criteria_applied": "Product condition requirement (Brand New, undamaged)"
    }
    
    direct_vm.mock_llm(
        r".*TradeSure Commerce Dispute Arbiter.*",
        json.dumps(mock_llm_response)
    )

    contract.resolve_dispute("disp-buyer-win")

    resolution = contract.get_resolution("disp-buyer-win")
    assert resolution["outcome"] == "BUYER_SUPPORTED"
    assert "EV-PHOTO-DAMAGED" in resolution["evidence_cited"]
    assert "cracked screen" in resolution["rationale"]

    dispute = contract.get_dispute("disp-buyer-win")
    assert dispute["status"] == "RESOLVED"

    with direct_vm.expect_revert("[EXPECTED] Dispute is already resolved: disp-buyer-win"):
        contract.resolve_dispute("disp-buyer-win")


def test_resolve_dispute_seller_supported(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/tradesure_dispute.py")
    direct_vm.sender = direct_alice

    evidence_manifest = json.dumps([
        {
            "id": "EV-CARRIER-SIGNATURE",
            "type": "delivery_confirmation",
            "sha256": "8f3b1234567890abcdef1234567890",
            "description": "Carrier signature and GPS coordinates matching buyer delivery address",
            "timestamp": "2026-10-09T14:30:00Z"
        }
    ])

    contract.register_dispute(
        "disp-seller-win",
        "ord-702",
        str(direct_alice),
        str(direct_bob),
        "0xtermscommitment1234567890",
        "Delivery to registered address constitutes full fulfillment.",
        "Buyer claims non-receipt. Seller provides carrier proof of delivery with buyer signature.",
        evidence_manifest
    )

    mock_llm_response = {
        "outcome": "SELLER_SUPPORTED",
        "rationale": "Seller provided verified carrier signature matching delivery terms; buyer did not submit evidence of non-delivery.",
        "evidence_cited": ["EV-CARRIER-SIGNATURE"],
        "limitations": "None identified.",
        "criteria_applied": "Proof of delivery terms"
    }

    direct_vm.mock_llm(
        r".*TradeSure Commerce Dispute Arbiter.*",
        json.dumps(mock_llm_response)
    )

    contract.resolve_dispute("disp-seller-win")

    resolution = contract.get_resolution("disp-seller-win")
    assert resolution["outcome"] == "SELLER_SUPPORTED"
    assert "EV-CARRIER-SIGNATURE" in resolution["evidence_cited"]


def test_resolve_dispute_inconclusive(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/tradesure_dispute.py")
    direct_vm.sender = direct_alice

    contract.register_dispute(
        "disp-inconclusive",
        "ord-703",
        str(direct_alice),
        str(direct_bob),
        "0xtermscommitment1234567890",
        "Specification: Vintage watch authenticity guarantee.",
        "Conflicting unofficial appraisals from non-certified third parties.",
        "[]"
    )

    mock_llm_response = {
        "outcome": "INCONCLUSIVE",
        "rationale": "Both parties submitted informal, unverified notes without accredited laboratory certification required in terms.",
        "evidence_cited": [],
        "limitations": "Lacks certified laboratory inspection report.",
        "criteria_applied": "Authenticity verification standard"
    }

    direct_vm.mock_llm(
        r".*TradeSure Commerce Dispute Arbiter.*",
        json.dumps(mock_llm_response)
    )

    contract.resolve_dispute("disp-inconclusive")

    resolution = contract.get_resolution("disp-inconclusive")
    assert resolution["outcome"] == "INCONCLUSIVE"
