from fastapi import FastAPI, APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import secrets
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import io
import csv
import httpx
import asyncio
import smtplib
import socket
import time
import concurrent.futures
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Configure logging early (so startup/config warnings are visible)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# MongoDB connection (initialized on startup to avoid crashing on import)
mongo_url = os.getenv("MONGO_URL")
db_name = os.getenv("DB_NAME")
client: Optional[AsyncIOMotorClient] = None
db = None

# Kit (ConvertKit) API configuration
KIT_API_KEY = os.getenv("KIT_API_KEY")
KIT_FORM_ID = os.getenv("KIT_FORM_ID")
KIT_TAG_ID = os.getenv("KIT_TAG_ID")  # Staging tag for creating subscribers with fields
KIT_API_URL = "https://api.convertkit.com/v3"

# SMTP configuration for sending results emails
# Credentials must be set in Railway environment variables
ERIC_EMAIL = (os.getenv("ERIC_EMAIL") or "").strip()
ERIC_EMAIL_PASSWORD = (os.getenv("ERIC_EMAIL_PASSWORD") or "").strip()
SMTP_SERVER = "outbound-us1.ppe-hosted.com"
SMTP_PORT = 587


# Squarespace shop products, keyed by the quiz's internal area IDs
SHOP_BASE_URL = "https://www.cleanlegalbillofhealth.com"
BUNDLE_PRODUCT_URL = f"{SHOP_BASE_URL}/shop/p/6-pillars-bundle"
PILLAR_PRODUCTS = {
    "contracts": {"pillar": 1, "url": f"{SHOP_BASE_URL}/shop/p/pillar-1-checklist-customer-contracts-project-risks"},
    "ownership": {"pillar": 2, "url": f"{SHOP_BASE_URL}/shop/p/pillar-2-checklist-ownership-governance"},
    "subcontractor": {"pillar": 3, "url": f"{SHOP_BASE_URL}/shop/p/pillar-3-checklist-vendor-risk"},
    "employment": {"pillar": 4, "url": f"{SHOP_BASE_URL}/shop/p/pillar-4-checklist-employment-safety-compliance"},
    "insurance": {"pillar": 5, "url": f"{SHOP_BASE_URL}/shop/p/pillar-5-checklist-insurance-claims-readiness"},
    "systems": {"pillar": 6, "url": f"{SHOP_BASE_URL}/shop/p/pillar-6-checklist-systems-records-digital-risk"},
}


def email_shop_url(url: str, content: str) -> str:
    """Add UTM tags so email-driven purchases show up in analytics."""
    return f"{url}?utm_source=quiz&utm_medium=email&utm_campaign=clbh&utm_content={content}"


