from __future__ import annotations

from meridian.setup.clients import ClientInstall, inspect_client_installs
from meridian.setup.runtime import (
    CommandResult,
    RuntimeCandidate,
    RuntimeResolution,
    default_runtime_candidates,
    resolve_meridian_runtime,
)
from meridian.setup.doctor import RepairAction, SetupDoctorReport, build_setup_doctor_report, format_setup_doctor
from meridian.setup.repair import RepairResult, apply_mcp_repair, plan_mcp_repair

__all__ = [
    "ClientInstall",
    "CommandResult",
    "RuntimeCandidate",
    "RuntimeResolution",
    "default_runtime_candidates",
    "inspect_client_installs",
    "resolve_meridian_runtime",
    "RepairAction",
    "SetupDoctorReport",
    "build_setup_doctor_report",
    "format_setup_doctor",
    "RepairResult",
    "apply_mcp_repair",
    "plan_mcp_repair",
]