def send_results_email(
    to_email: str,
    first_name: str,
    risk_level: str,
    score: str,
    red_risks: List[Dict[str, str]],
    yellow_risks: List[Dict[str, str]],
    green_risks: List[Dict[str, str]],
    area_scores: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """
    Send assessment results email via SMTP.
    Each risk is a dict with 'title' and 'description' keys.
    Returns success status. Errors are logged but don't break the flow.
    """
    logger.info("=" * 50)
    logger.info("SENDING RESULTS EMAIL VIA SMTP")
    logger.info("=" * 50)
    logger.info(f"To: {to_email}")
    logger.info(f"First Name: {first_name}")
    logger.info(f"Risk Level: {risk_level}")
    logger.info(f"Score: {score}")
    logger.info(f"Red Risks: {len(red_risks)}, Yellow: {len(yellow_risks)}, Green: {len(green_risks)}")

    # Check if SMTP is configured (must have non-empty values)
    if not ERIC_EMAIL or not ERIC_EMAIL_PASSWORD or len(ERIC_EMAIL.strip()) == 0 or len(ERIC_EMAIL_PASSWORD.strip()) == 0:
        logger.warning("SMTP credentials not configured - skipping email send")
        return {"success": False, "error": "SMTP credentials not configured"}

    # Determine risk level colors and display text
    if risk_level == "red":
        risk_bg = "#FEF2F2"
        risk_color = "#DC2626"
        risk_label = "FIX NOW"
    elif risk_level == "yellow":
        risk_bg = "#FFFBEB"
        risk_color = "#D97706"
        risk_label = "WORTH A LOOK"
    else:  # green
        risk_bg = "#F0FDF4"
        risk_color = "#16A34A"
        risk_label = "HEALTHY"

    # Build risk section HTML using tables for email compatibility
    def build_risk_section(section_title: str, risks: List[Dict[str, str]], header_color: str, bg_color: str) -> str:
        if not risks:
            return ""

        items_html = ""
        for risk in risks:
            title = risk.get('title', '')
            desc = risk.get('description', '')
            area_name = risk.get('area_name', '')
            area_html = f'<span style="font-size:11px;font-style:italic;color:{header_color};display:block;margin-top:4px;">{area_name}</span>' if area_name else ''
            items_html += f'''<tr>
<td style="padding:8px 0;border-bottom:1px solid #f0f0f0;word-break:normal;white-space:normal;">
<span style="font-size:14px;font-weight:600;color:#333;display:block;margin-bottom:4px;">{title}</span>
<span style="font-size:13px;color:#666;display:block;">{desc}</span>
{area_html}
</td>
</tr>'''

        return f'''<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
<tr>
<td style="background:{bg_color};border-radius:8px;padding:16px;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td style="padding-bottom:12px;">
<span style="display:inline-block;background:{header_color};color:#ffffff;font-size:12px;font-weight:700;padding:6px 14px;border-radius:4px;text-transform:uppercase;">{section_title}</span>
</td>
</tr>
{items_html}
</table>
</td>
</tr>
</table>'''

    red_section = build_risk_section("Fix now", red_risks, "#DC2626", "#FEF2F2")
    yellow_section = build_risk_section("Worth a look", yellow_risks, "#D97706", "#FFFBEB")
    green_section = build_risk_section("Healthy", green_risks, "#16A34A", "#F0FDF4")

    risk_sections = red_section + yellow_section + green_section
    if not risk_sections:
        risk_sections = '<p style="font-size:14px;color:#888;">No risk areas identified.</p>'

    # ----- "Fix What This Quiz Found" section: pillar checklist CTAs -----
    # Uses the same pillar-level Red/Yellow/Green scores as the results page,
    # so the email and the web dashboard always agree.
    red_area_ids: List[str] = []
    weak_area_ids: List[str] = []
    area_display_names: Dict[str, str] = {}

    if area_scores:
        # Authoritative: area risk_level decides the label (red first, worst score first)
        sorted_areas = sorted(
            [a for a in area_scores if a.get("risk_level") in ("red", "yellow")],
            key=lambda a: (0 if a.get("risk_level") == "red" else 1, a.get("score", 0)),
        )
        for a in sorted_areas:
            aid = a.get("area_id")
            if aid in PILLAR_PRODUCTS and aid not in weak_area_ids:
                weak_area_ids.append(aid)
                area_display_names[aid] = a.get("area_name", aid)
                if a.get("risk_level") == "red":
                    red_area_ids.append(aid)
    else:
        # Fallback for older assessments without stored area_scores:
        # derive from flagged questions (red first, then yellow)
        for risk in red_risks:
            aid = risk.get("area")
            if aid in PILLAR_PRODUCTS and aid not in red_area_ids:
                red_area_ids.append(aid)
        weak_area_ids = list(red_area_ids)
        for risk in yellow_risks:
            aid = risk.get("area")
            if aid in PILLAR_PRODUCTS and aid not in weak_area_ids:
                weak_area_ids.append(aid)
        for risk in list(red_risks) + list(yellow_risks):
            aid = risk.get("area")
            if aid and aid not in area_display_names:
                area_display_names[aid] = risk.get("area_name", aid)

    fix_it_rows = ""
    for aid in weak_area_ids:
        product = PILLAR_PRODUCTS[aid]
        is_red = aid in red_area_ids
        border_color = "#FECACA" if is_red else "#FDE68A"
        tag_color = "#DC2626" if is_red else "#D97706"
        tag_text = "Fix now: start here" if is_red else "Worth a look: close these gaps soon"
        product_link = email_shop_url(product["url"], f"pillar-{product['pillar']}")
        fix_it_rows += f'''<table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:2px solid {border_color};border-radius:8px;margin-bottom:10px;">
<tr>
<td style="padding:14px 16px;">
<span style="font-size:14px;font-weight:600;color:#333;display:block;margin-bottom:2px;word-break:normal;white-space:normal;">{area_display_names.get(aid, aid)}</span>
<span style="font-size:12px;font-weight:600;color:{tag_color};display:block;margin-bottom:10px;word-break:normal;white-space:normal;">{tag_text}</span>
<a href="{product_link}" style="display:inline-block;background:#1e2d4a;color:#ffffff;font-size:14px;font-weight:600;padding:10px 20px;border-radius:6px;text-decoration:none;word-break:normal;white-space:nowrap;">Get the Pillar {product["pillar"]} Checklist ($67) &rarr;</a>
</td>
</tr>
</table>'''

    if weak_area_ids:
        bundle_block = ""
        if len(weak_area_ids) >= 3:
            bundle_link = email_shop_url(BUNDLE_PRODUCT_URL, "bundle-email")
            bundle_block = f'''<table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF7ED;border:2px solid #FDBA74;border-radius:8px;margin-bottom:12px;">
<tr>
<td style="padding:16px;">
<span style="font-size:15px;font-weight:700;color:#333;display:block;margin-bottom:4px;word-break:normal;white-space:normal;">{len(weak_area_ids)} of your 6 pillars need work. Get all 6 checklists and save.</span>
<span style="font-size:13px;color:#555;display:block;margin-bottom:12px;word-break:normal;white-space:normal;">The 6 Pillar Bundle covers every area of your business for $299 instead of $402 when purchased separately.</span>
<a href="{bundle_link}" style="display:inline-block;background:#F97316;color:#ffffff;font-size:14px;font-weight:600;padding:12px 24px;border-radius:6px;text-decoration:none;word-break:normal;white-space:nowrap;">Get the Complete Bundle ($299)</a>
</td>
</tr>
</table>'''
        fix_it_section = f'''<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
<tr>
<td style="font-size:16px;font-weight:700;color:#1e2d4a;padding-bottom:6px;word-break:normal;white-space:normal;">Your Next Step: Fix What This Quiz Found</td>
</tr>
<tr>
<td style="font-size:13px;color:#555;padding-bottom:14px;word-break:normal;white-space:normal;">Each pillar below has a step-by-step self-assessment checklist that shows you exactly what to fix and how, in plain English. Start with your weakest pillar.</td>
</tr>
<tr>
<td>
{bundle_block}
{fix_it_rows}
</td>
</tr>
</table>'''
    else:
        # All green: position the bundle as an annual self-checkup
        bundle_link = email_shop_url(BUNDLE_PRODUCT_URL, "bundle-email-green")
        fix_it_section = f'''<table width="100%" cellpadding="0" cellspacing="0" style="background:#F0FDF4;border:2px solid #BBF7D0;border-radius:8px;margin-bottom:24px;">
<tr>
<td style="padding:16px;text-align:center;">
<span style="font-size:15px;font-weight:700;color:#333;display:block;margin-bottom:4px;word-break:normal;white-space:normal;">Strong score. Keep it that way.</span>
<span style="font-size:13px;color:#555;display:block;margin-bottom:12px;word-break:normal;white-space:normal;">Laws and businesses both change. The 6 Pillar Checklist Bundle gives you a repeatable annual checkup you can run yourself, for $299.</span>
<a href="{bundle_link}" style="display:inline-block;background:#1e2d4a;color:#ffffff;font-size:14px;font-weight:600;padding:12px 24px;border-radius:6px;text-decoration:none;word-break:normal;white-space:nowrap;">Get the Bundle ($299)</a>
</td>
</tr>
</table>'''

    shop_cta_link = email_shop_url(f"{SHOP_BASE_URL}/shop", "email-shop")

    # Build the HTML email using tables for mobile compatibility
    html_body = f'''<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;">
<tr>
<td align="center" style="padding:20px;">
<table cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">

<!-- Header -->
<tr>
<td style="background:#1e2d4a;padding:24px 32px;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td style="color:#ffffff;font-size:22px;font-weight:600;word-break:normal;white-space:normal;">Jeppson Law, LLP</td>
</tr>
<tr>
<td style="color:#a0b0c8;font-size:13px;padding-top:4px;word-break:normal;white-space:normal;">Preventive Business Law</td>
</tr>
</table>
</td>
</tr>

<!-- Body -->
<tr>
<td style="padding:32px;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td style="font-size:16px;color:#333;padding-bottom:8px;word-break:normal;white-space:normal;">Hi {first_name or "there"},</td>
</tr>
<tr>
<td style="font-size:15px;color:#555;padding-bottom:24px;word-break:normal;white-space:normal;">Thank you for completing the Clean Legal Bill of Health Assessment. Here are your personalized results.</td>
</tr>
</table>

<!-- Results Box -->
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fb;border-radius:8px;border:1px solid #e2e8f0;margin-bottom:24px;">
<tr>
<td style="padding:24px;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td style="font-size:13px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:1px;padding-bottom:16px;word-break:normal;white-space:normal;">Your Results</td>
</tr>
</table>

<!-- Risk Level Card -->
<table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;border:1px solid #e2e8f0;margin-bottom:12px;">
<tr>
<td style="padding:16px;text-align:center;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td style="font-size:12px;color:#888;text-transform:uppercase;padding-bottom:8px;word-break:normal;white-space:normal;">Risk Level</td>
</tr>
<tr>
<td align="center">
<span style="display:inline-block;background:{risk_bg};color:{risk_color};font-size:14px;font-weight:700;padding:8px 20px;border-radius:20px;word-break:normal;white-space:nowrap;">{risk_label}</span>
</td>
</tr>
</table>
</td>
</tr>
</table>

<!-- Score Card -->
<table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;border:1px solid #e2e8f0;margin-bottom:16px;">
<tr>
<td style="padding:16px;text-align:center;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td style="font-size:12px;color:#888;text-transform:uppercase;padding-bottom:8px;word-break:normal;white-space:normal;">Overall Score</td>
</tr>
<tr>
<td style="font-size:28px;font-weight:700;color:#1e2d4a;word-break:normal;white-space:normal;">{score}</td>
</tr>
</table>
</td>
</tr>
</table>

<!-- Risk Areas -->
<table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;border:1px solid #e2e8f0;">
<tr>
<td style="padding:16px;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td style="font-size:13px;font-weight:600;color:#1e2d4a;padding-bottom:16px;word-break:normal;white-space:normal;">Your Risk Areas</td>
</tr>
<tr>
<td>
{risk_sections}
</td>
</tr>
</table>
</td>
</tr>
</table>

</td>
</tr>
</table>

<!-- Message -->
<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td style="font-size:15px;color:#555;padding-bottom:24px;word-break:normal;white-space:normal;">These are areas where your business may have legal exposure that could cost you significantly if left unaddressed. The good news? Most of these risks can be resolved quickly with the right legal foundation in place.</td>
</tr>
</table>

<!-- Fix What This Quiz Found -->
{fix_it_section}

<!-- CTA Buttons -->
<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td align="center" style="padding-bottom:12px;">
<a href="https://jeppsonlaw.cliogrow.com/book/5d7625ad3292b0e84db81965f80ee5f4"
style="display:inline-block;background:#F97316;color:#ffffff;font-size:16px;font-weight:600;padding:14px 32px;border-radius:8px;text-decoration:none;word-break:normal;white-space:nowrap;"><img src="https://checkup.cleanlegalbillofhealth.com/email-calendar.png" width="18" height="18" alt="" style="vertical-align:middle;margin-right:8px;border:0;"><span style="vertical-align:middle;">Schedule Your Free Legal Risk Review</span></a>
</td>
</tr>
<tr>
<td align="center" style="padding-bottom:24px;">
<a href="{shop_cta_link}"
style="display:inline-block;background:#1e2d4a;color:#ffffff;font-size:16px;font-weight:600;padding:14px 32px;border-radius:8px;text-decoration:none;word-break:normal;white-space:nowrap;"><img src="https://checkup.cleanlegalbillofhealth.com/email-cart.png" width="18" height="18" alt="" style="vertical-align:middle;margin-right:8px;border:0;"><span style="vertical-align:middle;">Purchase a Checklist</span></a>
</td>
</tr>
</table>

<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td style="font-size:14px;color:#888;word-break:normal;white-space:normal;">No obligation. We will walk you through exactly what these results mean for your business and what steps make sense next.</td>
</tr>
</table>

</td>
</tr>

<!-- Footer -->
<tr>
<td style="background:#1e2d4a;padding:20px 32px;text-align:center;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td style="color:#a0b0c8;font-size:13px;padding-bottom:4px;word-break:normal;white-space:normal;">Eric Jeppson | Jeppson Law, LLP</td>
</tr>
<tr>
<td style="color:#6a7f9a;font-size:12px;padding-bottom:4px;word-break:normal;white-space:normal;">2999 Douglas Blvd Suite 180, Roseville, CA 95661</td>
</tr>
<tr>
<td style="color:#6a7f9a;font-size:12px;word-break:normal;white-space:normal;">jeppsonlaw.com</td>
</tr>
</table>
</td>
</tr>

</table>
</td>
</tr>
</table>
</body>
</html>'''

    # Create the email message
    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Your Legal Risk Assessment Results"
    msg["From"] = f"Eric Jeppson | Jeppson Law <{ERIC_EMAIL}>"
    msg["To"] = to_email

    # Attach HTML body
    msg.attach(MIMEText(html_body, "html"))

    # Retry logic: up to 3 attempts with 5 second wait between retries
    max_retries = 3
    last_error = None

    for attempt in range(1, max_retries + 1):
        try:
            logger.info(f"SMTP attempt {attempt}/{max_retries}: Connecting to {SMTP_SERVER}:{SMTP_PORT}...")
            with smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=30) as server:
                server.starttls()
                logger.info(f"Attempt {attempt}: STARTTLS enabled, logging in...")
                server.login(ERIC_EMAIL, ERIC_EMAIL_PASSWORD)
                logger.info(f"Attempt {attempt}: Login successful, sending email...")
                server.sendmail(ERIC_EMAIL, to_email, msg.as_string())
                logger.info(f"EMAIL SENT SUCCESSFULLY on attempt {attempt}!")
                return {"success": True}

        except (socket.timeout, OSError) as e:
            last_error = f"Connection timed out: {str(e)}"
            logger.warning(f"SMTP Timeout on attempt {attempt}/{max_retries}: {str(e)}")
            if attempt < max_retries:
                logger.info(f"Waiting 5 seconds before retry {attempt + 1}...")
                time.sleep(5)
        except smtplib.SMTPAuthenticationError as e:
            logger.error(f"SMTP Authentication Error (attempt {attempt}): {str(e)}")
            return {"success": False, "error": f"Authentication failed: {str(e)}"}
        except smtplib.SMTPException as e:
            last_error = f"SMTP error: {str(e)}"
            logger.warning(f"SMTP Error on attempt {attempt}/{max_retries}: {str(e)}")
            if attempt < max_retries:
                logger.info(f"Waiting 5 seconds before retry {attempt + 1}...")
                time.sleep(5)
        except Exception as e:
            logger.error(f"Email Error (attempt {attempt}): {str(e)}")
            logger.exception("Full traceback:")
            return {"success": False, "error": f"Unexpected error: {str(e)}"}

    # All retries exhausted
    logger.error(f"EMAIL FAILED after {max_retries} attempts. Last error: {last_error}")
    return {"success": False, "error": f"Failed after {max_retries} attempts: {last_error}"}

def send_intake_email(
    first_name: str,
    last_name: str,
    email: str,
    risk_level: str,
    score: str,
    area_scores: List[Dict[str, Any]],
    profile: Dict[str, Any],
) -> Dict[str, Any]:
    """Send Eric a plain-text audit prep summary for a completed checkup."""
    if not ERIC_EMAIL or not ERIC_EMAIL_PASSWORD:
        return {"success": False, "error": "SMTP credentials not configured"}

    labels = profile_labels(profile)
    level_words = {"green": "Healthy", "yellow": "Worth a look", "red": "Fix now"}
    name = f"{first_name} {last_name}".strip() or email
    lines = [
        f"{name} finished the CLBH checkup.",
        f"Email: {email}",
        "",
        f"Overall: {level_words.get(risk_level, risk_level)} ({score})",
        "",
        "Pillars:",
    ]
    for a in area_scores or []:
        lines.append(
            f"  {a.get('area_name', '')}: {level_words.get(a.get('risk_level', ''), '')} "
            f"({a.get('score', 0)}/{a.get('max_score', 6)})"
        )
    if labels:
        tier = audit_tier(profile.get("revenue", ""))
        lines += [
            "",
            "About the business:",
            f"  Industry: {labels.get('industry') or 'Not answered'}",
            f"  Revenue: {labels.get('revenue') or 'Not answered'}" + (f" (audit tier {tier})" if tier else ""),
            f"  Team: {labels.get('team') or 'Not answered'}",
            f"  Ownership: {labels.get('ownership') or 'Not answered'}",
            "",
            f"Documents on hand: {labels.get('documents_on_hand') or 'None checked'}",
            f"Not on hand: {labels.get('documents_missing') or 'None'}",
            "",
            f"Keeps them up at night: {labels.get('concern') or 'Left blank'}",
        ]

    msg = MIMEText("\n".join(lines), "plain")
    msg["Subject"] = f"Checkup completed: {name}"
    msg["From"] = f"CLBH Checkup <{ERIC_EMAIL}>"
    msg["To"] = ERIC_EMAIL

    for attempt in range(1, 4):
        try:
            with smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=30) as server:
                server.starttls()
                server.login(ERIC_EMAIL, ERIC_EMAIL_PASSWORD)
                server.sendmail(ERIC_EMAIL, ERIC_EMAIL, msg.as_string())
                logger.info("Intake email sent to Eric")
                return {"success": True}
        except smtplib.SMTPAuthenticationError as e:
            return {"success": False, "error": f"Authentication failed: {e}"}
        except Exception as e:
            logger.warning(f"Intake email attempt {attempt} failed: {e}")
            if attempt < 3:
                time.sleep(5)
    return {"success": False, "error": "Intake email failed after 3 attempts"}


async def subscribe_to_kit(
    email: str,
    first_name: str = "",
    last_name: str = "",
    risk_level: str = "",
    score: str = "",
    top_risks: str = "",
    extra_fields: Optional[Dict[str, str]] = None
) -> Dict[str, Any]:
    """
    Subscribe a user to Kit (ConvertKit) for marketing list purposes.
    Uses a single API call to the form subscribe endpoint.
    Note: Email is now sent via SMTP, so Kit is just for list building.
    """
    logger.info("=" * 50)
    logger.info("KIT API - FORM SUBSCRIPTION FOR MARKETING LIST")
    logger.info("=" * 50)

    # Check if Kit is configured
    if not KIT_API_KEY:
        logger.error("KIT_API_KEY environment variable is not set!")
        return {"success": False, "error": "KIT_API_KEY not configured"}

    if not KIT_FORM_ID:
        logger.error("KIT_FORM_ID environment variable is not set!")
        return {"success": False, "error": "KIT_FORM_ID not configured"}

    # Log all fields being sent
    logger.info(f"  email: '{email}'")
    logger.info(f"  first_name: '{first_name}'")
    logger.info(f"  last_name: '{last_name}'")
    logger.info(f"  fields.risk_level: '{risk_level}'")
    logger.info(f"  fields.score: '{score}'")
    logger.info(f"  fields.top_risks: '{top_risks}'")

    try:
        async with httpx.AsyncClient() as client:
            # Single API call to subscribe to form with all fields
            payload = {
                "api_secret": KIT_API_KEY,
                "email": email,
                "first_name": first_name,
                "fields": {
                    "last_name": last_name,
                    "risk_level": risk_level,
                    "score": score,
                    "top_risks": top_risks,
                    **{k: v for k, v in (extra_fields or {}).items() if v}
                }
            }

            url = f"{KIT_API_URL}/forms/{KIT_FORM_ID}/subscribe"
            logger.info(f"POST {url}")

            response = await client.post(
                url,
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=15.0
            )

            logger.info(f"Kit Response Status: {response.status_code}")

            try:
                response_data = response.json()
                logger.info(f"Kit Response: {response_data}")
            except Exception:
                response_data = {"raw_response": response.text}

            if response.status_code == 200:
                logger.info("SUCCESS: Subscriber added to Kit form!")
                return {"success": True, "data": response_data}
            else:
                logger.error(f"FAILED: Kit API returned status {response.status_code}")
                return {"success": False, "status_code": response.status_code, "error": response_data}

    except httpx.TimeoutException as e:
        logger.error(f"Kit API Timeout: {str(e)}")
        return {"success": False, "error": f"Timeout: {str(e)}"}
    except httpx.RequestError as e:
        logger.error(f"Kit API Request Error: {str(e)}")
        return {"success": False, "error": f"Request error: {str(e)}"}
    except Exception as e:
        logger.error(f"Kit API Unexpected Error: {str(e)}")
        logger.exception("Full traceback:")
        return {"success": False, "error": f"Unexpected error: {str(e)}"}


def require_db():
    """Return the configured Mongo DB handle or raise a clear error."""
    if db is None:
        raise HTTPException(
            status_code=503,
            detail="Database is not configured (missing MONGO_URL/DB_NAME).",
        )
    return db

def test_smtp_connection() -> Dict[str, Any]:
    """Test SMTP connection and return status."""
    result = {
        "server": SMTP_SERVER,
        "port": SMTP_PORT,
        "username": ERIC_EMAIL,
        "password_set": bool(ERIC_EMAIL_PASSWORD),
    }

    if not ERIC_EMAIL or not ERIC_EMAIL_PASSWORD:
        result["success"] = False
        result["error"] = "SMTP credentials not configured"
        return result

    try:
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=15) as server:
            server.starttls()
            server.login(ERIC_EMAIL, ERIC_EMAIL_PASSWORD)
            result["success"] = True
            return result
    except smtplib.SMTPAuthenticationError as e:
        result["success"] = False
        result["error"] = f"Authentication failed: {str(e)}"
        return result
    except Exception as e:
        result["success"] = False
        result["error"] = f"SMTP error: {str(e)}"
        return result


def require_admin(request: Request) -> None:
    """
    Minimal admin protection for MVP.

    If ADMIN_KEY is set, callers must supply it via:
    - Header: X-Admin-Key
    - OR query param: admin_key
    """
    admin_key = os.getenv("ADMIN_KEY")
    if not admin_key:
        # Fail closed: without an ADMIN_KEY the admin area stays locked.
        raise HTTPException(status_code=503, detail="Admin access is not configured")

    provided = request.headers.get("X-Admin-Key") or request.query_params.get("admin_key")
    if not provided or not secrets.compare_digest(provided, admin_key):
        raise HTTPException(status_code=401, detail="Unauthorized")

# Create the main app
app = FastAPI()

# Configure CORS - must be added before routes
cors_origins = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# ----- MODELS -----

class Question(BaseModel):
    id: str
    text: str
    options: List[Dict[str, Any]]  # {value: str, label: str, points: int, trigger_flag: bool}
    area: str
    why_it_matters: str = ""

class AssessmentAnswer(BaseModel):
    question_id: str
    answer_value: str
    points: int
    trigger_flag: bool = False

class AssessmentCreate(BaseModel):
    modules: List[str]  # Will just be ["clbh"] for the unified quiz
    selected_areas: Optional[List[str]] = None  # If None, defaults to all 6 areas
    internal: bool = False  # True when taken in a browser used for the admin page (team testing)

class AssessmentSubmit(BaseModel):
    assessment_id: str
    answers: List[AssessmentAnswer]
    profile: Optional["BusinessProfile"] = None

class AreaScore(BaseModel):
    area_id: str
    area_name: str
    score: int
    max_score: int = 6
    risk_level: str  # green, yellow, red
    red_flags: List[str] = []  # Question IDs with RED answers

class AssessmentResult(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    modules: List[str]
    selected_areas: List[str] = []  # Which areas were selected for this assessment
    answers: List[Dict[str, Any]] = []
    total_score: int = 0
    max_possible_score: int = 36
    score_percentage: float = 0.0
    risk_level: str = "green"  # green, yellow, red
    area_scores: List[Dict[str, Any]] = []  # Per-area breakdown
    trigger_flags: List[str] = []  # All RED answer question IDs
    red_flag_details: List[Dict[str, Any]] = []  # Detailed RED flag info
    top_risks: List[Dict[str, str]] = []
    action_plan: List[Dict[str, Any]] = []
    confidence_level: int = 50
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    completed: bool = False

class LeadCreate(BaseModel):
    first_name: str
    last_name: str = ""
    email: EmailStr
    modules: List[str] = []
    assessment_id: Optional[str] = None

class Lead(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    first_name: str
    last_name: str = ""
    email: str
    modules: List[str] = []
    assessment_id: Optional[str] = None
    score: Optional[str] = None
    risk_level: Optional[str] = None
    top_risks: List[str] = []
    business_profile: Dict[str, Any] = {}
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# ----- ABOUT YOUR BUSINESS (unscored audit intake) -----
# Asked before the scored questions (single choice) and after them
# (documents on hand + an optional open question). Not part of the score;
# it tells Eric what to prepare for the audit and which tier applies.

PROFILE_QUESTIONS = [
    {
        "id": "industry",
        "text": "What kind of business do you run?",
        "options": [
            {"value": "home_services", "label": "Home services or trades"},
            {"value": "construction", "label": "Construction"},
            {"value": "professional_services", "label": "Professional services"},
            {"value": "retail_restaurant", "label": "Retail or restaurant"},
            {"value": "other", "label": "Other"},
        ],
    },
    {
        "id": "revenue",
        "text": "Roughly what is your annual revenue?",
        "options": [
            {"value": "under_5m", "label": "Under $5M"},
            {"value": "5m_20m", "label": "$5M to $20M"},
            {"value": "over_20m", "label": "Over $20M"},
        ],
    },
    {
        "id": "team",
        "text": "Who works in the business?",
        "options": [
            {"value": "w2_only", "label": "W-2 employees only"},
            {"value": "mixed", "label": "Employees and 1099 contractors or subs"},
            {"value": "mostly_1099", "label": "Mostly 1099 contractors or subs"},
            {"value": "owners_only", "label": "Just the owners"},
        ],
    },
    {
        "id": "ownership",
        "text": "How is the business owned?",
        "options": [
            {"value": "single_owner", "label": "One owner"},
            {"value": "multi_llc", "label": "Two or more owners, LLC"},
            {"value": "multi_corp", "label": "Two or more owners, corporation"},
            {"value": "not_sure", "label": "Not sure"},
        ],
    },
]

PROFILE_DOCUMENTS = [
    {"value": "operating_agreement", "label": "Operating agreement or shareholder agreement"},
    {"value": "customer_contract", "label": "Customer contract or proposal template"},
    {"value": "vendor_agreement", "label": "Subcontractor or vendor agreement"},
    {"value": "handbook", "label": "Employee handbook"},
    {"value": "insurance_policies", "label": "Current insurance policies"},
    {"value": "minutes_records", "label": "Meeting minutes or annual company records"},
    {"value": "leases", "label": "Leases (building or major equipment)"},
]

PROFILE_CONCERN_PROMPT = "Is there one legal thing about your business that keeps you up at night?"

_PROFILE_LABELS = {q["id"]: {o["value"]: o["label"] for o in q["options"]} for q in PROFILE_QUESTIONS}
_DOCUMENT_LABELS = {d["value"]: d["label"] for d in PROFILE_DOCUMENTS}


class BusinessProfile(BaseModel):
    industry: str = ""
    revenue: str = ""
    team: str = ""
    ownership: str = ""
    documents: List[str] = []
    concern: str = Field(default="", max_length=1000)


AssessmentSubmit.model_rebuild()


def clean_profile(profile: Optional["BusinessProfile"]) -> Dict[str, Any]:
    """Keep only known option values so stored data stays clean."""
    if not profile:
        return {}
    out: Dict[str, Any] = {}
    for qid, labels in _PROFILE_LABELS.items():
        value = getattr(profile, qid, "")
        if value in labels:
            out[qid] = value
    out["documents"] = [d for d in profile.documents if d in _DOCUMENT_LABELS]
    out["concern"] = (profile.concern or "").strip()
    return out


def profile_labels(profile: Dict[str, Any]) -> Dict[str, str]:
    """Readable labels for a stored profile (for Kit, email, and export)."""
    if not profile:
        return {}
    labels = {qid: _PROFILE_LABELS[qid].get(profile.get(qid, ""), "") for qid in _PROFILE_LABELS}
    have = [d for d in profile.get("documents", [])]
    labels["documents_on_hand"] = ", ".join(_DOCUMENT_LABELS[d] for d in have if d in _DOCUMENT_LABELS)
    labels["documents_missing"] = ", ".join(lbl for v, lbl in _DOCUMENT_LABELS.items() if v not in have)
    labels["concern"] = profile.get("concern", "")
    return labels


def audit_tier(revenue: str) -> str:
    return {
        "under_5m": "$3,500",
        "5m_20m": "$5,000",
        "over_20m": "$7,500",
    }.get(revenue, "")


def kit_profile_fields(profile: Dict[str, Any]) -> Dict[str, str]:
    """Kit custom fields for the business profile (empty values are skipped)."""
    labels = profile_labels(profile)
    if not labels:
        return {}
    return {
        "industry": labels.get("industry", ""),
        "revenue_range": labels.get("revenue", ""),
        "team_type": labels.get("team", ""),
        "ownership_type": labels.get("ownership", ""),
        "documents_on_hand": labels.get("documents_on_hand", ""),
        "documents_missing": labels.get("documents_missing", ""),
        "biggest_concern": labels.get("concern", "")[:250],
    }


# ----- QUIZ AREAS -----
# 6 areas with 2 questions each = 12 scored questions (shortened Oct 2026).
# The checkup now comes after an audit is booked, so it doubles as audit intake.

AREAS = {
    "contracts": {
        "id": "contracts",
        "name": "Customer Contracts & Project Risks",
        "description": "2 questions on whether your customer agreements protect you",
        "questions": ["c1", "c2"]
    },
    "ownership": {
        "id": "ownership",
        "name": "Ownership & Governance",
        "description": "2 questions on whether your business can survive a partner dispute, exit, or crisis",
        "questions": ["o1", "o2"]
    },
    "subcontractor": {
        "id": "subcontractor",
        "name": "Vendors",
        "description": "2 questions on whether your subcontractor and vendor relationships are a liability",
        "questions": ["v1", "v2"]
    },
    "employment": {
        "id": "employment",
        "name": "Employment & Safety Compliance",
        "description": "2 questions on whether your employment practices hold up",
        "questions": ["e1", "e2"]
    },
    "insurance": {
        "id": "insurance",
        "name": "Insurance and Risk Management",
        "description": "2 questions on whether your insurance will protect you when it matters",
        "questions": ["i1", "i2"]
    },
    "systems": {
        "id": "systems",
        "name": "Systems, Records & Digital Risk",
        "description": "2 questions on whether your records are ready for a buyer, a lender, or a lawsuit",
        "questions": ["r1", "r2"]
    }
}

# ----- QUESTIONS DATA -----
# Scoring: GREEN = 3 points, YELLOW = 2 points, RED = 1 point
# Per area (2 questions, max 6): 5-6 = GREEN, 4 = YELLOW, 2-3 = RED
# Overall (12 questions, max 36): percentage thresholds (81%+ GREEN, 56-80% YELLOW)

def _opts(green: str, yellow: str, red: str) -> List[Dict[str, Any]]:
    return [
        {"value": "green", "label": green, "points": 3, "trigger_flag": False},
        {"value": "yellow", "label": yellow, "points": 2, "trigger_flag": False},
        {"value": "red", "label": red, "points": 1, "trigger_flag": True},
    ]

QUESTIONS = {
    "clbh": [
        # AREA 1: Customer Contracts & Project Risks
        {
            "id": "c1",
            "text": "Is every customer job under a signed contract that spells out the work, the price, and when payment is due?",
            "why_it_matters": "Vague scope leads to scope creep, and unclear payment terms leave you with no leverage when a client pays 60, 90, or 120 days late. Handshake deals and generic online templates rarely hold up when you need to enforce them.",
            "options": _opts(
                "Yes, every job, on a contract an attorney has reviewed.",
                "Mostly, but some jobs run on a verbal or an online template.",
                "No, many jobs start without a signed contract.",
            ),
            "area": "contracts"
        },
        {
            "id": "c2",
            "text": "When a customer changes the plan mid-job, do you get written approval before doing the extra work?",
            "why_it_matters": "Change orders are where businesses quietly lose money. Without a signed approval, you end up doing extra work for free with nothing in writing to support the bill.",
            "options": _opts(
                "Yes, always a written change order first.",
                "Big changes yes, small ones get handled informally.",
                "No, we handle changes as they come and bill later.",
            ),
            "area": "contracts"
        },

        # AREA 2: Ownership & Governance
        {
            "id": "o1",
            "text": "Do you have a signed operating or shareholder agreement that says what happens if an owner leaves, divorces, becomes disabled, or passes away?",
            "why_it_matters": "Without a written agreement, your state's default rules run your business. An owner's death could leave you in business with their heirs, and a divorce could give an ex-spouse a claim to part of the company. A clear buyout plan protects everyone.",
            "options": _opts(
                "Yes, current and it covers every scenario.",
                "We have one, but it is outdated or has gaps.",
                "No, a generic template, or I do not know.",
            ),
            "area": "ownership"
        },
        {
            "id": "o2",
            "text": "Are your company records current: annual filings, meeting minutes, and a record of who owns what?",
            "why_it_matters": "Lapsed filings and missing minutes can weaken the liability protection your entity gives you. They are also one of the first things a buyer or lender asks to see.",
            "options": _opts(
                "Yes, all current and in one place.",
                "Some are current, some have lapsed.",
                "No, or I am not sure what we have.",
            ),
            "area": "ownership"
        },

        # AREA 3: Vendors
        {
            "id": "v1",
            "text": "Does every subcontractor and vendor sign a written agreement before starting, including terms that cover you if their work causes a loss?",
            "why_it_matters": "When a sub or vendor works without a signed agreement, you can end up paying for their mistakes with no way to recover. Indemnification terms put the cost back where it belongs.",
            "options": _opts(
                "Yes, every one, with those terms.",
                "Most sign, but terms vary or some start on a handshake.",
                "No, we often work without signed agreements.",
            ),
            "area": "subcontractor"
        },
        {
            "id": "v2",
            "text": "Would your independent contractor classifications hold up under an IRS or state labor audit?",
            "why_it_matters": "Worker misclassification is heavily enforced by the IRS and state agencies. One audit can bring back taxes, penalties, and unpaid benefits across every worker classified the same way.",
            "options": _opts(
                "Yes, reviewed by a legal or tax professional.",
                "I believe so, but never formally reviewed.",
                "I am not sure they would pass.",
            ),
            "area": "subcontractor"
        },

        # AREA 4: Employment & Safety Compliance
        {
            "id": "e1",
            "text": "Is your employee handbook up to date with today's employment laws?",
            "why_it_matters": "Employment law changes every year. An outdated handbook can work against you, because it shows you had policies but did not keep them current.",
            "options": _opts(
                "Yes, updated within the past year.",
                "We have one, but it is over a year old.",
                "No handbook, or it is badly outdated.",
            ),
            "area": "employment"
        },
        {
            "id": "e2",
            "text": "Are your pay practices compliant, including overtime and exempt versus non-exempt?",
            "why_it_matters": "Wage and hour claims are the most common employment lawsuit in the country. They can cover every employee in the same role and often include double damages and attorney fees.",
            "options": _opts(
                "Yes, formally reviewed.",
                "I believe so, but never formally reviewed.",
                "I am not confident they would survive an audit.",
            ),
            "area": "employment"
        },

        # AREA 5: Insurance and Risk Management
        {
            "id": "i1",
            "text": "Has your insurance been reviewed in the past 12 months, including where the gaps and exclusions are?",
            "why_it_matters": "Most businesses buy insurance once and rarely revisit it. If you have grown, added services, or hired, your policy may not match how you operate today, and the gaps usually show up only when a claim is filed.",
            "options": _opts(
                "Yes, reviewed and gaps addressed.",
                "We have coverage, but no recent review.",
                "Never reviewed, or the business has changed a lot.",
            ),
            "area": "insurance"
        },
        {
            "id": "i2",
            "text": "Does your insurance actually cover the promises your contracts make, like indemnifying a customer?",
            "why_it_matters": "It is common to sign contracts promising protection your policy does not provide. When the insurer denies a claim that falls outside your coverage, the business pays out of pocket.",
            "options": _opts(
                "Yes, my attorney and broker have compared them.",
                "I think so, but no one has checked.",
                "I have never compared them.",
            ),
            "area": "insurance"
        },

        # AREA 6: Systems, Records & Digital Risk
        {
            "id": "r1",
            "text": "If a buyer, lender, or lawsuit asked tomorrow, could you pull together your key records within two weeks?",
            "why_it_matters": "Buyers walk away when records are incomplete, and lenders and courts expect documents on a deadline. Organized records keep you in control of the outcome.",
            "options": _opts(
                "Yes, organized and ready.",
                "Most of it, but it would be a scramble.",
                "No, we are not close.",
            ),
            "area": "systems"
        },
        {
            "id": "r2",
            "text": "Is customer and employee information secured, with access limited to people who need it?",
            "why_it_matters": "Every state has data breach notification laws. When everyone can see everything, one lost laptop or departing employee can turn into notices, investigations, and claims.",
            "options": _opts(
                "Yes, documented and access is limited.",
                "Some measures, but most people can see most things.",
                "No, or I do not know our obligations.",
            ),
            "area": "systems"
        }
    ]
}

# Risk descriptions per question, organized by area.
# Older assessments (q1 to q24) keep their stored details, so only the
# current questions are needed here.
RISK_DESCRIPTIONS = {
    "contracts": {
        "c1": {"title": "Unsigned or Vague Customer Contracts", "description": "Jobs without a clear signed contract leave you exposed to scope disputes and slow payment."},
        "c2": {"title": "No Change Order Process", "description": "Without documented change orders, you risk doing extra work for free with no billing recourse."}
    },
    "ownership": {
        "o1": {"title": "No Owner Exit Plan", "description": "Without a current agreement covering departure, divorce, disability, or death, an owner event can put the business at risk."},
        "o2": {"title": "Company Records Not Current", "description": "Lapsed filings and missing minutes can weaken your liability protection and slow a sale or loan."}
    },
    "subcontractor": {
        "v1": {"title": "Unprotected Vendor Relationships", "description": "Subs and vendors working without signed agreements can leave you paying for their mistakes."},
        "v2": {"title": "Contractor Misclassification Risk", "description": "Misclassifying workers can result in six-figure liability in an IRS or state audit."}
    },
    "employment": {
        "e1": {"title": "Outdated Employee Handbook", "description": "An outdated or missing handbook can work against you in employment claims."},
        "e2": {"title": "Wage & Hour Compliance Risk", "description": "Wage and hour claims are the most common employment lawsuit, often with double damages."}
    },
    "insurance": {
        "i1": {"title": "Unreviewed Insurance Coverage", "description": "Your policy may not match how you operate today, and its gaps are unknown until a claim."},
        "i2": {"title": "Contract-Insurance Mismatch", "description": "You may be promising coverage in your contracts that your insurance does not provide."}
    },
    "systems": {
        "r1": {"title": "Records Not Ready", "description": "Records you cannot produce quickly can stall a sale, a loan, or your defense in a lawsuit."},
        "r2": {"title": "Sensitive Data Not Secured", "description": "Open access to customer and employee data raises the cost of any breach or departure."}
    }
}

AREA_NAMES = {
    "contracts": "Customer Contracts & Project Risks",
    "ownership": "Ownership & Governance",
    "subcontractor": "Vendors",
    "employment": "Employment & Safety Compliance",
    "insurance": "Insurance and Risk Management",
    "systems": "Systems, Records & Digital Risk"
}

QUESTION_AREAS = {q["id"]: q["area"] for module in QUESTIONS.values() for q in module}

# ----- HELPER FUNCTIONS -----

def get_area_for_question(question_id: str) -> str:
    """Get the area for a given question ID (current or legacy q1-q24)."""
    if question_id in QUESTION_AREAS:
        return QUESTION_AREAS[question_id]
    try:
        q_num = int(question_id.replace("q", ""))
    except ValueError:
        return ""
    if q_num <= 4:
        return "contracts"
    elif q_num <= 8:
        return "ownership"
    elif q_num <= 12:
        return "subcontractor"
    elif q_num <= 16:
        return "employment"
    elif q_num <= 20:
        return "insurance"
    else:
        return "systems"

def area_max_score(area_id: str) -> int:
    """Max points for an area: 3 points per question."""
    return len(AREAS.get(area_id, {}).get("questions", [])) * 3

def calculate_area_risk_level(score: int, max_score: int = 6) -> str:
    """Area risk level by percentage, so it works for any question count.
    2 questions (max 6): 5-6 GREEN, 4 YELLOW, 2-3 RED.
    Same cut points as the old 4-question version (10-12, 7-9, 4-6 of 12).
    """
    if max_score <= 0:
        return "green"
    pct = score / max_score * 100
    if pct >= 80:
        return "green"
    elif pct >= 58:
        return "yellow"
    else:
        return "red"

def calculate_overall_risk_level(total_score: int, max_score: int = 36) -> str:
    """Calculate overall risk level using percentage-based thresholds.
    GREEN: 81%+ of max possible
    YELLOW: 56-80%
    RED: below 56%
    """
    if max_score == 0:
        return "green"
    percentage = (total_score / max_score) * 100
    if percentage >= 81:
        return "green"
    elif percentage >= 56:
        return "yellow"
    else:
        return "red"

def calculate_score_and_risks(answers: List[AssessmentAnswer], modules: List[str], selected_areas: Optional[List[str]] = None) -> Dict[str, Any]:
    """Calculate scores by area and overall, flag RED answers.
    If selected_areas is provided, only include those areas in scoring.
    """
    # Default to all areas if none specified
    if not selected_areas:
        selected_areas = list(AREA_NAMES.keys())

    # Initialize area tracking (only for selected areas)
    area_points = {area: 0 for area in selected_areas}
    area_red_flags = {area: [] for area in selected_areas}

    # Process each answer
    trigger_flags = []
    red_flag_details = []
    yellow_flag_details = []
    green_flag_details = []

    for answer in answers:
        area = get_area_for_question(answer.question_id)
        # Only process if this area is in selected_areas
        if area not in selected_areas:
            continue

        area_points[area] += answer.points

        # Get risk info for this question
        risk_info = RISK_DESCRIPTIONS.get(area, {}).get(answer.question_id)

        # Track RED answers (trigger flags)
        if answer.trigger_flag or answer.points == 1:
            trigger_flags.append(answer.question_id)
            area_red_flags[area].append(answer.question_id)

            # Add detailed RED flag info
            if risk_info:
                red_flag_details.append({
                    "question_id": answer.question_id,
                    "area": area,
                    "area_name": AREA_NAMES[area],
                    "title": risk_info["title"],
                    "description": risk_info["description"],
                    "severity": "high"
                })

        # Track YELLOW answers
        elif answer.points == 2:
            if risk_info:
                yellow_flag_details.append({
                    "question_id": answer.question_id,
                    "area": area,
                    "area_name": AREA_NAMES[area],
                    "title": risk_info["title"],
                    "description": risk_info["description"],
                    "severity": "medium"
                })

        # Track GREEN answers
        elif answer.points == 3:
            if risk_info:
                green_flag_details.append({
                    "question_id": answer.question_id,
                    "area": area,
                    "area_name": AREA_NAMES[area],
                    "title": risk_info["title"],
                    "description": "This area is well-protected.",
                    "severity": "low"
                })

    # Calculate area scores (only for selected areas, in order)
    area_scores = []
    for area_id in AREA_NAMES.keys():
        if area_id not in selected_areas:
            continue
        area_name = AREA_NAMES[area_id]
        score = area_points[area_id]
        area_max = area_max_score(area_id)
        risk_level = calculate_area_risk_level(score, area_max)
        area_scores.append({
            "area_id": area_id,
            "area_name": area_name,
            "score": score,
            "max_score": area_max,
            "risk_level": risk_level,
            "red_flags": area_red_flags[area_id]
        })

    # Calculate totals (scaled to selected areas)
    total_score = sum(a.points for a in answers if get_area_for_question(a.question_id) in selected_areas)
    max_score = sum(area_max_score(a) for a in selected_areas)  # 3 points per question
    score_percentage = (total_score / max_score * 100) if max_score > 0 else 0

    # Determine overall risk level using percentage-based thresholds
    risk_level = calculate_overall_risk_level(total_score, max_score)

    # Build top risks from RED flags
    top_risks = []
    for detail in red_flag_details:
        top_risks.append({
            "title": detail["title"],
            "description": detail["description"],
            "severity": "high",
            "area": detail["area"],
            "area_name": detail["area_name"]
        })

    # Add YELLOW answer risks if not too many RED
    if len(top_risks) < 5:
        for answer in answers:
            if answer.points == 2 and len(top_risks) < 7:
                area = get_area_for_question(answer.question_id)
                if answer.question_id in RISK_DESCRIPTIONS.get(area, {}):
                    risk_info = RISK_DESCRIPTIONS[area][answer.question_id]
                    top_risks.append({
                        "title": risk_info["title"],
                        "description": risk_info["description"],
                        "severity": "medium",
                        "area": area,
                        "area_name": AREA_NAMES[area]
                    })

    # Generate action plan
    action_plan = generate_action_plan(top_risks, risk_level, area_scores)

    # Calculate confidence level
    confidence = int(score_percentage) - (len(trigger_flags) * 3)

    return {
        "total_score": total_score,
        "max_possible_score": max_score,
        "score_percentage": round(score_percentage, 1),
        "risk_level": risk_level,
        "area_scores": area_scores,
        "trigger_flags": trigger_flags,
        "red_flag_details": red_flag_details,
        "yellow_flag_details": yellow_flag_details,
        "green_flag_details": green_flag_details,
        "top_risks": top_risks,
        "action_plan": action_plan,
        "confidence_level": min(100, max(10, confidence))
    }

def generate_action_plan(top_risks: List[Dict], risk_level: str, area_scores: List[Dict]) -> List[Dict[str, Any]]:
    """Generate prioritized action plan based on risks"""
    action_plan = []
    priority = 1

    # First priority: RED areas need immediate attention
    red_areas = [a for a in area_scores if a["risk_level"] == "red"]
    for area in red_areas:
        action_plan.append({
            "priority": priority,
            "action": f"Address {area['area_name']} Immediately",
            "description": f"This area scored {area['score']}/{area.get('max_score', 6)}, indicating significant exposure that needs professional review.",
            "urgency": "high"
        })
        priority += 1

    # Second priority: Individual RED flags
    for risk in top_risks[:3]:
        if risk.get("severity") == "high" and priority <= 5:
            action_plan.append({
                "priority": priority,
                "action": f"Fix: {risk['title']}",
                "description": risk['description'],
                "urgency": "high"
            })
            priority += 1

    # Third priority: YELLOW areas
    yellow_areas = [a for a in area_scores if a["risk_level"] == "yellow"]
    for area in yellow_areas[:2]:
        if priority <= 6:
            action_plan.append({
                "priority": priority,
                "action": f"Review {area['area_name']}",
                "description": f"This area scored {area['score']}/{area.get('max_score', 6)}. Address gaps within 30-90 days.",
                "urgency": "medium"
            })
            priority += 1

    # Always recommend consultation for yellow/red
    if risk_level in ["yellow", "red"] or len([a for a in area_scores if a["risk_level"] == "red"]) > 0:
        action_plan.append({
            "priority": priority,
            "action": "Schedule a CLBH Review Call",
            "description": "A 30-minute call to discuss your specific situation and create a protection plan.",
            "urgency": "high" if risk_level == "red" else "medium"
        })

    return action_plan

# ----- API ENDPOINTS -----

@api_router.get("/")
async def root():
    return {"message": "CLBH Quick Checkup API"}

@api_router.get("/test-smtp")
async def test_smtp():
    """Test SMTP connection - for debugging email issues"""
    return test_smtp_connection()

@api_router.get("/questions/{module}")
async def get_questions(module: str, areas: Optional[str] = None):
    """Get questions for a specific module, optionally filtered by areas"""
    if module not in QUESTIONS:
        raise HTTPException(status_code=404, detail=f"Module '{module}' not found")

    questions = QUESTIONS[module]

    # Filter by areas if provided (comma-separated list)
    if areas:
        selected_areas = [a.strip() for a in areas.split(",")]
        questions = [q for q in questions if q.get("area") in selected_areas]

    return {
        "module": module,
        "questions": questions,
        "areas": AREAS,
        "profile": {
            "questions": PROFILE_QUESTIONS,
            "documents": PROFILE_DOCUMENTS,
            "concern_prompt": PROFILE_CONCERN_PROMPT,
        },
    }

@api_router.get("/questions")
async def get_all_questions():
    """Get all questions for all modules"""
    return {"questions": QUESTIONS, "areas": AREAS}

@api_router.post("/assessments")
async def create_assessment(data: AssessmentCreate):
    """Create a new assessment session"""
    db = require_db()
    # Default to all 6 areas if none specified
    selected_areas = data.selected_areas if data.selected_areas else list(AREA_NAMES.keys())
    assessment = AssessmentResult(modules=data.modules, selected_areas=selected_areas)
    doc = assessment.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    doc['internal'] = bool(data.internal)
    doc['version'] = CHECKUP_VERSION
    await db.assessments.insert_one(doc)
    return {"id": assessment.id, "modules": assessment.modules, "selected_areas": assessment.selected_areas}

class ProgressUpdate(BaseModel):
    question_number: int = Field(ge=1, le=24)
    area: str = ""

# Question-by-question progress tracking went live at this time. Checkups started
# earlier have no progress data, so the per-question funnel only counts newer ones.
PROGRESS_TRACKING_START = "2026-09-28T23:00:00+00:00"

# Version 2 = the shortened 12-question checkup with the About your business step.
CHECKUP_VERSION = 2

@api_router.post("/assessments/{assessment_id}/progress")
async def record_progress(assessment_id: str, data: ProgressUpdate):
    """Record the furthest question a visitor has reached (no personal data)."""
    db = require_db()
    area = data.area if data.area in AREA_NAMES else ""
    await db.assessments.update_one(
        {"id": assessment_id, "completed": {"$ne": True}},
        {
            "$max": {"max_question_reached": data.question_number},
            "$set": {"last_activity": datetime.now(timezone.utc).isoformat(), "last_area": area},
        },
    )
    return {"ok": True}

@api_router.post("/assessments/submit")
async def submit_assessment(data: AssessmentSubmit):
    """Submit answers and get results"""
    db = require_db()
    # Find the assessment
    assessment = await db.assessments.find_one({"id": data.assessment_id}, {"_id": 0})
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    # Get selected_areas from assessment (default to all if not set)
    selected_areas = assessment.get("selected_areas") or list(AREA_NAMES.keys())

    # Calculate results with selected areas
    results = calculate_score_and_risks(data.answers, assessment["modules"], selected_areas)

    # Update assessment with results
    update_data = {
        "answers": [a.model_dump() for a in data.answers],
        "total_score": results["total_score"],
        "max_possible_score": results["max_possible_score"],
        "score_percentage": results["score_percentage"],
        "risk_level": results["risk_level"],
        "area_scores": results["area_scores"],
        "trigger_flags": results["trigger_flags"],
        "red_flag_details": results["red_flag_details"],
        "yellow_flag_details": results["yellow_flag_details"],
        "green_flag_details": results["green_flag_details"],
        "top_risks": results["top_risks"],
        "action_plan": results["action_plan"],
        "confidence_level": results["confidence_level"],
        "completed": True
    }
    if data.profile is not None:
        update_data["business_profile"] = clean_profile(data.profile)

    await db.assessments.update_one(
        {"id": data.assessment_id},
        {"$set": update_data}
    )

    return {
        "assessment_id": data.assessment_id,
        "risk_level": results["risk_level"],
        "score_percentage": results["score_percentage"],
        "confidence_level": results["confidence_level"],
        "area_scores": results["area_scores"],
        "red_flag_details": results["red_flag_details"],
        "yellow_flag_details": results["yellow_flag_details"],
        "green_flag_details": results["green_flag_details"],
        "top_risks": results["top_risks"],
        "action_plan": results["action_plan"],
        "trigger_flags": results["trigger_flags"]
    }

@api_router.get("/assessments/{assessment_id}")
async def get_assessment(assessment_id: str):
    """Get assessment results"""
    db = require_db()
    assessment = await db.assessments.find_one({"id": assessment_id}, {"_id": 0})
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return assessment

@api_router.post("/leads")
async def create_lead(data: LeadCreate):
    """Submit lead capture form"""
    logger.info("=" * 50)
    logger.info("LEAD CAPTURE FORM SUBMITTED")
    logger.info("=" * 50)
    logger.info(f"First Name: {data.first_name}")
    logger.info(f"Last Name: {data.last_name}")
    logger.info(f"Email: {data.email}")
    logger.info(f"Assessment ID: {data.assessment_id}")

    db = require_db()
    lead = Lead(**data.model_dump())

    # Variables for Kit API and email
    score_str = ""
    risk_level_str = ""
    top_risks_str = ""
    red_risks = []
    yellow_risks = []
    green_risks = []
    area_scores_data = []

    # If assessment_id provided, get score info
    if data.assessment_id:
        logger.info(f"Looking up assessment: {data.assessment_id}")
        assessment = await db.assessments.find_one({"id": data.assessment_id}, {"_id": 0})
        if assessment:
            logger.info("=" * 50)
            logger.info("ASSESSMENT DATA FOUND")
            logger.info("=" * 50)
            logger.info(f"Assessment ID: {assessment.get('id')}")
            logger.info(f"Completed: {assessment.get('completed')}")
            logger.info(f"Score Percentage: {assessment.get('score_percentage')}")
            logger.info(f"Risk Level: {assessment.get('risk_level')}")
            logger.info(f"Total Score: {assessment.get('total_score')}")
            logger.info(f"Max Possible Score: {assessment.get('max_possible_score')}")
            logger.info(f"Top Risks Raw: {assessment.get('top_risks')}")
            logger.info(f"Red Flag Details: {assessment.get('red_flag_details')}")

            lead.score = f"{assessment.get('score_percentage', 0)}%"
            lead.risk_level = assessment.get('risk_level', 'unknown')
            lead.top_risks = [r.get('title', '') for r in assessment.get('top_risks', [])]

            # Extract risks by severity for email (title + description + area + area_name)
            red_risks = [{'title': r.get('title', ''), 'description': r.get('description', ''), 'area': r.get('area', ''), 'area_name': r.get('area_name', '')} for r in assessment.get('red_flag_details', [])]
            yellow_risks = [{'title': r.get('title', ''), 'description': r.get('description', ''), 'area': r.get('area', ''), 'area_name': r.get('area_name', '')} for r in assessment.get('yellow_flag_details', [])]
            green_risks = [{'title': r.get('title', ''), 'description': r.get('description', ''), 'area': r.get('area', ''), 'area_name': r.get('area_name', '')} for r in assessment.get('green_flag_details', [])]

            # Pillar-level scores so the email matches the results page exactly
            area_scores_data = assessment.get('area_scores', []) or []
            lead.business_profile = assessment.get('business_profile', {}) or {}

            # Prepare data for Kit API
            score_str = lead.score
            risk_level_str = lead.risk_level
            top_risks_str = ", ".join(lead.top_risks)

            logger.info("=" * 50)
            logger.info("DATA PREPARED FOR KIT")
            logger.info("=" * 50)
            logger.info(f"score_str: '{score_str}'")
            logger.info(f"risk_level_str: '{risk_level_str}'")
            logger.info(f"top_risks_str: '{top_risks_str}'")
        else:
            logger.warning(f"Assessment NOT FOUND in database: {data.assessment_id}")
    else:
        logger.warning("NO assessment_id provided in request!")

    doc = lead.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    await db.leads.insert_one(doc)
    logger.info(f"Lead saved to database with ID: {lead.id}")

    # STEP 1: Send results email via SMTP (background thread - non-blocking)
    email_result = {"success": True, "status": "sending"}
    if ERIC_EMAIL and ERIC_EMAIL_PASSWORD:
        import threading
        # Capture variables for closure
        email_to = data.email
        email_first_name = data.first_name
        email_risk = risk_level_str
        email_score = score_str
        email_red_risks = list(red_risks) if red_risks else []
        email_yellow_risks = list(yellow_risks) if yellow_risks else []
        email_green_risks = list(green_risks) if green_risks else []
        email_area_scores = list(area_scores_data) if area_scores_data else []
        intake_profile = dict(lead.business_profile or {})
        intake_last_name = data.last_name

        def send_email_thread():
            logger.info(f"Background: Sending email via {SMTP_SERVER} to {email_to}")
            try:
                result = send_results_email(
                    to_email=email_to,
                    first_name=email_first_name,
                    risk_level=email_risk,
                    score=email_score,
                    red_risks=email_red_risks,
                    yellow_risks=email_yellow_risks,
                    green_risks=email_green_risks,
                    area_scores=email_area_scores
                )
                logger.info(f"Background: Email result: {result}")
            except Exception as e:
                logger.error(f"Background: Email failed: {e}")
            try:
                intake = send_intake_email(
                    first_name=email_first_name,
                    last_name=intake_last_name,
                    email=email_to,
                    risk_level=email_risk,
                    score=email_score,
                    area_scores=email_area_scores,
                    profile=intake_profile,
                )
                logger.info(f"Background: Intake email result: {intake}")
            except Exception as e:
                logger.error(f"Background: Intake email failed: {e}")

        thread = threading.Thread(target=send_email_thread, daemon=True)
        thread.start()
        logger.info(f"Email queued for {data.email}")
    else:
        email_result = {"success": False, "error": "SMTP not configured"}

    # STEP 2: Subscribe to Kit for marketing list
    kit_result = await subscribe_to_kit(
        email=data.email,
        first_name=data.first_name,
        last_name=data.last_name,
        risk_level=risk_level_str,
        score=score_str,
        top_risks=top_risks_str,
        extra_fields=kit_profile_fields(lead.business_profile)
    )

    return {
        "success": True,
        "lead_id": lead.id,
        "email_result": email_result,
        "kit_result": kit_result
    }

async def _internal_assessment_ids(db, ids):
    """Assessment ids marked as internal (team testing)."""
    if not ids:
        return set()
    found = set()
    async for d in db.assessments.find({"id": {"$in": ids}, "internal": True}, {"_id": 0, "id": 1}):
        found.add(d["id"])
    return found

@api_router.get("/admin/leads")
async def get_leads(request: Request):
    """Get all leads for admin dashboard"""
    require_admin(request)
    db = require_db()
    leads = await db.leads.find({}, {"_id": 0}).sort("timestamp", -1).to_list(1000)
    internal_ids = await _internal_assessment_ids(db, [l.get("assessment_id") for l in leads if l.get("assessment_id")])
    for lead in leads:
        lead["is_test"] = bool(lead.get("is_test")) or (lead.get("assessment_id") in internal_ids)
        lead["profile_labels"] = profile_labels(lead.get("business_profile") or {})
    return {"leads": leads}

class TestFlag(BaseModel):
    is_test: bool

@api_router.post("/admin/leads/{lead_id}/test")
async def set_lead_test(lead_id: str, data: TestFlag, request: Request):
    """Mark or unmark a lead as a team test entry (hidden from counts, never deleted)."""
    require_admin(request)
    db = require_db()
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0, "assessment_id": 1})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    await db.leads.update_one({"id": lead_id}, {"$set": {"is_test": data.is_test}})
    if lead.get("assessment_id"):
        await db.assessments.update_one({"id": lead["assessment_id"]}, {"$set": {"internal": data.is_test}})
    return {"ok": True, "is_test": data.is_test}

@api_router.get("/admin/funnel")
async def get_funnel(request: Request, days: int = 30):
    """Checkup funnel: starts, how far people got, completions and emails."""
    require_admin(request)
    db = require_db()
    days = max(1, min(days, 365))
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    docs = await db.assessments.find(
        {"timestamp": {"$gte": since}},
        {"_id": 0, "id": 1, "completed": 1, "max_question_reached": 1, "timestamp": 1, "internal": 1, "version": 1},
    ).to_list(50000)

    ids = [d["id"] for d in docs]
    lead_ids = set()
    test_ids = set()
    if ids:
        async for lead in db.leads.find({"assessment_id": {"$in": ids}}, {"_id": 0, "assessment_id": 1, "is_test": 1}):
            lead_ids.add(lead.get("assessment_id"))
            if lead.get("is_test"):
                test_ids.add(lead.get("assessment_id"))
    # Leave team test checkups out of every count
    excluded = sum(1 for d in docs if d.get("internal") or d["id"] in test_ids)
    docs = [d for d in docs if not d.get("internal") and d["id"] not in test_ids]

    started = len(docs)
    completed = sum(1 for d in docs if d.get("completed"))
    emails = sum(1 for d in docs if d["id"] in lead_ids)

    # Per-question funnel, only for checkups on the current (12-question) version.
    # Older 24-question checkups would skew the per-question counts.
    tracked = [
        d for d in docs
        if (d.get("timestamp") or "") >= PROGRESS_TRACKING_START
        and (d.get("version") or 1) == CHECKUP_VERSION
    ]
    question_list = QUESTIONS.get("clbh", [])
    total_q = len(question_list)
    reached = []
    stopped = []
    for n in range(1, total_q + 1):
        count = 0
        stop = 0
        for d in tracked:
            furthest = total_q if d.get("completed") else int(d.get("max_question_reached") or 1)
            if furthest >= n:
                count += 1
            if not d.get("completed") and furthest == n:
                stop += 1
        q = question_list[n - 1] if n - 1 < len(question_list) else {}
        area_id = q.get("area", "")
        reached.append({
            "question_number": n,
            "area": area_id,
            "area_name": AREA_NAMES.get(area_id, ""),
            "text": q.get("text", ""),
            "reached": count,
            "stopped_here": stop,
        })

    tracked_completed = sum(1 for d in tracked if d.get("completed"))
    return {
        "days": days,
        "excluded_tests": excluded,
        "started": started,
        "completed": completed,
        "emails": emails,
        "tracking_start": PROGRESS_TRACKING_START,
        "tracked_started": len(tracked),
        "tracked_completed": tracked_completed,
        "tracked_emails": sum(1 for d in tracked if d["id"] in lead_ids),
        "questions": reached,
    }

@api_router.get("/admin/leads/export")
async def export_leads(request: Request):
    """Export leads as CSV"""
    require_admin(request)
    db = require_db()
    leads = await db.leads.find({}, {"_id": 0}).sort("timestamp", -1).to_list(1000)

    if not leads:
        return StreamingResponse(
            io.StringIO("No leads found"),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=clbh_leads.csv"}
        )

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=[
        "name", "email", "phone", "business_name", "state",
        "modules", "situation", "score", "risk_level", "top_risks",
        "industry", "revenue", "team", "ownership", "documents_on_hand",
        "documents_missing", "concern", "timestamp"
    ])
    writer.writeheader()

    for lead in leads:
        row = {
            "name": lead.get("name", ""),
            "email": lead.get("email", ""),
            "phone": lead.get("phone", ""),
            "business_name": lead.get("business_name", ""),
            "state": lead.get("state", ""),
            "modules": ", ".join(lead.get("modules", [])),
            "situation": lead.get("situation", ""),
            "score": lead.get("score", ""),
            "risk_level": lead.get("risk_level", ""),
            "top_risks": ", ".join(lead.get("top_risks", [])),
            "timestamp": lead.get("timestamp", "")
        }
        labels = profile_labels(lead.get("business_profile") or {})
        for key in ("industry", "revenue", "team", "ownership", "documents_on_hand", "documents_missing", "concern"):
            row[key] = labels.get(key, "")
        writer.writerow(row)

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=clbh_leads.csv"}
    )

# Include the router in the app
app.include_router(api_router)

@app.on_event("startup")
async def startup_db_client():
    global client, db
    if mongo_url and db_name:
        client = AsyncIOMotorClient(mongo_url)
        db = client[db_name]
        logger.info(f"Connected to MongoDB: {db_name}")
    else:
        logger.warning("MONGO_URL/DB_NAME not set; DB-backed endpoints will return 503.")

@app.on_event("shutdown")
async def shutdown_db_client():
    global client
    if client:
        client.close()
